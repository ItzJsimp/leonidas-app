//! Speaker names for the system-audio track. Slice S5.
//!
//! - Discord connected: speaking events name each "Them" segment (most overlap wins).
//! - Otherwise: a local CPU diarizer, ported from Python `diarize_local_cpu`. Python used an
//!   FFT; this uses band-pass filters for the same spectral shape, so it needs no new crate.
//!   It runs on 1 s windows of the chunks the session already has in memory, and stores only
//!   9 numbers per second (`them-voice.json`).
//!
//! The mic track is always "Me".

use super::session::THEM;
use serde_json::{json, Value};
use std::collections::BTreeMap;

pub const WINDOW_S: f32 = 1.0;
/// Python skipped windows under RMS 40 of 32768.
const MIN_RMS: f32 = 40.0 / 32768.0;
/// Band centers in Hz: the geometric middles of the Python band edges.
const BANDS: [f32; 7] = [120.0, 240.0, 438.0, 849.0, 1697.0, 3394.0, 6118.0];
/// shortcut: two clusters closer than this are one voice. Tuned on synthetic voices only;
/// tune again if real calls split one person into two.
const SAME_VOICE: f32 = 0.08;
const ITERATIONS: usize = 15;

/// Pitch counts this much against the unit-length spectral part. Real voices (David and Zira
/// in the smoke test) did not split on spectrum alone.
const PITCH_WEIGHT: f32 = 1.5;

pub type Features = [f32; BANDS.len() + 3];

/// Voice features for each speaking 1 s window: `(start seconds, features)`.
pub fn voice_windows(pcm16k: &[f32], t0: f32) -> Vec<(f32, Features)> {
    let len = (WINDOW_S * 16_000.0) as usize;
    pcm16k
        .chunks_exact(len)
        .enumerate()
        .filter_map(|(i, w)| features(w, 16_000.0).map(|f| (t0 + i as f32 * WINDOW_S, f)))
        .collect()
}

/// Spectral shape (relative band energies), centroid and zero-crossing rate, unit length.
fn features(window: &[f32], rate: f32) -> Option<Features> {
    let rms = (window.iter().map(|s| s * s).sum::<f32>() / window.len() as f32).sqrt();
    if rms < MIN_RMS {
        return None;
    }
    let energies: Vec<f32> = BANDS
        .iter()
        .map(|&f| band_energy(window, f, rate))
        .collect();
    let total: f32 = energies.iter().sum::<f32>().max(1e-12);
    let rel: Vec<f32> = energies.iter().map(|e| (e / total).sqrt()).collect();
    let centroid = BANDS.iter().zip(&energies).map(|(f, e)| f * e).sum::<f32>() / total / 4000.0;
    let crossings = window
        .windows(2)
        .filter(|p| (p[0] >= 0.0) != (p[1] >= 0.0))
        .count() as f32
        / window.len() as f32;
    let mut out: Features = [0.0; BANDS.len() + 3];
    out[0] = centroid;
    out[1] = crossings;
    out[2..BANDS.len() + 2].copy_from_slice(&rel);
    let norm = out.iter().map(|v| v * v).sum::<f32>().sqrt();
    if norm > 0.0 {
        out.iter_mut().for_each(|v| *v /= norm);
    }
    out[BANDS.len() + 2] = PITCH_WEIGHT * pitch(window, rate).unwrap_or(0.5);
    Some(out)
}

