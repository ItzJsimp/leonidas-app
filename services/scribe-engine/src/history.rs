//! Dictation history (contract v1.2). Newest first in memory; one JSON line per item on disk,
//! oldest first, so a save is one append. A line that does not parse is skipped, never fatal.

use crate::contract::{HistoryItem, HistoryMetrics, HistoryPage};
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

pub const DEFAULT_LIMIT: usize = 50;
pub const MAX_LIMIT: usize = 500;

/// What the engine knows about a finished dictation; the store adds `id` and `words`.
pub struct NewItem {
    pub at: String,
    pub mode: String,
    pub app: String,
    pub raw_text: String,
    pub cleaned_text: String,
    pub preset: Option<String>,
    pub metrics: HistoryMetrics,
    pub pasted: bool,
    /// Unix milliseconds of `at`, for the id.
    pub at_ms: i64,
}

pub struct History {
    path: PathBuf,
    /// Newest first.
    items: Mutex<Vec<HistoryItem>>,
}

impl History {
    /// Load `path`. A missing or unreadable file gives an empty history.
    pub fn open(path: &Path) -> Self {
        let mut items: Vec<HistoryItem> = fs::read_to_string(path)
            .map(|text| {
                text.lines()
                    .filter_map(|line| serde_json::from_str(line).ok())
                    .collect()
            })
            .unwrap_or_default();
        items.reverse();
        Self {
            path: path.to_path_buf(),
            items: Mutex::new(items),
        }
    }

