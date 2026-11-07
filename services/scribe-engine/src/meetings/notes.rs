//! Meeting notes and Ask, on the Groq free tier. Slice S6.
//!
//! The free chat models allow about 8k tokens a minute each. A short transcript gets one
//! note call. A long one is condensed in parts first (map), then noted (reduce). A rate
//! limit moves to the other model, then waits and tries again.

use crate::groq::{ApiError, GroqClient};
use serde_json::{json, Value};
use std::time::Duration;

/// Free Groq chat models, best first. Each has its own per-minute budget.
pub const MODELS: [&str; 2] = ["openai/gpt-oss-120b", "openai/gpt-oss-20b"];
/// A transcript part fits one call with room for the prompt and the reply.
const PART_TOKENS: usize = 5_000;
const CHARS_PER_TOKEN: usize = 4;
const RATE_WAIT: Duration = Duration::from_secs(20);
const TRIES: usize = 6;
/// Ask reads the newest part of the transcript.
const ASK_CHARS: usize = PART_TOKENS * CHARS_PER_TOKEN;

pub struct Template {
    pub id: &'static str,
    pub name: &'static str,
    body: &'static str,
}

pub const TEMPLATES: [Template; 4] = [
    Template {
        id: "default",
        name: "Standard notes",
        body: include_str!("templates/default.md"),
    },
    Template {
        id: "client-call",
        name: "Client or sales call",
        body: include_str!("templates/client-call.md"),
    },
    Template {
        id: "one-on-one",
        name: "One-on-one",
        body: include_str!("templates/one-on-one.md"),
    },
    Template {
        id: "brainstorm",
        name: "Brainstorm",
        body: include_str!("templates/brainstorm.md"),
    },
];

/// The section instructions, without the front matter. Unknown ids get the default.
pub fn template(id: &str) -> &'static str {
    let body = TEMPLATES
        .iter()
        .find(|t| t.id == id)
        .unwrap_or(&TEMPLATES[0])
        .body;
    // Skip the front matter: everything up to the second `---` line (files may use CRLF).
    let mut fences = body
        .match_indices("---")
        .filter(|(i, _)| *i == 0 || body[..*i].ends_with('\n'));
    match (fences.next(), fences.next()) {
        (Some(_), Some((end, _))) => body[end + 3..].trim(),
        _ => body.trim(),
    }
}

#[derive(Debug, PartialEq)]
pub enum ChatError {
    RateLimited,
    Failed(String),
}

/// One chat call. Groq in the app, a fake in tests.
pub trait Chat: Send + Sync {
    fn chat(&self, model: &str, system: &str, user: &str, json: bool) -> Result<String, ChatError>;
    /// Wait before the next try after every model was rate limited. Tests skip it.
    fn wait(&self) {
        std::thread::sleep(RATE_WAIT);
    }
}

impl Chat for GroqClient {
    fn chat(&self, model: &str, system: &str, user: &str, json: bool) -> Result<String, ChatError> {
        let mut payload = json!({
            "model": model,
            "temperature": 0.1,
            "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
        });
        if json {
            payload["response_format"] = json!({"type": "json_object"});
        }
        match GroqClient::chat(self, &payload, Duration::from_secs(90)) {
            Ok(body) => body["choices"][0]["message"]["content"]
                .as_str()
                .map(str::to_owned)
                .ok_or_else(|| ChatError::Failed("The model sent an empty reply.".into())),
            Err(ApiError::Status(429 | 413)) => Err(ChatError::RateLimited),
            Err(ApiError::NoKey) => Err(ChatError::Failed(
                "No Groq key. Add it in Scribe settings.".into(),
            )),
            Err(e) => Err(ChatError::Failed(format!("Groq failed: {e:?}"))),
        }
    }
}

/// Try each model; when all are rate limited, wait and try again.
fn ask_any(chat: &dyn Chat, system: &str, user: &str, json: bool) -> Result<String, String> {
    let mut last = String::from("Groq is busy. Try again in a minute.");
    for round in 0..TRIES {
        if round > 0 {
            chat.wait();
        }
        for model in MODELS {
            match chat.chat(model, system, user, json) {
                Ok(text) => return Ok(text),
                Err(ChatError::RateLimited) => continue,
                Err(ChatError::Failed(e)) => last = e,
            }
        }
    }
    Err(last)
}

/// `[MM:SS] Speaker: text` lines.
pub fn transcript_text(segments: &[Value]) -> String {
    segments
        .iter()
        .map(|s| {
            let t = s["t0"].as_f64().unwrap_or(0.0) as u64;
            format!(
                "[{:02}:{:02}] {}: {}",
                t / 60,
                t % 60,
                s["speaker_key"].as_str().unwrap_or("Them"),
                s["text"].as_str().unwrap_or_default()
            )
        })
        .collect::<Vec<_>>()
        .join("\n")
}

