//! Groq Whisper speech-to-text and the pooled HTTP client shared with polish. Slice S4.
//!
//! One `ureq` agent (and so one connection pool) serves both speech and polish. The key is read
//! on every call: `GROQ_API_KEY` wins over the stored key. The key is never logged, never put
//! in an error and never printed.

use crate::config::GroqConfig;
use crate::contract::SttEngine;
use crate::credentials::KeyStore;
use crate::engine::{EncodedAudio, Transcriber, Transcription};
use crate::polish::{Dictionary, SharedDictionary};
use serde_json::Value;
use std::sync::Arc;
use std::time::Duration;

const NO_KEY: &str = "No speech key found. Add your Groq key in Settings, then try again.";
const WARM_TIMEOUT: Duration = Duration::from_millis(2500);
/// Whisper hallucination limits, as in Python Scribe.
const TAIL_LOGPROB_FLOOR: f64 = -0.55;
const TAIL_LOGPROB_MARGIN: f64 = 0.35;
const SHORT_SEGMENT_WORDS: usize = 3;

/// Why a Groq request failed. It never holds the key.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum ApiError {
    NoKey,
    Status(u16),
    Timeout,
    Transport,
    Malformed,
}

impl From<ureq::Error> for ApiError {
    fn from(error: ureq::Error) -> Self {
        match error {
            ureq::Error::StatusCode(code) => Self::Status(code),
            ureq::Error::Timeout(_) => Self::Timeout,
            ureq::Error::Io(e) if e.kind() == std::io::ErrorKind::TimedOut => Self::Timeout,
            _ => Self::Transport,
        }
    }
}

type EnvLookup = Arc<dyn Fn() -> Option<String> + Send + Sync>;

#[derive(Clone)]
pub struct GroqClient {
    /// Provider name for history, for example `groq` or `gemini`.
    pub(crate) name: &'static str,
    pub(crate) cfg: GroqConfig,
    pub(crate) dictionary: Arc<SharedDictionary>,
    keys: Arc<dyn KeyStore>,
    agent: ureq::Agent,
    env_key: EnvLookup,
}

impl GroqClient {
    pub fn new(
        cfg: &GroqConfig,
        keys: Arc<dyn KeyStore>,
        dictionary: Arc<SharedDictionary>,
    ) -> Self {
        Self {
            name: "groq",
            cfg: cfg.clone(),
            dictionary,
            keys,
            agent: ureq::Agent::new_with_config(ureq::Agent::config_builder().build()),
            env_key: Arc::new(|| std::env::var("GROQ_API_KEY").ok()),
        }
    }

    /// Another OpenAI-compatible vendor (for example Gemini) with its own key.
    pub fn named(
        name: &'static str,
        cfg: &GroqConfig,
        key: crate::backup::ProviderKey,
        dictionary: Arc<SharedDictionary>,
    ) -> Self {
        let keys = key.store.unwrap_or_else(|| {
            Arc::new(crate::credentials::MemoryKeyStore::default()) as Arc<dyn KeyStore>
        });
        let env_var = key.env_var;
        Self {
            name,
            env_key: Arc::new(move || std::env::var(env_var).ok()),
            ..Self::new(cfg, keys, dictionary)
        }
    }

    /// Replace the environment lookup. Tests use this so they do not touch the process environment.
    #[cfg(test)]
    pub(crate) fn with_env(
        mut self,
        lookup: impl Fn() -> Option<String> + Send + Sync + 'static,
    ) -> Self {
        self.env_key = Arc::new(lookup);
        self
    }

    /// `GROQ_API_KEY` (when not empty) wins, else the stored key.
    pub(crate) fn key(&self) -> Option<String> {
        let usable = |k: &String| !k.trim().is_empty();
        (self.env_key)()
            .filter(usable)
            .or_else(|| self.keys.get().filter(usable))
            .map(|k| k.trim().to_owned())
    }

    fn url(&self, path: &str) -> String {
        format!("{}{path}", self.cfg.base_url.trim_end_matches('/'))
    }

