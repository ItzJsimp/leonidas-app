# Portability audit: shipped Leonidas on a clean Windows install (2026-11-19)

Goal: find each place where a shipped feature works only on the builder's machine, and prove the result on a clean Windows install.

## Time log

- **Start:** 2026-11-19 6:03:47 AM MST (`Get-Date`, first action).
- **End:** 2026-11-19 6:35:13 AM MST. Elapsed: 31 min 26 s.
- **Build under test:** v0.124.150 (latest published). Mock update test: v0.124.149 updated to v0.124.150.

## Result

| Rank                  | Count | Items                                                                                         |
| --------------------- | ----- | --------------------------------------------------------------------------------------------- |
| P0 (blocks first run) | 0     | The app installs, starts, and onboards with no AIOS, no provider, no Git, no Node, no `pwsh`. |
| P1 (a feature breaks) | 3     | VC++ runtime DLLs (fixed), offline start (fixed), AVX2 assumption (card, untested).           |
| P2 (rough edge)       | 8     | Cards below.                                                                                  |

Fixed and landed on `main` through the merge queue:

- `61af32e653` Fix: ship Scribe and the resource monitor without the VC++ runtime DLLs (merge `54e06e64ec`).
- `01f42c86af` Fix: connect to the local server when Windows reports no network (merge `7a11ab7ee2`).

## Method

1. **Static sweep:** `rg` per folder (`apps/server/src`, `apps/desktop/src`, `apps/web/src`, `packages`) for machine values, `pwsh`, `python`, `.ps1`, `.vbs`, ports, `CLAUDE_CONFIG_DIR`, `~/.t3` and AIOS paths.
2. **Clean VM:** `leo_local_vm_list` returned `available: false` (VirtualBox is not installed), so the VM tools could not drive a guest. Windows Sandbox ran instead, from a `.wsb` file. A guest script did the clicks and screenshots, and the host sent extra steps through a file drop.
   - Guest: Windows 11, user `WDAGUtilityAccount`, locale en-US, 4 GB RAM, vGPU off (no GPU), no Git, no Node, no `pwsh`, no `claude`, no `codex`, no `~/.t3`, no `~/.claude`.
   - Mapped: the installer folder (read-only), the guest script folder (read-only), and one evidence folder (read-write, screenshots and logs only). No AIOS, no `~/.t3`, no tokens. Deviation: the task asked for one mapped folder; the evidence folder was needed to bring screenshots out.
3. **Edge states:** run in the same guest (corrupt and empty settings, missing `~/.t3`, blocked port, Unicode and space path, offline, mock update feed).

## Feature matrix

| Feature                      | Host dependency                           | Behavior when it is missing                                                                          | Verdict                               |
| ---------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------- |
| Install and first launch     | None (per-user NSIS, `perMachine: false`) | Installs in 22 s as a standard per-user app                                                          | portable                              |
| Onboarding with no AIOS      | Writes `~/Leonidas AIOS`                  | Wizard creates the default folder; "Set up later" and "Skip" work                                    | portable                              |
| Providers and accounts       | `claude` or `codex` CLI, network          | Wizard says "Install Claude", "Continue with ChatGPT", "OpenRouter (free)", "Continue without an AI" | degrades gracefully                   |
| Chat                         | One connected provider                    | "Connect an AI first."                                                                               | degrades gracefully                   |
| Delegation                   | Two or more providers                     | Not reachable with no provider; code returns unavailable targets                                     | untested                              |
| Command Center               | AIOS for task, memory and automation data | Empty states with counts of 0 and "Add a task" links                                                 | degrades gracefully                   |
| Automations (Windows tasks)  | `pwsh` 7 (`windowsTasks.ts:61`)           | Misleading "Task Scheduler refused" error                                                            | degrades gracefully (card)            |
| Shared task board sync       | `gh` CLI and login                        | `TaskBoardReadError` reason `unavailable`                                                            | degrades gracefully                   |
| Prompt predictor             | Scribe `history.jsonl`                    | Returns no suggestions                                                                               | degrades gracefully                   |
| Scribe (voice)               | VC++ runtime DLLs, AVX2 CPU               | "MSVCP140.dll was not found" System Error on every start                                             | breaks, fixed `61af32e653`; AVX2 card |
| Resource monitor             | VC++ runtime DLL                          | `VCRUNTIME140.dll` missing                                                                           | breaks, fixed `61af32e653`            |
| Updater                      | GitHub releases, network                  | Mock feed: downloaded, "Update ready", applied on quit (0.124.149 to 0.124.150)                      | portable                              |
| Offline start                | None expected                             | Local environment showed "Offline", cards stayed placeholders                                        | breaks, fixed `01f42c86af`            |
| Terminal                     | `pwsh.exe` first                          | Falls back to `powershell.exe`, then `ComSpec` (`terminal/Manager.ts:574`)                           | portable                              |
| Server port                  | Port 3773                                 | Port 3773 blocked: server used 3774 (`DesktopApp.ts:105`)                                            | portable                              |
| Data folder                  | `~/.t3`                                   | Deleted: recreated. `T3CODE_HOME` with spaces and Unicode: works                                     | portable                              |
| Settings file                | `settings.json`                           | Corrupt or empty: app starts, no notice                                                              | degrades gracefully (card)            |
| AIOS starter folders command | Network (`irm` from raw GitHub)           | Fails offline or behind a proxy                                                                      | degrades gracefully (card)            |
| Network proxy                | Server HTTP calls                         | No proxy code in server or desktop                                                                   | untested (card)                       |
| VM panel (AI Desktop)        | VirtualBox                                | "Install VirtualBox on the Windows machine..."                                                       | degrades gracefully                   |
| Preview browser              | Bundled Electron                          | No host dependency found                                                                             | untested                              |
| Scheduled tasks              | Server process                            | No host dependency found                                                                             | untested                              |
| Projects and worktrees       | Git                                       | Settings say "Install Git on this computer" (`SourceControlSettings.tsx:492`)                        | degrades gracefully                   |
| Mobile pairing               | Network, relay                            | Not run in the guest                                                                                 | untested                              |
| Ponytail plugin install      | `node`                                    | Skipped without `node` (`PonytailEnsure.ts:83`)                                                      | degrades gracefully                   |

