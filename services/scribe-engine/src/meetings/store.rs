//! Meeting folders on disk. Slice S1.
//!
//! Two roots: the main root (`<config>/meetings`) and the read-only import root
//! (`<main>/python-import`, the copied Python Scribe meetings). A folder in the main root wins
//! over an import folder with the same id. An edit to an imported meeting first copies its JSON
//! files into the main root, so no file in the import root ever changes. Audio stays where it
//! is: `audio_dirs` looks in the main copy first, then in the import folder.

use serde::Deserialize;
use serde_json::{json, Value};
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

pub const IMPORT_DIR: &str = "python-import";
/// Audio in the main root is deleted this long after the meeting ends, unless pinned.
pub const AUDIO_KEEP_DAYS: i64 = 30;
const DAY_MS: i64 = 86_400_000;
/// Folders that hold audio chunks. `audio` is the Python Opus folder.
const AUDIO_SUBDIRS: [&str; 3] = ["me", "them", "audio"];

pub struct Store {
    main: PathBuf,
    import: PathBuf,
}

/// `PATCH /v1/meetings/{id}` body. Every field is optional.
#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Patch {
    pub title: Option<String>,
    /// Keep audio: true stops the 30-day audio delete.
    pub pinned: Option<bool>,
    /// Old speaker name to new name.
    pub speakers: Option<BTreeMap<String, String>>,
}

impl Store {
    pub fn new(main: PathBuf) -> Self {
        let import = main.join(IMPORT_DIR);
        Self { main, import }
    }

    pub fn main_root(&self) -> &Path {
        &self.main
    }

    /// A new, empty meeting folder in the main root.
    pub fn create(&self, id: &str, manifest: &Value) -> Result<PathBuf, String> {
        check_id(id)?;
        let dir = self.main.join(id);
        fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        write_json(&dir.join("manifest.json"), manifest)?;
        Ok(dir)
    }

    /// The folder that holds the newest JSON for `id`, and whether it is an import folder.
    pub fn locate(&self, id: &str) -> Option<(PathBuf, bool)> {
        check_id(id).ok()?;
        let main = self.main.join(id);
        if main.join("manifest.json").is_file() {
            return Some((main, false));
        }
        let import = self.import.join(id);
        import
            .join("manifest.json")
            .is_file()
            .then_some((import, true))
    }

    /// Newest first. Deleted meetings and folders without a manifest are skipped.
    pub fn list(&self) -> Vec<Value> {
        let mut ids: Vec<String> = [&self.main, &self.import]
            .iter()
            .filter_map(|root| fs::read_dir(root).ok())
            .flatten()
            .flatten()
            .filter(|e| e.path().join("manifest.json").is_file())
            .filter_map(|e| e.file_name().to_str().map(str::to_owned))
            .collect();
        ids.sort();
        ids.dedup();
        let mut items: Vec<Value> = ids.iter().filter_map(|id| self.summary(id)).collect();
        items.sort_by(|a, b| b["started"].as_str().cmp(&a["started"].as_str()));
        items
    }