    fn post(
        &self,
        path: &str,
        content_type: &str,
        body: &[u8],
        timeout: Duration,
    ) -> Result<Value, ApiError> {
        let key = self.key().ok_or(ApiError::NoKey)?;
        let mut response = self
            .agent
            .post(self.url(path))
            .header("Authorization", format!("Bearer {key}"))
            .header("Content-Type", content_type)
            .config()
            .timeout_global(Some(timeout))
            .build()
            .send(body)?;
        let text = response.body_mut().read_to_string()?;
        serde_json::from_str(&text).map_err(|_| ApiError::Malformed)
    }

    /// POST a chat completion (OpenAI format) and return the parsed reply.
    pub(crate) fn chat(&self, payload: &Value, timeout: Duration) -> Result<Value, ApiError> {
        let body = serde_json::to_vec(payload).map_err(|_| ApiError::Malformed)?;
        self.post("/chat/completions", "application/json", &body, timeout)
    }

    /// Open a pooled TLS connection in the background, so the first real request skips the
    /// handshake. It does nothing without a key and never blocks the caller.
    pub fn warm(&self) {
        let Some(key) = self.key() else { return };
        let (agent, url) = (self.agent.clone(), self.url("/models"));
        let _ = std::thread::Builder::new()
            .name("scribe-warm".into())
            .spawn(move || {
                let sent = agent
                    .get(url)
                    .header("Authorization", format!("Bearer {key}"))
                    .config()
                    .timeout_global(Some(WARM_TIMEOUT))
                    .build()
                    .call();
                // Read the body so the connection goes back to the pool.
                if let Ok(mut response) = sent {
                    let _ = response.body_mut().read_to_string();
                }
            });
    }

    fn upload(&self, audio: &EncodedAudio, model: &str, prompt: &str) -> Result<Value, ApiError> {
        let mut boundary = String::from("----scribe-engine-boundary");
        while audio
            .bytes
            .windows(boundary.len())
            .any(|w| w == boundary.as_bytes())
            || prompt.contains(&boundary)
        {
            boundary.push('x');
        }
        let mut body = Vec::with_capacity(audio.bytes.len() + prompt.len() + 1024);
        let mut field = |name: &str, value: &str| {
            body.extend_from_slice(
                format!("--{boundary}\r\nContent-Disposition: form-data; name=\"{name}\"\r\n\r\n{value}\r\n")
                    .as_bytes(),
            );
        };
        field("model", model);
        field("response_format", "verbose_json");
        field("temperature", "0.0");
        field("timestamp_granularities[]", "segment");
        if !prompt.is_empty() {
            field("prompt", prompt);
        }
        body.extend_from_slice(
            format!(
                "--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"{}\"\r\nContent-Type: {}\r\n\r\n",
                audio.file_name, audio.mime
            )
            .as_bytes(),
        );
        body.extend_from_slice(&audio.bytes);
        body.extend_from_slice(format!("\r\n--{boundary}--\r\n").as_bytes());
        // The timeout grows with the audio, as in Python Scribe.
        let timeout = Duration::from_secs(self.cfg.transcribe_timeout_s)
            + Duration::from_millis(audio.duration_ms);
        self.post(
            "/audio/transcriptions",
            &format!("multipart/form-data; boundary={boundary}"),
            &body,
            timeout,
        )
    }
}

fn speech_error(error: &ApiError) -> String {
    match error {
        ApiError::NoKey => NO_KEY.into(),
        ApiError::Status(401 | 403) => {
            "Groq did not accept the speech key. Check your key in Settings, then try again.".into()
        }
        ApiError::Status(429) => "Groq is busy (rate limit). Try again in a moment.".into(),
        ApiError::Status(code) => format!("Speech request failed (HTTP {code}). Try again."),
        ApiError::Timeout => "Speech request timed out. Try again.".into(),
        ApiError::Transport => {
            "Could not reach Groq. Check your connection, then try again.".into()
        }
        ApiError::Malformed => "Groq sent a reply the app could not read. Try again.".into(),
    }
}

/// A cloud failure. `offline` is true when a local model could still serve the request:
/// no key, no network, a timeout, a rate limit or a server error.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CloudFailure {
    pub message: String,
    pub offline: bool,
}

