//! Loopback HTTP and SSE server for the contract. Slice S1.

use crate::audio::InputDevice;
use crate::contract::{
    now_iso, CredentialRequest, DictionaryBody, ErrorBody, StartRequest, StateReply, Status,
    StopRequest, API_VERSION, SERVICE,
};
use crate::credentials::KeyStore;
use crate::dictionary::{SharedDictionary, VOCABULARY_CAP};
use crate::engine::{Engine, EngineError};
use crate::local_stt::LocalModel;
use crate::settings::{PatchError, Settings};
use crate::suggestions::Rejects;
use serde::{de::DeserializeOwned, Serialize};
use std::io::{Read, Write};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{mpsc, Arc};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};
use tiny_http::{Header, Method, Request, Response, Server};

const MAX_BODY: usize = 64 * 1024;
const PING_INTERVAL: Duration = Duration::from_secs(15);

pub struct ServerHandle {
    pub port: u16,
    server: Arc<Server>,
    stopping: Arc<AtomicBool>,
    worker: JoinHandle<()>,
}

impl ServerHandle {
    /// Stop accepting requests and join the HTTP and SSE workers.
    /// An idle SSE worker can take up to one ping interval to exit.
    pub fn shutdown(self) {
        self.stopping.store(true, Ordering::Release);
        self.server.unblock();
        let _ = self.worker.join();
    }
}

/// What the routes read and write besides the engine.
pub struct Services {
    pub keys: Arc<dyn KeyStore>,
    pub settings: Arc<Settings>,
    pub local: Arc<dyn LocalModel>,
    pub dictionary: Arc<SharedDictionary>,
    pub devices: Arc<DeviceLister>,
    pub rejects: Arc<Rejects>,
    /// v1.5 meetings routes.
    pub meetings: Arc<crate::meetings::Meetings>,
}

/// Lists the input devices; tests pass a fake.
pub type DeviceLister = dyn Fn() -> Result<Vec<InputDevice>, String> + Send + Sync;

pub fn serve(engine: Engine, services: Services, port: u16) -> Result<ServerHandle, String> {
    serve_with_ping(engine, services, port, PING_INTERVAL)
}

/// `serve` with the SSE ping interval as a parameter, so tests do not wait 15 s.
fn serve_with_ping(
    engine: Engine,
    services: Services,
    port: u16,
    ping: Duration,
) -> Result<ServerHandle, String> {
    let server = Arc::new(Server::http(("127.0.0.1", port)).map_err(|e| e.to_string())?);
    let port = server.server_addr().to_ip().unwrap().port();
    let stopping = Arc::new(AtomicBool::new(false));
    let worker_server = server.clone();
    let worker_stopping = stopping.clone();
    let worker = thread::Builder::new()
        .name("scribe-http".into())
        .spawn(move || {
            let host = format!("127.0.0.1:{port}");
            let mut streams: Vec<JoinHandle<()>> = Vec::new();
            while !worker_stopping.load(Ordering::Acquire) {
                let request = match worker_server.recv() {
                    Ok(request) => request,
                    Err(_) => break,
                };
                // Release completed client threads without retaining their handles forever.
                let mut i = 0;
                while i < streams.len() {
                    if streams[i].is_finished() {
                        let _ = streams.swap_remove(i).join();
                    } else {
                        i += 1;
                    }
                }
                if !allowed(&request, &host) {
                    error(request, 403, "forbidden");
                } else if request.body_length().is_some_and(|len| len > MAX_BODY) {
                    error(request, 400, "bad_request");
                } else if request.url() == "/v1/events" && request.method() == &Method::Get {
                    let events = engine.subscribe();
                    let stopping = worker_stopping.clone();
                    if let Ok(worker) = thread::Builder::new()
                        .name("scribe-sse".into())
                        .spawn(move || stream_events(request, events, stopping, ping))
                    {
                        streams.push(worker);
                    }
                } else {
                    route(request, &engine, &services);
                }
            }
            for stream in streams {
                let _ = stream.join();
            }
        })
        .map_err(|e| e.to_string())?;
    Ok(ServerHandle {
        port,
        server,
        stopping,
        worker,
    })
}

fn allowed(request: &Request, host: &str) -> bool {
    let mut hosts = request.headers().iter().filter(|h| h.field.equiv("Host"));
    !request.headers().iter().any(|h| h.field.equiv("Origin"))
        && hosts.next().is_some_and(|h| h.value.as_str() == host)
        && hosts.next().is_none()
}

fn header(name: &str, value: &str) -> Header {
    Header::from_bytes(name, value).unwrap()
}

fn json(request: Request, status: u16, value: &impl Serialize) {
    let response = Response::from_data(serde_json::to_vec(value).unwrap())
        .with_status_code(status)
        .with_header(header("Content-Type", "application/json"))
        .with_header(header("Cache-Control", "no-store"));
    // Client disconnects do not change the engine state.
    let _ = request.respond(response);
}

fn error(request: Request, status: u16, code: &str) {
    json(request, status, &ErrorBody { error: code.into() });
}

fn empty(request: Request) {
    let _ = request.respond(Response::empty(204).with_header(header("Cache-Control", "no-store")));
}

fn body<T: DeserializeOwned>(request: &mut Request) -> Result<T, ()> {
    let mut bytes = Vec::new();
    request
        .as_reader()
        .take((MAX_BODY + 1) as u64)
        .read_to_end(&mut bytes)
        .map_err(|_| ())?;
    if bytes.len() > MAX_BODY {
        return Err(());
    }
    serde_json::from_slice(&bytes).map_err(|_| ())
}

fn state_reply(request: Request, state: Result<crate::contract::State, EngineError>) {
    match state {
        Ok(state) => json(request, 200, &StateReply::new(state)),
        Err(EngineError::InvalidState(_)) => error(request, 409, "invalid_state"),
    }
}

