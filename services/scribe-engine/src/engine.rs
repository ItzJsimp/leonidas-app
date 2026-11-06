//! The dictation state machine: ready -> listening -> processing -> ready.
//! Audio, speech-to-text, polish and paste are seams, so tests run with fakes.

use crate::contract::{now_iso, Event, HistoryMetrics, Mode, State, SttEngine};
use crate::history::{History, NewItem};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::mpsc::{channel, Receiver, Sender};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

/// Encoded audio ready for upload.
#[derive(Debug, Clone, PartialEq)]
pub struct EncodedAudio {
    pub bytes: Vec<u8>,
    /// For example `audio/wav` or `audio/flac`.
    pub mime: &'static str,
    /// Multipart file name, for example `audio.wav`.
    pub file_name: &'static str,
    pub duration_ms: u64,
    /// 16 kHz mono samples for the local model. Empty when the recorder has none.
    pub pcm: Vec<f32>,
}

pub trait Recorder: Send {
    /// Open the mic and start capture. Must return fast: it is on the hotkey path.
    fn start(&mut self) -> Result<(), String>;
    /// Stop capture and return the encoded recording.
    fn stop(&mut self) -> Result<EncodedAudio, String>;
    /// Stop capture and drop the audio.
    fn cancel(&mut self);
    /// When the first audio buffer arrived for the current or last recording.
    fn first_buffer_at(&self) -> Option<Instant>;
    /// v1.2: new audio settings for the next recording. The current one keeps its device.
    fn configure(&mut self, _cfg: &crate::config::AudioConfig) {}
}

/// The result of a successful transcription.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Transcription {
    pub text: String,
    pub engine: SttEngine,
    pub private: bool,
    /// Who served it, as `provider/model`, for example `groq/whisper-large-v3-turbo`.
    pub source: String,
}

pub trait Transcriber: Send + Sync {
    /// Unknown privacy is treated as private for memory extraction.
    fn private_mode(&self) -> bool {
        true
    }
    fn transcribe(&self, audio: &EncodedAudio) -> Result<Transcription, String>;
}

pub trait Polisher: Send + Sync {
    /// Never fails: on any error it returns the best text it has (at least `raw`).
    fn polish(&self, raw: &str) -> String;
    /// The polished text and who served it (`provider/model`, `fast-path` or `none`).
    fn polish_traced(&self, raw: &str) -> (String, String) {
        (self.polish(raw), String::new())
    }
    fn rewrite(&self, _text: &str, _instruction: &str) -> Result<String, String> {
        Err("Rewrite unavailable.".into())
    }
}

/// `main` keeps one handle to change settings live; the engine owns the other.
impl<T: Transcriber + ?Sized> Transcriber for Arc<T> {
    fn private_mode(&self) -> bool {
        (**self).private_mode()
    }
    fn transcribe(&self, audio: &EncodedAudio) -> Result<Transcription, String> {
        (**self).transcribe(audio)
    }
}

impl<T: Polisher + ?Sized> Polisher for Arc<T> {
    fn polish(&self, raw: &str) -> String {
        (**self).polish(raw)
    }
    fn polish_traced(&self, raw: &str) -> (String, String) {
        (**self).polish_traced(raw)
    }
    fn rewrite(&self, text: &str, instruction: &str) -> Result<String, String> {
        (**self).rewrite(text, instruction)
    }
}

