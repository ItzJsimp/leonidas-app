//! v1.2 `GET` and `PATCH /v1/settings`: the config file seen as 7 sections.
//!
//! A PATCH merges its values into one section, saves the whole file atomically, and tells
//! listeners which section changed. Keys never appear: only `{set: true|false}`.

use crate::config::{write_atomic, AudioConfig, Bindings, Config, HudConfig};
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use std::path::PathBuf;
use std::sync::{mpsc, Arc, Mutex, RwLock};

pub const SECTIONS: [&str; 7] = [
    "hotkeys",
    "audio",
    "transcription",
    "presets",
    "hud",
    "features",
    "goals",
];

/// The `transcription` section. `groqKey` is added on read and refused on write.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Transcription {
    private_mode: bool,
    polish_enabled: bool,
    polish_instructions: Option<String>,
    whisper_model: String,
    whisper_model_backup: String,
    polish_model: String,
    backup_polish_model: String,
}

impl Transcription {
    fn of(cfg: &Config) -> Self {
        Self {
            private_mode: cfg.private_mode,
            polish_enabled: cfg.polish.enabled,
            polish_instructions: cfg.polish.instructions.clone(),
            whisper_model: cfg.groq.whisper_model.clone(),
            whisper_model_backup: cfg.groq.whisper_model_backup.clone(),
            polish_model: cfg.groq.polish_model.clone(),
            backup_polish_model: cfg.groq.backup_polish_model.clone(),
        }
    }

    /// Writes the section into `cfg`. True when a model changed: the cloud client reads
    /// the models once at start, so that change needs a restart.
    fn store(self, cfg: &mut Config) -> bool {
        let g = &cfg.groq;
        let restart = g.whisper_model != self.whisper_model
            || g.whisper_model_backup != self.whisper_model_backup
            || g.polish_model != self.polish_model
            || g.backup_polish_model != self.backup_polish_model;
        cfg.private_mode = self.private_mode;
        cfg.polish.enabled = self.polish_enabled;
        cfg.polish.instructions = self.polish_instructions;
        cfg.groq.whisper_model = self.whisper_model;
        cfg.groq.whisper_model_backup = self.whisper_model_backup;
        cfg.groq.polish_model = self.polish_model;
        cfg.groq.backup_polish_model = self.backup_polish_model;
        restart
    }
}

#[derive(Debug, PartialEq, Eq)]
pub enum PatchError {
    BadRequest,
    Store,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PatchReply {
    pub section: String,
    pub values: Value,
    pub restart_required: bool,
}

pub struct Settings {
    path: PathBuf,
    config: RwLock<Arc<Config>>,
    /// Serializes PATCH so two saves never interleave.
    write: Mutex<()>,
    listeners: Mutex<Vec<mpsc::Sender<&'static str>>>,
}

impl Settings {
    pub fn new(path: PathBuf, config: Config) -> Self {
        Self {
            path,
            config: RwLock::new(Arc::new(config)),
            write: Mutex::new(()),
            listeners: Mutex::new(Vec::new()),
        }
    }

    pub fn current(&self) -> Arc<Config> {
        self.config
            .read()
            .unwrap_or_else(|e| e.into_inner())
            .clone()
    }

    /// Receives the name of each section after it is saved.
    pub fn subscribe(&self) -> mpsc::Receiver<&'static str> {
        let (tx, rx) = mpsc::channel();
        self.listeners
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .push(tx);
        rx
    }

    /// The `GET /v1/settings` reply.
    pub fn sections(&self, groq_key_set: bool) -> Value {
        let cfg = self.current();
        let sections: Map<String, Value> = SECTIONS
            .iter()
            .map(|name| (name.to_string(), section(&cfg, name, groq_key_set)))
            .collect();
        json!({ "sections": sections })
    }

    pub fn patch(
        &self,
        name: &str,
        values: &Map<String, Value>,
        groq_key_set: bool,
    ) -> Result<PatchReply, PatchError> {
        let name = *SECTIONS
            .iter()
            .find(|s| **s == name)
            .ok_or(PatchError::BadRequest)?;
        let _write = self.write.lock().unwrap_or_else(|e| e.into_inner());
        let mut cfg = Config::clone(&self.current());
        let restart = apply(&mut cfg, name, values)?;
        let bytes = serde_json::to_vec_pretty(&cfg).map_err(|_| PatchError::Store)?;
        write_atomic(&self.path, &bytes).map_err(|_| PatchError::Store)?;
        let reply = PatchReply {
            section: name.into(),
            values: section(&cfg, name, groq_key_set),
            restart_required: restart,
        };
        *self.config.write().unwrap_or_else(|e| e.into_inner()) = Arc::new(cfg);
        self.listeners
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .retain(|tx| tx.send(name).is_ok());
        Ok(reply)
    }
}

