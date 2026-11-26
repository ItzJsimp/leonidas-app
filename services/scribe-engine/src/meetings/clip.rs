//! A short WAV clip of one saved meeting track, for the play button on a transcript line.
//! Only the FLAC chunks that overlap the range are decoded, so a click on a 2 hour meeting
//! costs the same as on a 2 minute one. The chunks join into one gapless timeline (a pause is
//! not in the audio), so a transcript time is a position in the audio.

use super::capture::TrackKind;
use super::store::Store;
use super::{fail, Reply};
use serde_json::{json, Value};
use std::path::PathBuf;

/// The longest clip. A longer range is cut short, not refused.
pub const MAX_CLIP_S: f64 = 60.0;

/// `POST /v1/meetings/{id}/clip` with `{ "from": s, "to": s, "track": "me" | "them" }`.
/// Answers `{ "wav": <base64>, "rate": Hz, "from": s, "to": s }`.
pub fn handle(store: &Store, id: &str, body: &Value) -> Reply {
    if store.locate(id).is_none() {
        return fail(404, "not_found", "No meeting with this id.");
    }
    let kind = match body["track"].as_str() {
        Some("me") => TrackKind::Me,
        Some("them") => TrackKind::Them,
        _ => return fail(400, "bad_request", "Choose the track: me or them."),
    };
    let (Some(from), Some(to)) = (body["from"].as_f64(), body["to"].as_f64()) else {
        return fail(400, "bad_request", "Give the start and end in seconds.");
    };
    match wav(&store.audio_dirs(id), kind, from, to) {
        Ok(clip) => (
            200,
            json!({ "wav": base64(&clip.bytes), "rate": clip.rate, "from": clip.from, "to": clip.to }),
        ),
        Err(message) => fail(404, "no_audio", &message),
    }
}

pub struct Clip {
    pub bytes: Vec<u8>,
    pub rate: u32,
    pub from: f64,
    pub to: f64,
}

/// 16 bit mono WAV of `from..to` seconds. The range is cut to the audio that exists.
pub fn wav(dirs: &[PathBuf], kind: TrackKind, from: f64, to: f64) -> Result<Clip, String> {
    let none = || "This meeting has no saved audio for that part.".to_owned();
    let dir = dirs
        .iter()
        .find(|d| d.ends_with(kind.dir()))
        .ok_or_else(none)?;
    let from = from.max(0.0);
    let to = to.min(from + MAX_CLIP_S);
    if to.is_nan() || from.is_nan() || to <= from {
        return Err(none());
    }
    let mut files: Vec<PathBuf> = std::fs::read_dir(dir)
        .map_err(|e| e.to_string())?
        .flatten()
        .map(|e| e.path())
        .filter(|p| p.extension().is_some_and(|e| e == "flac"))
        .collect();
    files.sort();
    let (mut start, mut rate) = (0.0f64, 16_000u32);
    let (mut pcm, mut first): (Vec<i16>, Option<f64>) = (Vec::new(), None);
    for file in files {
        if start >= to {
            break;
        }
        let mut reader =
            claxon::FlacReader::open(&file).map_err(|e| format!("{}: {e}", file.display()))?;
        let info = reader.streaminfo();
        rate = info.sample_rate;
        // Skip a chunk that ends before the range without decoding it.
        if let Some(n) = info.samples {
            let end = start + n as f64 / f64::from(rate);
            if end <= from {
                start = end;
                continue;
            }
        }
        let (channels, scale) = (
            info.channels as usize,
            (1i64 << (info.bits_per_sample - 1)) as f32,
        );
        let samples: Vec<f32> = reader
            .samples()
            .map(|s| s.map(|v| v as f32 / scale))
            .collect::<Result<_, _>>()
            .map_err(|e| format!("{}: {e}", file.display()))?;
        let mono: Vec<f32> = samples
            .chunks(channels)
            .map(|f| f.iter().sum::<f32>() / channels as f32)
            .collect();
        let len = mono.len() as f64 / f64::from(rate);
        let a = (((from - start) * f64::from(rate)).max(0.0) as usize).min(mono.len());
        let b = (((to - start) * f64::from(rate)).max(0.0) as usize).min(mono.len());
        if b > a {
            first.get_or_insert(start + a as f64 / f64::from(rate));
            pcm.extend(
                mono[a..b]
                    .iter()
                    .map(|s| (s.clamp(-1.0, 1.0) * 32767.0).round() as i16),
            );
        }
        start += len;
    }
    let first = first.ok_or_else(none)?;
    Ok(Clip {
        bytes: wav_bytes(&pcm, rate),
        rate,
        from: first,
        to: first + pcm.len() as f64 / f64::from(rate),
    })
}

