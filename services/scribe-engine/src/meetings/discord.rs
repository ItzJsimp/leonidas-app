//! Discord speaker names through Discord's local RPC pipe. Slice S7.
//!
//! The user makes their own Discord app (a guide in the app shows the steps) and gives its
//! Client ID; a secret is optional (public client with PKCE, as in Python). `connect` asks
//! Discord once ("Authorize"), then keeps the token in the OS keyring. During a Discord
//! meeting `record` writes `speaking.jsonl` (`{"t", "event", "user_id", "name"}`) with `t`
//! in seconds from the meeting start. Ported from Python `discord_rpc.py`.

use crate::credentials::KeyStore;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::fs::File;
use std::io::{Read, Write};
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

const TOKEN_URL: &str = "https://discord.com/api/oauth2/token";
pub const REDIRECT_URI: &str = "http://127.0.0.1";
const SCOPES: [&str; 2] = ["rpc", "rpc.voice.read"];
const OP_HANDSHAKE: u32 = 0;
const OP_FRAME: u32 = 1;
const OP_CLOSE: u32 = 2;
const OP_PING: u32 = 3;
const OP_PONG: u32 = 4;
const CHANNEL_EVENTS: [&str; 4] = [
    "SPEAKING_START",
    "SPEAKING_STOP",
    "VOICE_STATE_CREATE",
    "VOICE_STATE_DELETE",
];
const MAX_FRAME: usize = 1 << 20;

pub fn encode_frame(op: u32, payload: &Value) -> Vec<u8> {
    let data = payload.to_string().into_bytes();
    let mut out = Vec::with_capacity(8 + data.len());
    out.extend_from_slice(&op.to_le_bytes());
    out.extend_from_slice(&(data.len() as u32).to_le_bytes());
    out.extend_from_slice(&data);
    out
}

/// `(op, payload, bytes used)`, or `None` until the buffer holds a whole frame.
pub fn decode_frame(buf: &[u8]) -> Option<Result<(u32, Value, usize), String>> {
    if buf.len() < 8 {
        return None;
    }
    let op = u32::from_le_bytes(buf[..4].try_into().unwrap());
    let len = u32::from_le_bytes(buf[4..8].try_into().unwrap()) as usize;
    if len > MAX_FRAME {
        return Some(Err("Discord sent a frame that is too large.".into()));
    }
    if buf.len() < 8 + len {
        return None;
    }
    Some(
        serde_json::from_slice(&buf[8..8 + len])
            .map(|v| (op, v, 8 + len))
            .map_err(|e| format!("Discord sent bad JSON: {e}")),
    )
}

/// What the user saved, plus the token after `connect`. Stored as JSON in the keyring.
#[derive(Debug, Clone, Default, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Saved {
    pub client_id: String,
    #[serde(default)]
    pub client_secret: Option<String>,
    #[serde(default)]
    pub access_token: Option<String>,
    #[serde(default)]
    pub refresh_token: Option<String>,
    /// Unix seconds.
    #[serde(default)]
    pub expires_at: i64,
    #[serde(default)]
    pub user_name: Option<String>,
}

pub fn load(keys: &dyn KeyStore) -> Option<Saved> {
    serde_json::from_str(&keys.get()?).ok()
}

pub fn save(keys: &dyn KeyStore, saved: &Saved) -> Result<(), String> {
    keys.set(&serde_json::to_string(saved).map_err(|e| e.to_string())?)
        .map_err(|_| "Cannot save to the credential store.".to_owned())
}

/// The status for the settings guide. Never contains a secret or a token.
pub fn status(keys: &dyn KeyStore) -> Value {
    match load(keys) {
        Some(s) => json!({
            "configured": true,
            "clientId": s.client_id,
            "connected": s.access_token.is_some(),
            "user": s.user_name,
        }),
        None => json!({ "configured": false, "connected": false }),
    }
}

/// 32 random bytes from the OS. `RandomState` keys come from the OS random source, so this
/// needs no new crate.
fn random_bytes() -> [u8; 32] {
    use std::hash::{BuildHasher, Hasher};
    let mut out = [0u8; 32];
    for (i, part) in out.chunks_mut(8).enumerate() {
        let mut h = std::collections::hash_map::RandomState::new().build_hasher();
        h.write_usize(i);
        part.copy_from_slice(&h.finish().to_le_bytes());
    }
    out
}