fn section(cfg: &Config, name: &str, groq_key_set: bool) -> Value {
    let value = match name {
        "hotkeys" => serde_json::to_value(&cfg.bindings),
        "audio" => serde_json::to_value(&cfg.audio),
        "transcription" => serde_json::to_value(Transcription::of(cfg)).map(|mut v| {
            v["groqKey"] = json!({ "set": groq_key_set });
            v
        }),
        "hud" => serde_json::to_value(&cfg.hud),
        "presets" => Ok(Value::Object(cfg.presets.clone())),
        "features" => Ok(Value::Object(cfg.features.clone())),
        "goals" => Ok(Value::Object(cfg.goals.clone())),
        _ => Ok(Value::Null),
    };
    value.unwrap_or(Value::Null)
}

/// Merges `values` into one section of `cfg`. Returns true when the change needs a restart.
fn apply(cfg: &mut Config, name: &str, values: &Map<String, Value>) -> Result<bool, PatchError> {
    let stored = match name {
        "presets" => Some(&mut cfg.presets),
        "features" => Some(&mut cfg.features),
        "goals" => Some(&mut cfg.goals),
        _ => None,
    };
    if let Some(stored) = stored {
        stored.extend(values.clone());
        return Ok(false);
    }
    // A typed section: only its own keys, with the right types.
    let Value::Object(mut merged) = section(cfg, name, false) else {
        return Err(PatchError::BadRequest);
    };
    merged.remove("groqKey");
    for (key, value) in values {
        if !merged.contains_key(key) {
            return Err(PatchError::BadRequest);
        }
        merged.insert(key.clone(), value.clone());
    }
    let merged = Value::Object(merged);
    let bad = |_| PatchError::BadRequest;
    match name {
        "hotkeys" => cfg.bindings = serde_json::from_value::<Bindings>(merged).map_err(bad)?,
        "audio" => cfg.audio = serde_json::from_value::<AudioConfig>(merged).map_err(bad)?,
        "hud" => {
            let hud = serde_json::from_value::<HudConfig>(merged).map_err(bad)?;
            let restart = hud != cfg.hud;
            cfg.hud = hud;
            return Ok(restart);
        }
        "transcription" => {
            let section = serde_json::from_value::<Transcription>(merged).map_err(bad)?;
            return Ok(section.store(cfg));
        }
        _ => return Err(PatchError::BadRequest),
    }
    Ok(false)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn patch_tells_listeners_and_a_failed_save_changes_nothing() {
        let dir = std::env::temp_dir().join(format!("scribe-settings-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let settings = Settings::new(dir.join("config.json"), Config::default());
        let changes = settings.subscribe();
        let values = json!({"enabled": false});
        let reply = settings
            .patch("hud", values.as_object().unwrap(), false)
            .unwrap();
        assert!(reply.restart_required);
        assert_eq!(changes.try_recv(), Ok("hud"));
        assert!(!settings.current().hud.enabled);

        // A folder in place of the file makes the save fail.
        let blocked = Settings::new(dir.clone(), Config::default());
        assert_eq!(
            blocked
                .patch("hud", values.as_object().unwrap(), false)
                .unwrap_err(),
            PatchError::Store
        );
        assert!(blocked.current().hud.enabled);
    }

    #[test]
    fn hotkeys_can_be_turned_off_and_on() {
        let dir = std::env::temp_dir().join(format!("scribe-hotkeys-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let settings = Settings::new(dir.join("config.json"), Config::default());
        let changes = settings.subscribe();
        assert!(settings.current().bindings.enabled);
        let off = json!({"enabled": false});
        settings
            .patch("hotkeys", off.as_object().unwrap(), false)
            .unwrap();
        assert_eq!(changes.try_recv(), Ok("hotkeys"));
        assert!(!settings.current().bindings.enabled);
        assert_eq!(
            settings.current().bindings.toggle,
            Bindings::default().toggle
        );
        let on = json!({"enabled": true});
        settings
            .patch("hotkeys", on.as_object().unwrap(), false)
            .unwrap();
        assert!(settings.current().bindings.enabled);
    }
}
