//! One live meeting: capture, chunk, transcribe, assemble. Slice S4.
//!
//! Two threads, both started by `Session::start` and both gone after the stop:
//! - capture: every 250 ms pads the loopback track to the clock and cuts ready chunks;
//! - transcribe: sends each spoken chunk to the speech provider and appends the result to
//!   `chunks.jsonl`. That file is the source of the final `transcript.json`, so a meeting
//!   cut short by a crash can still be assembled.

use super::capture::{write_chunk, Chunk, Track, TrackKind};
use super::store::{read_json, write_json};
use crate::engine::EncodedAudio;
use crate::groq::{GroqClient, SpeechSegment};
use serde_json::{json, Value};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{mpsc, Arc, Mutex};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

const TICK: Duration = Duration::from_millis(250);
pub const ME: &str = "Me";
pub const THEM: &str = "Them";

/// Speech to timed segments. Groq in the app, a fake in tests.
pub trait Segmenter: Send + Sync {
    fn segments(&self, audio: &EncodedAudio) -> Result<Vec<SpeechSegment>, String>;
}

impl Segmenter for GroqClient {
    fn segments(&self, audio: &EncodedAudio) -> Result<Vec<SpeechSegment>, String> {
        self.transcribe_segments(audio)
    }
}

/// Opens a track. The app opens real devices, tests open detached tracks.
pub type TrackOpener = Arc<dyn Fn(TrackKind) -> Result<Track, String> + Send + Sync>;

pub fn device_opener() -> TrackOpener {
    Arc::new(Track::open)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Phase {
    Recording,
    Finishing,
    Done,
}

impl Phase {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Recording => "recording",
            Self::Finishing => "finishing",
            Self::Done => "done",
        }
    }
}

/// What the live view shows. Shared between the threads and the HTTP route.
pub struct Live {
    pub id: String,
    pub phase: Phase,
    pub started: Instant,
    pub segments: Vec<Value>,
    pub levels: [f32; 2],
    /// Chunks sent and not answered yet.
    pub pending: usize,
    /// Chunks the provider could not transcribe, even after the retry at stop.
    pub failed: usize,
    /// Problems the user must see: no call audio, provider errors.
    pub notices: Vec<String>,
}

impl Live {
    pub fn to_json(&self) -> Value {
        json!({
            "id": self.id,
            "phase": self.phase.as_str(),
            "elapsedMs": self.started.elapsed().as_millis() as u64,
            "levels": { "me": self.levels[0], "them": self.levels[1] },
            "segments": self.segments,
            "pending": self.pending,
            "failed": self.failed,
            "notices": self.notices,
        })
    }
}

/// Runs after the transcript is assembled: speakers and notes (slices S5 and S6).
pub type Finisher = Box<dyn FnOnce(&Path) + Send>;

pub struct Session {
    pub id: String,
    pub dir: PathBuf,
    pub live: Arc<Mutex<Live>>,
    stop: Arc<AtomicBool>,
    capture: Option<JoinHandle<()>>,
}

struct Job {
    kind: TrackKind,
    index: u32,
    t0: f32,
    audio: EncodedAudio,
}

impl Session {
    /// Open both tracks and start the threads. The mic must open. Without call audio the
    /// meeting still records the mic and says so in `notices`.
    pub fn start(
        id: String,
        dir: PathBuf,
        opener: &TrackOpener,
        segmenter: Arc<dyn Segmenter>,
        finisher: Finisher,
    ) -> Result<Self, String> {
        let me = opener(TrackKind::Me)?;
        let mut notices = Vec::new();
        let them = match opener(TrackKind::Them) {
            Ok(track) => Some(track),
            Err(e) => {
                notices.push(format!("Call audio is not recorded: {e}"));
                None
            }
        };
        let live = Arc::new(Mutex::new(Live {
            id: id.clone(),
            phase: Phase::Recording,
            started: Instant::now(),
            segments: Vec::new(),
            levels: [0.0; 2],
            pending: 0,
            failed: 0,
            notices,
        }));
        let stop = Arc::new(AtomicBool::new(false));
        let capture = {
            let (live, stop, dir) = (live.clone(), stop.clone(), dir.clone());
            thread::Builder::new()
                .name("meeting-capture".into())
                .spawn(move || run(dir, me, them, live, stop, segmenter, finisher))
                .map_err(|e| e.to_string())?
        };
        Ok(Self {
            id,
            dir,
            live,
            stop,
            capture: Some(capture),
        })
    }