fn base64url(bytes: &[u8]) -> String {
    const A: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    let mut out = String::new();
    for chunk in bytes.chunks(3) {
        let n = chunk
            .iter()
            .enumerate()
            .fold(0u32, |n, (i, b)| n | (u32::from(*b) << (16 - 8 * i)));
        for i in 0..=chunk.len() {
            out.push(A[(n >> (18 - 6 * i) & 63) as usize] as char);
        }
    }
    out
}

/// PKCE pair: `(verifier, S256 challenge)`.
pub fn pkce() -> (String, String) {
    let verifier = base64url(&random_bytes());
    let challenge = base64url(&Sha256::digest(verifier.as_bytes()));
    (verifier, challenge)
}

fn form(pairs: &[(&str, &str)]) -> String {
    let enc = |s: &str| {
        s.bytes()
            .map(|b| match b {
                b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                    (b as char).to_string()
                }
                _ => format!("%{b:02X}"),
            })
            .collect::<String>()
    };
    pairs
        .iter()
        .map(|(k, v)| format!("{}={}", enc(k), enc(v)))
        .collect::<Vec<_>>()
        .join("&")
}

/// Exchange a code or a refresh token. The secret is sent only when the user saved one.
fn token_request(saved: &Saved, grant: &[(&str, &str)]) -> Result<Saved, String> {
    let mut pairs = vec![("client_id", saved.client_id.as_str())];
    pairs.extend_from_slice(grant);
    if let Some(secret) = saved.client_secret.as_deref().filter(|s| !s.is_empty()) {
        pairs.push(("client_secret", secret));
    }
    let reply = ureq::post(TOKEN_URL)
        .header("Content-Type", "application/x-www-form-urlencoded")
        .config()
        .timeout_global(Some(Duration::from_secs(15)))
        .http_status_as_error(false)
        .build()
        .send(form(&pairs));
    let mut reply = reply.map_err(|e| format!("Cannot reach Discord: {e}"))?;
    let status = reply.status().as_u16();
    let body: Value = serde_json::from_str(&reply.body_mut().read_to_string().unwrap_or_default())
        .unwrap_or_default();
    if status != 200 {
        let why = body["error_description"]
            .as_str()
            .or(body["error"].as_str())
            .unwrap_or("unknown error");
        return Err(format!(
            "Discord refused the sign-in ({status}): {why}. Check step 3 of the guide."
        ));
    }
    let mut out = saved.clone();
    out.access_token = body["access_token"].as_str().map(str::to_owned);
    out.refresh_token = body["refresh_token"]
        .as_str()
        .map(str::to_owned)
        .or(out.refresh_token);
    out.expires_at = crate::unix_ms_now() / 1000 + body["expires_in"].as_i64().unwrap_or(604_800);
    Ok(out)
}

/// One Discord RPC connection on one thread. Reads only when the pipe has bytes, so a stop
/// flag is checked at least every 50 ms.
pub struct Rpc {
    pipe: File,
    buf: Vec<u8>,
    nonce: u64,
}

impl Rpc {
    pub fn open(client_id: &str) -> Result<(Self, Value), String> {
        let pipe = (0..10)
            .find_map(|i| {
                std::fs::OpenOptions::new()
                    .read(true)
                    .write(true)
                    .open(format!(r"\\.\pipe\discord-ipc-{i}"))
                    .ok()
            })
            .ok_or("Discord is not running. Open the Discord app, then try again.")?;
        let mut rpc = Self {
            pipe,
            buf: Vec::new(),
            nonce: 0,
        };
        rpc.send(OP_HANDSHAKE, &json!({ "v": 1, "client_id": client_id }))?;
        let deadline = Instant::now() + Duration::from_secs(15);
        while Instant::now() < deadline {
            if let Some(frame) = rpc.poll()? {
                if frame["evt"] == "READY" {
                    return Ok((rpc, frame["data"].clone()));
                }
                if frame["evt"] == "ERROR" {
                    return Err(format!(
                        "Discord: {}",
                        frame["data"]["message"].as_str().unwrap_or("error")
                    ));
                }
            }
        }
        Err("Discord did not answer the handshake.".into())
    }

