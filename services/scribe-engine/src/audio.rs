//! Microphone capture and encoding. Slice S3.

use crate::config::AudioConfig;
use crate::engine::{EncodedAudio, Recorder};
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{FromSample, Sample, SampleFormat, SizedSample};
use flacenc::component::BitRepr;
use flacenc::error::Verify;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Instant;

const OUTPUT_RATE: u32 = 16_000;

#[derive(Default)]
struct Capture {
    samples: Vec<f32>,
    first_buffer_at: Option<Instant>,
    error: Option<String>,
}

/// v1.2 `GET /v1/devices` item. cpal has no stable device id, so the id is the name.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
pub struct InputDevice {
    pub id: String,
    pub name: String,
    pub default: bool,
}

impl InputDevice {
    pub fn new(name: &str, default: bool) -> Self {
        Self {
            id: name.into(),
            name: name.into(),
            default,
        }
    }
}

/// The input devices of the default host, with the system default marked.
pub fn input_devices() -> Result<Vec<InputDevice>, String> {
    let host = cpal::default_host();
    let name = |device: &cpal::Device| device.description().ok().map(|d| d.name().to_owned());
    let default = host.default_input_device().as_ref().and_then(name);
    let devices = host
        .input_devices()
        .map_err(|e| format!("Cannot list input devices: {e}"))?;
    Ok(devices
        .filter_map(|device| name(&device))
        .map(|n| InputDevice::new(&n, default.as_deref() == Some(n.as_str())))
        .collect())
}

pub struct CpalRecorder {
    host: cpal::Host,
    cfg: AudioConfig,
    stream: Option<cpal::Stream>,
    capture: Option<Arc<Mutex<Capture>>>,
    sample_rate: u32,
    first: Option<Instant>,
    /// Peak level since the HUD last read it, as `f32` bits.
    level: Arc<AtomicU32>,
    #[cfg(test)]
    timings: Option<StartTimings>,
}

#[cfg(test)]
struct StartTimings {
    start: Instant,
    lookup: std::time::Duration,
    config: std::time::Duration,
    build: std::time::Duration,
    play_at: Instant,
    play: std::time::Duration,
}

impl CpalRecorder {
    pub fn new(cfg: &AudioConfig) -> Self {
        Self {
            host: cpal::default_host(),
            cfg: cfg.clone(),
            stream: None,
            capture: None,
            sample_rate: 0,
            first: None,
            level: Arc::default(),
            #[cfg(test)]
            timings: None,
        }
    }

    /// v1.2: the device and length cap for the next recording.
    fn set_config(&mut self, cfg: &AudioConfig) {
        self.cfg = cfg.clone();
    }

    /// The live mic level for the HUD.
    pub fn level(&self) -> Arc<AtomicU32> {
        self.level.clone()
    }

    fn input_device(&self) -> Result<cpal::Device, String> {
        if let Some(name) = &self.cfg.device {
            self.host
                .input_devices()
                .map_err(|e| format!("Cannot list input devices: {e}"))?
                .find(|device| device.description().is_ok_and(|d| d.name() == name))
                .ok_or_else(|| format!("No input device named {name}"))
        } else {
            self.host
                .default_input_device()
                .ok_or_else(|| "No input device".into())
        }
    }
}

impl Recorder for CpalRecorder {
    fn configure(&mut self, cfg: &AudioConfig) {
        self.set_config(cfg);
    }

    fn start(&mut self) -> Result<(), String> {
        if self.stream.is_some() {
            return Err("Microphone is already recording".into());
        }
        self.first = None;
        #[cfg(test)]
        let start = Instant::now();
        let device = self.input_device()?;
        #[cfg(test)]
        let lookup_done = Instant::now();
        let supported = device
            .default_input_config()
            .map_err(|e| format!("Cannot read input configuration: {e}"))?;
        let config = supported.config();
        if config.channels == 0 || config.sample_rate == 0 {
            return Err("Invalid input configuration".into());
        }
        self.sample_rate = config.sample_rate;
        let limit = (self.sample_rate as usize)
            .checked_mul(self.cfg.max_record_seconds as usize)
            .ok_or("Recording limit is too large")?;
        let mut samples = Vec::new();
        samples
            .try_reserve_exact(limit.min(self.sample_rate as usize * 10))
            .map_err(|e| format!("Cannot allocate recording buffer: {e}"))?;
        let capture = Arc::new(Mutex::new(Capture {
            samples,
            ..Capture::default()
        }));
        #[cfg(test)]
        let build_at = Instant::now();
        let stream = match supported.sample_format() {
            SampleFormat::F32 => build_stream::<f32>(&device, config, &capture, limit, &self.level),
            SampleFormat::I16 => build_stream::<i16>(&device, config, &capture, limit, &self.level),
            SampleFormat::U16 => build_stream::<u16>(&device, config, &capture, limit, &self.level),
            format => return Err(format!("Unsupported input sample format: {format}")),
        }
        .map_err(|e| format!("Cannot open microphone: {e}"))?;
        #[cfg(test)]
        let play_at = Instant::now();
        stream
            .play()
            .map_err(|e| format!("Cannot start microphone: {e}"))?;
        #[cfg(test)]
        {
            self.timings = Some(StartTimings {
                start,
                lookup: lookup_done - start,
                config: build_at - lookup_done,
                build: play_at - build_at,
                play_at,
                play: play_at.elapsed(),
            });
        }
        self.capture = Some(capture);
        self.stream = Some(stream);
        Ok(())
    }