impl CloudFailure {
    fn from_api(error: &ApiError) -> Self {
        Self {
            message: speech_error(error),
            offline: matches!(
                error,
                ApiError::NoKey
                    | ApiError::Timeout
                    | ApiError::Transport
                    | ApiError::Status(429 | 500..=599)
            ),
        }
    }
}

impl Transcriber for GroqClient {
    fn transcribe(&self, audio: &EncodedAudio) -> Result<Transcription, String> {
        self.transcribe_cloud(audio).map_err(|f| f.message)
    }
}

impl GroqClient {
    pub fn transcribe_cloud(&self, audio: &EncodedAudio) -> Result<Transcription, CloudFailure> {
        let done = |text, model: &str| {
            Ok(Transcription {
                text,
                engine: SttEngine::Groq,
                private: false,
                source: format!("groq/{model}"),
            })
        };
        if audio.bytes.is_empty() {
            return done(String::new(), &self.cfg.whisper_model);
        }
        if self.key().is_none() {
            return Err(CloudFailure::from_api(&ApiError::NoKey));
        }
        let dictionary = self.dictionary.current();
        let prompt = dictionary.vocabulary_prompt();
        let mut model = &self.cfg.whisper_model;
        let mut result = self.upload(audio, model, &prompt);
        // A timeout, a server error or a rate limit on one model: the sibling model has its own budget.
        if matches!(
            result,
            Err(ApiError::Timeout | ApiError::Status(429 | 500..=599))
        ) && !self.cfg.whisper_model_backup.is_empty()
            && self.cfg.whisper_model_backup != self.cfg.whisper_model
        {
            model = &self.cfg.whisper_model_backup;
            result = self.upload(audio, model, &prompt);
        }
        match result {
            Ok(body) => done(transcript_text(&body, &dictionary), model),
            Err(error) => Err(CloudFailure::from_api(&error)),
        }
    }
}

// ---------------------------------------------------------------------------------------------
// Whisper output cleanup (hallucination handling, ported from Python Scribe)
// ---------------------------------------------------------------------------------------------

fn words(text: &str) -> usize {
    text.split_whitespace().count()
}

/// Join the segments that survive the hallucination checks. Without a `segments` list
/// the plain `text` field is used. Pause markers are not ported: nothing after STT uses them.
fn transcript_text(body: &Value, dictionary: &Dictionary) -> String {
    let segments: Vec<&Value> = body["segments"]
        .as_array()
        .map(|list| list.iter().collect())
        .unwrap_or_default();
    let text = if segments.is_empty() {
        body["text"].as_str().unwrap_or_default().trim().to_owned()
    } else {
        join_segments(&segments, dictionary)
    };
    strip_hallucinated_tail(&text)
}

fn join_segments(segments: &[&Value], dictionary: &Dictionary) -> String {
    let mut segments = segments;
    // A last segment that is short, far less sure than the rest and below the floor is invented.
    if let [head @ .., last] = segments {
        let last_lp = last["avg_logprob"].as_f64();
        let best = head
            .iter()
            .filter_map(|s| s["avg_logprob"].as_f64())
            .reduce(f64::max);
        let last_text = last["text"].as_str().unwrap_or_default().trim();
        if let (Some(lp), Some(best)) = (last_lp, best) {
            if !last_text.is_empty()
                && words(last_text) <= SHORT_SEGMENT_WORDS
                && lp < TAIL_LOGPROB_FLOOR
                && lp < best - TAIL_LOGPROB_MARGIN
            {
                segments = head;
            }
        }
    }
    let vocabulary: Vec<String> = dictionary.terms().map(str::to_lowercase).collect();
    let mut parts: Vec<&str> = Vec::new();
    for segment in segments {
        let text = segment["text"].as_str().unwrap_or_default().trim();
        if text.is_empty() {
            continue;
        }
        let no_speech = segment["no_speech_prob"].as_f64().unwrap_or(0.0);
        let logprob = segment["avg_logprob"].as_f64().unwrap_or(0.0);
        let compression = segment["compression_ratio"].as_f64().unwrap_or(1.0);
        let short = words(text) <= SHORT_SEGMENT_WORDS;
        if compression > 2.4
            || (no_speech > 0.7 && logprob < -0.8)
            || (logprob < -1.3 && short)
            || is_prompt_echo(text, no_speech, &vocabulary)
        {
            continue;
        }
        parts.push(text);
    }
    parts.join(" ")
}