    fn send(&mut self, op: u32, payload: &Value) -> Result<(), String> {
        self.pipe
            .write_all(&encode_frame(op, payload))
            .map_err(|e| format!("Discord connection lost: {e}"))
    }

    /// One frame (op 1) if one arrives within 50 ms. Answers pings. Errors on close.
    fn poll(&mut self) -> Result<Option<Value>, String> {
        loop {
            match decode_frame(&self.buf) {
                Some(Ok((op, payload, used))) => {
                    self.buf.drain(..used);
                    match op {
                        OP_PING => self.send(OP_PONG, &payload)?,
                        OP_CLOSE => {
                            return Err(format!("Discord closed the connection: {payload}"))
                        }
                        OP_FRAME => return Ok(Some(payload)),
                        _ => {}
                    }
                }
                Some(Err(e)) => return Err(e),
                None => {
                    let available = available(&self.pipe)?;
                    if available == 0 {
                        std::thread::sleep(Duration::from_millis(50));
                        return Ok(None);
                    }
                    let mut chunk = vec![0u8; available];
                    let n = self
                        .pipe
                        .read(&mut chunk)
                        .map_err(|e| format!("Discord connection lost: {e}"))?;
                    self.buf.extend_from_slice(&chunk[..n]);
                }
            }
        }
    }

    /// Send a command and wait for its answer. Events that arrive meanwhile go to `on_event`.
    pub fn call(
        &mut self,
        cmd: &str,
        args: Value,
        evt: Option<&str>,
        timeout: Duration,
        on_event: &mut dyn FnMut(&Value),
    ) -> Result<Value, String> {
        self.nonce += 1;
        let nonce = self.nonce.to_string();
        let mut msg = json!({ "cmd": cmd, "args": args, "nonce": nonce });
        if let Some(evt) = evt {
            msg["evt"] = Value::from(evt);
        }
        self.send(OP_FRAME, &msg)?;
        let deadline = Instant::now() + timeout;
        while Instant::now() < deadline {
            let Some(frame) = self.poll()? else { continue };
            if frame["nonce"].as_str() == Some(nonce.as_str()) {
                if frame["evt"] == "ERROR" {
                    return Err(format!(
                        "Discord: {}",
                        frame["data"]["message"]
                            .as_str()
                            .unwrap_or("the request failed")
                    ));
                }
                return Ok(frame["data"].clone());
            }
            on_event(&frame);
        }
        Err(format!("Discord did not answer {cmd}."))
    }
}

#[cfg(windows)]
fn available(pipe: &File) -> Result<usize, String> {
    use std::os::windows::io::AsRawHandle;
    use windows_sys::Win32::System::Pipes::PeekNamedPipe;
    let mut total = 0u32;
    let ok = unsafe {
        PeekNamedPipe(
            pipe.as_raw_handle(),
            std::ptr::null_mut(),
            0,
            std::ptr::null_mut(),
            &mut total,
            std::ptr::null_mut(),
        )
    };
    if ok == 0 {
        return Err("Discord connection lost.".into());
    }
    Ok(total as usize)
}

#[cfg(not(windows))]
fn available(_: &File) -> Result<usize, String> {
    Err("Discord names work on Windows only.".into())
}

