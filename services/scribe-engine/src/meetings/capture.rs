//! Meeting capture: the mic and the system audio (WASAPI loopback) as two tracks. Slice S3.
//!
//! Each track buffers mono samples at the device rate. The session cuts a chunk of about
//! 25 s at the quietest point, encodes it as 16 kHz FLAC (`audio::encode`) and writes
//! `<track>/seg-NNNNN.flac`, the Python Scribe layout. Loopback sends no packets while
//! nothing plays, so the session pads that track with silence to the wall clock.

use super::loopback;
use crate::audio::{encode, mono_frames};
use crate::engine::EncodedAudio;
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{FromSample, SampleFormat, SizedSample};
use serde_json::{json, Value};
use std::path::Path;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Arc, Mutex};

/// A chunk is cut between these lengths, at the quietest 300 ms window.
pub const CHUNK_MIN_S: f32 = 20.0;
pub const CHUNK_MAX_S: f32 = 25.0;
const QUIET_WINDOW_S: f32 = 0.3;
/// Below this RMS a chunk is silence: it is saved but not sent for transcription.
pub const SILENCE_RMS: f32 = 0.002;
/// Loopback gaps shorter than this are normal packet jitter, not silence.
const PAD_SLACK_S: f32 = 0.5;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TrackKind {
    /// The user's mic. Speaker "me".
    Me,
    /// The system audio: everyone else in the call.
    Them,
}

impl TrackKind {
    pub fn dir(self) -> &'static str {
        match self {
            Self::Me => "me",
            Self::Them => "them",
        }
    }
}

/// What to record. A `None` or empty field means "the system default".
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Sources {
    /// Input device id from `GET /v1/meetings/sources`.
    pub mic: Option<String>,
    /// Output device id whose sound is recorded when no app is chosen.
    pub output: Option<String>,
    /// Apps to record by name ("Discord"). Empty records all computer audio.
    pub apps: Vec<String>,
}

/// An audio device the user can pick.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
pub struct DeviceInfo {
    pub id: String,
    pub name: String,
    pub default: bool,
}

/// Mics and speakers that are connected now. The id is what `Sources` takes back.
pub fn list_devices() -> (Vec<DeviceInfo>, Vec<DeviceInfo>) {
    let host = cpal::default_host();
    let list = |input: bool| -> Vec<DeviceInfo> {
        let default_id = if input {
            host.default_input_device()
        } else {
            host.default_output_device()
        }
        .and_then(|d| d.id().ok());
        let devices: Vec<cpal::Device> = if input {
            host.input_devices()
                .map(|d| d.collect())
                .unwrap_or_default()
        } else {
            host.output_devices()
                .map(|d| d.collect())
                .unwrap_or_default()
        };
        devices
            .into_iter()
            .filter_map(|d| {
                let id = d.id().ok()?;
                let name = d.description().ok()?.name().to_owned();
                Some(DeviceInfo {
                    default: default_id.as_ref() == Some(&id),
                    id: id.to_string(),
                    name,
                })
            })
            .collect()
    };
    (list(true), list(false))
}

/// The body of `GET /v1/meetings/sources`: what the audio panel shows.
pub fn sources_json() -> Value {
    let (mics, outputs) = list_devices();
    json!({
        "mics": mics,
        "outputs": outputs,
        "apps": loopback::audio_apps(),
        "perApp": loopback::per_app_supported(),
    })
}

/// A source whose audio is mixed into the track: its own buffer and how much was drained.
struct MixSource {
    buffer: Arc<Mutex<Vec<f32>>>,
    drained: u64,
}

/// One live track: the samples the stream added since the last cut.
pub struct Track {
    pub kind: TrackKind,
    pub rate: u32,
    buffer: Arc<Mutex<Vec<f32>>>,
    /// Samples already cut into chunks, at the device rate.
    consumed: u64,
    /// Peak since the last read, as `f32` bits.
    level: Arc<AtomicU32>,
    error: Arc<Mutex<Option<String>>>,
    _stream: Option<cpal::Stream>,
    /// Per-app captures. Dropping the track stops their threads.
    _apps: Vec<loopback::AppCapture>,
    /// App captures that are summed into `buffer` on every `pad_to`.
    mix: Vec<MixSource>,
}

