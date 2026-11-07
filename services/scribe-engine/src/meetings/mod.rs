//! Meetings: record a call (mic plus system audio), transcribe it live, split speakers,
//! write notes, and keep it on disk. Nothing here runs until a meeting starts, so dictation
//! idle RAM and cold start do not change.

pub mod capture;
pub mod notes;
pub mod session;
pub mod speakers;
pub mod store;

use serde_json::{json, Value};
use session::{Phase, Segmenter, Session, TrackOpener};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicI64, Ordering};
use std::sync::{Arc, Mutex};
use store::{read_json, write_json, Patch, Store};

const SWEEP_EVERY_MS: i64 = 3_600_000;

/// The meetings half of the HTTP contract (v1.5). `http.rs` only reads the body and writes
/// the reply, so every route here is testable without a socket.
pub struct Meetings {
    store: Store,
    last_sweep_ms: AtomicI64,
    speech: Arc<dyn Segmenter>,
    chat: Arc<dyn notes::Chat>,
    opener: TrackOpener,
    /// The live or the last finished session. One meeting records at a time.
    active: Mutex<Option<Session>>,
}

/// A reply: HTTP status and a JSON body. `Value::Null` with 204 is an empty reply.
pub type Reply = (u16, Value);

pub fn fail(status: u16, code: &str, message: &str) -> Reply {
    (status, json!({ "error": code, "message": message }))
}

/// Used until the app gives a speech provider: every chunk fails with a clear message.
struct NoSpeech;

impl Segmenter for NoSpeech {
    fn segments(
        &self,
        _: &crate::engine::EncodedAudio,
    ) -> Result<Vec<crate::groq::SpeechSegment>, String> {
        Err("No speech provider is set up.".into())
    }
}

/// `POST /v1/meetings/start` body.
#[derive(Debug, Default, serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct StartBody {
    title: Option<String>,
    /// The call app, for example `Discord`, when the app detected one.
    app: Option<String>,
    template: Option<String>,
}

impl Meetings {
    pub fn new(root: PathBuf) -> Self {
        Self {
            store: Store::new(root),
            last_sweep_ms: AtomicI64::new(i64::MIN),
            speech: Arc::new(NoSpeech),
            chat: Arc::new(NoChat),
            opener: session::device_opener(),
            active: Mutex::new(None),
        }
    }

    pub fn with_speech(mut self, speech: Arc<dyn Segmenter>) -> Self {
        self.speech = speech;
        self
    }

    pub fn with_chat(mut self, chat: Arc<dyn notes::Chat>) -> Self {
        self.chat = chat;
        self
    }

    /// Slow routes (Ask) that must not hold the single HTTP thread. `http.rs` runs the job on
    /// its own thread and sends the reply from there.
    pub fn deferred(
        &self,
        method: &str,
        path: &str,
        body: &Value,
    ) -> Option<Box<dyn FnOnce() -> Reply + Send>> {
        let rest = path.strip_prefix("/v1/meetings/")?;
        let (id, action) = rest.split_once('/')?;
        if method != "POST" || action != "ask" {
            return None;
        }
        let question = body["question"]
            .as_str()
            .map(str::trim)
            .unwrap_or_default()
            .to_owned();
        if question.is_empty() || question.len() > 2_000 {
            return Some(Box::new(|| {
                fail(400, "bad_request", "Type a question first.")
            }));
        }
        let segments: Vec<Value> = if id == "live" {
            match self.active.lock().unwrap().as_ref() {
                Some(s) => s.live.lock().unwrap().segments.clone(),
                None => {
                    return Some(Box::new(|| {
                        fail(409, "not_recording", "No meeting is recording.")
                    }))
                }
            }
        } else {
            match self.store.get(id) {
                Some(m) => m["transcript"].as_array().cloned().unwrap_or_default(),
                None => {
                    return Some(Box::new(|| {
                        fail(404, "not_found", "No meeting with this id.")
                    }))
                }
            }
        };
        let chat = self.chat.clone();
        Some(Box::new(move || {
            match notes::ask(chat.as_ref(), &segments, &question) {
                Ok(answer) => (200, json!({ "answer": answer })),
                Err(e) => fail(502, "provider_error", &e),
            }
        }))
    }

