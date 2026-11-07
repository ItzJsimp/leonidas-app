//! Meetings: record a call (mic plus system audio), transcribe it live, split speakers,
//! write notes, and keep it on disk. Nothing here runs until a meeting starts, so dictation
//! idle RAM and cold start do not change.

pub mod store;
