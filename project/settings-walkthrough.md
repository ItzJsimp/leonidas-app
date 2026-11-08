# T3 Code settings walkthrough (power-user edition)

Source: `this repo` (fork of pingdotgg/t3code), read at commit `c85dc64268`. Every default below comes from source or the in-repo user docs (`docs/user/*.md`); where I could not confirm one it says "unverified". Recommendations are judgment calls for this setup: Windows 11, two Claude Pro accounts as two provider instances (separate `CLAUDE_CONFIG_DIR`), Google Antigravity, and Codex side by side on one machine. "Mod" means Ctrl on Windows.

Section names follow the real sidebar labels in `apps/web/src/components/settings/settingsSearch.ts` (`SETTINGS_SECTION_LABELS`): Project, General, Appearance, Keybindings, SnapShots, Providers, Integrations, Scheduled Tasks, Source Control, Storage, Connections, Archive. Diagnostics and Usage live elsewhere and get their own sections.

## Top 10 changes to make first

1. **Create two Claude instances with separate config dirs** (Providers). Log each in with its own `CLAUDE_CONFIG_DIR` before adding it. Existing threads can only switch between instances that share a config dir, so name and colour them clearly now. See the Providers section.
2. **Turn on "Auto-resume limited threads" and "Snooze limited threads"** (General > Organization). Both default off. They turn a Claude Pro 5-hour wall into a scheduled continuation instead of a dead thread.
3. **Turn on "Continue threads after restarts"** (General > Behavior). Default off, and Windows has no background service (`docs/user/background-service.md`), so a reboot or crash otherwise drops running work.
4. **Set a default permission mode other than Full access** (General > New threads > Permissions). The built-in default is Full access (`packages/contracts/src/providerPolicy.ts`, `DEFAULT_RUNTIME_MODE`). Auto is the sane middle for Claude and Codex; Antigravity falls back to asking.
5. **Move worktrees to `D:\worktrees`** (Storage > Worktree location) and set `"defaultThreadEnvMode": "worktree"` in each repo's `t3.json` so parallel agents on different accounts never share a checkout.
6. **Set "Auto-compact after" to 200000 on both Claude instances** (Providers > Claude > Runtime). Empty by default. Smaller contexts burn less Pro quota.
7. **Pick the text generation model on purpose** (General > Text generation). The default is a Codex model at low effort, so titles and commit messages do not touch Claude quota. Keep it unless you want Claude Haiku on one account.
8. **Set `T3CODE_TELEMETRY_ENABLED=false` as a Windows user environment variable.** Product telemetry to PostHog is on by default (`apps/server/src/telemetry/AnalyticsService.ts`, `docs/user/telemetry.md`).
9. **Enable cleanup in Storage**: delete merged and unchanged worktrees, cap logs and browser artifacts. Everything defaults to off, so worktrees pile up.
10. **Bind `thread.stop` and turn on thread notifications** (Keybindings, General > Behavior). `thread.stop` has no default key, and Thread notifications default to Off.

## How scope works (read once)

- The "Applying settings for ..." bar at the top of each page chooses project and environment. Device-local rows (appearance, confirmations, notifications, browser profiles) ignore it. Everything else is stored on a server and fans out to the selected environments (`docs/user/project-settings.md`).
- Resolution order for project-scoped keys: project override, then environment setting, then `t3.json`, then built-in default. Project-scoped keys are listed in `PROJECT_SCOPED_SERVER_SETTING_KEYS` (`packages/contracts/src/settings.ts`).
- Providers and Diagnostics are per machine: one environment at a time.
- In this walkthrough, "(project)" in the setting name column means that setting can be overridden per project.

---

## Project

Appears only while a project is selected (`isSettingsOverviewVisible` in `settingsSearch.ts`). Strings from `SettingsPanels.tsx` and `docs/user/project-settings.md`.

| Setting                       | Default                                                    | What it does                                                                                                                                                                                                                        | Recommend                                                                |
| ----------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Project overview (name, icon) | Automatic icon, name from folder                           | Renames the project across its checkouts; icon can be image, emoji, monogram or Lucide icon. Icon sources: `t3.json` `iconPath` first, then built-in locations.                                                                     | Set a distinct colour monogram per project so the sidebar is scannable.  |
| Actions                       | Environment's shared list (`defaultProjectScripts`, empty) | Per-project scripts shown in the scripts menu. Editing creates the project's own list; reset returns to the shared list. Fields: name, command, icon, run on worktree create, run on settle, async, preview URL, auto-open preview. | Import from `t3.json` rather than hand-editing. See the t3.json section. |
| Checkouts and removal         | n/a                                                        | Lists checkouts, removes the project.                                                                                                                                                                                               | Leave.                                                                   |

---

## General

Sub-sections as rendered in `SettingsPanels.tsx`: Organization, Behavior, Projects & threads, Confirmations, Text generation, About, Diagnostics, Legacy toggles.

### Organization

| Setting                                | Default                                                            | What it does                                                                                                       | Recommend                                                                       |
| -------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| Project grouping                       | Repository (`sidebarProjectGroupingMode`)                          | Combines matching repositories across environments in the sidebar. Options: repository, repository path, separate. | Repository. Use per-project override if one repo lives in both Windows and WSL. |
| Project order                          | Last user message (`updated_at`)                                   | Order in the sidebar picker and command palette: last user message, created at, manual.                            | Last user message.                                                              |
| Auto-resume limited threads            | Off                                                                | Resumes usage-limit stops at the reported reset time. Each thread can cancel its continuation.                     | On. Core feature for Claude Pro limits.                                         |
| Snooze limited threads                 | Off                                                                | Hides usage-limit stops until the reset time. Combine with auto-resume to wake and continue.                       | On.                                                                             |
| Working section (beta)                 | Off                                                                | Folds working and monitoring threads into a Working shelf; they return to the inbox top when they need you.        | On if you run 4+ agents across accounts; otherwise leave off.                   |
| Auto-settle merged threads (project)   | On (`sidebarAutoSettleOnMerge`)                                    | Settles a thread when its pull request merges.                                                                     | On.                                                                             |
| Auto-settle inactive threads (project) | 3 days (`sidebarAutoSettleAfterDays`, range 1 to 90, null = never) | Sidebar threads with no activity settle automatically; new activity unsettles.                                     | 7 days if you juggle many threads over a weekend.                               |

### Behavior

