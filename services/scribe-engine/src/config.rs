//! Engine settings. File: `%APPDATA%\Leonidas\scribe-engine\config.json`.
//! Every field has a default, so a missing file or a partial file is valid.

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Config {
    /// Loopback port. The contract default is 8766.
    pub port: u16,
    pub bindings: Bindings,
    pub audio: AudioConfig,
    pub groq: GroqConfig,
    pub polish: PolishConfig,
    /// Audio never leaves the device (local model only).
    pub private_mode: bool,
    pub hud: HudConfig,
    /// v1.2 settings the Leonidas UI owns. The engine stores them and never reads them.
    pub presets: serde_json::Map<String, serde_json::Value>,
    pub features: serde_json::Map<String, serde_json::Value>,
    pub goals: serde_json::Map<String, serde_json::Value>,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            port: 8766,
            bindings: Bindings::default(),
            audio: AudioConfig::default(),
            groq: GroqConfig::default(),
            polish: PolishConfig::default(),
            private_mode: false,
            hud: HudConfig::default(),
            presets: Default::default(),
            features: Default::default(),
            goals: Default::default(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct HudConfig {
    /// Show the floating pill while dictating.
    pub enabled: bool,
}

impl Default for HudConfig {
    fn default() -> Self {
        Self { enabled: true }
    }
}

/// Binding strings use the Python Scribe format: `"Ctrl + Shift + T"`, `"Mouse5"`, `"Escape"`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Bindings {
    /// Push to talk: record while held.
    pub hold: Vec<String>,
    /// Press once to start, again to stop.
    pub toggle: Vec<String>,
    /// Discard the current recording.
    pub cancel: Vec<String>,
    pub rewrite: Vec<String>,
}

impl Default for Bindings {
    fn default() -> Self {
        Self {
            hold: vec!["Ctrl + Shift + T".into()],
            toggle: vec!["Mouse5".into(), "Ctrl + Shift + Space".into()],
            cancel: vec!["Escape".into()],
            rewrite: vec!["Ctrl + Shift + A".into()],
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct AudioConfig {
    /// Input device name; `None` uses the system default.
    pub device: Option<String>,
    pub max_record_seconds: u32,
    /// Recordings shorter than this are dropped without a request.
    pub min_record_ms: u64,
}

impl Default for AudioConfig {
    fn default() -> Self {
        Self {
            device: None,
            max_record_seconds: 600,
            min_record_ms: 250,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct GroqConfig {
    pub base_url: String,
    pub whisper_model: String,
    pub whisper_model_backup: String,
    pub polish_model: String,
    pub backup_polish_model: String,
    /// Start the backup polish call when the primary has not answered in this time.
    pub hedge_ms: u64,
    pub transcribe_timeout_s: u64,
    pub polish_timeout_s: u64,
}

impl Default for GroqConfig {
    fn default() -> Self {
        Self {
            base_url: "https://api.groq.com/openai/v1".into(),
            whisper_model: "whisper-large-v3-turbo".into(),
            whisper_model_backup: "whisper-large-v3".into(),
            polish_model: "qwen/qwen3.8-27b".into(),
            backup_polish_model: "openai/gpt-oss-20b".into(),
            hedge_ms: 800,
            transcribe_timeout_s: 30,
            polish_timeout_s: 4,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct PolishConfig {
    pub enabled: bool,
    /// System prompt; `None` uses the built-in default in `polish.rs`.
    pub instructions: Option<String>,
    /// Python Scribe `dictionary.json` format; `None` uses `<config dir>/dictionary.json`.
    pub dictionary_path: Option<PathBuf>,
}

impl Default for PolishConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            instructions: None,
            dictionary_path: None,
        }
    }
}

impl Config {
    /// Polish sends the transcript text to the cloud, so private mode turns it off.
    pub fn effective_polish(&self) -> PolishConfig {
        PolishConfig {
            enabled: self.polish.enabled && !self.private_mode,
            ..self.polish.clone()
        }
    }

    /// `%APPDATA%\Leonidas\scribe-engine` (or `$HOME/.config/leonidas/scribe-engine`).
    pub fn default_dir() -> PathBuf {
        if let Some(app) = std::env::var_os("APPDATA") {
            return PathBuf::from(app).join("Leonidas").join("scribe-engine");
        }
        let home = std::env::var_os("HOME")
            .map(PathBuf::from)
            .unwrap_or_default();
        home.join(".config").join("leonidas").join("scribe-engine")
    }

    /// A missing file gives the defaults. A malformed file is an error, never a silent reset.
    pub fn load(path: &Path) -> Result<Self, String> {
        match std::fs::read_to_string(path) {
            Ok(text) => serde_json::from_str(&text).map_err(|e| format!("{}: {e}", path.display())),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(Self::default()),
            Err(e) => Err(format!("{}: {e}", path.display())),
        }
    }

    pub fn dictionary_path(&self, config_dir: &Path) -> PathBuf {
        self.polish
            .dictionary_path
            .clone()
            .unwrap_or_else(|| config_dir.join("dictionary.json"))
    }
}

/// Write a file so a reader sees the old or the new content, never a partial one:
/// a temp file next to it, then a rename over the old file.
pub(crate) fn write_atomic(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir)?;
    }
    let mut tmp = path.as_os_str().to_owned();
    tmp.push(".tmp");
    let tmp = PathBuf::from(tmp);
    std::fs::write(&tmp, bytes)?;
    std::fs::rename(&tmp, path).inspect_err(|_| {
        let _ = std::fs::remove_file(&tmp);
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn private_mode_turns_cloud_polish_off() {
        let mut c = Config::default();
        assert!(c.effective_polish().enabled);
        c.private_mode = true;
        assert!(!c.effective_polish().enabled);
    }

    #[test]
    fn partial_file_keeps_defaults() {
        let c: Config =
            serde_json::from_str(r#"{"port":8767,"bindings":{"hold":["Ctrl + Alt + Space"]}}"#)
                .unwrap();
        assert_eq!(c.port, 8767);
        assert_eq!(c.bindings.hold, vec!["Ctrl + Alt + Space"]);
        assert_eq!(c.bindings.cancel, vec!["Escape"]);
        assert_eq!(c.bindings.rewrite, vec!["Ctrl + Shift + A"]);
        assert_eq!(c.groq.hedge_ms, 800);
    }

    #[test]
    fn missing_file_is_default_and_bad_file_is_error() {
        let dir = std::env::temp_dir().join(format!("scribe-cfg-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        assert_eq!(
            Config::load(&dir.join("none.json")).unwrap(),
            Config::default()
        );
        let bad = dir.join("bad.json");
        std::fs::write(&bad, "{port:").unwrap();
        assert!(Config::load(&bad).is_err());
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn hud_is_on_by_default_and_can_be_turned_off() {
        assert!(Config::default().hud.enabled);
        let cfg: Config = serde_json::from_str(r#"{"hud":{"enabled":false}}"#).unwrap();
        assert!(!cfg.hud.enabled);
    }
}
