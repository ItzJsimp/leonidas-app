//! Global hotkeys (Windows low-level hooks). Slice S2.

use crate::config::Bindings;
use std::sync::{atomic::AtomicBool, mpsc::Sender, Arc};
use std::time::Instant;

/// One trigger from the user. `Instant` is taken inside the hook callback.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HotkeyEvent {
    HoldDown(Instant),
    HoldUp(Instant),
    Toggle(Instant),
    Rewrite(Instant),
    Cancel,
}

const CTRL: u8 = 1;
const SHIFT: u8 = 2;
const ALT: u8 = 4;
const WIN: u8 = 8;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MouseButton {
    Mouse4,
    Mouse5,
    Middle,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Input {
    Key(u16),
    Mouse(MouseButton),
}

impl Input {
    fn slot(self) -> Option<usize> {
        match self {
            Self::Key(vk) if vk < 256 => Some(vk as usize),
            Self::Key(_) => None,
            Self::Mouse(MouseButton::Mouse4) => Some(256),
            Self::Mouse(MouseButton::Mouse5) => Some(257),
            Self::Mouse(MouseButton::Middle) => Some(258),
        }
    }

    fn modifier(self) -> u8 {
        match self {
            Self::Key(0x11 | 0xA2 | 0xA3) => CTRL,
            Self::Key(0x10 | 0xA0 | 0xA1) => SHIFT,
            Self::Key(0x12 | 0xA4 | 0xA5) => ALT,
            Self::Key(0x5B | 0x5C) => WIN,
            _ => 0,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Binding {
    modifiers: u8,
    trigger: Option<Input>,
}

/// Parse one Python Scribe binding. Disabled bindings return `None`.
pub fn parse_binding(text: &str) -> Result<Option<Binding>, String> {
    let text = text.trim();
    if text.is_empty() || text.eq_ignore_ascii_case("none") || text.eq_ignore_ascii_case("disabled")
    {
        return Ok(None);
    }
    let mut binding = Binding {
        modifiers: 0,
        trigger: None,
    };
    for part in text.split('+') {
        let name = part.trim();
        let upper = name.to_ascii_uppercase();
        let modifier = match upper.as_str() {
            "CTRL" | "CONTROL" => CTRL,
            "SHIFT" => SHIFT,
            "ALT" => ALT,
            "WIN" | "META" | "SUPER" => WIN,
            _ => 0,
        };
        if modifier != 0 {
            binding.modifiers |= modifier;
            continue;
        }
        let trigger = match upper.as_str() {
            "MOUSE4" => Input::Mouse(MouseButton::Mouse4),
            "MOUSE5" => Input::Mouse(MouseButton::Mouse5),
            "MIDDLE" | "MIDDLECLICK" => Input::Mouse(MouseButton::Middle),
            "ESCAPE" | "ESC" => Input::Key(0x1B),
            "SPACE" => Input::Key(0x20),
            "ENTER" | "RETURN" => Input::Key(0x0D),
            "TAB" => Input::Key(0x09),
            _ if upper.len() == 1 && upper.as_bytes()[0].is_ascii_alphanumeric() => {
                Input::Key(upper.as_bytes()[0] as u16)
            }
            _ => {
                let function = upper.strip_prefix('F').and_then(|n| n.parse::<u16>().ok());
                match function {
                    Some(n @ 1..=24) => Input::Key(0x6F + n),
                    _ => return Err(format!("hotkeys: unknown binding name '{name}'")),
                }
            }
        };
        if binding.trigger.replace(trigger).is_some() {
            return Err(format!("hotkeys: multiple trigger keys at '{name}'"));
        }
    }
    Ok(Some(binding))
}

#[derive(Clone, Copy, Default)]
enum Suppression {
    #[default]
    None,
    Trigger,
    Cancel,
}

/// Pure event matcher. No Windows state or clock reads occur here.
pub struct Matcher {
    hold: Vec<Binding>,
    toggle: Vec<Binding>,
    cancel: Vec<Binding>,
    rewrite: Vec<Binding>,
    pressed: [bool; 259],
    suppressed: [Suppression; 259],
    held: Option<Binding>,
    accept_injected: bool,
}

impl Matcher {
    pub fn new(bindings: &Bindings, accept_injected: bool) -> Result<Self, String> {
        fn parse_all(names: &[String]) -> Result<Vec<Binding>, String> {
            names
                .iter()
                .filter_map(|name| parse_binding(name).transpose())
                .collect()
        }
        Ok(Self {
            hold: parse_all(&bindings.hold)?,
            toggle: parse_all(&bindings.toggle)?,
            cancel: parse_all(&bindings.cancel)?,
            rewrite: parse_all(&bindings.rewrite)?,
            pressed: [false; 259],
            suppressed: [Suppression::None; 259],
            held: None,
            accept_injected,
        })
    }

    fn modifiers(&self) -> u8 {
        [
            (CTRL, &[0x11, 0xA2, 0xA3][..]),
            (SHIFT, &[0x10, 0xA0, 0xA1][..]),
            (ALT, &[0x12, 0xA4, 0xA5][..]),
            (WIN, &[0x5B, 0x5C][..]),
        ]
        .into_iter()
        .fold(0, |mask, (bit, keys)| {
            mask | if keys.iter().any(|&key| self.pressed[key]) {
                bit
            } else {
                0
            }
        })
    }

    /// Clear modifiers that the OS says are up. Key-ups are lost on the secure desktop
    /// (Win+L, Ctrl+Alt+Del), and a stuck modifier would block every other chord.
    pub fn resync_modifiers(&mut self, is_down: impl Fn(u16) -> bool) {
        for vk in [
            0x11u16, 0xA2, 0xA3, 0x10, 0xA0, 0xA1, 0x12, 0xA4, 0xA5, 0x5B, 0x5C,
        ] {
            // A key this matcher suppressed never reached the OS key state: keep it.
            let ours = !matches!(self.suppressed[usize::from(vk)], Suppression::None);
            if self.pressed[usize::from(vk)] && !ours && !is_down(vk) {
                self.pressed[usize::from(vk)] = false;
                self.suppressed[usize::from(vk)] = Suppression::None;
            }
        }
    }

    /// Feed a key or button transition. The caller supplies the callback timestamp.
    pub fn feed(
        &mut self,
        input: Input,
        down: bool,
        injected: bool,
        at: Instant,
        active: bool,
    ) -> (Option<HotkeyEvent>, bool) {
        if injected && !self.accept_injected {
            return (None, false);
        }
        let Some(slot) = input.slot() else {
            return (None, false);
        };
        let repeat = self.pressed[slot];
        self.pressed[slot] = down;
        let suppress = match self.suppressed[slot] {
            Suppression::None => false,
            Suppression::Trigger => true,
            Suppression::Cancel => active,
        };
        if !down {
            self.suppressed[slot] = Suppression::None;
            if self.held.is_some_and(|binding| {
                binding.trigger == Some(input) || binding.modifiers & input.modifier() != 0
            }) {
                self.held = None;
                return (Some(HotkeyEvent::HoldUp(at)), suppress);
            }
            return (None, suppress);
        }
        if repeat {
            return (None, suppress);
        }
        let modifiers = self.modifiers();
        let matches = |binding: &&Binding| {
            binding.modifiers == modifiers
                && match binding.trigger {
                    Some(trigger) => trigger == input,
                    None => input.modifier() & binding.modifiers != 0,
                }
        };
        let (event, binding, suppression) = if active && self.cancel.iter().find(matches).is_some()
        {
            (HotkeyEvent::Cancel, None, Suppression::Cancel)
        } else if self.held.is_none() {
            if !active && self.rewrite.iter().find(matches).is_some() {
                (
                    HotkeyEvent::Rewrite(at),
                    self.rewrite.iter().find(matches).copied(),
                    Suppression::Trigger,
                )
            } else if let Some(binding) = self.hold.iter().find(matches).copied() {
                self.held = Some(binding);
                (
                    HotkeyEvent::HoldDown(at),
                    Some(binding),
                    Suppression::Trigger,
                )
            } else if let Some(binding) = self.toggle.iter().find(matches).copied() {
                (HotkeyEvent::Toggle(at), Some(binding), Suppression::Trigger)
            } else {
                return (None, suppress);
            }
        } else {
            return (None, suppress);
        };
        self.suppressed[slot] = suppression;
        if binding.is_some_and(|binding| binding.modifiers & WIN != 0) {
            // Keep Win releases suppressed even when another key ends the chord first.
            for vk in [0x5B, 0x5C] {
                if self.pressed[vk] {
                    self.suppressed[vk] = Suppression::Trigger;
                }
            }
        }
        (Some(event), true)
    }
}

/// Owns the hook thread. Dropping the handle stops and joins it.
pub struct HotkeyHandle {
    #[cfg(windows)]
    thread_id: u32,
    #[cfg(windows)]
    thread: Option<std::thread::JoinHandle<()>>,
}

impl HotkeyHandle {
    pub fn stop(self) {
        drop(self);
    }
}

impl Drop for HotkeyHandle {
    fn drop(&mut self) {
        #[cfg(windows)]
        if let Some(thread) = self.thread.take() {
            // The thread creates its message queue before reporting readiness.
            unsafe {
                windows_sys::Win32::UI::WindowsAndMessaging::PostThreadMessageW(
                    self.thread_id,
                    windows_sys::Win32::UI::WindowsAndMessaging::WM_QUIT,
                    0,
                    0,
                );
            }
            let _ = thread.join();
        }
    }
}

#[cfg(not(windows))]
pub fn spawn(
    _: &Bindings,
    _: Arc<AtomicBool>,
    _: bool,
    _: Sender<HotkeyEvent>,
) -> Result<HotkeyHandle, String> {
    Err("hotkeys: unsupported platform".into())
}

#[cfg(windows)]
pub use platform::spawn;

#[cfg(windows)]
mod platform {
    use super::*;
    use std::{
        cell::RefCell,
        ptr::null_mut,
        sync::{atomic::Ordering, mpsc},
    };
    use windows_sys::Win32::{
        Foundation::{LPARAM, LRESULT, WPARAM},
        System::{LibraryLoader::GetModuleHandleW, Threading::GetCurrentThreadId},
        UI::WindowsAndMessaging::*,
    };

    struct HookState {
        matcher: Matcher,
        active: Arc<AtomicBool>,
        tx: Sender<HotkeyEvent>,
    }

    thread_local! {
        static STATE: RefCell<Option<HookState>> = const { RefCell::new(None) };
    }

    fn dispatch(input: Input, down: bool, injected: bool, at: Instant) -> bool {
        STATE.with(|cell| {
            let mut state = cell.borrow_mut();
            let Some(state) = state.as_mut() else {
                return false;
            };
            if down && input.modifier() == 0 {
                // GetAsyncKeyState here reflects the state before this event, which is
                // correct for modifiers other than the current input.
                state.matcher.resync_modifiers(|vk| {
                    (unsafe {
                        windows_sys::Win32::UI::Input::KeyboardAndMouse::GetAsyncKeyState(
                            i32::from(vk),
                        )
                    } as u16
                        & 0x8000)
                        != 0
                });
            }
            let (event, suppress) = state.matcher.feed(
                input,
                down,
                injected,
                at,
                state.active.load(Ordering::Relaxed),
            );
            if let Some(event) = event {
                // Standard unbounded send does not wait for the receiver.
                let _ = state.tx.send(event);
            }
            suppress
        })
    }

    unsafe extern "system" fn keyboard(code: i32, message: WPARAM, data: LPARAM) -> LRESULT {
        let at = Instant::now();
        if code >= 0
            && matches!(
                message as u32,
                WM_KEYDOWN | WM_SYSKEYDOWN | WM_KEYUP | WM_SYSKEYUP
            )
        {
            // Windows supplies this structure for the duration of the callback.
            let event = unsafe { &*(data as *const KBDLLHOOKSTRUCT) };
            if dispatch(
                Input::Key(event.vkCode as u16),
                matches!(message as u32, WM_KEYDOWN | WM_SYSKEYDOWN),
                event.flags & LLKHF_INJECTED != 0,
                at,
            ) {
                return 1;
            }
        }
        unsafe { CallNextHookEx(null_mut(), code, message, data) }
    }

    unsafe extern "system" fn mouse(code: i32, message: WPARAM, data: LPARAM) -> LRESULT {
        let at = Instant::now();
        if code >= 0
            && matches!(
                message as u32,
                WM_XBUTTONDOWN | WM_XBUTTONUP | WM_MBUTTONDOWN | WM_MBUTTONUP
            )
        {
            let event = unsafe { &*(data as *const MSLLHOOKSTRUCT) };
            let button = match message as u32 {
                WM_MBUTTONDOWN | WM_MBUTTONUP => Some(MouseButton::Middle),
                _ => match event.mouseData >> 16 {
                    1 => Some(MouseButton::Mouse4),
                    2 => Some(MouseButton::Mouse5),
                    _ => None,
                },
            };
            if let Some(button) = button {
                if dispatch(
                    Input::Mouse(button),
                    matches!(message as u32, WM_XBUTTONDOWN | WM_MBUTTONDOWN),
                    event.flags & LLMHF_INJECTED != 0,
                    at,
                ) {
                    return 1;
                }
            }
        }
        unsafe { CallNextHookEx(null_mut(), code, message, data) }
    }

    pub fn spawn(
        bindings: &Bindings,
        active: Arc<AtomicBool>,
        accept_injected: bool,
        tx: Sender<HotkeyEvent>,
    ) -> Result<HotkeyHandle, String> {
        let matcher = Matcher::new(bindings, accept_injected)?;
        let (ready_tx, ready_rx) = mpsc::channel();
        let thread = std::thread::Builder::new()
            .name("scribe-hotkeys".into())
            .spawn(move || {
                STATE.with(|state| {
                    *state.borrow_mut() = Some(HookState {
                        matcher,
                        active,
                        tx,
                    })
                });
                // Both hooks and their state belong to this message-pump thread.
                unsafe {
                    let mut message = MSG::default();
                    PeekMessageW(&mut message, null_mut(), 0, 0, PM_NOREMOVE);
                    let module = GetModuleHandleW(std::ptr::null());
                    let keyboard_hook =
                        SetWindowsHookExW(WH_KEYBOARD_LL, Some(keyboard), module, 0);
                    if keyboard_hook.is_null() {
                        let _ = ready_tx.send(Err(format!(
                            "hotkeys: keyboard hook: {}",
                            std::io::Error::last_os_error()
                        )));
                    } else {
                        let mouse_hook = SetWindowsHookExW(WH_MOUSE_LL, Some(mouse), module, 0);
                        if mouse_hook.is_null() {
                            let error = std::io::Error::last_os_error();
                            UnhookWindowsHookEx(keyboard_hook);
                            let _ = ready_tx.send(Err(format!("hotkeys: mouse hook: {error}")));
                        } else {
                            if ready_tx.send(Ok(GetCurrentThreadId())).is_ok() {
                                while GetMessageW(&mut message, null_mut(), 0, 0) > 0 {
                                    TranslateMessage(&message);
                                    DispatchMessageW(&message);
                                }
                            }
                            UnhookWindowsHookEx(mouse_hook);
                            UnhookWindowsHookEx(keyboard_hook);
                        }
                    }
                }
                STATE.with(|state| *state.borrow_mut() = None);
            })
            .map_err(|error| format!("hotkeys: thread: {error}"))?;
        match ready_rx.recv() {
            Ok(Ok(thread_id)) => Ok(HotkeyHandle {
                thread_id,
                thread: Some(thread),
            }),
            result => {
                let _ = thread.join();
                Err(match result {
                    Ok(Err(error)) => error,
                    _ => "hotkeys: hook thread exited before startup".into(),
                })
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_python_bindings() {
        for text in [
            "Ctrl + Shift + T",
            "ctrl+shift+space",
            "Ctrl + Win",
            "Mouse4",
            "Mouse5",
            "Middle",
            "Escape",
            "F8",
            "a",
            "9",
            "Enter",
            "Tab",
        ] {
            assert!(parse_binding(text).unwrap().is_some(), "{text}");
        }
        for text in ["", "None", "Disabled"] {
            assert!(parse_binding(text).unwrap().is_none());
        }
        assert!(parse_binding("Ctrl + BadKey")
            .unwrap_err()
            .contains("BadKey"));
        assert_eq!(parse_binding("Ctrl+Win"), parse_binding("control+super"));
        assert_eq!(parse_binding("Ctrl+Win"), parse_binding("CTRL+Meta"));
        for text in ["Ctrl++T", "T+Space", "F25", "F0", "Left Ctrl"] {
            assert!(parse_binding(text).is_err(), "{text}");
        }
    }

    fn matcher(hold: &[&str], toggle: &[&str]) -> Matcher {
        Matcher::new(
            &Bindings {
                hold: hold.iter().map(|s| (*s).into()).collect(),
                toggle: toggle.iter().map(|s| (*s).into()).collect(),
                cancel: vec!["Escape".into()],
                rewrite: vec![],
            },
            false,
        )
        .unwrap()
    }

    fn key(m: &mut Matcher, vk: u16, down: bool, at: Instant) -> (Option<HotkeyEvent>, bool) {
        m.feed(Input::Key(vk), down, false, at, false)
    }

    #[test]
    fn rewrite_fires_once_only_when_inactive_and_suppresses_trigger() {
        let mut m = Matcher::new(&Bindings::default(), false).unwrap();
        let at = Instant::now();
        key(&mut m, 0x11, true, at);
        key(&mut m, 0x10, true, at);
        assert_eq!(
            key(&mut m, 0x41, true, at),
            (Some(HotkeyEvent::Rewrite(at)), true)
        );
        assert_eq!(key(&mut m, 0x41, true, at), (None, true));
        assert_eq!(key(&mut m, 0x41, false, at), (None, true));
        assert_eq!(
            m.feed(Input::Key(0x41), true, false, at, true),
            (None, false)
        );
    }

    #[test]
    fn hold_repeats_and_release_order() {
        for released in [0xA2, 0xA0, 0x54] {
            let mut m = matcher(&["Ctrl+Shift+T"], &[]);
            let at = Instant::now();
            assert_eq!(key(&mut m, 0xA2, true, at), (None, false));
            assert_eq!(key(&mut m, 0xA0, true, at), (None, false));
            assert_eq!(
                key(&mut m, 0x54, true, at),
                (Some(HotkeyEvent::HoldDown(at)), true)
            );
            assert_eq!(key(&mut m, 0x54, true, at), (None, true));
            assert_eq!(
                key(&mut m, released, false, at),
                (Some(HotkeyEvent::HoldUp(at)), released == 0x54)
            );
            if released != 0x54 {
                assert_eq!(key(&mut m, 0x54, true, at), (None, true));
                assert_eq!(key(&mut m, 0x54, false, at), (None, true));
            }
        }
    }

    #[test]
    fn modifier_only_chord_suppresses_win_in_both_orders() {
        for (first, last) in [(0xA2, 0x5B), (0x5C, 0xA3)] {
            for released in [first, last] {
                let mut m = matcher(&["Ctrl+Win"], &[]);
                let at = Instant::now();
                assert_eq!(key(&mut m, first, true, at), (None, false));
                assert_eq!(
                    key(&mut m, last, true, at),
                    (Some(HotkeyEvent::HoldDown(at)), true)
                );
                assert_eq!(key(&mut m, last, true, at), (None, true));
                assert_eq!(
                    key(&mut m, released, false, at),
                    (
                        Some(HotkeyEvent::HoldUp(at)),
                        released == last || released == 0x5C
                    )
                );
                let other = if released == first { last } else { first };
                assert_eq!(
                    key(&mut m, other, false, at),
                    (None, other == last || other == 0x5B || other == 0x5C)
                );
            }
        }
    }

    #[test]
    fn exact_modifiers_and_both_sides_are_tracked() {
        let at = Instant::now();
        let mut m = matcher(&[], &["Ctrl+Shift+T"]);
        for vk in [0xA2, 0xA3, 0xA1, 0xA4] {
            key(&mut m, vk, true, at);
        }
        assert_eq!(key(&mut m, 0x54, true, at), (None, false));
        key(&mut m, 0x54, false, at);
        key(&mut m, 0xA4, false, at);
        key(&mut m, 0xA2, false, at);
        assert_eq!(
            key(&mut m, 0x54, true, at),
            (Some(HotkeyEvent::Toggle(at)), true)
        );
        assert_eq!(key(&mut m, 0x54, true, at), (None, true));
        key(&mut m, 0xA3, false, at);
        assert_eq!(key(&mut m, 0x54, false, at), (None, true));
        assert_eq!(key(&mut m, 0x54, true, at), (None, false));
    }

    #[test]
    fn mouse_hold_and_toggle_consume_both_transitions() {
        let at = Instant::now();
        for (name, button) in [
            ("Mouse4", MouseButton::Mouse4),
            ("Mouse5", MouseButton::Mouse5),
            ("Middle", MouseButton::Middle),
        ] {
            for hold in [true, false] {
                let mut m = if hold {
                    matcher(&[name], &[])
                } else {
                    matcher(&[], &[name])
                };
                let input = Input::Mouse(button);
                assert_eq!(
                    m.feed(input, true, false, at, false),
                    (
                        Some(if hold {
                            HotkeyEvent::HoldDown(at)
                        } else {
                            HotkeyEvent::Toggle(at)
                        }),
                        true
                    )
                );
                assert_eq!(m.feed(input, true, false, at, false), (None, true));
                assert_eq!(
                    m.feed(input, false, false, at, false),
                    (
                        if hold {
                            Some(HotkeyEvent::HoldUp(at))
                        } else {
                            None
                        },
                        true
                    )
                );
                assert!(m.feed(input, true, false, at, false).0.is_some());
            }
        }
    }

    #[test]
    fn escape_passes_through_when_idle_including_repeats_and_releases() {
        let mut m = matcher(&[], &[]);
        let at = Instant::now();
        let escape = Input::Key(0x1B);
        for down in [true, true, false] {
            assert_eq!(m.feed(escape, down, false, at, false), (None, false));
        }
        assert_eq!(
            m.feed(escape, true, false, at, true),
            (Some(HotkeyEvent::Cancel), true)
        );
        assert_eq!(m.feed(escape, true, false, at, true), (None, true));
        assert_eq!(m.feed(escape, false, false, at, false), (None, false));
        assert_eq!(m.feed(escape, true, false, at, false), (None, false));
    }

    #[test]
    fn injected_events_do_not_change_state_or_consume_input() {
        let at = Instant::now();
        let mut m = matcher(&["Ctrl+T"], &["Mouse5"]);
        assert_eq!(
            m.feed(Input::Key(0xA2), true, true, at, false),
            (None, false)
        );
        assert_eq!(key(&mut m, 0x54, true, at), (None, false));
        key(&mut m, 0x54, false, at);
        key(&mut m, 0xA2, true, at);
        assert_eq!(
            key(&mut m, 0x54, true, at),
            (Some(HotkeyEvent::HoldDown(at)), true)
        );
        assert_eq!(
            m.feed(Input::Key(0x54), false, true, at, false),
            (None, false)
        );
        assert_eq!(
            key(&mut m, 0x54, false, at),
            (Some(HotkeyEvent::HoldUp(at)), true)
        );
        assert_eq!(
            m.feed(Input::Mouse(MouseButton::Mouse5), true, true, at, false),
            (None, false)
        );
        key(&mut m, 0xA2, false, at);
        assert_eq!(
            m.feed(Input::Mouse(MouseButton::Mouse5), true, false, at, false),
            (Some(HotkeyEvent::Toggle(at)), true)
        );
    }

    #[test]
    fn injected_input_can_be_enabled() {
        let mut m = matcher(&[], &["F8"]);
        m.accept_injected = true;
        let at = Instant::now();
        assert_eq!(
            m.feed(Input::Key(0x77), true, true, at, false),
            (Some(HotkeyEvent::Toggle(at)), true)
        );
        assert_eq!(
            m.feed(Input::Key(0x77), false, true, at, false),
            (None, true)
        );
    }

    #[test]
    fn resync_clears_a_modifier_lost_on_the_secure_desktop() {
        let mut m = matcher(&["Ctrl + Shift + T"], &[]);
        let at = Instant::now();
        key(&mut m, 0x5B, true, at); // Win down, then Win+L: the Win up never arrives.
        key(&mut m, 0xA2, true, at);
        key(&mut m, 0xA0, true, at);
        assert_eq!(
            key(&mut m, 0x54, true, at).0,
            None,
            "stale Win blocks the chord"
        );
        key(&mut m, 0x54, false, at);
        m.resync_modifiers(|vk| matches!(vk, 0xA2 | 0xA0 | 0x11 | 0x10));
        assert!(matches!(
            key(&mut m, 0x54, true, at).0,
            Some(HotkeyEvent::HoldDown(_))
        ));
    }

    #[test]
    fn resync_keeps_a_modifier_this_matcher_suppressed() {
        let mut m = matcher(&["Ctrl + Win"], &[]);
        let at = Instant::now();
        key(&mut m, 0xA2, true, at);
        assert!(matches!(
            key(&mut m, 0x5B, true, at).0,
            Some(HotkeyEvent::HoldDown(_))
        ));
        // The OS never saw Win down because it was suppressed.
        m.resync_modifiers(|vk| matches!(vk, 0xA2 | 0x11));
        let (event, suppress) = key(&mut m, 0x5B, false, at);
        assert!(matches!(event, Some(HotkeyEvent::HoldUp(_))));
        assert!(
            suppress,
            "Win up must stay suppressed so Start does not open"
        );
    }

    #[test]
    fn invalid_bindings_fail_before_hooks_start() {
        assert!(Matcher::new(
            &Bindings {
                hold: vec!["BadKey".into()],
                toggle: vec![],
                cancel: vec![],
                rewrite: vec![],
            },
            false
        )
        .is_err());
    }

    #[cfg(windows)]
    #[test]
    #[ignore = "requires an interactive Windows desktop; sends Ctrl+Alt+F9"]
    fn send_input_toggle_latency() {
        use std::{mem::size_of, sync::mpsc, time::Duration};
        use windows_sys::Win32::UI::Input::KeyboardAndMouse::*;
        let (tx, rx) = mpsc::channel();
        let handle = spawn(
            &Bindings {
                hold: vec![],
                toggle: vec!["Ctrl+Alt+F9".into()],
                cancel: vec![],
                rewrite: vec![],
            },
            Arc::new(AtomicBool::new(false)),
            true,
            tx,
        )
        .unwrap();
        let inputs = [
            (VK_LCONTROL, false),
            (VK_LMENU, false),
            (VK_F9, false),
            (VK_F9, true),
            (VK_LMENU, true),
            (VK_LCONTROL, true),
        ]
        .map(|(vk, up)| INPUT {
            r#type: INPUT_KEYBOARD,
            Anonymous: INPUT_0 {
                ki: KEYBDINPUT {
                    wVk: vk,
                    dwFlags: if up { KEYEVENTF_KEYUP } else { 0 },
                    ..Default::default()
                },
            },
        });
        let start = Instant::now();
        // All releases are sent before assertions, including on a timeout.
        let sent = unsafe {
            SendInput(
                inputs.len() as u32,
                inputs.as_ptr(),
                size_of::<INPUT>() as i32,
            )
        };
        let result = rx.recv_timeout(Duration::from_millis(500));
        let elapsed = start.elapsed();
        handle.stop();
        assert_eq!(sent, inputs.len() as u32);
        assert!(matches!(result, Ok(HotkeyEvent::Toggle(_))), "{result:?}");
        assert!(elapsed < Duration::from_millis(500), "{elapsed:?}");
        eprintln!(
            "SendInput-to-event receipt: {:.3} ms",
            elapsed.as_secs_f64() * 1000.0
        );
    }
}
