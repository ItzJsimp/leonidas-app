//! Speaker renames: in the transcript, the participant list and the notes. The names are kept
//! in the manifest so a new transcribe puts them back.

use serde_json::{json, Value};

/// Rename in segments (also inside "A + B" overlap keys).
fn rename_in_segments(transcript: &mut Value, old: &str, new: &str) {
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
}

/// Put the user's names back on a transcript the engine labelled again (new transcribe).
pub fn apply_renames(transcript: &mut Value, manifest: &Value) {
    for (old, new) in manifest["speaker_renames"]
        .as_object()
        .into_iter()
        .flatten()
    {
        if let Some(new) = new.as_str() {
            rename_in_segments(transcript, old, new);
        }
    }
}

/// Keep `old -> new` so a new transcribe can apply it. Earlier renames that ended at `old`
/// now end at `new`.
fn remember_rename(manifest: &mut Value, old: &str, new: &str) {
    if !manifest["speaker_renames"].is_object() {
        manifest["speaker_renames"] = json!({});
    }
    let Some(map) = manifest["speaker_renames"].as_object_mut() else {
        return;
    };
    for target in map.values_mut() {
        if target.as_str() == Some(old) {
            *target = Value::from(new);
        }
    }
    map.insert(old.to_owned(), Value::from(new));
    map.retain(|key, target| target.as_str() != Some(key.as_str()));
}

/// Only the engine's own labels are safe to replace in note text: "Me" and "Them" are also
/// plain words. The user can write the notes again for the rest.
pub(super) fn rename_in_note(note: &mut Value, old: &str, new: &str) {
    match note {
        Value::String(text) if old.starts_with("Speaker ") && text.contains(old) => {
            *text = text.replace(old, new);
        }
        Value::Array(items) => items.iter_mut().for_each(|v| rename_in_note(v, old, new)),
        Value::Object(map) => map.values_mut().for_each(|v| rename_in_note(v, old, new)),
        _ => {}
    }
}

/// Rename in segments and in participants, as Python did. Two speakers with one name become
/// one participant.
pub(super) fn rename_speaker(transcript: &mut Value, manifest: &mut Value, old: &str, new: &str) {
    rename_in_segments(transcript, old, new);
    remember_rename(manifest, old, new);
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
    let mut seen: Vec<String> = Vec::new();
    list.retain(|p| {
        let key = p["key"].as_str().unwrap_or_default().to_owned();
        !seen.contains(&key) && {
            seen.push(key);
            true
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::meetings::store::{read_json, write_json, Patch, Store};
    use std::collections::BTreeMap;

    #[test]
    fn same_name_merges_speakers_and_survives_a_new_transcribe() {
        let root = std::env::temp_dir().join(format!("scribe-rename-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        let store = Store::new(root.clone());
        let dir = store.create("m4", &json!({"id": "m4"})).unwrap();
        write_json(
            &dir.join("transcript.json"),
            &json!([{"speaker_key": "Speaker 1", "t0": 0.0, "t1": 1.0, "text": "a"},
                    {"speaker_key": "Speaker 2", "t0": 1.0, "t1": 2.0, "text": "b"}]),
        )
        .unwrap();
        write_json(
            &dir.join("manifest.json"),
            &json!({"id": "m4", "title": "Meeting", "started": "2026-10-01T10:00:00Z",
                    "participants": [{"key": "Speaker 1", "name": "Speaker 1"},
                                     {"key": "Speaker 2", "name": "Speaker 2"}]}),
        )
        .unwrap();
        write_json(
            &dir.join("note.json"),
            &json!({"title": "T", "action_items": [{"owner": "Speaker 2", "task": "Ask Me later"}]}),
        )
        .unwrap();
        let names = BTreeMap::from([
            ("Speaker 1".to_owned(), "Gersi".to_owned()),
            ("Speaker 2".to_owned(), "Gersi".to_owned()),
        ]);
        let out = store
            .patch(
                "m4",
                &Patch {
                    speakers: Some(names),
                    ..Patch::default()
                },
            )
            .unwrap();
        assert_eq!(out["people"], json!(["Gersi"]));
        assert_eq!(out["transcript"][1]["speaker_key"], "Gersi");
        let note = read_json(&dir.join("note.json")).unwrap();
        assert_eq!(note["action_items"][0]["owner"], "Gersi");
        assert_eq!(note["action_items"][0]["task"], "Ask Me later");
        // The engine labels the audio again: the user's names come back.
        let manifest = read_json(&dir.join("manifest.json")).unwrap();
        let mut fresh =
            json!([{"speaker_key": "Speaker 2 + Me", "t0": 0.0, "t1": 1.0, "text": "c"}]);
        apply_renames(&mut fresh, &manifest);
        assert_eq!(fresh[0]["speaker_key"], "Gersi + Me");
        let _ = std::fs::remove_dir_all(root);
    }
}
