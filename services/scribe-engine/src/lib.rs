//! Leonidas Scribe engine: hotkey, mic, speech-to-text, polish, paste.
//! The HTTP contract in `contract.md` is the only coupling to the app.

pub mod audio;
pub mod config;
pub mod contract;
pub mod credentials;
pub mod dictionary;
pub mod engine;
pub mod foreground;
pub mod groq;
pub mod history;
pub mod hotkeys;
pub mod http;
pub mod hud;
pub mod local_stt;
pub mod paste;
pub mod polish;
pub mod rewrite;
pub mod settings;
pub mod suggestions;

pub use contract::*;
