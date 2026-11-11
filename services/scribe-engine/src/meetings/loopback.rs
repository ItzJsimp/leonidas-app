//! Call audio from chosen apps (WASAPI process loopback). Slice S2.
//!
//! Windows can capture the sound of one app and its child processes, so a Spotify or a
//! YouTube tab that plays next to a Discord call stays out of the meeting. This needs
//! Windows 10 build 20348 or later (Windows 11). Other systems list no apps and report
//! `per_app_supported() == false`, and the caller says so instead of recording everything.

use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;

/// First Windows build with process loopback (Windows 11 and Server 2022).
const MIN_BUILD: u32 = 20_348;
/// Format asked from Windows: 48 kHz stereo f32. `autoconvert` adapts the real stream.
pub const RATE: u32 = 48_000;

pub fn build_supports_per_app(build: u32) -> bool {
    build >= MIN_BUILD
}

/// An app with an audio session now. `playing` is true while its stream runs.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
pub struct AudioApp {
    pub name: String,
    pub pid: u32,
    pub playing: bool,
}

/// One running process, from a snapshot.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Proc {
    pub pid: u32,
    pub parent: u32,
    pub exe: String,
}

/// `"C:\\Apps\\Discord.exe"` gives `"Discord"`. Known call apps keep the name that call
/// detection uses (`msedge` is "Edge"), so the two lists agree.
pub fn display_name(exe: &str) -> String {
    let file = exe.rsplit(['\\', '/']).next().unwrap_or(exe);
    let stem = match file.rsplit_once('.') {
        Some((stem, ext)) if ext.eq_ignore_ascii_case("exe") => stem,
        _ => file,
    };
    if let Some(app) = super::detect::call_app(stem) {
        return app.to_owned();
    }
    let mut chars = stem.chars();
    match chars.next() {
        Some(first) => first.to_uppercase().collect::<String>() + chars.as_str(),
        None => String::new(),
    }
}

/// The top process of an app: walk up while the parent runs the same exe. Windows captures
/// the whole tree below the process it is given, and an app plays sound from a child.
pub fn root_pid(procs: &[Proc], pid: u32) -> u32 {
    let find = |p: u32| procs.iter().find(|x| x.pid == p);
    let Some(start) = find(pid) else { return pid };
    let name = start.exe.to_ascii_lowercase();
    let mut current = start;
    for _ in 0..32 {
        match find(current.parent) {
            Some(parent)
                if parent.pid != current.pid && parent.exe.to_ascii_lowercase() == name =>
            {
                current = parent;
            }
            _ => break,
        }
    }
    current.pid
}

/// The root pids of every running app called `name` (case does not matter).
pub fn pids_for(procs: &[Proc], name: &str) -> Vec<u32> {
    let mut roots: Vec<u32> = procs
        .iter()
        .filter(|p| display_name(&p.exe).eq_ignore_ascii_case(name))
        .map(|p| root_pid(procs, p.pid))
        .collect();
    roots.sort_unstable();
    roots.dedup();
    roots
}

/// Where a capture thread puts its audio. All fields are shared with the owning `Track`.
#[derive(Clone)]
pub struct Sink {
    pub buffer: Arc<Mutex<Vec<f32>>>,
    pub level: Arc<AtomicU32>,
    pub error: Arc<Mutex<Option<String>>>,
}

/// A running per-app capture. Dropping it stops the thread.
pub struct AppCapture {
    stop: Arc<AtomicBool>,
    thread: Option<JoinHandle<()>>,
}

impl Drop for AppCapture {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::Release);
        if let Some(thread) = self.thread.take() {
            let _ = thread.join();
        }
    }
}

/// Stereo f32 little-endian frames to mono.
pub fn mono_from_f32_stereo(bytes: &[u8]) -> Vec<f32> {
    bytes
        .chunks_exact(8)
        .map(|f| {
            let l = f32::from_le_bytes([f[0], f[1], f[2], f[3]]);
            let r = f32::from_le_bytes([f[4], f[5], f[6], f[7]]);
            (l + r) * 0.5
        })
        .collect()
}

#[cfg(windows)]
pub use win::{audio_apps, capture_app, per_app_supported, processes};

