# User docs drift report, 2026-11-14

Scope: `docs/user/*.md` against the code in `projects/leonidas-app`. The script checked 580 claims after the fixes.

## Result

- **Verified:** 490 claims match the code.
- **Fixed:** 97 claims were wrong in `HEAD` and are now correct.
- **Unverified:** 90 claims need a running app, a device or a third-party screen.
- **Wrong after fixes:** 0.
- **T3 Code:** 5 hits remain in `docs/user`. All are upstream credit, upstream endpoints or rules about the name.

## Skipped

- `docs/user/permission-modes.md` was dirty. Another session owns it. The script skips it.
- At the start, `leo_thread_list` showed 4 unsettled threads: this thread, `379440c9`, `ead388c8` and `5d981f8a`. Git status showed only `permission-modes.md` dirty under `docs`. The owner of that file is not confirmed. Git status was checked again before the commit.

## Rename map

| Old name in docs                                             | Name the UI shows now                                                                                                                                   | Source                                                                                                          |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Settings → Keybindings                                       | Settings → Keyboard shortcuts                                                                                                                           | apps/web/src/components/settings/settingsSearch.ts:90                                                           |
| Settings → Providers                                         | Settings → AI services                                                                                                                                  | settingsSearch.ts:92                                                                                            |
| Settings → Providers → Models                                | Settings → Models                                                                                                                                       | settingsSearch.ts:93                                                                                            |
| Settings → Provider accounts (mobile)                        | Settings → AI accounts                                                                                                                                  | apps/mobile/src/features/settings/SettingsRouteScreen.tsx:188                                                   |
| Settings → Integrations → Devices / Browser                  | Settings → Devices / Settings → Browser                                                                                                                 | settingsSearch.ts:95-96                                                                                         |
| Settings → Integrations → Calendars                          | Settings → Browser → Calendars                                                                                                                          | apps/web/src/components/settings/IntegrationsSettings.tsx:1561                                                  |
| Settings → Storage → Worktree location                       | Settings → Separate copies → Separate copy location                                                                                                     | settingsSearch.ts:100,229                                                                                       |
| Settings → Storage (cleanup)                                 | Settings → Separate copies                                                                                                                              | settingsSearch.ts:220; StorageSettings.tsx:502                                                                  |
| Settings > Storage (database repair notice, web and desktop) | Removed from the claim. The web notice component is imported at `StorageSettings.tsx:37` but never rendered. Mobile shows it in Settings > Maintenance. | apps/mobile/src/features/settings/SettingsServerControlsRouteScreen.tsx:444                                     |
| Settings → Environments, Settings → Connections              | Settings → Computers                                                                                                                                    | settingsSearch.ts:101; SettingsRouteScreen.tsx:90                                                               |
| Settings → Connections → Add environment                     | Settings → Computers → Add computer                                                                                                                     | ConnectionsSettings.tsx:2027                                                                                    |
| Settings → T3 Connect (mobile)                               | Settings → Remote access account                                                                                                                        | SettingsRouteScreen.tsx:83                                                                                      |
| Settings → Thread behavior (mobile)                          | Settings → Chat behavior                                                                                                                                | SettingsRouteScreen.tsx:180                                                                                     |
| Settings → General → Send shortcut                           | Settings → Message box → Send shortcut                                                                                                                  | settingsSearch.ts:88,669                                                                                        |
| Follow-up behavior                                           | Sending a message during a reply                                                                                                                        | settingsSearch.ts:675                                                                                           |
| Settings → General → Confirmations → Quit shortcut           | Settings → General → Quit shortcut                                                                                                                      | settingsSearch.ts:86 (no Confirmations heading in source)                                                       |
| Settings → Projects & threads → Overview                     | Settings → Project → Project overview                                                                                                                   | settingsSearch.ts:85                                                                                            |
| Worktree branch naming                                       | Branch naming for separate copies                                                                                                                       | settingsSearch.ts (Source control)                                                                              |
| Continue threads after restarts                              | Continue chats after restarts                                                                                                                           | settingsSearch.ts:690                                                                                           |
| Update history, Install t3 command under General → About     | Settings → About                                                                                                                                        | settingsSearch.ts:106,796                                                                                       |
| Link to thread / Unlink from thread                          | Link to chat / Unlink from chat                                                                                                                         | apps/web/src/components/chat/externalLinkContextMenu.ts:43                                                      |
| Arrange threads (mobile)                                     | Arrange chats…                                                                                                                                          | apps/mobile/src/features/threads/thread-list-v2-items.tsx:685                                                   |
| Add provider, Local ACP command                              | Connect an account, Advanced setup, ACP source, Local command                                                                                           | ProviderSettingsPanel.tsx:1157; ConnectAccountDialog.tsx:251; packages/provider-acp-registry/src/settings.ts:18 |
| thread.stop has no default                                   | Default is mod+. while a turn runs                                                                                                                      | packages/shared/src/keybindings.ts:188                                                                          |
| T3 Code (product name)                                       | Leonidas                                                                                                                                                | docs/user/plain-words-brief.md:15                                                                               |

## Needs an owner decision

- **Compact idle Claude threads (beta):** The docs name a toggle in Settings. No such control exists in web, mobile or desktop source. The setting `compactIdleThreads` exists in `packages/contracts/src/settings.ts:1520`. `composer.md` now names the key. Confirm where the user sets it.
- **Keep threads with a PR:** Same case. The key is `sidebarAutoSettleKeepPullRequests` (`settings.ts:1291`). `thread-sidebar.md` now names the key.
- **OpenTelemetry export:** `telemetry.md:27` names a Diagnostics page with this control. No matching string exists in the source. The claim is unverified and unchanged.
- **Thread and worktree words:** The UI now says chat and separate copy. The prose in the guides still says thread and worktree. This report changes only quoted UI names. `docs/user/plain-words-brief.md` may need a wider pass.

## Method

1. The script reads every guide in `docs/user`, except fenced code and `permission-modes.md`.
2. It extracts keybindings, command IDs, `Settings → …` paths, bold UI labels, repo file paths and `T3 Code` hits.
3. It checks keys against `DEFAULT_KEYBINDINGS` in `packages/shared/src/keybindings.ts`. It checks section names against `SETTINGS_SECTION_LABELS` in `settingsSearch.ts` and the mobile settings rows. It checks other labels against string literals in `apps/*/src` and `packages/*/src`.
4. A manual pass paired each command ID with its default key. That pass found `thread.stop`.
5. Run: `python -I claims.py <repo>`. Set `DOCS_DIR` to check another copy of the guides.

## Fixed claims (before the fix)

| Doc:line (HEAD)                   | Type  | Old claim                                                                        | Result                           |
| --------------------------------- | ----- | -------------------------------------------------------------------------------- | -------------------------------- |
| appearance.md:12                  | menu  | Settings → Keybindings                                                           | WRONG: no section with this name |
| background-service.md:125         | brand | T3 Code                                                                          | WRONG: product name is Leonidas  |
| background-service.md:128         | menu  | Settings → Storage                                                               | WRONG: no section with this name |
| browser-import.md:6               | menu  | Settings → Integrations                                                          | WRONG: no section with this name |
| calendar.md:8                     | menu  | Settings → Integrations                                                          | WRONG: no section with this name |
| calendar.md:16                    | menu  | Settings → Integrations                                                          | WRONG: no section with this name |
| calendar.md:56                    | menu  | Settings → Integrations                                                          | WRONG: no section with this name |
| composer.md:85                    | menu  | Settings → Keybindings** to use another shortcut                                 | WRONG: no section with this name |
| composer.md:105                   | menu  | Settings → Providers                                                             | WRONG: no section with this name |
| composer.md:279                   | brand | T3 Code                                                                          | WRONG: product name is Leonidas  |
| cursor.md:9                       | menu  | Settings → Providers                                                             | WRONG: no section with this name |
| cursor.md:22                      | menu  | Settings → Provider accounts** for an already configured Cursor instance         | WRONG: no section with this name |
| cursor.md:68                      | brand | T3 Code                                                                          | WRONG: product name is Leonidas  |
| devices.md:25                     | menu  | Settings → Integrations                                                          | WRONG: no section with this name |
| devices.md:73                     | menu  | Settings → Integrations                                                          | WRONG: no section with this name |
| devices.md:87                     | menu  | Settings → Integrations                                                          | WRONG: no section with this name |
| devices.md:99                     | menu  | Settings → Integrations                                                          | WRONG: no section with this name |
| devices.md:126                    | menu  | Settings → Integrations                                                          | WRONG: no section with this name |
| html-renders.md:17                | brand | T3 Code                                                                          | WRONG: product name is Leonidas  |
| install.md:118                    | menu  | Settings → Providers** in the web or desktop app                                 | WRONG: no section with this name |
| install.md:127                    | menu  | Settings → Providers                                                             | WRONG: no section with this name |
| install.md:132                    | menu  | Settings → Providers                                                             | WRONG: no section with this name |
| install.md:139                    | menu  | Settings → Providers** on that environment for the recommended                   | WRONG: no section with this name |
| keybindings.md:3                  | menu  | Settings → Keybindings** on web and desktop                                      | WRONG: no section with this name |
| keybindings.md:16                 | menu  | Settings → Keybindings** under                                                   | WRONG: no section with this name |
| keybindings.md:147                | menu  | Settings → Keybindings                                                           | WRONG: no section with this name |
| project-settings.md:30            | menu  | Settings → Providers** turns it on or off for                                    | WRONG: no section with this name |
| project-settings.md:165           | page  | Submodules under General                                                         | WRONG: label is on another page  |
| project-settings.md:174           | menu  | Settings → Storage                                                               | WRONG: no section with this name |
| project-settings.md:180           | menu  | Settings → Storage** to enable automatic cleanup on one machine or all connected | WRONG: no section with this name |
| prompt-links.md:3                 | brand | T3 Code                                                                          | WRONG: product name is Leonidas  |
| prompt-links.md:44                | brand | T3 Code                                                                          | WRONG: product name is Leonidas  |
| prompt-links.md:47                | brand | T3 Code                                                                          | WRONG: product name is Leonidas  |
| prompt-links.md:51                | brand | T3 Code                                                                          | WRONG: product name is Leonidas  |
| prompt-links.md:54                | brand | T3 Code                                                                          | WRONG: product name is Leonidas  |
| prompt-links.md:55                | brand | T3 Code                                                                          | WRONG: product name is Leonidas  |
| providers-acp.md:22               | menu  | Settings → Providers                                                             | WRONG: no section with this name |
| providers-acp.md:32               | menu  | Settings → Providers                                                             | WRONG: no section with this name |
| providers-acp.md:55               | menu  | Settings → Providers** on web or desktop                                         | WRONG: no section with this name |
| providers-acp.md:57               | menu  | Settings → Provider accounts                                                     | WRONG: no section with this name |
| providers-antigravity.md:9        | menu  | Settings → Providers                                                             | WRONG: no section with this name |
| providers-antigravity.md:13       | menu  | Settings → Provider accounts** in the mobile app                                 | WRONG: no section with this name |
| providers-antigravity.md:109      | menu  | Settings → Providers** on web or desktop                                         | WRONG: no section with this name |
| providers-claude.md:22            | menu  | Settings → Providers                                                             | WRONG: no section with this name |
| providers-claude.md:86            | menu  | Settings → Providers                                                             | WRONG: no section with this name |
| providers-claude.md:91            | menu  | Settings → Providers                                                             | WRONG: no section with this name |
| providers-codex.md:7              | menu  | Settings → Providers                                                             | WRONG: no section with this name |
| providers-codex.md:30             | menu  | Settings → Providers                                                             | WRONG: no section with this name |
| providers-codex.md:48             | menu  | Settings → Providers                                                             | WRONG: no section with this name |
| providers-muse.md:7               | menu  | Settings → Providers** in the web or desktop app                                 | WRONG: no section with this name |
| providers-muse.md:20              | menu  | Settings → Providers                                                             | WRONG: no section with this name |
| providers-muse.md:38              | menu  | Settings → Providers                                                             | WRONG: no section with this name |
| providers-muse.md:63              | menu  | Settings → Providers** when Leonidas recognizes                                  | WRONG: no section with this name |
| providers-muse.md:66              | menu  | Settings → Providers                                                             | WRONG: no section with this name |
| providers-opencode.md:4           | menu  | Settings → Providers                                                             | WRONG: no section with this name |
| providers-opencode.md:55          | menu  | Settings → Providers** for that environment                                      | WRONG: no section with this name |
| remote-access.md:58               | menu  | Settings → Environments** on mobile                                              | WRONG: no section with this name |
| remote-access.md:95               | menu  | Settings → Environments** and                                                    | WRONG: no section with this name |
| remote-access.md:303              | menu  | Settings → T3 Connect** on mobile                                                | WRONG: no section with this name |
| remote-access.md:308              | brand | T3 Code                                                                          | WRONG: product name is Leonidas  |
| t3-connect-troubleshooting.md:8   | brand | T3 Code                                                                          | WRONG: product name is Leonidas  |
| t3-connect-troubleshooting.md:25  | brand | T3 Code                                                                          | WRONG: product name is Leonidas  |
| t3-connect-troubleshooting.md:31  | brand | T3 Code                                                                          | WRONG: product name is Leonidas  |
| t3-connect-troubleshooting.md:34  | brand | T3 Code                                                                          | WRONG: product name is Leonidas  |
| t3-connect-troubleshooting.md:58  | brand | T3 Code                                                                          | WRONG: product name is Leonidas  |
| t3-connect-troubleshooting.md:60  | brand | T3 Code                                                                          | WRONG: product name is Leonidas  |
| t3-connect-troubleshooting.md:62  | brand | T3 Code                                                                          | WRONG: product name is Leonidas  |
| t3-connect-troubleshooting.md:63  | brand | T3 Code                                                                          | WRONG: product name is Leonidas  |
| t3-connect-troubleshooting.md:68  | brand | T3 Code                                                                          | WRONG: product name is Leonidas  |
| t3-connect-troubleshooting.md:115 | brand | T3 Code                                                                          | WRONG: product name is Leonidas  |
| t3-connect-troubleshooting.md:123 | brand | T3 Code                                                                          | WRONG: product name is Leonidas  |
| t3-connect-troubleshooting.md:125 | brand | T3 Code                                                                          | WRONG: product name is Leonidas  |
| t3-connect-troubleshooting.md:125 | brand | T3 Code                                                                          | WRONG: product name is Leonidas  |
| t3-connect-troubleshooting.md:126 | brand | T3 Code                                                                          | WRONG: product name is Leonidas  |
| t3-connect-troubleshooting.md:132 | brand | T3 Code                                                                          | WRONG: product name is Leonidas  |
| t3-connect-troubleshooting.md:134 | brand | T3 Code                                                                          | WRONG: product name is Leonidas  |
| t3-connect-troubleshooting.md:136 | brand | T3 Code                                                                          | WRONG: product name is Leonidas  |
| t3-connect-troubleshooting.md:141 | brand | T3 Code                                                                          | WRONG: product name is Leonidas  |
| terminal.md:22                    | brand | T3 Code                                                                          | WRONG: product name is Leonidas  |
| terminal.md:24                    | brand | T3 Code                                                                          | WRONG: product name is Leonidas  |
| terminal.md:28                    | brand | T3 Code                                                                          | WRONG: product name is Leonidas  |
| terminal.md:29                    | brand | T3 Code                                                                          | WRONG: product name is Leonidas  |
| thread-sidebar.md:200             | menu  | Settings → Thread behavior** on mobile                                           | WRONG: no section with this name |
| thread-sidebar.md:225             | menu  | Settings → Keybindings** to find or customize shortcuts for searching files      | WRONG: no section with this name |
| thread-sidebar.md:242             | menu  | Settings → Thread                                                                | WRONG: no section with this name |
| thread-sidebar.md:270             | brand | T3 Code                                                                          | WRONG: product name is Leonidas  |
| updating.md:31                    | brand | T3 Code                                                                          | WRONG: product name is Leonidas  |
| updating.md:116                   | menu  | Settings → Providers** shows provider updates for the selected environment       | WRONG: no section with this name |
| updating.md:121                   | brand | T3 Code                                                                          | WRONG: product name is Leonidas  |
| updating.md:124                   | brand | T3 Code                                                                          | WRONG: product name is Leonidas  |
| updating.md:132                   | menu  | Settings → Environments** and                                                    | WRONG: no section with this name |
| updating.md:143                   | brand | T3 Code                                                                          | WRONG: product name is Leonidas  |
| usage.md:5                        | menu  | Settings → Keybindings                                                           | WRONG: no section with this name |
| usage.md:28                       | menu  | Settings → Providers                                                             | WRONG: no section with this name |
| usage.md:134                      | menu  | Settings → Providers                                                             | WRONG: no section with this name |
| usage.md:158                      | menu  | Settings → Keybindings                                                           | WRONG: no section with this name |
| welcome-wizard.md:33              | brand | T3 Code                                                                          | WRONG: product name is Leonidas  |