/// Median voice pitch of the window, mapped from 70..400 Hz to 0..1. `None` when unvoiced.
/// Normalized autocorrelation on 32 ms frames, 10 per second.
fn pitch(window: &[f32], rate: f32) -> Option<f32> {
    const FRAME: usize = 512;
    let (min_lag, max_lag) = ((rate / 400.0) as usize, (rate / 70.0) as usize);
    let mut found: Vec<f32> = window
        .chunks(window.len() / 10)
        .filter(|c| c.len() >= FRAME)
        .filter_map(|c| {
            let x = &c[..FRAME];
            let r0: f32 = x.iter().map(|v| v * v).sum();
            if r0 <= 1e-9 {
                return None;
            }
            let (lag, score) = (min_lag..=max_lag.min(FRAME - 1))
                .map(|lag| {
                    let r: f32 = x[..FRAME - lag]
                        .iter()
                        .zip(&x[lag..])
                        .map(|(a, b)| a * b)
                        .sum();
                    (lag, r / r0)
                })
                .max_by(|a, b| a.1.total_cmp(&b.1))?;
            (score > 0.4).then_some(rate / lag as f32)
        })
        .collect();
    if found.is_empty() {
        return None;
    }
    found.sort_by(f32::total_cmp);
    let f0 = found[found.len() / 2];
    Some(((f0 / 70.0).log2() / (400.0f32 / 70.0).log2()).clamp(0.0, 1.0))
}

/// Mean power after an RBJ band-pass biquad (about one octave wide).
fn band_energy(x: &[f32], f0: f32, rate: f32) -> f32 {
    let w0 = 2.0 * std::f32::consts::PI * f0 / rate;
    let alpha = w0.sin() / (2.0 * 1.4);
    let a0 = 1.0 + alpha;
    let (b0, b2) = (alpha / a0, -alpha / a0);
    let (a1, a2) = (-2.0 * w0.cos() / a0, (1.0 - alpha) / a0);
    let (mut x1, mut x2, mut y1, mut y2) = (0.0f32, 0.0f32, 0.0f32, 0.0f32);
    let mut sum = 0.0f32;
    for &s in x {
        let y = b0 * s + b2 * x2 - a1 * y1 - a2 * y2;
        (x2, x1, y2, y1) = (x1, s, y1, y);
        sum += y * y;
    }
    sum / x.len() as f32
}

fn dist(a: &Features, b: &Features) -> f32 {
    a.iter()
        .zip(b)
        .map(|(x, y)| (x - y) * (x - y))
        .sum::<f32>()
        .sqrt()
}

/// Cluster windows into at most `k` voices. Returns a voice number per window, numbered by
/// first appearance (0, 1, ...). Farthest-first start and k-means, as in Python.
pub fn cluster(windows: &[(f32, Features)], k: usize) -> Vec<usize> {
    let points: Vec<&Features> = windows.iter().map(|(_, f)| f).collect();
    let k = k.min(points.len()).max(1);
    if points.is_empty() {
        return Vec::new();
    }
    // Start from the low and high quarter along the feature that varies most (usually
    // pitch). Farthest-first, as in Python, made one odd window a "voice" on real audio.
    let centers_for = |idx: &[usize]| -> Features {
        let mut c: Features = Default::default();
        for &i in idx {
            c.iter_mut().zip(points[i]).for_each(|(a, b)| *a += b);
        }
        c.iter_mut().for_each(|v| *v /= idx.len().max(1) as f32);
        c
    };
    let variance = |d: usize| {
        let mean = points.iter().map(|p| p[d]).sum::<f32>() / points.len() as f32;
        points.iter().map(|p| (p[d] - mean).powi(2)).sum::<f32>()
    };
    let axis = (0..points[0].len())
        .max_by(|&a, &b| variance(a).total_cmp(&variance(b)))
        .unwrap();
    let mut order: Vec<usize> = (0..points.len()).collect();
    order.sort_by(|&a, &b| points[a][axis].total_cmp(&points[b][axis]));
    let quarter = (points.len() / 4).max(1);
    let mut centers: Vec<Features> = vec![centers_for(&order[..quarter])];
    if k > 1 {
        centers.push(centers_for(&order[order.len() - quarter..]));
    }
    let mut labels = vec![0usize; points.len()];
    for _ in 0..ITERATIONS {
        for (label, p) in labels.iter_mut().zip(&points) {
            *label = (0..centers.len())
                .min_by(|&a, &b| dist(p, &centers[a]).total_cmp(&dist(p, &centers[b])))
                .unwrap();
        }
        for (c, center) in centers.iter_mut().enumerate() {
            let members: Vec<&&Features> = points
                .iter()
                .zip(&labels)
                .filter(|(_, l)| **l == c)
                .map(|(p, _)| p)
                .collect();
            if !members.is_empty() {
                for (i, v) in center.iter_mut().enumerate() {
                    *v = members.iter().map(|m| m[i]).sum::<f32>() / members.len() as f32;
                }
            }
        }
    }
    let smaller = labels
        .iter()
        .filter(|l| **l == 1)
        .count()
        .min(labels.iter().filter(|l| **l == 0).count());
    // A "voice" in under 10 % of the windows is noise, not a person.
    if centers.len() == 2
        && (dist(&centers[0], &centers[1]) < SAME_VOICE || smaller * 10 < labels.len())
    {
        return vec![0; points.len()];
    }
    let mut first: Vec<usize> = Vec::new();
    labels
        .iter()
        .map(|l| match first.iter().position(|o| o == l) {
            Some(i) => i,
            None => {
                first.push(*l);
                first.len() - 1
            }
        })
        .collect()
}

