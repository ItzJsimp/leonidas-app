//! v1.2 dictionary suggestions, mined from history.
//!
//! A suggestion is a run of 1 to 3 raw words that polish replaced with the same 1 to 3
//! words in at least `MIN_COUNT` dictations. Case and punctuation changes do not count.
//! A word run already in the dictionary, or rejected once, is never suggested.
//!
//! Polish also makes style edits ("gonna" to "going to", "I'm" to "I am"). Those are not
//! misheard words, so the correct run must hold a term: a name or a coined word. A term has
//! an inner capital or a digit (`GitHub`, `v1.2`), or a capital that is not only there because
//! a sentence starts (`Gersi` mid-sentence, or a word never written in lower case anywhere).

use crate::config::write_atomic;
use serde::Serialize;
use std::collections::{BTreeSet, HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

pub const MIN_COUNT: u32 = 2;
pub const MAX_ITEMS: usize = 50;
const MAX_RUN: usize = 3;
/// Longer dictations are skipped: the word alignment is quadratic.
const MAX_WORDS: usize = 400;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Suggestion {
    pub wrong: String,
    pub correct: String,
    pub count: u32,
}

/// Words without edge punctuation. Inner `'`, `-` and `.` stay (`don't`, `e-mail`, `v1.2`).
fn words(text: &str) -> Vec<&str> {
    text.split_whitespace()
        .map(|w| w.trim_matches(|c: char| !c.is_alphanumeric()))
        .filter(|w| !w.is_empty())
        .collect()
}

/// Words without edge punctuation, and for each one whether it starts a sentence.
fn words_with_starts(text: &str) -> (Vec<&str>, Vec<bool>) {
    let (mut out, mut starts) = (Vec::new(), Vec::new());
    let mut start = true;
    for token in text.split_whitespace() {
        let word = token.trim_matches(|c: char| !c.is_alphanumeric());
        if !word.is_empty() {
            out.push(word);
            starts.push(start);
        }
        start = token.ends_with(['.', '!', '?', ':']);
    }
    (out, starts)
}

/// Whether one written word is a term (see the module doc). `lower` holds every word seen
/// written in lower case in the polished history.
fn is_term(word: &str, sentence_start: bool, lower: &HashSet<String>) -> bool {
    if word == "I" || word.starts_with("I'") {
        return false;
    }
    let mut chars = word.chars();
    let first_upper = chars.next().is_some_and(char::is_uppercase);
    let inner_upper = chars.any(char::is_uppercase);
    let coined = word.chars().any(|c| c.is_ascii_digit()) && word.chars().any(char::is_alphabetic);
    inner_upper
        || coined
        || (first_upper && (!sentence_start || !lower.contains(&word.to_lowercase())))
}

/// The replaced runs between `raw` and `cleaned`, as (wrong in lower case, correct as written).
/// With `lower`, only runs whose correct side holds a term are kept. `None` keeps all (the old
/// rule, for the before and after report).
fn replacements(
    raw: &str,
    cleaned: &str,
    lower: Option<&HashSet<String>>,
) -> Vec<(String, String)> {
    let a = words(raw);
    let (b, starts) = words_with_starts(cleaned);
    if a.len() > MAX_WORDS || b.len() > MAX_WORDS {
        return Vec::new();
    }
    let la: Vec<String> = a.iter().map(|w| w.to_lowercase()).collect();
    let lb: Vec<String> = b.iter().map(|w| w.to_lowercase()).collect();
    // lcs[i][j]: longest common run of la[i..] and lb[j..].
    let mut lcs = vec![vec![0u16; lb.len() + 1]; la.len() + 1];
    for i in (0..la.len()).rev() {
        for j in (0..lb.len()).rev() {
            lcs[i][j] = if la[i] == lb[j] {
                lcs[i + 1][j + 1] + 1
            } else {
                lcs[i + 1][j].max(lcs[i][j + 1])
            };
        }
    }
    let mut out = Vec::new();
    let (mut i, mut j) = (0, 0);
    let (mut from_i, mut from_j) = (0, 0);
    let mut flush = |i: usize, j: usize, from_i: usize, from_j: usize| {
        let (removed, added) = (i - from_i, j - from_j);
        let term = lower.is_none_or(|lower| (from_j..j).any(|k| is_term(b[k], starts[k], lower)));
        if (1..=MAX_RUN).contains(&removed) && (1..=MAX_RUN).contains(&added) && term {
            out.push((la[from_i..i].join(" "), b[from_j..j].join(" ")));
        }
    };
    while i < la.len() || j < lb.len() {
        if i < la.len() && j < lb.len() && la[i] == lb[j] {
            flush(i, j, from_i, from_j);
            i += 1;
            j += 1;
            (from_i, from_j) = (i, j);
        } else if j < lb.len() && (i == la.len() || lcs[i][j + 1] >= lcs[i + 1][j]) {
            j += 1;
        } else {
            i += 1;
        }
    }
    flush(i, j, from_i, from_j);
    out
}

/// Suggestions from (raw, cleaned) pairs. `known` is true for a lower-case wrong run that
/// is already a dictionary key or was rejected.
pub fn mine<'a>(
    pairs: impl IntoIterator<Item = (&'a str, &'a str)>,
    known: impl Fn(&str) -> bool,
) -> Vec<Suggestion> {
    let mut items = mine_all(pairs, known, true);
    items.truncate(MAX_ITEMS);
    items
}