#[cfg(not(windows))]
pub fn per_app_supported() -> bool {
    false
}

#[cfg(not(windows))]
pub fn audio_apps() -> Vec<AudioApp> {
    Vec::new()
}

#[cfg(not(windows))]
pub fn processes() -> Vec<Proc> {
    Vec::new()
}

#[cfg(not(windows))]
pub fn capture_app(_pid: u32, _sink: Sink) -> Result<AppCapture, String> {
    Err("Choosing apps needs Windows 11.".into())
}

#[cfg(windows)]
mod win {
    use super::*;
    use std::collections::{BTreeMap, VecDeque};
    use std::sync::mpsc;
    use std::time::Duration;
    use wasapi::{
        initialize_mta, AudioClient, DeviceEnumerator, Direction, SampleType, SessionState,
        StreamMode, WaveFormat,
    };

    /// `CurrentBuildNumber` from the registry.
    fn windows_build() -> u32 {
        use windows_sys::Win32::System::Registry::{
            RegCloseKey, RegOpenKeyExW, RegQueryValueExW, HKEY, HKEY_LOCAL_MACHINE, KEY_READ,
        };
        let wide = |s: &str| s.encode_utf16().chain(Some(0)).collect::<Vec<u16>>();
        let mut key: HKEY = std::ptr::null_mut();
        let mut build = 0;
        unsafe {
            let path = wide("SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion");
            if RegOpenKeyExW(HKEY_LOCAL_MACHINE, path.as_ptr(), 0, KEY_READ, &mut key) != 0 {
                return 0;
            }
            let mut data = [0u16; 16];
            let mut len = std::mem::size_of_val(&data) as u32;
            let name = wide("CurrentBuildNumber");
            let rc = RegQueryValueExW(
                key,
                name.as_ptr(),
                std::ptr::null(),
                std::ptr::null_mut(),
                data.as_mut_ptr().cast(),
                &mut len,
            );
            if rc == 0 {
                let text = String::from_utf16_lossy(&data[..(len as usize / 2).min(16)]);
                build = text.trim_end_matches('\0').trim().parse().unwrap_or(0);
            }
            RegCloseKey(key);
        }
        build
    }

    pub fn per_app_supported() -> bool {
        build_supports_per_app(windows_build())
    }

    /// Every running process, from a Toolhelp snapshot.
    pub fn processes() -> Vec<Proc> {
        use windows_sys::Win32::Foundation::{CloseHandle, INVALID_HANDLE_VALUE};
        use windows_sys::Win32::System::Diagnostics::ToolHelp::{
            CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W,
            TH32CS_SNAPPROCESS,
        };
        let mut out = Vec::new();
        unsafe {
            let snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
            if snapshot == INVALID_HANDLE_VALUE {
                return out;
            }
            let mut entry: PROCESSENTRY32W = std::mem::zeroed();
            entry.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as u32;
            let mut more = Process32FirstW(snapshot, &mut entry) != 0;
            while more {
                let len = entry
                    .szExeFile
                    .iter()
                    .position(|c| *c == 0)
                    .unwrap_or(entry.szExeFile.len());
                out.push(Proc {
                    pid: entry.th32ProcessID,
                    parent: entry.th32ParentProcessID,
                    exe: String::from_utf16_lossy(&entry.szExeFile[..len]),
                });
                more = Process32NextW(snapshot, &mut entry) != 0;
            }
            CloseHandle(snapshot);
        }
        out
    }