    /// Ask the threads to finish. Returns at once: the live phase goes to `Done` later.
    pub fn request_stop(&self) {
        self.stop.store(true, Ordering::Release);
    }

    pub fn phase(&self) -> Phase {
        self.live.lock().unwrap().phase
    }

    /// Wait for the threads. Tests use it; the app polls the phase.
    pub fn join(mut self) {
        if let Some(handle) = self.capture.take() {
            let _ = handle.join();
        }
    }
}

fn run(
    dir: PathBuf,
    me: Track,
    them: Option<Track>,
    live: Arc<Mutex<Live>>,
    stop: Arc<AtomicBool>,
    segmenter: Arc<dyn Segmenter>,
    finisher: Finisher,
) {
    let (sender, receiver) = mpsc::channel::<Job>();
    let worker = {
        let (live, dir, segmenter) = (live.clone(), dir.clone(), segmenter.clone());
        thread::Builder::new()
            .name("meeting-transcribe".into())
            .spawn(move || transcribe_jobs(&dir, receiver, &live, segmenter.as_ref()))
            .expect("spawn meeting-transcribe")
    };
    let started = Instant::now();
    let mut tracks: Vec<Track> = std::iter::once(me).chain(them).collect();
    let mut next_index = [1u32; 2];
    loop {
        let stopping = stop.load(Ordering::Acquire);
        if !stopping {
            thread::sleep(TICK);
        }
        let elapsed = started.elapsed().as_secs_f32();
        for track in &mut tracks {
            if track.kind == TrackKind::Them {
                track.pad_to(elapsed);
            }
            let slot = track.kind as usize;
            live.lock().unwrap().levels[slot] = track.take_level();
            while let Some(chunk) = cut(track, stopping, &live) {
                let index = next_index[slot];
                next_index[slot] += 1;
                if let Err(e) = write_chunk(&dir, chunk.kind, index, &chunk.audio) {
                    note(&live, format!("Cannot save audio: {e}"));
                }
                if !chunk.silent {
                    live.lock().unwrap().pending += 1;
                    let job = Job {
                        kind: chunk.kind,
                        index,
                        t0: chunk.t0,
                        audio: chunk.audio,
                    };
                    let _ = sender.send(job);
                }
                if !stopping {
                    break;
                }
            }
        }
        if stopping {
            break;
        }
    }
    // Close the devices before the slow part.
    drop(tracks);
    live.lock().unwrap().phase = Phase::Finishing;
    drop(sender);
    let _ = worker.join();
    let transcript = assemble(&dir);
    let _ = write_json(&dir.join("transcript.json"), &Value::Array(transcript));
    finisher(&dir);
    live.lock().unwrap().phase = Phase::Done;
}

fn cut(track: &mut Track, force: bool, live: &Mutex<Live>) -> Option<Chunk> {
    if let Some(error) = track.error() {
        note(live, error);
    }
    match track.cut(force) {
        Ok(chunk) => chunk,
        Err(e) => {
            note(live, format!("Cannot encode audio: {e}"));
            None
        }
    }
}

fn note(live: &Mutex<Live>, message: String) {
    let mut live = live.lock().unwrap();
    if !live.notices.contains(&message) {
        live.notices.push(message);
    }
}

fn transcribe_jobs(
    dir: &Path,
    jobs: mpsc::Receiver<Job>,
    live: &Mutex<Live>,
    segmenter: &dyn Segmenter,
) {
    let mut failed = Vec::new();
    for job in jobs {
        if !transcribe_one(dir, &job, live, segmenter) {
            failed.push(job);
        }
    }
    // One more try for each failed chunk once the meeting stops.
    let mut still_failed = 0;
    for job in failed {
        live.lock().unwrap().pending += 1;
        if !transcribe_one(dir, &job, live, segmenter) {
            still_failed += 1;
        }
    }
    live.lock().unwrap().failed = still_failed;
}

