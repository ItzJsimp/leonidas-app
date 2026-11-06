//! Backup cloud providers, so dictation keeps working when Groq fails.
//!
//! Speech: Deepgram (`/listen`) and Gemini (native `generateContent` with inline audio).
//! Polish: Gemini on its OpenAI-compatible endpoint, through a second `GroqClient`.
//! `CloudChain` tries each speech provider in the configured order. Keys come from the
//! environment (`DEEPGRAM_API_KEY`, `GEMINI_API_KEY`) or the OS credential store. A key is
//! never logged, never put in an error and never printed.

use crate::config::{BackupConfig, Config};
use crate::contract::SttEngine;
use crate::credentials::{KeyStore, OsKeyStore};
use crate::engine::{EncodedAudio, Transcription};
use crate::groq::{CloudFailure, GroqClient};
use crate::local_stt::Cloud;
use crate::polish::SharedDictionary;
use serde_json::{json, Value};
use std::sync::Arc;
use std::time::Duration;

/// Most dictionary terms a speech request carries. Deepgram caps key terms near 500 tokens.
const MAX_TERMS: usize = 50;

/// A key from the environment variable, else the OS store entry of the same provider.
#[derive(Clone)]
pub struct ProviderKey {
    pub(crate) env_var: &'static str,
    pub(crate) store: Option<Arc<dyn KeyStore>>,
}

impl ProviderKey {
    pub fn new(env_var: &'static str, store: Option<Arc<dyn KeyStore>>) -> Self {
        Self { env_var, store }
    }

    /// The OS store entry `leonidas-scribe/<account>`, when the store opens.
    pub fn os(env_var: &'static str, account: &str) -> Self {
        let store = OsKeyStore::for_account(account)
            .ok()
            .map(|s| Arc::new(s) as Arc<dyn KeyStore>);
        Self::new(env_var, store)
    }

    pub fn get(&self) -> Option<String> {
        let usable = |k: &String| !k.trim().is_empty();
        std::env::var(self.env_var)
            .ok()
            .filter(usable)
            .or_else(|| self.store.as_ref().and_then(|s| s.get()).filter(usable))
            .map(|k| k.trim().to_owned())
    }
}

fn failure(provider: &str, error: &ureq::Error) -> CloudFailure {
    let message = match error {
        ureq::Error::StatusCode(401 | 403) => {
            format!("{provider} did not accept the speech key.")
        }
        ureq::Error::StatusCode(code) => format!("{provider} speech request failed (HTTP {code})."),
        ureq::Error::Timeout(_) => format!("{provider} speech request timed out."),
        _ => format!("Could not reach {provider}."),
    };
    CloudFailure {
        message,
        offline: true,
    }
}

fn no_key(provider: &str) -> CloudFailure {
    CloudFailure {
        message: format!("No {provider} key found."),
        offline: true,
    }
}

fn unreadable(provider: &str) -> CloudFailure {
    CloudFailure {
        message: format!("{provider} sent a reply the app could not read."),
        offline: true,
    }
}

/// No redirects: a redirect could carry the key header to another host.
fn agent() -> ureq::Agent {
    ureq::Agent::new_with_config(ureq::Agent::config_builder().max_redirects(0).build())
}

fn read_body(
    provider: &str,
    mut response: ureq::http::Response<ureq::Body>,
) -> Result<Value, CloudFailure> {
    let text = response
        .body_mut()
        .read_to_string()
        .map_err(|_| unreadable(provider))?;
    serde_json::from_str(&text).map_err(|_| unreadable(provider))
}

fn timeout(cfg: &BackupConfig, audio: &EncodedAudio) -> Duration {
    Duration::from_secs(cfg.speech_timeout_s) + Duration::from_millis(audio.duration_ms / 2)
}

