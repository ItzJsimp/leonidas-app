// No console window in release builds; piped stdio from a parent still works.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

//! The always-on Scribe engine process. Leonidas Code supervises it over the contract.
//!
//! Flags: `--config <path>` (default `%APPDATA%\Leonidas\scribe-engine\config.json`),
//! `--accept-injected` (the latency bench sends synthetic hotkeys),
//! `--null-audio` (the CI bench has no microphone).

use scribe_engine::audio::{CpalRecorder, NullRecorder};
use scribe_engine::config::Config;
use scribe_engine::contract::{Event, Mode, State};
use scribe_engine::credentials::{KeyStore, OsKeyStore};
use scribe_engine::engine::{Engine, Recorder, Transcriber};
use scribe_engine::groq::GroqClient;
use scribe_engine::history::History;
use scribe_engine::hotkeys::{self, HotkeyEvent};
use scribe_engine::http;
#[cfg(windows)]
use scribe_engine::hud::window::Hud;
use scribe_engine::local_stt::{LocalModel, Router, WhisperLocal};
use scribe_engine::paste::ClipboardPaster;
use scribe_engine::polish::{GroqPolisher, SharedDictionary};
use scribe_engine::settings::Settings;
use scribe_engine::suggestions::Rejects;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{mpsc, Arc};
use std::time::{Duration, Instant};

fn main() {
    if let Err(message) = run() {
        eprintln!("scribe-engine: {message}");
        std::process::exit(1);
    }
}

fn run() -> Result<(), String> {
    let started = Instant::now();
    let mut args = std::env::args().skip(1);
    let mut config_path: Option<PathBuf> = None;
    let mut accept_injected = false;
    let mut null_audio = false;
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--config" => config_path = Some(args.next().ok_or("--config needs a path")?.into()),
            "--accept-injected" => accept_injected = true,
            "--null-audio" => null_audio = true,
            other => return Err(format!("unknown argument {other}")),
        }
    }
    let config_path = config_path.unwrap_or_else(|| Config::default_dir().join("config.json"));
    let config_dir = config_path
        .parent()
        .map(PathBuf::from)
        .unwrap_or_else(Config::default_dir);
    let cfg = Config::load(&config_path)?;

    let keys: Arc<dyn KeyStore> = Arc::new(OsKeyStore::new()?);
    let dictionary = Arc::new(SharedDictionary::new(cfg.dictionary_path(&config_dir)));
    let groq = GroqClient::new(&cfg.groq, keys.clone(), dictionary.clone());
    let settings = Arc::new(Settings::new(config_path.clone(), cfg.clone()));
    let polisher = Arc::new(GroqPolisher::new(groq.clone(), &cfg.effective_polish()));
    // Cloud first. The local model serves private mode and a cloud that cannot answer.
    let local = Arc::new(WhisperLocal::new(&config_dir.join("models")));
    if cfg.private_mode {
        local.ensure_downloaded();
    }
    let router = Arc::new(Router::new(
        Arc::new(groq.clone()),
        local.clone(),
        cfg.private_mode,
    ));
    let transcriber: Box<dyn Transcriber> = Box::new(router.clone());
    let (recorder, level): (Box<dyn Recorder>, _) = if null_audio {
        (Box::new(NullRecorder::default()), Default::default())
    } else {
        let recorder = CpalRecorder::new(&cfg.audio);
        let level = recorder.level();
        (Box::new(recorder), level)
    };
    let engine = Engine::new(
        recorder,
        transcriber,
        Box::new(polisher.clone()),
        Box::new(ClipboardPaster::new()),
        cfg.audio.min_record_ms,
        Some(Arc::new(History::open(&config_dir.join("history.jsonl")))),
    )
    .with_foreground(scribe_engine::foreground::foreground_app);

    let server = http::serve(
        engine.clone(),
        http::Services {
            keys,
            settings: settings.clone(),
            local: local.clone() as Arc<dyn LocalModel>,
            dictionary,
            devices: Arc::new(scribe_engine::audio::input_devices),
            rejects: Arc::new(Rejects::open(&config_dir.join("suggestions-rejected.json"))),
        },
        cfg.port,
    )?;

    // `active` lets Escape pass through to apps when no dictation is running.
    let active = Arc::new(AtomicBool::new(false));
    let (hotkey_tx, hotkey_rx) = mpsc::channel();
    let hooks = hotkeys::spawn(
        &cfg.bindings,
        active.clone(),
        accept_injected,
        hotkey_tx.clone(),
    )?;

    // v1.2: apply each saved settings section that can change without a restart.
    {
        let changes = settings.subscribe();
        let settings = settings.clone();
        let engine = engine.clone();
        let active = active.clone();
        let mut hooks = Some(hooks);
        std::thread::Builder::new()
            .name("scribe-settings".into())
            .spawn(move || {
                for section in changes {
                    let cfg = settings.current();
                    match section {
                        "audio" => engine.set_audio(&cfg.audio),
                        "transcription" => {
                            router.set_private_mode(cfg.private_mode);
                            polisher.update(&cfg.effective_polish());
                            if cfg.private_mode {
                                local.ensure_downloaded();
                            }
                        }
                        "hotkeys" => {
                            // Stop the old hooks first, so a key is never bound twice.
                            drop(hooks.take());
                            hooks = hotkeys::spawn(
                                &cfg.bindings,
                                active.clone(),
                                accept_injected,
                                hotkey_tx.clone(),
                            )
                            .inspect_err(|e| eprintln!("hotkeys: {e}"))
                            .ok();
                        }
                        _ => {}
                    }
                }
            })
            .map_err(|e| e.to_string())?;
    }

    #[cfg(windows)]
    // Dictation works without the pill: a HUD failure is logged, not fatal.
    let _hud = if cfg.hud.enabled {
        let trigger = engine.clone();
        Hud::spawn(engine.subscribe(), level, move || trigger.last_trigger_at())
            .inspect_err(|e| eprintln!("hud disabled: {e}"))
            .ok()
    } else {
        None
    };
    #[cfg(not(windows))]
    let _ = level;

    let events = engine.subscribe();
    let watcher = {
        let engine = engine.clone();
        let settings = settings.clone();
        std::thread::Builder::new()
            .name("scribe-events".into())
            .spawn(move || watch_events(engine, events, active, &settings))
            .map_err(|e| e.to_string())?
    };

    std::thread::Builder::new()
        .name("scribe-hotkey-actions".into())
        .spawn(move || {
            #[cfg(windows)]
            let picker_open = Arc::new(AtomicBool::new(false));
            for event in hotkey_rx {
                #[cfg(windows)]
                if matches!(event, HotkeyEvent::Rewrite(_)) {
                    if picker_open.swap(true, Ordering::AcqRel) {
                        continue;
                    }
                    let engine = engine.clone();
                    let settings = settings.clone();
                    let picker_open = picker_open.clone();
                    std::thread::spawn(move || {
                        struct Reset(Arc<AtomicBool>);
                        impl Drop for Reset {
                            fn drop(&mut self) {
                                self.0.store(false, Ordering::Release);
                            }
                        }
                        let _reset = Reset(picker_open);
                        if engine.state() != State::Ready {
                            return;
                        }
                        let hwnd = scribe_engine::paste::foreground_window();
                        let app = scribe_engine::foreground::foreground_app();
                        let Some(text) = scribe_engine::paste::copy_selection() else {
                            engine.report_error("Select text first, then press the rewrite key.");
                            return;
                        };
                        let presets = scribe_engine::rewrite::presets(&settings.current());
                        let names: Vec<String> = presets.iter().map(|p| p.name.clone()).collect();
                        if let Some(index) = scribe_engine::hud::picker::pick(&names) {
                            scribe_engine::paste::restore_focus(hwnd);
                            let _ = engine.rewrite(
                                text,
                                presets[index].clone(),
                                app,
                                settings.current().private_mode,
                                move || scribe_engine::paste::restore_focus(hwnd),
                            );
                        }
                    });
                    continue;
                }
                on_hotkey(&engine, event, || {
                    if !settings.current().private_mode {
                        groq.warm();
                    }
                });
            }
        })
        .map_err(|e| e.to_string())?;

    eprintln!(
        "ready port={} start_ms={}",
        server.port,
        started.elapsed().as_millis()
    );
    let _ = watcher.join();
    server.shutdown();
    Ok(())
}