    pub fn len(&self) -> usize {
        self.items.lock().unwrap().len()
    }

    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }

    /// Save one dictation. On a write error nothing is kept, so memory matches the file.
    pub fn add(&self, new: NewItem) -> Result<HistoryItem, String> {
        let mut items = self.items.lock().unwrap();
        let base = format!("d{}", new.at_ms);
        let mut id = base.clone();
        let mut n = 1;
        while items.iter().take(16).any(|item| item.id == id) {
            id = format!("{base}-{n}");
            n += 1;
        }
        let item = HistoryItem {
            id,
            at: new.at,
            mode: new.mode,
            app: new.app,
            words: new.cleaned_text.split_whitespace().count() as u32,
            raw_text: new.raw_text,
            cleaned_text: new.cleaned_text,
            preset: new.preset,
            metrics: new.metrics,
            pasted: new.pasted,
        };
        let mut line = serde_json::to_string(&item).map_err(|e| e.to_string())?;
        line.push('\n');
        if let Some(dir) = self.path.parent() {
            fs::create_dir_all(dir).map_err(|e| e.to_string())?;
        }
        OpenOptions::new()
            .create(true)
            .append(true)
            .open(&self.path)
            .and_then(|mut file| file.write_all(line.as_bytes()))
            .map_err(|e| e.to_string())?;
        items.insert(0, item.clone());
        Ok(item)
    }

    /// One page, newest first. `before` is the id of the last item of the previous page;
    /// an unknown `before` gives an empty page. Same rules as the mock engine.
    pub fn page(&self, limit: usize, before: Option<&str>, mode: Option<&str>) -> HistoryPage {
        let items = self.items.lock().unwrap();
        let mut list = items
            .iter()
            .filter(|item| mode.is_none_or(|m| item.mode == m));
        // `any` consumes the list up to and including the cursor.
        if let Some(before) = before {
            if !list.by_ref().any(|item| item.id == before) {
                return HistoryPage {
                    items: Vec::new(),
                    next: None,
                };
            }
        }
        let size = limit.clamp(1, MAX_LIMIT);
        let page: Vec<HistoryItem> = list.by_ref().take(size).cloned().collect();
        let next = if list.next().is_some() {
            page.last().map(|item| item.id.clone())
        } else {
            None
        };
        HistoryPage { items: page, next }
    }

    /// Delete one item. `Ok(false)` when the id is unknown.
    pub fn delete(&self, id: &str) -> Result<bool, String> {
        let mut items = self.items.lock().unwrap();
        let Some(index) = items.iter().position(|item| item.id == id) else {
            return Ok(false);
        };
        let mut text = String::new();
        for item in items.iter().rev().filter(|item| item.id != id) {
            text.push_str(&serde_json::to_string(item).map_err(|e| e.to_string())?);
            text.push('\n');
        }
        let tmp = self.path.with_extension("jsonl.tmp");
        fs::write(&tmp, text)
            .and_then(|()| fs::rename(&tmp, &self.path))
            .map_err(|e| e.to_string())?;
        items.remove(index);
        Ok(true)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp(name: &str) -> PathBuf {
        let dir =
            std::env::temp_dir().join(format!("scribe-history-{}-{name}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        dir.join("history.jsonl")
    }

    fn new_item(at_ms: i64, mode: &str, text: &str) -> NewItem {
        NewItem {
            at: crate::contract::iso_from_unix_ms(at_ms),
            mode: mode.into(),
            app: String::new(),
            raw_text: text.to_lowercase(),
            cleaned_text: text.into(),
            preset: None,
            metrics: HistoryMetrics {
                transcribe_ms: 700,
                polish_ms: 50,
                total_ms: 760,
            },
            pasted: true,
            at_ms,
        }
    }

    #[test]
    fn add_survives_a_restart_newest_first() {
        let path = temp("restart");
        let history = History::open(&path);
        let first = history
            .add(new_item(1_000, "hold", "Hello there."))
            .unwrap();
        history
            .add(new_item(2_000, "toggle", "Second one."))
            .unwrap();
        assert_eq!(first.words, 2);
        assert_eq!(first.id, "d1000");

        let reopened = History::open(&path);
        let page = reopened.page(DEFAULT_LIMIT, None, None);
        let texts: Vec<&str> = page.items.iter().map(|i| i.cleaned_text.as_str()).collect();
        assert_eq!(texts, ["Second one.", "Hello there."]);
        assert_eq!(page.next, None);
    }

    #[test]
    fn same_millisecond_gets_a_unique_id() {
        let history = History::open(&temp("ids"));
        let a = history.add(new_item(5, "hold", "a")).unwrap();
        let b = history.add(new_item(5, "hold", "b")).unwrap();
        assert_ne!(a.id, b.id);
    }

    #[test]
    fn pages_with_a_cursor_and_a_mode_filter() {
        let history = History::open(&temp("pages"));
        for i in 0..5 {
            let mode = if i % 2 == 0 { "hold" } else { "toggle" };
            history
                .add(new_item(i, mode, &format!("item {i}")))
                .unwrap();
        }
        let first = history.page(2, None, None);
        assert_eq!(first.items.len(), 2);
        assert_eq!(first.next.as_deref(), Some("d3"));
        let second = history.page(2, first.next.as_deref(), None);
        let ids: Vec<&str> = second.items.iter().map(|i| i.id.as_str()).collect();
        assert_eq!(ids, ["d2", "d1"]);
        let last = history.page(2, second.next.as_deref(), None);
        assert_eq!(last.items.len(), 1);
        assert_eq!(last.next, None);

        let holds = history.page(10, None, Some("hold"));
        assert!(holds.items.iter().all(|i| i.mode == "hold"));
        assert_eq!(holds.items.len(), 3);
        assert!(history.page(10, Some("missing"), None).items.is_empty());
    }

    #[test]
    fn delete_rewrites_the_file_and_skips_bad_lines_on_load() {
        let path = temp("delete");
        let history = History::open(&path);
        history.add(new_item(1, "hold", "keep")).unwrap();
        history.add(new_item(2, "hold", "drop")).unwrap();
        assert_eq!(history.delete("d2"), Ok(true));
        assert_eq!(history.delete("d2"), Ok(false));

        let mut text = fs::read_to_string(&path).unwrap();
        text.push_str("{not json\n");
        fs::write(&path, text).unwrap();
        let reopened = History::open(&path);
        assert_eq!(reopened.len(), 1);
        assert_eq!(reopened.page(10, None, None).items[0].cleaned_text, "keep");
    }
}
