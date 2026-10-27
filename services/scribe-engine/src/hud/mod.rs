//! The floating pill HUD. The engine draws it itself (no browser engine), so it shows with the
//! Leonidas window closed. `HudModel` turns engine events into what to draw; `render` draws it;
//! `window` (Windows only) puts it on screen.

#[cfg(windows)]
pub mod picker;
pub mod render;
#[cfg(windows)]
pub mod window;

use crate::{Event, State};
use std::time::{Duration, Instant};

/// How long "done" stays on screen before the pill hides.
pub const DONE_FOR: Duration = Duration::from_millis(900);
/// How long an error stays on screen before the pill hides.
pub const ERROR_FOR: Duration = Duration::from_millis(2500);
/// Longest error line, in characters.
const ERROR_CHARS: usize = 48;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum View {
    Hidden,
    Recording,
    Transcribing,
    Done,
    Error(String),
}

/// Engine events plus a clock in, the view to draw out. No window and no engine lock.
#[derive(Debug)]
pub struct HudModel {
    view: View,
    /// The view hides at this time (`Done` and `Error` only).
    until: Option<Instant>,
}

impl Default for HudModel {
    fn default() -> Self {
        Self {
            view: View::Hidden,
            until: None,
        }
    }
}

impl HudModel {
    pub fn view(&self) -> &View {
        &self.view
    }

    pub fn on_event(&mut self, event: &Event, now: Instant) {
        match event {
            Event::State { state, .. } => match state {
                State::Listening => self.set(View::Recording, None),
                State::Processing => self.set(View::Transcribing, None),
                State::Ready => match self.view {
                    // Ready without a transcript event first: the work ended well.
                    View::Transcribing => self.set(View::Done, Some(now + DONE_FOR)),
                    // Cancelled, or shorter than the minimum length: nothing to report.
                    View::Recording => self.set(View::Hidden, None),
                    _ => {}
                },
                State::MicError => {
                    if !matches!(self.view, View::Error(_)) {
                        self.error("Microphone error", now);
                    }
                }
            },
            Event::Transcript { .. } => self.set(View::Done, Some(now + DONE_FOR)),
            Event::Error { message, .. } => self.error(message, now),
            Event::Partial { .. } | Event::History { .. } => {}
        }
    }

    /// Hide a timed view when its time is up. Returns true when the view changed.
    pub fn tick(&mut self, now: Instant) -> bool {
        if self.until.is_some_and(|t| now >= t) {
            self.set(View::Hidden, None);
            return true;
        }
        false
    }

    fn error(&mut self, message: &str, now: Instant) {
        let message = message.trim();
        let mut text: String = message.chars().take(ERROR_CHARS).collect();
        if message.chars().count() > ERROR_CHARS {
            text.pop();
            text.push('…');
        }
        if text.is_empty() {
            text = "Something went wrong".into();
        }
        self.set(View::Error(text), Some(now + ERROR_FOR));
    }

    fn set(&mut self, view: View, until: Option<Instant>) {
        self.view = view;
        self.until = until;
    }
}

#[cfg(test)]
mod model {
    use super::*;
    use crate::SttEngine;

    fn state(state: State) -> Event {
        Event::State {
            state,
            at: String::new(),
        }
    }

    fn transcript() -> Event {
        Event::Transcript {
            text: "Hi.".into(),
            raw: "hi".into(),
            duration_ms: 900,
            pasted: true,
            engine: SttEngine::default(),
            at: String::new(),
        }
    }

    fn error(message: &str) -> Event {
        Event::Error {
            code: "stt_error".into(),
            message: message.into(),
            at: String::new(),
        }
    }

    #[test]
    fn starts_hidden() {
        assert_eq!(HudModel::default().view(), &View::Hidden);
    }

    #[test]
    fn full_dictation_goes_recording_transcribing_done_hidden() {
        let t = Instant::now();
        let mut m = HudModel::default();
        m.on_event(&state(State::Listening), t);
        assert_eq!(m.view(), &View::Recording);
        m.on_event(&state(State::Processing), t);
        assert_eq!(m.view(), &View::Transcribing);
        m.on_event(&transcript(), t);
        m.on_event(&state(State::Ready), t);
        assert_eq!(m.view(), &View::Done);
        assert!(!m.tick(t + DONE_FOR - Duration::from_millis(1)));
        assert!(m.tick(t + DONE_FOR));
        assert_eq!(m.view(), &View::Hidden);
    }

    #[test]
    fn ready_after_processing_without_transcript_shows_done() {
        let t = Instant::now();
        let mut m = HudModel::default();
        m.on_event(&state(State::Processing), t);
        m.on_event(&state(State::Ready), t);
        assert_eq!(m.view(), &View::Done);
    }

    #[test]
    fn short_or_cancelled_recording_hides_at_once() {
        let t = Instant::now();
        let mut m = HudModel::default();
        m.on_event(&state(State::Listening), t);
        m.on_event(&state(State::Ready), t);
        assert_eq!(m.view(), &View::Hidden);
        assert!(!m.tick(t + ERROR_FOR));
    }

    #[test]
    fn error_shows_then_hides_and_survives_ready() {
        let t = Instant::now();
        let mut m = HudModel::default();
        m.on_event(&state(State::Processing), t);
        m.on_event(&error("No network"), t);
        m.on_event(&state(State::Ready), t);
        assert_eq!(m.view(), &View::Error("No network".into()));
        assert!(!m.tick(t + ERROR_FOR - Duration::from_millis(1)));
        assert!(m.tick(t + ERROR_FOR));
        assert_eq!(m.view(), &View::Hidden);
    }

    #[test]
    fn mic_error_state_keeps_a_more_specific_error() {
        let t = Instant::now();
        let mut m = HudModel::default();
        m.on_event(&state(State::MicError), t);
        assert_eq!(m.view(), &View::Error("Microphone error".into()));
        m.on_event(&error("No input device"), t);
        m.on_event(&state(State::MicError), t);
        assert_eq!(m.view(), &View::Error("No input device".into()));
    }

    #[test]
    fn long_and_empty_errors_are_trimmed() {
        let t = Instant::now();
        let mut m = HudModel::default();
        m.on_event(&error(&"x".repeat(100)), t);
        let View::Error(text) = m.view() else {
            panic!("not an error")
        };
        assert_eq!(text.chars().count(), ERROR_CHARS);
        assert!(text.ends_with('…'));
        m.on_event(&error("  "), t);
        assert_eq!(m.view(), &View::Error("Something went wrong".into()));
    }

    #[test]
    fn a_new_recording_replaces_done() {
        let t = Instant::now();
        let mut m = HudModel::default();
        m.on_event(&transcript(), t);
        m.on_event(&state(State::Listening), t);
        assert_eq!(m.view(), &View::Recording);
        assert!(!m.tick(t + DONE_FOR));
    }
}