/// Name the "Them" segments: Discord names first, else diarizer voices ("Speaker 1", ...).
/// With one voice and no Discord names the segments stay "Them".
pub fn label(
    transcript: &mut [Value],
    windows: &[(f32, Features)],
    discord: &BTreeMap<String, Vec<(f32, f32)>>,
) {
    let voices = cluster(windows, 2);
    let many = voices.iter().any(|v| *v > 0);
    for seg in transcript.iter_mut() {
        if seg["speaker_key"].as_str() != Some(THEM) {
            continue;
        }
        let (t0, t1) = (
            seg["t0"].as_f64().unwrap_or(0.0) as f32,
            seg["t1"].as_f64().unwrap_or(0.0) as f32,
        );
        let t1 = t1.max(t0 + 0.01);
        let by_discord = discord
            .iter()
            .map(|(name, spans)| {
                (
                    name,
                    spans
                        .iter()
                        .map(|&(a, b)| overlap(t0, t1, a, b))
                        .sum::<f32>(),
                )
            })
            .filter(|(_, o)| *o > 0.0)
            .max_by(|a, b| a.1.total_cmp(&b.1))
            .map(|(name, _)| name.clone());
        let by_voice = || {
            if !many {
                return None;
            }
            let mut score = [0.0f32; 2];
            for ((start, _), v) in windows.iter().zip(&voices) {
                score[*v] += overlap(t0, t1, *start, start + WINDOW_S);
            }
            (score[0] + score[1] > 0.0)
                .then(|| format!("Speaker {}", if score[0] >= score[1] { 1 } else { 2 }))
        };
        if let Some(name) = by_discord.or_else(by_voice) {
            seg["speaker_key"] = Value::from(name);
        }
    }
}

fn overlap(a0: f32, a1: f32, b0: f32, b1: f32) -> f32 {
    (a1.min(b1) - a0.max(b0)).max(0.0)
}

/// Discord speaking intervals per name from `speaking.jsonl` lines
/// (`{"t", "event": "start"|"stop", "user_id", "name"}`). The local user is left out: the mic
/// track already covers them. Open intervals end at `end_s`.
pub fn discord_intervals(
    events: &[Value],
    local_user: Option<&str>,
    end_s: f32,
) -> BTreeMap<String, Vec<(f32, f32)>> {
    let mut names: BTreeMap<String, String> = BTreeMap::new();
    let mut open: BTreeMap<String, f32> = BTreeMap::new();
    let mut spans: BTreeMap<String, Vec<(f32, f32)>> = BTreeMap::new();
    for ev in events {
        let id = ev["user_id"].as_str().unwrap_or_default().to_owned();
        if id.is_empty() || Some(id.as_str()) == local_user {
            continue;
        }
        if let Some(name) = ev["name"].as_str() {
            names.insert(id.clone(), name.to_owned());
        }
        let t = ev["t"].as_f64().unwrap_or(0.0) as f32;
        match ev["event"].as_str() {
            Some("start") => {
                open.entry(id).or_insert(t);
            }
            Some("stop") => {
                if let Some(t0) = open.remove(&id) {
                    spans.entry(id).or_default().push((t0, t.max(t0)));
                }
            }
            _ => {}
        }
    }
    for (id, t0) in open {
        spans.entry(id).or_default().push((t0, end_s.max(t0)));
    }
    spans
        .into_iter()
        .map(|(id, s)| (names.get(&id).cloned().unwrap_or(id), s))
        .collect()
}