pub trait Paster: Send + Sync {
    /// Paste into the focused window. Returns true when the paste was sent.
    fn paste(&self, text: &str) -> bool;
    /// Put text on the clipboard only. Used when the target window is gone.
    fn copy(&self, _text: &str) -> bool {
        false
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum EngineError {
    /// The command is not allowed in the current state.
    InvalidState(State),
}

struct Inner {
    state: State,
    mode: Option<Mode>,
    recorder: Box<dyn Recorder>,
    trigger_at: Option<Instant>,
    hotkey_latency: Option<Duration>,
    /// v1.2: the app in front when this recording started.
    app: String,
    private: bool,
}

struct Shared {
    inner: Mutex<Inner>,
    subscribers: Mutex<Vec<Sender<Event>>>,
    transcriber: Box<dyn Transcriber>,
    polisher: Box<dyn Polisher>,
    paster: Box<dyn Paster>,
    min_record_ms: AtomicU64,
    /// v1.2: where finished dictations are saved; `None` keeps no history.
    history: Option<Arc<History>>,
    /// v1.2: reads the app in front for the history `app` field.
    foreground: Box<dyn Fn() -> String + Send + Sync>,
    /// A rewrite runs beside dictation, so it has its own flag and never touches `state`.
    rewriting: AtomicBool,
    /// Bumped by `cancel_rewrite`, so a cancelled rewrite never pastes.
    rewrite_gen: AtomicU64,
    /// Audio of takes that every provider failed, for a retry. `None` keeps nothing.
    failed: Option<crate::failed::FailedStore>,
}

/// Cheap to clone; all clones drive the same engine.
#[derive(Clone)]
pub struct Engine(Arc<Shared>);

impl Engine {
    pub fn new(
        recorder: Box<dyn Recorder>,
        transcriber: Box<dyn Transcriber>,
        polisher: Box<dyn Polisher>,
        paster: Box<dyn Paster>,
        min_record_ms: u64,
        history: Option<Arc<History>>,
    ) -> Self {
        Self(Arc::new(Shared {
            inner: Mutex::new(Inner {
                state: State::Ready,
                mode: None,
                recorder,
                trigger_at: None,
                hotkey_latency: None,
                app: String::new(),
                private: true,
            }),
            subscribers: Mutex::new(Vec::new()),
            transcriber,
            polisher,
            paster,
            min_record_ms: AtomicU64::new(min_record_ms),
            history,
            foreground: Box::new(String::new),
            rewriting: AtomicBool::new(false),
            rewrite_gen: AtomicU64::new(0),
            failed: None,
        }))
    }

    /// Keep the audio of failed takes for `retry`. Call it before the first clone.
    pub fn with_failed_store(mut self, store: crate::failed::FailedStore) -> Self {
        Arc::get_mut(&mut self.0)
            .expect("with_failed_store runs before the engine is shared")
            .failed = Some(store);
        self
    }

    /// Run the newest failed take again. Allowed in `ready` only. `Ok(None)`: nothing saved.
    /// The text goes to history and the clipboard, never into the window in front.
    pub fn retry(&self) -> Result<Option<State>, EngineError> {
        let shared = &*self.0;
        // Read the file before the lock, so a slow disk never blocks status or start.
        let Some((path, audio)) = shared.failed.as_ref().and_then(|s| s.latest()) else {
            return Ok(None);
        };
        let mut inner = shared.inner.lock().unwrap();
        if inner.state != State::Ready {
            return Err(EngineError::InvalidState(inner.state));
        }
        let private = shared.transcriber.private_mode();
        Self::set_state(shared, &mut inner, State::Processing);
        drop(inner);
        let engine = self.clone();
        std::thread::Builder::new()
            .name("scribe-retry".into())
            .spawn(move || {
                engine.process(
                    audio,
                    false,
                    Mode::Toggle,
                    String::new(),
                    private,
                    Some(path),
                )
            })
            .expect("spawn scribe-retry thread");
        Ok(Some(State::Processing))
    }

    /// v1.2: set how the engine reads the app in front. Call it before the first clone.
    pub fn with_foreground(mut self, read: impl Fn() -> String + Send + Sync + 'static) -> Self {
        Arc::get_mut(&mut self.0)
            .expect("with_foreground runs before the engine is shared")
            .foreground = Box::new(read);
        self
    }

    /// v1.2: apply saved audio settings to the next recording.
    pub fn set_audio(&self, cfg: &crate::config::AudioConfig) {
        self.0
            .min_record_ms
            .store(cfg.min_record_ms, Ordering::Relaxed);
        self.0.inner.lock().unwrap().recorder.configure(cfg);
    }

    /// v1.2: the dictation history, when the engine keeps one.
    pub fn history(&self) -> Option<&History> {
        self.0.history.as_deref()
    }

    pub fn state(&self) -> State {
        self.0.inner.lock().unwrap().state
    }

    /// The mode of the current recording, if listening.
    pub fn mode(&self) -> Option<Mode> {
        self.0.inner.lock().unwrap().mode
    }

    /// Hotkey time of the last recording that had a hotkey trigger.
    pub fn last_trigger_at(&self) -> Option<Instant> {
        self.0.inner.lock().unwrap().trigger_at
    }

    /// Hotkey callback to first audio buffer, for the last recording that had a hotkey trigger.
    pub fn last_hotkey_latency(&self) -> Option<Duration> {
        let mut inner = self.0.inner.lock().unwrap();
        if inner.hotkey_latency.is_none() {
            if let (Some(t), Some(first)) = (inner.trigger_at, inner.recorder.first_buffer_at()) {
                inner.hotkey_latency = first.checked_duration_since(t);
            }
        }
        inner.hotkey_latency
    }

    pub fn subscribe(&self) -> Receiver<Event> {
        let (tx, rx) = channel();
        self.0.subscribers.lock().unwrap().push(tx);
        rx
    }

    fn emit(shared: &Shared, event: Event) {
        shared
            .subscribers
            .lock()
            .unwrap()
            .retain(|tx| tx.send(event.clone()).is_ok());
    }

    fn set_state(shared: &Shared, inner: &mut Inner, state: State) {
        if inner.state != state {
            inner.state = state;
            Self::emit(
                shared,
                Event::State {
                    state,
                    at: now_iso(),
                },
            );
        }
    }

    pub fn report_error(&self, message: &str) {
        Self::emit(
            &self.0,
            Event::Error {
                code: "rewrite_error".into(),
                message: message.into(),
                at: now_iso(),
            },
        );
    }

    pub fn rewrite(
        &self,
        text: String,
        preset: crate::rewrite::Preset,
        app: String,
        private: bool,
        focus: impl FnOnce() -> bool + Send + 'static,
    ) -> Result<State, EngineError> {
        if private {
            self.report_error("Rewrite needs the cloud. Turn off private mode.");
            return Ok(self.state());
        }
        if self.0.rewriting.swap(true, Ordering::AcqRel) {
            return Err(EngineError::InvalidState(State::Processing));
        }
        let gen = self.0.rewrite_gen.load(Ordering::Acquire);
        let engine = self.clone();
        std::thread::spawn(move || {
            let started = Instant::now();
            let shared = &*engine.0;
            let outcome = shared.polisher.rewrite(&text, &preset.instruction);
            if shared.rewrite_gen.load(Ordering::Acquire) != gen {
                return; // Cancelled with Esc: drop the result.
            }
            match outcome {
                Ok(result) if !result.trim().is_empty() => {
                    if focus() && shared.paster.paste(&result) {
                        let at_ms = crate::contract::unix_ms_now();
                        let at = crate::contract::iso_from_unix_ms(at_ms);
                        let saved = shared.history.as_ref().map(|history| {
                            history.add(NewItem {
                                at: at.clone(),
                                mode: "rewrite".into(),
                                app,
                                raw_text: text.clone(),
                                cleaned_text: result.clone(),
                                preset: Some(preset.name),
                                stt: String::new(),
                                polish: String::new(),
                                metrics: HistoryMetrics {
                                    transcribe_ms: 0,
                                    polish_ms: millis(started.elapsed()),
                                    total_ms: millis(started.elapsed()),
                                },
                                pasted: true,
                                // Selected text is not dictation, so it stays off the public feed.
                                private: true,
                                at_ms,
                            })
                        });
                        Self::emit(
                            shared,
                            Event::Transcript {
                                text: result,
                                raw: text,
                                duration_ms: 0,
                                pasted: true,
                                engine: SttEngine::default(),
                                at,
                            },
                        );
                        match saved {
                            Some(Ok(item)) => Self::emit(shared, Event::History { item }),
                            Some(Err(_)) => {
                                engine.report_error("Could not save the rewrite to history.")
                            }
                            None => {}
                        }
                    } else if shared.paster.copy(&result) {
                        // Never lose a finished rewrite: the user can paste it by hand.
                        engine
                            .report_error("Rewrite is on the clipboard. Press Ctrl+V to paste it.");
                    } else {
                        engine.report_error("Could not paste the rewrite.");
                    }
                }
                Ok(_) => engine.report_error("Rewrite returned empty text."),
                Err(message) => engine.report_error(&message),
            }
            shared.rewriting.store(false, Ordering::Release);
        });
        Ok(self.state())
    }

    /// Stops a running rewrite: its result is dropped. Returns false when none runs.
    pub fn cancel_rewrite(&self) -> bool {
        if !self.0.rewriting.load(Ordering::Acquire) {
            return false;
        }
        // Bump first, so a rewrite that starts right after this reads the new value.
        self.0.rewrite_gen.fetch_add(1, Ordering::AcqRel);
        self.0.rewriting.store(false, Ordering::Release);
        true
    }

    /// True while a rewrite runs. Dictation state is separate.
    pub fn rewriting(&self) -> bool {
        self.0.rewriting.load(Ordering::Acquire)
    }

    /// Start recording. Allowed in `ready` and `mic_error`.
    /// `trigger_at` is the hotkey time, used for the latency budget.
    pub fn start(&self, mode: Mode, trigger_at: Option<Instant>) -> Result<State, EngineError> {
        let shared = &*self.0;
        let mut inner = shared.inner.lock().unwrap();
        if !matches!(inner.state, State::Ready | State::MicError) {
            return Err(EngineError::InvalidState(inner.state));
        }
        inner.private = shared.transcriber.private_mode();
        inner.trigger_at = trigger_at;
        inner.hotkey_latency = None;
        match inner.recorder.start() {
            Ok(()) => {
                inner.mode = Some(mode);
                // After the mic opens, so the read never delays capture.
                inner.app = (shared.foreground)();
                Self::set_state(shared, &mut inner, State::Listening);
            }
            Err(message) => {
                inner.mode = None;
                Self::set_state(shared, &mut inner, State::MicError);
                Self::emit(
                    shared,
                    Event::Error {
                        code: "mic_error".into(),
                        message,
                        at: now_iso(),
                    },
                );
            }
        }
        Ok(inner.state)
    }

    /// Discard the current recording. No-op outside `listening`.
    pub fn cancel(&self) {
        let shared = &*self.0;
        let mut inner = shared.inner.lock().unwrap();
        if inner.state == State::Listening {
            inner.recorder.cancel();
            inner.mode = None;
            Self::set_state(shared, &mut inner, State::Ready);
        }
    }

    /// Stop recording and transcribe on a worker thread. Allowed in `listening` only.
    pub fn stop(&self, paste: bool) -> Result<State, EngineError> {
        let shared = &*self.0;
        let mut inner = shared.inner.lock().unwrap();
        if inner.state != State::Listening {
            return Err(EngineError::InvalidState(inner.state));
        }
        let mode = inner.mode.take().unwrap_or(Mode::Hold);
        let app = std::mem::take(&mut inner.app);
        let private = inner.private || shared.transcriber.private_mode();
        if let (Some(t), Some(first)) = (inner.trigger_at, inner.recorder.first_buffer_at()) {
            inner.hotkey_latency = first.checked_duration_since(t);
        }
        let audio = match inner.recorder.stop() {
            Ok(audio) => audio,
            Err(message) => {
                Self::set_state(shared, &mut inner, State::MicError);
                Self::emit(
                    shared,
                    Event::Error {
                        code: "mic_error".into(),
                        message,
                        at: now_iso(),
                    },
                );
                return Ok(inner.state);
            }
        };
        if audio.duration_ms < shared.min_record_ms.load(Ordering::Relaxed) {
            Self::set_state(shared, &mut inner, State::Ready);
            return Ok(inner.state);
        }
        Self::set_state(shared, &mut inner, State::Processing);
        drop(inner);
        let engine = self.clone();
        std::thread::Builder::new()
            .name("scribe-process".into())
            .spawn(move || engine.process(audio, paste, mode, app, private, None))
            .expect("spawn scribe-process thread");
        Ok(State::Processing)
    }

    /// `retry_of`: the saved file this take came from. It is removed once the take succeeds.
    fn process(
        &self,
        audio: EncodedAudio,
        paste: bool,
        mode: Mode,
        app: String,
        private: bool,
        retry_of: Option<std::path::PathBuf>,
    ) {
        let shared = &*self.0;
        let started = Instant::now();
        let done = |text: Option<&str>| {
            if let (Some(path), Some(store)) = (&retry_of, &shared.failed) {
                if let Some(text) = text.filter(|t| !t.is_empty()) {
                    shared.paster.copy(text);
                }
                store.remove(path);
            }
        };
        match shared.transcriber.transcribe(&audio) {
            Ok(t) if t.text.trim().is_empty() => done(None),
            Ok(t) => {
                let transcribed = Instant::now();
                let (text, polished_by) = shared.polisher.polish_traced(&t.text);
                let polished = Instant::now();
                let pasted = paste && !text.is_empty() && shared.paster.paste(&text);
                let at_ms = crate::contract::unix_ms_now();
                let at = crate::contract::iso_from_unix_ms(at_ms);
                let saved = shared.history.as_ref().map(|history| {
                    history.add(NewItem {
                        at: at.clone(),
                        mode: mode_name(mode).into(),
                        preset: None,
                        stt: t.source.clone(),
                        polish: polished_by,
                        app,
                        raw_text: t.text.clone(),
                        cleaned_text: text.clone(),
                        metrics: HistoryMetrics {
                            transcribe_ms: millis(transcribed - started),
                            polish_ms: millis(polished - transcribed),
                            total_ms: millis(started.elapsed()),
                        },
                        pasted,
                        private: private || t.private || shared.transcriber.private_mode(),
                        at_ms,
                    })
                });
                done(Some(&text));
                Self::emit(
                    shared,
                    Event::Transcript {
                        text,
                        raw: t.text,
                        duration_ms: audio.duration_ms,
                        pasted,
                        engine: t.engine,
                        at: at.clone(),
                    },
                );
                match saved {
                    Some(Ok(item)) => Self::emit(shared, Event::History { item }),
                    // Store errors can contain paths. Send only a fixed message.
                    Some(Err(_)) => Self::emit(
                        shared,
                        Event::Error {
                            code: "store_error".into(),
                            message: "Could not save the dictation to history.".into(),
                            at,
                        },
                    ),
                    None => {}
                }
            }
            Err(mut message) => {
                // Keep the audio, so the words are not lost. A retry keeps its own file.
                let kept = match (&shared.failed, &retry_of) {
                    (Some(_), Some(_)) => true,
                    (Some(store), None) => store.save(&audio).is_ok(),
                    (None, _) => false,
                };
                if kept {
                    message.push_str(" The audio is saved. Retry it in Scribe.");
                }
                Self::emit(
                    shared,
                    Event::Error {
                        code: "stt_error".into(),
                        message,
                        at: now_iso(),
                    },
                )
            }
        }
        let mut inner = shared.inner.lock().unwrap();
        Self::set_state(shared, &mut inner, State::Ready);
    }
}

fn mode_name(mode: Mode) -> &'static str {
    match mode {
        Mode::Hold => "hold",
        Mode::Toggle => "toggle",
    }
}

fn millis(d: Duration) -> u64 {
    u64::try_from(d.as_millis()).unwrap_or(u64::MAX)
}

/// Test doubles, shared with other modules' tests.
#[cfg(test)]
pub mod fakes {
    use super::*;