    /// The list row for one meeting, or `None` when it is missing or deleted.
    pub fn summary(&self, id: &str) -> Option<Value> {
        let (dir, imported) = self.locate(id)?;
        let manifest = read_json(&dir.join("manifest.json"))?;
        if manifest["deleted"].as_bool() == Some(true) {
            return None;
        }
        let note = read_json(&dir.join("note.json")).unwrap_or(Value::Null);
        let has_transcript = read_json(&dir.join("transcript.json"))
            .and_then(|t| t.as_array().map(|a| !a.is_empty()))
            .unwrap_or(false);
        let started = manifest["started"].as_str().unwrap_or_default().to_owned();
        let ended = manifest["ended"].as_str().map(str::to_owned);
        let duration_ms = match (
            unix_ms_from_iso(&started),
            ended.as_deref().and_then(unix_ms_from_iso),
        ) {
            (Some(a), Some(b)) if b >= a => Some(b - a),
            _ => None,
        };
        let people: Vec<Value> = manifest["participants"]
            .as_array()
            .map(|list| {
                list.iter()
                    .filter_map(|p| p["name"].as_str())
                    .map(Value::from)
                    .collect()
            })
            .unwrap_or_default();
        let pinned = manifest["pinned"].as_bool().unwrap_or(false);
        let has_audio = self.audio_dirs(id).iter().any(|d| dir_has_files(d));
        let audio_deletes_at = match (
            imported,
            pinned,
            has_audio,
            ended.as_deref().and_then(unix_ms_from_iso),
        ) {
            (false, false, true, Some(end)) => {
                Some(crate::iso_from_unix_ms(end + AUDIO_KEEP_DAYS * DAY_MS))
            }
            _ => None,
        };
        let title = note["title"]
            .as_str()
            .filter(|t| !t.trim().is_empty())
            .or_else(|| manifest["title"].as_str())
            .unwrap_or(id);
        Some(json!({
            "id": id,
            "title": title,
            "started": started,
            "ended": ended,
            "durationMs": duration_ms,
            "state": manifest["state"].as_str().unwrap_or("done"),
            "app": manifest["source"]["app"],
            "people": people,
            "pinned": pinned,
            "imported": imported || self.import.join(id).is_dir(),
            "hasTranscript": has_transcript,
            "hasAudio": has_audio,
            "audioDeletesAt": audio_deletes_at,
            "notesState": manifest["notes_state"],
            "notesError": manifest["notes_error"],
            "template": manifest["template_id"].as_str().unwrap_or("default"),
        }))
    }

    /// The full meeting: summary fields plus manifest, transcript, note and folder.
    pub fn get(&self, id: &str) -> Option<Value> {
        let mut out = self.summary(id)?;
        let (dir, _) = self.locate(id)?;
        let read = |name: &str| read_json(&dir.join(name)).unwrap_or(Value::Null);
        out["manifest"] = read("manifest.json");
        out["transcript"] = match read("transcript.json") {
            Value::Array(a) => Value::Array(a),
            _ => json!([]),
        };
        out["note"] = read("note.json");
        out["folder"] = Value::from(dir.to_string_lossy().into_owned());
        Some(out)
    }

    /// The main-root folder for `id`, copying the import folder's JSON files first when needed.
    pub fn writable(&self, id: &str) -> Result<PathBuf, String> {
        let (dir, imported) = self.locate(id).ok_or_else(|| not_found(id))?;
        if !imported {
            return Ok(dir);
        }
        let target = self.main.join(id);
        fs::create_dir_all(&target).map_err(|e| e.to_string())?;
        for entry in fs::read_dir(&dir).map_err(|e| e.to_string())?.flatten() {
            let path = entry.path();
            let is_json = matches!(
                path.extension().and_then(|e| e.to_str()),
                Some("json" | "jsonl")
            );
            if path.is_file() && is_json {
                fs::copy(&path, target.join(entry.file_name())).map_err(|e| e.to_string())?;
            }
        }
        Ok(target)
    }

    /// Audio chunk folders, main copy first, then the import folder.
    pub fn audio_dirs(&self, id: &str) -> Vec<PathBuf> {
        [self.main.join(id), self.import.join(id)]
            .iter()
            .flat_map(|root| AUDIO_SUBDIRS.iter().map(move |s| root.join(s)))
            .filter(|d| d.is_dir())
            .collect()
    }