fn route(mut request: Request, engine: &Engine, services: &Services) {
    let keys = services.keys.as_ref();
    let url = request.url().to_owned();
    let (path, query) = url.split_once('?').unwrap_or((&url, ""));
    if path == "/v1/history" || path.starts_with("/v1/history/") {
        return history_route(request, engine, path, query);
    }
    if path == "/v1/dictionary" {
        return dictionary_route(request, services);
    }
    if path == "/v1/dictionary/suggestions" || path.starts_with("/v1/dictionary/suggestions/") {
        return suggestions_route(request, engine, services, path);
    }
    if path == "/v1/settings" {
        return settings_route(request, services);
    }
    if crate::meetings::Meetings::owns(path) {
        return meetings_route(request, services, path);
    }
    if path == "/v1/devices" {
        if request.method() != &Method::Get {
            return error(request, 405, "method_not_allowed");
        }
        return match (services.devices)() {
            Ok(inputs) => json(request, 200, &serde_json::json!({ "inputs": inputs })),
            Err(_) => error(request, 500, "mic_error"),
        };
    }
    match (request.url(), request.method()) {
        ("/v1/status", Method::Get) => {
            let status = Status {
                service: SERVICE.into(),
                api_version: API_VERSION,
                state: engine.state(),
                sampled_at: now_iso(),
                groq_key: groq_key_set(keys),
                private_mode: services.settings.current().private_mode,
                local_model: Some(services.local.status().as_str().into()),
            };
            json(request, 200, &status);
        }
        ("/v1/start", Method::Post) => match body::<StartRequest>(&mut request) {
            Ok(command) => state_reply(request, engine.start(command.mode, None)),
            Err(()) => error(request, 400, "bad_request"),
        },
        ("/v1/stop", Method::Post) => match body::<StopRequest>(&mut request) {
            Ok(command) => state_reply(request, engine.stop(command.paste)),
            Err(()) => error(request, 400, "bad_request"),
        },
        ("/v1/retry", Method::Post) => match engine.retry() {
            Ok(Some(state)) => json(request, 200, &StateReply::new(state)),
            Ok(None) => error(request, 404, "nothing_to_retry"),
            Err(EngineError::InvalidState(_)) => error(request, 409, "invalid_state"),
        },
        ("/v1/credentials/groq", Method::Put) => {
            match body::<CredentialRequest>(&mut request) {
                Ok(command) if !command.key.trim().is_empty() => {
                    if keys.set(&command.key).is_ok() {
                        empty(request);
                    } else {
                        // Store errors can contain secrets. Return only a fixed code.
                        error(request, 500, "store_error");
                    }
                }
                _ => error(request, 400, "bad_request"),
            }
        }
        ("/v1/credentials/groq", Method::Delete) => {
            if keys.delete().is_ok() {
                empty(request);
            } else {
                error(request, 500, "store_error");
            }
        }
        (
            "/v1/status"
            | "/v1/start"
            | "/v1/stop"
            | "/v1/retry"
            | "/v1/events"
            | "/v1/credentials/groq",
            _,
        ) => {
            error(request, 405, "method_not_allowed");
        }
        _ => error(request, 404, "not_found"),
    }
}

/// v1.5: every `/v1/meetings` route. The meetings module answers; this only moves bytes.
fn meetings_route(mut request: Request, services: &Services, path: &str) {
    let method = request.method().as_str().to_owned();
    let body = match method.as_str() {
        "GET" | "DELETE" => serde_json::Value::Null,
        _ => match raw_body(&mut request) {
            Ok(value) => value,
            Err(()) => return error(request, 400, "bad_request"),
        },
    };
    if let Some(job) = services.meetings.deferred(&method, path, &body) {
        let _ = thread::Builder::new()
            .name("meetings-ask".into())
            .spawn(move || {
                let (status, value) = job();
                json(request, status, &value);
            });
        return;
    }
    let (status, value) = services.meetings.handle(&method, path, body);
    if status == 204 {
        empty(request);
    } else {
        json(request, status, &value);
    }
}

/// A JSON body, or `Null` when the body is empty.
fn raw_body(request: &mut Request) -> Result<serde_json::Value, ()> {
    let mut bytes = Vec::new();
    request
        .as_reader()
        .take((MAX_BODY + 1) as u64)
        .read_to_end(&mut bytes)
        .map_err(|_| ())?;
    if bytes.len() > MAX_BODY {
        return Err(());
    }
    if bytes.iter().all(u8::is_ascii_whitespace) {
        return Ok(serde_json::Value::Null);
    }
    serde_json::from_slice(&bytes).map_err(|_| ())
}

/// v1.2: `GET /v1/history` and `DELETE /v1/history/{id}`.
fn history_route(request: Request, engine: &Engine, path: &str, query: &str) {
    let Some(history) = engine.history() else {
        return error(request, 404, "not_found");
    };
    if path == "/v1/history" || path == "/v1/history/public" {
        if request.method() != &Method::Get {
            return error(request, 405, "method_not_allowed");
        }
        let (mut limit, mut before, mut mode) = (Some(crate::history::DEFAULT_LIMIT), None, None);
        for (key, value) in query.split('&').filter_map(|pair| pair.split_once('=')) {
            match key {
                "limit" => limit = value.parse().ok().filter(|n| *n >= 1),
                "before" => before = Some(value),
                "mode" => mode = Some(value),
                _ => {}
            }
        }
        let Some(limit) = limit else {
            return error(request, 400, "bad_request");
        };
        let page = if path == "/v1/history/public" {
            history.page_public(limit, before, mode)
        } else {
            history.page(limit, before, mode)
        };
        return json(request, 200, &page);
    }
    let id = &path["/v1/history/".len()..];
    if id.is_empty() || id.contains('/') {
        return error(request, 404, "not_found");
    }
    if request.method() != &Method::Delete {
        return error(request, 405, "method_not_allowed");
    }
    match history.delete(id) {
        Ok(true) => json(request, 200, &serde_json::json!({ "deleted": true })),
        Ok(false) => error(request, 404, "not_found"),
        Err(_) => error(request, 500, "store_error"),
    }
}