/// Every suggestion, sorted, with no cap. `terms: false` is the old rule (no term check).
fn mine_all<'a>(
    pairs: impl IntoIterator<Item = (&'a str, &'a str)>,
    known: impl Fn(&str) -> bool,
    terms: bool,
) -> Vec<Suggestion> {
    let pairs: Vec<(&str, &str)> = pairs.into_iter().collect();
    let lower: HashSet<String> = pairs
        .iter()
        .flat_map(|(_, cleaned)| words(cleaned))
        .filter(|w| w.chars().any(char::is_lowercase) && !w.chars().any(char::is_uppercase))
        .map(str::to_owned)
        .collect();
    let mut counts: HashMap<(String, String), u32> = HashMap::new();
    for (raw, cleaned) in pairs {
        let mut seen = BTreeSet::new();
        for pair in replacements(raw, cleaned, terms.then_some(&lower)) {
            if seen.insert(pair.clone()) {
                *counts.entry(pair).or_default() += 1;
            }
        }
    }
    let mut items: Vec<Suggestion> = counts
        .into_iter()
        .filter(|((wrong, _), count)| *count >= MIN_COUNT && !known(wrong))
        .map(|((wrong, correct), count)| Suggestion {
            wrong,
            correct,
            count,
        })
        .collect();
    items.sort_by(|a, b| {
        b.count
            .cmp(&a.count)
            .then_with(|| a.wrong.cmp(&b.wrong))
            .then_with(|| a.correct.cmp(&b.correct))
    });
    items
}

/// Rejected wrong runs, in lower case. File: a JSON array of strings.
pub struct Rejects {
    path: PathBuf,
    set: Mutex<BTreeSet<String>>,
}

impl Rejects {
    /// A missing or bad file gives an empty list.
    pub fn open(path: &Path) -> Self {
        let set = std::fs::read_to_string(path)
            .ok()
            .and_then(|text| serde_json::from_str::<BTreeSet<String>>(&text).ok())
            .unwrap_or_default();
        Self {
            path: path.to_path_buf(),
            set: Mutex::new(set),
        }
    }

    pub fn contains(&self, wrong: &str) -> bool {
        self.set
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .contains(&wrong.to_lowercase())
    }