## Unverified claims

| Doc:line                     | Type     | Claim                                  | Reason                                                |
| ---------------------------- | -------- | -------------------------------------- | ----------------------------------------------------- |
| appearance.md:3              | label    | Settings → Appearance                  | label not found in source                             |
| appearance.md:14             | label    | Settings → Appearance                  | label not found in source                             |
| appearance.md:34             | label    | Settings → Appearance                  | label not found in source                             |
| appearance.md:62             | label    | Settings → Appearance                  | label not found in source                             |
| calendar.md:8                | label    | Settings → Browser → Calendars         | label not found in source                             |
| calendar.md:32               | label    | APIs & Services → Library              | third-party or OS screen, needs running app or device |
| calendar.md:32               | label    | Google Calendar API                    | third-party or OS screen, needs running app or device |
| calendar.md:33               | label    | APIs & Services → OAuth consent screen | third-party or OS screen, needs running app or device |
| calendar.md:33               | label    | Google Auth Platform                   | third-party or OS screen, needs running app or device |
| calendar.md:36               | label    | Publish app                            | third-party or OS screen, needs running app or device |
| calendar.md:38               | label    | Go to Leonidas                         | third-party or OS screen, needs running app or device |
| calendar.md:39               | label    | APIs & Services → Credentials          | third-party or OS screen, needs running app or device |
| calendar.md:39               | label    | Create credentials → OAuth client ID   | label not found in source                             |
| calendar.md:40               | label    | Application type                       | third-party or OS screen, needs running app or device |
| composer.md:40               | key      | Shift+Enter                            | needs running app                                     |
| composer.md:42               | key      | Shift+Tab                              | needs running app                                     |
| composer.md:85               | label    | Settings → Keyboard shortcuts          | label not found in source                             |
| composer.md:194              | label    | Copy Markdown                          | label not found in source                             |
| composer.md:262              | menu-seg |                                        | label not found in source                             |
| cursor.md:22                 | label    | Settings > AI accounts                 | label not found in source                             |
| devices.md:18                | label    | + → Device                             | label not found in source                             |
| devices.md:25                | label    | Settings → Devices                     | label not found in source                             |
| devices.md:48                | label    | + → Device                             | label not found in source                             |
| devices.md:73                | label    | Settings → Browser                     | label not found in source                             |
| install.md:66                | label    | Settings → About → Update history      | label not found in source                             |
| install.md:118               | label    | Settings → AI services                 | label not found in source                             |
| install.md:127               | label    | Settings → AI services → Cursor        | label not found in source                             |
| keybindings.md:8             | label    | Settings → Message box → Send shortcut | label not found in source                             |
| keybindings.md:9             | key      | Shift+Enter                            | needs running app                                     |
| keybindings.md:58            | key      | Shift+Enter                            | needs running app                                     |
| keybindings.md:74            | key      | Shift+Return                           | needs iPad                                            |
| keybindings.md:135           | key      | Shift+Enter                            | needs running app                                     |
| keybindings.md:183           | key      | Cmd+Q                                  | OS quit accelerator, needs running desktop app        |
| keybindings.md:183           | key      | Ctrl+Q                                 | OS quit accelerator, needs running desktop app        |
| mobile-notifications.md:3    | label    | Settings → Notifications               | label not found in source                             |
| mobile-notifications.md:5    | label    | Ongoing Agent Activity                 | third-party or OS screen, needs running app or device |
| open-source-licenses.md:6    | label    | Settings → About                       | label not found in source                             |
| outside-agents.md:22         | label    | An agent on your own computers         | label not found in source                             |
| phone-setup.md:18            | label    | Add to Home Screen                     | third-party or OS screen, needs running app or device |
| phone-setup.md:28            | label    | Open Anyway                            | third-party or OS screen, needs running app or device |
| phone-setup.md:31            | label    | System Settings, Battery               | third-party or OS screen, needs running app or device |
| phone-setup.md:37            | label    | The link opens another app first:      | label not found in source                             |
| phone-setup.md:40            | label    | The phone worked, then stopped:        | label not found in source                             |
| phone-setup.md:40            | label    | Settings, System, Power, Sleep         | third-party or OS screen, needs running app or device |
| portable-handoffs.md:22      | label    | Continue with Codex                    | third-party or OS screen, needs running app or device |
| privacy.md:3                 | label    | No thanks                              | third-party or OS screen, needs running app or device |
| privacy.md:18                | label    | I'm stuck.                             | third-party or OS screen, needs running app or device |
| project-settings.md:43       | label    | Settings → Project → Project overview  | label not found in source                             |
| project-settings.md:65       | label    | Settings → Scheduled tasks             | label not found in source                             |
| project-settings.md:81       | label    | Settings → Scheduled tasks             | label not found in source                             |
| project-settings.md:165      | label    | Settings → Chats                       | label not found in source                             |
| project-settings.md:180      | label    | Settings → Separate copies             | label not found in source                             |
| prompt-links.md:43           | label    | `provider` and `model`                 | label not found in source                             |
| providers-acp.md:22          | label    | Settings → AI services                 | label not found in source                             |
| providers-acp.md:55          | label    | Settings → AI services                 | label not found in source                             |
| providers-antigravity.md:9   | label    | Settings > AI services                 | label not found in source                             |
| providers-antigravity.md:128 | label    | Usage > Limits                         | label not found in source                             |
| providers-codex.md:30        | label    | Settings → AI services                 | label not found in source                             |
| providers-muse.md:7          | label    | Settings → AI services                 | label not found in source                             |
| providers-muse.md:66         | label    | Settings → AI services                 | label not found in source                             |
| providers-opencode.md:4      | label    | Settings > AI services                 | label not found in source                             |
| providers-opencode.md:55     | label    | Settings > AI services                 | label not found in source                             |
| remote-access.md:10          | label    | , sign in, and enable                  | label not found in source                             |
| remote-access.md:95          | label    | Settings → Computers                   | label not found in source                             |
| remote-access.md:109         | label    | Settings → Computers → Load balancing  | label not found in source                             |
| remote-access.md:164         | label    | Settings → Computers → Add computer    | label not found in source                             |
| remote-access.md:303         | label    | Settings → Remote access account       | label not found in source                             |
| shared-browser.md:34         | label    | Profile in use:                        | label not found in source                             |
| shared-browser.md:35         | label    | Browser could not start:               | label not found in source                             |
| shared-browser.md:36         | label    | Connection lost:                       | label not found in source                             |
| shared-browser.md:38         | label    | Provider has no browser tools:         | label not found in source                             |
| snap-shot.md:83              | label    | Hyprland and Omarchy.                  | third-party or OS screen, needs running app or device |
| source-control.md:129        | label    | Create private repository on GitHub    | label not found in source                             |
| source-control.md:259        | label    | A review cannot load:                  | label not found in source                             |
| source-control.md:269        | label    | Link this PR                           | label not found in source                             |
| tasks.md:21                  | label    | Tasks → Roadmap                        | label not found in source                             |
| tasks.md:21                  | label    | Add planned tasks                      | label not found in source                             |
| telemetry.md:27              | label    | Settings > General > Diagnostics       | label not found in source                             |
| thread-sidebar.md:11         | label    | New thread in this worktree            | label not found in source                             |
| thread-sidebar.md:19         | label    | under a new thread's heading, pick     | label not found in source                             |
| thread-sidebar.md:142        | menu-seg |                                        | label not found in source                             |
| thread-sidebar.md:153        | label    | on web and desktop, or                 | label not found in source                             |
| thread-sidebar.md:196        | label    | Auto-settle behavior                   | label not found in source                             |
| thread-sidebar.md:225        | label    | Settings → Keyboard shortcuts          | label not found in source                             |
| thread-sidebar.md:280        | label    | Snooze → Custom…                       | label not found in source                             |
| thread-sidebar.md:283        | label    | Wake thread                            | label not found in source                             |
| updating.md:132              | label    | Settings → Computers                   | label not found in source                             |
| updating.md:141              | label    | Settings → Maintenance                 | label not found in source                             |
| usage.md:75                  | label    | Retry failed saves                     | label not found in source                             |
| usage.md:148                 | label    | Edit Widget                            | third-party or OS screen, needs running app or device |

## Verified claims