## Findings

| #   | Rank | Finding                                                                                                                                                                                                                                       | Proof                                                                                                                                                                                                                                                                                     | Status                                                                                                                                                                                                                                                                    |
| --- | ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | P1   | `scribe-engine.exe` built with `-MD` needs `MSVCP140.dll`, `VCRUNTIME140.dll`, `VCRUNTIME140_1.dll`. `t3-resource-monitor.exe` needs `VCRUNTIME140.dll`. A clean Windows has neither. A modal System Error shows on install and every launch. | [03-installed](./portability-audit-2026-11-19/03-installed.jpg), [04-first-launch-a](./portability-audit-2026-11-19/04-first-launch-a.jpg), `services/scribe-engine/.cargo/config.toml:10-11`, `dumpbin /dependents`                                                                      | Fixed `61af32e653`: `crt-static` in root `.cargo/config.toml`, `-MT` for whisper.cpp. Guest A/B: shipped engine blocked in the loader, static engine ran and exited 1 on a bad argument. Size: 8,107,520 to 8,578,048 bytes (engine), 390,656 to 482,304 bytes (monitor). |
| 2   | P1   | Offline start: with the network adapter off, the local environment shows "Offline" and Command Center cards stay as placeholders after 90 s. The connection supervisor waited on the OS offline report, also for `127.0.0.1`.                 | [12-offline-b](./portability-audit-2026-11-19/12-offline-b.jpg), [p2-17-offline-90s](./portability-audit-2026-11-19/p2-17-offline-90s.jpg), [p2-18-back-online-30s](./portability-audit-2026-11-19/p2-18-back-online-30s.jpg), `packages/client-runtime/src/connection/supervisor.ts:900` | Fixed `01f42c86af`: a loopback primary target treats "offline" as "unknown". `vp test run supervisor.test.ts`: 62 passed; the new test times out without the fix.                                                                                                         |
| 3   | P1   | Scribe engine forces AVX2, FMA and F16C (`services/scribe-engine/.cargo/config.toml`). CPUs without AVX2 can crash with an illegal instruction.                                                                                               | Code reading                                                                                                                                                                                                                                                                              | Card, untested                                                                                                                                                                                                                                                            |
| 4   | P2   | Windows task control calls `pwsh` only; ENOENT shows "Windows Task Scheduler refused the change".                                                                                                                                             | `apps/server/src/automations/windowsTasks.ts:61`                                                                                                                                                                                                                                          | Card                                                                                                                                                                                                                                                                      |
| 5   | P2   | AIOS starter folder command downloads `New-AiosFolders.ps1` from raw GitHub.                                                                                                                                                                  | `apps/web/src/onboarding/aiosFolders.logic.ts:87`                                                                                                                                                                                                                                         | Card                                                                                                                                                                                                                                                                      |
| 6   | P2   | Practice tasks and lane owners name the builders ("jake", "mob").                                                                                                                                                                             | `apps/web/src/components/taskBoard/practice.logic.ts:58`, `apps/server/src/taskBoard/aiosCards.ts:595`                                                                                                                                                                                    | Card                                                                                                                                                                                                                                                                      |
| 7   | P2   | Scribe word sync example path points into a builder-style AIOS folder on drive `D:`.                                                                                                                                                          | `apps/web/src/components/scribe/WordSyncRow.tsx:80`, `wordSync.logic.ts:13`                                                                                                                                                                                                               | Card                                                                                                                                                                                                                                                                      |
| 8   | P2   | Status rail shows a raw environment id and "Game Mode: Issue" on a new install.                                                                                                                                                               | [04-first-launch-a](./portability-audit-2026-11-19/04-first-launch-a.jpg)                                                                                                                                                                                                                 | Card                                                                                                                                                                                                                                                                      |
| 9   | P2   | First launch opens Command Center. The setup wizard shows only after the user opens Chat.                                                                                                                                                     | [04-first-launch-a](./portability-audit-2026-11-19/04-first-launch-a.jpg), [p2-02-chat-empty](./portability-audit-2026-11-19/p2-02-chat-empty.jpg)                                                                                                                                        | Card                                                                                                                                                                                                                                                                      |
| 10  | P2   | No proxy support for server HTTP calls.                                                                                                                                                                                                       | `rg` found no proxy code                                                                                                                                                                                                                                                                  | Card, untested                                                                                                                                                                                                                                                            |
| 11  | P2   | A corrupt `settings.json` is ignored with no notice and no backup.                                                                                                                                                                            | [08-corrupt-settings-b](./portability-audit-2026-11-19/08-corrupt-settings-b.jpg)                                                                                                                                                                                                         | Card                                                                                                                                                                                                                                                                      |