/// Standard base64 with padding.
pub(crate) fn base64(bytes: &[u8]) -> String {
    const ABC: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(bytes.len().div_ceil(3) * 4);
    for chunk in bytes.chunks(3) {
        let n = (u32::from(chunk[0]) << 16)
            | (u32::from(*chunk.get(1).unwrap_or(&0)) << 8)
            | u32::from(*chunk.get(2).unwrap_or(&0));
        for i in 0..4 {
            if i <= chunk.len() {
                out.push(ABC[(n >> (18 - 6 * i) & 63) as usize] as char);
            } else {
                out.push('=');
            }
        }
    }
    out
}

/// Percent-encode a query value (RFC 3986 unreserved characters stay).
fn query_value(text: &str) -> String {
    text.bytes()
        .map(|b| match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'.' | b'_' | b'~' => {
                (b as char).to_string()
            }
            _ => format!("%{b:02X}"),
        })
        .collect()
}

// ---------------------------------------------------------------------------------------------
// Deepgram
// ---------------------------------------------------------------------------------------------

pub struct DeepgramSpeech {
    cfg: BackupConfig,
    key: ProviderKey,
    dictionary: Arc<SharedDictionary>,
    agent: ureq::Agent,
}

impl DeepgramSpeech {
    pub fn new(cfg: &BackupConfig, key: ProviderKey, dictionary: Arc<SharedDictionary>) -> Self {
        Self {
            cfg: cfg.clone(),
            key,
            dictionary,
            agent: agent(),
        }
    }

    fn url(&self) -> String {
        let mut url = format!(
            "{}/listen?model={}&smart_format=true&punctuate=true",
            self.cfg.deepgram_base_url.trim_end_matches('/'),
            query_value(&self.cfg.deepgram_model)
        );
        let dictionary = self.dictionary.current();
        for term in dictionary.terms().take(MAX_TERMS) {
            url.push_str("&keyterm=");
            url.push_str(&query_value(term));
        }
        url
    }
}

impl Cloud for DeepgramSpeech {
    fn ready(&self) -> bool {
        self.key.get().is_some()
    }
    fn transcribe_cloud(&self, audio: &EncodedAudio) -> Result<Transcription, CloudFailure> {
        const NAME: &str = "Deepgram";
        let key = self.key.get().ok_or_else(|| no_key(NAME))?;
        let response = self
            .agent
            .post(self.url())
            .header("Authorization", format!("Token {key}"))
            .header("Content-Type", audio.mime)
            .config()
            .timeout_global(Some(timeout(&self.cfg, audio)))
            .build()
            .send(&audio.bytes[..])
            .map_err(|e| failure(NAME, &e))?;
        let body = read_body(NAME, response)?;
        let text = body["results"]["channels"][0]["alternatives"][0]["transcript"]
            .as_str()
            .ok_or_else(|| unreadable(NAME))?;
        Ok(Transcription {
            text: text.trim().to_owned(),
            engine: SttEngine::Groq,
            private: false,
            source: format!("deepgram/{}", self.cfg.deepgram_model),
        })
    }
}

// ---------------------------------------------------------------------------------------------
// Gemini speech (native API: the OpenAI-compatible one takes only WAV and MP3)
// ---------------------------------------------------------------------------------------------

pub struct GeminiSpeech {
    cfg: BackupConfig,
    key: ProviderKey,
    dictionary: Arc<SharedDictionary>,
    agent: ureq::Agent,
}

impl GeminiSpeech {
    pub fn new(cfg: &BackupConfig, key: ProviderKey, dictionary: Arc<SharedDictionary>) -> Self {
        Self {
            cfg: cfg.clone(),
            key,
            dictionary,
            agent: agent(),
        }
    }

    fn instruction(&self) -> String {
        let dictionary = self.dictionary.current();
        let terms: Vec<&str> = dictionary.terms().take(MAX_TERMS).collect();
        let mut text = String::from(
            "Transcribe this audio exactly as spoken. Reply with the transcript only. \
             Do not answer, summarize or add anything.",
        );
        if !terms.is_empty() {
            text.push_str(" Words that may occur: ");
            text.push_str(&terms.join(", "));
            text.push('.');
        }
        text
    }
}