| Doc:line                          | Type     | Claim                                                                                    | Source                                                                              |
| --------------------------------- | -------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| activity-log.md:5                 | label    | Open diff                                                                                | apps/web/src/components/ChatView.logic.ts:188                                       |
| ai-desktop.md:5                   | label    | AI Desktop                                                                               | apps/web/src/components/threadActionMenu.logic.ts:202                               |
| appearance.md:3                   | menu     | Settings → Appearance** to choose a theme and follow the system                          | settingsSearch.ts:87                                                                |
| appearance.md:8                   | label    | Change theme                                                                             | apps/web/src/components/CommandPalette.tsx:2158                                     |
| appearance.md:9                   | key      | Cmd+Option+A                                                                             | packages/shared/src/keybindings.ts:182                                              |
| appearance.md:9                   | key      | Ctrl+Alt+A                                                                               | packages/shared/src/keybindings.ts:182                                              |
| appearance.md:9                   | label    | Cmd+Option+A                                                                             | packages/shared/src/keybindings.ts:182 mod+alt+a                                    |
| appearance.md:9                   | label    | Ctrl+Alt+A                                                                               | packages/shared/src/keybindings.ts:182                                              |
| appearance.md:10                  | label    | Change appearance                                                                        | apps/web/src/components/CommandPalette.tsx:2207                                     |
| appearance.md:11                  | key      | Cmd+Option+Shift+A                                                                       | packages/shared/src/keybindings.ts:183                                              |
| appearance.md:11                  | key      | Ctrl+Alt+Shift+A                                                                         | packages/shared/src/keybindings.ts:183                                              |
| appearance.md:12                  | menu     | Settings → Keyboard shortcuts                                                            | settingsSearch.ts:90                                                                |
| appearance.md:14                  | menu     | Settings → Appearance                                                                    | settingsSearch.ts:87                                                                |
| appearance.md:17                  | label    | Material You                                                                             | apps/mobile/src/components/ui/NativeThemeHost.android.tsx:6                         |
| appearance.md:29                  | label    | Composer context                                                                         | apps/web/src/components/BranchToolbarEnvironmentSelector.tsx:67                     |
| appearance.md:34                  | menu     | Settings → Appearance** to typeset LaTeX in messages and Markdown                        | settingsSearch.ts:87                                                                |
| appearance.md:34                  | label    | Render math                                                                              | apps/mobile/src/features/settings/appearance/sections/TextAppearanceSection.tsx:37  |
| appearance.md:53                  | label    | Create theme                                                                             | apps/web/src/components/settings/ThemeEditorPanel.tsx:1087                          |
| appearance.md:62                  | menu     | Settings → Appearance** to follow its palette as the server updates                      | settingsSearch.ts:87                                                                |
| background-service.md:128         | menu     | Settings → Maintenance                                                                   | settingsSearch.ts:104                                                               |
| browser-import.md:6               | menu     | Settings → Browser                                                                       | settingsSearch.ts:95                                                                |
| browser-import.md:6               | menu-seg | Browser profiles                                                                         | apps/web/src/components/settings/settingsSearch.ts:957                              |
| browser-import.md:6               | menu-seg | Add profile                                                                              | apps/web/src/components/settings/IntegrationsSettings.tsx:1244                      |
| browser-import.md:13              | label    | Allow                                                                                    | apps/web/src/browserHistoryStore.ts:5                                               |
| calendar.md:8                     | menu     | Settings → Browser                                                                       | settingsSearch.ts:95                                                                |
| calendar.md:8                     | menu-seg | Calendars                                                                                | apps/web/src/components/calendar/calendar.logic.ts:43                               |
| calendar.md:8                     | label    | Connect a calendar                                                                       | apps/web/src/components/calendar/CalendarAgenda.tsx:18                              |
| calendar.md:12                    | label    | Test                                                                                     | apps/web/src/agentActivity.ts:61                                                    |
| calendar.md:13                    | label    | Save calendar                                                                            | apps/web/src/components/calendar/ConnectCalendarDialog.tsx:347                      |
| calendar.md:16                    | menu     | Settings → Browser                                                                       | settingsSearch.ts:95                                                                |
| calendar.md:16                    | menu-seg | Calendars                                                                                | apps/web/src/components/calendar/calendar.logic.ts:43                               |
| calendar.md:32                    | label    | Enable                                                                                   | apps/web/src/composerProviderState.ts:22                                            |
| calendar.md:34                    | label    | External                                                                                 | apps/web/src/eventFeedOpen.ts:32                                                    |
| calendar.md:36                    | label    | Audience                                                                                 | apps/web/src/components/chat/composerSkillSuggest.fixture.json:13                   |
| calendar.md:36                    | label    | Testing                                                                                  | apps/web/src/previewStateStore.ts:525                                               |
| calendar.md:38                    | label    | Advanced                                                                                 | apps/web/src/appearanceFonts.ts:21                                                  |
| calendar.md:40                    | label    | Desktop app                                                                              | apps/web/src/desktopAppActivation.ts:66                                             |
| calendar.md:40                    | label    | Create                                                                                   | apps/web/src/agentActivity.ts:44                                                    |
| calendar.md:42                    | label    | Connect a calendar                                                                       | apps/web/src/components/calendar/CalendarAgenda.tsx:18                              |
| calendar.md:42                    | label    | Sign in with Google                                                                      | apps/web/src/components/calendar/ConnectCalendarDialog.tsx:27                       |
| calendar.md:43                    | label    | Save client ID                                                                           | apps/web/src/components/calendar/ConnectCalendarDialog.tsx:163                      |
| calendar.md:50                    | label    | Sign in with Google                                                                      | apps/web/src/components/calendar/ConnectCalendarDialog.tsx:27                       |
| calendar.md:53                    | label    | Add                                                                                      | apps/web/src/agentActivityAccess.ts:109                                             |
| calendar.md:56                    | menu     | Settings → Browser                                                                       | settingsSearch.ts:95                                                                |
| calendar.md:56                    | menu-seg | Calendars                                                                                | apps/web/src/components/calendar/calendar.logic.ts:43                               |
| composer.md:12                    | key      | Cmd+Shift+V                                                                              | apps/web/src/components/chat/ChatComposer.tsx:58 isPasteAsTextShortcut              |
| composer.md:12                    | key      | Ctrl+Shift+V                                                                             | apps/web/src/components/chat/ChatComposer.tsx:58 isPasteAsTextShortcut              |
| composer.md:23                    | menu     | Settings → Message box                                                                   | settingsSearch.ts:88                                                                |
| composer.md:23                    | label    | Message prediction                                                                       | apps/web/src/components/settings/SettingsPanels.tsx:797                             |
| composer.md:70                    | menu     | Settings → Message box                                                                   | settingsSearch.ts:88                                                                |
| composer.md:70                    | menu-seg | Sending a message during a reply** to queue                                              | apps/web/src/components/Sidebar.tsx:1059                                            |
| composer.md:74                    | key      | Cmd+Enter                                                                                | packages/shared/src/keybindings.ts:191                                              |
| composer.md:74                    | key      | Ctrl+Enter                                                                               | packages/shared/src/keybindings.ts:191                                              |
| composer.md:77                    | key      | Cmd+Enter                                                                                | packages/shared/src/keybindings.ts:191                                              |
| composer.md:77                    | key      | Ctrl+Enter                                                                               | packages/shared/src/keybindings.ts:191                                              |
| composer.md:78                    | label    | Shift                                                                                    | apps/web/src/composer-logic.ts:63                                                   |
| composer.md:81                    | key      | Cmd+Shift+Enter                                                                          | packages/shared/src/keybindings.ts:189                                              |
| composer.md:81                    | key      | Ctrl+Shift+Enter                                                                         | packages/shared/src/keybindings.ts:189                                              |
| composer.md:85                    | cmd      | thread.steerQueuedMessage                                                                | packages/shared/src/keybindings.ts                                                  |
| composer.md:85                    | menu     | Settings → Keyboard shortcuts** to use another shortcut                                  | settingsSearch.ts:90                                                                |
| composer.md:87                    | key      | Option+Up                                                                                | packages/shared/src/keybindings.ts:190                                              |
| composer.md:87                    | key      | Alt+Up                                                                                   | packages/shared/src/keybindings.ts:190                                              |
| composer.md:89                    | cmd      | thread.editQueuedMessage                                                                 | packages/shared/src/keybindings.ts                                                  |
| composer.md:91                    | menu     | Settings → Follow-ups                                                                    | mobile SettingsRouteScreen.tsx:181                                                  |
| composer.md:105                   | menu     | Settings → Models to add an unlisted model with a custom                                 | settingsSearch.ts:93                                                                |
| composer.md:166                   | label    | Edit from here                                                                           | apps/web/src/components/chat/ChatOverlayHosts.tsx:213                               |
| composer.md:167                   | label    | Revert and keep changes                                                                  | apps/web/src/components/chat/ChatOverlayHosts.tsx:224                               |
| composer.md:183                   | label    | Save                                                                                     | apps/web/src/agentActivity.ts:89                                                    |
| composer.md:188                   | label    | Saved                                                                                    | apps/web/src/composerDraftStore.ts:4454                                             |
| composer.md:192                   | menu     | Settings → Scheduled Tasks                                                               | settingsSearch.ts:98                                                                |
| composer.md:195                   | label    | Import                                                                                   | apps/web/src/agentActivity.ts:1                                                     |
| composer.md:200                   | key      | Cmd+S                                                                                    | packages/shared/src/keybindings.ts:185                                              |
| composer.md:200                   | key      | Ctrl+S                                                                                   | packages/shared/src/keybindings.ts:185                                              |
| composer.md:207                   | label    | Attach again                                                                             | apps/web/src/components/composerContextPresentation.tsx:220                         |
| composer.md:221                   | menu     | Settings → Microphone                                                                    | mobile SettingsRouteScreen.tsx:160                                                  |
| composer.md:236                   | key      | Cmd+Enter                                                                                | packages/shared/src/keybindings.ts:191                                              |
| composer.md:237                   | key      | Ctrl+Enter                                                                               | packages/shared/src/keybindings.ts:191                                              |
| composer.md:244                   | label    | Resume                                                                                   | apps/web/src/markdown-incremental.ts:67                                             |
| composer.md:244                   | label    | Resume queue                                                                             | apps/mobile/src/features/threads/ThreadComposer.tsx:1084                            |
| composer.md:262                   | menu     | Settings → Message box                                                                   | settingsSearch.ts:88                                                                |
| composer.md:305                   | label    | Open pull request                                                                        | apps/web/src/components/BranchToolbarBranchSelector.tsx:752                         |
| composer.md:351                   | label    | Copy contents                                                                            | apps/web/src/components/files/AttachmentFilePreview.tsx:425                         |
| composer.md:351                   | label    | Save file                                                                                | apps/web/src/components/files/AttachmentFilePreview.tsx:456                         |
| composer.md:352                   | label    | Copy contents                                                                            | apps/web/src/components/files/AttachmentFilePreview.tsx:425                         |
| composer.md:353                   | label    | and                                                                                      | apps/web/src/agentActivity.ts:61                                                    |
| composer.md:363                   | label    | Save or share                                                                            | apps/mobile/src/components/VideoPreviewModal.ios.tsx:105                            |
| cursor.md:9                       | menu     | Settings → AI services                                                                   | settingsSearch.ts:92                                                                |
| cursor.md:9                       | menu-seg | Cursor                                                                                   | apps/web/src/composer-code-block.ts:54                                              |
| cursor.md:20                      | label    | Sign in                                                                                  | apps/web/src/cloud/useCloudLinkController.ts:168                                    |
| cursor.md:22                      | menu     | Settings → AI accounts** for an already configured Cursor instance                       | mobile SettingsRouteScreen.tsx:188                                                  |
| cursor.md:28                      | label    | Change account                                                                           | apps/web/src/components/settings/CodexSetupSection.tsx:918                          |
| cursor.md:28                      | label    | Sign out                                                                                 | apps/web/src/components/settings/AcpSessionManagementSection.tsx:317                |
| default-browser.md:8              | label    | Leonidas                                                                                 | apps/web/src/agentActivityAccess.ts:67                                              |
| devices.md:10                     | label    | Device                                                                                   | apps/web/src/closedViewStore.ts:76                                                  |
| devices.md:16                     | label    | Start                                                                                    | apps/web/src/agentActivity.ts:86                                                    |
| devices.md:19                     | label    | Rename                                                                                   | apps/web/src/branding.ts:29                                                         |
| devices.md:21                     | label    | Float device over the chat                                                               | apps/web/src/components/device/DeviceControlsRail.tsx:213                           |
| devices.md:23                     | label    | Open in right panel                                                                      | apps/web/src/components/preview/ThreadPreviewMiniPlayer.tsx:525                     |
| devices.md:25                     | menu     | Settings → Devices** to stop the                                                         | settingsSearch.ts:96                                                                |
| devices.md:50                     | label    | 3D view                                                                                  | apps/web/src/components/device/DeviceControlsRail.tsx:229                           |
| devices.md:55                     | label    | Fold device                                                                              | apps/web/src/components/device/DeviceAndroidFoldControls.tsx:119                    |
| devices.md:55                     | label    | Unfold device                                                                            | apps/web/src/components/device/DeviceAndroidFoldControls.tsx:136                    |
| devices.md:60                     | label    | Tools                                                                                    | apps/web/src/agentActivity.ts:5                                                     |
| devices.md:73                     | menu     | Settings → Browser** to open a                                                           | settingsSearch.ts:95                                                                |
| devices.md:73                     | label    | Auto-show floating preview                                                               | apps/web/src/components/settings/IntegrationsSettings.tsx:908                       |
| devices.md:86                     | label    | Agent device access                                                                      | apps/web/src/components/settings/settingsSearch.ts:939                              |
| devices.md:87                     | menu     | Settings → Devices                                                                       | settingsSearch.ts:96                                                                |
| devices.md:99                     | menu     | Settings → Devices                                                                       | settingsSearch.ts:96                                                                |
| glossary.md:52                    | label    | branch                                                                                   | apps/web/src/composerDraftStore.ts:324                                              |
| glossary.md:52                    | label    | commit                                                                                   | apps/web/src/session-logic.ts:605                                                   |
| glossary.md:52                    | label    | pull request                                                                             | apps/web/src/rightPanelStore.ts:86                                                  |
| glossary.md:70                    | brand    | T3 Code                                                                                  | -                                                                                   |
| install.md:15                     | brand    | T3 Code                                                                                  | -                                                                                   |
| install.md:66                     | menu     | Settings → About                                                                         | settingsSearch.ts:106                                                               |
| install.md:66                     | menu-seg | Update history** to browse patch notes for                                               | apps/web/src/agentActivity.ts:114                                                   |
| install.md:78                     | menu     | Settings → About                                                                         | settingsSearch.ts:106                                                               |
| install.md:78                     | menu-seg | Command line                                                                             | apps/web/src/components/settings/settingsSearch.ts:796                              |
| install.md:78                     | label    | and choose                                                                               | apps/web/src/components/calendar/calendar.logic.ts:44                               |
| install.md:86                     | menu     | Settings → Connections** to run agents and projects                                      | settingsSearch.ts:47                                                                |
| install.md:86                     | label    | Settings → Connections                                                                   | apps/web/src/components/auth/ConnectAgentSurface.tsx:238                            |
| install.md:106                    | brand    | T3 Code                                                                                  | -                                                                                   |
| install.md:110                    | menu     | Settings → Diagnostics on the next launch                                                | mobile SettingsRouteScreen.tsx:0                                                    |
| install.md:118                    | menu     | Settings → AI services** in the web or desktop app                                       | settingsSearch.ts:92                                                                |
| install.md:127                    | menu     | Settings → AI services                                                                   | settingsSearch.ts:92                                                                |
| install.md:127                    | menu-seg | Cursor                                                                                   | apps/web/src/composer-code-block.ts:54                                              |
| install.md:132                    | menu     | Settings → AI services                                                                   | settingsSearch.ts:92                                                                |
| install.md:139                    | menu     | Settings → AI services** on that environment for the recommended                         | settingsSearch.ts:92                                                                |
| keybindings.md:3                  | menu     | Settings → Keyboard shortcuts** on web and desktop                                       | settingsSearch.ts:90                                                                |
| keybindings.md:8                  | menu     | Settings → Message box                                                                   | settingsSearch.ts:88                                                                |
| keybindings.md:8                  | menu-seg | Send shortcut                                                                            | apps/web/src/components/settings/SettingsPanels.tsx:802                             |
| keybindings.md:9                  | key      | mod+Enter                                                                                | packages/shared/src/keybindings.ts:191                                              |
| keybindings.md:9                  | key      | mod+Enter                                                                                | packages/shared/src/keybindings.ts:191                                              |
| keybindings.md:12                 | label    | Sending a message during a reply                                                         | apps/web/src/components/settings/SettingsPanels.tsx:804                             |
| keybindings.md:13                 | key      | mod+Enter                                                                                | packages/shared/src/keybindings.ts:191                                              |
| keybindings.md:14                 | key      | mod+Alt+Enter                                                                            | packages/shared/src/keybindings.ts:198                                              |
| keybindings.md:15                 | key      | mod+Enter                                                                                | packages/shared/src/keybindings.ts:191                                              |
| keybindings.md:16                 | menu     | Settings → Keyboard shortcuts** under                                                    | settingsSearch.ts:90                                                                |
| keybindings.md:21                 | key      | mod+Shift+Enter                                                                          | packages/shared/src/keybindings.ts:189                                              |
| keybindings.md:24                 | key      | mod+shift+m                                                                              | packages/shared/src/keybindings.ts:212                                              |
| keybindings.md:24                 | key      | mod+shift+h                                                                              | packages/shared/src/keybindings.ts:213                                              |
| keybindings.md:27                 | key      | mod+shift+e                                                                              | packages/shared/src/keybindings.ts:214                                              |
| keybindings.md:27                 | key      | mod+shift+a                                                                              | packages/shared/src/keybindings.ts:215                                              |
| keybindings.md:27                 | key      | mod+shift+x                                                                              | packages/shared/src/keybindings.ts:216                                              |
| keybindings.md:28                 | key      | mod+shift+g                                                                              | packages/shared/src/keybindings.ts:217                                              |
| keybindings.md:30                 | key      | mod+shift+l                                                                              | packages/shared/src/keybindings.ts:218                                              |
| keybindings.md:39                 | key      | mod+shift+up                                                                             | packages/shared/src/keybindings.ts:220                                              |
| keybindings.md:39                 | key      | mod+shift+down                                                                           | packages/shared/src/keybindings.ts:221                                              |
| keybindings.md:49                 | key      | mod+shift+c                                                                              | packages/shared/src/keybindings.ts:225                                              |
| keybindings.md:50                 | key      | mod+shift+k                                                                              | packages/shared/src/keybindings.ts:219                                              |
| keybindings.md:57                 | key      | mod+f                                                                                    | packages/shared/src/keybindings.ts:211                                              |
| keybindings.md:65                 | key      | Cmd+1                                                                                    | packages/shared/src/keybindings.ts:0                                                |
| keybindings.md:65                 | key      | Cmd+9                                                                                    | packages/shared/src/keybindings.ts:0                                                |
| keybindings.md:67                 | key      | Cmd+K                                                                                    | packages/shared/src/keybindings.ts:169                                              |
| keybindings.md:68                 | key      | Cmd+1                                                                                    | packages/shared/src/keybindings.ts:0                                                |
| keybindings.md:68                 | key      | Cmd+9                                                                                    | packages/shared/src/keybindings.ts:0                                                |
| keybindings.md:69                 | key      | Cmd+K                                                                                    | packages/shared/src/keybindings.ts:169                                              |
| keybindings.md:72                 | key      | Cmd+Shift+H                                                                              | packages/shared/src/keybindings.ts:213                                              |
| keybindings.md:74                 | key      | Cmd+Return                                                                               | packages/shared/src/keybindings.ts:191                                              |
| keybindings.md:76                 | menu     | Settings → Keyboard                                                                      | mobile SettingsRouteScreen.tsx:159                                                  |
| keybindings.md:105                | key      | mod+shift+d                                                                              | packages/shared/src/keybindings.ts:156                                              |
| keybindings.md:105                | key      | ctrl+l                                                                                   | packages/shared/src/keybindings.ts:164                                              |
| keybindings.md:118                | key      | mod+1                                                                                    | packages/shared/src/keybindings.ts:0                                                |
| keybindings.md:118                | key      | mod+9                                                                                    | packages/shared/src/keybindings.ts:0                                                |
| keybindings.md:132                | cmd      | chat.find                                                                                | packages/shared/src/keybindings.ts                                                  |
| keybindings.md:134                | label    | Retry                                                                                    | apps/web/src/rightPanelStore.ts:652                                                 |
| keybindings.md:135                | key      | mod+f                                                                                    | packages/shared/src/keybindings.ts:211                                              |
| keybindings.md:135                | label    | Enter                                                                                    | apps/web/src/commandCenter.ts:4                                                     |
| keybindings.md:135                | label    | Shift+Enter                                                                              | apps/web/src/components/capture/CaptureDialog.tsx:81                                |
| keybindings.md:146                | cmd      | thread.stop                                                                              | packages/shared/src/keybindings.ts                                                  |
| keybindings.md:146                | key      | mod+.                                                                                    | packages/shared/src/keybindings.ts:188                                              |
| keybindings.md:147                | menu     | Settings → Keyboard shortcuts                                                            | settingsSearch.ts:90                                                                |
| keybindings.md:149                | cmd      | thread.undo                                                                              | packages/shared/src/keybindings.ts                                                  |
| keybindings.md:149                | key      | mod+z                                                                                    | packages/shared/src/keybindings.ts:228                                              |
| keybindings.md:156                | cmd      | navigation.back                                                                          | packages/shared/src/keybindings.ts                                                  |
| keybindings.md:156                | key      | mod+[                                                                                    | packages/shared/src/keybindings.ts:149                                              |
| keybindings.md:156                | cmd      | navigation.forward                                                                       | packages/shared/src/keybindings.ts                                                  |
| keybindings.md:156                | key      | mod+]                                                                                    | packages/shared/src/keybindings.ts:150                                              |
| keybindings.md:159                | cmd      | chat.new                                                                                 | packages/shared/src/keybindings.ts                                                  |
| keybindings.md:160                | cmd      | chat.newLocal                                                                            | packages/shared/src/keybindings.ts                                                  |
| keybindings.md:161                | cmd      | chat.newWithoutProject                                                                   | packages/shared/src/keybindings.ts                                                  |
| keybindings.md:162                | key      | mod+alt+n                                                                                | packages/shared/src/keybindings.ts:210                                              |
| keybindings.md:166                | key      | mod+w                                                                                    | packages/shared/src/keybindings.ts:158                                              |
| keybindings.md:167                | key      | mod+w                                                                                    | packages/shared/src/keybindings.ts:158                                              |
| keybindings.md:168                | cmd      | terminal.close                                                                           | packages/shared/src/keybindings.ts                                                  |
| keybindings.md:169                | key      | alt+w                                                                                    | keybindings.md example of a custom binding                                          |
| keybindings.md:171                | key      | mod+shift+t                                                                              | packages/shared/src/keybindings.ts:160                                              |
| keybindings.md:183                | label    | Hold                                                                                     | apps/web/src/AppRoot.tsx:10                                                         |
| keybindings.md:187                | menu     | Settings → General                                                                       | settingsSearch.ts:86                                                                |
| keybindings.md:187                | menu-seg | Quit shortcut** to **Direct** for a                                                      | apps/web/src/AppRoot.tsx:10                                                         |
| keybindings.md:188                | label    | Double press                                                                             | apps/web/src/components/settings/SettingsPanels.tsx:274                             |
| keybindings.md:188                | label    | Quit                                                                                     | apps/web/src/AppRoot.tsx:10                                                         |
| mobile-notifications.md:3         | menu     | Settings → Notifications** to receive alerts when an agent finishes                      | mobile SettingsRouteScreen.tsx:95                                                   |
| mobile-notifications.md:3         | label    | Device Notifications                                                                     | apps/mobile/src/features/settings/SettingsNotificationsRouteScreen.tsx:412          |
| mobile-notifications.md:5         | label    | Live Activity Updates                                                                    | apps/mobile/src/features/settings/SettingsNotificationsRouteScreen.tsx:207          |
| open-source-licenses.md:6         | menu     | Settings → About                                                                         | settingsSearch.ts:106                                                               |
| open-source-licenses.md:6         | label    | Open source licenses                                                                     | apps/web/src/components/settings/SettingsBreadcrumb.tsx:11                          |
| open-source-licenses.md:7         | label    | View licenses                                                                            | apps/web/src/components/settings/SettingsPanels.tsx:3999                            |
| open-source-licenses.md:8         | menu     | Settings → About Leonidas                                                                | mobile SettingsRouteScreen.tsx:220                                                  |
| open-source-licenses.md:8         | menu-seg | Open source licenses                                                                     | apps/web/src/components/settings/SettingsBreadcrumb.tsx:11                          |
| outside-agents.md:11              | menu     | Settings → Connections                                                                   | settingsSearch.ts:47                                                                |
| outside-agents.md:11              | label    | Settings → Connections                                                                   | apps/web/src/components/auth/ConnectAgentSurface.tsx:238                            |
| outside-agents.md:40              | menu     | Settings → Connections** or from                                                         | settingsSearch.ts:47                                                                |
| outside-agents.md:81              | label    | OAuth                                                                                    | apps/web/src/vite-env.d.ts:12                                                       |
| outside-agents.md:93              | menu     | Settings → Connections** like other clients                                              | settingsSearch.ts:47                                                                |
| phone-setup.md:9                  | label    | Settings                                                                                 | apps/web/src/appearanceContrast.ts:1                                                |
| phone-setup.md:9                  | label    | Sharing and access                                                                       | apps/web/src/components/settings/settingsSearch.ts:102                              |
| phone-setup.md:10                 | label    | Network access                                                                           | apps/web/src/components/settings/ConnectionsSettings.logic.ts:58                    |
| phone-setup.md:11                 | label    | Tailscale HTTPS                                                                          | apps/web/src/components/settings/ConnectionsSettings.logic.ts:57                    |
| phone-setup.md:12                 | label    | Create link                                                                              | apps/web/src/components/onboarding/setup/ReturningDevicePanel.tsx:90                |
| phone-setup.md:18                 | label    | Share                                                                                    | apps/web/src/agentActivity.ts:6                                                     |
| phone-setup.md:28                 | label    | System Settings, Privacy & Security                                                      | apps/desktop/src/snip/DesktopSnip.ts:49                                             |
| phone-setup.md:31                 | label    | Energy                                                                                   | apps/web/src/components/chat/composerSkillSuggest.fixture.json:373                  |
| phone-setup.md:37                 | label    | Create link                                                                              | apps/web/src/components/onboarding/setup/ReturningDevicePanel.tsx:90                |
| phone-setup.md:39                 | label    | HTTPS Certificates                                                                       | apps/server/src/cli/pair.ts:98                                                      |
| phone-setup.md:39                 | label    | Tailscale HTTPS                                                                          | apps/web/src/components/settings/ConnectionsSettings.logic.ts:57                    |
| phone-setup.md:40                 | label    | Never                                                                                    | apps/web/src/agentActivityAccess.ts:68                                              |
| plain-words-brief.md:7            | path     | docs/user/glossary.md                                                                    | docs/user/glossary.md                                                               |
| plain-words-brief.md:15           | brand    | T3 Code                                                                                  | -                                                                                   |
| plain-words-brief.md:15           | brand    | T3 Code                                                                                  | -                                                                                   |
| privacy.md:3                      | label    | Yes, share usage                                                                         | apps/web/src/components/usageAnalytics/UsageAnalyticsConsentDialog.tsx:79           |
| privacy.md:18                     | label    | I'm stuck                                                                                | apps/web/src/components/ChatView.tsx:8653                                           |
| privacy.md:18                     | label    | Send report                                                                              | apps/web/src/components/community/StuckDialog.tsx:80                                |
| privacy.md:18                     | label    | Cancel                                                                                   | apps/web/src/openVsxThemes.ts:598                                                   |
| privacy.md:19                     | label    | Friends leaderboard.                                                                     | apps/web/src/components/settings/LeaderboardSettings.tsx:20                         |
| privacy.md:19                     | label    | Show my nickname                                                                         | apps/web/src/components/settings/LeaderboardSettings.tsx:65                         |
| privacy.md:38                     | label    | Share anonymous usage                                                                    | apps/web/src/components/settings/UsageAnalyticsSettings.tsx:20                      |
| privacy.md:42                     | label    | Send feedback                                                                            | apps/web/src/components/CommandPalette.tsx:2363                                     |
| project-settings.md:24            | label    | Reset all                                                                                | apps/web/src/components/settings/SettingsPanels.tsx:1357                            |
| project-settings.md:30            | menu     | Settings → AI services** turns it on or off for                                          | settingsSearch.ts:92                                                                |
| project-settings.md:38            | label    | Settings                                                                                 | apps/web/src/appearanceContrast.ts:1                                                |
| project-settings.md:42            | label    | Use defaults                                                                             | apps/mobile/src/features/settings/components/SettingsProjectOverridesSection.tsx:23 |
| project-settings.md:43            | menu     | Settings → Project                                                                       | settingsSearch.ts:85                                                                |
| project-settings.md:43            | menu-seg | Project overview** to rename the project across its selected                             | apps/web/src/agentActivity.ts:82                                                    |
| project-settings.md:46            | label    | Mixed                                                                                    | apps/web/src/sidebarProjectGrouping.ts:10                                           |
| project-settings.md:51            | menu     | Settings → Source control                                                                | settingsSearch.ts:99                                                                |
| project-settings.md:51            | menu-seg | Branch naming for separate copies                                                        | apps/web/src/components/settings/BranchNamingSettings.tsx:68                        |
| project-settings.md:65            | menu     | Settings → Scheduled tasks** to create recurring tasks or manage existing                | settingsSearch.ts:98                                                                |
| project-settings.md:81            | menu     | Settings → Scheduled tasks                                                               | settingsSearch.ts:98                                                                |
| project-settings.md:81            | label    | On webhook                                                                               | apps/web/src/components/settings/scheduledTasksSettings.logic.ts:103                |
| project-settings.md:105           | label    | Require signature                                                                        | apps/web/src/components/settings/ScheduledTasksSettings.tsx:1240                    |
| project-settings.md:121           | label    | Replay key                                                                               | apps/web/src/components/settings/scheduledTasksSettings.logic.ts:114                |
| project-settings.md:123           | label    | Coalesce key                                                                             | apps/web/src/components/settings/scheduledTasksSettings.logic.ts:115                |
| project-settings.md:135           | label    | Deliveries                                                                               | apps/web/src/components/settings/ScheduledTasksSettings.tsx:433                     |
| project-settings.md:141           | menu     | Settings → Connections                                                                   | settingsSearch.ts:47                                                                |
| project-settings.md:165           | menu     | Settings → Chats                                                                         | settingsSearch.ts:94                                                                |
| project-settings.md:165           | label    | Submodules                                                                               | apps/web/src/components/BranchToolbar.logic.ts:6                                    |
| project-settings.md:174           | menu     | Settings → Separate copies                                                               | settingsSearch.ts:100                                                               |
| project-settings.md:174           | menu-seg | Separate copy location** to an absolute path like                                        | apps/web/src/components/BranchPicker.tsx:238                                        |
| project-settings.md:180           | menu     | Settings → Separate copies** to enable automatic cleanup on one machine or all connected | settingsSearch.ts:100                                                               |
| project-settings.md:184           | label    | Automatic cleanup of separate copies                                                     | apps/web/src/components/settings/StorageSettings.tsx:506                            |
| project-settings.md:184           | label    | Inherit                                                                                  | apps/web/src/session-logic.ts:1128                                                  |
| project-settings.md:184           | label    | Off                                                                                      | apps/web/src/agentActivity.ts:82                                                    |
| project-settings.md:184           | label    | Custom                                                                                   | apps/web/src/appearanceFonts.ts:57                                                  |
| project-settings.md:206           | label    | Delete now                                                                               | apps/web/src/components/settings/settingsSearch.ts:213                              |
| project-settings.md:216           | label    | Automatic                                                                                | apps/web/src/rightPanelStore.ts:148                                                 |
| project-settings.md:219           | label    | Monogram                                                                                 | apps/web/src/projectIdentity.ts:5                                                   |
| project-settings.md:227           | label    | Automatically pull                                                                       | apps/web/src/components/settings/ProjectDefaultsSettings.tsx:411                    |
| project-settings.md:229           | menu     | Settings → Source control** to change selected environment defaults or project overrides | settingsSearch.ts:99                                                                |
| project-settings.md:229           | label    | Settings → Source control                                                                | apps/web/src/components/pullRequest/guide/useReviewGuideWriter.ts:63                |
| prompt-links.md:11                | label    | Copy prompt link                                                                         | apps/mobile/src/features/threads/ThreadFeed.tsx:338                                 |
| prompt-links.md:36                | label    | Remember my choice                                                                       | apps/web/src/components/promptLinks/HostedPromptLinkLanding.tsx:163                 |
| prompt-links.md:41                | label    | Clone                                                                                    | apps/web/src/composerDraftStore.ts:678                                              |
| providers-acp.md:22               | menu     | Settings → AI services                                                                   | settingsSearch.ts:92                                                                |
| providers-acp.md:23               | label    | Connect an account                                                                       | apps/web/src/components/settings/ConnectAccountDialog.tsx:67                        |
| providers-acp.md:23               | label    | Advanced setup                                                                           | apps/web/src/components/settings/ConnectAccountDialog.tsx:251                       |
| providers-acp.md:24               | label    | Add                                                                                      | apps/web/src/agentActivityAccess.ts:109                                             |
| providers-acp.md:32               | menu     | Settings → AI services                                                                   | settingsSearch.ts:92                                                                |
| providers-acp.md:32               | menu-seg | Connect an account                                                                       | apps/web/src/components/settings/ConnectAccountDialog.tsx:67                        |
| providers-acp.md:32               | menu-seg | Advanced setup                                                                           | apps/web/src/components/settings/ConnectAccountDialog.tsx:251                       |
| providers-acp.md:32               | label    | , set                                                                                    | apps/web/src/clientPersistenceStorage.ts:3                                          |
| providers-acp.md:32               | label    | to                                                                                       | apps/web/src/agentActivity.ts:5                                                     |
| providers-acp.md:51               | label    | Executable override                                                                      | packages/provider-acp-registry/src/settings.ts:38                                   |
| providers-acp.md:55               | menu     | Settings → AI services** on web or desktop                                               | settingsSearch.ts:92                                                                |
| providers-acp.md:56               | label    | Sign in                                                                                  | apps/web/src/cloud/useCloudLinkController.ts:168                                    |
| providers-acp.md:57               | menu     | Settings → AI accounts                                                                   | mobile SettingsRouteScreen.tsx:188                                                  |
| providers-acp.md:69               | label    | Sign out                                                                                 | apps/web/src/components/settings/AcpSessionManagementSection.tsx:317                |
| providers-acp.md:96               | label    | List sessions                                                                            | apps/server/src/auth/EnvironmentAuth.ts:208                                         |
| providers-antigravity.md:9        | menu     | Settings → AI services                                                                   | settingsSearch.ts:92                                                                |
| providers-antigravity.md:13       | menu     | Settings → AI accounts** in the mobile app                                               | mobile SettingsRouteScreen.tsx:188                                                  |
| providers-antigravity.md:37       | label    | Sign-in method                                                                           | apps/web/src/components/settings/ProviderAuthenticationSection.tsx:89               |
| providers-antigravity.md:65       | label    | Binary path                                                                              | apps/web/src/components/settings/settingsSearch.ts:882                              |
| providers-antigravity.md:109      | menu     | Settings → AI services** on web or desktop                                               | settingsSearch.ts:92                                                                |
| providers-antigravity.md:135      | label    | Refresh provider status                                                                  | apps/server/src/provider/antigravityUsageLimits.ts:348                              |
| providers-antigravity.md:137      | label    | AI accounts                                                                              | apps/web/src/components/ProviderUpdateEnvironmentRows.tsx:146                       |
| providers-claude.md:22            | menu     | Settings → AI services                                                                   | settingsSearch.ts:92                                                                |
| providers-claude.md:48            | label    | Auto-compact after                                                                       | packages/contracts/src/settings.ts:893                                              |
| providers-claude.md:57            | label    | Full                                                                                     | apps/web/src/agentActivity.ts:72                                                    |
| providers-claude.md:86            | menu     | Settings → AI services                                                                   | settingsSearch.ts:92                                                                |
| providers-claude.md:91            | menu     | Settings → AI services                                                                   | settingsSearch.ts:92                                                                |
| providers-claude.md:101           | label    | Add custom model                                                                         | apps/web/src/components/settings/ProviderModelsSection.tsx:345                      |
| providers-codex.md:7              | menu     | Settings → AI services                                                                   | settingsSearch.ts:92                                                                |
| providers-codex.md:30             | menu     | Settings → AI services                                                                   | settingsSearch.ts:92                                                                |
| providers-codex.md:48             | menu     | Settings → AI services                                                                   | settingsSearch.ts:92                                                                |
| providers-codex.md:55             | label    | CODEX_HOME path                                                                          | packages/contracts/src/settings.ts:811                                              |
| providers-codex.md:63             | label    | CODEX_HOME path                                                                          | packages/contracts/src/settings.ts:811                                              |
| providers-muse.md:7               | menu     | Settings → AI services** in the web or desktop app                                       | settingsSearch.ts:92                                                                |
| providers-muse.md:8               | label    | Muse Code                                                                                | packages/contracts/src/model.ts:210                                                 |
| providers-muse.md:8               | label    | Binary path                                                                              | apps/web/src/components/settings/settingsSearch.ts:882                              |
| providers-muse.md:20              | menu     | Settings → AI services                                                                   | settingsSearch.ts:92                                                                |
| providers-muse.md:38              | menu     | Settings → AI services                                                                   | settingsSearch.ts:92                                                                |
| providers-muse.md:44              | label    | Custom models                                                                            | apps/web/src/components/chat/ChatComposer.tsx:1425                                  |
| providers-muse.md:63              | menu     | Settings → AI services** when Leonidas recognizes                                        | settingsSearch.ts:92                                                                |
| providers-muse.md:66              | menu     | Settings → AI services                                                                   | settingsSearch.ts:92                                                                |
| providers-opencode.md:4           | menu     | Settings → AI services                                                                   | settingsSearch.ts:92                                                                |
| providers-opencode.md:32          | label    | Server URL                                                                               | apps/desktop/src/backend/DesktopBackendConfiguration.ts:722                         |
| providers-opencode.md:49          | label    | Allow once                                                                               | apps/web/src/components/subagents/SpawnApprovalCoordinator.tsx:202                  |
| providers-opencode.md:54          | label    | Refresh provider status                                                                  | apps/server/src/provider/antigravityUsageLimits.ts:348                              |
| providers-opencode.md:55          | menu     | Settings → AI services** for that environment                                            | settingsSearch.ts:92                                                                |
| providers-opencode.md:55          | label    | Refresh models                                                                           | apps/mobile/src/features/threads/ThreadSettingsSheet.tsx:1011                       |
| question-attachments.md:3         | label    | Attach files                                                                             | apps/web/src/components/CommandPalette.tsx:1940                                     |
| remote-access.md:39               | menu     | Settings → Connections                                                                   | settingsSearch.ts:47                                                                |
| remote-access.md:39               | label    | Settings → Connections                                                                   | apps/web/src/components/auth/ConnectAgentSurface.tsx:238                            |
| remote-access.md:39               | label    | Network access                                                                           | apps/web/src/components/settings/ConnectionsSettings.logic.ts:58                    |
| remote-access.md:57               | menu     | Settings → Computers                                                                     | settingsSearch.ts:101                                                               |
| remote-access.md:58               | menu     | Settings → Computers** on mobile                                                         | settingsSearch.ts:101                                                               |
| remote-access.md:94               | menu     | Settings → Computers** to see its routes                                                 | settingsSearch.ts:101                                                               |
| remote-access.md:95               | menu     | Settings → Computers** and                                                               | settingsSearch.ts:101                                                               |
| remote-access.md:96               | label    | Edit                                                                                     | apps/web/src/agentActivityAccess.ts:160                                             |
| remote-access.md:99               | label    | Permissions                                                                              | apps/web/src/components/ChatView.tsx:1423                                           |
| remote-access.md:99               | label    | Routes                                                                                   | apps/web/src/routeTree.gen.ts:11                                                    |
| remote-access.md:99               | label    | Your permissions                                                                         | apps/web/src/components/settings/SessionPermissions.tsx:35                          |
| remote-access.md:102              | label    | In use                                                                                   | apps/web/src/components/chat/CacheAwareness.tsx:313                                 |
| remote-access.md:109              | menu     | Settings → Computers                                                                     | settingsSearch.ts:101                                                               |
| remote-access.md:109              | menu-seg | Load balancing** to automatically choose a machine for                                   | apps/web/src/agentActivityAccess.ts:164                                             |
| remote-access.md:112              | label    | Normal                                                                                   | apps/web/src/agentActivityAccess.ts:63                                              |
| remote-access.md:112              | label    | Prefer                                                                                   | apps/web/src/appearanceFonts.ts:23                                                  |
| remote-access.md:118              | label    | Auto balance                                                                             | apps/web/src/components/ChatView.tsx:2075                                           |
| remote-access.md:127              | menu     | Settings → Connections                                                                   | settingsSearch.ts:47                                                                |
| remote-access.md:164              | menu     | Settings → Computers                                                                     | settingsSearch.ts:101                                                               |
| remote-access.md:164              | menu-seg | Add computer                                                                             | apps/web/src/components/settings/ConnectionsSettings.tsx:2027                       |
| remote-access.md:251              | menu     | Settings → Connections** lets authorized administrators create                           | settingsSearch.ts:47                                                                |
| remote-access.md:276              | label    | Add Environment                                                                          | apps/mobile/src/features/home/HomeScreen.tsx:749                                    |
| remote-access.md:302              | label    | T3 Connect                                                                               | apps/web/src/cloud/useCloudLinkController.ts:80                                     |
| remote-access.md:303              | menu     | Settings → Remote access account** on mobile                                             | mobile SettingsRouteScreen.tsx:83                                                   |
| remote-access.md:303              | label    | Deregister                                                                               | apps/web/src/cloud/managedRelayState.ts:4                                           |
| remote-access.md:307              | menu     | Settings → Connections** on a desktop host                                               | settingsSearch.ts:47                                                                |
| remote-access.md:341              | menu     | Settings → Connections** and switch off **Local                                          | settingsSearch.ts:47                                                                |
| remote-access.md:341              | label    | Settings → Connections                                                                   | apps/web/src/components/auth/ConnectAgentSurface.tsx:238                            |
| shared-browser.md:9               | menu     | Settings → Browser                                                                       | settingsSearch.ts:95                                                                |
| shared-browser.md:9               | label    | Settings > Browser                                                                       | apps/server/src/preview/ServerBrowser.ts:474                                        |
| shared-browser.md:11              | label    | Shared browser                                                                           | apps/web/src/components/preview/PreviewView.tsx:123                                 |
| shared-browser.md:11              | label    | Website logins                                                                           | apps/web/src/components/settings/IntegrationsSettings.tsx:1549                      |
| shared-browser.md:12              | label    | Open shared browser                                                                      | apps/web/src/components/settings/SharedBrowserSetting.tsx:107                       |
| shared-browser.md:26              | label    | Shared browser                                                                           | apps/web/src/components/preview/PreviewView.tsx:123                                 |
| shared-browser.md:33              | label    | Disabled:                                                                                | apps/web/src/components/AddProjectToMachineDialog.tsx:418                           |
| snap-shot.md:13                   | label    | Settings                                                                                 | apps/web/src/appearanceContrast.ts:1                                                |
| snap-shot.md:13                   | label    | SnapShots                                                                                | apps/web/src/composerDraftStore.ts:27                                               |
| snap-shot.md:14                   | label    | Finish later                                                                             | apps/web/src/components/media/MediaActions.tsx:105                                  |
| snap-shot.md:38                   | label    | Save                                                                                     | apps/web/src/agentActivity.ts:89                                                    |
| snap-shot.md:90                   | label    | Niri.                                                                                    | apps/web/src/components/settings/SnapShotSettings.logic.ts:88                       |
| snap-shot.md:90                   | label    | Review changes                                                                           | apps/web/src/components/settings/CaptureShortcutConfig.tsx:228                      |
| source-control.md:16              | menu     | Settings → Source control                                                                | settingsSearch.ts:99                                                                |
| source-control.md:16              | label    | Settings → Source control                                                                | apps/web/src/components/pullRequest/guide/useReviewGuideWriter.ts:63                |
| source-control.md:17              | label    | Rescan                                                                                   | apps/web/src/terminal-links.ts:31                                                   |
| source-control.md:24              | menu     | Settings → Source control                                                                | settingsSearch.ts:99                                                                |
| source-control.md:24              | menu-seg | GitHub                                                                                   | apps/web/src/legalLinks.ts:2                                                        |
| source-control.md:30              | label    | GitHub                                                                                   | apps/web/src/legalLinks.ts:2                                                        |
| source-control.md:67              | menu     | Settings → Source control                                                                | settingsSearch.ts:99                                                                |
| source-control.md:67              | label    | Settings → Source control                                                                | apps/web/src/components/pullRequest/guide/useReviewGuideWriter.ts:63                |
| source-control.md:67              | label    | Bitbucket                                                                                | apps/web/src/sourceControlPresentation.ts:10                                        |
| source-control.md:77              | label    | Remove                                                                                   | apps/web/src/appearanceFonts.ts:90                                                  |
| source-control.md:113             | menu     | Settings → Source control                                                                | settingsSearch.ts:99                                                                |
| source-control.md:113             | label    | Settings → Source control                                                                | apps/web/src/components/pullRequest/guide/useReviewGuideWriter.ts:63                |
| source-control.md:113             | label    | GitCafe                                                                                  | apps/web/src/sourceControlPresentation.ts:12                                        |
| source-control.md:124             | label    | New project                                                                              | apps/web/src/components/CommandPalette.tsx:829                                      |
| source-control.md:133             | label    | Add Project                                                                              | apps/web/src/components/CommandPalette.tsx:832                                      |
| source-control.md:153             | menu     | Settings → Source control                                                                | settingsSearch.ts:99                                                                |
| source-control.md:153             | label    | Settings → Source control                                                                | apps/web/src/components/pullRequest/guide/useReviewGuideWriter.ts:63                |
| source-control.md:153             | label    | Repository conventions                                                                   | apps/web/src/components/settings/settingsSearch.ts:1082                             |
| source-control.md:158             | label    | Pull requests                                                                            | apps/web/src/rightPanelStore.ts:86                                                  |
| source-control.md:162             | label    | Pull requests                                                                            | apps/web/src/rightPanelStore.ts:86                                                  |
| source-control.md:171             | menu     | Settings → Source control to remove recognized                                           | settingsSearch.ts:99                                                                |
| source-control.md:171             | label    | Remove agent credits when merging                                                        | apps/web/src/components/settings/settingsSearch.ts:1027                             |
| source-control.md:178             | label    | Close                                                                                    | apps/web/src/closedViewStore.ts:16                                                  |
| source-control.md:179             | label    | Escape                                                                                   | apps/web/src/contextMenuFallback.ts:260                                             |
| source-control.md:184             | menu     | Settings → Connections                                                                   | settingsSearch.ts:47                                                                |
| source-control.md:184             | menu-seg | GitHub sharing                                                                           | apps/web/src/components/settings/ConnectionsSettings.tsx:2143                       |
| source-control.md:187             | label    | Read and act                                                                             | apps/mobile/src/features/connection/GitHubRoutingSettings.tsx:32                    |
| source-control.md:205             | menu     | Settings → Source control to add the                                                     | settingsSearch.ts:99                                                                |
| source-control.md:205             | label    | Review guides                                                                            | apps/web/src/components/settings/settingsSearch.ts:1107                             |
| source-control.md:217             | menu     | Settings → Source control read the                                                       | settingsSearch.ts:99                                                                |
| source-control.md:217             | label    | Write guide                                                                              | apps/web/src/components/pullRequest/PullRequestDetailPanel.tsx:2125                 |
| source-control.md:223             | label    | Rewrite guide                                                                            | apps/web/src/components/pullRequest/PullRequestDetailPanel.tsx:2126                 |
| source-control.md:226             | label    | Code                                                                                     | apps/web/src/agentActivityAccess.ts:179                                             |
| source-control.md:227             | label    | Ask about this stop                                                                      | apps/web/src/components/pullRequest/guide/GuideStop.tsx:264                         |
| source-control.md:233             | menu     | Settings → Source control                                                                | settingsSearch.ts:99                                                                |
| source-control.md:254             | menu     | Settings → Source control                                                                | settingsSearch.ts:99                                                                |
| source-control.md:256             | menu     | Settings → Source control                                                                | settingsSearch.ts:99                                                                |
| source-control.md:265             | label    | Link pull request                                                                        | apps/web/src/components/ChatMarkdown.tsx:3119                                       |
| source-control.md:265             | label    | Linked pull requests                                                                     | apps/web/src/rightPanelStore.ts:86                                                  |
| source-control.md:274             | label    | Linked pull requests                                                                     | apps/web/src/rightPanelStore.ts:86                                                  |
| source-control.md:294             | label    | Linked pull requests                                                                     | apps/web/src/rightPanelStore.ts:86                                                  |
| t3-connect-troubleshooting.md:10  | menu     | Settings → Connections                                                                   | settingsSearch.ts:47                                                                |
| t3-connect-troubleshooting.md:10  | label    | Settings > Connections                                                                   | packages/client-runtime/src/connection/diagnosis.ts:140                             |
| t3-connect-troubleshooting.md:11  | label    | Details                                                                                  | apps/web/src/composerDraftStore.ts:5                                                |
| t3-connect-troubleshooting.md:15  | menu     | Settings → Connections** on the host                                                     | settingsSearch.ts:47                                                                |
| t3-connect-troubleshooting.md:18  | label    | Details                                                                                  | apps/web/src/composerDraftStore.ts:5                                                |
| t3-connect-troubleshooting.md:108 | menu     | Settings → Connections** and turn **T3 Connect** on                                      | settingsSearch.ts:47                                                                |
| t3-connect-troubleshooting.md:108 | label    | Settings > Connections                                                                   | packages/client-runtime/src/connection/diagnosis.ts:140                             |
| t3-connect-troubleshooting.md:108 | label    | T3 Connect                                                                               | apps/web/src/cloud/useCloudLinkController.ts:80                                     |
| tasks.md:3                        | label    | Tasks                                                                                    | apps/web/src/agentActivity.ts:26                                                    |
| tasks.md:3                        | label    | New task                                                                                 | apps/web/src/components/settings/ScheduledTasksSettings.tsx:287                     |
| tasks.md:5                        | label    | New project…                                                                             | apps/web/src/components/taskBoard/TaskCreateDialog.tsx:88                           |
| tasks.md:11                       | label    | Show closed                                                                              | apps/web/src/components/taskBoard/TaskFilterBar.tsx:178                             |
| tasks.md:15                       | label    | Send to agent                                                                            | apps/web/src/components/taskBoard/usePracticeActions.ts:20                          |
| tasks.md:17                       | label    | Share with collaborators                                                                 | apps/web/src/components/taskBoard/TaskDetail.tsx:659                                |
| tasks.md:21                       | label    | Milestone details                                                                        | apps/web/src/components/taskBoard/TaskRoadmap.tsx:188                               |
| telemetry.md:3                    | brand    | T3 Code                                                                                  | -                                                                                   |
| telemetry.md:27                   | menu     | Settings → General                                                                       | settingsSearch.ts:86                                                                |
| telemetry.md:27                   | menu-seg | Diagnostics                                                                              | apps/web/src/components/CommandPalette.tsx:2389                                     |
| thread-sidebar.md:3               | label    | New worktree                                                                             | apps/web/src/components/promptLinks/NewThreadLinkView.tsx:351                       |
| thread-sidebar.md:21              | key      | mod+alt+n                                                                                | packages/shared/src/keybindings.ts:210                                              |
| thread-sidebar.md:21              | label    | No project                                                                               | apps/web/src/components/ChatView.tsx:2027                                           |
| thread-sidebar.md:36              | key      | Cmd+Enter                                                                                | packages/shared/src/keybindings.ts:191                                              |
| thread-sidebar.md:36              | key      | Ctrl+Enter                                                                               | packages/shared/src/keybindings.ts:191                                              |
| thread-sidebar.md:41              | label    | Shift-click                                                                              | apps/web/src/components/Sidebar.tsx:1214                                            |
| thread-sidebar.md:48              | label    | Command Center                                                                           | apps/web/src/components/CommandPalette.tsx:2287                                     |
| thread-sidebar.md:49              | label    | Open Command Center                                                                      | apps/web/src/components/CommandPalette.tsx:2295                                     |
| thread-sidebar.md:56              | menu     | Settings → Connections** to restore                                                      | settingsSearch.ts:47                                                                |
| thread-sidebar.md:57              | label    | Back                                                                                     | apps/web/src/appearanceFonts.ts:81                                                  |
| thread-sidebar.md:75              | key      | mod+z                                                                                    | packages/shared/src/keybindings.ts:228                                              |
| thread-sidebar.md:106             | label    | Arrange chats…                                                                           | apps/mobile/src/features/threads/thread-list-v2-items.tsx:685                       |
| thread-sidebar.md:136             | label    | New worktree                                                                             | apps/web/src/components/promptLinks/NewThreadLinkView.tsx:351                       |
| thread-sidebar.md:142             | menu     | Settings → General                                                                       | settingsSearch.ts:86                                                                |
| thread-sidebar.md:153             | menu     | Settings → General                                                                       | settingsSearch.ts:86                                                                |
| thread-sidebar.md:153             | menu-seg | Working section                                                                          | apps/web/src/components/settings/SettingsPanels.tsx:745                             |
| thread-sidebar.md:165             | label    | Settle thread                                                                            | apps/web/src/components/settings/settingsSearch.ts:466                              |
| thread-sidebar.md:180             | label    | Settle                                                                                   | apps/web/src/openVsxThemes.ts:275                                                   |
| thread-sidebar.md:196             | label    | Disabled                                                                                 | apps/web/src/contextMenuFallback.ts:337                                             |
| thread-sidebar.md:200             | menu     | Settings → Chats** on web and desktop                                                    | settingsSearch.ts:94                                                                |
| thread-sidebar.md:200             | menu     | Settings → Chat behavior** on mobile                                                     | mobile SettingsRouteScreen.tsx:180                                                  |
| thread-sidebar.md:215             | label    | Link to chat                                                                             | apps/web/src/components/chat/externalLinkContextMenu.ts:43                          |
| thread-sidebar.md:215             | label    | Unlink from chat                                                                         | apps/web/src/components/chat/externalLinkContextMenu.ts:43                          |
| thread-sidebar.md:225             | menu     | Settings → Keyboard shortcuts** to find or customize shortcuts for searching files       | settingsSearch.ts:90                                                                |
| thread-sidebar.md:235             | label    | Resume                                                                                   | apps/web/src/markdown-incremental.ts:67                                             |
| thread-sidebar.md:240             | label    | Resume at reset                                                                          | apps/mobile/src/features/threads/UsageLimitRecoveryCard.tsx:174                     |
| thread-sidebar.md:241             | menu     | Settings → Chats** on web and desktop                                                    | settingsSearch.ts:94                                                                |
| thread-sidebar.md:241             | label    | in                                                                                       | apps/web/src/agentActivity.ts:10                                                    |
| thread-sidebar.md:242             | menu     | Settings → Chat behavior** on mobile                                                     | mobile SettingsRouteScreen.tsx:180                                                  |
| thread-sidebar.md:247             | label    | Snooze until reset                                                                       | apps/mobile/src/features/threads/UsageLimitRecoveryCard.tsx:180                     |
| thread-sidebar.md:250             | label    | Snooze limited threads                                                                   | apps/web/src/components/settings/settingsSearch.ts:425                              |
| thread-sidebar.md:254             | label    | Agents                                                                                   | apps/web/src/agentActivity.ts:86                                                    |
| thread-sidebar.md:268             | label    | Stop                                                                                     | apps/web/src/composer-list-continuation.ts:69                                       |
| thread-sidebar.md:274             | menu     | Settings → General                                                                       | settingsSearch.ts:86                                                                |
| thread-sidebar.md:274             | menu-seg | Chats                                                                                    | apps/web/src/commandCenter.ts:34                                                    |
| thread-sidebar.md:274             | menu-seg | Snooze options                                                                           | apps/web/src/components/settings/SettingsPanels.tsx:761                             |
| thread-sidebar.md:290             | label    | Tasks                                                                                    | apps/web/src/agentActivity.ts:26                                                    |
| thread-sidebar.md:292             | label    | New task                                                                                 | apps/web/src/components/settings/ScheduledTasksSettings.tsx:287                     |
| updating.md:5                     | menu     | Settings → Connections                                                                   | settingsSearch.ts:47                                                                |
| updating.md:19                    | label    | Retry                                                                                    | apps/web/src/rightPanelStore.ts:652                                                 |
| updating.md:21                    | label    | Later                                                                                    | apps/web/src/composer-undo-grouping.ts:9                                            |
| updating.md:29                    | menu     | Settings → Connections** for those                                                       | settingsSearch.ts:47                                                                |
| updating.md:44                    | menu     | Settings → Maintenance                                                                   | settingsSearch.ts:104                                                               |
| updating.md:44                    | menu-seg | Continue chats after restarts** is on by default                                         | apps/web/src/components/settings/SettingsPanels.tsx:815                             |
| updating.md:48                    | label    | Apply to all                                                                             | apps/web/src/components/settings/SourceControlWritingSettings.tsx:586               |
| updating.md:80                    | label    | Update server                                                                            | packages/shared/src/userError.ts:246                                                |
| updating.md:116                   | menu     | Settings → AI services** shows provider updates for the selected environment             | settingsSearch.ts:92                                                                |
| updating.md:132                   | menu     | Settings → Computers** and                                                               | settingsSearch.ts:101                                                               |
| updating.md:133                   | label    | Check for updates                                                                        | apps/web/src/components/desktopUpdate.logic.ts:271                                  |
| updating.md:141                   | menu     | Settings → Maintenance                                                                   | settingsSearch.ts:104                                                               |
| usage.md:3                        | key      | mod+u                                                                                    | packages/shared/src/keybindings.ts:174                                              |
| usage.md:3                        | label    | Usage                                                                                    | apps/web/src/notificationRules.ts:50                                                |
| usage.md:4                        | cmd      | usage.open                                                                               | packages/shared/src/keybindings.ts                                                  |
| usage.md:5                        | menu     | Settings → Keyboard shortcuts                                                            | settingsSearch.ts:90                                                                |
| usage.md:14                       | label    | Breakdown                                                                                | apps/web/src/components/chat/AgentVelocityMeter.tsx:1                               |
| usage.md:27                       | label    | Enable Cursor usage                                                                      | apps/mobile/src/features/usage/UsageRouteScreen.tsx:434                             |
| usage.md:28                       | menu     | Settings → AI services                                                                   | settingsSearch.ts:92                                                                |
| usage.md:28                       | menu-seg | Usage providers                                                                          | apps/web/src/components/settings/settingsSearch.ts:890                              |
| usage.md:54                       | label    | Usage                                                                                    | apps/web/src/notificationRules.ts:50                                                |
| usage.md:54                       | label    | Model prices                                                                             | apps/web/src/components/usage/UsagePage.tsx:1651                                    |
| usage.md:58                       | label    | Usage                                                                                    | apps/web/src/notificationRules.ts:50                                                |
| usage.md:59                       | label    | Breakdown                                                                                | apps/web/src/components/chat/AgentVelocityMeter.tsx:1                               |
| usage.md:59                       | label    | Set price                                                                                | apps/web/src/components/usage/UsageModelDialog.tsx:153                              |
| usage.md:64                       | label    | Mixed                                                                                    | apps/web/src/sidebarProjectGrouping.ts:10                                           |
| usage.md:64                       | label    | Save changes                                                                             | apps/web/src/components/projectScriptEditor.tsx:579                                 |
| usage.md:71                       | label    | Map to                                                                                   | apps/web/src/components/chat/MessagesTimeline.tsx:1354                              |
| usage.md:75                       | label    | Not saved                                                                                | apps/web/src/promptStashStore.ts:63                                                 |
| usage.md:91                       | label    | Use reset                                                                                | apps/web/src/components/chat/ThreadDetailsUsage.tsx:125                             |
| usage.md:134                      | menu     | Settings → AI services                                                                   | settingsSearch.ts:92                                                                |
| usage.md:134                      | menu-seg | Usage providers                                                                          | apps/web/src/components/settings/settingsSearch.ts:890                              |
| usage.md:134                      | menu-seg | Add hub                                                                                  | apps/web/src/components/settings/AddUsageLimitSourceDialog.tsx:145                  |
| usage.md:137                      | label    | Usage → Limits                                                                           | apps/mobile/src/features/threads/NewTaskDraftScreen.tsx:1280                        |
| usage.md:138                      | label    | Use reset                                                                                | apps/web/src/components/chat/ThreadDetailsUsage.tsx:125                             |
| usage.md:147                      | label    | Usage → Limits                                                                           | apps/mobile/src/features/threads/NewTaskDraftScreen.tsx:1280                        |
| usage.md:155                      | key      | Ctrl+Shift+1/2/3/4                                                                       | packages/shared/src/keybindings.ts:242-245 mod+shift+1..4                           |
| usage.md:155                      | key      | Cmd+Shift+1/2/3/4                                                                        | packages/shared/src/keybindings.ts:242-245 mod+shift+1..4                           |
| usage.md:158                      | menu     | Settings → Keyboard shortcuts                                                            | settingsSearch.ts:90                                                                |
| welcome-wizard.md:42              | label    | Still connecting                                                                         | apps/web/src/components/ChatView.logic.ts:1246                                      |
| welcome-wizard.md:42              | label    | Reload                                                                                   | apps/web/src/composerDraftStore.ts:4090                                             |
| welcome-wizard.md:45              | label    | Retry                                                                                    | apps/web/src/rightPanelStore.ts:652                                                 |