    #[derive(Default)]
    pub struct FakeRecorder {
        pub fail_start: bool,
        pub duration_ms: u64,
        pub first: Option<Instant>,
    }

    impl Recorder for FakeRecorder {
        fn start(&mut self) -> Result<(), String> {
            if self.fail_start {
                return Err("No input device".into());
            }
            self.first = Some(Instant::now());
            Ok(())
        }
        fn stop(&mut self) -> Result<EncodedAudio, String> {
            Ok(EncodedAudio {
                bytes: vec![1, 2, 3],
                mime: "audio/wav",
                file_name: "audio.wav",
                duration_ms: self.duration_ms,
                pcm: Vec::new(),
            })
        }
        fn cancel(&mut self) {}
        fn first_buffer_at(&self) -> Option<Instant> {
            self.first
        }
    }

    pub struct FakeStt(pub Result<String, String>);
    impl Transcriber for FakeStt {
        fn transcribe(&self, _: &EncodedAudio) -> Result<Transcription, String> {
            self.0.clone().map(|text| Transcription {
                text,
                engine: SttEngine::Groq,
                private: false,
                source: "fake/stt".into(),
            })
        }
    }

    pub struct UpperPolish;
    impl Polisher for UpperPolish {
        fn polish(&self, raw: &str) -> String {
            raw.to_uppercase()
        }
    }