impl Cloud for GeminiSpeech {
    fn ready(&self) -> bool {
        self.key.get().is_some()
    }
    fn transcribe_cloud(&self, audio: &EncodedAudio) -> Result<Transcription, CloudFailure> {
        const NAME: &str = "Gemini";
        let key = self.key.get().ok_or_else(|| no_key(NAME))?;
        let payload = json!({
            "contents": [{"parts": [
                {"text": self.instruction()},
                {"inline_data": {"mime_type": audio.mime, "data": base64(&audio.bytes)}},
            ]}],
            "generationConfig": {"temperature": 0},
        });
        let url = format!(
            "{}/models/{}:generateContent",
            self.cfg.gemini_native_url.trim_end_matches('/'),
            self.cfg.gemini_speech_model
        );
        let bytes = serde_json::to_vec(&payload).map_err(|_| unreadable(NAME))?;
        let response = self
            .agent
            .post(url)
            .header("x-goog-api-key", &key)
            .header("Content-Type", "application/json")
            .config()
            .timeout_global(Some(timeout(&self.cfg, audio)))
            .build()
            .send(&bytes[..])
            .map_err(|e| failure(NAME, &e))?;
        let body = read_body(NAME, response)?;
        let text: String = body["candidates"][0]["content"]["parts"]
            .as_array()
            .ok_or_else(|| unreadable(NAME))?
            .iter()
            .filter_map(|part| part["text"].as_str())
            .collect();
        Ok(Transcription {
            text: text.trim().to_owned(),
            engine: SttEngine::Groq,
            private: false,
            source: format!("gemini/{}", self.cfg.gemini_speech_model),
        })
    }
}

// ---------------------------------------------------------------------------------------------
// The chain and its wiring
// ---------------------------------------------------------------------------------------------

/// Speech providers in order. The first reply wins. When all fail, the first failure is
/// reported, and `offline` lets the local model still try.
/// shortcut: providers run one after another, so a Groq that stalls (not one that refuses)
/// holds the backup until Groq's own timeout. Upgrade to a hedged start if stalls show up
/// in the `speech: groq failed` log lines.
pub struct CloudChain(pub Vec<(String, Arc<dyn Cloud>)>);

impl Cloud for CloudChain {
    fn transcribe_cloud(&self, audio: &EncodedAudio) -> Result<Transcription, CloudFailure> {
        let mut first: Option<CloudFailure> = None;
        let ready: Vec<_> = self.0.iter().filter(|(_, c)| c.ready()).collect();
        // With no key anywhere, the first provider still runs, so its "no key" message shows.
        let members = if ready.is_empty() {
            self.0.iter().take(1).collect()
        } else {
            ready
        };
        for (name, cloud) in members {
            match cloud.transcribe_cloud(audio) {
                Ok(done) => {
                    if first.is_some() {
                        eprintln!("speech: served by backup {name}");
                    }
                    return Ok(done);
                }
                Err(failure) => {
                    eprintln!("speech: {name} failed: {}", failure.message);
                    first.get_or_insert(failure);
                }
            }
        }
        Err(first.unwrap_or(CloudFailure {
            message: "No speech provider is set up.".into(),
            offline: true,
        }))
    }
}

/// The speech chain in `cfg.backup.speech` order. Unknown names are skipped.
pub fn speech_chain(
    cfg: &Config,
    groq: &GroqClient,
    dictionary: &Arc<SharedDictionary>,
) -> CloudChain {
    let backup = &cfg.backup;
    let mut chain: Vec<(String, Arc<dyn Cloud>)> = Vec::new();
    for name in &backup.speech {
        let cloud: Arc<dyn Cloud> = match name.as_str() {
            "groq" => Arc::new(groq.clone()),
            "deepgram" => Arc::new(DeepgramSpeech::new(
                backup,
                ProviderKey::os("DEEPGRAM_API_KEY", "deepgram"),
                dictionary.clone(),
            )),
            "gemini" => Arc::new(GeminiSpeech::new(
                backup,
                ProviderKey::os("GEMINI_API_KEY", "gemini"),
                dictionary.clone(),
            )),
            other => {
                eprintln!("speech: unknown provider {other}");
                continue;
            }
        };
        chain.push((name.clone(), cloud));
    }
    CloudChain(chain)
}

