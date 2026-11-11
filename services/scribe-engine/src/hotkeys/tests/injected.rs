use super::*;

#[cfg(windows)]
#[test]
fn ignores_only_scribes_own_injected_keys() {
    assert!(is_scribe_input(true, SCRIBE_INPUT_TAG));
    assert!(!is_scribe_input(true, 0));
    assert!(!is_scribe_input(false, SCRIBE_INPUT_TAG));
}
#[test]
fn rewrite_accepts_remote_injected_shortcut() {
    let mut m = Matcher::new(&Bindings::default(), ACCEPT_INJECTED_INPUT).unwrap();
    let at = Instant::now();
    m.feed(Input::Key(0x11), true, true, at, false);
    m.feed(Input::Key(0x10), true, true, at, false);
    assert_eq!(
        m.feed(Input::Key(0x41), true, true, at, false),
        (Some(HotkeyEvent::Rewrite(at)), true)
    );
    assert_eq!(
        m.feed(Input::Key(0x41), false, true, at, false),
        (None, true)
    );
    m.feed(Input::Key(0x10), false, true, at, false);
    m.feed(Input::Key(0x11), false, true, at, false);
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