    #[derive(Default)]
    pub struct FakePaster(pub Mutex<Vec<String>>);
    impl Paster for Arc<FakePaster> {
        fn paste(&self, text: &str) -> bool {
            self.0.lock().unwrap().push(text.to_owned());
            true
        }
    }

    /// An engine with fakes: STT returns `stt`, polish upper-cases, paste records.
    pub fn engine(recorder: FakeRecorder, stt: Result<&str, &str>) -> (Engine, Arc<FakePaster>) {
        let paster = Arc::new(FakePaster::default());
        let stt = FakeStt(stt.map(str::to_owned).map_err(str::to_owned));
        let engine = Engine::new(
            Box::new(recorder),
            Box::new(stt),
            Box::new(UpperPolish),
            Box::new(paster.clone()),
            250,
            None,
        );
        (engine, paster)
    }
}

#[cfg(test)]
mod tests {
    use super::fakes::*;
    use super::*;

    fn next_transcript_or_error(rx: &Receiver<Event>) -> Event {
        loop {
            let e = rx.recv_timeout(Duration::from_secs(2)).expect("event");
            if matches!(e, Event::Transcript { .. } | Event::Error { .. }) {
                return e;
            }
        }
    }

    fn wait_ready(engine: &Engine) {
        let deadline = Instant::now() + Duration::from_secs(2);
        while engine.state() != State::Ready && Instant::now() < deadline {
            std::thread::sleep(Duration::from_millis(5));
        }
        assert_eq!(engine.state(), State::Ready);
    }