/// Sign in to an open RPC connection: the saved token, a refresh, or a new Authorize.
/// Returns the local user id. Saves new tokens.
fn authenticate(rpc: &mut Rpc, keys: &dyn KeyStore, interactive: bool) -> Result<String, String> {
    let mut saved = load(keys).ok_or("Add your Discord Client ID first.")?;
    let now = crate::unix_ms_now() / 1000;
    if saved.access_token.is_some() && saved.expires_at - 300 < now {
        if let Some(refresh) = saved.refresh_token.clone() {
            if let Ok(fresh) = token_request(
                &saved,
                &[("grant_type", "refresh_token"), ("refresh_token", &refresh)],
            ) {
                saved = fresh;
                save(keys, &saved)?;
            }
        }
    }
    let mut ignore = |_: &Value| {};
    if let Some(token) = saved.access_token.clone() {
        if let Ok(data) = rpc.call(
            "AUTHENTICATE",
            json!({ "access_token": token }),
            None,
            Duration::from_secs(15),
            &mut ignore,
        ) {
            return Ok(data["user"]["id"].as_str().unwrap_or_default().to_owned());
        }
    }
    if !interactive {
        return Err("Discord sign-in expired. Connect Discord again in Settings.".into());
    }
    let (verifier, challenge) = pkce();
    let code = rpc.call(
        "AUTHORIZE",
        json!({ "client_id": saved.client_id, "scopes": SCOPES, "code_challenge": challenge, "code_challenge_method": "S256" }),
        None,
        Duration::from_secs(180),
        &mut ignore,
    )?;
    let code = code["code"]
        .as_str()
        .ok_or("Discord sent no code.")?
        .to_owned();
    saved = token_request(
        &saved,
        &[
            ("grant_type", "authorization_code"),
            ("code", &code),
            ("redirect_uri", REDIRECT_URI),
            ("code_verifier", &verifier),
        ],
    )?;
    let data = rpc.call(
        "AUTHENTICATE",
        json!({ "access_token": saved.access_token }),
        None,
        Duration::from_secs(15),
        &mut ignore,
    )?;
    let user = &data["user"];
    saved.user_name = user["global_name"]
        .as_str()
        .or(user["username"].as_str())
        .map(str::to_owned);
    save(keys, &saved)?;
    Ok(user["id"].as_str().unwrap_or_default().to_owned())
}

/// `POST /v1/meetings/discord/connect`: Discord shows "Authorize" once.
pub fn connect(keys: &dyn KeyStore) -> Result<Value, String> {
    let saved = load(keys).ok_or("Add your Discord Client ID first.")?;
    let (mut rpc, _) = Rpc::open(&saved.client_id)?;
    authenticate(&mut rpc, keys, true)?;
    Ok(status(keys))
}

fn person(state: &Value) -> (String, String) {
    let user = &state["user"];
    let name = state["nick"]
        .as_str()
        .or(user["global_name"].as_str())
        .or(user["username"].as_str())
        .unwrap_or_default();
    (
        user["id"].as_str().unwrap_or_default().to_owned(),
        name.to_owned(),
    )
}

/// During a Discord meeting: write speaking events to `<dir>/speaking.jsonl` until `stop`.
/// Errors go to `<dir>/discord-error.txt`; the meeting records either way.
pub fn record(dir: &Path, keys: Arc<dyn KeyStore>, stop: Arc<AtomicBool>, started: Instant) {
    if let Err(e) = record_inner(dir, keys.as_ref(), &stop, started) {
        let _ = std::fs::write(dir.join("discord-error.txt"), e);
    }
}