/// A cut chunk, ready to write and transcribe.
pub struct Chunk {
    pub kind: TrackKind,
    /// Start time in seconds from the meeting start.
    pub t0: f32,
    pub audio: EncodedAudio,
    pub silent: bool,
}

impl Track {
    /// A track with no device, for tests: push samples by hand.
    pub fn detached(kind: TrackKind, rate: u32) -> Self {
        Self {
            kind,
            rate,
            buffer: Arc::default(),
            consumed: 0,
            level: Arc::default(),
            error: Arc::default(),
            _stream: None,
            _apps: Vec::new(),
            mix: Vec::new(),
        }
    }

    /// Open the chosen mic or the default (`Me`). For `Them`: the chosen apps, else the
    /// chosen speaker or the default one in loopback mode (all computer audio).
    pub fn open(kind: TrackKind, sources: &Sources) -> Result<Self, String> {
        let host = cpal::default_host();
        let (device, supported) = match kind {
            TrackKind::Me => {
                let d = find_device(&host, sources.mic.as_deref(), true)?;
                let c = d
                    .default_input_config()
                    .map_err(|e| format!("Cannot read the microphone setup: {e}"))?;
                (d, c)
            }
            TrackKind::Them if !sources.apps.is_empty() => {
                return Self::open_apps(&sources.apps);
            }
            TrackKind::Them => {
                let d = find_device(&host, sources.output.as_deref(), false)?;
                let c = d
                    .default_output_config()
                    .map_err(|e| format!("Cannot read the speaker setup: {e}"))?;
                (d, c)
            }
        };
        let config = supported.config();
        if config.channels == 0 || config.sample_rate == 0 {
            return Err("The audio device reports an invalid setup.".into());
        }
        let mut track = Self::detached(kind, config.sample_rate);
        let stream = match supported.sample_format() {
            SampleFormat::F32 => track.build::<f32>(&device, config),
            SampleFormat::I16 => track.build::<i16>(&device, config),
            SampleFormat::U16 => track.build::<u16>(&device, config),
            format => return Err(format!("Unsupported sample format: {format}")),
        }
        .map_err(|e| format!("Cannot open {} audio: {e}", kind.dir()))?;
        stream
            .play()
            .map_err(|e| format!("Cannot start {} audio: {e}", kind.dir()))?;
        track._stream = Some(stream);
        Ok(track)
    }

    /// Record only the named apps. Windows needs to support it, and each app must be running.
    /// Nothing is recorded from other apps: if the choice cannot be met, the track fails and
    /// the meeting says so, instead of falling back to all computer audio.
    fn open_apps(apps: &[String]) -> Result<Self, String> {
        if !loopback::per_app_supported() {
            return Err(
                "Choosing apps needs Windows 11. Pick All computer audio instead.".to_owned(),
            );
        }
        let procs = loopback::processes();
        let mut track = Self::detached(TrackKind::Them, loopback::RATE);
        let mut missing = Vec::new();
        for app in apps {
            let pids = loopback::pids_for(&procs, app);
            if pids.is_empty() {
                missing.push(app.as_str());
            }
            for pid in pids {
                let buffer: Arc<Mutex<Vec<f32>>> = Arc::default();
                let sink = loopback::Sink {
                    buffer: buffer.clone(),
                    level: track.level.clone(),
                    error: track.error.clone(),
                };
                track._apps.push(loopback::capture_app(pid, sink)?);
                track.mix.push(MixSource { buffer, drained: 0 });
            }
        }
        if track.mix.is_empty() {
            return Err(match missing.as_slice() {
                [one] => format!("{one} is not running. Open it, or pick another app."),
                many => format!(
                    "{} are not running. Open them, or pick other apps.",
                    many.join(", ")
                ),
            });
        }
        Ok(track)
    }

    fn build<T>(
        &self,
        device: &cpal::Device,
        config: cpal::StreamConfig,
    ) -> Result<cpal::Stream, cpal::Error>
    where
        T: SizedSample,
        f32: FromSample<T>,
    {
        let channels = usize::from(config.channels);
        let (buffer, level, errors) = (self.buffer.clone(), self.level.clone(), self.error.clone());
        device.build_input_stream(
            config,
            move |input: &[T], _| {
                if let Ok(mut buffer) = buffer.lock() {
                    let start = buffer.len();
                    buffer.extend(mono_frames(input, channels));
                    let peak = buffer[start..].iter().fold(0.0f32, |m, v| m.max(v.abs()));
                    level.fetch_max(peak.to_bits(), Ordering::Relaxed);
                }
            },
            move |error| {
                if matches!(
                    error.kind(),
                    cpal::ErrorKind::Xrun | cpal::ErrorKind::DeviceChanged
                ) {
                    return;
                }
                if let Ok(mut slot) = errors.lock() {
                    slot.get_or_insert_with(|| format!("Audio input failed: {error}"));
                }
            },
            None,
        )
    }