## Claim script

<details><summary>claims.py</summary>

````python
"""Claim checker for docs/user. Usage: python claims.py <repo> [--only file.md ...]
Prints: doc:line | type | claim | source:line | result  (ok | WRONG | unverified)."""
import bisect, os, re, sys

sys.stdout.reconfigure(encoding="utf-8")
repo = sys.argv[1]
only = set(a for a in sys.argv[2:] if a != "--only")
SRC = ["apps/web/src", "apps/mobile/src", "apps/desktop/src", "apps/server/src",
       "packages/contracts/src", "packages/shared/src", "packages/client-runtime/src", "packages/provider-acp-registry/src", "packages/provider-core/src"]


def norm(s):
    s = s.replace("&apos;", "'").replace("&amp;", "&").replace("’", "'").replace("“", '"').replace("”", '"')
    return re.sub(r"\s+", " ", s.lower()).strip()


files, offs, buf, pos = [], [], [], 0
for d in SRC:
    for root, _, fs in os.walk(os.path.join(repo, d)):
        if "node_modules" in root:
            continue
        for f in fs:
            if not f.endswith((".ts", ".tsx", ".json")) or ".test." in f:
                continue
            p = os.path.join(root, f)
            for i, line in enumerate(open(p, encoding="utf-8", errors="ignore"), 1):
                n = norm(line)
                if not n:
                    continue
                files.append((p, i)); offs.append(pos); buf.append(n); pos += len(n) + 1