    pub fn patch(&self, id: &str, patch: &Patch) -> Result<Value, String> {
        let dir = self.writable(id)?;
        let mut manifest = read_json(&dir.join("manifest.json")).unwrap_or_else(|| json!({}));
        if let Some(title) = &patch.title {
            let title = title.trim();
            if title.is_empty() {
                return Err("A meeting title cannot be empty.".into());
            }
            manifest["title"] = Value::from(title);
            if let Some(mut note) = read_json(&dir.join("note.json")) {
                note["title"] = Value::from(title);
                write_json(&dir.join("note.json"), &note)?;
            }
        }
        if let Some(pinned) = patch.pinned {
            manifest["pinned"] = Value::from(pinned);
        }
        if let Some(names) = &patch.speakers {
            let mut transcript =
                read_json(&dir.join("transcript.json")).unwrap_or_else(|| json!([]));
            for (old, new) in names {
                let new = new.trim();
                if new.is_empty() {
                    return Err("A speaker name cannot be empty.".into());
                }
                rename_speaker(&mut transcript, &mut manifest, old, new);
            }
            write_json(&dir.join("transcript.json"), &transcript)?;
        }
        write_json(&dir.join("manifest.json"), &manifest)?;
        self.get(id).ok_or_else(|| not_found(id))
    }

    /// Main folders are removed. An imported meeting gets a tombstone manifest in the main root.
    pub fn delete(&self, id: &str) -> Result<(), String> {
        let (dir, imported) = self.locate(id).ok_or_else(|| not_found(id))?;
        if !imported && !self.import.join(id).is_dir() {
            return fs::remove_dir_all(&dir).map_err(|e| e.to_string());
        }
        let dir = self.writable(id)?;
        let mut manifest = read_json(&dir.join("manifest.json")).unwrap_or_else(|| json!({}));
        manifest["deleted"] = Value::from(true);
        write_json(&dir.join("manifest.json"), &manifest)
    }

    /// Delete audio older than `AUDIO_KEEP_DAYS` in the main root. Returns the ids it cleaned.
    pub fn sweep_audio(&self, now_ms: i64) -> Vec<String> {
        let Ok(entries) = fs::read_dir(&self.main) else {
            return Vec::new();
        };
        let mut cleaned = Vec::new();
        for entry in entries.flatten() {
            let dir = entry.path();
            let Some(mut manifest) = read_json(&dir.join("manifest.json")) else {
                continue;
            };
            let ended = manifest["ended"].as_str().and_then(unix_ms_from_iso);
            let due = ended.is_some_and(|end| now_ms >= end + AUDIO_KEEP_DAYS * DAY_MS);
            if !due || manifest["pinned"].as_bool() == Some(true) {
                continue;
            }
            let audio: Vec<PathBuf> = AUDIO_SUBDIRS
                .iter()
                .map(|s| dir.join(s))
                .filter(|d| d.is_dir())
                .collect();
            if audio.is_empty() {
                continue;
            }
            if audio.iter().all(|d| fs::remove_dir_all(d).is_ok()) {
                manifest["audio_deleted_at"] = Value::from(crate::iso_from_unix_ms(now_ms));
                if write_json(&dir.join("manifest.json"), &manifest).is_ok() {
                    cleaned.push(entry.file_name().to_string_lossy().into_owned());
                }
            }
        }
        cleaned
    }
}

/// Rename in segments (also inside "A + B" overlap keys) and in participants, as Python did.
fn rename_speaker(transcript: &mut Value, manifest: &mut Value, old: &str, new: &str) {
    for seg in transcript.as_array_mut().into_iter().flatten() {
        let Some(key) = seg["speaker_key"].as_str() else {
            continue;
        };
        if key.split(" + ").any(|p| p == old) {
            let renamed: Vec<&str> = key
                .split(" + ")
                .map(|p| if p == old { new } else { p })
                .collect();
            seg["speaker_key"] = Value::from(renamed.join(" + "));
        }
    }
    let participants = &mut manifest["participants"];
    if !participants.is_array() {
        *participants = json!([]);
    }
    let list = participants.as_array_mut().unwrap();
    let mut found = false;
    for p in list.iter_mut() {
        if p["name"].as_str() == Some(old) || p["key"].as_str() == Some(old) {
            p["name"] = Value::from(new);
            p["key"] = Value::from(new);
            found = true;
        }
    }
    if !found {
        list.push(json!({"key": new, "name": new}));
    }
}