    /// Run `f` on a fresh thread so COM starts clean (MTA) and ends with the thread.
    fn on_com_thread<T: Send + 'static>(f: impl FnOnce() -> T + Send + 'static) -> Option<T> {
        std::thread::Builder::new()
            .name("meeting-audio-apps".into())
            .spawn(move || {
                let _ = initialize_mta();
                f()
            })
            .ok()?
            .join()
            .ok()
    }

    /// Apps with an audio session on any speaker, one row per app name. `playing` wins
    /// over idle when an app has both.
    pub fn audio_apps() -> Vec<AudioApp> {
        let procs = processes();
        on_com_thread(move || {
            let mut apps: BTreeMap<String, AudioApp> = BTreeMap::new();
            let Ok(enumerator) = DeviceEnumerator::new() else {
                return Vec::new();
            };
            let Ok(devices) = enumerator.get_device_collection(Direction::Render) else {
                return Vec::new();
            };
            for device in &devices {
                let Ok(device) = device else { continue };
                let Ok(manager) = device.get_iaudiosessionmanager() else {
                    continue;
                };
                let Ok(sessions) = manager.get_audiosessionenumerator() else {
                    continue;
                };
                let Ok(count) = sessions.get_count() else {
                    continue;
                };
                for index in 0..count {
                    let Ok(control) = sessions.get_session(index) else {
                        continue;
                    };
                    let (Ok(pid), Ok(state)) = (control.get_process_id(), control.get_state())
                    else {
                        continue;
                    };
                    // Process 0 is the system sound session. Expired sessions are gone. The
                    // engine's own capture adds a session too: never offer it.
                    if pid == 0 || pid == std::process::id() || state == SessionState::Expired {
                        continue;
                    }
                    let Some(proc) = procs.iter().find(|p| p.pid == pid) else {
                        continue;
                    };
                    let name = display_name(&proc.exe);
                    let playing = state == SessionState::Active;
                    let entry = apps.entry(name.clone()).or_insert(AudioApp {
                        name,
                        pid: root_pid(&procs, pid),
                        playing,
                    });
                    entry.playing |= playing;
                }
            }
            apps.into_values().collect()
        })
        .unwrap_or_default()
    }

    /// Start capturing one app's process tree into `sink`. Fails at once when Windows
    /// cannot do process loopback (before Windows 11) or the process is gone.
    pub fn capture_app(pid: u32, sink: Sink) -> Result<AppCapture, String> {
        let stop = Arc::new(AtomicBool::new(false));
        let (ready_tx, ready_rx) = mpsc::channel::<Result<(), String>>();
        let thread = {
            let stop = stop.clone();
            std::thread::Builder::new()
                .name("meeting-app-audio".into())
                .spawn(move || run(pid, sink, stop, ready_tx))
                .map_err(|e| e.to_string())?
        };
        match ready_rx.recv_timeout(Duration::from_secs(5)) {
            Ok(Ok(())) => Ok(AppCapture {
                stop,
                thread: Some(thread),
            }),
            Ok(Err(message)) => {
                let _ = thread.join();
                Err(message)
            }
            Err(_) => {
                stop.store(true, Ordering::Release);
                Err("Windows did not start the app audio capture.".into())
            }
        }
    }

    fn run(pid: u32, sink: Sink, stop: Arc<AtomicBool>, ready: mpsc::Sender<Result<(), String>>) {
        let setup = || -> Result<_, String> {
            let _ = initialize_mta();
            let format = WaveFormat::new(32, 32, SampleType::Float, RATE as usize, 2, None);
            let mut client = AudioClient::new_application_loopback_client(pid, true)
                .map_err(|e| format!("Cannot capture this app's audio: {e}"))?;
            let mode = StreamMode::EventsShared {
                autoconvert: true,
                buffer_duration_hns: 0,
            };
            client
                .initialize_client(&format, Direction::Capture, mode, None)
                .map_err(|e| format!("Cannot start this app's audio: {e}"))?;
            let event = client.set_get_eventhandle().map_err(|e| e.to_string())?;
            let capture = client.get_audiocaptureclient().map_err(|e| e.to_string())?;
            client.start_stream().map_err(|e| e.to_string())?;
            Ok((client, event, capture))
        };
        let (client, event, capture) = match setup() {
            Ok(parts) => {
                let _ = ready.send(Ok(()));
                parts
            }
            Err(message) => {
                let _ = ready.send(Err(message));
                return;
            }
        };
        let mut raw: VecDeque<u8> = VecDeque::new();
        while !stop.load(Ordering::Acquire) {
            // A timeout is normal: an app that plays nothing sends no packets.
            if event.wait_for_event(200).is_err() {
                continue;
            }
            while matches!(capture.get_next_packet_size(), Ok(Some(n)) if n > 0) {
                if let Err(e) = capture.read_from_device_to_deque(&mut raw) {
                    if let Ok(mut slot) = sink.error.lock() {
                        slot.get_or_insert_with(|| format!("App audio failed: {e}"));
                    }
                    break;
                }
            }
            if raw.is_empty() {
                continue;
            }
            let bytes: Vec<u8> = raw.drain(..).collect();
            let mono = mono_from_f32_stereo(&bytes);
            if let Ok(mut buffer) = sink.buffer.lock() {
                let start = buffer.len();
                buffer.extend_from_slice(&mono);
                let peak = buffer[start..].iter().fold(0.0f32, |m, v| m.max(v.abs()));
                sink.level.fetch_max(peak.to_bits(), Ordering::Relaxed);
            }
        }
        let _ = client.stop_stream();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn proc(pid: u32, parent: u32, exe: &str) -> Proc {
        Proc {
            pid,
            parent,
            exe: exe.into(),
        }
    }

    #[test]
    fn exe_paths_become_app_names() {
        assert_eq!(display_name("Discord.exe"), "Discord");
        assert_eq!(display_name("C:\\Apps\\spotify.EXE"), "Spotify");
        assert_eq!(display_name("msedge.exe"), "Edge");
        assert_eq!(display_name("chrome.exe"), "Chrome");
        assert_eq!(display_name("Zoom.exe"), "Zoom");
        assert_eq!(display_name("vlc"), "Vlc");
        assert_eq!(display_name(""), "");
    }

    #[test]
    fn the_root_is_the_top_process_with_the_same_exe() {
        let procs = [
            proc(10, 1, "explorer.exe"),
            proc(20, 10, "Discord.exe"),
            proc(21, 20, "Discord.exe"),
            proc(22, 21, "Discord.exe"),
            proc(30, 10, "Spotify.exe"),
        ];
        assert_eq!(root_pid(&procs, 22), 20, "stops below explorer");
        assert_eq!(root_pid(&procs, 20), 20);
        assert_eq!(root_pid(&procs, 30), 30);
        assert_eq!(root_pid(&procs, 999), 999, "unknown pid is kept");
    }

    #[test]
    fn a_parent_cycle_does_not_loop_forever() {
        let procs = [proc(5, 6, "a.exe"), proc(6, 5, "a.exe")];
        let root = root_pid(&procs, 5);
        assert!(root == 5 || root == 6);
    }

    #[test]
    fn pids_for_returns_one_root_per_app_tree() {
        let procs = [
            proc(20, 10, "Discord.exe"),
            proc(21, 20, "Discord.exe"),
            proc(40, 10, "chrome.exe"),
            proc(41, 40, "chrome.exe"),
            proc(50, 10, "Spotify.exe"),
        ];
        assert_eq!(pids_for(&procs, "discord"), vec![20]);
        assert_eq!(pids_for(&procs, "Chrome"), vec![40]);
        assert!(pids_for(&procs, "Zoom").is_empty());
    }

    #[test]
    fn process_loopback_needs_windows_11() {
        assert!(!build_supports_per_app(19_045), "Windows 10 22H2");
        assert!(build_supports_per_app(22_631), "Windows 11 23H2");
        assert!(build_supports_per_app(20_348));
    }

    #[test]
    fn stereo_float_frames_become_mono() {
        let mut bytes = Vec::new();
        for (l, r) in [(1.0f32, 0.0f32), (0.5, 0.5), (-1.0, 1.0)] {
            bytes.extend_from_slice(&l.to_le_bytes());
            bytes.extend_from_slice(&r.to_le_bytes());
        }
        bytes.extend_from_slice(&[1, 2, 3]); // a torn frame is dropped
        assert_eq!(mono_from_f32_stereo(&bytes), vec![0.5, 0.5, 0.0]);
    }
}