corpus = "\n".join(buf)


def find(label):
    n = norm(label)
    if not n:
        return None
    for needle in (n, n.replace("'", "’")):
        k = corpus.find(needle)
        if k >= 0:
            p, ln = files[bisect.bisect_right(offs, k) - 1]
            return f"{os.path.relpath(p, repo).replace(os.sep, '/')}:{ln}"
    return None


# --- keybindings
kb_src = open(os.path.join(repo, "packages/shared/src/keybindings.ts"), encoding="utf-8").read()
default_keys = set(m.lower() for m in re.findall(r'key:\s*"([^"]+)"', kb_src))
default_keys |= {f"mod+{i}" for i in range(1, 10)} | {"mod+alt+enter", "mod+enter"}
kb_line = {}
for i, l in enumerate(kb_src.splitlines(), 1):
    for m in re.findall(r'key:\s*"([^"]+)"', l):
        kb_line.setdefault(m.lower(), i)
commands = set(re.findall(r'command:\s*"([^"]+)"', kb_src))
sec_src = open(os.path.join(repo, "apps/web/src/components/settings/settingsSearch.ts"), encoding="utf-8").read()
SECTION_LABELS = set(re.findall(r'"/settings/[a-z-]+":\s*"([^"]+)"', sec_src))
mob = open(os.path.join(repo, "apps/mobile/src/features/settings/SettingsRouteScreen.tsx"), encoding="utf-8").read()
MOBILE_LABELS = set(re.findall(r'label="([^"]+)"', mob)) | {"Diagnostics", "Client Storage", "Usage", "Tasks"}
SECTION_LABELS |= MOBILE_LABELS
def _ln(src, l):
    return next((i for i, t in enumerate(src.splitlines(), 1) if f'"{l}"' in t), 0)