/// With near silence Whisper recites the end of its vocabulary prompt: a comma list of
/// 3+ items, 3 in 4 of them vocabulary terms (or prefixes), ending on a cut-off fragment
/// or flagged as non-speech.
fn is_prompt_echo(text: &str, no_speech: f64, vocabulary: &[String]) -> bool {
    let items: Vec<String> = text
        .split(',')
        .map(|item| {
            item.chars()
                .filter(|c| c.is_alphanumeric() || c.is_whitespace() || "_.-".contains(*c))
                .collect::<String>()
                .trim()
                .to_lowercase()
        })
        .filter(|item| !item.is_empty())
        .collect();
    if items.len() < 3 || words(text) > 12 {
        return false;
    }
    let hits = items
        .iter()
        .filter(|item| vocabulary.iter().any(|v| v.starts_with(item.as_str())))
        .count();
    let cut_off = items.last().is_some_and(|i| i.chars().count() <= 2);
    hits * 4 >= items.len() * 3 && (cut_off || no_speech > 0.5)
}

/// Sign-offs Whisper invents on silence (it learned them from captioned video).
/// Only a tail of real dictation is cut. A transcript that is only "Thank you" is kept.
fn strip_hallucinated_tail(text: &str) -> String {
    let text = text.trim();
    let body = text.trim_end_matches(|c: char| c.is_whitespace() || ".!\u{2026}".contains(c));
    let lower = body.to_ascii_lowercase();
    let mut tails: Vec<String> = Vec::new();
    for lead in ["thanks", "thank you"] {
        for amount in ["", " so much", " very much"] {
            for watching in ["", " for watching"] {
                tails.push(format!("{lead}{amount}{watching}"));
            }
        }
    }
    for tail in [
        "please subscribe",
        "please like and subscribe",
        "subscribe to my channel",
        "subscribe to the channel",
        "like and subscribe to my channel",
        "like and subscribe to the channel",
        "bye-bye",
        "bye bye",
        "byebye",
    ] {
        tails.push(tail.to_owned());
    }
    // The longest tail first, so "thank you so much" is cut whole.
    tails.sort_by_key(|t| std::cmp::Reverse(t.len()));
    for tail in &tails {
        let Some(at) = lower.len().checked_sub(tail.len()) else {
            continue;
        };
        if !lower.ends_with(tail.as_str()) || !body.is_char_boundary(at) {
            continue;
        }
        if lower[..at]
            .chars()
            .next_back()
            .is_some_and(char::is_alphanumeric)
        {
            continue;
        }
        let head = body[..at].trim_end_matches(|c: char| c.is_whitespace() || c == ',');
        return if head.is_empty() {
            text.to_owned()
        } else {
            head.to_owned()
        };
    }
    text.to_owned()
}

// ---------------------------------------------------------------------------------------------
// Tests and the local mock HTTP server
// ---------------------------------------------------------------------------------------------

/// A tiny HTTP server on 127.0.0.1 for tests. Shared with the polish tests.
#[cfg(test)]
pub(crate) mod mock {
    use std::io::{Read, Write};
    use std::net::{TcpListener, TcpStream};
    use std::sync::{Arc, Mutex};
    use std::time::Duration;

    pub struct Req {
        pub method: String,
        pub path: String,
        pub headers: Vec<(String, String)>,
        pub body: Vec<u8>,
    }

    impl Req {
        pub fn header(&self, name: &str) -> Option<&str> {
            self.headers
                .iter()
                .find(|(k, _)| k.eq_ignore_ascii_case(name))
                .map(|(_, v)| v.as_str())
        }
        pub fn json(&self) -> serde_json::Value {
            serde_json::from_slice(&self.body).unwrap_or_default()
        }
        pub fn text(&self) -> String {
            String::from_utf8_lossy(&self.body).into_owned()
        }
    }

    pub struct Reply {
        pub status: u16,
        pub body: String,
        pub delay: Duration,
    }