/// Split at line ends into parts of at most `max_chars`.
fn parts(text: &str, max_chars: usize) -> Vec<String> {
    let mut out = vec![String::new()];
    for line in text.lines() {
        let current = out.last_mut().unwrap();
        if !current.is_empty() && current.len() + line.len() + 1 > max_chars {
            out.push(String::new());
        }
        let current = out.last_mut().unwrap();
        current.push_str(line);
        current.push('\n');
    }
    out
}

/// The note: title, summary, decisions, action items, open questions (Python schema).
pub fn generate(
    chat: &dyn Chat,
    segments: &[Value],
    template_id: &str,
    fallback_title: &str,
) -> Result<Value, String> {
    let text = transcript_text(segments);
    if text.trim().is_empty() {
        return Err("The transcript is empty, so there is nothing to summarize.".into());
    }
    let max = PART_TOKENS * CHARS_PER_TOKEN;
    let source = if text.len() <= max {
        text
    } else {
        let condense = "Condense this part of a meeting transcript into short factual notes. Keep \
            names, numbers, decisions, commitments and their [MM:SS] times. Plain lines only.";
        let mut notes = Vec::new();
        for part in parts(&text, max) {
            notes.push(ask_any(chat, condense, &part, false)?);
        }
        // shortcut: one map round; a call over about 8 hours could still be too long for the reduce.
        notes.join("\n")
    };
    let system = format!(
        "You write concise meeting notes. Reply JSON only with keys: title (string), summary (list of \
         strings), decisions (list of {{t: seconds, text}}), action_items (list of {{owner, task, t: \
         seconds}}), open_questions (list of strings). Times come from the [MM:SS] marks. Follow these \
         section instructions:\n{}\nNever use an em dash.",
        template(template_id)
    );
    let raw = ask_any(chat, &system, &source, true)?;
    Ok(note_from(&raw, fallback_title))
}

fn note_from(raw: &str, fallback_title: &str) -> Value {
    let start = raw.find('{').unwrap_or(0);
    let end = raw.rfind('}').map_or(raw.len(), |i| i + 1);
    let v: Value = serde_json::from_str(&raw[start..end]).unwrap_or(Value::Null);
    let strings = |key: &str| -> Value {
        v[key]
            .as_array()
            .into_iter()
            .flatten()
            .filter_map(|x| x.as_str().map(clean))
            .collect()
    };
    let seconds = |x: &Value| {
        x.as_f64()
            .or_else(|| x.as_str()?.parse().ok())
            .unwrap_or(0.0)
    };
    let title = v["title"]
        .as_str()
        .map(clean)
        .filter(|t| !t.is_empty())
        .unwrap_or_else(|| fallback_title.to_owned());
    json!({
        "title": title,
        "summary": strings("summary"),
        "decisions": v["decisions"].as_array().into_iter().flatten().filter(|d| d.is_object())
            .map(|d| json!({"t": seconds(&d["t"]), "text": clean(d["text"].as_str().unwrap_or_default())}))
            .collect::<Vec<_>>(),
        "action_items": v["action_items"].as_array().into_iter().flatten().filter(|d| d.is_object())
            .map(|d| json!({
                "owner": clean(d["owner"].as_str().unwrap_or_default()),
                "task": clean(d["task"].as_str().unwrap_or_default()),
                "t": seconds(&d["t"]),
            }))
            .collect::<Vec<_>>(),
        "open_questions": strings("open_questions"),
    })
}

/// Models sometimes write an em dash despite the prompt.
fn clean(text: &str) -> String {
    text.replace(" \u{2014} ", ", ")
        .replace('\u{2014}', ", ")
        .trim()
        .to_owned()
}