/// Needs Windows 11 and a sound device. Two PowerShell processes play different tones; each
/// capture must hold its own tone and not the other one:
/// `cargo test real_app_capture -- --ignored --nocapture`.
#[cfg(all(test, windows))]
mod real {
    use super::*;
    use std::process::{Command, Stdio};
    use std::time::Duration;

    const WAV_RATE: u32 = 48_000;

    fn wav(path: &std::path::Path, freq: f32, seconds: u32) {
        let samples = WAV_RATE * seconds;
        let mut out = Vec::new();
        out.extend_from_slice(b"RIFF");
        out.extend_from_slice(&(36 + samples * 2).to_le_bytes());
        out.extend_from_slice(b"WAVEfmt ");
        out.extend_from_slice(&16u32.to_le_bytes());
        out.extend_from_slice(&1u16.to_le_bytes()); // PCM
        out.extend_from_slice(&1u16.to_le_bytes()); // mono
        out.extend_from_slice(&WAV_RATE.to_le_bytes());
        out.extend_from_slice(&(WAV_RATE * 2).to_le_bytes());
        out.extend_from_slice(&2u16.to_le_bytes());
        out.extend_from_slice(&16u16.to_le_bytes());
        out.extend_from_slice(b"data");
        out.extend_from_slice(&(samples * 2).to_le_bytes());
        for i in 0..samples {
            let t = i as f32 / WAV_RATE as f32;
            let v = (0.1 * (2.0 * std::f32::consts::PI * freq * t).sin() * 32767.0) as i16;
            out.extend_from_slice(&v.to_le_bytes());
        }
        std::fs::write(path, out).unwrap();
    }