/// Transcribe one chunk, append it to `chunks.jsonl` and the live view. False on failure.
fn transcribe_one(dir: &Path, job: &Job, live: &Mutex<Live>, segmenter: &dyn Segmenter) -> bool {
    let result = segmenter.segments(&job.audio);
    let mut live_guard = live.lock().unwrap();
    live_guard.pending = live_guard.pending.saturating_sub(1);
    let segments = match result {
        Ok(segments) => segments,
        Err(e) => {
            let message = format!("Speech provider error: {e}");
            if !live_guard.notices.contains(&message) {
                live_guard.notices.push(message);
            }
            return false;
        }
    };
    let speaker = if job.kind == TrackKind::Me { ME } else { THEM };
    let lines: Vec<Value> = segments
        .iter()
        .map(|s| {
            json!({
                "speaker_key": speaker,
                "track": job.kind.dir(),
                "t0": round2(job.t0 + s.t0),
                "t1": round2(job.t0 + s.t1.max(s.t0)),
                "text": s.text,
            })
        })
        .collect();
    let record = json!({ "track": job.kind.dir(), "index": job.index, "t0": round2(job.t0), "segments": lines });
    let appended = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(dir.join("chunks.jsonl"))
        .and_then(|mut f| writeln!(f, "{record}"));
    if let Err(e) = appended {
        live_guard
            .notices
            .push(format!("Cannot save the transcript: {e}"));
    }
    live_guard.segments.extend(lines);
    live_guard.segments.sort_by(|a, b| {
        a["t0"]
            .as_f64()
            .unwrap_or(0.0)
            .total_cmp(&b["t0"].as_f64().unwrap_or(0.0))
    });
    true
}

fn round2(x: f32) -> f64 {
    (f64::from(x) * 100.0).round() / 100.0
}

/// Every segment in `chunks.jsonl`, sorted by start time. Later lines for the same chunk
/// (a retry) replace earlier ones.
pub fn assemble(dir: &Path) -> Vec<Value> {
    let text = std::fs::read_to_string(dir.join("chunks.jsonl")).unwrap_or_default();
    let mut by_chunk: std::collections::BTreeMap<(String, u64), Vec<Value>> = Default::default();
    for record in text
        .lines()
        .filter_map(|l| serde_json::from_str::<Value>(l).ok())
    {
        let key = (
            record["track"].as_str().unwrap_or_default().to_owned(),
            record["index"].as_u64().unwrap_or(0),
        );
        by_chunk.insert(
            key,
            record["segments"].as_array().cloned().unwrap_or_default(),
        );
    }
    let mut out: Vec<Value> = by_chunk.into_values().flatten().collect();
    out.sort_by(|a, b| {
        a["t0"]
            .as_f64()
            .unwrap_or(0.0)
            .total_cmp(&b["t0"].as_f64().unwrap_or(0.0))
    });
    out
}

