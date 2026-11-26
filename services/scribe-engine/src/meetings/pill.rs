//! What the floating pill shows for a meeting, and what its buttons do. The pill (`hud::pill`)
//! draws it; this reads the live session. A child of `meetings`, so it reads `active` directly.

use super::session::Phase;
use super::Meetings;
use crate::hud::pill::{PillAction, PillMode, PillState};
use serde_json::Value;

impl Meetings {
    /// The pill state, or `None` when no meeting runs (or it is done).
    pub fn pill(&self) -> Option<PillState> {
        let active = self.active.lock().unwrap();
        let session = active.as_ref()?;
        let live = session.live.lock().unwrap();
        let mode = match live.phase {
            Phase::Recording if live.clock.is_paused() => PillMode::Paused,
            Phase::Recording => PillMode::Recording,
            Phase::Finishing => PillMode::Finishing { left: live.pending },
            Phase::Done => return None,
        };
        Some(PillState {
            mode,
            elapsed_ms: live.clock.elapsed().as_millis() as u64,
            levels: live.levels,
        })
    }

    /// A click on a pill button. The same steps as the Meetings page.
    pub fn pill_action(&self, action: PillAction) {
        let _ = match action {
            PillAction::Pause => self.handle("POST", "/v1/meetings/pause", Value::Null),
            PillAction::Resume => self.handle("POST", "/v1/meetings/resume", Value::Null),
            PillAction::Stop => self.handle("POST", "/v1/meetings/stop", Value::Null),
        };
    }
}

#[cfg(test)]
mod tests {
    use super::super::tests::{test_meetings, wait_done};
    use super::*;
    use crate::meetings::session::tests::fake_opener;

    fn wait_for(what: &str, mut ready: impl FnMut() -> bool) {
        for _ in 0..100 {
            if ready() {
                return;
            }
            std::thread::sleep(std::time::Duration::from_millis(50));
        }
        panic!("{what}");
    }

    #[test]
    fn the_pill_follows_a_meeting_and_its_buttons_work() {
        let m = test_meetings("pill-follows", fake_opener(30.0, Some(30.0)));
        assert!(m.pill().is_none(), "no meeting, no pill");
        let (status, _) = m.handle("POST", "/v1/meetings/start", Value::Null);
        assert_eq!(status, 200);
        assert_eq!(m.pill().unwrap().mode, PillMode::Recording);

        m.pill_action(PillAction::Pause);
        wait_for("paused", || m.pill().unwrap().mode == PillMode::Paused);
        m.pill_action(PillAction::Resume);
        wait_for("resumed", || m.pill().unwrap().mode == PillMode::Recording);

        m.pill_action(PillAction::Stop);
        wait_done(&m);
        assert!(m.pill().is_none(), "a finished meeting hides the pill");
    }
}