    impl Reply {
        pub fn json(status: u16, body: &str) -> Self {
            Self {
                status,
                body: body.to_owned(),
                delay: Duration::ZERO,
            }
        }
        pub fn delayed(mut self, ms: u64) -> Self {
            self.delay = Duration::from_millis(ms);
            self
        }
        /// A chat completion with this content.
        pub fn chat(content: &str) -> Self {
            let body = serde_json::json!({"choices": [{"message": {"content": content}, "finish_reason": "stop"}]});
            Self::json(200, &body.to_string())
        }
    }

    pub struct Server {
        pub addr: String,
        pub log: Arc<Mutex<Vec<Req>>>,
    }

    impl Server {
        pub fn start(handler: impl Fn(&Req) -> Reply + Send + Sync + 'static) -> Self {
            let listener = TcpListener::bind("127.0.0.1:0").unwrap();
            let addr = listener.local_addr().unwrap().to_string();
            let log = Arc::new(Mutex::new(Vec::new()));
            let (handler, shared) = (Arc::new(handler), log.clone());
            std::thread::spawn(move || {
                for stream in listener.incoming().flatten() {
                    let (handler, log) = (handler.clone(), shared.clone());
                    std::thread::spawn(move || serve(stream, &*handler, &log));
                }
            });
            Self { addr, log }
        }
        pub fn base_url(&self) -> String {
            format!("http://{}/v1", self.addr)
        }
        pub fn count(&self, path: &str) -> usize {
            self.log
                .lock()
                .unwrap()
                .iter()
                .filter(|r| r.path == path)
                .count()
        }
        /// The `model` field of every chat request, in arrival order.
        pub fn chat_models(&self) -> Vec<String> {
            let log = self.log.lock().unwrap();
            log.iter()
                .filter(|r| r.path.ends_with("/chat/completions"))
                .map(|r| r.json()["model"].as_str().unwrap_or_default().to_owned())
                .collect()
        }
    }

    fn serve(mut stream: TcpStream, handler: &dyn Fn(&Req) -> Reply, log: &Mutex<Vec<Req>>) {
        stream.set_read_timeout(Some(Duration::from_secs(5))).ok();
        let mut data = Vec::new();
        let mut chunk = [0u8; 8192];
        let head_end = loop {
            if let Some(at) = data.windows(4).position(|w| w == b"\r\n\r\n") {
                break at;
            }
            match stream.read(&mut chunk) {
                Ok(0) | Err(_) => return,
                Ok(n) => data.extend_from_slice(&chunk[..n]),
            }
        };
        let head = String::from_utf8_lossy(&data[..head_end]).into_owned();
        let mut lines = head.lines();
        let mut first = lines.next().unwrap_or_default().split_whitespace();
        let (method, path) = (
            first.next().unwrap_or_default().to_owned(),
            first.next().unwrap_or_default().to_owned(),
        );
        let headers: Vec<(String, String)> = lines
            .filter_map(|l| {
                l.split_once(':')
                    .map(|(k, v)| (k.trim().to_owned(), v.trim().to_owned()))
            })
            .collect();
        let length = headers
            .iter()
            .find(|(k, _)| k.eq_ignore_ascii_case("content-length"))
            .and_then(|(_, v)| v.parse::<usize>().ok())
            .unwrap_or(0);
        let mut body = data[head_end + 4..].to_vec();
        while body.len() < length {
            match stream.read(&mut chunk) {
                Ok(0) | Err(_) => return,
                Ok(n) => body.extend_from_slice(&chunk[..n]),
            }
        }
        let req = Req {
            method,
            path,
            headers,
            body,
        };
        let reply = {
            let reply = handler(&req);
            log.lock().unwrap().push(req);
            reply
        };
        std::thread::sleep(reply.delay);
        let out = format!(
            "HTTP/1.1 {} X\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
            reply.status,
            reply.body.len(),
            reply.body
        );
        let _ = stream.write_all(out.as_bytes());
    }
}

#[cfg(test)]
mod tests {
    use super::mock::{Reply, Server};
    use super::*;
    use crate::credentials::MemoryKeyStore;
    use serde_json::json;
    use std::path::PathBuf;