| Setting                                   | Default                                  | What it does                                                                                                              | Recommend                                                  |
| ----------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| In-app notifications                      | Off (`inAppNotificationsEnabled`)        | Toast when another thread finishes, fails, or needs input or approval while the app has focus.                            | On.                                                        |
| Thread notifications                      | Off (`notificationMode`)                 | System alerts and/or sound: Off, Notifications only, Sound only, Notifications with sound. Device-local.                  | Notifications with sound.                                  |
| Time format                               | System default (`locale`)                | System default, 12-hour or 24-hour.                                                                                       | 12-hour.                                                   |
| Response streaming (project)              | Show finished paragraphs (`paragraph`)   | Alternative is "Wait for the full response" (`turn`).                                                                     | Paragraph (default).                                       |
| Hide whitespace changes                   | On (`diffIgnoreWhitespace`)              | Diff panel ignores whitespace-only edits by default.                                                                      | On. Windows CRLF repos benefit.                            |
| Default diff file state                   | Collapsed (`diffFilesCollapsed` true)    | Files collapsed or expanded when opening diffs or a PR Code tab.                                                          | Collapsed.                                                 |
| Diff layout                               | Stacked                                  | Stacked or split. Also toggled from the diff toolbar.                                                                     | Split on wide monitors.                                    |
| Proactive panels                          | Off                                      | Automatically opens linked PRs first, otherwise Changes for edits to at least 3 files or 50 lines.                        | On for review-heavy work.                                  |
| Show skills in slash menu                 | On                                       | Also lists skills in the `/` menu. Skills always appear on `$`.                                                           | On.                                                        |
| Rich text composer                        | On (`composerRichTextEnabled`)           | Styled Markdown while typing.                                                                                             | On.                                                        |
| Collapse composer on scroll               | On                                       | Rests the composer to a single line when you scroll an existing thread.                                                   | On.                                                        |
| Send shortcut                             | Enter                                    | Enter sends; or Mod+Enter for multiline; or Mod+Enter always. Shift+Enter is a newline.                                   | Enter.                                                     |
| Follow-up behavior                        | Queue (`followUpBehavior`)               | Queue or steer while the agent runs. Mod+Enter does the opposite once.                                                    | Queue. Mod+Shift+Enter steers the oldest queued message.   |
| Provider update checks (environment)      | On (`enableProviderUpdateChecks`)        | Checks installed provider CLIs for newer versions.                                                                        | On.                                                        |
| Continue threads after restarts (project) | Off (`continueThreadsAfterServerUpdate`) | Resumes interrupted threads after an update, crash or machine restart. Does not enable auto-start.                        | On.                                                        |
| Background activity (environment)         | Balanced                                 | Shared power policy for Git fetch and provider health probes. Profiles below. Advanced dialog edits individual intervals. | Performance on a plugged-in desktop; Balanced on a laptop. |

Background activity profile presets (`packages/shared/src/backgroundActivitySettings.ts`):

| Preset        | Git fetch | Provider health | Host power poll (active / idle) | Pauses                                        |
| ------------- | --------- | --------------- | ------------------------------- | --------------------------------------------- |
| Performance   | 15 s      | 1 min           | 30 s / 2 min                    | Host locked                                   |
| Balanced      | 30 s      | 5 min           | 30 s / 5 min                    | Host locked, host low power, client low power |
| Battery saver | 0 (off)   | 15 min          | 1 min / 10 min                  | Also on battery                               |

Advanced dialog fields: Shared policy, Git fetch interval, Provider health interval, Host power monitor, Idle host monitor, plus pause toggles (Pause when host is locked, Pause on host low power, Pause on client low power, Pause on battery) and `idleClientTtl` (45 s in all presets).

### Projects & threads