    #[test]
    fn rewrite_pastes_and_saves_history_and_private_mode_never_calls_model() {
        struct Rewriter;
        impl Polisher for Rewriter {
            fn polish(&self, raw: &str) -> String {
                raw.into()
            }
            fn rewrite(&self, text: &str, _: &str) -> Result<String, String> {
                Ok(format!("rewritten {text}"))
            }
        }
        let path = std::env::temp_dir()
            .join(format!("scribe-rewrite-{}", std::process::id()))
            .join("history.jsonl");
        let _ = std::fs::remove_file(&path);
        let history = Arc::new(History::open(&path));
        let paster = Arc::new(FakePaster::default());
        let engine = Engine::new(
            Box::new(FakeRecorder::default()),
            Box::new(FakeStt(Ok(String::new()))),
            Box::new(Rewriter),
            Box::new(paster.clone()),
            250,
            Some(history.clone()),
        );
        let rx = engine.subscribe();
        let preset = crate::rewrite::Preset {
            name: "Shorter".into(),
            instruction: "Shorten".into(),
            description: None,
        };
        engine
            .rewrite("text".into(), preset.clone(), "app".into(), true, || true)
            .unwrap();
        assert!(matches!(next_transcript_or_error(&rx), Event::Error { .. }));
        assert!(paster.0.lock().unwrap().is_empty());
        engine
            .rewrite("text".into(), preset, "app".into(), false, || true)
            .unwrap();
        assert!(matches!(
            next_transcript_or_error(&rx),
            Event::Transcript { pasted: true, .. }
        ));
        wait_ready(&engine);
        assert_eq!(*paster.0.lock().unwrap(), ["rewritten text"]);
        let page = history.page(10, None, Some("rewrite"));
        assert_eq!(page.items[0].preset.as_deref(), Some("Shorter"));
        assert_eq!(page.items[0].raw_text, "text");
    }

    #[test]
    fn rewrite_goes_to_the_clipboard_when_the_window_is_gone() {
        struct Copier(Mutex<Vec<String>>);
        impl Paster for Arc<Copier> {
            fn paste(&self, _: &str) -> bool {
                panic!("must not paste into the wrong window")
            }
            fn copy(&self, text: &str) -> bool {
                self.0.lock().unwrap().push(text.to_owned());
                true
            }
        }
        struct Rewriter;
        impl Polisher for Rewriter {
            fn polish(&self, raw: &str) -> String {
                raw.into()
            }
            fn rewrite(&self, text: &str, _: &str) -> Result<String, String> {
                Ok(format!("rewritten {text}"))
            }
        }
        let copier = Arc::new(Copier(Mutex::default()));
        let engine = Engine::new(
            Box::new(FakeRecorder::default()),
            Box::new(FakeStt(Ok(String::new()))),
            Box::new(Rewriter),
            Box::new(copier.clone()),
            250,
            None,
        );
        let rx = engine.subscribe();
        let preset = crate::rewrite::Preset {
            name: "Shorter".into(),
            instruction: "Shorten".into(),
            description: None,
        };
        engine
            .rewrite("text".into(), preset, String::new(), false, || false)
            .unwrap();
        assert!(
            matches!(next_transcript_or_error(&rx), Event::Error { message, .. } if message.contains("clipboard"))
        );
        wait_ready(&engine);
        assert_eq!(*copier.0.lock().unwrap(), ["rewritten text"]);
    }