    fn stop(&mut self) -> Result<EncodedAudio, String> {
        // Close the device before taking the lock or encoding the recording.
        drop(self.stream.take());
        let capture = self.capture.take().ok_or("Microphone is not recording")?;
        let mut capture = capture.lock().map_err(|_| "Recording buffer lock failed")?;
        self.first = capture.first_buffer_at;
        if let Some(error) = capture.error.take() {
            return Err(error);
        }
        let samples = std::mem::take(&mut capture.samples);
        drop(capture);
        encode(&samples, self.sample_rate)
    }

    fn cancel(&mut self) {
        drop(self.stream.take());
        self.capture = None;
        self.first = None;
    }

    fn first_buffer_at(&self) -> Option<Instant> {
        self.capture
            .as_ref()
            .and_then(|capture| capture.lock().ok()?.first_buffer_at)
            .or(self.first)
    }
}

/// A recorder with no device, for the CI latency bench: capture "starts" at once and
/// returns no audio, so the engine drops it without a speech-to-text call.
#[derive(Default)]
pub struct NullRecorder {
    first: Option<Instant>,
}

impl Recorder for NullRecorder {
    fn start(&mut self) -> Result<(), String> {
        self.first = Some(Instant::now());
        Ok(())
    }

    fn stop(&mut self) -> Result<EncodedAudio, String> {
        Ok(EncodedAudio {
            bytes: Vec::new(),
            mime: "audio/flac",
            file_name: "audio.flac",
            duration_ms: 0,
            pcm: Vec::new(),
        })
    }

    fn cancel(&mut self) {}

    fn first_buffer_at(&self) -> Option<Instant> {
        self.first
    }
}

fn build_stream<T>(
    device: &cpal::Device,
    config: cpal::StreamConfig,
    capture: &Arc<Mutex<Capture>>,
    limit: usize,
    level: &Arc<AtomicU32>,
) -> Result<cpal::Stream, cpal::Error>
where
    T: SizedSample,
    f32: FromSample<T>,
{
    let channels = usize::from(config.channels);
    let data = Arc::clone(capture);
    let errors = Arc::clone(capture);
    let level = Arc::clone(level);
    device.build_input_stream(
        config,
        move |input: &[T], _| {
            let arrived = Instant::now();
            if let Ok(mut capture) = data.lock() {
                if input.len() >= channels {
                    capture.first_buffer_at.get_or_insert(arrived);
                    let remaining = limit.saturating_sub(capture.samples.len());
                    let start = capture.samples.len();
                    capture
                        .samples
                        .extend(mono_frames(input, channels).take(remaining));
                    let peak = capture.samples[start..]
                        .iter()
                        .fold(0.0f32, |m, v| m.max(v.abs()));
                    // Non-negative f32 bits order like the numbers, so fetch_max keeps the peak.
                    level.fetch_max(peak.to_bits(), Ordering::Relaxed);
                }
            }
        },
        move |error| {
            // A glitch or a default-device reroute keeps the stream alive: keep the recording.
            if matches!(
                error.kind(),
                cpal::ErrorKind::Xrun | cpal::ErrorKind::DeviceChanged
            ) {
                return;
            }
            if let Ok(mut capture) = errors.lock() {
                capture
                    .error
                    .get_or_insert_with(|| format!("Microphone input failed: {error}"));
            }
        },
        None,
    )
}

pub(crate) fn mono_frames<T: Sample>(input: &[T], channels: usize) -> impl Iterator<Item = f32> + '_
where
    f32: FromSample<T>,
{
    input
        .chunks_exact(channels)
        .map(move |frame| frame.iter().map(|&s| f32::from_sample(s)).sum::<f32>() / channels as f32)
}

fn resample(input: &[f32], rate: u32) -> Vec<f32> {
    if rate == 0 || input.is_empty() {
        return Vec::new();
    }
    if rate == OUTPUT_RATE {
        return input.to_vec();
    }
    if matches!(rate, 48_000 | 32_000) {
        let factor = (rate / OUTPUT_RATE) as usize;
        return input
            .chunks(factor)
            .map(|chunk| chunk.iter().sum::<f32>() / chunk.len() as f32)
            .collect();
    }
    // A moving average reduces high frequencies before interpolation and decimation.
    let width = rate.div_ceil(OUTPUT_RATE) as usize;
    let mut sum = 0.0;
    let filtered: Vec<f32> = input
        .iter()
        .enumerate()
        .map(|(i, &sample)| {
            sum += sample;
            if i >= width {
                sum -= input[i - width];
            }
            sum / width.min(i + 1) as f32
        })
        .collect();
    let count = (input.len() as u64 * u64::from(OUTPUT_RATE)).div_ceil(u64::from(rate));
    (0..count)
        .map(|i| {
            let position = i as f64 * f64::from(rate) / f64::from(OUTPUT_RATE);
            let left = position as usize;
            let right = (left + 1).min(filtered.len() - 1);
            filtered[left] + (filtered[right] - filtered[left]) * position.fract() as f32
        })
        .collect()
}