/// Ids are folder names: no separators, no `..`, nothing hidden.
pub fn check_id(id: &str) -> Result<(), String> {
    let ok = !id.is_empty()
        && id.len() <= 120
        && !id.starts_with('.')
        && id != IMPORT_DIR
        && id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_');
    if ok {
        Ok(())
    } else {
        Err(format!("Invalid meeting id: {id}"))
    }
}

fn not_found(id: &str) -> String {
    format!("No meeting with id {id}.")
}

fn dir_has_files(dir: &Path) -> bool {
    fs::read_dir(dir)
        .map(|mut e| e.next().is_some())
        .unwrap_or(false)
}

pub fn read_json(path: &Path) -> Option<Value> {
    serde_json::from_str(&fs::read_to_string(path).ok()?).ok()
}

/// Write to a temp file, then rename, so a crash never leaves half a file.
pub fn write_json(path: &Path, value: &Value) -> Result<(), String> {
    let tmp = path.with_extension("tmp");
    let text = serde_json::to_string_pretty(value).map_err(|e| e.to_string())?;
    fs::write(&tmp, text).map_err(|e| e.to_string())?;
    fs::rename(&tmp, path).map_err(|e| e.to_string())
}

/// Parse `YYYY-MM-DDTHH:MM:SS[.frac][Z|+HH:MM|-HH:MM]` to Unix ms.
pub fn unix_ms_from_iso(text: &str) -> Option<i64> {
    let num = |s: &str| s.parse::<i64>().ok();
    let (date, rest) = text.split_once('T')?;
    let mut d = date.split('-');
    let (y, m, day) = (num(d.next()?)?, num(d.next()?)?, num(d.next()?)?);
    let (clock, offset_ms) = match rest.find(['Z', '+', '-']) {
        Some(i) => {
            let (clock, zone) = rest.split_at(i);
            let offset = if zone == "Z" {
                0
            } else {
                let sign = if zone.starts_with('-') { -1 } else { 1 };
                let (h, mm) = zone[1..].split_once(':')?;
                sign * (num(h)? * 60 + num(mm)?) * 60_000
            };
            (clock, offset)
        }
        None => (rest, 0),
    };
    let (hms, frac) = clock.split_once('.').unwrap_or((clock, ""));
    let mut t = hms.split(':');
    let (h, mi, s) = (num(t.next()?)?, num(t.next()?)?, num(t.next()?)?);
    let ms = if frac.is_empty() {
        0
    } else {
        num(&format!("{:0<3}", &frac[..frac.len().min(3)]))?
    };
    // Days-from-civil (Howard Hinnant).
    let y2 = if m <= 2 { y - 1 } else { y };
    let era = y2.div_euclid(400);
    let yoe = y2 - era * 400;
    let mp = if m > 2 { m - 3 } else { m + 9 };
    let doy = (153 * mp + 2) / 5 + day - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    let days = era * 146_097 + doe - 719_468;
    Some(days * DAY_MS + ((h * 60 + mi) * 60 + s) * 1000 + ms - offset_ms)
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;

    pub(crate) fn temp_root(name: &str) -> PathBuf {
        let dir =
            std::env::temp_dir().join(format!("scribe-meetings-{}-{name}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn meeting(root: &Path, id: &str, started: &str, ended: &str) -> PathBuf {
        let dir = root.join(id);
        fs::create_dir_all(dir.join("me")).unwrap();
        fs::write(dir.join("me").join("seg-00001.flac"), b"fLaC").unwrap();
        write_json(
            &dir.join("manifest.json"),
            &json!({"id": id, "title": "Meeting", "started": started, "ended": ended,
                    "source": {"app": "Discord"},
                    "participants": [{"key": "Jake", "name": "Jake"}, {"key": "vMobx", "name": "vMobx"}]}),
        )
        .unwrap();
        write_json(
            &dir.join("transcript.json"),
            &json!([{"speaker_key": "vMobx", "t0": 0.0, "t1": 1.0, "text": "hi"},
                    {"speaker_key": "Jake + vMobx", "t0": 1.0, "t1": 2.0, "text": "both"}]),
        )
        .unwrap();
        write_json(
            &dir.join("note.json"),
            &json!({"title": "Real title", "summary": ["a"]}),
        )
        .unwrap();
        dir
    }

    fn snapshot(dir: &Path) -> Vec<(String, Vec<u8>)> {
        let mut out: Vec<(String, Vec<u8>)> = fs::read_dir(dir)
            .unwrap()
            .flatten()
            .filter(|e| e.path().is_file())
            .map(|e| {
                (
                    e.file_name().to_string_lossy().into_owned(),
                    fs::read(e.path()).unwrap(),
                )
            })
            .collect();
        out.sort();
        out
    }

    #[test]
    fn iso_round_trip() {
        assert_eq!(unix_ms_from_iso("1970-01-01T00:00:00Z"), Some(0));
        let ms = unix_ms_from_iso("2026-10-15T09:45:42.061732+00:00").unwrap();
        assert_eq!(crate::iso_from_unix_ms(ms), "2026-10-15T09:45:42.061Z");
        assert_eq!(
            unix_ms_from_iso("2026-10-15T11:45:42+02:00"),
            unix_ms_from_iso("2026-10-15T09:45:42Z")
        );
        assert_eq!(unix_ms_from_iso("nonsense"), None);
    }

    #[test]
    fn list_merges_roots_main_wins_and_skips_strays() {
        let root = temp_root("list");
        let import = root.join(IMPORT_DIR);
        meeting(
            &import,
            "2026-10-01-a",
            "2026-10-01T10:00:00+00:00",
            "2026-10-01T10:30:00+00:00",
        );
        meeting(
            &import,
            "2026-10-02-b",
            "2026-10-02T10:00:00+00:00",
            "2026-10-02T10:05:00+00:00",
        );
        fs::create_dir_all(import.join("spike")).unwrap();
        let main_b = meeting(
            &root,
            "2026-10-02-b",
            "2026-10-02T10:00:00+00:00",
            "2026-10-02T10:05:00+00:00",
        );
        write_json(&main_b.join("note.json"), &json!({"title": "Edited"})).unwrap();
        let store = Store::new(root);
        let list = store.list();
        let ids: Vec<&str> = list.iter().map(|m| m["id"].as_str().unwrap()).collect();
        assert_eq!(ids, ["2026-10-02-b", "2026-10-01-a"]);
        assert_eq!(list[0]["title"], "Edited");
        assert_eq!(list[0]["imported"], true);
        assert_eq!(list[1]["durationMs"], 30 * 60 * 1000);
        assert_eq!(list[1]["people"], json!(["Jake", "vMobx"]));
        assert_eq!(list[1]["hasTranscript"], true);
        assert_eq!(
            list[1]["audioDeletesAt"],
            Value::Null,
            "imported audio is never deleted"
        );
    }

    #[test]
    fn edits_never_touch_the_import_folder() {
        let root = temp_root("cow");
        let import_dir = meeting(
            &root.join(IMPORT_DIR),
            "m1",
            "2026-10-01T10:00:00Z",
            "2026-10-01T10:30:00Z",
        );
        let before = snapshot(&import_dir);
        let store = Store::new(root.clone());
        let patch = Patch {
            title: Some("New name".into()),
            pinned: Some(true),
            speakers: Some(BTreeMap::from([("vMobx".to_owned(), "Mob".to_owned())])),
        };
        let out = store.patch("m1", &patch).unwrap();
        assert_eq!(snapshot(&import_dir), before);
        assert_eq!(out["title"], "New name");
        assert_eq!(out["pinned"], true);
        assert_eq!(out["transcript"][0]["speaker_key"], "Mob");
        assert_eq!(out["transcript"][1]["speaker_key"], "Jake + Mob");
        assert_eq!(out["people"], json!(["Jake", "Mob"]));
        // Audio is still found in the import folder.
        assert_eq!(store.audio_dirs("m1"), vec![import_dir.join("me")]);
        store.delete("m1").unwrap();
        assert!(store.list().is_empty());
        assert_eq!(snapshot(&import_dir), before);
    }

    #[test]
    fn delete_removes_a_main_meeting() {
        let root = temp_root("delete");
        meeting(&root, "m2", "2026-10-01T10:00:00Z", "2026-10-01T10:30:00Z");
        let store = Store::new(root.clone());
        store.delete("m2").unwrap();
        assert!(!root.join("m2").exists());
        assert!(store.delete("m2").is_err());
    }

    #[test]
    fn sweep_deletes_old_unpinned_audio_in_main_root_only() {
        let root = temp_root("sweep");
        let old = meeting(&root, "old", "2026-09-01T10:00:00Z", "2026-09-01T11:00:00Z");
        let kept = meeting(
            &root,
            "kept",
            "2026-09-01T10:00:00Z",
            "2026-09-01T11:00:00Z",
        );
        let fresh = meeting(
            &root,
            "fresh",
            "2026-10-20T10:00:00Z",
            "2026-10-20T11:00:00Z",
        );
        let imported = meeting(
            &root.join(IMPORT_DIR),
            "imp",
            "2026-08-01T10:00:00Z",
            "2026-08-01T11:00:00Z",
        );
        let mut m = read_json(&kept.join("manifest.json")).unwrap();
        m["pinned"] = json!(true);
        write_json(&kept.join("manifest.json"), &m).unwrap();
        let store = Store::new(root);
        let now = unix_ms_from_iso("2026-11-07T00:00:00Z").unwrap();
        assert_eq!(
            store.summary("fresh").unwrap()["audioDeletesAt"],
            "2026-11-19T11:00:00.000Z"
        );
        assert_eq!(store.sweep_audio(now), vec!["old".to_owned()]);
        assert!(!old.join("me").exists());
        assert!(read_json(&old.join("manifest.json")).unwrap()["audio_deleted_at"].is_string());
        assert!(
            kept.join("me").exists() && fresh.join("me").exists() && imported.join("me").exists()
        );
        assert_eq!(store.summary("old").unwrap()["hasTranscript"], true);
    }

    #[test]
    fn ids_cannot_escape_the_root() {
        for bad in ["", "..", "../x", "a/b", "a\\b", ".hidden", IMPORT_DIR] {
            assert!(check_id(bad).is_err(), "{bad}");
        }
        assert!(check_id("2026-10-09-1537-meeting-oct-9-3-37-pm").is_ok());
    }

    #[test]
    fn patch_rejects_empty_names() {
        let root = temp_root("empty");
        meeting(&root, "m3", "2026-10-01T10:00:00Z", "2026-10-01T10:30:00Z");
        let store = Store::new(root);
        let p = Patch {
            title: Some("  ".into()),
            ..Patch::default()
        };
        assert!(store.patch("m3", &p).is_err());
    }
}

/// Read-only check against the real import folder: `cargo test real_imports -- --ignored`.
#[cfg(test)]
mod real {
    #[test]
    #[ignore]
    fn real_imports() {
        let root = crate::config::Config::default_dir().join("meetings");
        let store = super::Store::new(root);
        let list = store.list();
        let with_text = list.iter().filter(|m| m["hasTranscript"] == true).count();
        for m in &list {
            assert!(store.get(m["id"].as_str().unwrap()).is_some());
        }
        println!(
            "listed {} meetings, {} with transcripts",
            list.len(),
            with_text
        );
    }
}
