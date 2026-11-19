# Scribe Windows bundling plan

Date: 2026-11-19 (updated from 2026-11-14). Card: `audit-scribe-bundling-on-windows` (archived in AIOS `archive/completed-tasks/2026/`). Engine direction: ADR-0074 (Rust engine, Python leaves the product).

This plan reads repository files and on-disk build artifacts only. No installer was built, no package was installed, and no Scribe process was started. Each number is marked **measured** (read from a file on this machine) or **estimated** (derived or not on disk).

## Decisions

1. **Ship one executable: `scribe-engine.exe`.** It runs the global hotkey hook, microphone and loopback capture, paste, and the floating pill HUD. The build copies it once into `resources/scribe-engine` (`scripts/build-desktop-artifact.ts:1115-1120`, `:2573`), excludes staging duplicates (`:1028-1031`), and fails if it is missing (`:3609-3616`). `apps/desktop/resources/installer.nsh` stops running instances on install or uninstall (`:10`, `:35`), registers it at login (`:30`), and starts it (`:31`).
2. **Ship no capture executables.** Audio capture uses `wasapi` inside the engine (`services/scribe-engine/Cargo.toml:25`, `src/meetings/capture.rs`, `src/meetings/loopback.rs`). The only other binary, `scribe-bench.exe` (`src/bin/scribe-bench.rs:116`), stays out of the installer.
3. **Ship no Python runtime.** ADR-0074 removes Python from the shipped product (0 MB).
4. **Link the Visual C++ CRT statically before release.** Live thread `0281c7a6` found that `scribe-engine.exe` fails on clean Windows with `MSVCP140.dll was not found` because `services/scribe-engine/.cargo/config.toml:9-10` passes `-MD`. Switching to static CRT (`-MT`) removes the runtime dependency (tracked in AIOS `ship-scribe-engine-and-resource-monitor-without-the-visual-c-runtime-dlls`).
5. **Download the offline model on first use.** `ggml-base.en-q5_1.bin` downloads on demand with a pinned SHA-256 (`services/scribe-engine/src/local_stt.rs:15-18`). Cloud STT stays the default, so most users do not download it.
6. **Do not ship user data.** `%APPDATA%\Leonidas\scribe-engine\meetings` holds 878.24 MB on this machine and grows with use. Plan a retention setting as an open follow-up.

## Sizes

The table below lists each Scribe component, installer overhead, and reference app totals measured on 2026-11-19.

| Item                                                | Size                      | Label     | Source path                                                                                                                                                       |
| --------------------------------------------------- | ------------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scribe engine (installed)                           | 7.73 MB (8,107,520 B)     | measured  | `%LOCALAPPDATA%\Programs\t3code\resources\scribe-engine\scribe-engine.exe`                                                                                        |
| Scribe engine (local release build, 2026-10-27)     | 6.62 MB (6,946,304 B)     | measured  | `services/scribe-engine/target/release/scribe-engine.exe`                                                                                                         |
| Capture executables                                 | 0 MB                      | measured  | None bundled: `wasapi` in `services/scribe-engine/Cargo.toml:25` (only `src/bin/scribe-bench.rs:116` and test `src/meetings/loopback.rs:506` call `Command::new`) |
| Models (offline whisper, downloaded later)          | about 60 MB               | estimated | `services/scribe-engine/src/local_stt.rs:15-18`, `:326` ("about 60 MB"). No file exists under `%APPDATA%\Leonidas\scribe-engine\models`.                          |
| Installer overhead (uninstaller and elevate helper) | 0.39 MB (409,832 B)       | measured  | `%LOCALAPPDATA%\Programs\t3code\Uninstall Leonidas Code.exe` (302,312 B) and `resources\elevate.exe` (107,520 B)                                                  |
| Whole installer                                     | 171.15 MB (179,462,832 B) | measured  | `%LOCALAPPDATA%\t3code-updater\installer.exe`                                                                                                                     |
| Whole installed app                                 | 569.11 MB (596,756,121 B) | measured  | `%LOCALAPPDATA%\Programs\t3code`                                                                                                                                  |
| Engine share of installer                           | about 2.32 MB             | estimated | 7.73 MB scaled by installer-to-installed ratio `171.15 / 569.11 = 0.3007` (`measured`)                                                                            |
| Scribe user data (meetings, not shipped)            | 878.24 MB (920,904,165 B) | measured  | `%APPDATA%\Leonidas\scribe-engine\meetings`                                                                                                                       |

Gap: `apps/desktop/prod-resources` does not exist on disk here, so the staged payload could not be measured directly. The installed executable stands in for it.

## Hotkeys

On Windows, Scribe registers a low-level hook that suppresses matched trigger chords (`services/scribe-engine/src/hotkeys.rs:203-263`) and suppresses `Escape` only while dictation is active (`:206`, `:229-230`). The table below lists every default hotkey registered by Scribe and the app.