    #[test]
    fn rewrite_runs_while_dictation_records() {
        struct Slow;
        impl Polisher for Slow {
            fn polish(&self, raw: &str) -> String {
                raw.into()
            }
            fn rewrite(&self, text: &str, _: &str) -> Result<String, String> {
                std::thread::sleep(Duration::from_millis(100));
                Ok(format!("rewritten {text}"))
            }
        }
        let paster = Arc::new(FakePaster::default());
        let engine = Engine::new(
            Box::new(FakeRecorder::default()),
            Box::new(FakeStt(Ok("spoken".into()))),
            Box::new(Slow),
            Box::new(paster.clone()),
            250,
            None,
        );
        let rx = engine.subscribe();
        assert_eq!(engine.start(Mode::Toggle, None), Ok(State::Listening));
        let preset = crate::rewrite::Preset {
            name: "Shorter".into(),
            instruction: "Shorten".into(),
            description: None,
        };
        assert_eq!(
            engine.rewrite("text".into(), preset.clone(), String::new(), false, || true),
            Ok(State::Listening)
        );
        assert!(engine
            .rewrite("again".into(), preset, String::new(), false, || true)
            .is_err());
        assert!(matches!(
            next_transcript_or_error(&rx),
            Event::Transcript { pasted: true, .. }
        ));
        assert_eq!(engine.state(), State::Listening);
        assert_eq!(*paster.0.lock().unwrap(), ["rewritten text"]);
    }

    #[test]
    fn cancelled_rewrite_never_pastes_and_a_new_one_works() {
        struct Slow;
        impl Polisher for Slow {
            fn polish(&self, raw: &str) -> String {
                raw.into()
            }
            fn rewrite(&self, text: &str, _: &str) -> Result<String, String> {
                std::thread::sleep(Duration::from_millis(150));
                Ok(format!("rewritten {text}"))
            }
        }
        let paster = Arc::new(FakePaster::default());
        let engine = Engine::new(
            Box::new(FakeRecorder::default()),
            Box::new(FakeStt(Ok(String::new()))),
            Box::new(Slow),
            Box::new(paster.clone()),
            250,
            None,
        );
        let preset = crate::rewrite::Preset {
            name: "Shorter".into(),
            instruction: "Shorten".into(),
            description: None,
        };
        assert!(!engine.cancel_rewrite());
        engine
            .rewrite("old".into(), preset.clone(), String::new(), false, || true)
            .unwrap();
        assert!(engine.cancel_rewrite());
        assert!(!engine.rewriting());
        engine
            .rewrite("new".into(), preset, String::new(), false, || true)
            .unwrap();
        std::thread::sleep(Duration::from_millis(400));
        assert_eq!(*paster.0.lock().unwrap(), ["rewritten new"]);
        assert!(!engine.rewriting());
    }

    #[test]
    fn rewrite_failure_does_not_paste() {
        let (engine, paster) = engine(FakeRecorder::default(), Ok(""));
        let rx = engine.subscribe();
        let preset = crate::rewrite::Preset {
            name: "test".into(),
            instruction: "test".into(),
            description: None,
        };
        engine
            .rewrite("text".into(), preset, String::new(), false, || true)
            .unwrap();
        assert!(matches!(next_transcript_or_error(&rx), Event::Error { .. }));
        wait_ready(&engine);
        assert!(paster.0.lock().unwrap().is_empty());
    }

