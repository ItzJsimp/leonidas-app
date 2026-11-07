//! Call detection. Slice S7.
//!
//! Windows records which apps use the mic in the consent store:
//! `HKCU\Software\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\microphone`.
//! An app that uses the mic right now has `LastUsedTimeStop == 0`. Read on request only: no
//! thread, no hook. The app asks every few seconds while it is open.

/// Exe names and package ids (lower case) of apps that make calls.
const CALL_APPS: [(&str, &str); 14] = [
    ("discord", "Discord"),
    ("zoom", "Zoom"),
    ("ms-teams", "Teams"),
    ("msteams", "Teams"),
    ("teams", "Teams"),
    ("slack", "Slack"),
    ("whatsapp", "WhatsApp"),
    ("telegram", "Telegram"),
    ("webex", "Webex"),
    ("skype", "Skype"),
    ("chrome", "Chrome"),
    ("msedge", "Edge"),
    ("firefox", "Firefox"),
    ("brave", "Brave"),
];

/// The call app for one consent-store key name, or `None`.
/// Desktop apps: `C:#Users#me#AppData#Local#Discord#app-1.0#Discord.exe`.
/// Store apps: `MSTeams_8wekyb3d8bbwe`, `5319275A.WhatsAppDesktop_cv1g1gvanyjgm`.
pub fn call_app(key: &str) -> Option<&'static str> {
    let last = key.rsplit('#').next().unwrap_or(key).to_ascii_lowercase();
    let name = last.strip_suffix(".exe").unwrap_or(&last);
    let package = name.split('_').next().unwrap_or(name);
    let package = package.rsplit('.').next().unwrap_or(package);
    CALL_APPS
        .iter()
        .find(|(id, _)| name == *id || package == *id || package.starts_with(id))
        .map(|(_, app)| *app)
}

/// Call apps that hold the mic now, first match per app, in a stable order.
pub fn active_calls() -> Vec<&'static str> {
    let mut apps: Vec<&'static str> = mic_users().iter().filter_map(|k| call_app(k)).collect();
    apps.sort_unstable();
    apps.dedup();
    // A desktop call app beats a browser: a browser often holds the mic for other reasons.
    apps.sort_by_key(|a| matches!(*a, "Chrome" | "Edge" | "Firefox" | "Brave"));
    apps
}

#[cfg(windows)]
fn mic_users() -> Vec<String> {
    use windows_sys::Win32::System::Registry::{
        RegCloseKey, RegEnumKeyExW, RegOpenKeyExW, RegQueryValueExW, HKEY, HKEY_CURRENT_USER,
        KEY_READ,
    };
    const ROOT: &str =
        "Software\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\microphone";
    let wide = |s: &str| s.encode_utf16().chain(Some(0)).collect::<Vec<u16>>();

    /// Subkey names of an open key.
    unsafe fn children(key: HKEY) -> Vec<String> {
        let mut out = Vec::new();
        let mut name = [0u16; 512];
        for index in 0.. {
            let mut len = name.len() as u32;
            let rc = RegEnumKeyExW(
                key,
                index,
                name.as_mut_ptr(),
                &mut len,
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                std::ptr::null_mut(),
            );
            if rc != 0 {
                break;
            }
            out.push(String::from_utf16_lossy(&name[..len as usize]));
        }
        out
    }

    /// True when `parent\name` has `LastUsedTimeStop == 0` and a start time.
    unsafe fn in_use(parent: HKEY, name: &str) -> bool {
        let wide = |s: &str| s.encode_utf16().chain(Some(0)).collect::<Vec<u16>>();
        let mut key: HKEY = std::ptr::null_mut();
        if RegOpenKeyExW(parent, wide(name).as_ptr(), 0, KEY_READ, &mut key) != 0 {
            return false;
        }
        let read = |value: &str| -> Option<u64> {
            let (mut data, mut len) = (0u64, 8u32);
            let rc = RegQueryValueExW(
                key,
                wide(value).as_ptr(),
                std::ptr::null(),
                std::ptr::null_mut(),
                (&mut data as *mut u64).cast(),
                &mut len,
            );
            (rc == 0).then_some(data)
        };
        let used = matches!((read("LastUsedTimeStart"), read("LastUsedTimeStop")), (Some(s), Some(0)) if s > 0);
        RegCloseKey(key);
        used
    }

    let mut users = Vec::new();
    unsafe {
        let mut root: HKEY = std::ptr::null_mut();
        if RegOpenKeyExW(
            HKEY_CURRENT_USER,
            wide(ROOT).as_ptr(),
            0,
            KEY_READ,
            &mut root,
        ) != 0
        {
            return users;
        }
        for name in children(root) {
            if name == "NonPackaged" {
                let mut desktop: HKEY = std::ptr::null_mut();
                if RegOpenKeyExW(root, wide(&name).as_ptr(), 0, KEY_READ, &mut desktop) == 0 {
                    // Old app versions keep a stale "in use" entry: skip exes that are gone.
                    users.extend(
                        children(desktop)
                            .into_iter()
                            .filter(|n| std::path::Path::new(&n.replace('#', "\\")).is_file())
                            .filter(|n| in_use(desktop, n)),
                    );
                    RegCloseKey(desktop);
                }
            } else if in_use(root, &name) {
                users.push(name);
            }
        }
        RegCloseKey(root);
    }
    users
}

#[cfg(not(windows))]
fn mic_users() -> Vec<String> {
    Vec::new()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn key_names_map_to_call_apps() {
        assert_eq!(
            call_app("C:#Users#Jacob#AppData#Local#Discord#app-1.0.9#Discord.exe"),
            Some("Discord")
        );
        assert_eq!(call_app("C:#Program Files#Zoom#bin#Zoom.exe"), Some("Zoom"));
        assert_eq!(call_app("MSTeams_8wekyb3d8bbwe"), Some("Teams"));
        assert_eq!(
            call_app("5319275A.WhatsAppDesktop_cv1g1gvanyjgm"),
            Some("WhatsApp")
        );
        assert_eq!(
            call_app("C:#Program Files#Google#Chrome#Application#chrome.exe"),
            Some("Chrome")
        );
        assert_eq!(
            call_app("C:#Program Files#Leonidas Code#Leonidas Code.exe"),
            None
        );
        assert_eq!(call_app("C:#lcw#scribe-engine.exe"), None);
        assert_eq!(
            call_app("Microsoft.WindowsSoundRecorder_8wekyb3d8bbwe"),
            None
        );
    }

    /// `cargo test real_mic_users -- --ignored --nocapture` lists what holds the mic now.
    #[test]
    #[ignore]
    fn real_mic_users() {
        println!("mic users: {:?}", mic_users());
        println!("calls: {:?}", active_calls());
    }
}
