//! Paste into the focused window: clipboard, then Ctrl+V, then restore.
//!
//! Only plain text (`CF_UNICODETEXT`) is saved and restored. Images or files on the
//! clipboard before a dictation are not brought back.

use crate::engine::Paster;

/// Text as UTF-16 for `CF_UNICODETEXT`: lone `\n` becomes `\r\n`, plus a NUL terminator.
pub fn to_clipboard_utf16(text: &str) -> Vec<u16> {
    let mut out = Vec::with_capacity(text.len() + 8);
    let mut prev_cr = false;
    for unit in text.encode_utf16() {
        if unit == u16::from(b'\n') && !prev_cr {
            out.push(u16::from(b'\r'));
        }
        prev_cr = unit == u16::from(b'\r');
        out.push(unit);
    }
    out.push(0);
    out
}

#[derive(Default)]
pub struct ClipboardPaster;

impl ClipboardPaster {
    pub fn new() -> Self {
        Self
    }
}

impl Paster for ClipboardPaster {
    fn paste(&self, text: &str) -> bool {
        #[cfg(windows)]
        {
            win::paste(text)
        }
        #[cfg(not(windows))]
        {
            let _ = text;
            false
        }
    }

    fn copy(&self, text: &str) -> bool {
        #[cfg(windows)]
        {
            win::copy(text)
        }
        #[cfg(not(windows))]
        {
            let _ = text;
            false
        }
    }
}

#[cfg(windows)]
pub fn copy_selection() -> Option<String> {
    win::copy_selection()
}
#[cfg(windows)]
pub fn foreground_window() -> usize {
    unsafe { windows_sys::Win32::UI::WindowsAndMessaging::GetForegroundWindow() as usize }
}
#[cfg(windows)]
pub fn restore_focus(hwnd: usize) -> bool {
    unsafe {
        windows_sys::Win32::UI::WindowsAndMessaging::SetForegroundWindow(hwnd as _) != 0
            && windows_sys::Win32::UI::WindowsAndMessaging::GetForegroundWindow() == hwnd as _
    }
}