    pub fn with_opener(mut self, opener: TrackOpener) -> Self {
        self.opener = opener;
        self
    }

    pub fn store(&self) -> &Store {
        &self.store
    }

    /// True while a meeting records. The HUD reads it.
    pub fn recording(&self) -> bool {
        self.active
            .lock()
            .unwrap()
            .as_ref()
            .is_some_and(|s| s.phase() == Phase::Recording)
    }

    /// True for every path this module answers.
    pub fn owns(path: &str) -> bool {
        path == "/v1/meetings" || path.starts_with("/v1/meetings/")
    }

    pub fn handle(&self, method: &str, path: &str, body: Value) -> Reply {
        let rest = path
            .trim_start_matches("/v1/meetings")
            .trim_start_matches('/');
        let parts: Vec<&str> = rest.split('/').filter(|p| !p.is_empty()).collect();
        match (method, parts.as_slice()) {
            ("GET", []) => {
                self.sweep_if_due();
                (200, json!({ "items": self.store.list() }))
            }
            ("POST", ["start"]) => match serde_json::from_value::<StartBody>(normalize(body)) {
                Ok(start) => self.start(start),
                Err(_) => fail(400, "bad_request", "The start request is not valid."),
            },
            ("POST", ["stop"]) => self.stop(),
            ("GET", ["live"]) => self.live(),
            ("GET", ["templates"]) => (
                200,
                json!({ "items": notes::TEMPLATES.iter().map(|t| json!({"id": t.id, "name": t.name})).collect::<Vec<_>>() }),
            ),
            ("POST", [id, "summary"]) => {
                let template = body["template"].as_str().map(str::to_owned);
                self.summarize(id, template)
            }
            ("GET", [id]) => match self.store.get(id) {
                Some(meeting) => (200, meeting),
                None => fail(404, "not_found", "No meeting with this id."),
            },
            ("PATCH", [id]) => {
                let Ok(patch) = serde_json::from_value::<Patch>(body) else {
                    return fail(400, "bad_request", "The change is not valid.");
                };
                match self.store.locate(id) {
                    None => fail(404, "not_found", "No meeting with this id."),
                    Some(_) => match self.store.patch(id, &patch) {
                        Ok(meeting) => (200, meeting),
                        Err(message) => fail(400, "bad_request", &message),
                    },
                }
            }
            ("DELETE", [id]) => {
                if self.is_active(id) {
                    return fail(409, "recording", "Stop the meeting before you delete it.");
                }
                match self.store.locate(id) {
                    None => fail(404, "not_found", "No meeting with this id."),
                    Some(_) => match self.store.delete(id) {
                        Ok(()) => (204, Value::Null),
                        Err(message) => fail(500, "store_error", &message),
                    },
                }
            }
            (_, [] | [_]) => fail(
                405,
                "method_not_allowed",
                "This method is not allowed here.",
            ),
            _ => fail(404, "not_found", "No such meetings route."),
        }
    }

    fn is_active(&self, id: &str) -> bool {
        self.active
            .lock()
            .unwrap()
            .as_ref()
            .is_some_and(|s| s.id == id && s.phase() != Phase::Done)
    }

    fn start(&self, start: StartBody) -> Reply {
        let mut active = self.active.lock().unwrap();
        if active.as_ref().is_some_and(|s| s.phase() != Phase::Done) {
            return fail(409, "already_recording", "A meeting is already recording.");
        }
        if let Some(old) = active.take() {
            old.join();
        }
        let started = crate::now_iso();
        let id = self.new_id(&started);
        let app = start.app.filter(|a| !a.trim().is_empty());
        let manifest = json!({
            "id": id,
            "title": start.title.filter(|t| !t.trim().is_empty()).unwrap_or_else(|| "Meeting".into()),
            "started": started,
            "ended": null,
            "state": "recording",
            "source": { "kind": if app.is_some() { "app" } else { "device" }, "app": app },
            "participants": [{ "key": session::ME, "name": session::ME }],
            "template_id": start.template.unwrap_or_else(|| "default".into()),
            "pinned": false,
        });
        let dir = match self.store.create(&id, &manifest) {
            Ok(dir) => dir,
            Err(e) => return fail(500, "store_error", &e),
        };
        match Session::start(
            id.clone(),
            dir.clone(),
            &self.opener,
            self.speech.clone(),
            {
                let chat = self.chat.clone();
                Box::new(move |dir: &Path| {
                    finish(dir);
                    spawn_notes(dir.to_path_buf(), chat);
                })
            },
        ) {
            Ok(session) => {
                *active = Some(session);
                (200, json!({ "id": id }))
            }
            Err(e) => {
                let _ = std::fs::remove_dir_all(&dir);
                fail(409, "mic_error", &e)
            }
        }
    }

