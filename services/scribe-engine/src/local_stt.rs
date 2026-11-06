//! Offline speech-to-text: a whisper.cpp model that downloads on first use.
//! Cloud stays first. The router uses the local model when private mode is on, or when
//! the cloud cannot serve the request (no key, no network, timeout, rate limit, server error).

use crate::contract::SttEngine;
use crate::engine::{EncodedAudio, Transcriber, Transcription};
use crate::groq::{CloudFailure, GroqClient};
use sha2::{Digest, Sha256};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

pub const MODEL_FILE: &str = "ggml-base.en-q5_1.bin";
pub const MODEL_URL: &str =
    "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en-q5_1.bin";
pub const MODEL_SHA256: &str = "4baf70dd0d7c4247ba2b81fafd9c01005ac77c2f9ef064e00dcf195d0e2fdd2f";
/// The model unloads after this long without a dictation, so idle RAM stays small.
pub const UNLOAD_AFTER: Duration = Duration::from_secs(120);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ModelStatus {
    Absent,
    Downloading,
    Ready,
}

impl ModelStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Absent => "absent",
            Self::Downloading => "downloading",
            Self::Ready => "ready",
        }
    }
}

pub trait LocalModel: Send + Sync {
    fn transcribe(&self, pcm: &[f32]) -> Result<String, String>;
    fn status(&self) -> ModelStatus;
}

pub trait Cloud: Send + Sync {
    fn transcribe_cloud(&self, audio: &EncodedAudio) -> Result<Transcription, CloudFailure>;
    /// False when the provider has no key, so a chain skips it without a request or a log line.
    fn ready(&self) -> bool {
        true
    }
}

impl Cloud for GroqClient {
    fn transcribe_cloud(&self, audio: &EncodedAudio) -> Result<Transcription, CloudFailure> {
        GroqClient::transcribe_cloud(self, audio)
    }
}

/// Where one dictation goes.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Backend {
    /// Private mode: the local model only. No audio request leaves the device.
    LocalOnly,
    /// Cloud first, the local model when the cloud cannot serve the request.
    CloudThenLocal,
}

pub fn choose_backend(private_mode: bool) -> Backend {
    if private_mode {
        Backend::LocalOnly
    } else {
        Backend::CloudThenLocal
    }
}

pub struct Router {
    cloud: Arc<dyn Cloud>,
    local: Arc<dyn LocalModel>,
    private_mode: AtomicBool,
}

impl Router {
    pub fn new(cloud: Arc<dyn Cloud>, local: Arc<dyn LocalModel>, private_mode: bool) -> Self {
        Self {
            cloud,
            local,
            private_mode: AtomicBool::new(private_mode),
        }
    }

    /// v1.2: a saved private mode applies to the next transcription.
    pub fn set_private_mode(&self, on: bool) {
        self.private_mode.store(on, Ordering::Relaxed);
    }

    fn run_local(&self, audio: &EncodedAudio, private: bool) -> Result<Transcription, String> {
        if audio.pcm.is_empty() {
            return Err("The recording has no audio for the offline model.".into());
        }
        let text = self.local.transcribe(&audio.pcm)?;
        Ok(Transcription {
            text,
            engine: SttEngine::Local,
            private,
            source: format!("local/{}", MODEL_FILE.trim_end_matches(".bin")),
        })
    }
}

impl Transcriber for Router {
    fn private_mode(&self) -> bool {
        self.private_mode.load(Ordering::Relaxed)
    }
    fn transcribe(&self, audio: &EncodedAudio) -> Result<Transcription, String> {
        let private = self.private_mode.load(Ordering::Relaxed);
        if audio.bytes.is_empty() {
            return Ok(Transcription {
                text: String::new(),
                engine: SttEngine::Local,
                private,
                source: String::new(),
            });
        }
        match choose_backend(private) {
            Backend::LocalOnly => self.run_local(audio, private),
            Backend::CloudThenLocal => match self.cloud.transcribe_cloud(audio) {
                Ok(done) => Ok(done),
                Err(failure) if failure.offline => self.run_local(audio, private),
                Err(failure) => Err(failure.message),
            },
        }
    }
}

