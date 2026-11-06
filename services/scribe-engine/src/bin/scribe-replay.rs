//! Cloud latency replay: send saved recordings through speech-to-text and polish, as a
//! dictation does, and print p50 and p90 of transcribeMs, polishMs and totalMs.
//!
//! Usage: `scribe-replay <dir of .flac or .wav> [--config <config.json>] [--out <file.jsonl>]`.
//! Or: `scribe-replay <replay.jsonl> [--config ..] [--out ..] [--gap-ms N]` polishes the saved
//! `raw` texts of an earlier `--out` file only, to compare polish providers on the same input.
//! It reads keys and the dictionary like the engine, and uses the same speech chain and
//! polish backups. It pastes nothing and saves no history.

use scribe_engine::config::Config;
use scribe_engine::credentials::{KeyStore, OsKeyStore};
use scribe_engine::engine::{EncodedAudio, Polisher};
use scribe_engine::groq::GroqClient;
use scribe_engine::local_stt::Cloud;
use scribe_engine::polish::{GroqPolisher, SharedDictionary};
use std::io::Write;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Instant;

fn main() {
    if let Err(message) = run() {
        eprintln!("scribe-replay: {message}");
        std::process::exit(2);
    }
}

/// Duration from the FLAC STREAMINFO block, or from a 16-bit PCM WAV size.
fn duration_ms(bytes: &[u8]) -> u64 {
    if bytes.len() > 26 && &bytes[..4] == b"fLaC" {
        let s = &bytes[8..];
        let rate = (u64::from(s[10]) << 12) | (u64::from(s[11]) << 4) | (u64::from(s[12]) >> 4);
        let total = (u64::from(s[13] & 0x0f) << 32)
            | (u64::from(s[14]) << 24)
            | (u64::from(s[15]) << 16)
            | (u64::from(s[16]) << 8)
            | u64::from(s[17]);
        return (total * 1000).checked_div(rate).unwrap_or(0);
    }
    if bytes.len() > 44 && &bytes[..4] == b"RIFF" {
        let rate = u32::from_le_bytes([bytes[24], bytes[25], bytes[26], bytes[27]]) as u64;
        let channels = u16::from_le_bytes([bytes[22], bytes[23]]) as u64;
        return ((bytes.len() as u64 - 44) * 1000)
            .checked_div(rate * channels.max(1) * 2)
            .unwrap_or(0);
    }
    0
}

fn pct(values: &mut [u64], p: f64) -> u64 {
    if values.is_empty() {
        return 0;
    }
    values.sort_unstable();
    values[((values.len() - 1) as f64 * p).round() as usize]
}