| Setting                             | Default                                                                                   | What it does                                                                        | Recommend                                                                                                     |
| ----------------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| New threads > Model (project)       | None (remembers last provider, model, options)                                            | Default model for new threads; project can override.                                | Leave unset so each project remembers its last account. Set per project when a repo is pinned to one account. |
| New threads > Workspace (project)   | Inherit, resolves to `t3.json` then Local (`defaultThreadEnvMode` null; built-in `local`) | Where new threads start: Local checkout or new Worktree.                            | Worktree, via `t3.json` in each repo.                                                                         |
| New threads > Permissions (project) | Full access (`defaultRuntimeMode`)                                                        | Supervised, Auto-accept edits, Auto, Full access. Existing threads keep their mode. | Auto. Per-project Full access for scratch repos only.                                                         |
| Submodules (project)                | Inherit, then `t3.json`, then Recursive                                                   | Recursive, Top level only, Skip.                                                    | Top level only if worktree creation is slow.                                                                  |
| Start from origin (project)         | On (`newWorktreesStartFromOrigin`)                                                        | New worktrees branch from latest matching origin branch, not local.                 | On.                                                                                                           |
| Add project starts in               | Empty (uses `~/`)                                                                         | Base directory of the Add Project browser.                                          | `D:\` projects folder.                                                                                        |

### Confirmations

| Setting                 | Default              | What it does                                                                         | Recommend                                  |
| ----------------------- | -------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------ |
| Unpin confirmation      | Off                  | Ask before unpinning.                                                                | Off.                                       |
| Archive confirmation    | Off                  | Needs a second click to archive.                                                     | Off.                                       |
| Delete confirmation     | On                   | Ask before deleting a thread and its history.                                        | On.                                        |
| Quit shortcut (desktop) | Hold (`confirmQuit`) | Direct, Hold (1.2 s or double press within 500 ms), Double press. Ctrl+Q on Windows. | Hold. Direct risks killing running agents. |

### Text generation

| Setting                         | Default                                                      | What it does                                                                                                                                                                                            | Recommend                                                                   |
| ------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Text generation model (project) | Instance `codex`, model `gpt-6-luna`, reasoning effort `low` | Model for thread titles and other generated text. Source Control can override. Per-provider defaults: Claude `claude-haiku-4-5`, Antigravity `antigravity-default` (`packages/contracts/src/model.ts`). | Keep Codex low. Cheapest way to keep Claude Pro windows free for real work. |

### About (Updates)

| Setting                     | Default                                                                | What it does                                                                                                                                                                                  | Recommend                                                                                          |
| --------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Version / Check for Updates | n/a                                                                    | Shows version; button cycles Check, Download, Install. Auto-download and install-on-quit are both disabled; the updater polls every 4 minutes (`apps/desktop/src/updates/DesktopUpdates.ts`). | Check weekly; updates are manual. Server and client versions must match (`docs/user/updating.md`). |
| Update track                | Stable (`latest`); Nightly if the installed version is a nightly build | Switches between stable and nightly (`apps/desktop/src/updates/updateChannels.ts`). Nightly needs the beta mobile apps.                                                                       | Stable.                                                                                            |
| t3 command                  | Not installed                                                          | Install or Remove the `t3` CLI. On Windows it adds the app's command folder to `PATH`.                                                                                                        | Install. Needed for `t3 pair`, `t3 theme`, `t3 trace`.                                             |
| Mobile app (nightly only)   | n/a                                                                    | Beta app links as QR codes.                                                                                                                                                                   | Skip.                                                                                              |
| Privacy policy              | n/a                                                                    | Link; describes anonymous usage data.                                                                                                                                                         | Disable telemetry via env var (see env section).                                                   |
| Diagnostics                 | n/a                                                                    | Opens the Diagnostics page (below).                                                                                                                                                           | Bookmark it.                                                                                       |
| Open source licenses        | n/a                                                                    | Dependency notices.                                                                                                                                                                           | Skip.                                                                                              |

### Legacy toggles (General)

| Setting                           | Default | What it does                                                    | Recommend                                                                                          |
| --------------------------------- | ------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Plan mode (legacy)                | Off     | Restores Build/Plan toggle, `/plan`, `/default`, Shift+Tab.     | Off for Claude. Antigravity says to use its native `/plan` (`docs/user/providers-antigravity.md`). |
| Context window indicator (legacy) | Off     | Circular context meter in the composer; offers Compact context. | On. It is the only in-UI context gauge.                                                            |
| Sidebar (legacy)                  | Off     | Per-project thread trees instead of the flat sidebar.           | Off.                                                                                               |

---

## Appearance

All device-local (`ClientSettingsSchema`). Sections: Colors & themes, Interface, Typography, Motion.

| Setting                    | Default                               | What it does                                                                                         | Recommend                            |
| -------------------------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------ |
| Color scheme               | System                                | System, Light or Dark; different themes per light/dark half possible.                                | Dark.                                |
| Themes                     | Built-in theme                        | Pick, create, import (T3 or VS Code), export. Environment themes come from `~/.t3/userdata/themes/`. | Import once, then ignore.            |
| Contrast                   | 100 (range 50 to 200)                 | Colour and border contrast.                                                                          | 100 to 110.                          |
| Glass opacity              | 80 (range 40 to 100)                  | Higher is more solid menus, dialogs, composer.                                                       | 100 if transparency lags on the GPU. |
| Environment identification | Artwork                               | Dev/Nightly marking: Artwork, Version pill, None. Stage dependent.                                   | Version pill.                        |
| Diff colors                | Red/green                             | Red/green or blue/orange.                                                                            | Default.                             |
| Composer context           | Off (`persistComposerContextStrip`)   | Keeps branch/worktree controls visible after thread start.                                           | On.                                  |
| Chat width                 | Comfortable                           | Comfortable, Wide, Full.                                                                             | Wide on a 1440p+ monitor.            |
| Panel animations           | 0 ms (range 0 to 400)                 | Panel open/close motion; zero avoids per-frame layout work.                                          | 0.                                   |
| Interface font             | Empty (app default), 16 px (12 to 20) | Family and size; scales all rem-based UI.                                                            | 15 to 16.                            |
| Prompt font                | Empty, 14 px (12 to 20)               | Composer font.                                                                                       | Mono at 14.                          |
| Code font                  | Empty, 13 px (10 to 18)               | Code blocks, diffs, previews.                                                                        | 13.                                  |
| Terminal font              | Empty, 12 px (8 to 20)                | Terminal only.                                                                                       | 13 with a Nerd Font.                 |
| Font smoothing             | On                                    | Grayscale smoothing. macOS only.                                                                     | Not shown on Windows.                |
| Word wrap                  | On                                    | Wraps long lines in code blocks, tables, diffs, previews.                                            | On.                                  |

---

## Keybindings

UI: search box, per-command rows with a shortcut recorder and `when` editor, "New keybinding", and "Open keybindings.json". Commands total: see `STATIC_KEYBINDING_COMMANDS` in `packages/contracts/src/keybindings.ts`; per-script commands are `script.<id>.run`. Max 256 rules, 64 chars per key, 256 chars per `when`. File path and syntax are in the file-config section.

Defaults worth knowing (`DEFAULT_KEYBINDINGS` in `packages/shared/src/keybindings.ts`):

| Setting                                                                | Default                                                | What it does                                                            | Recommend                                                     |
| ---------------------------------------------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------- | ------------------------------------------------------------- |
| `sidebar.toggle`                                                       | Mod+B                                                  | Toggle sidebar.                                                         | Keep.                                                         |
| `terminal.toggle`                                                      | Mod+J                                                  | Toggle terminal drawer.                                                 | Keep.                                                         |
| `diff.toggle`                                                          | Mod+D (not in terminal)                                | Toggle diff panel.                                                      | Keep.                                                         |
| `commandPalette.toggle`                                                | Mod+K                                                  | Command palette (projects, threads, actions, `>`).                      | Keep.                                                         |
| `modelPicker.toggle`                                                   | Mod+Shift+M                                            | Model picker; Mod+1 to 9 jumps to models while open (desktop only).     | Keep; this is your account switcher.                          |
| `modelPicker.previousProvider` / `nextProvider`                        | Mod+Shift+Up / Down (picker open)                      | Cycle providers.                                                        | Keep.                                                         |
| `composer.effort` / `composer.mode`                                    | Mod+Shift+E / Mod+Shift+A                              | Effort and access mode menus.                                           | Keep.                                                         |
| `composer.workspace` / `composer.branch` / `composer.previousWorktree` | Mod+Shift+X / G / L                                    | Workspace, branch, reuse previous worktree.                             | Keep.                                                         |
| `composer.host` / `composer.cycleHost`                                 | Mod+Shift+H / unbound                                  | Host picker / cycle hosts.                                              | Leave unless you add remote hosts.                            |
| `composer.sendAlternate`                                               | Mod+Enter (composer focused, turn running)             | Opposite of the follow-up default.                                      | Keep.                                                         |
| `composer.sendBackground` / `composer.sendAndNewThread`                | Mod+Enter on a draft; Mod+Alt+Enter                    | Send and leave running in the background / send and start a new thread. | Keep. Good for fanning out across accounts.                   |
| `thread.stop`                                                          | Unbound                                                | Interrupts the running turn in the focused thread.                      | Bind to `mod+.` with `when: "turnRunning && !terminalFocus"`. |
| `thread.steerQueuedMessage` / `thread.editQueuedMessage`               | Mod+Shift+Enter / Alt+Up                               | Steer oldest queued message / edit newest.                              | Keep.                                                         |
| `thread.previous` / `next`                                             | Mod+Shift+[ / ]                                        | Move between threads.                                                   | Keep.                                                         |
| `thread.jump.1` to `9`                                                 | Mod+1 to 9 (desktop only)                              | Open first nine threads.                                                | Keep.                                                         |
| `thread.settle`, `thread.pin`, `thread.undo`                           | Mod+Shift+S, Mod+Shift+P, Mod+Z                        | Settle, pin, undo last sidebar action (5 s window).                     | Keep.                                                         |
| `chat.new`, `chat.newLocal`, `chat.newWithoutProject`                  | Mod+N or Mod+Shift+O, Mod+Shift+N, Mod+Alt+N           | New thread variants.                                                    | Keep.                                                         |
| `chat.find`                                                            | Mod+F (not terminal or preview)                        | Find in the current thread.                                             | Keep.                                                         |
| `rightPanel.close` / `terminal.close`                                  | Mod+W                                                  | Close tab; closes the window when nothing is left.                      | Keep; Windows closes the window on empty.                     |
| `view.reopenClosed`                                                    | Mod+Shift+T                                            | Reopen last closed tab.                                                 | Keep.                                                         |
| `usage.open`                                                           | Mod+U                                                  | Opens the Usage page.                                                   | Keep.                                                         |
| `usage.cost/tokens/limits`                                             | C / T / L (Usage page open)                            | Tab switch.                                                             | Keep.                                                         |
| `usage.period.*`                                                       | Mod+Shift+1/2/3/4                                      | 24 h / 7 d / 30 d / 90 d.                                               | Keep.                                                         |
| `theme.select` / `appearance.cycle` / `themeEditor.toggle`             | Mod+Alt+A / Mod+Alt+Shift+A / Mod+Alt+Shift+T          | Theme picker, cycle System/Light/Dark, theme editor.                    | Keep.                                                         |
| `composer.stash`                                                       | Mod+S                                                  | Stash prompt and attachments.                                           | Keep.                                                         |
| `editor.openFavorite`                                                  | Mod+O                                                  | Open the project in your favourite editor.                              | Keep.                                                         |
| `preview.*`                                                            | Mod+Shift+J toggle; Mod+R/L/=/-/0 when preview focused | Browser preview toggle, refresh, URL, zoom.                             | Keep.                                                         |
| `filePicker.toggle`, `projectSearch.toggle`                            | Mod+P, Mod+Shift+F                                     | File picker, project-wide search.                                       | Keep.                                                         |
| `rightPanel.toggle`, `threadPanel.toggle`                              | Mod+Alt+B, Mod+Shift+B                                 | Right panel, thread panel.                                              | Keep.                                                         |

`when` context keys (`docs/user/keybindings.md`): `terminalFocus`, `terminalOpen`, `previewFocus`, `previewOpen`, `modelPickerOpen`, `usagePageOpen`, `composerFocus`, `composerDraft`, `turnRunning`, `editableFocus`, `isWeb`, `isDesktop`. The source defaults also use `rightPanelOpen` and `draftThreadRoute`; unknown keys evaluate to false. Precedence: last matching rule wins.

---

## SnapShots

Desktop only; off by default; Windows needs no setup or permission (`docs/user/snap-shot.md`).

| Setting                       | Default                              | What it does                                                                                                     | Recommend                                                                              |
| ----------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| SnapShots (`snapShotEnabled`) | Off                                  | Captures the window you are in and attaches it to the current draft with app name, title and accessibility data. | On. Fast way to show Claude or Antigravity a UI bug.                                   |
| Include app text              | On                                   | Includes accessibility tree (controls, text, positions).                                                         | Off when the window shows secrets or banking.                                          |
| Capture shortcut              | Both Shift keys together             | Modifier pair or key chord; refuses collisions with T3 keybindings and OS-reserved keys.                         | Change to a chord such as Ctrl+Alt+Shift+S. Double Shift fires while typing or gaming. |
| Capture sound                 | On, `soft-pop` (or `camera-shutter`) | Plays a sound on capture.                                                                                        | Off.                                                                                   |
| Capture flash                 | On                                   | Screen flash.                                                                                                    | Off.                                                                                   |
| Capture animations            | On                                   | Attach animation.                                                                                                | Off.                                                                                   |

---

## Providers

Per-environment page. Header actions: Add provider, Refresh provider status. Each provider instance card has: Display name (plus accent colour), Setup, Runtime, Environment, Models. Default instances `codex` and `claudeAgent` run before configuration; cursor, grok, muse, pi, opencode and antigravity default to disabled (`packages/contracts/src/settings.ts`, `DEFAULT_DISABLED_PROVIDER_DRIVERS`).

### Shared instance fields (all providers)

| Setting                 | Default                              | What it does                                                                                                                                                                                                                 | Recommend                                                                                     |
| ----------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Display name            | Driver label                         | Label in pickers. New instance id is `<driver>_<slug-of-label>` (`AddProviderInstanceDialog.tsx`).                                                                                                                           | `Claude A`, `Claude B`, `Codex`, `Antigravity`. Choose now, ids are permanent.                |
| Accent colour           | Unset                                | Colour chip for the instance.                                                                                                                                                                                                | Distinct per Claude account (for example blue and orange).                                    |
| Enabled toggle          | Claude and Codex on; Antigravity off | Disabling stops sessions, keeps history.                                                                                                                                                                                     | Disable unused drivers to avoid probes.                                                       |
| Environment > Variables | Empty                                | Per-instance env vars (name, value, "Sensitive" flag). Sensitive values are not shown after saving. `CODEX_HOME` and `CLAUDE_CONFIG_DIR` set here are expanded (`packages/provider-core/src/server/instanceEnvironment.ts`). | Use absolute or `~/` paths only; relative paths break Usage discovery (`docs/user/usage.md`). |

### Claude (`ClaudeSettings`)

| Setting                | Default                                                               | What it does                                                                                                                                                                               | Recommend                                                                                                                                         |
| ---------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Binary path            | `claude`                                                              | Claude binary for this instance (`pathToClaudeCodeExecutable`).                                                                                                                            | `claude` if on `PATH`; otherwise the full path to the npm shim or `claude.exe`.                                                                   |
| CLAUDE_CONFIG_DIR path | Empty (falls back to inherited `CLAUDE_CONFIG_DIR`, then `~/.claude`) | Separate config, login and conversation state. Leaves `HOME` and keychain alone (`apps/server/src/provider/Drivers/ClaudeHome.ts`).                                                        | Instance A: empty (existing `~/.claude`). Instance B: `~/.claude_b`. Log in first: `$env:CLAUDE_CONFIG_DIR="$HOME\.claude_b"; claude auth login`. |
| Auto-compact after     | Empty (Claude default)                                                | Integer 100000 to 1000000 tokens; sets `autoCompactWindow` in SDK settings. Does not change the model's window.                                                                            | 200000 on both. Judgment call to protect Pro quota.                                                                                               |
| Launch arguments       | Empty                                                                 | Extra CLI flags at session start. `--permission-mode` and `--dangerously-skip-permissions` here override the UI permission mode (`ClaudeAdapterV2.ts`, `buildClaudeAgentSdkQueryOptions`). | Leave empty so the Permissions control stays authoritative.                                                                                       |
| Custom models          | None                                                                  | Add unlisted model IDs per instance (Models section).                                                                                                                                      | Add only if you need a model the catalog omits.                                                                                                   |

Facts that matter for two accounts:

- Threads can only move between Claude instances with the same config dir (`docs/user/providers-claude.md`). A limit on account A means a new thread on B, not a switch.
- Skills come from the instance's config-dir `skills` folder and the project's `.claude/skills`; the config-dir copy wins (`apps/server/src/provider/Drivers/ClaudeSkills.ts`). Duplicate or junction personal skills into both config dirs.
- Account limits per instance are read from that instance's config dir (`apps/server/src/provider/Drivers/claudeUsage.ts`), so Usage > Limits shows both Pro accounts separately.
- Claude model options exposed in the picker: effort, thinking, fast mode where the model supports it (`apps/server/src/claudeModelOptions.ts`).

### Codex (`CodexSettings`)

| Setting          | Default             | What it does                                                                                                                                           | Recommend                                                     |
| ---------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------- |
| Setup mode       | Managed vs existing | Managed: T3 installs the runtime and connects ChatGPT. Existing: use your installed `codex`.                                                           | Existing if you already run `codex login`; managed otherwise. |
| Binary path      | `codex`             | Codex binary for this instance.                                                                                                                        | `codex`.                                                      |
| CODEX_HOME path  | Empty               | Codex home and config dir.                                                                                                                             | `~/.codex` if you add a second Codex account.                 |
| Shadow home path | Empty               | Account-specific home that keeps `auth.json` separate while sharing state with `CODEX_HOME`. Both instances must use the same `CODEX_HOME`.            | Only for a second Codex account.                              |
| Launch arguments | Empty               | Extra args for `codex app-server`. `T3CODE_CODEX_LAUNCH_ARGS` in the environment wins over this field (`apps/server/src/provider/codexLaunchArgs.ts`). | Empty.                                                        |

Codex usage limits: thread names the exhausted window and reset time (`docs/user/providers-codex.md`). Multiple ChatGPT accounts can be added without touching your CLI login.

### Antigravity (`AntigravitySettings`)

Off by default. Runs Google's official Antigravity ACP agent with its own sign-in, separate from the IDE or CLI (`docs/user/providers-antigravity.md`).

| Setting        | Default                                              | What it does                                                                                                                 | Recommend                                                                 |
| -------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Sign-in method | Google account (`oauth-personal`)                    | Google account, Gemini Enterprise, Gemini API key, or Agent Platform (Vertex AI). Changing it stops the instance's sessions. | Google account (uses your subscription).                                  |
| API key        | Empty                                                | Gemini or Vertex express key; stored in plain text in `settings.json`.                                                       | Leave empty.                                                              |
| GCP project    | Empty                                                | Required for Gemini Enterprise; used by Agent Platform without a key.                                                        | Empty.                                                                    |
| GCP location   | Empty                                                | Region for Enterprise or Agent Platform.                                                                                     | Empty.                                                                    |
| Binary path    | Empty (managed runtime, or compatible exe on `PATH`) | Custom ACP executable.                                                                                                       | Empty (managed runtime supports Windows x64 and ARM64; allow several GB). |
| Custom models  | Not supported                                        | Antigravity uses its account catalog.                                                                                        | n/a                                                                       |

Behaviours: one instance per Google account; native `/plan` replaces T3 Plan mode; no revert or edit-and-resubmit; skills read from `.agents/skills`, `.gemini/skills` and `.agent/skills` in the project; Usage reads `ANTIGRAVITY_DATA_DIR` if set.

### Models (per instance)

| Setting               | Default                           | What it does                                                                                      | Recommend                |
| --------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------ |
| Favorites             | None (`favorites`)                | Star models; stored per provider instance id. Device-local.                                       | Star 2 or 3 per account. |
| Hidden models / order | None (`providerModelPreferences`) | Hide and reorder catalog models. Device-local.                                                    | Hide legacy models.      |
| Add custom model      | None                              | Name, slug, and option descriptors; copy options from a built-in model. Saved on the environment. | Skip unless needed.      |

### Usage providers

| Setting                   | Default                            | What it does                                                                                                | Recommend       |
| ------------------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------- | --------------- |
| Usage providers > Add hub | None (`usageLimitSources`)         | Adds a CLIProxyAPI hub (URL, optional label, management key) for pooled quota. Key is redacted client-side. | Skip.           |
| Cursor account usage      | Off (`cursorKeychainUsageEnabled`) | macOS Keychain read for Cursor.                                                                             | n/a on Windows. |

### Advanced

| Setting               | Default                   | What it does                                                                                               | Recommend                                                                                                                                     |
| --------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Health check interval | 300 s (5 min; 0 disables) | Background refresh of provider status, versions, models. Shared Background activity policy still gates it. | 600 s. Each probe spawns a Claude CLI process; the source calls out Windows process-tree cost (`apps/server/src/provider/ClaudeProvider.ts`). |

---

## Integrations

| Setting                                        | Default                                     | What it does                                                                                           | Recommend                                                      |
| ---------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| Agent browser access (project)                 | On (`enableAgentBrowserAccess`)             | Lets agents drive the in-app preview via the `t3-code` MCP server. Applies at next session start.      | On; turn off per project that handles secrets.                 |
| Agent device access                            | Off (`enableAgentDeviceAccess`)             | Lets agents drive simulators/emulators.                                                                | Off on Windows.                                                |
| Device hub / Simulator support / Device hosts  | Off (`enableDeviceSupport` false)           | iOS/Android simulators, SSH device hosts.                                                              | Off.                                                           |
| Browser profiles                               | Default (persistent) and Incognito built in | Separate cookies and logins per profile.                                                               | One profile per Claude account if you test logged-in web apps. |
| Default browser profile                        | `default`                                   | Profile new tabs open under.                                                                           | Default.                                                       |
| Default browser viewport                       | Fill                                        | Tab size; other sizes show the device toolbar.                                                         | Fill.                                                          |
| Default browser zoom                           | 100%                                        | Zoom for new tabs.                                                                                     | Default.                                                       |
| Default browser appearance                     | System                                      | Preferred colour scheme sent to pages.                                                                 | System.                                                        |
| Browser recording frame rate                   | 30 fps                                      | 30 or 60.                                                                                              | 30.                                                            |
| Show key presses / mouse presses in recordings | Off / Off                                   | Overlays in new recordings; password fields excluded.                                                  | Off.                                                           |
| Open links in                                  | System                                      | System browser or in-app browser (desktop only). Hold Ctrl while clicking to force the system browser. | In-app.                                                        |
| Auto-show floating preview                     | On                                          | Pops the mini preview when an agent opens a browser or device.                                         | Off if it steals focus.                                        |

---

## Scheduled Tasks

Native T3 scheduler (`packages/contracts/src/scheduledTask.ts`, `apps/web/src/components/settings/ScheduledTasksSettings.tsx`). Tasks run only while the environment is running; Windows has no background service.

| Setting                        | Default               | What it does                                                                                                | Recommend                                                         |
| ------------------------------ | --------------------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Runs on                        | Selected environment  | Environment that executes the task; fixed-time uses its time zone.                                          | Local.                                                            |
| Project / model / permissions  | Required              | Each task carries project, model selection, runtime mode, interaction mode.                                 | Pick the account with spare quota.                                |
| Workspace                      | Create a new worktree | Create a new worktree, Use the project checkout, or Use a specific checkout (base branch or checkout path). | New worktree.                                                     |
| Schedule type                  | Required              | Interval (minimum 60000 ms), Fixed time (HH:MM, optional weekdays), On webhook.                             | Fixed time off-peak so it does not collide with interactive work. |
| On webhook > Require signature | Off                   | HMAC-SHA256 check: header, hex or base64, prefix, secret.                                                   | On for GitHub (`x-hub-signature-256`, `sha256=`).                 |
| Skip requests older than       | Null (run all)        | 1 to 1440 minutes; for held webhooks.                                                                       | 60.                                                               |
| Deliveries                     | n/a                   | Shows recent requests and the prompt each produced.                                                         | Use when debugging.                                               |
| Rotate                         | n/a                   | New webhook URL token; old URL dies.                                                                        | Rotate if leaked.                                                 |

---

## Source Control

| Setting                                     | Default                                                     | What it does                                                                         | Recommend                                  |
| ------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------ |
| Automatically pull (project)                | Off (`defaultAutoPull`)                                     | Fast-forward pulls on the default branch checkout when clean.                        | On for repos you only read.                |
| Remove agent credits when merging (project) | Off                                                         | Strips agent co-author and generated-by lines from GitHub merge and squash messages. | Your call; default keeps Claude credit.    |
| Default merge method (project)              | Null (reuse last used)                                      | Squash, merge or rebase for PRs.                                                     | Squash.                                    |
| Source control (rescan)                     | n/a                                                         | Detects git, `gh`, `glab`, `fj`/`tea`, Azure CLI. Rescan after signing in.           | Rescan once.                               |
| Git fetch interval                          | 30 s (Balanced)                                             | Background remote refresh; 0 disables. Part of Background activity.                  | 60 s.                                      |
| Worktree branch naming (project)            | Static prefix `t3` (`branchNamingMode`, `branchNamePrefix`) | Static prefix, Semantic prefix (model picks `feat/` etc.), or Custom instructions.   | Semantic.                                  |
| Branch prefix                               | `t3`                                                        | e.g. `t3` or `t3/` gives `t3/add-search`.                                            | `t3` (keeps agent branches greppable).     |
| Branch naming instructions                  | Empty                                                       | Appended to the naming prompt for Custom mode.                                       | Empty.                                     |
| GitHub accounts and token                   | `gh` login                                                  | Per-host account pick or disable; saved token beats `GH_TOKEN`, which beats `gh`.    | Use `gh auth login`; pin account per host. |
| Bitbucket credentials                       | Empty                                                       | Access token, or API token plus email.                                               | Skip.                                      |
| Source control writing style                | Repository conventions                                      | Repository conventions, Conventional Commits, or Custom instructions.                | Repository conventions.                    |
| Follow change request templates             | On                                                          | Uses the repo's PR template.                                                         | On.                                        |
| Source control writer model (project)       | Off (null)                                                  | Separate model for commit and PR text; off uses the Text generation model.           | Off.                                       |

---

## Storage

All cleanup policies default off (`StorageCleanupSettings` in `packages/contracts/src/settings.ts`). They run at startup, on change, and hourly.

| Setting                               | Default                                          | What it does                                                         | Recommend                                              |
| ------------------------------------- | ------------------------------------------------ | -------------------------------------------------------------------- | ------------------------------------------------------ |
| Worktree location                     | Empty = `~/.t3/worktrees` (`worktreesDirectory`) | Absolute dir for new worktrees; existing ones stay put. Per machine. | `D:\worktrees`. Keep paths short for Windows MAX_PATH. |
| Automatic worktree cleanup (project)  | Off / Inherit                                    | Off, Custom, or Inherit per project.                                 | Custom as below.                                       |
| Delete worktrees with deleted threads | Off                                              | Removes safe worktrees when threads are deleted.                     | On.                                                    |
| Delete inactive worktrees             | Off (null days; 1 to 3650)                       | After N days of inactivity. Branches and history stay.               | 14 days.                                               |
| Delete merged worktrees               | Off                                              | After the PR merged and commits are in the default branch.           | On.                                                    |
| Delete unchanged worktrees            | Off                                              | Worktrees with no commits beyond the default branch.                 | On.                                                    |
| Delete old browser artifacts          | Off (null)                                       | Deletes captures after N days; old links stop opening.               | 14 days.                                               |
| Delete old rotated logs               | Off (null)                                       | Deletes inactive rotated logs after N days.                          | 30 days.                                               |

Only T3-managed worktrees qualify; active sessions, shared worktrees, uncommitted changes and ignored files (other than `node_modules`) block removal (`docs/user/project-settings.md`).

---

## Connections

| Setting                     | Default                           | What it does                                                                                                                                                         | Recommend                                |
| --------------------------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| This machine                | n/a                               | Server status, administrative permissions, pairing links and QR codes, authorized clients, revoke.                                                                   | Review periodically.                     |
| Environment icon            | Detected machine kind             | Icon shown for this environment on every device.                                                                                                                     | Desktop.                                 |
| Local environment (desktop) | On (`localEnvironmentEnabled`)    | Off turns the app into a remote-only client.                                                                                                                         | On.                                      |
| Network access              | Local only (`serverExposureMode`) | Exposes the backend on the LAN; restarts the app.                                                                                                                    | Off unless you pair a phone.             |
| Tailscale HTTPS             | Off (port 443)                    | Tailnet HTTPS route via Tailscale Serve.                                                                                                                             | Off, or on if you already use Tailscale. |
| WSL backend                 | Off (`wslBackendEnabled`)         | Runs a second backend in a chosen WSL distro; projects stay on their filesystem.                                                                                     | Off unless repos live in WSL.            |
| WSL only                    | Off                               | Runs only the WSL backend; restarts the app.                                                                                                                         | Off.                                     |
| T3 Connect                  | Off (needs sign-in)               | Managed tunnel to your other devices.                                                                                                                                | Optional.                                |
| Hold webhooks while offline | Off                               | T3 Connect stores webhook bodies up to 24 h.                                                                                                                         | Off.                                     |
| Publish agent activity      | Off                               | Mobile push and Live Activities without T3 Connect.                                                                                                                  | Off.                                     |
| Environments                | n/a                               | Add, order routes, drag-reorder, SSH, pairing codes.                                                                                                                 | Add the second machine here later.       |
| Load balancing              | Off (`loadBalancingEnabled`)      | Auto-picks a machine for new threads by CPU and memory; Prefer 100, Normal 50, Less often 25, Manual only 0. Device-local. Balances machines, not provider accounts. | Off.                                     |
| GitHub sharing              | Off                               | Per-environment Read PRs or Read and act.                                                                                                                            | Off.                                     |

---

## Archive

| Setting          | Default | What it does                                 | Recommend                                                           |
| ---------------- | ------- | -------------------------------------------- | ------------------------------------------------------------------- |
| Archived threads | n/a     | Per-project list; restore or delete threads. | Restore, never mass-delete. Deletion obeys the Delete confirmation. |

---

## Diagnostics

Route `settings/diagnostics`, linked from General > Diagnostics (`apps/web/src/components/settings/DiagnosticsSettings.tsx`).

| Setting           | Default | What it does                                                                          | Recommend                               |
| ----------------- | ------- | ------------------------------------------------------------------------------------- | --------------------------------------- |
| Live Processes    | n/a     | Process tree with signal actions.                                                     | Use to find runaway `claude` processes. |
| Resource History  | n/a     | CPU and memory history (`T3CODE_RESOURCE_MONITOR_PATH` overrides the monitor binary). | Check when the machine lags.            |
| Trace Diagnostics | n/a     | Latest failures, most common failures, slowest spans, span logs, top span names.      | Use before filing a bug.                |

---

## Usage and limits (separate page, not under Settings)

Opened from the sidebar or `Mod+U`. Cost, Tokens and Limits tabs (`docs/user/usage.md`).

| Setting                              | Default                                                                       | What it does                                                                                                          | Recommend                                      |
| ------------------------------------ | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Environment dropdown                 | All environments                                                              | Filters cost, tokens, limits.                                                                                         | All.                                           |
| Limits                               | Auto-check on open, at most one automatic check per 5 minutes per environment | Pools every subscription account per provider; one bar segment per account, ordered by 5-hour reset.                  | Keep open next to the thread list when on Pro. |
| Model prices (`usagePriceOverrides`) | Automatic pricing                                                             | Per-model USD per million tokens (input, output, optional cache read/write). Shared with clients of that environment. | Add prices for models without public rates.    |
| Map to (`usageModelAliases`)         | None                                                                          | Counts one model as another (preview slug to release name).                                                           | As needed.                                     |
| `/usage-limits` composer command     | n/a                                                                           | Shows current model limits inline; no agent run.                                                                      | Use before starting a long task.               |

---

## Environment variables and file-based config

### Paths on this machine (Windows)

Base dir is `%USERPROFILE%\.t3` unless `T3CODE_HOME` or `--base-dir` is set (`apps/server/src/os-jank.ts`, `apps/desktop/src/app/DesktopStatePaths.ts`). State dir is `userdata` (or `dev` for dev builds). Paths from `apps/server/src/config.ts` and `apps/desktop/src/app/DesktopEnvironment.ts`.

| File                      | Path                                                       | Purpose                                                                                   |
| ------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Server settings           | `%USERPROFILE%\.t3\userdata\settings.json`                 | All server-authoritative settings (`ServerSettings`). Defaults are stripped on write.     |
| Client settings (desktop) | `%USERPROFILE%\.t3\userdata\client-settings.json`          | Device-local settings (`ClientSettingsSchema`). Web builds use browser storage.           |
| Desktop settings          | `%USERPROFILE%\.t3\userdata\desktop-settings.json`         | Update channel, local environment toggle, exposure mode, Tailscale, WSL, window bounds.   |
| Keybindings               | `%USERPROFILE%\.t3\userdata\keybindings.json`              | JSON array of rules. Created with defaults; new defaults are merged in on later startups. |
| Saved environments        | `%USERPROFILE%\.t3\userdata\saved-environments.json`       | Paired remote environments.                                                               |
| Themes                    | `%USERPROFILE%\.t3\userdata\themes\`                       | Published environment themes; filename is the id.                                         |
| Database                  | `%USERPROFILE%\.t3\userdata\statev2.sqlite`                | Threads and projections.                                                                  |
| Logs / trace              | `%USERPROFILE%\.t3\userdata\logs\` (`server.trace.ndjson`) | Rotating logs.                                                                            |
| Secrets                   | `%USERPROFILE%\.t3\userdata\secrets\`                      | Server secret store (GitHub, Bitbucket tokens).                                           |
| Worktrees                 | `%USERPROFILE%\.t3\worktrees\`                             | Default worktree root (override in Storage).                                              |
| New projects              | `%USERPROFILE%\.t3\projects\`                              | "New project" repos (`docs/user/source-control.md`).                                      |

### keybindings.json

```json
[
  { "key": "mod+.", "command": "thread.stop", "when": "turnRunning && !terminalFocus" },
  { "key": "mod+alt+t", "command": "script.test.run" }
]
```

Key syntax: modifiers joined with `+` (`mod`, `cmd`/`meta`, `ctrl`/`control`, `alt`/`option`, `shift`). `when` uses `!`, `&&`, `||` and parentheses. Invalid rules are ignored; an unparseable file falls back to defaults (`docs/user/keybindings.md`).

### t3.json (repo root, per-project, checked in)

Schema: `https://t3.codes/schema/t3.json` (`packages/contracts/src/t3ProjectFile.ts`). Max 50 scripts. Example in this repo: `this repo\t3.json`.