    /// Goertzel power at `freq`, per sample.
    fn power(samples: &[f32], freq: f32) -> f32 {
        let w = 2.0 * std::f32::consts::PI * freq / RATE as f32;
        let coeff = 2.0 * w.cos();
        let (mut s1, mut s2) = (0.0f32, 0.0f32);
        for &x in samples {
            let s = x + coeff * s1 - s2;
            s2 = s1;
            s1 = s;
        }
        (s1 * s1 + s2 * s2 - coeff * s1 * s2) / samples.len().max(1) as f32
    }

    fn play(file: &std::path::Path) -> std::process::Child {
        Command::new("powershell")
            .args([
                "-NoProfile",
                "-Command",
                &format!(
                    "(New-Object Media.SoundPlayer '{}').PlaySync()",
                    file.display()
                ),
            ])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .unwrap()
    }

    fn sink() -> Sink {
        Sink {
            buffer: Arc::default(),
            level: Arc::default(),
            error: Arc::default(),
        }
    }

    #[test]
    #[ignore]
    fn real_app_capture() {
        assert!(per_app_supported(), "this test needs Windows 11");
        let dir = std::env::temp_dir().join(format!("leonidas-loopback-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let (low, high) = (dir.join("low.wav"), dir.join("high.wav"));
        wav(&low, 440.0, 9);
        wav(&high, 1_500.0, 9);
        let (mut a, mut b) = (play(&low), play(&high));
        let (sink_a, sink_b) = (sink(), sink());
        let cap_a = capture_app(a.id(), sink_a.clone()).unwrap();
        let cap_b = capture_app(b.id(), sink_b.clone()).unwrap();
        std::thread::sleep(Duration::from_millis(3_500));
        let listed = audio_apps();
        println!("audio apps: {listed:?}");
        std::thread::sleep(Duration::from_millis(2_500));
        drop((cap_a, cap_b));
        let _ = (a.kill(), b.kill());
        let _ = std::fs::remove_dir_all(&dir);

        let (got_a, got_b) = (
            sink_a.buffer.lock().unwrap().clone(),
            sink_b.buffer.lock().unwrap().clone(),
        );
        println!("captured {} and {} samples", got_a.len(), got_b.len());
        assert!(got_a.len() > RATE as usize, "app A gave no audio");
        assert!(got_b.len() > RATE as usize, "app B gave no audio");
        let (a_low, a_high) = (power(&got_a, 440.0), power(&got_a, 1_500.0));
        let (b_low, b_high) = (power(&got_b, 440.0), power(&got_b, 1_500.0));
        println!("A: 440 Hz {a_low:.6}, 1500 Hz {a_high:.6}");
        println!("B: 440 Hz {b_low:.6}, 1500 Hz {b_high:.6}");
        assert!(a_low > 20.0 * a_high, "capture A has the other app's tone");
        assert!(b_high > 20.0 * b_low, "capture B has the other app's tone");
        assert!(
            listed
                .iter()
                .any(|app| app.name == "Powershell" && app.playing),
            "the app list does not show the playing app: {listed:?}"
        );
    }
}