    pub fn add(&self, wrong: &str) -> Result<(), String> {
        let mut set = self.set.lock().unwrap_or_else(|e| e.into_inner());
        let mut next = set.clone();
        next.insert(wrong.to_lowercase());
        let bytes = serde_json::to_vec_pretty(&next).map_err(|e| e.to_string())?;
        write_atomic(&self.path, &bytes).map_err(|e| e.to_string())?;
        *set = next;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn s(wrong: &str, correct: &str, count: u32) -> Suggestion {
        Suggestion {
            wrong: wrong.into(),
            correct: correct.into(),
            count,
        }
    }

    #[test]
    fn a_fix_seen_twice_is_suggested_with_its_count() {
        let pairs = [
            ("i talked to jersey today", "I talked to Gersi today."),
            ("jersey said hi", "Gersi said hi."),
            ("call jersey and leo nightness", "Call Gersi and Leonidas."),
            ("leo nightness is ready", "Leonidas is ready."),
            ("the weather is nice", "The weather is nice."),
        ];
        assert_eq!(
            mine(pairs, |_| false),
            [s("jersey", "Gersi", 3), s("leo nightness", "Leonidas", 2)]
        );
    }

    #[test]
    fn one_time_case_punctuation_long_and_known_changes_are_not_suggested() {
        let pairs = [
            ("send it to bob", "Send it to Rob."),
            ("hello, world", "Hello world!"),
            ("hello, world", "Hello world!"),
            ("we should go there now", "Let us leave for that place now."),
            ("we should go there now", "Let us leave for that place now."),
            ("btw it works", "By the way, it works."),
            ("btw it works", "By the way, it works."),
        ];
        assert_eq!(mine(pairs, |wrong| wrong == "btw"), []);
    }

    #[test]
    fn style_edits_by_polish_are_never_suggested() {
        let pairs = [
            ("i'm gonna go now", "I am going to go now."),
            ("i'm gonna go later", "I am going to go later."),
            ("so it's like a big deal", "So it is such as a big deal."),
            ("it's like a small deal", "It is such as a small deal."),
            ("make sure it is high quality", "Ensure it is high-quality."),
            (
                "make sure it is high quality now",
                "Ensure it is high-quality now.",
            ),
            // Real history writes common words in lower case somewhere.
            ("we ensure it", "We ensure it."),
            ("going home", "Going home."),
            ("we are going home", "We are going home."),
            ("open the cribe tab", "Open the Scribe tab."),
            ("the cribe tab works", "The Scribe tab works."),
        ];
        assert_eq!(mine(pairs, |_| false), [s("cribe", "Scribe", 2)]);
    }

    #[test]
    fn inner_capitals_and_digits_mark_a_term_at_a_sentence_start() {
        let lower: HashSet<String> = ["github".to_owned()].into();
        assert!(is_term("GitHub", true, &lower));
        assert!(is_term("v1", true, &lower));
        assert!(!is_term("Going", true, &["going".to_owned()].into()));
        assert!(is_term("Leonidas", true, &lower));
        assert!(!is_term("I", false, &lower));
        assert!(!is_term("I'm", false, &lower));
        assert!(!is_term("5", false, &lower));
    }

    /// Before and after report on a real engine folder. Run:
    /// `SCRIBE_REAL_DIR=<engine dir> cargo test --lib real_history -- --ignored --nocapture`.
    #[test]
    #[ignore = "reads a real engine folder from SCRIBE_REAL_DIR"]
    fn real_history_before_and_after() {
        let dir = std::path::PathBuf::from(std::env::var("SCRIBE_REAL_DIR").unwrap());
        let history = crate::history::History::open(&dir.join("history.jsonl"));
        let page = history.page(crate::history::MAX_LIMIT, None, None);
        let dictionary = crate::dictionary::Dictionary::load(&dir.join("dictionary.json"));
        let keys: HashSet<String> = dictionary
            .replacements
            .iter()
            .map(|(wrong, _)| wrong.to_lowercase())
            .collect();
        let rejects = Rejects::open(&dir.join("suggestions-rejected.json"));
        let pairs = || {
            page.items
                .iter()
                .map(|item| (item.raw_text.as_str(), item.cleaned_text.as_str()))
        };
        let known = |wrong: &str| keys.contains(wrong) || rejects.contains(wrong);
        let before = mine_all(pairs(), known, false);
        let after = mine_all(pairs(), known, true);
        println!(
            "dictations={} before={} after={}",
            page.items.len(),
            before.len(),
            after.len()
        );
        for item in after.iter().take(20) {
            println!("  {} {:?} -> {:?}", item.count, item.wrong, item.correct);
        }
    }

    #[test]
    fn a_fix_counts_once_per_dictation() {
        let pairs = [("jersey and jersey", "Gersi and Gersi")];
        assert_eq!(mine(pairs, |_| false), []);
    }

    #[test]
    fn rejects_persist_in_lower_case() {
        let dir = std::env::temp_dir().join(format!("scribe rejects {}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let path = dir.join("suggestions-rejected.json");
        let rejects = Rejects::open(&path);
        assert!(!rejects.contains("jersey"));
        rejects.add("Jersey").unwrap();
        assert!(rejects.contains("jersey"));
        assert!(Rejects::open(&path).contains("JERSEY"));
        let _ = std::fs::remove_dir_all(&dir);
    }
}