| Key                                        | Default                                   | What it does                                                           | Recommend                                       |
| ------------------------------------------ | ----------------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------- |
| `iconPath`                                 | none                                      | Workspace-relative icon, checked before built-in locations.            | Set per repo.                                   |
| `defaultThreadEnvMode`                     | none (falls back to global, then `local`) | `worktree` or `local`. Project override beats it.                      | `worktree`.                                     |
| `worktreeSubmodules`                       | none (then `recursive`)                   | `recursive`, `top-level`, `none`.                                      | `top-level` for repos with big submodule trees. |
| `scripts[].name` / `command`               | required                                  | Label and shell command run in a T3 terminal at the project root.      | Keep commands cross-shell on Windows.           |
| `scripts[].icon`                           | `play`                                    | One of play, test, lint, configure, build, debug.                      | n/a                                             |
| `scripts[].runOnWorktreeCreate`            | false                                     | Runs after a worktree is created for a new thread.                     | Use for `pnpm i` or env copy.                   |
| `scripts[].async`                          | true                                      | Agent starts while setup still runs; false holds the agent until exit. | false if the agent needs installed deps.        |
| `scripts[].runOnSettle`                    | false                                     | Runs in the worktree each time the thread settles (cleanup).           | Use to delete build output.                     |
| `scripts[].previewUrl` / `autoOpenPreview` | none / false                              | Opens the in-app preview when the script runs (desktop).               | Dev servers.                                    |