    pub fn push(&self, samples: &[f32]) {
        self.buffer.lock().unwrap().extend_from_slice(samples);
    }

    /// The peak level since the last call, 0.0 to 1.0.
    pub fn take_level(&self) -> f32 {
        f32::from_bits(self.level.swap(0, Ordering::Relaxed)).min(1.0)
    }

    pub fn error(&self) -> Option<String> {
        self.error.lock().ok()?.clone()
    }

    /// Pad with silence so the track covers `elapsed_s`. Only loopback needs it. App sources
    /// are padded one by one, then summed into the track, so two apps stay in step.
    pub fn pad_to(&mut self, elapsed_s: f32) {
        self.mix_sources(elapsed_s);
        let mut buffer = self.buffer.lock().unwrap();
        let have = self.consumed + buffer.len() as u64;
        let want = (elapsed_s * self.rate as f32) as u64;
        if want > have + (PAD_SLACK_S * self.rate as f32) as u64 {
            let len = buffer.len() + (want - have) as usize;
            buffer.resize(len, 0.0);
        }
    }

    /// Pad each app source to the clock, then add the part that all of them hold into the
    /// track. A source that is behind holds back the rest until the next tick.
    fn mix_sources(&mut self, elapsed_s: f32) {
        if self.mix.is_empty() {
            return;
        }
        let want = (elapsed_s * self.rate as f32) as u64;
        let slack = (PAD_SLACK_S * self.rate as f32) as u64;
        let mut guards = Vec::with_capacity(self.mix.len());
        for source in &self.mix {
            let mut buffer = source.buffer.lock().unwrap();
            let have = source.drained + buffer.len() as u64;
            if want > have + slack {
                let len = buffer.len() + (want - have) as usize;
                buffer.resize(len, 0.0);
            }
            guards.push(buffer);
        }
        let n = guards.iter().map(|g| g.len()).min().unwrap_or(0);
        if n == 0 {
            return;
        }
        let mut sum = vec![0.0f32; n];
        for guard in &mut guards {
            for (out, sample) in sum.iter_mut().zip(guard.drain(..n)) {
                *out += sample;
            }
        }
        drop(guards);
        for source in &mut self.mix {
            source.drained += n as u64;
        }
        // Two loud apps can add up past full scale: clip instead of letting the encoder wrap.
        for sample in &mut sum {
            *sample = sample.clamp(-1.0, 1.0);
        }
        self.buffer.lock().unwrap().extend_from_slice(&sum);
    }

    /// Cut a chunk when the buffer holds enough audio, or everything when `force` is set.
    pub fn cut(&mut self, force: bool) -> Result<Option<Chunk>, String> {
        let taken: Vec<f32> = {
            let mut buffer = self.buffer.lock().unwrap();
            let at = if force {
                Some(buffer.len()).filter(|n| *n > 0)
            } else {
                cut_point(&buffer, self.rate)
            };
            match at {
                Some(at) => buffer.drain(..at).collect(),
                None => return Ok(None),
            }
        };
        let t0 = self.consumed as f32 / self.rate as f32;
        self.consumed += taken.len() as u64;
        let silent = rms(&taken) < SILENCE_RMS;
        let audio = encode(&taken, self.rate)?;
        Ok(Some(Chunk {
            kind: self.kind,
            t0,
            audio,
            silent,
        }))
    }
}

/// Where to cut: `None` until the buffer is `CHUNK_MAX_S` long, then the middle of the
/// quietest window between `CHUNK_MIN_S` and `CHUNK_MAX_S`.
pub fn cut_point(samples: &[f32], rate: u32) -> Option<usize> {
    let rate = rate as f32;
    let (min, max) = ((CHUNK_MIN_S * rate) as usize, (CHUNK_MAX_S * rate) as usize);
    if samples.len() < max {
        return None;
    }
    let window = ((QUIET_WINDOW_S * rate) as usize).max(1);
    let step = (window / 2).max(1);
    (min..=max - window)
        .step_by(step)
        .map(|start| (start, rms(&samples[start..start + window])))
        .min_by(|a, b| a.1.total_cmp(&b.1))
        .map(|(start, _)| start + window / 2)
}