Task cards (AIOS `tasks/` folder):

- `ship-scribe-engine-and-resource-monitor-without-the-visual-c-runtime-dlls.md` (finding 1)
- `connect-to-the-local-leonidas-server-when-windows-reports-no-network.md` (finding 2)
- `check-that-the-scribe-engine-runs-on-cpus-without-avx2.md` (finding 3)
- `control-windows-tasks-without-powershell-7.md` (finding 4)
- `create-starter-aios-folders-without-a-network-download.md` (finding 5)
- `remove-builder-names-from-practice-tasks-and-lane-owners.md` (finding 6)
- `use-a-neutral-path-example-in-scribe-word-sync.md` (finding 7)
- `clean-up-the-status-rail-on-a-new-install.md` (finding 8)
- `show-the-setup-wizard-on-first-launch.md` (finding 9)
- `support-a-system-proxy-for-server-network-calls.md` (finding 10)
- `tell-the-user-when-settingsjson-is-unreadable.md` (finding 11)

## Clean-VM screenshots

Committed copies (JPEG, 1016 px wide). Full-size PNGs and guest logs: `C:/lcw/portability-sbx/out/` on the audit machine.

| Step                          | Screenshot                                                                            |
| ----------------------------- | ------------------------------------------------------------------------------------- |
| Clean desktop before install  | [01-clean-desktop](./portability-audit-2026-11-19/01-clean-desktop.jpg)               |
| Installed, Scribe DLL error   | [03-installed](./portability-audit-2026-11-19/03-installed.jpg)                       |
| First launch                  | [04-first-launch-a](./portability-audit-2026-11-19/04-first-launch-a.jpg)             |
| Onboarding with no AIOS       | [p2-02-chat-empty](./portability-audit-2026-11-19/p2-02-chat-empty.jpg)               |
| Provider empty state          | [p2-07-wizard-step2](./portability-audit-2026-11-19/p2-07-wizard-step2.jpg)           |
| After wizard, update ready    | [p2-10-send-no-provider](./portability-audit-2026-11-19/p2-10-send-no-provider.jpg)   |
| Message fails cleanly         | [p2-13-send-no-provider](./portability-audit-2026-11-19/p2-13-send-no-provider.jpg)   |
| Corrupt settings              | [08-corrupt-settings-b](./portability-audit-2026-11-19/08-corrupt-settings-b.jpg)     |
| No `~/.t3`, port 3773 blocked | [10-no-t3-port-blocked-b](./portability-audit-2026-11-19/10-no-t3-port-blocked-b.jpg) |
| Unicode and space data path   | [11-unicode-space-home-b](./portability-audit-2026-11-19/11-unicode-space-home-b.jpg) |
| Offline, 46 s                 | [12-offline-b](./portability-audit-2026-11-19/12-offline-b.jpg)                       |
| Offline, 90 s                 | [p2-17-offline-90s](./portability-audit-2026-11-19/p2-17-offline-90s.jpg)             |
| Back online, 30 s             | [p2-18-back-online-30s](./portability-audit-2026-11-19/p2-18-back-online-30s.jpg)     |