/// A key in the OS store, or `GROQ_API_KEY` in the environment.
fn groq_key_set(keys: &dyn KeyStore) -> bool {
    keys.get().is_some() || std::env::var_os("GROQ_API_KEY").is_some_and(|key| !key.is_empty())
}

#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
struct PatchRequest {
    section: String,
    values: serde_json::Map<String, serde_json::Value>,
}

/// v1.2: `GET` and `PATCH /v1/settings`.
fn settings_route(mut request: Request, services: &Services) {
    let key_set = groq_key_set(services.keys.as_ref());
    match request.method() {
        Method::Get => json(request, 200, &services.settings.sections(key_set)),
        Method::Patch => {
            let Ok(patch) = body::<PatchRequest>(&mut request) else {
                return error(request, 400, "bad_request");
            };
            match services
                .settings
                .patch(&patch.section, &patch.values, key_set)
            {
                Ok(reply) => json(request, 200, &reply),
                Err(PatchError::BadRequest) => error(request, 400, "bad_request"),
                Err(PatchError::Store) => error(request, 500, "store_error"),
            }
        }
        _ => error(request, 405, "method_not_allowed"),
    }
}

/// v1.2: `GET /v1/dictionary/suggestions` and `DELETE /v1/dictionary/suggestions/{wrong}`.
fn suggestions_route(request: Request, engine: &Engine, services: &Services, path: &str) {
    if path == "/v1/dictionary/suggestions" {
        if request.method() != &Method::Get {
            return error(request, 405, "method_not_allowed");
        }
        let items = engine.history().map_or_else(Vec::new, |history| {
            let page = history.page(crate::history::MAX_LIMIT, None, None);
            let dictionary = services.dictionary.current();
            let keys: std::collections::HashSet<String> = dictionary
                .replacements
                .iter()
                .map(|(wrong, _)| wrong.to_lowercase())
                .collect();
            crate::suggestions::mine(
                page.items
                    .iter()
                    .map(|item| (item.raw_text.as_str(), item.cleaned_text.as_str())),
                |wrong| keys.contains(wrong) || services.rejects.contains(wrong),
            )
        });
        return json(request, 200, &serde_json::json!({ "items": items }));
    }
    let wrong = &path["/v1/dictionary/suggestions/".len()..];
    if wrong.is_empty() || wrong.contains('/') {
        return error(request, 404, "not_found");
    }
    if request.method() != &Method::Delete {
        return error(request, 405, "method_not_allowed");
    }
    let Some(wrong) = percent_decode(wrong).filter(|w| !w.trim().is_empty()) else {
        return error(request, 400, "bad_request");
    };
    match services.rejects.add(wrong.trim()) {
        Ok(()) => json(request, 200, &serde_json::json!({ "rejected": true })),
        Err(_) => error(request, 500, "store_error"),
    }
}

/// `%XX` escapes to UTF-8 text. `None` on a bad escape or bytes that are not UTF-8.
fn percent_decode(text: &str) -> Option<String> {
    let bytes = text.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' {
            let hex = std::str::from_utf8(bytes.get(i + 1..i + 3)?).ok()?;
            out.push(u8::from_str_radix(hex, 16).ok()?);
            i += 3;
        } else {
            out.push(bytes[i]);
            i += 1;
        }
    }
    String::from_utf8(out).ok()
}

/// v1.2: `GET` and `PUT /v1/dictionary`.
fn dictionary_route(mut request: Request, services: &Services) {
    match request.method() {
        Method::Get => json(request, 200, &services.dictionary.current().body()),
        Method::Put => {
            let valid = body::<DictionaryBody>(&mut request).ok().filter(|new| {
                new.vocabulary.len() <= VOCABULARY_CAP
                    && new.replacements.iter().all(|r| !r.wrong.trim().is_empty())
            });
            let Some(new) = valid else {
                return error(request, 400, "bad_request");
            };
            match services.dictionary.save(&new) {
                Ok(saved) => json(request, 200, &saved.body()),
                Err(_) => error(request, 500, "store_error"),
            }
        }
        _ => error(request, 405, "method_not_allowed"),
    }
}

