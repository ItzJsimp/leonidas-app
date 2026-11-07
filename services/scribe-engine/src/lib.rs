//! Leonidas Scribe engine: hotkey, mic, speech-to-text, polish, paste.
//! The HTTP contract in `contract.md` is the only coupling to the app.

pub mod audio;
pub mod backup;
pub mod config;
pub mod contract;
pub mod credentials;
pub mod dictionary;
pub mod dictionary_sync;
pub mod engine;
pub mod errlog;
pub mod failed;
pub mod foreground;
pub mod groq;
pub mod history;
pub mod hotkeys;
pub mod http;
pub mod hud;
pub mod local_stt;
pub mod meetings;
pub mod paste;
pub mod polish;
pub mod rewrite;
pub mod settings;
pub mod suggestions;

pub use contract::*;