fn wav_bytes(pcm: &[i16], rate: u32) -> Vec<u8> {
    let data = (pcm.len() * 2) as u32;
    let mut out = Vec::with_capacity(44 + pcm.len() * 2);
    out.extend(b"RIFF");
    out.extend((36 + data).to_le_bytes());
    out.extend(b"WAVEfmt ");
    out.extend(16u32.to_le_bytes());
    out.extend(1u16.to_le_bytes()); // PCM
    out.extend(1u16.to_le_bytes()); // mono
    out.extend(rate.to_le_bytes());
    out.extend((rate * 2).to_le_bytes());
    out.extend(2u16.to_le_bytes());
    out.extend(16u16.to_le_bytes());
    out.extend(b"data");
    out.extend(data.to_le_bytes());
    out.extend(pcm.iter().flat_map(|s| s.to_le_bytes()));
    out
}

/// The route answers JSON, so the WAV travels as base64. A 60 s clip is about 2.6 MB.
fn base64(bytes: &[u8]) -> String {
    const A: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(bytes.len().div_ceil(3) * 4);
    for c in bytes.chunks(3) {
        let n = (u32::from(c[0]) << 16)
            | (u32::from(*c.get(1).unwrap_or(&0)) << 8)
            | u32::from(*c.get(2).unwrap_or(&0));
        for i in 0..4 {
            if i <= c.len() {
                out.push(A[(n >> (18 - 6 * i) & 63) as usize] as char);
            } else {
                out.push('=');
            }
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::meetings::capture::{write_chunk, Track};
    use crate::meetings::store::tests::temp_root;

    /// Two 15 s chunks on the "me" track: 0 to 15 s and 15 to 30 s.
    fn two_chunks(name: &str) -> Vec<PathBuf> {
        let root = temp_root(name);
        for i in 1..=2 {
            let mut t = Track::detached(TrackKind::Me, 16_000);
            t.push(
                &(0..240_000)
                    .map(|j| 0.3 * (j as f32 * 0.05).sin())
                    .collect::<Vec<f32>>(),
            );
            let chunk = t.cut(true).unwrap().unwrap();
            write_chunk(&root, TrackKind::Me, i, &chunk.audio).unwrap();
        }
        vec![root.join("me")]
    }

    #[test]
    fn a_clip_across_a_chunk_boundary_joins_both_chunks() {
        let dirs = two_chunks("clip-boundary");
        let clip = wav(&dirs, TrackKind::Me, 10.0, 20.0).unwrap();
        assert_eq!(clip.rate, 16_000);
        assert_eq!(clip.bytes.len(), 44 + 160_000 * 2, "10 s of 16 bit mono");
        assert_eq!(&clip.bytes[..4], b"RIFF");
        assert!((clip.from - 10.0).abs() < 0.01 && (clip.to - 20.0).abs() < 0.01);
    }

    #[test]
    fn a_long_range_is_cut_to_the_audio_and_the_cap() {
        let dirs = two_chunks("clip-cap");
        let clip = wav(&dirs, TrackKind::Me, 0.0, 500.0).unwrap();
        assert!((clip.to - 30.0).abs() < 0.01, "only 30 s exist");
        assert!(
            wav(&dirs, TrackKind::Me, 40.0, 50.0).is_err(),
            "past the end"
        );
        assert!(wav(&dirs, TrackKind::Me, 5.0, 5.0).is_err(), "empty range");
        assert!(
            wav(&dirs, TrackKind::Them, 0.0, 5.0).is_err(),
            "no such track"
        );
    }

    #[test]
    fn base64_matches_the_standard_examples() {
        assert_eq!(base64(b""), "");
        assert_eq!(base64(b"f"), "Zg==");
        assert_eq!(base64(b"fo"), "Zm8=");
        assert_eq!(base64(b"foo"), "Zm9v");
        assert_eq!(base64(b"foob"), "Zm9vYg==");
    }
}