## Ledger

| Time (MST) | Check                                                                                     |
| ---------- | ----------------------------------------------------------------------------------------- |
| 6:04:07 AM | Start.                                                                                    |
| 6:04:34 AM | `leo_local_vm_list`: VirtualBox not installed. Windows Sandbox chosen.                    |
| 6:04:53 AM | v0.124.150 installer downloaded.                                                          |
| 6:05:27 AM | Sweep: `windowsTasks.ts:61` `pwsh` only. Terminal shell fallback OK. `perfMonitor` gated. |
| 6:06:03 AM | Sweep: port scan OK, AIOS roots null-safe, builder names and `D:\` example found.         |
| 6:07:27 AM | Sandbox pass 1 started.                                                                   |
| 6:07:58 AM | Task board needs `gh` (degrades). Predictor empty without history. No proxy code.         |
| 6:08:24 AM | Claude install uses `powershell.exe` (portable). Ponytail skips without `node`.           |
| 6:08:37 AM | Finding: `MSVCP140.dll` System Error after install.                                       |
| 6:09:26 AM | `dumpbin`: both native binaries need VC++ runtime DLLs.                                   |
| 6:11:37 AM | Corrupt settings: app starts.                                                             |
| 6:13:26 AM | Static CRT fix built in a claimed worktree.                                               |
| 6:13:40 AM | No `~/.t3` and port 3773 blocked: server on 3774. Empty settings: app starts.             |
| 6:14:46 AM | `T3CODE_HOME` with spaces and Unicode: works.                                             |
| 6:15:06 AM | Finding: offline launch, blank then "Offline".                                            |
| 6:15:26 AM | Pass 2 started: v0.124.149 plus in-guest mock update feed.                                |
| 6:15:47 AM | Static monitor: no CRT DLLs.                                                              |
| 6:18:40 AM | Wizard shows on Chat. Mock feed served `latest.yml` and the installer.                    |
| 6:19:16 AM | Provider empty state explains each next step.                                             |
| 6:19:56 AM | "Update ready" in the status rail.                                                        |
| 6:20:57 AM | First chat with no provider: "Connect an AI first."                                       |
| 6:21:31 AM | Update applied on quit: exe version 0.124.150.                                            |
| 6:23:55 AM | Offline 90 s: environment "Offline"; back online: loads in 30 s.                          |
| 6:27:42 AM | Offline fix and test written.                                                             |
| 6:31:51 AM | Guest A/B of the static Scribe engine passed.                                             |
| 6:33:04 AM | 9 finding cards written.                                                                  |
| 6:33:39 AM | Queue red on release-note wording; trailers fixed; queue re-run.                          |
| 6:34:59 AM | Both fixes landed.                                                                        |

## Retest of v0.124.152 (both fixes)

Clean Windows Sandbox, 2026-11-19 7:29 AM to 7:32 AM MST. The guest had no `vcruntime140.dll` and no `msvcp140.dll`.

| Check                                     | Result                                                    | Proof                                                                     |
| ----------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------- |
| System Error after install and after 40 s | None (0 windows)                                          | [p3-02-installed](./portability-audit-2026-11-19/p3-02-installed.jpg)     |
| `scribe-engine.exe --bogus`               | Exited with code 1 (the engine runs)                      | Guest ledger                                                              |
| Scribe and resource monitor               | Both processes run; the rail shows "Scribe On"            | [p3-03-online-40s](./portability-audit-2026-11-19/p3-03-online-40s.jpg)   |
| Offline start, 60 s                       | Cards load ("Updated just now"); server on 127.0.0.1:3773 | [p3-05-offline-60s](./portability-audit-2026-11-19/p3-05-offline-60s.jpg) |

Left over (P2): offline, the status rail still labels the local server "Offline". The data loads. This goes to the card `clean-up-the-status-rail-on-a-new-install.md`.

## Not checked

- Standard (non-admin) user, Windows 10, high DPI, light theme, non-English locale: Hyper-V was not used. The Sandbox user is an administrator with en-US.
- A real sign-in to Claude, Codex or OpenRouter: needs Jake's accounts.
- Delegation, preview browser, scheduled tasks, mobile pairing: not reachable with no provider in the time box.
