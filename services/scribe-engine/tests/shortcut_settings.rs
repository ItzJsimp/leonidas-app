use scribe_engine::{
    config::Config,
    hotkeys::{HotkeyEvent, Input, Matcher, MouseButton},
    settings::Settings,
};
use serde_json::json;
use std::time::Instant;

#[test]
fn removed_shortcut_stays_removed_after_reload() {
    let path = std::env::temp_dir().join(format!("scribe-shortcut-{}.json", std::process::id()));
    let settings = Settings::new(path.clone(), Config::default());
    let values = json!({"toggle": ["Mouse5"]});
    let reply = settings
        .patch("hotkeys", values.as_object().unwrap(), false)
        .unwrap();
    assert_eq!(reply.values["toggle"], json!(["Mouse5"]));
    let config = Config::load(&path).unwrap();
    std::fs::remove_file(path).unwrap();
    assert_eq!(config.bindings.toggle, vec!["Mouse5"]);

    let mut matcher = Matcher::new(&config.bindings, false).unwrap();
    let now = Instant::now();
    for key in [0x11, 0x10, 0x20] {
        assert_eq!(
            matcher.feed(Input::Key(key), true, false, now, false).0,
            None
        );
    }
    for key in [0x20, 0x10, 0x11] {
        matcher.feed(Input::Key(key), false, false, now, false);
    }
    assert_eq!(
        matcher
            .feed(Input::Mouse(MouseButton::Mouse5), true, false, now, false)
            .0,
        Some(HotkeyEvent::Toggle(now))
    );
}