/// `them-voice.json`: the windows as `[[t, f0, f1, ...], ...]`.
pub fn windows_to_json(windows: &[(f32, Features)]) -> Value {
    windows
        .iter()
        .map(|(t, f)| {
            std::iter::once(*t)
                .chain(f.iter().copied())
                .collect::<Vec<f32>>()
        })
        .map(|row| json!(row))
        .collect()
}

pub fn windows_from_json(value: &Value) -> Vec<(f32, Features)> {
    value
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|row| {
            let nums: Vec<f32> = row
                .as_array()?
                .iter()
                .filter_map(|v| v.as_f64())
                .map(|v| v as f32)
                .collect();
            let mut f: Features = Default::default();
            (nums.len() == f.len() + 1).then(|| {
                f.copy_from_slice(&nums[1..]);
                (nums[0], f)
            })
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A voiced sound: harmonics of `f0` with a formant peak near `formant`.
    fn voice(f0: f32, formant: f32, seconds: f32, seed: u32) -> Vec<f32> {
        let n = (seconds * 16_000.0) as usize;
        let mut noise = seed;
        (0..n)
            .map(|i| {
                let t = i as f32 / 16_000.0;
                let mut s = 0.0;
                let mut h = 1.0;
                while h * f0 < 7_000.0 {
                    let f = h * f0;
                    let gain = 1.0 / (1.0 + ((f - formant) / 400.0).powi(2));
                    s += gain * (2.0 * std::f32::consts::PI * f * t).sin();
                    h += 1.0;
                }
                noise = noise.wrapping_mul(1_103_515_245).wrapping_add(12_345);
                0.1 * s + 0.002 * ((noise >> 16) as f32 / 32_768.0 - 1.0)
            })
            .collect()
    }

    #[test]
    fn two_voices_split_and_one_voice_stays_one() {
        let (mut pcm, mut truth) = (Vec::new(), Vec::new());
        for turn in 0..6 {
            let (f0, formant) = if turn % 2 == 0 {
                (110.0, 500.0)
            } else {
                (230.0, 2_600.0)
            };
            pcm.extend(voice(f0, formant, 3.0, turn));
            truth.extend([(turn % 2) as usize; 3]);
        }
        let windows = voice_windows(&pcm, 0.0);
        assert_eq!(windows.len(), 18);
        let labels = cluster(&windows, 2);
        let right = labels.iter().zip(&truth).filter(|(a, b)| a == b).count();
        assert!(right >= 16, "{labels:?}");
        let one = voice_windows(&voice(140.0, 900.0, 10.0, 7), 0.0);
        assert!(cluster(&one, 2).iter().all(|v| *v == 0));
    }

    #[test]
    fn silence_has_no_windows() {
        assert!(voice_windows(&vec![0.0; 32_000], 0.0).is_empty());
    }

    #[test]
    fn discord_names_win_then_voices_and_me_stays() {
        let mut pcm = voice(110.0, 500.0, 4.0, 1);
        pcm.extend(voice(230.0, 2_600.0, 4.0, 2));
        let windows = voice_windows(&pcm, 0.0);
        let mut transcript = vec![
            json!({"speaker_key": "Them", "t0": 0.5, "t1": 3.5, "text": "a"}),
            json!({"speaker_key": "Them", "t0": 4.5, "t1": 7.5, "text": "b"}),
            json!({"speaker_key": "Me", "t0": 1.0, "t1": 2.0, "text": "c"}),
        ];
        let mut voices = transcript.clone();
        label(&mut voices, &windows, &BTreeMap::new());
        assert_eq!(voices[0]["speaker_key"], "Speaker 1");
        assert_eq!(voices[1]["speaker_key"], "Speaker 2");
        assert_eq!(voices[2]["speaker_key"], "Me");
        let events = vec![
            json!({"t": 0.0, "event": "start", "user_id": "1", "name": "vMobx"}),
            json!({"t": 4.0, "event": "stop", "user_id": "1"}),
            json!({"t": 4.2, "event": "start", "user_id": "2", "name": "Gersi"}),
            json!({"t": 1.0, "event": "start", "user_id": "9", "name": "Jake"}),
        ];
        let discord = discord_intervals(&events, Some("9"), 8.0);
        assert_eq!(discord["Gersi"], vec![(4.2, 8.0)]);
        assert!(!discord.contains_key("Jake"));
        label(&mut transcript, &windows, &discord);
        assert_eq!(transcript[0]["speaker_key"], "vMobx");
        assert_eq!(transcript[1]["speaker_key"], "Gersi");
    }

    #[test]
    fn windows_round_trip_as_json() {
        let windows = voice_windows(&voice(110.0, 500.0, 2.0, 3), 5.0);
        let back = windows_from_json(&windows_to_json(&windows));
        assert_eq!(back.len(), 2);
        assert_eq!(back[0].0, 5.0);
        assert!((back[1].1[3] - windows[1].1[3]).abs() < 1e-6);
    }
}

/// Tuning on a real recording: `SMOKE_DIR=<meeting dir> cargo test real_split -- --ignored --nocapture`.
/// The smoke test plays David (male) and Zira (female); the score is the share of "Them"
/// segments whose voice label matches the speaker of that line.
#[cfg(test)]
mod real {
    use super::*;

    #[test]
    #[ignore]
    fn real_split() {
        let dir = std::path::PathBuf::from(std::env::var("SMOKE_DIR").unwrap());
        let dirs = vec![dir.join("me"), dir.join("them")];
        let (pcm, rate) = crate::meetings::retranscribe::read_track_pub(
            &dirs,
            crate::meetings::capture::TrackKind::Them,
        );
        assert_eq!(rate, 16_000);
        let windows = voice_windows(&pcm, 0.0);
        let transcript = crate::meetings::store::read_json(&dir.join("transcript.json")).unwrap();
        let david = ["David", "price", "decided", "launch", "Great", "Okay"];
        let mut segs: Vec<Value> = transcript
            .as_array()
            .unwrap()
            .iter()
            .filter(|s| s["track"] == "them")
            .map(|s| {
                let mut s = s.clone();
                s["speaker_key"] = Value::from(THEM);
                s
            })
            .collect();
        label(&mut segs, &windows, &BTreeMap::new());
        let mut pairs: BTreeMap<(bool, String), usize> = BTreeMap::new();
        for s in &segs {
            let is_david = david
                .iter()
                .any(|w| s["text"].as_str().unwrap().contains(w));
            let got = s["speaker_key"].as_str().unwrap().to_owned();
            *pairs.entry((is_david, got.clone())).or_default() += 1;
            println!(
                "{:>6} {:<10} {} {}",
                s["t0"],
                got,
                if is_david { "D" } else { "Z" },
                s["text"]
            );
        }
        let get = |d: bool, l: &str| pairs.get(&(d, l.to_owned())).copied().unwrap_or(0);
        let agree = (get(true, "Speaker 1") + get(false, "Speaker 2"))
            .max(get(true, "Speaker 2") + get(false, "Speaker 1"));
        println!("windows {} agree {agree}/{}", windows.len(), segs.len());
    }
}
