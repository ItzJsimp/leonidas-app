# Scribe Windows bundling plan

Date: 2026-11-14. Card: `audit-scribe-bundling-on-windows` (AIOS `tasks/`). Engine direction: ADR-0074 (Rust engine, Python leaves the product).

This plan reads files only. No installer was built and no Scribe process was started. Each number is marked **measured** (read from a file on this machine) or **estimated** (not on disk).

## Decisions

1. **Ship one file: `scribe-engine.exe`.** It holds the hotkey hook, microphone and loopback capture, paste and the pill HUD. The build already copies it to `resources/scribe-engine` (`scripts/build-desktop-artifact.ts:2518`, `:2573`). The build fails if it is missing (`:3609`). `installer.nsh` registers it at login.
2. **Ship no capture executables.** Capture uses WASAPI inside the engine (`wasapi` in `services/scribe-engine/Cargo.toml`, `src/meetings/capture.rs`, `src/meetings/loopback.rs`). The only other binary, `scribe-bench.exe`, stays out of the installer.
3. **Ship no Python runtime.** ADR-0074 removes it. The Python size is 0 MB.
4. **Download the offline model on first use.** `ggml-base.en-q5_1.bin` downloads with a pinned SHA-256 (`src/local_stt.rs:15-18`). Groq stays the default, so most users never download it.
5. **Do not ship user data.** `%APPDATA%\Leonidas\scribe-engine\meetings` is 885 MB on this machine. It is the largest Scribe item and it grows with use. Plan a retention setting (open item).

## Sizes

| Item                                                | Size        | Label     | Source path                                                                                                |
| --------------------------------------------------- | ----------- | --------- | ---------------------------------------------------------------------------------------------------------- |
| Scribe engine (installed)                           | 7.7 MB      | measured  | `%LOCALAPPDATA%\Programs\t3code\resources\scribe-engine\scribe-engine.exe`                                 |
| Scribe engine (local release build, older)          | 6.6 MB      | measured  | `services/scribe-engine/target/release/scribe-engine.exe`                                                  |
| Capture executables                                 | 0 MB        | measured  | none: no `Command::new` of a capture tool in `services/scribe-engine/src` (only `src/bin/scribe-bench.rs`) |
| Models (offline whisper, later download)            | about 60 MB | estimated | `src/local_stt.rs:326` says "about 60 MB". No model file exists on disk.                                   |
| Installer overhead (uninstaller and elevate helper) | 0.4 MB      | measured  | `%LOCALAPPDATA%\Programs\t3code\Uninstall Leonidas Code.exe` (295 KB), `resources\elevate.exe` (105 KB)    |
| Whole installer                                     | 170.4 MB    | measured  | `%LOCALAPPDATA%\t3code-updater\installer.exe`                                                              |
| Whole installed app                                 | 568 MB      | measured  | `%LOCALAPPDATA%\Programs\t3code`                                                                           |
| Engine share of installer                           | about 3 MB  | estimated | 7.7 MB scaled by the installer to install ratio, 170.4 / 568 = 0.30 (measured)                             |
| Scribe user data (meetings)                         | 885 MB      | measured  | `%APPDATA%\Leonidas\scribe-engine\meetings`                                                                |

Gap: `apps/desktop/prod-resources` does not exist here, so the staged payload could not be measured. The installed copy stands in for it.

## Hotkeys

Defaults on Windows. Scribe binds through a low-level hook. The hook always eats a trigger chord (`services/scribe-engine/src/hotkeys.rs:205`). It eats Escape only while recording (`:206`).

| Owner                             | Default                          | File:line                                                                                                     |
| --------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Scribe hold                       | Ctrl+Shift+T                     | `services/scribe-engine/src/config.rs:74`                                                                     |
| Scribe toggle                     | Mouse5, Ctrl+Shift+Space         | `config.rs:75`                                                                                                |
| Scribe cancel                     | Escape                           | `config.rs:76`                                                                                                |
| Scribe rewrite                    | Ctrl+Shift+A                     | `config.rs:77`                                                                                                |
| App dictation toggle, hold, mouse | Ctrl+Win+Space, Ctrl+Win, Mouse4 | `packages/shared/src/dictationTrigger.ts:67`                                                                  |
| App hidden Discord key            | F24                              | `docs/internals/discord-mute-dictation.md`                                                                    |
| App global capture                | Ctrl+Shift+Space                 | `apps/desktop/src/capture/DesktopCaptureHotkey.ts:5` (registered at `apps/desktop/src/app/DesktopApp.ts:208`) |
| App snapshot                      | both Shift keys                  | `packages/contracts/src/settings.ts:283-285`                                                                  |
| App window: reopen closed         | Ctrl+Shift+T                     | `packages/shared/src/keybindings.ts:160`                                                                      |
| App window: capture open          | Ctrl+Shift+I                     | `keybindings.ts:170`                                                                                          |
| App window: composer mode         | Ctrl+Shift+A                     | `keybindings.ts:215`                                                                                          |

### Collisions

| Pair                                                            | Effect                                                                                                 | Evidence                                    |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------- |
| Scribe toggle Ctrl+Shift+Space and app capture Ctrl+Shift+Space | Hard. The hook eats the chord, so the app capture hotkey may never fire. Which one wins is not tested. | `config.rs:75`, `DesktopCaptureHotkey.ts:5` |
| Scribe hold Ctrl+Shift+T and app reopen closed Ctrl+Shift+T     | Hard. Scribe starts recording and the app shortcut never fires while Scribe runs.                      | `config.rs:74`, `keybindings.ts:160`        |
| Scribe rewrite Ctrl+Shift+A and app composer mode Ctrl+Shift+A  | Hard. Same cause.                                                                                      | `config.rs:77`, `keybindings.ts:215`        |
| Scribe engine and app dictation (two owners of dictation)       | No key matches today. If a user sets both to Ctrl+Win, both start.                                     | `config.rs:74-77`, `dictationTrigger.ts:67` |

No collision: Mouse4 against Mouse5, F24 against any Scribe key, and Both Shift against any Scribe chord (a chord needs one Shift key).

Evidence the first collision is real: the live Scribe config on this machine lists only Mouse5 for toggle, so Ctrl+Shift+Space was removed (`%APPDATA%\Leonidas\scribe-engine\config.json`).

Files searched: `services/scribe-engine/src/{config,hotkeys}.rs`, `packages/shared/src/{keybindings,dictationTrigger}.ts`, `packages/contracts/src/settings.ts`, `apps/desktop/src/{capture,dictationHotkey,snapShot}`. Menu accelerators in `apps/desktop/src/window/DesktopApplicationMenu.ts` use Ctrl+, R, Shift+R and Shift+V. None match a Scribe chord.

## Open decisions for Jake

- **Who owns dictation?** The engine (ADR-0074) or the app hook (`apps/desktop/src/dictationHotkey`). Keep one. Recommended: the engine, because it works with the window closed.
- **New Scribe defaults.** Recommended: drop Ctrl+Shift+Space from toggle, and move hold and rewrite to chords the app does not use. Change `config.rs:74-77` and the Settings test at `config.rs:256-261`.
- **Meetings retention.** 885 MB of audio grows without a limit.

## Checks run

- Thread check: `leo_thread_list` (includeSubagents, unsettled). Threads `aba95ad6` (reconnection) and `5d981f8a` (Agents tab) are completed and do not touch Scribe packaging or `build-desktop-artifact.ts`. `493a0bd6` runs a SimplyGersi report. No plan change needed.
- Dirty files: none under Scribe or the desktop build script in `git status`.