    fn stop(&self) -> Reply {
        let active = self.active.lock().unwrap();
        let Some(session) = active.as_ref().filter(|s| s.phase() == Phase::Recording) else {
            return fail(409, "not_recording", "No meeting is recording.");
        };
        if let Some(mut manifest) = read_json(&session.dir.join("manifest.json")) {
            manifest["ended"] = Value::from(crate::now_iso());
            manifest["state"] = Value::from("processing");
            let _ = write_json(&session.dir.join("manifest.json"), &manifest);
        }
        session.request_stop();
        (200, json!({ "id": session.id }))
    }

    fn live(&self) -> Reply {
        match self.active.lock().unwrap().as_ref() {
            Some(session) => {
                let mut out = session.live.lock().unwrap().to_json();
                out["recording"] = Value::from(session.phase() == Phase::Recording);
                (200, out)
            }
            None => (200, json!({ "recording": false, "phase": null })),
        }
    }

    /// `YYYY-MM-DD-HHMM-meeting` (UTC), with `-2`, `-3` when taken.
    fn new_id(&self, started: &str) -> String {
        let base = format!(
            "{}-{}{}-meeting",
            &started[..10],
            &started[11..13],
            &started[14..16]
        );
        (1..)
            .map(|n| {
                if n == 1 {
                    base.clone()
                } else {
                    format!("{base}-{n}")
                }
            })
            .find(|id| self.store.locate(id).is_none() && !self.store.main_root().join(id).exists())
            .unwrap()
    }

    /// Meetings left in `recording` by a crash get their transcript from the saved chunks.
    fn recover_stale(&self) {
        let active = self.active.lock().unwrap().as_ref().map(|s| s.id.clone());
        let Ok(entries) = std::fs::read_dir(self.store.main_root()) else {
            return;
        };
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().into_owned();
            if Some(&name) != active.as_ref() && session::recover(&entry.path()) {
                finish(&entry.path());
                spawn_notes(entry.path(), self.chat.clone());
            }
        }
    }

    fn sweep_if_due(&self) {
        let now = crate::unix_ms_now();
        let last = self.last_sweep_ms.load(Ordering::Relaxed);
        if now.saturating_sub(last) >= SWEEP_EVERY_MS
            && self
                .last_sweep_ms
                .compare_exchange(last, now, Ordering::Relaxed, Ordering::Relaxed)
                .is_ok()
        {
            self.recover_stale();
            self.store.sweep_audio(now);
        }
    }
}

/// An empty body means "no options".
fn normalize(body: Value) -> Value {
    if body.is_null() {
        json!({})
    } else {
        body
    }
}

/// `POST /v1/meetings/{id}/summary`: write the notes again, with a new template if given.
impl Meetings {
    fn summarize(&self, id: &str, template: Option<String>) -> Reply {
        if self.is_active(id) {
            return fail(
                409,
                "recording",
                "Notes are written when the meeting stops.",
            );
        }
        if let Some(t) = &template {
            if !notes::TEMPLATES.iter().any(|x| x.id == t) {
                return fail(400, "bad_request", "Unknown template.");
            }
        }
        if self.store.locate(id).is_none() {
            return fail(404, "not_found", "No meeting with this id.");
        }
        let dir = match self.store.writable(id) {
            Ok(dir) => dir,
            Err(e) => return fail(500, "store_error", &e),
        };
        if let (Some(t), Some(mut manifest)) = (template, read_json(&dir.join("manifest.json"))) {
            manifest["template_id"] = Value::from(t);
            let _ = write_json(&dir.join("manifest.json"), &manifest);
        }
        spawn_notes(dir, self.chat.clone());
        (202, json!({ "notesState": "working" }))
    }
}

