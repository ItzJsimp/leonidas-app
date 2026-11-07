//! Meetings: record a call (mic plus system audio), transcribe it live, split speakers,
//! write notes, and keep it on disk. Nothing here runs until a meeting starts, so dictation
//! idle RAM and cold start do not change.

pub mod capture;
pub mod store;

use serde_json::{json, Value};
use std::path::PathBuf;
use std::sync::atomic::{AtomicI64, Ordering};
use store::{Patch, Store};

const SWEEP_EVERY_MS: i64 = 3_600_000;

/// The meetings half of the HTTP contract (v1.5). `http.rs` only reads the body and writes
/// the reply, so every route here is testable without a socket.
pub struct Meetings {
    store: Store,
    last_sweep_ms: AtomicI64,
}

/// A reply: HTTP status and a JSON body. `Value::Null` with 204 is an empty reply.
pub type Reply = (u16, Value);

pub fn fail(status: u16, code: &str, message: &str) -> Reply {
    (status, json!({ "error": code, "message": message }))
}

impl Meetings {
    pub fn new(root: PathBuf) -> Self {
        Self {
            store: Store::new(root),
            last_sweep_ms: AtomicI64::new(i64::MIN),
        }
    }

    pub fn store(&self) -> &Store {
        &self.store
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
            ("DELETE", [id]) => match self.store.locate(id) {
                None => fail(404, "not_found", "No meeting with this id."),
                Some(_) => match self.store.delete(id) {
                    Ok(()) => (204, Value::Null),
                    Err(message) => fail(500, "store_error", &message),
                },
            },
            (_, [] | [_]) => fail(
                405,
                "method_not_allowed",
                "This method is not allowed here.",
            ),
            _ => fail(404, "not_found", "No such meetings route."),
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
            self.store.sweep_audio(now);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::meetings::store::tests::temp_root;
    use crate::meetings::store::write_json;

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
}