    fn history_engine(name: &str) -> (Engine, Arc<History>, std::path::PathBuf) {
        let dir =
            std::env::temp_dir().join(format!("scribe-eng-hist-{}-{name}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let path = dir.join("history.jsonl");
        let history = Arc::new(History::open(&path));
        let engine = Engine::new(
            Box::new(FakeRecorder {
                duration_ms: 1000,
                ..Default::default()
            }),
            Box::new(FakeStt(Ok("hello world".into()))),
            Box::new(UpperPolish),
            Box::new(Arc::new(FakePaster::default())),
            250,
            Some(history.clone()),
        );
        (engine, history, path)
    }

    #[test]
    fn a_take_every_provider_failed_is_kept_and_a_retry_saves_and_copies_it() {
        struct Flaky(AtomicBool);
        impl Transcriber for Flaky {
            fn transcribe(&self, _: &EncodedAudio) -> Result<Transcription, String> {
                if self.0.swap(false, Ordering::SeqCst) {
                    return Err("Could not reach Groq.".into());
                }
                Ok(Transcription {
                    text: "hello again".into(),
                    engine: SttEngine::Groq,
                    private: false,
                    source: "deepgram/nova-3".into(),
                })
            }
        }
        #[derive(Default)]
        struct Copies(Mutex<Vec<String>>);
        impl Paster for Arc<Copies> {
            fn paste(&self, _: &str) -> bool {
                false
            }
            fn copy(&self, text: &str) -> bool {
                self.0.lock().unwrap().push(text.to_owned());
                true
            }
        }
        let dir = std::env::temp_dir().join(format!("scribe-eng-retry-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let history = Arc::new(History::open(&dir.join("history.jsonl")));
        let copies = Arc::new(Copies::default());
        let engine = Engine::new(
            Box::new(FakeRecorder {
                duration_ms: 1000,
                ..Default::default()
            }),
            Box::new(Flaky(AtomicBool::new(true))),
            Box::new(UpperPolish),
            Box::new(copies.clone()),
            250,
            Some(history.clone()),
        )
        .with_failed_store(crate::failed::FailedStore::new(&dir.join("failed")));
        let store = crate::failed::FailedStore::new(&dir.join("failed"));
        assert_eq!(engine.retry(), Ok(None));
        let rx = engine.subscribe();
        engine.start(Mode::Toggle, None).unwrap();
        engine.stop(true).unwrap();
        match next_history_or_error(&rx) {
            Event::Error { code, message, .. } => {
                assert_eq!(code, "stt_error");
                assert!(message.contains("Retry it in Scribe"), "{message}");
            }
            e => panic!("{e:?}"),
        }
        wait_ready(&engine);
        assert_eq!(store.count(), 1);
        assert_eq!(engine.retry(), Ok(Some(State::Processing)));
        match next_history_or_error(&rx) {
            Event::History { item } => {
                assert_eq!(item.cleaned_text, "HELLO AGAIN");
                assert_eq!(item.stt, "deepgram/nova-3");
            }
            e => panic!("{e:?}"),
        }
        wait_ready(&engine);
        assert_eq!(store.count(), 0);
        assert_eq!(*copies.0.lock().unwrap(), ["HELLO AGAIN"]);
        let _ = std::fs::remove_dir_all(&dir);
    }

    fn next_history_or_error(rx: &Receiver<Event>) -> Event {
        loop {
            let e = rx.recv_timeout(Duration::from_secs(2)).expect("event");
            if matches!(e, Event::History { .. } | Event::Error { .. }) {
                return e;
            }
        }
    }

    #[test]
    fn a_transcript_is_saved_and_announced_as_history() {
        let (engine, history, _) = history_engine("saved");
        let rx = engine.subscribe();
        engine.start(Mode::Toggle, None).unwrap();
        engine.stop(false).unwrap();
        match next_history_or_error(&rx) {
            Event::History { item } => {
                assert_eq!(
                    (
                        item.mode.as_str(),
                        item.raw_text.as_str(),
                        item.cleaned_text.as_str()
                    ),
                    ("toggle", "hello world", "HELLO WORLD")
                );
                assert_eq!((item.words, item.pasted), (2, false));
                assert_eq!(item.private, Some(true));
                assert!(item.metrics.total_ms >= item.metrics.transcribe_ms);
                // The serving speech provider is saved with the line.
                assert_eq!(item.stt, "fake/stt");
            }
            e => panic!("{e:?}"),
        }
        wait_ready(&engine);
        assert_eq!(history.page(10, None, None).items.len(), 1);
    }

    #[test]
    fn the_app_in_front_at_start_is_saved_with_the_item() {
        let (engine, history, _) = history_engine("app");
        let engine = engine.with_foreground(|| "Code.exe".into());
        let rx = engine.subscribe();
        engine.start(Mode::Hold, None).unwrap();
        engine.stop(false).unwrap();
        match next_history_or_error(&rx) {
            Event::History { item } => assert_eq!(item.app, "Code.exe"),
            e => panic!("{e:?}"),
        }
        wait_ready(&engine);
        assert_eq!(history.page(1, None, None).items[0].app, "Code.exe");
    }

    #[test]
    fn a_failed_save_reports_store_error() {
        let (engine, _, path) = history_engine("fails");
        // A folder where the file should be makes the append fail.
        std::fs::create_dir_all(&path).unwrap();
        let rx = engine.subscribe();
        engine.start(Mode::Hold, None).unwrap();
        engine.stop(false).unwrap();
        match next_history_or_error(&rx) {
            Event::Error { code, .. } => assert_eq!(code, "store_error"),
            e => panic!("{e:?}"),
        }
        wait_ready(&engine);
    }

    #[test]
    fn happy_path_polishes_and_pastes() {
        let (engine, paster) = engine(
            FakeRecorder {
                duration_ms: 1000,
                ..Default::default()
            },
            Ok("hello world"),
        );
        let rx = engine.subscribe();
        assert_eq!(
            engine.start(Mode::Hold, Some(Instant::now())),
            Ok(State::Listening)
        );
        assert_eq!(engine.mode(), Some(Mode::Hold));
        assert_eq!(engine.stop(true), Ok(State::Processing));
        match next_transcript_or_error(&rx) {
            Event::Transcript {
                text,
                raw,
                pasted,
                duration_ms,
                ..
            } => {
                assert_eq!(
                    (text.as_str(), raw.as_str(), pasted, duration_ms),
                    ("HELLO WORLD", "hello world", true, 1000)
                );
            }
            e => panic!("{e:?}"),
        }
        assert_eq!(*paster.0.lock().unwrap(), vec!["HELLO WORLD"]);
        assert!(engine.last_hotkey_latency().is_some());
        wait_ready(&engine);
    }

    #[test]
    fn state_events_in_order() {
        let (engine, _) = engine(
            FakeRecorder {
                duration_ms: 1000,
                ..Default::default()
            },
            Ok("x"),
        );
        let rx = engine.subscribe();
        engine.start(Mode::Toggle, None).unwrap();
        engine.stop(false).unwrap();
        let states: Vec<State> =
            std::iter::from_fn(|| rx.recv_timeout(Duration::from_secs(2)).ok())
                .filter_map(|e| {
                    if let Event::State { state, .. } = e {
                        Some(state)
                    } else {
                        None
                    }
                })
                .take(3)
                .collect();
        assert_eq!(
            states,
            vec![State::Listening, State::Processing, State::Ready]
        );
    }

    #[test]
    fn wrong_state_is_rejected() {
        let (engine, _) = engine(
            FakeRecorder {
                duration_ms: 1000,
                ..Default::default()
            },
            Ok("x"),
        );
        assert_eq!(
            engine.stop(true),
            Err(EngineError::InvalidState(State::Ready))
        );
        engine.start(Mode::Hold, None).unwrap();
        assert_eq!(
            engine.start(Mode::Hold, None),
            Err(EngineError::InvalidState(State::Listening))
        );
    }

    #[test]
    fn mic_failure_reports_and_allows_retry() {
        let (engine, _) = engine(
            FakeRecorder {
                fail_start: true,
                ..Default::default()
            },
            Ok("x"),
        );
        let rx = engine.subscribe();
        assert_eq!(engine.start(Mode::Hold, None), Ok(State::MicError));
        let got: Vec<Event> = rx.try_iter().collect();
        assert!(got
            .iter()
            .any(|e| matches!(e, Event::Error { code, .. } if code == "mic_error")));
        assert_eq!(engine.start(Mode::Hold, None), Ok(State::MicError));
    }

    #[test]
    fn short_recording_is_dropped_without_stt() {
        let (engine, paster) = engine(
            FakeRecorder {
                duration_ms: 100,
                ..Default::default()
            },
            Ok("x"),
        );
        engine.start(Mode::Hold, None).unwrap();
        assert_eq!(engine.stop(true), Ok(State::Ready));
        assert!(paster.0.lock().unwrap().is_empty());
    }

    #[test]
    fn set_audio_changes_the_minimum_length_for_the_next_recording() {
        let (engine, paster) = engine(
            FakeRecorder {
                duration_ms: 300,
                ..Default::default()
            },
            Ok("x"),
        );
        engine.set_audio(&crate::config::AudioConfig {
            min_record_ms: 500,
            ..Default::default()
        });
        engine.start(Mode::Hold, None).unwrap();
        assert_eq!(engine.stop(true), Ok(State::Ready));
        assert!(paster.0.lock().unwrap().is_empty());
    }

    #[test]
    fn cancel_discards() {
        let (engine, paster) = engine(
            FakeRecorder {
                duration_ms: 1000,
                ..Default::default()
            },
            Ok("x"),
        );
        engine.start(Mode::Toggle, None).unwrap();
        engine.cancel();
        assert_eq!(engine.state(), State::Ready);
        assert!(paster.0.lock().unwrap().is_empty());
    }

    #[test]
    fn stt_failure_emits_error_and_returns_to_ready() {
        let (engine, paster) = engine(
            FakeRecorder {
                duration_ms: 1000,
                ..Default::default()
            },
            Err("401"),
        );
        let rx = engine.subscribe();
        engine.start(Mode::Hold, None).unwrap();
        engine.stop(true).unwrap();
        assert!(
            matches!(next_transcript_or_error(&rx), Event::Error { code, .. } if code == "stt_error")
        );
        assert!(paster.0.lock().unwrap().is_empty());
        wait_ready(&engine);
    }

    #[test]
    fn paste_false_does_not_paste() {
        let (engine, paster) = engine(
            FakeRecorder {
                duration_ms: 1000,
                ..Default::default()
            },
            Ok("x"),
        );
        let rx = engine.subscribe();
        engine.start(Mode::Hold, None).unwrap();
        engine.stop(false).unwrap();
        assert!(matches!(
            next_transcript_or_error(&rx),
            Event::Transcript { pasted: false, .. }
        ));
        assert!(paster.0.lock().unwrap().is_empty());
    }
}
