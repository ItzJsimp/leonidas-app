//! Transcribe a saved meeting from its FLAC chunks: the audio-only Python imports, or a
//! meeting whose provider failed. The audio is read where it is (the import folder stays
//! read only); results go to `chunks.jsonl` in the main copy, like a live meeting.

use super::capture::{Track, TrackKind};
use super::session::{Segmenter, ME, THEM};
use super::speakers;
use serde_json::{json, Value};
use std::io::Write;
use std::path::{Path, PathBuf};

/// Every `seg-*.flac` of one track, in order, decoded to f32 at the file's rate.
#[cfg(test)]
pub(crate) fn read_track_pub(dirs: &[PathBuf], kind: TrackKind) -> (Vec<f32>, u32) {
    read_track(dirs, kind).unwrap()
}

fn read_track(dirs: &[PathBuf], kind: TrackKind) -> Result<(Vec<f32>, u32), String> {
    let Some(dir) = dirs.iter().find(|d| d.ends_with(kind.dir())) else {
        return Ok((Vec::new(), 16_000));
    };
    let mut files: Vec<PathBuf> = std::fs::read_dir(dir)
        .map_err(|e| e.to_string())?
        .flatten()
        .map(|e| e.path())
        .filter(|p| p.extension().is_some_and(|e| e == "flac"))
        .collect();
    files.sort();
    let (mut pcm, mut rate) = (Vec::new(), 16_000);
    for file in files {
        let mut reader =
            claxon::FlacReader::open(&file).map_err(|e| format!("{}: {e}", file.display()))?;
        let info = reader.streaminfo();
        rate = info.sample_rate;
        let (channels, scale) = (
            info.channels as usize,
            (1i64 << (info.bits_per_sample - 1)) as f32,
        );
        let samples: Vec<f32> = reader
            .samples()
            .map(|s| s.map(|v| v as f32 / scale))
            .collect::<Result<_, _>>()
            .map_err(|e| format!("{}: {e}", file.display()))?;
        pcm.extend(
            samples
                .chunks(channels)
                .map(|f| f.iter().sum::<f32>() / channels as f32),
        );
    }
    Ok((pcm, rate))
}

/// Chunk, transcribe and assemble. Returns how many chunks failed.
pub fn run(
    target: &Path,
    audio_dirs: &[PathBuf],
    segmenter: &dyn Segmenter,
) -> Result<usize, String> {
    let _ = std::fs::remove_file(target.join("chunks.jsonl"));
    let mut failed = 0;
    let mut voice = Vec::new();
    let mut chunks_file =
        std::fs::File::create(target.join("chunks.jsonl")).map_err(|e| e.to_string())?;
    for kind in [TrackKind::Me, TrackKind::Them] {
        let (pcm, rate) = read_track(audio_dirs, kind)?;
        if pcm.is_empty() {
            continue;
        }
        let mut track = Track::detached(kind, rate);
        track.push(&pcm);
        drop(pcm);
        let mut index = 0u32;
        loop {
            let chunk = match track.cut(false)? {
                Some(c) => c,
                None => match track.cut(true)? {
                    Some(c) => c,
                    None => break,
                },
            };
            index += 1;
            if chunk.silent {
                continue;
            }
            if kind == TrackKind::Them {
                voice.extend(speakers::voice_windows(&chunk.audio.pcm, chunk.t0));
            }
            let speaker = if kind == TrackKind::Me { ME } else { THEM };
            match segmenter.segments(&chunk.audio) {
                Ok(segments) => {
                    let lines: Vec<Value> = segments
                        .iter()
                        .map(|s| {
                            json!({"speaker_key": speaker, "track": kind.dir(),
                                   "t0": round2(chunk.t0 + s.t0), "t1": round2(chunk.t0 + s.t1.max(s.t0)),
                                   "text": s.text})
                        })
                        .collect();
                    let record = json!({"track": kind.dir(), "index": index, "t0": round2(chunk.t0), "segments": lines});
                    writeln!(chunks_file, "{record}").map_err(|e| e.to_string())?;
                }
                Err(_) => failed += 1,
            }
        }
    }
    super::store::write_json(
        &target.join("them-voice.json"),
        &speakers::windows_to_json(&voice),
    )?;
    let transcript = super::session::assemble(target);
    super::store::write_json(&target.join("transcript.json"), &Value::Array(transcript))?;
    Ok(failed)
}

fn round2(x: f32) -> f64 {
    (f64::from(x) * 100.0).round() / 100.0
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::meetings::session::tests::FakeSegmenter;
    use crate::meetings::store::{read_json, tests::temp_root};
    use std::sync::atomic::AtomicUsize;

    #[test]
    fn flac_chunks_are_read_back_and_transcribed() {
        let source = temp_root("retranscribe-src");
        let target = temp_root("retranscribe-dst");
        // Two 15 s "Python" chunks per track, written by our own encoder.
        for (kind, n) in [(TrackKind::Me, 2), (TrackKind::Them, 2)] {
            for i in 1..=n {
                let mut t = Track::detached(kind, 16_000);
                t.push(
                    &(0..240_000)
                        .map(|j| 0.3 * (j as f32 * 0.05).sin())
                        .collect::<Vec<f32>>(),
                );
                let chunk = t.cut(true).unwrap().unwrap();
                crate::meetings::capture::write_chunk(&source, kind, i, &chunk.audio).unwrap();
            }
        }
        let dirs = vec![source.join("me"), source.join("them")];
        let (pcm, rate) = read_track(&dirs, TrackKind::Me).unwrap();
        assert_eq!((pcm.len(), rate), (480_000, 16_000));
        let fake = FakeSegmenter {
            calls: AtomicUsize::new(0),
            fail_first: 0,
        };
        assert_eq!(run(&target, &dirs, &fake).unwrap(), 0);
        let transcript = read_json(&target.join("transcript.json")).unwrap();
        // 30 s per track: one chunk of 20 to 25 s, then the rest.
        assert_eq!(transcript.as_array().unwrap().len(), 4);
        assert!(
            source.join("me").join("seg-00001.flac").is_file(),
            "the source is not changed"
        );
    }
}