/// A meeting left in `recording` by a crash: build its transcript from the saved chunks.
pub fn recover(dir: &Path) -> bool {
    let Some(mut manifest) = read_json(&dir.join("manifest.json")) else {
        return false;
    };
    if manifest["state"].as_str() != Some("recording") {
        return false;
    }
    let transcript = assemble(dir);
    let _ = write_json(&dir.join("transcript.json"), &Value::Array(transcript));
    manifest["state"] = Value::from("done");
    manifest["interrupted"] = Value::from(true);
    if manifest["ended"].is_null() {
        manifest["ended"] = manifest["started"].clone();
    }
    write_json(&dir.join("manifest.json"), &manifest).is_ok()
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;
    use crate::meetings::store::tests::temp_root;
    use std::sync::atomic::AtomicUsize;

    /// Returns one segment per chunk with the chunk length in the text. Fails the first
    /// `fail_first` calls.
    pub(crate) struct FakeSegmenter {
        pub calls: AtomicUsize,
        pub fail_first: usize,
    }

    impl Segmenter for FakeSegmenter {
        fn segments(&self, audio: &EncodedAudio) -> Result<Vec<SpeechSegment>, String> {
            let n = self.calls.fetch_add(1, Ordering::SeqCst);
            if n < self.fail_first {
                return Err("rate limited".into());
            }
            let secs = audio.duration_ms as f32 / 1000.0;
            Ok(vec![SpeechSegment {
                t0: 0.5,
                t1: secs,
                text: format!("said {secs:.0}s"),
            }])
        }
    }

    fn tone(seconds: f32) -> Vec<f32> {
        (0..(seconds * 16_000.0) as usize)
            .map(|i| 0.3 * (i as f32 * 0.05).sin())
            .collect()
    }

    /// Detached tracks preloaded with audio, so a session runs without devices.
    pub(crate) fn fake_opener(me_s: f32, them_s: Option<f32>) -> TrackOpener {
        Arc::new(move |kind| {
            let seconds = match kind {
                TrackKind::Me => me_s,
                TrackKind::Them => them_s.ok_or("no loopback device")?,
            };
            let track = Track::detached(kind, 16_000);
            track.push(&tone(seconds));
            Ok(track)
        })
    }

    #[test]
    fn a_session_records_both_tracks_and_writes_the_transcript() {
        let dir = temp_root("session");
        let segmenter = Arc::new(FakeSegmenter {
            calls: AtomicUsize::new(0),
            fail_first: 1,
        });
        let finished = Arc::new(AtomicBool::new(false));
        let flag = finished.clone();
        let session = Session::start(
            "m".into(),
            dir.clone(),
            &fake_opener(30.0, Some(10.0)),
            segmenter.clone(),
            Box::new(move |_| flag.store(true, Ordering::SeqCst)),
        )
        .unwrap();
        thread::sleep(Duration::from_millis(600));
        session.request_stop();
        let live = session.live.clone();
        session.join();
        let live = live.lock().unwrap();
        assert_eq!(live.phase, Phase::Done);
        assert_eq!(live.failed, 0, "the failed chunk was retried");
        assert!(finished.load(Ordering::SeqCst));
        let transcript = read_json(&dir.join("transcript.json")).unwrap();
        let speakers: Vec<&str> = transcript
            .as_array()
            .unwrap()
            .iter()
            .map(|s| s["speaker_key"].as_str().unwrap())
            .collect();
        assert!(
            speakers.contains(&ME) && speakers.contains(&THEM),
            "{speakers:?}"
        );
        // 30 s of mic: one 20-25 s chunk while recording, the rest at stop.
        assert!(dir.join("me").join("seg-00002.flac").is_file());
        assert!(dir.join("them").join("seg-00001.flac").is_file());
        let starts: Vec<f64> = transcript
            .as_array()
            .unwrap()
            .iter()
            .map(|s| s["t0"].as_f64().unwrap())
            .collect();
        assert!(
            starts.windows(2).all(|w| w[0] <= w[1]),
            "sorted: {starts:?}"
        );
    }

    #[test]
    fn no_loopback_still_records_the_mic_with_a_notice() {
        let dir = temp_root("no-loopback");
        let segmenter = Arc::new(FakeSegmenter {
            calls: AtomicUsize::new(0),
            fail_first: 0,
        });
        let session = Session::start(
            "m".into(),
            dir.clone(),
            &fake_opener(3.0, None),
            segmenter,
            Box::new(|_| {}),
        )
        .unwrap();
        session.request_stop();
        let live = session.live.clone();
        session.join();
        assert!(live.lock().unwrap().notices[0].starts_with("Call audio is not recorded"));
        assert_eq!(assemble(&dir).len(), 1);
    }

    #[test]
    fn recover_builds_a_transcript_from_chunks() {
        let dir = temp_root("recover");
        write_json(
            &dir.join("manifest.json"),
            &json!({"state": "recording", "started": "2026-11-07T10:00:00Z"}),
        )
        .unwrap();
        std::fs::write(
            dir.join("chunks.jsonl"),
            "{\"track\":\"me\",\"index\":1,\"segments\":[{\"speaker_key\":\"Me\",\"t0\":1.0,\"text\":\"b\"}]}\n\
             {\"track\":\"them\",\"index\":1,\"segments\":[{\"speaker_key\":\"Them\",\"t0\":0.5,\"text\":\"a\"}]}\n",
        )
        .unwrap();
        assert!(recover(&dir));
        let t = read_json(&dir.join("transcript.json")).unwrap();
        assert_eq!(t[0]["text"], "a");
        assert_eq!(
            read_json(&dir.join("manifest.json")).unwrap()["state"],
            "done"
        );
        assert!(!recover(&dir), "only once");
    }
}