// ---------------------------------------------------------------------------------------------
// Model file: download once, verify the pinned hash
// ---------------------------------------------------------------------------------------------

pub fn file_matches(path: &Path, sha256: &str) -> bool {
    let Ok(mut file) = std::fs::File::open(path) else {
        return false;
    };
    let mut hasher = Sha256::new();
    let mut buffer = vec![0u8; 1 << 16];
    loop {
        match file.read(&mut buffer) {
            Ok(0) => break,
            Ok(n) => hasher.update(&buffer[..n]),
            Err(_) => return false,
        }
    }
    hex(&hasher.finalize()) == sha256
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

/// Download `url` to `dest` through a `.part` file. The file moves into place only when its
/// SHA-256 equals `sha256`; any other result deletes the partial file.
pub fn download(url: &str, dest: &Path, sha256: &str) -> Result<(), String> {
    if let Some(dir) = dest.parent() {
        std::fs::create_dir_all(dir).map_err(|e| format!("Cannot create the model folder: {e}"))?;
    }
    let part = dest.with_extension("part");
    let result = (|| {
        let agent = ureq::Agent::new_with_config(
            ureq::Agent::config_builder()
                .timeout_global(Some(Duration::from_secs(30 * 60)))
                .build(),
        );
        let mut response = agent
            .get(url)
            .call()
            .map_err(|e| format!("Cannot download the offline model: {e}"))?;
        let mut reader = response.body_mut().as_reader();
        let mut out = std::fs::File::create(&part).map_err(|e| e.to_string())?;
        let mut hasher = Sha256::new();
        let mut buffer = vec![0u8; 1 << 16];
        loop {
            let n = reader
                .read(&mut buffer)
                .map_err(|e| format!("Download stopped: {e}"))?;
            if n == 0 {
                break;
            }
            hasher.update(&buffer[..n]);
            out.write_all(&buffer[..n]).map_err(|e| e.to_string())?;
        }
        out.flush().map_err(|e| e.to_string())?;
        if hex(&hasher.finalize()) != sha256 {
            return Err("The offline model failed its integrity check.".into());
        }
        Ok(())
    })();
    match result {
        Ok(()) => std::fs::rename(&part, dest).map_err(|e| e.to_string()),
        Err(e) => {
            let _ = std::fs::remove_file(&part);
            Err(e)
        }
    }
}

// ---------------------------------------------------------------------------------------------
// whisper.cpp through whisper-rs
// ---------------------------------------------------------------------------------------------

struct Loaded {
    context: whisper_rs::WhisperContext,
    last_used: Instant,
}

#[derive(Default)]
struct Slot {
    loaded: Option<Loaded>,
    downloading: bool,
    reaper: bool,
}

pub struct WhisperLocal {
    path: PathBuf,
    url: String,
    sha256: String,
    unload_after: Duration,
    slot: Arc<Mutex<Slot>>,
}

impl WhisperLocal {
    pub fn new(models_dir: &Path) -> Self {
        Self::with_source(
            models_dir.join(MODEL_FILE),
            MODEL_URL,
            MODEL_SHA256,
            UNLOAD_AFTER,
        )
    }

    pub fn with_source(path: PathBuf, url: &str, sha256: &str, unload_after: Duration) -> Self {
        Self {
            path,
            url: url.into(),
            sha256: sha256.into(),
            unload_after,
            slot: Arc::new(Mutex::new(Slot::default())),
        }
    }

    /// Start the one-time download in the background. A file that is already there is not
    /// downloaded again. Safe to call often.
    pub fn ensure_downloaded(&self) {
        {
            let mut slot = self.slot.lock().unwrap_or_else(|e| e.into_inner());
            if slot.downloading || self.path.exists() {
                return;
            }
            slot.downloading = true;
        }
        let (slot, path, url, sha256) = (
            self.slot.clone(),
            self.path.clone(),
            self.url.clone(),
            self.sha256.clone(),
        );
        let spawned = std::thread::Builder::new()
            .name("scribe-model-download".into())
            .spawn(move || {
                if let Err(e) = download(&url, &path, &sha256) {
                    eprintln!("offline model: {e}");
                }
                slot.lock().unwrap_or_else(|e| e.into_inner()).downloading = false;
            });
        if spawned.is_err() {
            self.slot
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .downloading = false;
        }
    }

    fn start_reaper(&self, slot: &mut Slot) {
        if slot.reaper {
            return;
        }
        slot.reaper = true;
        let (shared, idle) = (self.slot.clone(), self.unload_after);
        let spawned = std::thread::Builder::new()
            .name("scribe-model-unload".into())
            .spawn(move || loop {
                std::thread::sleep((idle / 4).max(Duration::from_millis(50)));
                let mut slot = shared.lock().unwrap_or_else(|e| e.into_inner());
                match &slot.loaded {
                    Some(l) if l.last_used.elapsed() < idle => {}
                    _ => {
                        slot.loaded = None;
                        slot.reaper = false;
                        return;
                    }
                }
            });
        if spawned.is_err() {
            slot.reaper = false;
        }
    }
}

impl LocalModel for WhisperLocal {
    fn status(&self) -> ModelStatus {
        if self
            .slot
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .downloading
        {
            ModelStatus::Downloading
        } else if self.path.exists() {
            ModelStatus::Ready
        } else {
            ModelStatus::Absent
        }
    }

    fn transcribe(&self, pcm: &[f32]) -> Result<String, String> {
        if !self.path.exists() {
            self.ensure_downloaded();
            return Err(
                "The offline model downloads now (about 60 MB). Try again in a minute.".into(),
            );
        }
        let mut slot = self.slot.lock().unwrap_or_else(|e| e.into_inner());
        if slot.loaded.is_none() {
            let context = whisper_rs::WhisperContext::new_with_params(
                &self.path,
                whisper_rs::WhisperContextParameters::default(),
            )
            .map_err(|e| format!("Cannot load the offline model: {e}"))?;
            slot.loaded = Some(Loaded {
                context,
                last_used: Instant::now(),
            });
        }
        self.start_reaper(&mut slot);
        let loaded = slot
            .loaded
            .as_mut()
            .ok_or("The offline model is not loaded.")?;
        let mut state = loaded
            .context
            .create_state()
            .map_err(|e| format!("Offline model error: {e}"))?;
        let mut params =
            whisper_rs::FullParams::new(whisper_rs::SamplingStrategy::Greedy { best_of: 1 });
        let threads = std::thread::available_parallelism().map_or(4, |n| n.get().min(4));
        params.set_n_threads(threads as i32);
        params.set_language(Some("en"));
        params.set_translate(false);
        params.set_no_context(true);
        params.set_print_special(false);
        params.set_print_progress(false);
        params.set_print_realtime(false);
        params.set_print_timestamps(false);
        params.set_suppress_blank(true);
        state
            .full(params, pcm)
            .map_err(|e| format!("Offline transcription failed: {e}"))?;
        let mut text = String::new();
        for segment in state.as_iter() {
            text.push_str(&segment.to_str_lossy().map_err(|e| e.to_string())?);
        }
        loaded.last_used = Instant::now();
        Ok(text.trim().to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};

    struct FakeCloud {
        reply: Result<&'static str, CloudFailure>,
        calls: AtomicUsize,
    }

    impl Cloud for FakeCloud {
        fn transcribe_cloud(&self, _: &EncodedAudio) -> Result<Transcription, CloudFailure> {
            self.calls.fetch_add(1, Ordering::SeqCst);
            self.reply.clone().map(|text| Transcription {
                text: text.into(),
                engine: SttEngine::Groq,
                private: false,
                source: "groq/fake".into(),
            })
        }
    }

    struct FakeLocal(Result<&'static str, &'static str>);

    impl LocalModel for FakeLocal {
        fn transcribe(&self, _: &[f32]) -> Result<String, String> {
            self.0.map(String::from).map_err(String::from)
        }
        fn status(&self) -> ModelStatus {
            ModelStatus::Ready
        }
    }

    fn audio() -> EncodedAudio {
        EncodedAudio {
            bytes: vec![1],
            mime: "audio/flac",
            file_name: "audio.flac",
            duration_ms: 1000,
            pcm: vec![0.1; 16_000],
        }
    }

    fn failure(offline: bool) -> CloudFailure {
        CloudFailure {
            message: "cloud down".into(),
            offline,
        }
    }

    fn router(
        cloud: Result<&'static str, CloudFailure>,
        local: Result<&'static str, &'static str>,
        private: bool,
    ) -> (Router, Arc<FakeCloud>) {
        let cloud = Arc::new(FakeCloud {
            reply: cloud,
            calls: AtomicUsize::new(0),
        });
        (
            Router::new(cloud.clone(), Arc::new(FakeLocal(local)), private),
            cloud,
        )
    }

    #[test]
    fn backend_table() {
        assert_eq!(choose_backend(true), Backend::LocalOnly);
        assert_eq!(choose_backend(false), Backend::CloudThenLocal);
    }

    #[test]
    fn cloud_wins_when_it_works() {
        let (r, cloud) = router(Ok("cloud text"), Ok("local text"), false);
        let t = r.transcribe(&audio()).unwrap();
        assert_eq!((t.text.as_str(), t.engine), ("cloud text", SttEngine::Groq));
        assert_eq!(cloud.calls.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn offline_cloud_failure_falls_back_to_local() {
        let (r, _) = router(Err(failure(true)), Ok("local text"), false);
        let t = r.transcribe(&audio()).unwrap();
        assert_eq!(
            (t.text.as_str(), t.engine),
            ("local text", SttEngine::Local)
        );
    }

    #[test]
    fn a_bad_key_does_not_fall_back() {
        let (r, _) = router(Err(failure(false)), Ok("local text"), false);
        assert_eq!(r.transcribe(&audio()), Err("cloud down".into()));
    }

    #[test]
    fn private_mode_never_calls_the_cloud() {
        let (r, cloud) = router(Ok("cloud text"), Ok("local text"), true);
        let t = r.transcribe(&audio()).unwrap();
        assert_eq!(t.engine, SttEngine::Local);
        assert_eq!(cloud.calls.load(Ordering::SeqCst), 0);
    }

    #[test]
    fn private_mode_turned_on_live_stops_cloud_calls() {
        let (r, cloud) = router(Ok("cloud text"), Ok("local text"), false);
        assert_eq!(r.transcribe(&audio()).unwrap().engine, SttEngine::Groq);
        r.set_private_mode(true);
        assert_eq!(r.transcribe(&audio()).unwrap().engine, SttEngine::Local);
        assert_eq!(cloud.calls.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn private_mode_local_error_is_reported_not_sent_to_cloud() {
        let (r, cloud) = router(Ok("cloud text"), Err("model missing"), true);
        assert_eq!(r.transcribe(&audio()), Err("model missing".into()));
        assert_eq!(cloud.calls.load(Ordering::SeqCst), 0);
    }

    #[test]
    fn empty_audio_is_empty_text_without_any_backend() {
        let (r, cloud) = router(Ok("cloud text"), Ok("local text"), false);
        let mut a = audio();
        a.bytes.clear();
        assert_eq!(r.transcribe(&a).unwrap().text, "");
        assert_eq!(cloud.calls.load(Ordering::SeqCst), 0);
    }

    #[test]
    fn missing_pcm_is_a_clear_error() {
        let (r, _) = router(Err(failure(true)), Ok("local text"), false);
        let mut a = audio();
        a.pcm.clear();
        assert!(r.transcribe(&a).unwrap_err().contains("no audio"));
    }

    fn temp(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("scribe-local-{}-{name}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn sha(bytes: &[u8]) -> String {
        hex(&Sha256::digest(bytes))
    }

    fn serve(body: &'static [u8]) -> String {
        let server = tiny_http::Server::http("127.0.0.1:0").unwrap();
        let url = format!("http://{}/m.bin", server.server_addr().to_ip().unwrap());
        std::thread::spawn(move || {
            for request in server.incoming_requests().take(2) {
                let _ = request.respond(tiny_http::Response::from_data(body));
            }
        });
        url
    }

    #[test]
    fn download_keeps_a_file_with_the_pinned_hash() {
        let dir = temp("good");
        let dest = dir.join("m.bin");
        download(&serve(b"model bytes"), &dest, &sha(b"model bytes")).unwrap();
        assert!(file_matches(&dest, &sha(b"model bytes")));
        assert!(!dest.with_extension("part").exists());
    }

    #[test]
    fn download_rejects_and_removes_a_corrupt_file() {
        let dir = temp("bad");
        let dest = dir.join("m.bin");
        let err = download(&serve(b"model bytes"), &dest, &sha(b"other")).unwrap_err();
        assert!(err.contains("integrity"));
        assert!(!dest.exists() && !dest.with_extension("part").exists());
    }

    #[test]
    fn missing_model_starts_one_download_and_reports_it() {
        let dir = temp("first-use");
        let dest = dir.join("m.bin");
        let local = WhisperLocal::with_source(
            dest.clone(),
            &serve(b"model bytes"),
            &sha(b"model bytes"),
            UNLOAD_AFTER,
        );
        assert_eq!(local.status(), ModelStatus::Absent);
        assert!(local
            .transcribe(&[0.0; 16])
            .unwrap_err()
            .contains("downloads now"));
        for _ in 0..100 {
            if dest.exists() {
                break;
            }
            std::thread::sleep(Duration::from_millis(50));
        }
        assert!(dest.exists());
    }
}

#[cfg(test)]
mod live {
    use super::*;

    /// Run by hand: `SCRIBE_LIVE_WAV=<16 kHz mono 16-bit wav> cargo test live_local -- --ignored --nocapture`.
    #[test]
    #[ignore]
    fn live_local_transcription() {
        let wav = std::env::var("SCRIBE_LIVE_WAV").expect("set SCRIBE_LIVE_WAV");
        let dir =
            std::env::var("SCRIBE_LIVE_MODELS").unwrap_or_else(|_| "target/live-models".into());
        let dest = Path::new(&dir).join(MODEL_FILE);
        if !dest.exists() {
            download(MODEL_URL, &dest, MODEL_SHA256).unwrap();
        }
        let bytes = std::fs::read(wav).unwrap();
        let pcm: Vec<f32> = bytes[44..]
            .as_chunks::<2>()
            .0
            .iter()
            .map(|b| f32::from(i16::from_le_bytes(*b)) / 32768.0)
            .collect();
        let local = WhisperLocal::with_source(
            dest.clone(),
            MODEL_URL,
            MODEL_SHA256,
            Duration::from_millis(400),
        );
        let started = Instant::now();
        let text = local.transcribe(&pcm).unwrap();
        println!(
            "LOCAL TEXT: {text:?} in {:?} for {:.1}s audio",
            started.elapsed(),
            pcm.len() as f32 / 16000.0
        );
        let again = Instant::now();
        local.transcribe(&pcm).unwrap();
        println!("WARM: {:?}", again.elapsed());
        assert!(text.to_lowercase().contains("invoice"));
        // The model unloads after the idle time; the caller watches the working set fall.
        std::thread::sleep(Duration::from_secs(4));
    }
}