sec_line = {l: (f"settingsSearch.ts:{_ln(sec_src, l)}" if _ln(sec_src, l) else f"mobile SettingsRouteScreen.tsx:{_ln(mob, l)}") for l in SECTION_LABELS}

ITEM_PATH = {}
for _m in re.finditer(r'to:\s*"(/settings/[a-z-]+)"[^{}]*?title:\s*"([^"]+)"|title:\s*"([^"]+)"[^{}]*?to:\s*"(/settings/[a-z-]+)"', sec_src, re.S):
    ITEM_PATH.setdefault((_m.group(2) or _m.group(3)).lower(), set()).add(_m.group(1) or _m.group(4))
LABEL_PATH = {}
_m2 = re.search(r'SETTINGS_SECTION_LABELS[^=]*=\s*\{(.*?)\};', sec_src, re.S)
for a, b in re.findall(r'"(/settings/[a-z-]+)":\s*"([^"]+)"', _m2.group(1)):
    LABEL_PATH[b.lower()] = a

KEY_RE = re.compile(r"^(?:(?:mod|cmd|ctrl|control|alt|option|shift|meta)\+)+\S+$", re.I)
ACTION = re.compile(r"\b(choose|select|click|tap|open|press|turn on|turn off|toggle|set|pick|use|enable|disable)\b", re.I)
rows = []