fn on_hotkey(engine: &Engine, event: HotkeyEvent, warm: impl Fn()) {
    match event {
        HotkeyEvent::HoldDown(at) => {
            if engine.start(Mode::Hold, Some(at)) == Ok(State::Listening) {
                warm();
            }
        }
        HotkeyEvent::HoldUp(_) => {
            if engine.mode() == Some(Mode::Hold) {
                let _ = engine.stop(true);
            }
        }
        HotkeyEvent::Toggle(at) => match engine.state() {
            State::Ready | State::MicError => {
                if engine.start(Mode::Toggle, Some(at)) == Ok(State::Listening) {
                    warm();
                }
            }
            State::Listening => {
                let _ = engine.stop(true);
            }
            State::Processing => {}
        },
        HotkeyEvent::Cancel => engine.cancel(),
        HotkeyEvent::Rewrite(_) => {}
    }
}

/// Keeps `active` current, stops a recording at the length cap, and logs budget numbers.
fn watch_events(
    engine: Engine,
    events: mpsc::Receiver<Event>,
    active: Arc<AtomicBool>,
    settings: &Settings,
) {
    let mut listening_since: Option<Instant> = None;
    let mut processing_since: Option<Instant> = None;
    loop {
        match events.recv_timeout(Duration::from_millis(500)) {
            Ok(Event::State { state, .. }) => {
                active.store(
                    matches!(state, State::Listening | State::Processing),
                    Ordering::Relaxed,
                );
                let left_listening = listening_since.is_some() && state != State::Listening;
                if state == State::Processing {
                    processing_since = Some(Instant::now());
                }
                listening_since = (state == State::Listening).then(Instant::now);
                if left_listening {
                    if let Some(latency) = engine.last_hotkey_latency() {
                        eprintln!("hotkey_to_capture_ms={:.1}", latency.as_secs_f64() * 1000.0);
                    }
                }
            }
            Ok(Event::Transcript {
                duration_ms,
                pasted,
                ..
            }) => {
                // Release to paste: the user-felt dictation latency (perf metric scribe.dictation.total_ms).
                let total = processing_since
                    .take()
                    .map_or(0, |t| t.elapsed().as_millis());
                eprintln!("transcript duration_ms={duration_ms} pasted={pasted} dictation_total_ms={total}");
            }
            Ok(Event::Error { code, message, .. }) => {
                eprintln!("error code={code} message={message}")
            }
            Ok(Event::Partial { .. } | Event::History { .. }) => {}
            Err(mpsc::RecvTimeoutError::Timeout) => {}
            Err(mpsc::RecvTimeoutError::Disconnected) => return,
        }
        let max = Duration::from_secs(u64::from(settings.current().audio.max_record_seconds));
        if listening_since.is_some_and(|t| t.elapsed() >= max) {
            listening_since = None;
            let _ = engine.stop(true);
        }
    }
}