#[cfg(windows)]
mod win {
    use super::to_clipboard_utf16;
    use std::time::{Duration, Instant};
    use windows_sys::Win32::Foundation::GlobalFree;
    use windows_sys::Win32::System::DataExchange::{
        CloseClipboard, EmptyClipboard, GetClipboardData, GetClipboardSequenceNumber,
        OpenClipboard, RegisterClipboardFormatW, SetClipboardData,
    };
    use windows_sys::Win32::System::Memory::{
        GlobalAlloc, GlobalLock, GlobalSize, GlobalUnlock, GMEM_MOVEABLE,
    };
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
        GetAsyncKeyState, SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYEVENTF_KEYUP,
        VK_CONTROL, VK_LWIN, VK_MENU, VK_RWIN, VK_SHIFT,
    };

    const CF_UNICODETEXT: u32 = 13;
    const MODIFIERS: [u16; 5] = [VK_CONTROL, VK_SHIFT, VK_MENU, VK_LWIN, VK_RWIN];

    /// Holds the clipboard open; closes it on drop.
    struct Clipboard;

    impl Clipboard {
        fn open() -> Option<Self> {
            for _ in 0..10 {
                // SAFETY: a null owner window is allowed.
                if unsafe { OpenClipboard(std::ptr::null_mut()) } != 0 {
                    return Some(Self);
                }
                std::thread::sleep(Duration::from_millis(10));
            }
            None
        }

        fn read_text(&self) -> Option<Vec<u16>> {
            // SAFETY: the clipboard is open; the handle is only read while locked.
            unsafe {
                let handle = GetClipboardData(CF_UNICODETEXT);
                if handle.is_null() {
                    return None;
                }
                let ptr = GlobalLock(handle) as *const u16;
                if ptr.is_null() {
                    return None;
                }
                let max = GlobalSize(handle) / 2;
                let len = (0..max).take_while(|&i| *ptr.add(i) != 0).count();
                let mut text = std::slice::from_raw_parts(ptr, len).to_vec();
                GlobalUnlock(handle);
                text.push(0);
                Some(text)
            }
        }

        /// Replace the clipboard with `units` (NUL-terminated UTF-16).
        fn write_text(&self, units: &[u16], exclude_from_history: bool) -> bool {
            // SAFETY: the clipboard is open; on success the system owns each handle.
            unsafe {
                if EmptyClipboard() == 0 {
                    return false;
                }
                if !set_data(
                    CF_UNICODETEXT,
                    units.as_ptr().cast(),
                    std::mem::size_of_val(units),
                ) {
                    return false;
                }
                if exclude_from_history {
                    let zero = 0u32.to_ne_bytes();
                    for name in [
                        "ExcludeClipboardContentFromMonitorProcessing",
                        "CanIncludeInClipboardHistory",
                        "CanUploadToCloudClipboard",
                    ] {
                        let wide: Vec<u16> = name.encode_utf16().chain([0]).collect();
                        let format = RegisterClipboardFormatW(wide.as_ptr());
                        if format != 0 {
                            set_data(format, zero.as_ptr(), zero.len());
                        }
                    }
                }
                true
            }
        }
    }

    impl Drop for Clipboard {
        fn drop(&mut self) {
            // SAFETY: this value exists only while the clipboard is open.
            unsafe { CloseClipboard() };
        }
    }

    /// SAFETY: the clipboard must be open and `src` valid for `len` bytes.
    unsafe fn set_data(format: u32, src: *const u8, len: usize) -> bool {
        let mem = GlobalAlloc(GMEM_MOVEABLE, len.max(1));
        if mem.is_null() {
            return false;
        }
        let dst = GlobalLock(mem) as *mut u8;
        if dst.is_null() {
            GlobalFree(mem);
            return false;
        }
        std::ptr::copy_nonoverlapping(src, dst, len);
        GlobalUnlock(mem);
        if SetClipboardData(format, mem).is_null() {
            GlobalFree(mem);
            return false;
        }
        true
    }

    fn key_down(vk: u16) -> bool {
        // SAFETY: plain query of the async key state.
        (unsafe { GetAsyncKeyState(i32::from(vk)) } as u16 & 0x8000) != 0
    }

    fn key(vk: u16, up: bool) -> INPUT {
        INPUT {
            r#type: INPUT_KEYBOARD,
            Anonymous: INPUT_0 {
                ki: KEYBDINPUT {
                    wVk: vk,
                    wScan: 0,
                    dwFlags: if up { KEYEVENTF_KEYUP } else { 0 },
                    time: 0,
                    dwExtraInfo: 0,
                },
            },
        }
    }

    fn send(inputs: &[INPUT]) -> bool {
        // SAFETY: `inputs` is a valid slice of INPUT structs.
        let sent = unsafe {
            SendInput(
                inputs.len() as u32,
                inputs.as_ptr(),
                std::mem::size_of::<INPUT>() as i32,
            )
        };
        sent as usize == inputs.len()
    }

    /// Wait up to 500 ms for the user to release the hold chord, then force key-ups,
    /// so Ctrl+V does not become Ctrl+Shift+V.
    fn release_modifiers() {
        let deadline = Instant::now() + Duration::from_millis(500);
        while MODIFIERS.iter().any(|&vk| key_down(vk)) && Instant::now() < deadline {
            std::thread::sleep(Duration::from_millis(10));
        }
        let held: Vec<INPUT> = MODIFIERS
            .iter()
            .filter(|&&vk| key_down(vk))
            .map(|&vk| key(vk, true))
            .collect();
        if !held.is_empty() {
            send(&held);
        }
    }

    pub fn copy_selection() -> Option<String> {
        let saved = Clipboard::open()?.read_text();
        release_modifiers();
        let seq = unsafe { GetClipboardSequenceNumber() };
        let c = u16::from(b'C');
        if !send(&[
            key(VK_CONTROL, false),
            key(c, false),
            key(c, true),
            key(VK_CONTROL, true),
        ]) {
            return None;
        }
        let deadline = Instant::now() + Duration::from_millis(400);
        while unsafe { GetClipboardSequenceNumber() } == seq && Instant::now() < deadline {
            std::thread::sleep(Duration::from_millis(10));
        }
        if unsafe { GetClipboardSequenceNumber() } == seq {
            return None;
        }
        let clip = Clipboard::open()?;
        let copied = clip
            .read_text()
            .map(|v| String::from_utf16_lossy(&v[..v.len().saturating_sub(1)]));
        if let Some(saved) = saved {
            clip.write_text(&saved, false);
        }
        copied.filter(|s| !s.trim().is_empty())
    }

    pub fn copy(text: &str) -> bool {
        Clipboard::open().is_some_and(|clip| clip.write_text(&to_clipboard_utf16(text), false))
    }

    pub fn paste(text: &str) -> bool {
        release_modifiers();
        let units = to_clipboard_utf16(text);
        let (saved, our_seq) = {
            let Some(clip) = Clipboard::open() else {
                return false;
            };
            let saved = clip.read_text();
            if !clip.write_text(&units, true) {
                return false;
            }
            // SAFETY: plain query.
            (saved, unsafe { GetClipboardSequenceNumber() })
        };
        let v = u16::from(b'V');
        if !send(&[
            key(VK_CONTROL, false),
            key(v, false),
            key(v, true),
            key(VK_CONTROL, true),
        ]) {
            return false;
        }
        if let Some(saved) = saved {
            std::thread::spawn(move || {
                std::thread::sleep(Duration::from_millis(300));
                // Restore only if nobody copied something else in the meantime.
                // SAFETY: plain query.
                if unsafe { GetClipboardSequenceNumber() } == our_seq {
                    if let Some(clip) = Clipboard::open() {
                        clip.write_text(&saved, false);
                    }
                }
            });
        }
        true
    }

    #[cfg(test)]
    mod tests {
        use super::*;

        #[test]
        #[ignore = "Uses the real clipboard"]
        fn clipboard_write_read_round_trip() {
            let units = to_clipboard_utf16("scribe test 🎙\nline two");
            {
                let clip = Clipboard::open().expect("open");
                assert!(clip.write_text(&units, true));
            }
            let clip = Clipboard::open().expect("open");
            assert_eq!(clip.read_text().unwrap(), units);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn decode(units: &[u16]) -> String {
        String::from_utf16(&units[..units.len() - 1]).unwrap()
    }

    #[test]
    fn utf16_is_nul_terminated_and_keeps_emoji() {
        let units = to_clipboard_utf16("hi 🎙");
        assert_eq!(units.last(), Some(&0));
        assert_eq!(decode(&units), "hi 🎙");
    }

    #[test]
    fn lone_newlines_become_crlf_and_existing_crlf_stays() {
        assert_eq!(
            decode(&to_clipboard_utf16("a\nb\r\nc\n")),
            "a\r\nb\r\nc\r\n"
        );
        assert_eq!(decode(&to_clipboard_utf16("")), "");
    }
}