/// Write `note.json` on a background thread. The manifest's `notes_state` shows progress:
/// `working`, `done` or `failed` (with `notes_error`).
fn spawn_notes(dir: PathBuf, chat: Arc<dyn notes::Chat>) {
    let set = |dir: &Path, state: &str, error: Option<&str>| {
        if let Some(mut m) = read_json(&dir.join("manifest.json")) {
            m["notes_state"] = Value::from(state);
            m["notes_error"] = error.map_or(Value::Null, Value::from);
            let _ = write_json(&dir.join("manifest.json"), &m);
        }
    };
    set(&dir, "working", None);
    let _ = std::thread::Builder::new()
        .name("meeting-notes".into())
        .spawn(move || {
            let manifest = read_json(&dir.join("manifest.json")).unwrap_or_default();
            let transcript = read_json(&dir.join("transcript.json")).unwrap_or_else(|| json!([]));
            let segments = transcript.as_array().cloned().unwrap_or_default();
            let template = manifest["template_id"].as_str().unwrap_or("default");
            let title = manifest["title"].as_str().unwrap_or("Meeting");
            match notes::generate(chat.as_ref(), &segments, template, title) {
                Ok(note) => {
                    let _ = write_json(&dir.join("note.json"), &note);
                    set(&dir, "done", None);
                }
                Err(e) => set(&dir, "failed", Some(&e)),
            }
        });
}

/// Used until the app gives a chat provider.
struct NoChat;

impl notes::Chat for NoChat {
    fn chat(&self, _: &str, _: &str, _: &str, _: bool) -> Result<String, notes::ChatError> {
        Err(notes::ChatError::Failed(
            "No chat provider is set up.".into(),
        ))
    }
    fn wait(&self) {}
}

/// After the transcript is written: participants and state.
fn finish(dir: &Path) {
    let Some(mut manifest) = read_json(&dir.join("manifest.json")) else {
        return;
    };
    let mut transcript = read_json(&dir.join("transcript.json")).unwrap_or_else(|| json!([]));
    label_speakers(dir, &manifest, &mut transcript);
    let _ = write_json(&dir.join("transcript.json"), &transcript);
    let mut names: Vec<String> = Vec::new();
    for seg in transcript.as_array().into_iter().flatten() {
        for name in seg["speaker_key"].as_str().unwrap_or_default().split(" + ") {
            if !name.is_empty() && !names.iter().any(|n| n == name) {
                names.push(name.to_owned());
            }
        }
    }
    if !names.is_empty() {
        manifest["participants"] = names
            .iter()
            .map(|n| json!({ "key": n, "name": n }))
            .collect();
    }
    if manifest["ended"].is_null() {
        manifest["ended"] = Value::from(crate::now_iso());
    }
    manifest["state"] = Value::from("done");
    let _ = write_json(&dir.join("manifest.json"), &manifest);
}