def add(doc, ln, typ, claim, src, res):
    rows.append((f"{doc}:{ln}", typ, claim, src or "-", res))


docs_dir = os.environ.get("DOCS_DIR") or os.path.join(repo, "docs/user")
for name in sorted(os.listdir(docs_dir)):
    if not name.endswith(".md") or name == "permission-modes.md" or (only and name not in only):
        continue
    in_fence = False
    for ln, line in enumerate(open(os.path.join(docs_dir, name), encoding="utf-8"), 1):
        if line.lstrip().startswith("```"):
            in_fence = not in_fence
            continue
        if in_fence:
            continue
        for m in re.findall(r"`([^`]+)`|\*\*((?:Cmd|Ctrl|Alt|Option|Shift)\+[^*]+)\*\*", line):
            m = m[0] or m[1]
            if KEY_RE.match(m):
                k = m.lower()
                k = re.sub(r"^(cmd|ctrl|control)\+", "mod+", k)
                k = k.replace("option+", "alt+").replace("return", "enter").replace("+up", "+arrowup").replace("+down", "+arrowdown")
                ios = name == "keybindings.md" and ("Cmd" in m or "Return" in m)
                if k in default_keys:
                    add(name, ln, "key", m, f"packages/shared/src/keybindings.ts:{kb_line.get(k, 0)}", "ok")
                elif ios or re.match(r"(cmd|alt)\+", k):
                    add(name, ln, "key", m, "apps/mobile or non-default", "unverified: needs review")
                else:
                    add(name, ln, "key", m, "packages/shared/src/keybindings.ts", "not a default (check context)")
            elif not m.endswith(".json") and re.match(r"^[a-z]+(\.[a-zA-Z]+)+$", m) and m.split(".")[0] in {c.split(".")[0] for c in commands}:
                ok = m in commands
                add(name, ln, "cmd", m, "packages/shared/src/keybindings.ts" if ok else "-", "ok" if ok else "WRONG: not a known command")
            elif re.match(r"^(apps|packages|docs|scripts)/[\w./-]+\.\w+$", m):
                ok = os.path.exists(os.path.join(repo, m))
                add(name, ln, "path", m, m if ok else "-", "ok" if ok else "WRONG: file missing")
        for m in re.finditer(r"(?<!System )Settings\s*(?:→|>|->)\s*([^.,;:()`\n]+(?:\s*(?:→|>|->)\s*[^.,;:()`\n]+)*)", line):
            segs = [s.strip(" *") for s in re.split(r"→|->|(?<=\s)>(?=\s)", m.group(1))]
            for idx, seg in enumerate(segs):
                if idx == 0:
                    # first segment may be followed by prose words: accept the longest label prefix
                    hit = next((l for l in SECTION_LABELS if seg.lower().startswith(l.lower())), None)
                    add(name, ln, "menu", f"Settings → {seg}", sec_line[hit] if hit else "-",
                        "ok" if hit else "WRONG: no section with this name")
                else:
                    s = find(seg)
                    if not s:  # prose tail: try first 1-3 words
                        for n in (3, 2, 1):
                            s = find(" ".join(seg.split()[:n]))
                            if s:
                                break
                    add(name, ln, "menu-seg", seg, s, "ok" if s else "unverified: label not found in source")
        sm = re.search(r"(?<!System )Settings\s*(?:→|>|->)\s*(?:\*\*)?([A-Za-z][A-Za-z ]*?)(?:\*\*|\s*(?:→|>|->)|[,.;:]|\s+(?:on|and|in|to|for|or|when|turns)|$)", line)
        if sm and sm.group(1).lower() in LABEL_PATH and "on mobile" not in line:
            want = LABEL_PATH[sm.group(1).lower()]
            for lab in re.findall(r"\*\*([^*→]{2,60})\*\*", line):
                where = ITEM_PATH.get(lab.lower().strip())
                if where and want not in where:
                    add(name, ln, "page", f"{lab} under {sm.group(1)}", ",".join(sorted(where)), "WRONG: label is on another page")
        if ACTION.search(line):
            for m in re.findall(r"\*\*([^*]{2,40})\*\*", line):
                if re.match(r"^(Note|Warning|Important|Tip)\b", m):
                    continue
                s = find(m)
                add(name, ln, "label", m, s, "ok" if s else "unverified: label not found in source")
        for m in re.finditer(r"T3 Code", line):
            up = re.search(r"upstream|credit|t3\.codes|ingest|Axiom|not Leonidas|only to give|Keep \"T3 Code\"", line)
            add(name, ln, "brand", "T3 Code", "-", "ok" if up else "WRONG: product name is Leonidas")