fn stream_events(
    request: Request,
    events: mpsc::Receiver<crate::contract::Event>,
    stopping: Arc<AtomicBool>,
    ping: Duration,
) {
    let mut writer = request.into_writer();
    if writer
        .write_all(b"HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n")
        .and_then(|()| writer.flush())
        .is_err()
    {
        return;
    }
    let mut next_ping = Instant::now() + ping;
    while !stopping.load(Ordering::Acquire) {
        if Instant::now() >= next_ping {
            if writer
                .write_all(b": ping\n\n")
                .and_then(|()| writer.flush())
                .is_err()
            {
                break;
            }
            next_ping = Instant::now() + ping;
        }
        let result = match events.recv_timeout(next_ping.saturating_duration_since(Instant::now()))
        {
            Ok(event) => {
                let mut value = serde_json::to_value(event).unwrap();
                value["service"] = SERVICE.into();
                value["apiVersion"] = API_VERSION.into();
                writeln!(writer, "data: {value}\n")
            }
            Err(mpsc::RecvTimeoutError::Timeout) => continue,
            Err(mpsc::RecvTimeoutError::Disconnected) => break,
        };
        if result.and_then(|()| writer.flush()).is_err() {
            break;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::contract::{Event, State};
    use crate::credentials::{KeyStore, MemoryKeyStore};
    use crate::engine::fakes::{engine, FakePaster, FakeRecorder, FakeStt, UpperPolish};
    use serde_json::{json, Value};
    use std::io::{BufRead, BufReader};
    use std::net::{TcpListener, TcpStream};

    const TEST_PING: Duration = Duration::from_millis(50);

    struct NoLocal;

    impl LocalModel for NoLocal {
        fn transcribe(&self, _: &[f32]) -> Result<String, String> {
            Err("no local model in this test".into())
        }
        fn status(&self) -> crate::local_stt::ModelStatus {
            crate::local_stt::ModelStatus::Absent
        }
    }

    fn test_services(keys: Arc<dyn KeyStore>) -> Services {
        let cfg = crate::config::Config {
            private_mode: true,
            ..Default::default()
        };
        Services {
            keys,
            settings: Arc::new(Settings::new("none-config.json".into(), cfg)),
            local: Arc::new(NoLocal),
            dictionary: Arc::new(SharedDictionary::new(std::path::PathBuf::from("none.json"))),
            devices: Arc::new(|| Ok(Vec::new())),
            rejects: Arc::new(Rejects::open(std::path::Path::new("none-rejects.json"))),
            // A folder that never exists: the meetings list is empty and nothing is written.
            meetings: Arc::new(crate::meetings::Meetings::new(
                std::env::temp_dir().join("scribe-http-no-meetings"),
            )),
        }
    }

    struct TestServer(Option<ServerHandle>);

    impl TestServer {
        fn new() -> Self {
            Self::with_keys(Arc::new(MemoryKeyStore::default()))
        }

        fn with_keys(keys: Arc<dyn KeyStore>) -> Self {
            let (engine, _) = engine(
                FakeRecorder {
                    duration_ms: 1000,
                    ..Default::default()
                },
                Ok("hello"),
            );
            Self(Some(
                serve_with_ping(engine, test_services(keys), 0, TEST_PING).unwrap(),
            ))
        }

        /// A server whose engine keeps a history seeded with `d1` (hold), `d2` (toggle), `d3` (hold).
        fn with_history(name: &str) -> Self {
            let dir = std::env::temp_dir()
                .join(format!("scribe-http-hist-{}-{name}", std::process::id()));
            let _ = std::fs::remove_dir_all(&dir);
            let history = Arc::new(crate::history::History::open(&dir.join("history.jsonl")));
            for (ms, mode) in [(1, "hold"), (2, "toggle"), (3, "hold")] {
                history
                    .add(crate::history::NewItem {
                        preset: None,
                        stt: String::new(),
                        polish: String::new(),
                        at: crate::contract::iso_from_unix_ms(ms),
                        mode: mode.into(),
                        app: String::new(),
                        raw_text: "hi".into(),
                        cleaned_text: "Hi.".into(),
                        metrics: Default::default(),
                        pasted: false,
                        private: false,
                        at_ms: ms,
                    })
                    .unwrap();
            }
            let engine = Engine::new(
                Box::new(FakeRecorder::default()),
                Box::new(FakeStt(Ok("hello".into()))),
                Box::new(UpperPolish),
                Box::new(Arc::new(FakePaster::default())),
                250,
                Some(history),
            );
            let keys: Arc<dyn KeyStore> = Arc::new(MemoryKeyStore::default());
            Self(Some(
                serve_with_ping(engine, test_services(keys), 0, TEST_PING).unwrap(),
            ))
        }

        /// A server with its own services, for the v1.2 file-backed routes.
        fn with_services(services: Services) -> Self {
            let (engine, _) = engine(FakeRecorder::default(), Ok("hello"));
            Self(Some(
                serve_with_ping(engine, services, 0, TEST_PING).unwrap(),
            ))
        }

        fn port(&self) -> u16 {
            self.0.as_ref().unwrap().port
        }

        fn connect(&self) -> TcpStream {
            let stream = TcpStream::connect(("127.0.0.1", self.port())).unwrap();
            stream
                .set_read_timeout(Some(Duration::from_secs(20)))
                .unwrap();
            stream
                .set_write_timeout(Some(Duration::from_secs(2)))
                .unwrap();
            stream
        }

        fn request(&self, method: &str, path: &str, body: &str) -> Reply {
            self.raw(&format!(
                "{method} {path} HTTP/1.1\r\nHost: 127.0.0.1:{}\r\nConnection: close\r\nContent-Length: {}\r\n\r\n{body}",
                self.port(), body.len(),
            ))
        }

        fn raw(&self, request: &str) -> Reply {
            let mut stream = self.connect();
            stream.write_all(request.as_bytes()).unwrap();
            let mut response = String::new();
            stream.read_to_string(&mut response).unwrap();
            let (headers, body) = response.split_once("\r\n\r\n").unwrap();
            let status = headers.split_whitespace().nth(1).unwrap().parse().unwrap();
            let headers = headers.to_ascii_lowercase();
            assert!(headers.contains("cache-control: no-store"));
            if status == 204 {
                assert!(body.is_empty());
                assert!(!headers.contains("content-type:"));
            } else {
                assert!(headers.contains("content-type: application/json"));
            }
            Reply {
                status,
                body: if body.is_empty() {
                    Value::Null
                } else {
                    serde_json::from_str(body).unwrap()
                },
            }
        }
    }

    impl Drop for TestServer {
        fn drop(&mut self) {
            self.0.take().unwrap().shutdown();
        }
    }

    struct Reply {
        status: u16,
        body: Value,
    }

    impl Reply {
        fn error(&self, status: u16, code: &str) {
            assert_eq!(self.status, status);
            assert_eq!(self.body, json!({"error": code}));
        }
    }

    #[test]
    fn status_and_credentials() {
        let server = TestServer::new();
        let env_key = std::env::var_os("GROQ_API_KEY").is_some_and(|key| !key.is_empty());
        let reply = server.request("GET", "/v1/status", "");
        assert_eq!(reply.status, 200);
        let status: Status = serde_json::from_value(reply.body).unwrap();
        assert_eq!(status.service, SERVICE);
        assert_eq!(status.api_version, API_VERSION);
        assert_eq!(status.state, State::Ready);
        assert_eq!(status.sampled_at.len(), 24);
        assert!(status.sampled_at.ends_with('Z'));
        assert!(status.private_mode);
        assert_eq!(status.groq_key, env_key);
        assert_eq!(
            server
                .request("PUT", "/v1/credentials/groq", r#"{"key":"test-key"}"#)
                .status,
            204
        );
        let status = server.request("GET", "/v1/status", "").body;
        assert_eq!(status["groqKey"], true);
        assert!(!status.to_string().contains("test-key"));
        for _ in 0..2 {
            assert_eq!(
                server.request("DELETE", "/v1/credentials/groq", "").status,
                204
            );
            assert_eq!(
                server.request("GET", "/v1/status", "").body["groqKey"],
                env_key
            );
        }
    }

    struct FailingStore;

    impl KeyStore for FailingStore {
        fn get(&self) -> Option<String> {
            None
        }
        fn set(&self, _key: &str) -> Result<(), String> {
            Err("secret store detail".into())
        }
        fn delete(&self) -> Result<(), String> {
            Err("secret store detail".into())
        }
    }

    #[test]
    fn store_failure_returns_fixed_code() {
        let server = TestServer::with_keys(Arc::new(FailingStore));
        server
            .request("PUT", "/v1/credentials/groq", r#"{"key":"test-key"}"#)
            .error(500, "store_error");
        server
            .request("DELETE", "/v1/credentials/groq", "")
            .error(500, "store_error");
    }

    #[test]
    fn start_then_stop() {
        let server = TestServer::new();
        for (path, command, state) in [
            ("/v1/start", r#"{"mode":"hold"}"#, State::Listening),
            ("/v1/stop", r#"{"paste":true}"#, State::Processing),
        ] {
            let reply = server.request("POST", path, command);
            assert_eq!(reply.status, 200);
            assert_eq!(
                serde_json::from_value::<StateReply>(reply.body).unwrap(),
                StateReply::new(state)
            );
        }
    }

    #[test]
    fn invalid_state() {
        let server = TestServer::new();
        server
            .request("POST", "/v1/stop", r#"{"paste":false}"#)
            .error(409, "invalid_state");
        assert_eq!(
            server
                .request("POST", "/v1/start", r#"{"mode":"toggle"}"#)
                .status,
            200
        );
        server
            .request("POST", "/v1/start", r#"{"mode":"hold"}"#)
            .error(409, "invalid_state");
    }

    #[test]
    fn origin_is_forbidden_before_routing() {
        let server = TestServer::new();
        for origin in ["https://example.com", "null", ""] {
            server.raw(&format!(
                "GET /unknown HTTP/1.1\r\nHost: 127.0.0.1:{}\r\noRiGiN: {origin}\r\nConnection: close\r\n\r\n", server.port(),
            )).error(403, "forbidden");
        }
    }

    #[test]
    fn wrong_or_missing_host_is_forbidden() {
        let server = TestServer::new();
        for host in [
            format!("localhost:{}", server.port()),
            "127.0.0.1:1".into(),
            String::new(),
        ] {
            server
                .raw(&format!(
                    "GET /v1/status HTTP/1.1\r\nHost: {host}\r\nConnection: close\r\n\r\n",
                ))
                .error(403, "forbidden");
        }
        server
            .raw("GET /v1/status HTTP/1.1\r\nConnection: close\r\n\r\n")
            .error(403, "forbidden");
    }

    #[test]
    fn unknown_path() {
        TestServer::new()
            .request("GET", "/unknown", "")
            .error(404, "not_found");
    }

    #[test]
    fn wrong_methods() {
        let server = TestServer::new();
        for path in [
            "/v1/status",
            "/v1/start",
            "/v1/stop",
            "/v1/events",
            "/v1/credentials/groq",
        ] {
            server
                .request("PATCH", path, "")
                .error(405, "method_not_allowed");
        }
    }

    #[test]
    fn bad_json_and_missing_fields() {
        let server = TestServer::new();
        for (path, command) in [
            ("/v1/start", "{"),
            ("/v1/start", "{}"),
            ("/v1/start", r#"{"mode":"other"}"#),
            ("/v1/stop", "{}"),
            ("/v1/stop", r#"{"paste":"true"}"#),
        ] {
            server
                .request("POST", path, command)
                .error(400, "bad_request");
        }
    }

    #[test]
    fn empty_or_missing_key() {
        let server = TestServer::new();
        for command in [r#"{"key":""}"#, "{}", "null", "{"] {
            server
                .request("PUT", "/v1/credentials/groq", command)
                .error(400, "bad_request");
        }
    }

    #[test]
    fn oversized_body() {
        let server = TestServer::new();
        let body = format!(r#"{{"key":"{}"}}"#, "x".repeat(MAX_BODY));
        server
            .request("PUT", "/v1/credentials/groq", &body)
            .error(400, "bad_request");
        server.raw(&format!(
            "PUT /v1/credentials/groq HTTP/1.1\r\nHost: 127.0.0.1:{}\r\nConnection: close\r\nTransfer-Encoding: chunked\r\n\r\n{:x}\r\n{body}\r\n0\r\n\r\n", server.port(), body.len(),
        )).error(400, "bad_request");
        assert_eq!(server.request("GET", "/v1/status", "").status, 200);
    }

    #[test]
    fn occupied_port_fails() {
        let listener = TcpListener::bind(("127.0.0.1", 0)).unwrap();
        let (engine, _) = engine(FakeRecorder::default(), Ok(""));
        assert!(serve(
            engine,
            test_services(Arc::new(MemoryKeyStore::default())),
            listener.local_addr().unwrap().port()
        )
        .is_err());
    }

    fn read_line(reader: &mut impl BufRead) -> String {
        let mut line = String::new();
        reader.read_line(&mut line).unwrap();
        line
    }

    #[test]
    fn sse_streams_state_and_pings_then_shuts_down() {
        let server = TestServer::new();
        let mut stream = server.connect();
        write!(
            stream,
            "GET /v1/events HTTP/1.1\r\nHost: 127.0.0.1:{}\r\n\r\n",
            server.port()
        )
        .unwrap();
        let mut reader = BufReader::new(stream);
        let mut headers = String::new();
        loop {
            let line = read_line(&mut reader);
            if line == "\r\n" {
                break;
            }
            assert!(!line.is_empty());
            headers.push_str(&line);
        }
        assert!(headers.contains("200 OK"));
        assert!(headers.contains("Content-Type: text/event-stream"));
        assert!(headers.contains("Cache-Control: no-store"));
        assert_eq!(
            server
                .request("POST", "/v1/start", r#"{"mode":"hold"}"#)
                .status,
            200
        );
        // A ping may arrive before the event, so skip pings until the data line.
        let value: Value = loop {
            let line = read_line(&mut reader);
            if let Some(data) = line.strip_prefix("data: ") {
                break serde_json::from_str(data).unwrap();
            }
            assert_eq!(line, ": ping\n");
        };
        assert_eq!(value["service"], SERVICE);
        assert_eq!(value["apiVersion"], API_VERSION);
        assert!(matches!(
            serde_json::from_value::<Event>(value).unwrap(),
            Event::State {
                state: State::Listening,
                ..
            }
        ));
        assert_eq!(read_line(&mut reader), "\n");
        assert_eq!(read_line(&mut reader), ": ping\n");
        // Shutdown must return even with an SSE client connected.
        drop(server);
    }

    #[test]
    fn history_pages_newest_first_with_a_cursor() {
        let server = TestServer::with_history("pages");
        let first = server.request("GET", "/v1/history?limit=2", "");
        assert_eq!(first.status, 200);
        let ids: Vec<&str> = first.body["items"]
            .as_array()
            .unwrap()
            .iter()
            .map(|i| i["id"].as_str().unwrap())
            .collect();
        assert_eq!(ids, ["d3", "d2"]);
        assert_eq!(first.body["next"], "d2");
        assert_eq!(first.body["items"][0]["cleanedText"], "Hi.");
        let public = server.request("GET", "/v1/history/public?limit=2", "");
        assert_eq!(public.status, 200);
        assert!(public.body["items"]
            .as_array()
            .unwrap()
            .iter()
            .all(|item| item["private"] == false));

        let second = server.request("GET", "/v1/history?limit=2&before=d2", "");
        assert_eq!(second.body["items"][0]["id"], "d1");
        assert!(second.body["next"].is_null());

        let holds = server.request("GET", "/v1/history?mode=hold", "");
        assert_eq!(holds.body["items"].as_array().unwrap().len(), 2);
    }

    #[test]
    fn history_rejects_a_bad_limit_and_wrong_methods() {
        let server = TestServer::with_history("bad");
        for path in ["/v1/history?limit=0", "/v1/history?limit=abc"] {
            let reply = server.request("GET", path, "");
            assert_eq!(
                (reply.status, reply.body["error"].as_str()),
                (400, Some("bad_request"))
            );
        }
        assert_eq!(server.request("POST", "/v1/history", "").status, 405);
        assert_eq!(server.request("GET", "/v1/history/d1", "").status, 405);
    }

    #[test]
    fn history_delete_removes_one_item() {
        let server = TestServer::with_history("delete");
        let reply = server.request("DELETE", "/v1/history/d2", "");
        assert_eq!(
            (reply.status, reply.body["deleted"].as_bool()),
            (200, Some(true))
        );
        assert_eq!(server.request("DELETE", "/v1/history/d2", "").status, 404);
        let rest = server.request("GET", "/v1/history", "");
        assert_eq!(rest.body["items"].as_array().unwrap().len(), 2);
    }

    #[test]
    fn history_is_not_found_without_a_store() {
        let server = TestServer::new();
        assert_eq!(server.request("GET", "/v1/history", "").status, 404);
    }

    /// A fresh folder with spaces in its name, so paths with spaces are covered.
    fn temp_dir(name: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("scribe http {}-{name}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn dictionary_server(path: &std::path::Path) -> TestServer {
        let mut services = test_services(Arc::new(MemoryKeyStore::default()));
        services.dictionary = Arc::new(SharedDictionary::new(path.to_path_buf()));
        TestServer::with_services(services)
    }

    #[test]
    fn dictionary_get_and_put_round_trip_and_keep_other_keys() {
        let path = temp_dir("dict").join("dictionary.json");
        std::fs::write(
            &path,
            r#"{"replacements":{"btw":"by the way"},"vocabulary":["Gersi"],"extra":{"keep":1}}"#,
        )
        .unwrap();
        let server = dictionary_server(&path);
        let reply = server.request("GET", "/v1/dictionary", "");
        assert_eq!(reply.status, 200);
        assert_eq!(
            reply.body,
            json!({"replacements":[{"wrong":"btw","correct":"by the way"}],"vocabulary":["Gersi"]})
        );
        let put = json!({
            "replacements":[{"wrong":"leo","correct":"Leonidas"},{"wrong":"btw","correct":"by the way"}],
            "vocabulary":["Gersi","Marana"]
        });
        let reply = server.request("PUT", "/v1/dictionary", &put.to_string());
        assert_eq!(reply.status, 200);
        assert_eq!(reply.body["vocabulary"], json!(["Gersi", "Marana"]));
        assert_eq!(reply.body["replacements"].as_array().unwrap().len(), 2);
        let saved: Value = serde_json::from_str(&std::fs::read_to_string(&path).unwrap()).unwrap();
        assert_eq!(saved["extra"], json!({"keep": 1}));
        assert_eq!(saved["replacements"]["leo"], "Leonidas");
        assert_eq!(server.request("GET", "/v1/dictionary", "").body, reply.body);
    }

    #[test]
    fn dictionary_without_a_file_is_empty_and_put_creates_it() {
        let path = temp_dir("dict-new").join("sub").join("dictionary.json");
        let server = dictionary_server(&path);
        let reply = server.request("GET", "/v1/dictionary", "");
        assert_eq!(reply.body, json!({"replacements":[],"vocabulary":[]}));
        let put = json!({"replacements":[{"wrong":"leo","correct":"Leonidas"}],"vocabulary":[]});
        assert_eq!(
            server
                .request("PUT", "/v1/dictionary", &put.to_string())
                .status,
            200
        );
        assert!(path.exists());
    }

    #[test]
    fn dictionary_put_rejects_bad_bodies() {
        let path = temp_dir("dict-bad").join("dictionary.json");
        let server = dictionary_server(&path);
        let too_many: Vec<String> = (0..801).map(|i| format!("w{i}")).collect();
        for body in [
            json!({"replacements":[{"wrong":"  ","correct":"x"}],"vocabulary":[]}).to_string(),
            json!({"replacements":[],"vocabulary":too_many}).to_string(),
            json!({"replacements":[]}).to_string(),
            json!({"replacements":[],"vocabulary":[],"other":1}).to_string(),
            "not json".into(),
        ] {
            server
                .request("PUT", "/v1/dictionary", &body)
                .error(400, "bad_request");
        }
        assert!(!path.exists(), "a bad body never writes the file");
        server
            .request("POST", "/v1/dictionary", "{}")
            .error(405, "method_not_allowed");
    }

    fn settings_server(name: &str) -> (TestServer, std::path::PathBuf) {
        let path = temp_dir(name).join("config.json");
        let mut services = test_services(Arc::new(MemoryKeyStore::default()));
        let cfg = crate::config::Config {
            port: 8777,
            ..Default::default()
        };
        services.settings = Arc::new(Settings::new(path.clone(), cfg));
        (TestServer::with_services(services), path)
    }

    #[test]
    fn settings_get_has_seven_sections_and_keys_only_as_set() {
        let (server, _) = settings_server("set-get");
        let reply = server.request("GET", "/v1/settings", "");
        assert_eq!(reply.status, 200);
        let sections = reply.body["sections"].as_object().unwrap();
        let mut names: Vec<&str> = sections.keys().map(String::as_str).collect();
        names.sort_unstable();
        assert_eq!(
            names,
            [
                "audio",
                "features",
                "goals",
                "hotkeys",
                "hud",
                "presets",
                "transcription"
            ]
        );
        assert_eq!(
            sections["hotkeys"]["toggle"],
            json!(["Mouse5", "Ctrl + Shift + Space"])
        );
        assert_eq!(sections["audio"]["maxRecordSeconds"], 600);
        let env_key = std::env::var_os("GROQ_API_KEY").is_some_and(|key| !key.is_empty());
        assert_eq!(
            sections["transcription"]["groqKey"],
            json!({"set": env_key})
        );
        assert_eq!(sections["hud"], json!({"enabled": true}));
        assert_eq!(sections["goals"], json!({}));
        assert_eq!(
            server
                .request("PUT", "/v1/credentials/groq", r#"{"key":"secret-value"}"#)
                .status,
            204
        );
        let reply = server.request("GET", "/v1/settings", "");
        assert_eq!(
            reply.body["sections"]["transcription"]["groqKey"],
            json!({"set": true})
        );
        assert!(!reply.body.to_string().contains("secret-value"));
    }

    #[test]
    fn settings_patch_merges_saves_and_reports_restart() {
        let (server, path) = settings_server("set-patch");
        let reply = server.request(
            "PATCH",
            "/v1/settings",
            r#"{"section":"audio","values":{"device":"USB Mic"}}"#,
        );
        assert_eq!(reply.status, 200);
        assert_eq!(
            reply.body,
            json!({"section":"audio","values":{"device":"USB Mic","maxRecordSeconds":600,"minRecordMs":250},"restartRequired":false})
        );
        let saved: Value = serde_json::from_str(&std::fs::read_to_string(&path).unwrap()).unwrap();
        assert_eq!(saved["audio"]["device"], "USB Mic");
        assert_eq!(saved["port"], 8777, "keys the API does not show are kept");
        let get = server.request("GET", "/v1/settings", "");
        assert_eq!(get.body["sections"]["audio"]["device"], "USB Mic");
        for (body, restart) in [
            (r#"{"section":"hud","values":{"enabled":false}}"#, true),
            (
                r#"{"section":"transcription","values":{"privateMode":true}}"#,
                false,
            ),
            (
                r#"{"section":"transcription","values":{"polishModel":"other"}}"#,
                true,
            ),
            (r#"{"section":"hotkeys","values":{"hold":[]}}"#, false),
            (
                r#"{"section":"hotkeys","values":{"rewrite":["Ctrl + Alt + A"]}}"#,
                false,
            ),
            (r#"{"section":"goals","values":{"dailyWords":500}}"#, false),
        ] {
            let reply = server.request("PATCH", "/v1/settings", body);
            assert_eq!(reply.status, 200, "{body}");
            assert_eq!(reply.body["restartRequired"], restart, "{body}");
        }
        let get = server.request("GET", "/v1/settings", "").body;
        assert_eq!(get["sections"]["goals"], json!({"dailyWords": 500}));
        assert_eq!(get["sections"]["hotkeys"]["hold"], json!([]));
        assert_eq!(
            get["sections"]["hotkeys"]["rewrite"],
            json!(["Ctrl + Alt + A"])
        );
        assert_eq!(get["sections"]["transcription"]["privateMode"], true);
    }

    #[test]
    fn settings_patch_rejects_bad_requests_and_writes_nothing() {
        let (server, path) = settings_server("set-bad");
        for body in [
            r#"{"section":"nope","values":{}}"#,
            r#"{"section":"audio","values":{"unknown":1}}"#,
            r#"{"section":"audio","values":{"device":5}}"#,
            r#"{"section":"transcription","values":{"groqKey":{"set":true}}}"#,
            r#"{"section":"goals","values":[1]}"#,
            r#"{"section":"audio"}"#,
            "not json",
        ] {
            server
                .request("PATCH", "/v1/settings", body)
                .error(400, "bad_request");
        }
        assert!(!path.exists());
        server
            .request("PUT", "/v1/settings", "{}")
            .error(405, "method_not_allowed");
    }

    #[test]
    fn devices_list_inputs_and_report_a_failure() {
        let mut services = test_services(Arc::new(MemoryKeyStore::default()));
        services.devices = Arc::new(|| {
            Ok(vec![
                InputDevice::new("USB Mic", false),
                InputDevice::new("Realtek Mic", true),
            ])
        });
        let server = TestServer::with_services(services);
        let reply = server.request("GET", "/v1/devices", "");
        assert_eq!(reply.status, 200);
        assert_eq!(
            reply.body,
            json!({"inputs":[
                {"id":"USB Mic","name":"USB Mic","default":false},
                {"id":"Realtek Mic","name":"Realtek Mic","default":true}
            ]})
        );
        server
            .request("POST", "/v1/devices", "{}")
            .error(405, "method_not_allowed");

        let mut services = test_services(Arc::new(MemoryKeyStore::default()));
        services.devices = Arc::new(|| Err("no audio host".into()));
        TestServer::with_services(services)
            .request("GET", "/v1/devices", "")
            .error(500, "mic_error");
    }

    #[test]
    fn meetings_routes_go_through_http() {
        let server = TestServer::new();
        let reply = server.request("GET", "/v1/meetings", "");
        assert_eq!(reply.status, 200);
        assert_eq!(reply.body, json!({"items": []}));
        let missing = server.request("GET", "/v1/meetings/missing", "");
        assert_eq!(
            (missing.status, &missing.body["error"]),
            (404, &json!("not_found"))
        );
        server
            .request("PATCH", "/v1/meetings/missing", "not json")
            .error(400, "bad_request");
    }

    #[test]
    fn retry_with_no_saved_take_is_404_nothing_to_retry() {
        let engine = Engine::new(
            Box::new(FakeRecorder::default()),
            Box::new(FakeStt(Ok("hello".into()))),
            Box::new(UpperPolish),
            Box::new(Arc::new(FakePaster::default())),
            250,
            None,
        );
        let services = test_services(Arc::new(MemoryKeyStore::default()));
        let server = TestServer(Some(
            serve_with_ping(engine, services, 0, TEST_PING).unwrap(),
        ));
        server
            .request("POST", "/v1/retry", "")
            .error(404, "nothing_to_retry");
        assert_eq!(server.request("GET", "/v1/retry", "").status, 405);
    }

    #[test]
    fn suggestions_come_from_history_and_a_reject_hides_one() {
        let dir = temp_dir("sugg");
        let history = Arc::new(crate::history::History::open(&dir.join("history.jsonl")));
        for (ms, raw, cleaned) in [
            (1, "call jersey", "Call Gersi."),
            (2, "jersey said hi", "Gersi said hi."),
            (3, "leo nightness works", "Leonidas works."),
            (4, "leo nightness again", "Leonidas again."),
            (5, "btw yes", "By the way, yes."),
            (6, "btw no", "By the way, no."),
        ] {
            history
                .add(crate::history::NewItem {
                    preset: None,
                    stt: String::new(),
                    polish: String::new(),
                    at: crate::contract::iso_from_unix_ms(ms),
                    mode: "hold".into(),
                    app: String::new(),
                    raw_text: raw.into(),
                    cleaned_text: cleaned.into(),
                    metrics: Default::default(),
                    pasted: true,
                    private: false,
                    at_ms: ms,
                })
                .unwrap();
        }
        std::fs::write(
            dir.join("dictionary.json"),
            r#"{"replacements":{"BTW":"by the way"}}"#,
        )
        .unwrap();
        let engine = Engine::new(
            Box::new(FakeRecorder::default()),
            Box::new(FakeStt(Ok("hello".into()))),
            Box::new(UpperPolish),
            Box::new(Arc::new(FakePaster::default())),
            250,
            Some(history),
        );
        let mut services = test_services(Arc::new(MemoryKeyStore::default()));
        services.dictionary = Arc::new(SharedDictionary::new(dir.join("dictionary.json")));
        services.rejects = Arc::new(Rejects::open(&dir.join("suggestions-rejected.json")));
        let server = TestServer(Some(
            serve_with_ping(engine, services, 0, TEST_PING).unwrap(),
        ));
        let reply = server.request("GET", "/v1/dictionary/suggestions", "");
        assert_eq!(reply.status, 200);
        assert_eq!(
            reply.body,
            json!({"items":[
                {"wrong":"jersey","correct":"Gersi","count":2},
                {"wrong":"leo nightness","correct":"Leonidas","count":2}
            ]})
        );
        let reply = server.request("DELETE", "/v1/dictionary/suggestions/Leo%20Nightness", "");
        assert_eq!(reply.status, 200);
        assert_eq!(reply.body, json!({"rejected": true}));
        let items = server.request("GET", "/v1/dictionary/suggestions", "").body["items"].clone();
        assert_eq!(
            items,
            json!([{"wrong":"jersey","correct":"Gersi","count":2}])
        );
        server
            .request("DELETE", "/v1/dictionary/suggestions/", "")
            .error(404, "not_found");
        server
            .request("DELETE", "/v1/dictionary/suggestions/bad%zz", "")
            .error(400, "bad_request");
        server
            .request("POST", "/v1/dictionary/suggestions", "{}")
            .error(405, "method_not_allowed");
    }

    #[test]
    fn percent_decoding() {
        assert_eq!(
            percent_decode("Leo%20Nightness").as_deref(),
            Some("Leo Nightness")
        );
        assert_eq!(percent_decode("caf%C3%A9").as_deref(), Some("caf\u{e9}"));
        assert_eq!(percent_decode("a+b").as_deref(), Some("a+b"));
        assert_eq!(percent_decode("bad%zz"), None);
        assert_eq!(percent_decode("cut%2"), None);
        assert_eq!(percent_decode("%FF"), None);
    }
}