| Owner                               | Default                                | File and line                                                                                                 |
| ----------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Scribe hold                         | `Ctrl+Shift+T`                         | `services/scribe-engine/src/config.rs:74`                                                                     |
| Scribe toggle                       | `Mouse5`, `Ctrl+Shift+Space`           | `services/scribe-engine/src/config.rs:75`                                                                     |
| Scribe cancel                       | `Escape`                               | `services/scribe-engine/src/config.rs:76`                                                                     |
| Scribe rewrite                      | `Ctrl+Shift+A`                         | `services/scribe-engine/src/config.rs:77`                                                                     |
| App dictation toggle, hold, mouse   | `Ctrl+Win+Space`, `Ctrl+Win`, `Mouse4` | `packages/shared/src/dictationTrigger.ts:67`                                                                  |
| App hidden Discord Push to Mute key | `F24`                                  | `packages/shared/src/dictationTrigger.ts:24`, `docs/internals/discord-mute-dictation.md:10`                   |
| App global capture                  | `Ctrl+Shift+Space`                     | `apps/desktop/src/capture/DesktopCaptureHotkey.ts:5` (registered at `apps/desktop/src/app/DesktopApp.ts:208`) |
| App snapshot                        | both `Shift` keys                      | `packages/contracts/src/settings.ts:283-285`                                                                  |
| App window: reopen closed           | `Ctrl+Shift+T` (`mod+shift+t`)         | `packages/shared/src/keybindings.ts:160`                                                                      |
| App window: capture open            | `Ctrl+Shift+I` (`mod+shift+i`)         | `packages/shared/src/keybindings.ts:170`                                                                      |
| App window: composer mode           | `Ctrl+Shift+A` (`mod+shift+a`)         | `packages/shared/src/keybindings.ts:215`                                                                      |

### Collisions

Three Scribe default chords collide directly with app defaults, and two dictation systems share responsibility until one owner is chosen.

| Pair                                                                    | Effect                                                                                                                                                        | Evidence                                                                                        |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Scribe toggle (`Ctrl+Shift+Space`) vs. app capture (`Ctrl+Shift+Space`) | Hard collision. The Scribe hook eats the chord (`hotkeys.rs:247-254`), preventing the app capture shortcut from firing. Precedence between hooks is untested. | `services/scribe-engine/src/config.rs:75`, `apps/desktop/src/capture/DesktopCaptureHotkey.ts:5` |
| Scribe hold (`Ctrl+Shift+T`) vs. app reopen closed (`Ctrl+Shift+T`)     | Hard collision. Scribe starts recording and eats the chord while running, so reopen-closed never fires.                                                       | `services/scribe-engine/src/config.rs:74`, `packages/shared/src/keybindings.ts:160`             |
| Scribe rewrite (`Ctrl+Shift+A`) vs. app composer mode (`Ctrl+Shift+A`)  | Hard collision. Scribe eats the chord while running, so composer mode never fires.                                                                            | `services/scribe-engine/src/config.rs:77`, `packages/shared/src/keybindings.ts:215`             |
| Scribe engine vs. app dictation (`apps/desktop/src/dictationHotkey`)    | Dual-owner risk. No default chord overlaps today, but binding both to `Ctrl+Win` starts both engines.                                                         | `services/scribe-engine/src/config.rs:74-77`, `packages/shared/src/dictationTrigger.ts:67`      |

No collision exists between `Mouse4` and `Mouse5`, between `F24` and any Scribe binding, or between both `Shift` keys and any Scribe chord. On this machine, `%APPDATA%\Leonidas\scribe-engine\config.json` already overrides `toggle` to `["Mouse5"]` only, removing `Ctrl+Shift+Space`.

Files searched: `services/scribe-engine/src/config.rs`, `services/scribe-engine/src/hotkeys.rs`, `packages/shared/src/keybindings.ts`, `packages/shared/src/dictationTrigger.ts`, `packages/contracts/src/settings.ts`, `apps/desktop/src/capture`, `apps/desktop/src/dictationHotkey`, `apps/desktop/src/snapShot`, and `apps/desktop/src/window/DesktopApplicationMenu.ts`. Menu accelerators (`:178-293`) use `CmdOrCtrl+,`, `CmdOrCtrl+Shift+V`, `CmdOrCtrl+R`, `Shift+CmdOrCtrl+R`, `Ctrl+Shift+I`, and zoom chords, none of which collide with Scribe.

## Open decisions

- **Dictation owner:** Keep one dictation owner (recommended: Rust `scribe-engine`, per ADR-0074, because it runs with the window closed) and retire `apps/desktop/src/dictationHotkey`.
- **Default Scribe chords:** Update `Bindings::default()` (`services/scribe-engine/src/config.rs:71-80`) and its test (`:254-262`) to drop `Ctrl+Shift+Space`, `Ctrl+Shift+T`, and `Ctrl+Shift+A` (tracked in AIOS `change-the-scribe-default-hotkeys-to-avoid-app-collisions`).
- **Meetings retention:** Add a retention limit for `%APPDATA%\Leonidas\scribe-engine\meetings` (currently 878.24 MB).

## Checks run (2026-11-19)

- Live thread check: `leo_thread_list` (`includeSubagents: true`, `settled: false`) for `leonidas-app`. Thread `0281c7a6` ("Audit Windows Feature Portability") is running and surfaced the `-MD` / `MSVCP140.dll` clean-Windows failure on `scribe-engine.exe` (adapted in Decision 4). Other unsettled threads (`f55e6a5d`, `c6ce4be7`, `5d981f8a`, `82ebbc45`) do not modify Scribe packaging or `scripts/build-desktop-artifact.ts`.
- Working tree check: `git status --short` shows no dirty files in `leonidas-app`.