    pub(crate) fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("scribe-s4-{}-{name}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn audio() -> EncodedAudio {
        EncodedAudio {
            bytes: b"RIFF-fake-audio".to_vec(),
            mime: "audio/flac",
            file_name: "audio.flac",
            duration_ms: 1000,
            pcm: Vec::new(),
        }
    }

    fn client(server: &Server, key: Option<&str>) -> GroqClient {
        let keys = Arc::new(MemoryKeyStore::default());
        if let Some(key) = key {
            keys.set(key).unwrap();
        }
        let cfg = GroqConfig {
            base_url: server.base_url(),
            ..GroqConfig::default()
        };
        let dictionary = Arc::new(SharedDictionary::new(PathBuf::from("none.json")));
        GroqClient::new(&cfg, keys, dictionary).with_env(|| None)
    }

    fn whisper_ok(text: &str) -> Reply {
        Reply::json(200, &json!({"text": text}).to_string())
    }

    #[test]
    fn multipart_has_file_model_prompt_and_bearer_header() {
        let server = Server::start(|_| whisper_ok("hello there"));
        let dir = temp_dir("multipart");
        let file = dir.join("dictionary.json");
        std::fs::write(&file, r#"{"vocabulary":["Leonidas","Wispr Flow"]}"#).unwrap();
        let c = client(&server, Some("gsk_test"));
        let c = GroqClient::new(
            &c.cfg,
            c.keys.clone(),
            Arc::new(SharedDictionary::new(file)),
        )
        .with_env(|| None);
        let got = c.transcribe(&audio()).unwrap();
        assert_eq!(
            got,
            Transcription {
                text: "hello there".into(),
                engine: SttEngine::Groq,
                private: false,
                source: "groq/whisper-large-v3-turbo".into(),
            }
        );
        let log = server.log.lock().unwrap();
        let req = &log[0];
        assert_eq!(
            (req.method.as_str(), req.path.as_str()),
            ("POST", "/v1/audio/transcriptions")
        );
        assert_eq!(req.header("authorization"), Some("Bearer gsk_test"));
        assert!(req
            .header("content-type")
            .unwrap()
            .starts_with("multipart/form-data; boundary="));
        let body = req.text();
        assert!(body.contains("name=\"model\"\r\n\r\nwhisper-large-v3-turbo\r\n"));
        assert!(body.contains("name=\"prompt\"\r\n\r\nLeonidas, Wispr Flow"));
        assert!(body.contains("name=\"file\"; filename=\"audio.flac\"\r\nContent-Type: audio/flac\r\n\r\nRIFF-fake-audio\r\n"));
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn no_key_gives_exact_error_and_sends_nothing() {
        let server = Server::start(|_| whisper_ok("x"));
        let err = client(&server, None).transcribe(&audio()).unwrap_err();
        assert_eq!(
            err,
            "No speech key found. Add your Groq key in Settings, then try again."
        );
        assert!(server.log.lock().unwrap().is_empty());
    }

    #[test]
    fn env_key_wins_over_the_store_and_an_empty_env_falls_back() {
        let server = Server::start(|_| whisper_ok("x"));
        let c = client(&server, Some("stored"));
        let from_env = c.clone().with_env(|| Some("from_env".into()));
        from_env.transcribe(&audio()).unwrap();
        let empty_env = c.with_env(|| Some("  ".into()));
        empty_env.transcribe(&audio()).unwrap();
        let log = server.log.lock().unwrap();
        assert_eq!(log[0].header("authorization"), Some("Bearer from_env"));
        assert_eq!(log[1].header("authorization"), Some("Bearer stored"));
    }

    #[test]
    fn error_text_never_holds_the_key() {
        let server = Server::start(|_| Reply::json(401, "{}"));
        let err = client(&server, Some("gsk_secret_value"))
            .transcribe(&audio())
            .unwrap_err();
        assert!(!err.contains("gsk_secret_value"));
        assert!(err.contains("Check your key"));
    }

    #[test]
    fn backup_whisper_model_runs_after_a_500() {
        let server = Server::start(|req| {
            if req.text().contains("whisper-large-v3-turbo") {
                Reply::json(500, "{}")
            } else {
                whisper_ok("from backup")
            }
        });
        let got = client(&server, Some("k")).transcribe(&audio()).unwrap();
        assert_eq!(got.text, "from backup");
        assert_eq!(server.count("/v1/audio/transcriptions"), 2);
    }

    #[test]
    fn a_rate_limit_on_the_first_model_retries_on_the_backup() {
        let server = Server::start(|req| {
            if req.text().contains("whisper-large-v3-turbo") {
                Reply::json(429, "{}")
            } else {
                whisper_ok("from backup")
            }
        });
        assert_eq!(
            client(&server, Some("k"))
                .transcribe(&audio())
                .unwrap()
                .text,
            "from backup"
        );
    }

    #[test]
    fn a_400_does_not_retry() {
        let server = Server::start(|_| Reply::json(400, "{}"));
        let err = client(&server, Some("k")).transcribe(&audio()).unwrap_err();
        assert_eq!(err, "Speech request failed (HTTP 400). Try again.");
        assert_eq!(server.count("/v1/audio/transcriptions"), 1);
    }

    #[test]
    fn warm_opens_a_connection_with_the_key_and_is_a_no_op_without_one() {
        let server = Server::start(|_| Reply::json(200, r#"{"data":[]}"#));
        client(&server, Some("gsk_warm")).warm();
        let deadline = std::time::Instant::now() + Duration::from_secs(3);
        while server.count("/v1/models") == 0 && std::time::Instant::now() < deadline {
            std::thread::sleep(Duration::from_millis(10));
        }
        assert_eq!(
            server.log.lock().unwrap()[0].header("authorization"),
            Some("Bearer gsk_warm")
        );
        let quiet = Server::start(|_| Reply::json(200, "{}"));
        client(&quiet, None).warm();
        std::thread::sleep(Duration::from_millis(200));
        assert!(quiet.log.lock().unwrap().is_empty());
    }

    #[test]
    fn empty_audio_returns_empty_text_without_a_request() {
        let server = Server::start(|_| whisper_ok("x"));
        let mut empty = audio();
        empty.bytes.clear();
        assert_eq!(
            client(&server, Some("k")).transcribe(&empty).unwrap().text,
            ""
        );
        assert!(server.log.lock().unwrap().is_empty());
    }

    #[test]
    fn sign_off_tails_are_cut_only_when_real_speech_comes_before() {
        let cut = strip_hallucinated_tail;
        assert_eq!(
            cut("I need to fix the HUD. Thank you"),
            "I need to fix the HUD."
        );
        assert_eq!(cut("Ship it, thanks for watching!"), "Ship it");
        assert_eq!(
            cut("Push the branch. Thank you so much for watching."),
            "Push the branch."
        );
        assert_eq!(cut("Send it to Bird."), "Send it to Bird.");
        assert_eq!(cut("Thank you"), "Thank you");
        assert_eq!(
            cut("Thank you for the notes, I will revise it"),
            "Thank you for the notes, I will revise it"
        );
        assert_eq!(cut("Done. Goodbye bye"), "Done. Goodbye bye");
    }

    #[test]
    fn segments_drop_a_low_confidence_tail_and_noise() {
        let dictionary = Dictionary::new(vec![], vec!["Leonidas".into(), "Kokoro".into()]);
        let body = json!({"segments": [
            {"text": " Open the file.", "avg_logprob": -0.1},
            {"text": " Noise loop loop", "avg_logprob": -0.2, "compression_ratio": 3.0},
            {"text": " Then save it.", "avg_logprob": -0.15},
            {"text": " Leonidas, Kokoro, L", "avg_logprob": -0.3, "no_speech_prob": 0.9},
            {"text": " Thank you.", "avg_logprob": -1.0}
        ]});
        assert_eq!(
            transcript_text(&body, &dictionary),
            "Open the file. Then save it."
        );
        assert_eq!(
            transcript_text(&json!({"segments": [], "text": " fallback "}), &dictionary),
            "fallback"
        );
    }

    #[test]
    fn a_confident_short_tail_is_kept() {
        let body = json!({"segments": [
            {"text": " Open it.", "avg_logprob": -0.1},
            {"text": " Okay.", "avg_logprob": -0.2}
        ]});
        assert_eq!(
            transcript_text(&body, &Dictionary::default()),
            "Open it. Okay."
        );
    }
}