Script runtime env: `T3CODE_PROJECT_ROOT` and `T3CODE_WORKTREE_PATH` (`packages/shared/src/projectScripts.ts`). Keybinding id for a script is `script.<id>.run` (id 24 chars max, `[a-z0-9-]`).

### T3CODE_* environment variables

Set as Windows user environment variables, then restart T3 Code. Sources: `apps/server/src/cli/config.ts`, `apps/desktop/src/app/DesktopConfig.ts`, and the files named inline.

| Variable                                                            | Default                                               | What it does                                                                                                                                    | Recommend                                              |
| ------------------------------------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `T3CODE_HOME`                                                       | `%USERPROFILE%\.t3`                                   | Base data dir (equals `--base-dir`).                                                                                                            | Leave, or move to `D:\t3-home` to save C: space.       |
| `T3CODE_MODE`                                                       | none (`web` or `desktop`)                             | Runtime mode.                                                                                                                                   | Leave.                                                 |
| `T3CODE_PORT`                                                       | 3773 for desktop; first free port from 3773 otherwise | Server port.                                                                                                                                    | Leave.                                                 |
| `T3CODE_HOST`                                                       | `127.0.0.1` in desktop mode                           | Bind interface.                                                                                                                                 | Leave.                                                 |
| `T3CODE_NO_BROWSER`                                                 | unset                                                 | Skip auto-opening a browser.                                                                                                                    | Set `true` for headless `t3 serve`.                    |
| `T3CODE_AUTO_BOOTSTRAP_PROJECT_FROM_CWD`                            | unset                                                 | Create a project for the CWD at startup.                                                                                                        | Leave.                                                 |
| `T3CODE_TAILSCALE_SERVE` / `T3CODE_TAILSCALE_SERVE_PORT`            | unset / 443                                           | Tailscale Serve exposure.                                                                                                                       | Use the UI toggle.                                     |
| `T3CODE_DEV_ALLOWED_ORIGINS`                                        | empty                                                 | Comma-separated extra origins (dev).                                                                                                            | Leave.                                                 |
| `T3CODE_DEV_AUTH_TOKEN`                                             | unset                                                 | 32+ char token, web mode with a dev URL only.                                                                                                   | Leave.                                                 |
| `T3CODE_LOG_LEVEL`                                                  | `Info`                                                | Server log level.                                                                                                                               | `Debug` when diagnosing.                               |
| `T3CODE_LOG_WS_EVENTS`                                              | unset                                                 | Logs outbound WebSocket pushes.                                                                                                                 | Debug only.                                            |
| `T3CODE_TRACE_FILE`                                                 | `logs\server.trace.ndjson` under the state dir        | Trace file path.                                                                                                                                | Leave.                                                 |
| `T3CODE_TRACE_MIN_LEVEL`                                            | `Info`                                                | Minimum traced level.                                                                                                                           | Leave.                                                 |
| `T3CODE_TRACE_TIMING_ENABLED`                                       | true                                                  | Span timing.                                                                                                                                    | Leave.                                                 |
| `T3CODE_TRACE_MAX_BYTES` / `T3CODE_TRACE_MAX_FILES`                 | 10 MiB / 10                                           | Trace rotation.                                                                                                                                 | Leave.                                                 |
| `T3CODE_TRACE_BATCH_WINDOW_MS`                                      | 1000                                                  | Trace write batching.                                                                                                                           | Leave.                                                 |
| `T3CODE_OTLP_TRACES_URL` / `_METRICS_URL` / `_LOGS_URL`             | unset                                                 | OTLP endpoints (also settable in settings `observability`).                                                                                     | Unset.                                                 |
| `T3CODE_OTLP_EXPORT_INTERVAL_MS`                                    | 10000                                                 | Export interval.                                                                                                                                | Leave.                                                 |
| `T3CODE_OTLP_HEADERS` / `T3CODE_OTLP_PROTOCOL`                      | unset / `http/json`                                   | Exporter headers and protocol.                                                                                                                  | Leave.                                                 |
| `T3CODE_OTEL_SDK_DISABLED`                                          | unset                                                 | Kill switch read before `OTEL_SDK_DISABLED` (`packages/shared/src/otelEnvironment.ts`).                                                         | Leave.                                                 |
| `T3CODE_TELEMETRY_ENABLED`                                          | true                                                  | PostHog product events. Forwarded into the WSL backend.                                                                                         | `false`.                                               |
| `T3CODE_TELEMETRY_FLUSH_BATCH_SIZE` / `_MAX_BUFFERED_EVENTS`        | 20 / 1000                                             | Telemetry batching.                                                                                                                             | Leave.                                                 |
| `T3CODE_DISABLE_AUTO_UPDATE`                                        | false                                                 | Disables the desktop updater entirely.                                                                                                          | Leave; updates are already manual.                     |
| `T3CODE_DESKTOP_LAN_HOST` / `T3CODE_DESKTOP_HTTPS_ENDPOINTS`        | unset                                                 | Override advertised LAN host and HTTPS endpoints for pairing.                                                                                   | Only for odd networks.                                 |
| `T3CODE_DESKTOP_APP_USER_MODEL_ID`                                  | `com.t3tools.t3code`                                  | Windows AppUserModelID override.                                                                                                                | Leave.                                                 |
| `T3CODE_COMMIT_HASH`                                                | build value                                           | Overrides reported commit.                                                                                                                      | Leave.                                                 |
| `T3CODE_CODEX_LAUNCH_ARGS`                                          | unset                                                 | Codex app-server args; overrides the Codex "Launch arguments" field.                                                                            | Leave.                                                 |
| `T3CODE_CONTEXT_HANDOFF_TOKEN_CAP`                                  | 16000 (clamped 1024 to 64000)                         | History allowance when switching providers mid-thread (`packages/provider-core/src/server/handoffBudget.ts`, `docs/user/portable-handoffs.md`). | Raise to 32000 if cross-account handoffs lose context. |
| `T3CODE_SERVER_BROWSER_SANDBOX`                                     | sandbox on                                            | `0` launches the server-hosted browser without a sandbox.                                                                                       | Leave.                                                 |
| `T3CODE_CLOUDFLARED_PATH`                                           | `PATH` lookup                                         | `cloudflared` binary for T3 Connect.                                                                                                            | Leave.                                                 |
| `T3CODE_RELAY_URL`                                                  | build value                                           | T3 Connect relay (must be HTTPS).                                                                                                               | Leave.                                                 |
| `T3CODE_RESOURCE_MONITOR_PATH`                                      | bundled                                               | Resource monitor binary.                                                                                                                        | Leave.                                                 |
| `T3CODE_CLI_PATH` / `T3CODE_INSTALL_BIN_DIR`                        | set by shim                                           | `t3` launcher location and update bin dir.                                                                                                      | Leave.                                                 |
| `T3CODE_BITBUCKET_ACCESS_TOKEN` or `_EMAIL` + `_API_TOKEN`          | unset                                                 | Bitbucket credentials fallback when none are saved.                                                                                             | Skip.                                                  |
| `T3CODE_BUNDLED_DEV`, `T3CODE_DESKTOP_MOCK_UPDATES`, `T3CODE_DEV_*` | dev only                                              | Contributor tooling.                                                                                                                            | Ignore.                                                |