fn record_inner(
    dir: &Path,
    keys: &dyn KeyStore,
    stop: &AtomicBool,
    started: Instant,
) -> Result<(), String> {
    let saved = load(keys).ok_or("Discord is not set up.")?;
    let (mut rpc, _) = Rpc::open(&saved.client_id)?;
    let local = authenticate(&mut rpc, keys, false)?;
    let mut out = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(dir.join("speaking.jsonl"))
        .map_err(|e| e.to_string())?;
    let mut names: std::collections::HashMap<String, String> = Default::default();
    let write =
        |out: &mut File, mut ev: Value, names: &std::collections::HashMap<String, String>| {
            ev["t"] = json!(started.elapsed().as_secs_f32());
            if let Some(name) = ev["user_id"].as_str().and_then(|id| names.get(id)) {
                ev["name"] = Value::from(name.clone());
            }
            let _ = writeln!(out, "{ev}");
        };
    write(
        &mut out,
        json!({ "event": "local", "user_id": local }),
        &names,
    );
    let wait = Duration::from_secs(15);
    let mut pending: Vec<Value> = Vec::new();
    let mut keep = |ev: &Value| pending.push(ev.clone());
    rpc.call(
        "SUBSCRIBE",
        json!({}),
        Some("VOICE_CHANNEL_SELECT"),
        wait,
        &mut keep,
    )?;
    let channel = rpc.call(
        "GET_SELECTED_VOICE_CHANNEL",
        json!({}),
        None,
        wait,
        &mut keep,
    )?;
    let mut current = String::new();
    let select = |rpc: &mut Rpc,
                  channel: &Value,
                  names: &mut std::collections::HashMap<String, String>,
                  current: &mut String,
                  keep: &mut dyn FnMut(&Value)|
     -> Result<(), String> {
        let Some(id) = channel["id"].as_str() else {
            return Ok(());
        };
        for state in channel["voice_states"].as_array().into_iter().flatten() {
            let (uid, name) = person(state);
            names.insert(uid, name);
        }
        for evt in CHANNEL_EVENTS {
            rpc.call(
                "SUBSCRIBE",
                json!({ "channel_id": id }),
                Some(evt),
                wait,
                keep,
            )?;
        }
        *current = id.to_owned();
        Ok(())
    };
    select(&mut rpc, &channel, &mut names, &mut current, &mut keep)?;
    drop(keep);
    let handle = |frame: &Value,
                  names: &mut std::collections::HashMap<String, String>,
                  out: &mut File|
     -> Option<String> {
        let data = &frame["data"];
        match frame["evt"].as_str()? {
            "SPEAKING_START" | "SPEAKING_STOP" => {
                let event = if frame["evt"] == "SPEAKING_START" {
                    "start"
                } else {
                    "stop"
                };
                write(
                    out,
                    json!({ "event": event, "user_id": data["user_id"] }),
                    names,
                );
                None
            }
            "VOICE_STATE_CREATE" => {
                let (uid, name) = person(data);
                names.insert(uid.clone(), name);
                write(out, json!({ "event": "join", "user_id": uid }), names);
                None
            }
            "VOICE_CHANNEL_SELECT" => data["channel_id"].as_str().map(str::to_owned),
            _ => None,
        }
    };
    for frame in std::mem::take(&mut pending) {
        handle(&frame, &mut names, &mut out);
    }
    while !stop.load(Ordering::Acquire) {
        let Some(frame) = rpc.poll()? else { continue };
        if let Some(new_channel) = handle(&frame, &mut names, &mut out) {
            if new_channel != current {
                let mut events = Vec::new();
                let channel = rpc.call(
                    "GET_CHANNEL",
                    json!({ "channel_id": new_channel }),
                    None,
                    wait,
                    &mut |e| events.push(e.clone()),
                )?;
                select(&mut rpc, &channel, &mut names, &mut current, &mut |_| {})?;
                for e in events {
                    handle(&e, &mut names, &mut out);
                }
            }
        }
    }
    let _ = rpc.send(OP_CLOSE, &json!({}));
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::credentials::MemoryKeyStore;

    #[test]
    fn frames_round_trip_and_wait_for_whole_frames() {
        let bytes = encode_frame(OP_FRAME, &json!({"cmd": "DISPATCH", "evt": "READY"}));
        assert!(decode_frame(&bytes[..10]).is_none());
        let (op, payload, used) = decode_frame(&bytes).unwrap().unwrap();
        assert_eq!(
            (op, payload["evt"].as_str(), used),
            (OP_FRAME, Some("READY"), bytes.len())
        );
        let mut huge = vec![1, 0, 0, 0];
        huge.extend_from_slice(&(u32::MAX).to_le_bytes());
        assert!(decode_frame(&huge).unwrap().is_err());
    }

    #[test]
    fn pkce_is_rfc7636_shaped() {
        assert_eq!(base64url(b"\xfb\xff"), "-_8");
        // RFC 7636 appendix B.
        let challenge = base64url(&Sha256::digest(
            b"dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk",
        ));
        assert_eq!(challenge, "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
        let (v1, _) = pkce();
        let (v2, _) = pkce();
        assert_eq!(v1.len(), 43);
        assert_ne!(v1, v2);
    }

    #[test]
    fn status_never_shows_secrets() {
        let keys = MemoryKeyStore::default();
        assert_eq!(status(&keys)["configured"], false);
        let saved = Saved {
            client_id: "123".into(),
            client_secret: Some("s3cret".into()),
            access_token: Some("tok".into()),
            ..Saved::default()
        };
        save(&keys, &saved).unwrap();
        let text = status(&keys).to_string();
        assert!(text.contains("\"connected\":true") && text.contains("123"));
        assert!(!text.contains("s3cret") && !text.contains("tok\""));
        assert_eq!(load(&keys), Some(saved));
    }

    #[test]
    fn form_encoding() {
        assert_eq!(
            form(&[("a b", "x&y=z"), ("u", "http://127.0.0.1")]),
            "a%20b=x%26y%3Dz&u=http%3A%2F%2F127.0.0.1"
        );
    }
}
