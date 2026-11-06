//! Audio of dictations that no provider could transcribe, so a retry can run them again.
//!
//! File name: `<unix ms>-<duration ms>.<flac|wav>`. The store keeps the newest `MAX_FILES`
//! and drops files older than `MAX_AGE`. It lives next to the history file.

use crate::engine::EncodedAudio;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime};

pub const MAX_FILES: usize = 20;
pub const MAX_AGE: Duration = Duration::from_secs(7 * 24 * 60 * 60);

pub struct FailedStore {
    dir: PathBuf,
}

impl FailedStore {
    pub fn new(dir: &Path) -> Self {
        Self {
            dir: dir.to_path_buf(),
        }
    }

    /// Save one recording. Old and surplus files go first.
    pub fn save(&self, audio: &EncodedAudio) -> Result<PathBuf, String> {
        if audio.bytes.is_empty() {
            return Err("No audio to save.".into());
        }
        std::fs::create_dir_all(&self.dir).map_err(|e| e.to_string())?;
        let ext = if audio.mime == "audio/flac" {
            "flac"
        } else {
            "wav"
        };
        let path = self.dir.join(format!(
            "{}-{}.{ext}",
            crate::contract::unix_ms_now(),
            audio.duration_ms
        ));
        crate::config::write_atomic(&path, &audio.bytes).map_err(|e| e.to_string())?;
        self.prune();
        Ok(path)
    }

    /// Saved files, newest first.
    fn files(&self) -> Vec<PathBuf> {
        let mut files: Vec<PathBuf> = std::fs::read_dir(&self.dir)
            .map(|entries| {
                entries
                    .filter_map(|e| e.ok().map(|e| e.path()))
                    .filter(|p| {
                        matches!(p.extension().and_then(|e| e.to_str()), Some("flac" | "wav"))
                    })
                    .collect()
            })
            .unwrap_or_default();
        files.sort_by_key(|p| std::cmp::Reverse(stamp(p)));
        files
    }

    pub fn count(&self) -> usize {
        self.files().len()
    }

    /// The newest saved recording, ready to send again.
    pub fn latest(&self) -> Option<(PathBuf, EncodedAudio)> {
        // Never offer a take past MAX_AGE, even when no save has pruned it yet.
        self.prune();
        let path = self.files().into_iter().next()?;
        let bytes = std::fs::read(&path).ok()?;
        let flac = path.extension().is_some_and(|e| e == "flac");
        let duration_ms = stamp(&path).1;
        Some((
            path,
            EncodedAudio {
                bytes,
                mime: if flac { "audio/flac" } else { "audio/wav" },
                file_name: if flac { "audio.flac" } else { "audio.wav" },
                duration_ms,
                pcm: Vec::new(),
            },
        ))
    }

    pub fn remove(&self, path: &Path) {
        if path.parent() == Some(self.dir.as_path()) {
            let _ = std::fs::remove_file(path);
        }
    }

    fn prune(&self) {
        let now = SystemTime::now();
        for (index, path) in self.files().into_iter().enumerate() {
            let old = std::fs::metadata(&path)
                .and_then(|m| m.modified())
                .ok()
                .and_then(|at| now.duration_since(at).ok())
                .is_some_and(|age| age > MAX_AGE);
            if index >= MAX_FILES || old {
                let _ = std::fs::remove_file(&path);
            }
        }
    }
}

/// (saved at, duration) from the file name. An unknown name sorts last.
fn stamp(path: &Path) -> (u64, u64) {
    let stem = path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or_default();
    let mut parts = stem.splitn(2, '-').map(|p| p.parse().unwrap_or(0));
    (parts.next().unwrap_or(0), parts.next().unwrap_or(0))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn audio(byte: u8) -> EncodedAudio {
        EncodedAudio {
            bytes: vec![byte; 8],
            mime: "audio/flac",
            file_name: "audio.flac",
            duration_ms: 1500,
            pcm: Vec::new(),
        }
    }

    fn store(name: &str) -> FailedStore {
        let dir = std::env::temp_dir().join(format!("scribe-failed-{}-{name}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        FailedStore::new(&dir)
    }

    #[test]
    fn the_newest_save_comes_back_with_its_duration() {
        let s = store("latest");
        assert!(s.latest().is_none());
        s.save(&audio(1)).unwrap();
        std::thread::sleep(Duration::from_millis(5));
        let newest = s.save(&audio(2)).unwrap();
        let (path, got) = s.latest().unwrap();
        assert_eq!(path, newest);
        assert_eq!(
            (got.bytes[0], got.duration_ms, got.mime),
            (2, 1500, "audio/flac")
        );
        s.remove(&path);
        assert_eq!(s.count(), 1);
    }

    #[test]
    fn a_take_past_max_age_is_never_offered() {
        let s = store("age");
        let path = s.save(&audio(1)).unwrap();
        let old = SystemTime::now() - MAX_AGE - Duration::from_secs(60);
        std::fs::File::options()
            .write(true)
            .open(&path)
            .unwrap()
            .set_modified(old)
            .unwrap();
        assert!(s.latest().is_none());
        assert_eq!(s.count(), 0);
    }

    #[test]
    fn the_store_keeps_at_most_max_files() {
        let s = store("cap");
        for i in 0..(MAX_FILES + 3) {
            s.save(&audio(i as u8)).unwrap();
            std::thread::sleep(Duration::from_millis(2));
        }
        assert_eq!(s.count(), MAX_FILES);
    }
}