/// Answer a question from the transcript. "Summary so far" is a question too.
pub fn ask(chat: &dyn Chat, segments: &[Value], question: &str) -> Result<String, String> {
    let text = transcript_text(segments);
    if text.trim().is_empty() {
        return Err("Nothing has been said yet.".into());
    }
    // Keep the newest part: the end of the call matters most mid-call.
    let cut = text.len().saturating_sub(ASK_CHARS);
    let cut = (cut..text.len())
        .find(|&i| text.is_char_boundary(i))
        .unwrap_or(0);
    let system = "You answer questions about a meeting from its transcript. Be short and direct. \
        Cite [MM:SS] times for facts. If the transcript does not say, answer that it does not. \
        Plain text, no em dash.";
    let user = format!("Transcript:\n{}\n\nQuestion: {question}", &text[cut..]);
    ask_any(chat, system, &user, false).map(|a| clean(&a))
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;
    use std::sync::Mutex;

    /// Replies in order; a reply of "429" means rate limited.
    pub(crate) struct FakeChat {
        pub replies: Mutex<Vec<&'static str>>,
        pub calls: Mutex<Vec<(String, String)>>,
    }

    impl FakeChat {
        pub(crate) fn new(replies: &[&'static str]) -> Self {
            Self {
                replies: Mutex::new(replies.iter().rev().copied().collect()),
                calls: Mutex::default(),
            }
        }
    }

    impl Chat for FakeChat {
        fn chat(
            &self,
            model: &str,
            _system: &str,
            user: &str,
            _json: bool,
        ) -> Result<String, ChatError> {
            self.calls
                .lock()
                .unwrap()
                .push((model.to_owned(), user.to_owned()));
            match self.replies.lock().unwrap().pop() {
                Some("429") => Err(ChatError::RateLimited),
                Some(reply) => Ok(reply.to_owned()),
                None => Err(ChatError::Failed("no more replies".into())),
            }
        }
        fn wait(&self) {}
    }

    fn seg(t0: f64, who: &str, text: &str) -> Value {
        json!({"t0": t0, "speaker_key": who, "text": text})
    }

    #[test]
    fn templates_load_without_front_matter() {
        assert!(template("client-call").starts_with("## Summary"));
        assert_eq!(template("nope"), template("default"));
    }

    #[test]
    fn short_transcript_gives_a_clean_note() {
        let chat = FakeChat::new(&[
            "429",
            r#"Sure: {"title": "Plan — week", "summary": ["a"], "decisions": [{"t": "61", "text": "ship"}],
               "action_items": [{"owner": "Jake", "task": "send", "t": 5}], "open_questions": [], "extra": 1}"#,
        ]);
        let note = generate(&chat, &[seg(61.0, "Me", "we ship")], "default", "Meeting").unwrap();
        assert_eq!(note["title"], "Plan, week");
        assert_eq!(note["decisions"][0]["t"], 61.0);
        assert_eq!(note["action_items"][0]["owner"], "Jake");
        let calls = chat.calls.lock().unwrap();
        assert_eq!(calls[0].0, MODELS[0]);
        assert_eq!(
            calls[1].0, MODELS[1],
            "a rate limit moves to the other model"
        );
        assert!(calls[1].1.contains("[01:01] Me: we ship"));
    }

    #[test]
    fn long_transcript_is_condensed_in_parts_first() {
        let long: Vec<Value> = (0..1500)
            .map(|i| seg(i as f64, "Them", "words words words words"))
            .collect();
        let chat = FakeChat::new(&["part one", "part two", "part three", r#"{"title": "Long"}"#]);
        let note = generate(&chat, &long, "default", "Meeting").unwrap();
        assert_eq!(note["title"], "Long");
        let calls = chat.calls.lock().unwrap();
        assert_eq!(calls.len(), 4);
        assert!(calls[3].1.contains("part one\npart two\npart three"));
    }

    #[test]
    fn errors_are_plain() {
        let chat = FakeChat::new(&[]);
        assert!(generate(&chat, &[], "default", "M")
            .unwrap_err()
            .contains("empty"));
        assert_eq!(
            ask(&chat, &[seg(0.0, "Me", "hi")], "q").unwrap_err(),
            "no more replies"
        );
    }

    #[test]
    fn ask_sends_the_question_and_the_newest_transcript() {
        let chat = FakeChat::new(&["Yes [00:02]."]);
        let answer = ask(
            &chat,
            &[seg(2.0, "vMobx", "keep the old Scribe")],
            "Did we decide?",
        )
        .unwrap();
        assert_eq!(answer, "Yes [00:02].");
        let calls = chat.calls.lock().unwrap();
        assert!(calls[0].1.ends_with("Question: Did we decide?"));
        assert!(calls[0].1.contains("[00:02] vMobx: keep the old Scribe"));
    }
}

/// Real Groq note for one imported meeting, read only:
/// `MEETING_ID=<id> cargo test real_note -- --ignored --nocapture`.
#[cfg(test)]
mod real {
    #[test]
    #[ignore]
    fn real_note() {
        let id = std::env::var("MEETING_ID").unwrap();
        let store = crate::meetings::store::Store::new(
            crate::config::Config::default_dir().join("meetings"),
        );
        let meeting = store.get(&id).unwrap();
        let segments = meeting["transcript"].as_array().unwrap().clone();
        let cfg = crate::config::Config::default();
        let groq = crate::groq::GroqClient::new(
            &cfg.groq,
            std::sync::Arc::new(crate::credentials::MemoryKeyStore::default()),
            std::sync::Arc::new(crate::polish::SharedDictionary::new("none.json".into())),
        );
        let started = std::time::Instant::now();
        let note = super::generate(&groq, &segments, "default", "Meeting").unwrap();
        println!(
            "{} chars, {:?}\n{}",
            super::transcript_text(&segments).len(),
            started.elapsed(),
            serde_json::to_string_pretty(&note).unwrap()
        );
        let answer = super::ask(&groq, &segments, "What was decided?").unwrap();
        println!("ASK: {answer}");
    }
}