/// Discord names from `speaking.jsonl`, else the voice split from `them-voice.json`.
fn label_speakers(dir: &Path, manifest: &Value, transcript: &mut Value) {
    let Some(segments) = transcript.as_array_mut() else {
        return;
    };
    let windows = read_json(&dir.join("them-voice.json"))
        .map(|v| speakers::windows_from_json(&v))
        .unwrap_or_default();
    let events: Vec<Value> = std::fs::read_to_string(dir.join("speaking.jsonl"))
        .unwrap_or_default()
        .lines()
        .filter_map(|l| serde_json::from_str(l).ok())
        .collect();
    let end = segments
        .iter()
        .filter_map(|s| s["t1"].as_f64())
        .fold(0.0, f64::max) as f32;
    let local = manifest["discord"]["local_user_id"].as_str();
    let discord = speakers::discord_intervals(&events, local, end);
    speakers::label(segments, &windows, &discord);
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::meetings::store::tests::temp_root;
    use std::sync::atomic::AtomicUsize;

    #[test]
    fn routes_list_get_patch_delete() {
        let root = temp_root("routes");
        let m = Meetings::new(root.clone());
        m.store()
            .create(
                "m1",
                &json!({"id": "m1", "title": "Call", "started": "2026-11-01T10:00:00Z"}),
            )
            .unwrap();
        write_json(&root.join("m1").join("transcript.json"), &json!([])).unwrap();
        let (status, list) = m.handle("GET", "/v1/meetings", Value::Null);
        assert_eq!(status, 200);
        assert_eq!(list["items"][0]["id"], "m1");
        assert_eq!(
            m.handle("GET", "/v1/meetings/m1", Value::Null).1["title"],
            "Call"
        );
        assert_eq!(m.handle("GET", "/v1/meetings/nope", Value::Null).0, 404);
        assert_eq!(m.handle("GET", "/v1/meetings/..", Value::Null).0, 404);
        let (status, out) = m.handle("PATCH", "/v1/meetings/m1", json!({"title": "Renamed"}));
        assert_eq!((status, out["title"].as_str()), (200, Some("Renamed")));
        assert_eq!(
            m.handle("PATCH", "/v1/meetings/m1", json!({"bogus": 1})).0,
            400
        );
        assert_eq!(m.handle("PUT", "/v1/meetings/m1", Value::Null).0, 405);
        assert_eq!(m.handle("DELETE", "/v1/meetings/m1", Value::Null).0, 204);
        assert_eq!(m.handle("DELETE", "/v1/meetings/m1", Value::Null).0, 404);
    }

    pub(crate) fn wait_done(m: &Meetings) {
        for _ in 0..200 {
            if m.handle("GET", "/v1/meetings/live", Value::Null).1["phase"] == "done" {
                return;
            }
            std::thread::sleep(std::time::Duration::from_millis(50));
        }
        panic!("the meeting did not finish");
    }

    #[test]
    fn start_stop_live_produce_a_saved_meeting() {
        let root = temp_root("start-stop");
        let m = Meetings::new(root)
            .with_opener(session::tests::fake_opener(5.0, Some(5.0)))
            .with_speech(Arc::new(session::tests::FakeSegmenter {
                calls: AtomicUsize::new(0),
                fail_first: 0,
            }));
        assert_eq!(m.handle("POST", "/v1/meetings/stop", Value::Null).0, 409);
        let (status, started) = m.handle(
            "POST",
            "/v1/meetings/start",
            json!({"title": "Test call", "app": "Discord"}),
        );
        assert_eq!(status, 200, "{started}");
        let id = started["id"].as_str().unwrap().to_owned();
        assert!(m.recording());
        assert_eq!(m.handle("POST", "/v1/meetings/start", Value::Null).0, 409);
        assert_eq!(
            m.handle("DELETE", &format!("/v1/meetings/{id}"), Value::Null)
                .0,
            409
        );
        assert_eq!(
            m.handle("GET", "/v1/meetings/live", Value::Null).1["recording"],
            true
        );
        assert_eq!(m.handle("POST", "/v1/meetings/stop", Value::Null).0, 200);
        wait_done(&m);
        assert!(!m.recording());
        let meeting = m
            .handle("GET", &format!("/v1/meetings/{id}"), Value::Null)
            .1;
        assert_eq!(meeting["state"], "done");
        assert_eq!(meeting["title"], "Test call");
        assert_eq!(meeting["app"], "Discord");
        assert_eq!(meeting["people"], json!(["Me", "Them"]));
        assert_eq!(meeting["transcript"].as_array().unwrap().len(), 2);
        // A second meeting in the same minute gets its own id.
        let (_, again) = m.handle("POST", "/v1/meetings/start", Value::Null);
        assert_ne!(again["id"].as_str().unwrap(), id);
        m.handle("POST", "/v1/meetings/stop", Value::Null);
        wait_done(&m);
    }
}

/// Lists the Groq models this key can use: `cargo test groq_models -- --ignored --nocapture`.
#[cfg(test)]
mod real_groq {
    #[test]
    #[ignore]
    fn groq_models() {
        use crate::credentials::KeyStore;
        let key = std::env::var("GROQ_API_KEY")
            .ok()
            .or_else(|| crate::credentials::OsKeyStore::new().unwrap().get())
            .expect("a Groq key");
        let mut reply = ureq::get("https://api.groq.com/openai/v1/models")
            .header("Authorization", format!("Bearer {key}"))
            .call()
            .unwrap();
        let body: serde_json::Value =
            serde_json::from_str(&reply.body_mut().read_to_string().unwrap()).unwrap();
        for m in body["data"].as_array().unwrap() {
            println!("{} ctx={}", m["id"], m["context_window"]);
        }
    }
}