fn to_i16(sample: f32) -> i16 {
    (sample.clamp(-1.0, 1.0) * 32768.0).round() as i16
}

pub(crate) fn encode(input: &[f32], rate: u32) -> Result<EncodedAudio, String> {
    if rate == 0 {
        return Err("Invalid input sample rate".into());
    }
    let duration_ms = input.len() as u64 * 1000 / u64::from(rate);
    let pcm = resample(input, rate);
    let samples: Vec<i32> = pcm.iter().map(|&s| i32::from(to_i16(s))).collect();
    let config = flacenc::config::Encoder::default()
        .into_verified()
        .map_err(|_| "Invalid FLAC encoder configuration")?;
    let source = flacenc::source::MemSource::from_samples(&samples, 1, 16, OUTPUT_RATE as usize);
    let stream = flacenc::encode_with_fixed_block_size(&config, source, config.block_size)
        .map_err(|e| format!("Cannot encode recording: {e}"))?;
    let mut sink = flacenc::bitsink::ByteSink::new();
    stream
        .write(&mut sink)
        .map_err(|e| format!("Cannot write recording: {e}"))?;
    Ok(EncodedAudio {
        bytes: sink.into_inner(),
        mime: "audio/flac",
        file_name: "audio.flac",
        duration_ms,
        pcm,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sine(rate: u32) -> Vec<f32> {
        (0..rate)
            .map(|i| (std::f32::consts::TAU * 440.0 * i as f32 / rate as f32).sin() * 0.5)
            .collect()
    }

    #[test]
    fn resampling_preserves_length_and_frequency() {
        for rate in [48_000, 32_000, 44_100] {
            let output = resample(&sine(rate), rate);
            assert!(output.len().abs_diff(16_000) <= 1);
            let crossings = output
                .windows(2)
                .filter(|w| w[0] <= 0.0 && w[1] > 0.0)
                .count();
            assert!(crossings.abs_diff(440) <= 1, "{rate}: {crossings}");
        }
    }

    #[test]
    fn stereo_mixdown_averages_channels() {
        let mono: Vec<f32> = mono_frames(&[0.5f32, -0.5, 1.0, 0.0], 2).collect();
        assert_eq!(mono, vec![0.0, 0.5]);
        let from_i16: Vec<f32> = mono_frames(&[i16::MAX, i16::MAX], 2).collect();
        assert!((from_i16[0] - 1.0).abs() < 1e-3);
    }

    #[test]
    fn i16_conversion_clips() {
        assert_eq!(to_i16(2.0), i16::MAX);
        assert_eq!(to_i16(-2.0), i16::MIN);
        assert_eq!(to_i16(0.0), 0);
    }

    #[test]
    fn flac_header_is_16k_mono_and_duration_is_right() {
        let audio = encode(&sine(48_000), 48_000).unwrap();
        assert_eq!(
            (audio.mime, audio.file_name, audio.duration_ms),
            ("audio/flac", "audio.flac", 1000)
        );
        let b = &audio.bytes;
        assert_eq!(&b[..4], b"fLaC");
        // STREAMINFO starts at byte 8: sample rate is 20 bits at offset 18, then 3 bits channels - 1.
        let rate = (u32::from(b[18]) << 12) | (u32::from(b[19]) << 4) | (u32::from(b[20]) >> 4);
        let channels = ((b[20] >> 1) & 0x7) + 1;
        assert_eq!((rate, channels), (16_000, 1));
        assert!(
            b.len() < 32_000,
            "FLAC should beat raw 16-bit PCM: {}",
            b.len()
        );
    }

    #[test]
    fn empty_and_zero_rate_inputs_do_not_panic() {
        assert_eq!(encode(&[], 48_000).unwrap().duration_ms, 0);
        assert!(encode(&[0.0], 0).is_err());
    }

    /// Run by hand: `cargo test real_mic -- --ignored --nocapture`.
    #[test]
    #[ignore = "Uses the real default microphone"]
    fn real_mic_timings() {
        let mut rec = CpalRecorder::new(&AudioConfig::default());
        for round in ["cold", "warm"] {
            rec.start().unwrap();
            std::thread::sleep(std::time::Duration::from_millis(1000));
            let t = rec.timings.take().unwrap();
            let first = rec.first_buffer_at().expect("first buffer");
            let enc_at = Instant::now();
            let audio = rec.stop().unwrap();
            println!(
                "{round}: lookup {:?} config {:?} build {:?} play {:?} play->first {:?} start->first {:?} | encode {:?}, {} bytes for {} ms",
                t.lookup,
                t.config,
                t.build,
                t.play,
                first - t.play_at,
                first - t.start,
                enc_at.elapsed(),
                audio.bytes.len(),
                audio.duration_ms
            );
        }
    }
}
