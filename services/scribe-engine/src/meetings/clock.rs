//! The meeting clock and the stop and pause flags. A pause stops the clock, so the live timer,
//! the chunk times and the Discord speaking times all stay in step with the saved audio.

use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

/// Meeting time without the pauses: the time the saved audio covers. The live timer, the chunk
/// times and the Discord speaking times all read it, so they stay in step after a pause.
pub struct ActiveClock(Mutex<ClockState>);

struct ClockState {
    started: Instant,
    paused_total: Duration,
    paused_at: Option<Instant>,
}

impl ActiveClock {
    pub fn new() -> Arc<Self> {
        Arc::new(Self(Mutex::new(ClockState {
            started: Instant::now(),
            paused_total: Duration::ZERO,
            paused_at: None,
        })))
    }

    pub fn elapsed(&self) -> Duration {
        let s = self.0.lock().unwrap();
        let end = s.paused_at.unwrap_or_else(Instant::now);
        end.saturating_duration_since(s.started)
            .saturating_sub(s.paused_total)
    }

    pub fn pause(&self) {
        self.0
            .lock()
            .unwrap()
            .paused_at
            .get_or_insert_with(Instant::now);
    }

    pub fn resume(&self) {
        let mut s = self.0.lock().unwrap();
        if let Some(at) = s.paused_at.take() {
            s.paused_total += at.elapsed();
        }
    }

    pub fn is_paused(&self) -> bool {
        self.0.lock().unwrap().paused_at.is_some()
    }

    /// Time spent paused so far, including a pause that is still on.
    pub fn paused_ms(&self) -> u64 {
        let s = self.0.lock().unwrap();
        let now = s.paused_at.map(|at| at.elapsed()).unwrap_or_default();
        (s.paused_total + now).as_millis() as u64
    }
}

/// What the live view asks the capture thread for.
#[derive(Default)]
pub struct Flags {
    pub(super) stop: AtomicBool,
    pub(super) pause: AtomicBool,
}

#[cfg(test)]
mod tests {
    use crate::meetings::capture::{Sources, Track, TrackKind};
    use crate::meetings::session::tests::{fake_opener, tone, FakeSegmenter};
    use crate::meetings::session::{assemble, Phase, Session, TrackOpener};
    use crate::meetings::store::tests::temp_root;
    use serde_json::Value;
    use std::sync::atomic::AtomicUsize;
    use std::sync::{Arc, Mutex};
    use std::thread;
    use std::time::{Duration, Instant};

    fn wait_until(what: &str, mut ready: impl FnMut() -> bool) {
        let deadline = Instant::now() + Duration::from_secs(10);
        while !ready() {
            assert!(Instant::now() < deadline, "timed out: {what}");
            thread::sleep(Duration::from_millis(20));
        }
    }

    #[test]
    fn pause_drops_the_audio_and_keeps_the_timeline_whole() {
        let dir = temp_root("pause");
        let sink: Arc<Mutex<Option<Arc<Mutex<Vec<f32>>>>>> = Arc::default();
        let handle = sink.clone();
        let opener: TrackOpener = Arc::new(move |kind, _| {
            if kind == TrackKind::Them {
                return Err("no loopback device".into());
            }
            let track = Track::detached(kind, 16_000);
            *handle.lock().unwrap() = Some(track.sink());
            track.push(&tone(2.0));
            Ok(track)
        });
        let segmenter = Arc::new(FakeSegmenter {
            calls: AtomicUsize::new(0),
            fail_first: 0,
        });
        let session = Session::start(
            "m".into(),
            dir.clone(),
            &opener,
            &Sources::default(),
            segmenter,
            Box::new(|_| {}),
        )
        .unwrap();
        let clock = session.clock();
        let feed = |seconds: f32| {
            let sink = sink.lock().unwrap().clone().unwrap();
            sink.lock().unwrap().extend(tone(seconds));
        };
        session.set_paused(true);
        wait_until("paused", || clock.is_paused());
        // Said during the pause: thrown away.
        feed(3.0);
        thread::sleep(Duration::from_millis(600));
        session.set_paused(false);
        wait_until("resumed", || !clock.is_paused());
        feed(1.0);
        session.request_stop();
        let live = session.live.clone();
        session.join();
        assert_eq!(live.lock().unwrap().phase, Phase::Done);
        assert!(clock.paused_ms() >= 500, "{}", clock.paused_ms());
        let text: Vec<String> = assemble(&dir)
            .iter()
            .map(|s| s["text"].as_str().unwrap().to_owned())
            .collect();
        // 2 s before the pause, 1 s after it. The 3 s in between are not saved.
        assert_eq!(text, ["said 2s", "said 1s"]);
        let chunks = std::fs::read_to_string(dir.join("chunks.jsonl")).unwrap();
        let second: Value = serde_json::from_str(chunks.lines().nth(1).unwrap()).unwrap();
        assert_eq!(
            second["t0"], 2.0,
            "the pause leaves no gap in the audio time"
        );
    }

    #[test]
    fn stop_while_paused_still_finishes() {
        let dir = temp_root("stop-paused");
        let segmenter = Arc::new(FakeSegmenter {
            calls: AtomicUsize::new(0),
            fail_first: 0,
        });
        let session = Session::start(
            "m".into(),
            dir.clone(),
            &fake_opener(2.0, None),
            &Sources::default(),
            segmenter,
            Box::new(|_| {}),
        )
        .unwrap();
        let clock = session.clock();
        session.set_paused(true);
        wait_until("paused", || clock.is_paused());
        session.request_stop();
        let live = session.live.clone();
        session.join();
        assert_eq!(live.lock().unwrap().phase, Phase::Done);
        assert_eq!(
            assemble(&dir).len(),
            1,
            "the audio before the pause is kept"
        );
    }
}