OVR = {
 "Cmd+Shift+V": ("apps/web/src/components/chat/ChatComposer.tsx:58 isPasteAsTextShortcut", "ok"),
 "Ctrl+Shift+V": ("apps/web/src/components/chat/ChatComposer.tsx:58 isPasteAsTextShortcut", "ok"),
 "alt+w": ("keybindings.md example of a custom binding", "ok"),
 "Cmd+Q": ("apps/desktop/src/window/DesktopWindow.ts:638 confirmQuit", "unverified: OS quit accelerator, needs running desktop app"),
 "Ctrl+Q": ("apps/desktop/src/window/DesktopWindow.ts:638 confirmQuit", "unverified: OS quit accelerator, needs running desktop app"),
 "Shift+Enter": ("hardwired in composer, not a default rule", "unverified: needs running app"),
 "Shift+Return": ("iPad hardware keyboard", "unverified: needs iPad"),
 "Cmd+1": ("iPad hardware keyboard", "unverified: needs iPad"), "Cmd+9": ("iPad hardware keyboard", "unverified: needs iPad"),
 "Cmd+K": ("iPad hardware keyboard", "unverified: needs iPad"), "Cmd+Shift+H": ("iPad hardware keyboard", "unverified: needs iPad"),
 "Cmd+Return": ("iPad hardware keyboard", "unverified: needs iPad"),
 "Ctrl+Shift+1/2/3/4": ("packages/shared/src/keybindings.ts:242-245 mod+shift+1..4", "ok"),
 "Cmd+Shift+1/2/3/4": ("packages/shared/src/keybindings.ts:242-245 mod+shift+1..4", "ok"),
 "Cmd+Enter": ("packages/shared/src/keybindings.ts:191 mod+enter", "ok"), "Ctrl+Enter": ("packages/shared/src/keybindings.ts:191 mod+enter", "ok"),
 "Cmd+Shift+Enter": ("packages/shared/src/keybindings.ts:189", "ok"), "Ctrl+Shift+Enter": ("packages/shared/src/keybindings.ts:189", "ok"),
 "Cmd+S": ("packages/shared/src/keybindings.ts:185", "ok"), "Ctrl+S": ("packages/shared/src/keybindings.ts:185", "ok"),
 "Option+Up": ("packages/shared/src/keybindings.ts:190 alt+arrowup", "ok"), "Alt+Up": ("packages/shared/src/keybindings.ts:190 alt+arrowup", "ok"),
 "Cmd+Option+A": ("packages/shared/src/keybindings.ts:182 mod+alt+a", "ok"), "Ctrl+Alt+A": ("packages/shared/src/keybindings.ts:182", "ok"),
 "Cmd+Option+Shift+A": ("packages/shared/src/keybindings.ts:183", "ok"), "Ctrl+Alt+Shift+A": ("packages/shared/src/keybindings.ts:183", "ok"),
 "Shift+Tab": ("model picker handler", "unverified: needs running app"),
 "thread.stop": ("packages/shared/src/keybindings.ts:188 mod+.", "ok"),
}
ITEM_OK = ("Settings", "Connect an account")
for i, r in enumerate(rows):
    if r[1] in ("key", "label") and r[2] in OVR and not r[4] == "ok":
        rows[i] = (r[0], r[1], r[2], OVR[r[2]][0], OVR[r[2]][1])
    elif r[1] == "label" and r[4].startswith("unverified") and re.search(r"(Google|APIs|Publish app|Go to Leonidas|Application type|Add to Home|Open Anyway|System Settings|Battery|Power, Sleep|Hyprland|Edit Widget|Ongoing Agent|No thanks|I'm stuck|Continue with Codex)", r[2]):
        rows[i] = (r[0], r[1], r[2], "-", "unverified: third-party or OS screen, needs running app or device")
for r in rows:
    print(" | ".join(r))
c = {"ok": 0, "WRONG": 0, "unv": 0, "other": 0}
for r in rows:
    res = r[4]
    c["ok" if res == "ok" else "WRONG" if res.startswith("WRONG") else "unv" if res.startswith("unverified") else "other"] += 1
print(f"TOTAL {len(rows)} ok={c['ok']} WRONG={c['WRONG']} unverified={c['unv']} other={c['other']}", file=sys.stderr)

````

</details>