/// Polish clients after Groq, in `cfg.backup.polish` order (`groq` itself is skipped).
pub fn polish_backups(cfg: &Config, dictionary: &Arc<SharedDictionary>) -> Vec<GroqClient> {
    let backup = &cfg.backup;
    backup
        .polish
        .iter()
        .filter_map(|name| match name.as_str() {
            "gemini" => {
                let mut groq_cfg = cfg.groq.clone();
                groq_cfg.base_url = backup.gemini_openai_url.clone();
                groq_cfg.polish_model = backup.gemini_polish_model.clone();
                groq_cfg.backup_polish_model = String::new();
                let key = ProviderKey::os("GEMINI_API_KEY", "gemini");
                Some(GroqClient::named(
                    "gemini",
                    &groq_cfg,
                    key,
                    dictionary.clone(),
                ))
            }
            "groq" => None,
            other => {
                eprintln!("polish: unknown provider {other}");
                None
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::credentials::MemoryKeyStore;
    use crate::groq::mock::{Reply, Server};

    fn audio() -> EncodedAudio {
        EncodedAudio {
            bytes: b"RIFFdata".to_vec(),
            mime: "audio/wav",
            file_name: "audio.wav",
            duration_ms: 1000,
            pcm: Vec::new(),
        }
    }

    fn key(value: &str) -> ProviderKey {
        let store = MemoryKeyStore::default();
        store.set(value).unwrap();
        ProviderKey::new("SCRIBE_TEST_UNSET_KEY", Some(Arc::new(store)))
    }

    fn dictionary() -> Arc<SharedDictionary> {
        let dir = std::env::temp_dir().join(format!("scribe-backup-{}", std::process::id()));
        Arc::new(SharedDictionary::new(dir.join("dictionary.json")))
    }

    fn cfg(base: &str) -> BackupConfig {
        BackupConfig {
            deepgram_base_url: base.into(),
            gemini_native_url: base.into(),
            ..BackupConfig::default()
        }
    }

    #[test]
    fn base64_matches_the_standard() {
        assert_eq!(base64(b""), "");
        assert_eq!(base64(b"f"), "Zg==");
        assert_eq!(base64(b"fo"), "Zm8=");
        assert_eq!(base64(b"foo"), "Zm9v");
        assert_eq!(base64(b"foobar"), "Zm9vYmFy");
    }

    #[test]
    fn query_values_are_percent_encoded() {
        assert_eq!(query_value("Claude Code"), "Claude%20Code");
        assert_eq!(query_value("a&b=c"), "a%26b%3Dc");
    }

    #[test]
    fn deepgram_reads_the_transcript_and_names_itself() {
        let server = Server::start(|req| {
            assert!(req.path.contains("/listen?model=nova-3"));
            assert_eq!(req.header("authorization"), Some("Token dg-key"));
            Reply::json(
                200,
                r#"{"results":{"channels":[{"alternatives":[{"transcript":" hello there "}]}]}}"#,
            )
        });
        let speech = DeepgramSpeech::new(&cfg(&server.base_url()), key("dg-key"), dictionary());
        let done = speech.transcribe_cloud(&audio()).unwrap();
        assert_eq!(done.text, "hello there");
        assert_eq!(done.source, "deepgram/nova-3");
    }

    #[test]
    fn gemini_speech_sends_inline_audio_and_joins_parts() {
        let server = Server::start(|req| {
            assert!(req.path.ends_with(":generateContent"));
            assert_eq!(req.header("x-goog-api-key"), Some("gm-key"));
            let body = req.json();
            assert_eq!(
                body["contents"][0]["parts"][1]["inline_data"]["mime_type"],
                "audio/wav"
            );
            Reply::json(
                200,
                r#"{"candidates":[{"content":{"parts":[{"text":"hello "},{"text":"there"}]}}]}"#,
            )
        });
        let speech = GeminiSpeech::new(&cfg(&server.base_url()), key("gm-key"), dictionary());
        let done = speech.transcribe_cloud(&audio()).unwrap();
        assert_eq!(done.text, "hello there");
        assert!(done.source.starts_with("gemini/"));
    }

    struct Fails;
    impl Cloud for Fails {
        fn transcribe_cloud(&self, _: &EncodedAudio) -> Result<Transcription, CloudFailure> {
            Err(CloudFailure {
                message: "first failed".into(),
                offline: false,
            })
        }
    }

    #[test]
    fn chain_falls_through_to_the_backup() {
        let server = Server::start(|_| {
            Reply::json(
                200,
                r#"{"results":{"channels":[{"alternatives":[{"transcript":"from backup"}]}]}}"#,
            )
        });
        let chain = CloudChain(vec![
            ("groq".into(), Arc::new(Fails)),
            (
                "deepgram".into(),
                Arc::new(DeepgramSpeech::new(
                    &cfg(&server.base_url()),
                    key("k"),
                    dictionary(),
                )),
            ),
        ]);
        let done = chain.transcribe_cloud(&audio()).unwrap();
        assert_eq!(done.text, "from backup");
        assert_eq!(done.source, "deepgram/nova-3");
    }

    #[test]
    fn chain_reports_the_first_failure_when_all_fail() {
        let chain = CloudChain(vec![
            ("groq".into(), Arc::new(Fails)),
            (
                "deepgram".into(),
                Arc::new(DeepgramSpeech::new(
                    &cfg("http://127.0.0.1:9"),
                    ProviderKey::new("SCRIBE_TEST_UNSET_KEY", None),
                    dictionary(),
                )),
            ),
        ]);
        let failure = chain.transcribe_cloud(&audio()).unwrap_err();
        assert_eq!(failure.message, "first failed");
    }

    #[test]
    fn a_provider_without_a_key_is_skipped_without_a_request() {
        let server = Server::start(|_| Reply::json(500, "{}"));
        let keyless = DeepgramSpeech::new(
            &cfg(&server.base_url()),
            ProviderKey::new("SCRIBE_TEST_UNSET_KEY", None),
            dictionary(),
        );
        assert!(!keyless.ready());
        let gemini = Server::start(|_| {
            Reply::json(
                200,
                r#"{"candidates":[{"content":{"parts":[{"text":"served"}]}}]}"#,
            )
        });
        let chain = CloudChain(vec![
            ("deepgram".into(), Arc::new(keyless)),
            (
                "gemini".into(),
                Arc::new(GeminiSpeech::new(
                    &cfg(&gemini.base_url()),
                    key("k"),
                    dictionary(),
                )),
            ),
        ]);
        assert_eq!(chain.transcribe_cloud(&audio()).unwrap().text, "served");
        assert_eq!(server.log.lock().unwrap().len(), 0);
    }

    #[test]
    fn a_broken_groq_url_falls_through_to_the_backup() {
        let server = Server::start(|_| {
            Reply::json(
                200,
                r#"{"results":{"channels":[{"alternatives":[{"transcript":"served"}]}]}}"#,
            )
        });
        let mut config = Config::default();
        config.groq.base_url = "http://127.0.0.1:9/broken".into();
        config.backup = cfg(&server.base_url());
        config.backup.speech = vec!["groq".into(), "deepgram".into()];
        let groq_keys = Arc::new(MemoryKeyStore::default());
        groq_keys.set("groq-key").unwrap();
        let dictionary = dictionary();
        let groq = GroqClient::new(&config.groq, groq_keys, dictionary.clone()).with_env(|| None);
        let mut chain = speech_chain(&config, &groq, &dictionary);
        // The real chain reads DEEPGRAM_API_KEY; the test swaps in a stored key.
        chain.0[1].1 = Arc::new(DeepgramSpeech::new(&config.backup, key("k"), dictionary));
        let done = chain.transcribe_cloud(&audio()).unwrap();
        assert_eq!(done.text, "served");
        assert_eq!(done.source, "deepgram/nova-3");
    }
}