fn run() -> Result<(), String> {
    let mut args = std::env::args().skip(1);
    let dir: PathBuf = args.next().ok_or("give a folder of recordings")?.into();
    let (mut config_path, mut out_path) = (None, None);
    let mut gap_ms = 0u64;
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--config" => {
                config_path = Some(PathBuf::from(args.next().ok_or("--config needs a path")?))
            }
            "--out" => out_path = Some(PathBuf::from(args.next().ok_or("--out needs a path")?)),
            "--gap-ms" => {
                gap_ms = args
                    .next()
                    .and_then(|v| v.parse().ok())
                    .ok_or("--gap-ms needs a number")?
            }
            other => return Err(format!("unknown argument {other}")),
        }
    }
    let config_path = config_path.unwrap_or_else(|| Config::default_dir().join("config.json"));
    let config_dir = config_path
        .parent()
        .map(PathBuf::from)
        .unwrap_or_else(Config::default_dir);
    let cfg = Config::load(&config_path)?;
    let keys: Arc<dyn KeyStore> = Arc::new(OsKeyStore::new()?);
    let dictionary = Arc::new(SharedDictionary::new(cfg.dictionary_path(&config_dir)));
    let groq = GroqClient::new(&cfg.groq, keys, dictionary.clone());
    let speech = scribe_engine::backup::speech_chain(&cfg, &groq, &dictionary);
    let polisher = GroqPolisher::new(groq.clone(), &cfg.effective_polish())
        .with_backups(scribe_engine::backup::polish_backups(&cfg, &dictionary));
    groq.warm();
    std::thread::sleep(std::time::Duration::from_millis(1500));

    if dir.extension().is_some_and(|e| e == "jsonl") {
        let text = std::fs::read_to_string(&dir).map_err(|e| format!("{}: {e}", dir.display()))?;
        let mut out = out_path
            .map(|p| std::fs::File::create(&p).map_err(|e| format!("{}: {e}", p.display())))
            .transpose()?;
        let mut times = Vec::new();
        for line in text.lines().filter(|l| !l.trim().is_empty()) {
            let row: serde_json::Value = serde_json::from_str(line).map_err(|e| e.to_string())?;
            let raw = row["raw"].as_str().unwrap_or_default();
            let start = Instant::now();
            let (cleaned, by) = polisher.polish_traced(raw);
            let ms = start.elapsed().as_millis() as u64;
            times.push(ms);
            if let Some(out) = out.as_mut() {
                let line = serde_json::json!({"file": row["file"], "raw": raw, "cleaned": cleaned, "polish": by, "polishMs": ms});
                writeln!(out, "{line}").map_err(|e| e.to_string())?;
            }
            std::thread::sleep(std::time::Duration::from_millis(gap_ms));
        }
        println!(
            "n={} polishMs: p50={} p90={}",
            times.len(),
            pct(&mut times.clone(), 0.5),
            pct(&mut times, 0.9)
        );
        return Ok(());
    }

    let mut files: Vec<PathBuf> = std::fs::read_dir(&dir)
        .map_err(|e| format!("{}: {e}", dir.display()))?
        .filter_map(|e| e.ok().map(|e| e.path()))
        .filter(|p| matches!(p.extension().and_then(|e| e.to_str()), Some("flac" | "wav")))
        .collect();
    files.sort();
    let mut out = out_path
        .map(|p| std::fs::File::create(&p).map_err(|e| format!("{}: {e}", p.display())))
        .transpose()?;
    let (mut stt, mut pol, mut total, mut failed) = (Vec::new(), Vec::new(), Vec::new(), 0);
    for file in &files {
        // A gap keeps free rate limits (Groq: 20 speech requests a minute) out of the numbers.
        std::thread::sleep(std::time::Duration::from_millis(gap_ms));
        let bytes = std::fs::read(file).map_err(|e| format!("{}: {e}", file.display()))?;
        let flac = file.extension().is_some_and(|e| e == "flac");
        let audio = EncodedAudio {
            duration_ms: duration_ms(&bytes),
            bytes,
            mime: if flac { "audio/flac" } else { "audio/wav" },
            file_name: if flac { "audio.flac" } else { "audio.wav" },
            pcm: Vec::new(),
        };
        let start = Instant::now();
        let heard = speech.transcribe_cloud(&audio);
        let t_stt = start.elapsed().as_millis() as u64;
        let Ok(heard) = heard else {
            failed += 1;
            continue;
        };
        let (polished, polished_by) = polisher.polish_traced(&heard.text);
        let t_total = start.elapsed().as_millis() as u64;
        stt.push(t_stt);
        pol.push(t_total - t_stt);
        total.push(t_total);
        if let Some(out) = out.as_mut() {
            let line = serde_json::json!({
                "file": file.file_name().and_then(|n| n.to_str()),
                "audioMs": audio.duration_ms,
                "transcribeMs": t_stt,
                "polishMs": t_total - t_stt,
                "totalMs": t_total,
                "raw": heard.text,
                "cleaned": polished,
                "stt": heard.source,
                "polish": polished_by,
            });
            writeln!(out, "{line}").map_err(|e| e.to_string())?;
        }
    }
    println!("n={} failed={failed}", stt.len());
    for (name, values) in [
        ("transcribeMs", &mut stt),
        ("polishMs", &mut pol),
        ("totalMs", &mut total),
    ] {
        println!("{name}: p50={} p90={}", pct(values, 0.5), pct(values, 0.9));
    }
    Ok(())
}