/// The device with this id, or the system default when no id is given.
fn find_device(host: &cpal::Host, id: Option<&str>, input: bool) -> Result<cpal::Device, String> {
    let Some(id) = id.filter(|s| !s.trim().is_empty()) else {
        return if input {
            host.default_input_device()
                .ok_or_else(|| "No microphone found.".to_owned())
        } else {
            host.default_output_device()
                .ok_or_else(|| "No speaker or headset found for call audio.".to_owned())
        };
    };
    let gone = if input {
        "The chosen microphone is not connected. Pick another one in Audio."
    } else {
        "The chosen speaker is not connected. Pick another one in Audio."
    };
    let parsed: cpal::DeviceId = id.parse().map_err(|_| gone.to_owned())?;
    host.device_by_id(&parsed).ok_or_else(|| gone.to_owned())
}

pub fn rms(samples: &[f32]) -> f32 {
    if samples.is_empty() {
        return 0.0;
    }
    (samples.iter().map(|s| s * s).sum::<f32>() / samples.len() as f32).sqrt()
}

/// Write `<dir>/<track>/seg-NNNNN.flac`. `index` starts at 1, as in Python.
pub fn write_chunk(
    meeting: &Path,
    kind: TrackKind,
    index: u32,
    audio: &EncodedAudio,
) -> Result<(), String> {
    let dir = meeting.join(kind.dir());
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    std::fs::write(dir.join(format!("seg-{index:05}.flac")), &audio.bytes)
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    const RATE: u32 = 16_000;

    fn tone(seconds: f32, amp: f32) -> Vec<f32> {
        (0..(seconds * RATE as f32) as usize)
            .map(|i| amp * (i as f32 * 0.07).sin())
            .collect()
    }

    #[test]
    fn no_cut_before_the_max_length() {
        assert_eq!(cut_point(&tone(24.0, 0.3), RATE), None);
    }

    #[test]
    fn cut_lands_in_the_quiet_gap() {
        let mut audio = tone(22.0, 0.3);
        audio.extend(vec![0.0; (0.5 * RATE as f32) as usize]);
        audio.extend(tone(5.0, 0.3));
        let at = cut_point(&audio, RATE).unwrap() as f32 / RATE as f32;
        assert!((22.0..22.5).contains(&at), "cut at {at}");
    }

    #[test]
    fn chunks_carry_time_and_silence_flag() {
        let mut track = Track::detached(TrackKind::Them, RATE);
        track.push(&tone(26.0, 0.3));
        let first = track.cut(false).unwrap().unwrap();
        assert_eq!(first.t0, 0.0);
        assert!(!first.silent);
        assert!(first.audio.bytes.starts_with(b"fLaC"));
        track.push(&vec![0.0; RATE as usize]);
        let rest = track.cut(true).unwrap().unwrap();
        assert!(rest.t0 >= CHUNK_MIN_S && rest.t0 <= CHUNK_MAX_S);
        assert!(track.cut(true).unwrap().is_none());
        let quiet = {
            let mut t = Track::detached(TrackKind::Me, RATE);
            t.push(&vec![0.0005; RATE as usize]);
            t.cut(true).unwrap().unwrap()
        };
        assert!(quiet.silent);
    }

    #[test]
    fn loopback_gaps_are_padded_to_the_clock() {
        let mut track = Track::detached(TrackKind::Them, RATE);
        track.push(&tone(1.0, 0.3));
        track.pad_to(1.2);
        assert_eq!(
            track.buffer.lock().unwrap().len(),
            RATE as usize,
            "jitter is not padded"
        );
        track.pad_to(10.0);
        let chunk = track.cut(true).unwrap().unwrap();
        assert_eq!(chunk.audio.duration_ms, 10_000);
    }

    fn app_source(track: &mut Track, samples: Vec<f32>) -> Arc<Mutex<Vec<f32>>> {
        let buffer = Arc::new(Mutex::new(samples));
        track.mix.push(MixSource {
            buffer: buffer.clone(),
            drained: 0,
        });
        buffer
    }

    #[test]
    fn two_app_sources_are_summed_in_step() {
        let mut track = Track::detached(TrackKind::Them, RATE);
        let a = app_source(&mut track, vec![0.25; RATE as usize]);
        // 0.25 s of audio: 0.75 s short of the clock, so it is padded with silence.
        let b = app_source(&mut track, vec![0.5; RATE as usize / 4]);
        track.pad_to(1.0);
        let mixed = track.buffer.lock().unwrap().clone();
        assert_eq!(mixed.len(), RATE as usize);
        assert!(mixed[..4_000].iter().all(|s| (*s - 0.75).abs() < 1e-6));
        assert!(mixed[4_000..].iter().all(|s| (*s - 0.25).abs() < 1e-6));
        assert!(a.lock().unwrap().is_empty() && b.lock().unwrap().is_empty());
        track.pad_to(1.0);
        assert_eq!(
            track.buffer.lock().unwrap().len(),
            RATE as usize,
            "no double count"
        );
    }

    #[test]
    fn a_source_behind_the_clock_by_jitter_is_not_padded() {
        let mut track = Track::detached(TrackKind::Them, RATE);
        app_source(&mut track, vec![0.1; RATE as usize]);
        let slow = app_source(&mut track, vec![0.1; RATE as usize - 4_000]);
        track.pad_to(1.0);
        assert_eq!(
            slow.lock().unwrap().len(),
            0,
            "drained to the shorter source"
        );
        assert_eq!(track.buffer.lock().unwrap().len(), RATE as usize - 4_000);
    }

    #[test]
    fn loud_apps_are_clipped_not_wrapped() {
        let mut track = Track::detached(TrackKind::Them, RATE);
        app_source(&mut track, vec![0.8; 100]);
        app_source(&mut track, vec![0.8; 100]);
        track.pad_to(0.0);
        let mixed = track.buffer.lock().unwrap().clone();
        assert_eq!(mixed.len(), 100);
        assert!(mixed.iter().all(|s| *s == 1.0));
    }

    #[test]
    fn sources_json_has_the_panel_shape() {
        let json = sources_json();
        for key in ["mics", "outputs", "apps"] {
            assert!(json[key].is_array(), "{key}");
        }
        assert!(json["perApp"].is_boolean());
    }

    #[test]
    fn a_chosen_mic_that_is_gone_says_so() {
        for id in ["bogus", "wasapi:{0.0.1.00000000}.{not-a-device}"] {
            let sources = Sources {
                mic: Some(id.into()),
                ..Sources::default()
            };
            let error = Track::open(TrackKind::Me, &sources)
                .err()
                .expect("must fail");
            assert!(
                error.starts_with("The chosen microphone is not connected"),
                "{error}"
            );
        }
    }

    #[test]
    fn a_chosen_app_that_is_not_running_fails_instead_of_recording_everything() {
        let sources = Sources {
            apps: vec!["NoSuchApp".into()],
            ..Sources::default()
        };
        let error = Track::open(TrackKind::Them, &sources)
            .err()
            .expect("must fail");
        assert!(
            error.contains("NoSuchApp is not running") || error.contains("Windows 11"),
            "{error}"
        );
    }

    #[test]
    fn writes_python_layout() {
        let dir = crate::meetings::store::tests::temp_root("chunk");
        let mut track = Track::detached(TrackKind::Me, RATE);
        track.push(&tone(1.0, 0.3));
        let chunk = track.cut(true).unwrap().unwrap();
        write_chunk(&dir, TrackKind::Me, 1, &chunk.audio).unwrap();
        assert!(dir.join("me").join("seg-00001.flac").is_file());
    }
}

/// Opens the real mic and loopback for 2 s: `cargo test real_devices -- --ignored --nocapture`.
#[cfg(test)]
mod real {
    use super::*;

    #[test]
    #[ignore]
    fn real_devices() {
        let me = Track::open(TrackKind::Me, &Sources::default()).unwrap();
        let mut them = Track::open(TrackKind::Them, &Sources::default()).unwrap();
        std::thread::sleep(std::time::Duration::from_secs(2));
        them.pad_to(2.0);
        for t in [&me, &them] {
            let n = t.buffer.lock().unwrap().len();
            println!(
                "{:?}: rate {} samples {} level {:.3}",
                t.kind,
                t.rate,
                n,
                t.take_level()
            );
            assert!(n as f32 >= 1.5 * t.rate as f32);
        }
    }
}