Related non-T3 variables the app honours: `CLAUDE_CONFIG_DIR`, `CODEX_HOME`, `GROK_HOME` (account homes read by Usage), `OPENCODE_DATA_DIR`, `ANTIGRAVITY_DATA_DIR` (Usage history dirs, comma-separated), `GH_TOKEN` (GitHub), `ANTHROPIC_API_KEY` and `OPENAI_API_KEY` (forwarded into the WSL backend).

---

## Gaps vs Claude Code CLI

T3 Code drives `@anthropic-ai/claude-agent-sdk` 0.3.276 (`apps/server/package.json`) using the `claude_code` system-prompt preset and tool preset (`apps/server/src/orchestration-v2/Adapters/ClaudeAdapterV2.ts`, `buildClaudeAgentSdkQueryOptions`). The live session query does not pass `settingSources`; whether filesystem settings (hooks, CLAUDE.md, MCP) load by SDK default is unverified because `node_modules` is not installed at `this repo`. Only the capability probe sets `["user","project","local"]` explicitly (`apps/server/src/provider/ClaudeProvider.ts`). Test before relying on any "passes through" row: add a throwaway hook or CLAUDE.md line in the instance's config dir and see if a thread honours it.

| Capability                    | Verdict                                                             | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ----------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hooks                         | Passes through at best; no UI; unverified in live sessions          | No hook UI or setting exists. The probe sets `disableAllHooks: true` because it "must not run the user's hooks" (`ClaudeProvider.ts`), which implies normal sessions can. Antigravity profiles explicitly exclude hooks, MCP and rules (`docs/internals/providers.md`).                                                                                                                                                                                           |
| Skills                        | Exposed                                                             | `$` menu and optional `/` listing; scanned from config-dir `skills` and project `.claude/skills` (`apps/server/src/provider/Drivers/ClaudeSkills.ts`, `docs/user/providers-claude.md`, `docs/user/composer.md`). Setting: General > Show skills in slash menu.                                                                                                                                                                                                    |
| Slash commands                | Partly exposed                                                      | Claude commands are discovered via the probe (`slashCommands` in `ClaudeProvider.ts`) and must start the message; T3 adds its own: `/model`, `/plan`, `/compact`, `/goal`, `/usage-limits` (`docs/user/composer.md`, `docs/user/usage.md`). Interactive CLI-only commands (`/hooks`, `/permissions`, `/agents`, `/config`, `/memory`) have no T3 equivalent that I found.                                                                                         |
| Subagents                     | Visible, not controllable                                           | Adapter declares `supportsSubagents: true`, `exposesSubagentThreadIds: false`, `canWaitForSubagents: false`, `canCloseSubagents: false` (`ClaudeAdapterV2.ts`, capabilities block). Sidebar "Agents" follows delegated work; Stop on a parent stops children; children cannot take messages (`docs/user/thread-sidebar.md`). No custom-agent management UI.                                                                                                       |
| CLAUDE.md imports             | Lacks UI; passes through if SDK loads project settings (unverified) | No reference in `ClaudeAdapterV2.ts`; system prompt is preset plus T3 runtime instructions appended. Project and global memory files are not shown or edited in Settings.                                                                                                                                                                                                                                                                                         |
| MCP servers                   | Partly: T3 injects its own; user MCP unverified; no management UI   | Adapter passes `mcpServers` with the `t3-code` server and pre-approves `mcp__leonidas__*` (`ClaudeAdapterV2.ts`, `CLAUDE_T3_MCP_TOOL_WILDCARD`). Docs say to use "Restart agent session" after changing MCP servers (`docs/user/composer.md`), implying pass-through. `IntegrationsSettings.tsx` has no MCP section. T3 itself is an MCP server for outside agents (`docs/user/outside-agents.md`). Agent browser/device access is gated by Integrations toggles. |
| Statusline                    | Lacks                                                               | No `statusLine` handling anywhere in `apps/` or `packages/`. Substitutes: legacy Context window indicator, Usage page, thread status line (`apps/web/src/components/chat/ThreadStatusLine.tsx`).                                                                                                                                                                                                                                                                  |
| Permission modes              | Exposed, with a bypass                                              | Four UI modes map to SDK modes `default`, `acceptEdits`, `auto`, `bypassPermissions`, plus `plan` and `dontAsk` internally (`permissionModeForClaudeRuntimePolicy`, `ClaudeAdapterV2.ts`). Default is Full access. Launch arguments `--permission-mode` and `--dangerously-skip-permissions` silently override the UI (`buildClaudeAgentSdkQueryOptions`). Plan mode UI is a legacy beta toggle.                                                                  |
| Scheduled tasks               | Own implementation, not Claude's                                    | Native scheduler: interval (min 1 min), fixed time, webhook, per-task project/model/workspace (`packages/contracts/src/scheduledTask.ts`). Runs only while the T3 environment is up. Not the CLI's `/schedule` or cloud routines.                                                                                                                                                                                                                                 |
| Plugins                       | Unverified                                                          | `docs/user/composer.md` mentions plugins in the restart note; no plugin UI found.                                                                                                                                                                                                                                                                                                                                                                                 |
| Compaction                    | Exposed                                                             | Auto-compact field, `/compact`, context meter, "Compact" chip after 1 h idle (`docs/user/providers-claude.md`).                                                                                                                                                                                                                                                                                                                                                   |
| Checkpoint/rewind             | Exposed                                                             | "Edit from here" with Revert and keep changes or Revert files too; worktree threads only for file restore (`docs/user/composer.md`).                                                                                                                                                                                                                                                                                                                              |
| Effort / thinking / fast mode | Exposed                                                             | Model options compiled in `apps/server/src/claudeModelOptions.ts`; thinking summaries forced on via `thinking-display` unless omitted in launch args.                                                                                                                                                                                                                                                                                                             |
| Goals (`/goal`)               | Exposed                                                             | Codex and Claude (`docs/user/composer.md`).                                                                                                                                                                                                                                                                                                                                                                                                                       |

## Surprising findings

1. **Launch arguments beat the permission picker.** `--permission-mode` or `--dangerously-skip-permissions` in a Claude instance's Launch arguments override whatever the composer shows.
2. **Updates are fully manual and defaults are permissive.** The desktop updater polls every 4 minutes but has auto-download and install-on-quit off, while new threads default to Full access and telemetry defaults on.
3. **Account switching is not free.** Threads move only between Claude instances sharing a config dir, so two Pro accounts mean new threads at a limit, and Load balancing spreads machines, not accounts.
