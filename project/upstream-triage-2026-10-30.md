# Upstream T3 Code triage: Oct 28 to 30

Scope: 162 first-parent commits on `upstream/main` after the Oct 28 triage (head `3dd62dce70`, 2026-10-30). Rules come from the [port card](../../../tasks/port-upstream-t3-code-oct-11-28-clusters-into-leonidas-code.md). Method: [`triage.py`](../../../../../lcw/p5/triage.py) tags each commit by scope and folders, then a person reads the rest. Jake chose "triage now, then port the server-perf batch" on 2026-10-29.

## Port now: server-perf batch (branch `upstream-port/2026-10-30`)

| Upstream | Commit     | What                                                           |
| -------- | ---------- | -------------------------------------------------------------- |
| #27097   | `facaa08b` | SQLite reads stop queueing behind each other                   |
| #27098   | `dd148481` | Idle servers run 100x fewer background queries                 |
| #27099   | `624e70ec` | Thread recovery reads are 10x faster                           |
| #27103   | `7c29f2d2` | Git status runs in parallel, 3x fewer git processes            |
| #27105   | `22c37a8d` | Preparing a run is 15x faster                                  |
| #27106   | `8bf4822f` | Sidebar shell loads 3x faster                                  |
| #27102   | `3898c329` | Source control discovery no longer stalls on Bitbucket         |
| #27110   | `7f39a860` | Huge checkpoints ship up to 75x smaller (skip the mobile file) |
| #21329   | `c6f2b7db` | Checkpoint capture scans by record                             |
| #27101   | `65b0ab8c` | Dead connection routes are probed 30x less often               |
| #24194   | `a8e41888` | SQLite temp files no longer block the event loop               |
| #25696   | `0d51375e` | Thread lists load beyond the SQLite variable limit             |

Every claimed number needs a before and after measure on our tree. No claim without one.

### Result (2026-10-29, branch `upstream-port/2026-10-30` in `C:/lcw/up-port`)

5 of 12 ported, 7 not. Most of the big wins depend on earlier upstream server changes that our tree does not have. A hand port of them needs its own plan, like #25401.

| Upstream | Result         | Why                                                                                                                                                                   |
| -------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #24194   | Ported         | `temp_store = MEMORY`. Dropped the macOS-only `checkpoint_fullfsync` line from an earlier upstream commit. The new test is Linux-only, so it is skipped on Windows.   |
| #21329   | Ported         | Checkpoint capture scans by record. Test now runs with chunk sizes 1, 3 and 4096.                                                                                     |
| #25696   | Partial        | 4 of 7 id lists use `json_each`. The other 3 sit in code we do not have.                                                                                              |
| #27099   | Ported         | Two indexes on active turn items. Migration renumbered from 73 to 66 (our migrations end at 65).                                                                      |
| #27102   | Ported         | Bitbucket discovery. Skipped the registry test helper change.                                                                                                         |
| #27110   | Not ported     | Mixes server and web chat changes. Web chat files conflict (`ChatView.logic.ts`, `ChangedFilesTree.tsx`, `TimelineAssistantRows.tsx`). Wait for the #25401 chat plan. |
| #27106   | Not ported     | 13 conflicting server files (Orchestrator, ProjectionStore, ShellStream, ws and others).                                                                              |
| #27105   | Not applicable | Our tree has no `prepareRun` or `scheduleRunPreparation`.                                                                                                             |
| #27097   | Not ported     | Needs the reader-worker pool code that our `nodeSqliteClient.ts` lacks (700 line conflict).                                                                           |
| #27103   | Not ported     | Conflicts in `GitVcsDriverCore.ts`, `VcsProcess.ts` and two tests.                                                                                                    |
| #27101   | Not ported     | Conflicts in the connection `driver.ts` and `supervisor.ts`.                                                                                                          |
| #27098   | Not ported     | Conflicts in 6 files (settings, scheduled tasks, database storage).                                                                                                   |

Migration numbers: ours and upstream's now differ from number 61 on. Any future upstream migration port must take our next free number.

## Port next: security and provider fixes (own batch)

- **Secrets:** #24698 `1cc9d413` clone errors hide URL tokens; #24556 `4afdabab` signed URLs stay out of traces; #23313 `67afdd56` and #24015 `49d01424` redact credential keys; #25222 `7860ee98` pairing codes.
- **Kept providers:** Claude #23281 `c9d3f7c9`, #26529 `eb565e13`, #20145 `5eebf77b`; OpenCode #25230 `d796063f`; Cursor #26592 `37a9ca04`; ACP #26647 `b2871029`; usage limit refresh #26234 `8298664e`.
- **Desktop:** Electron 44.10.0 for a Node.js Brotli CVE fix, #26348 `6d82a22e`.

## Later: UI features (Jake picks)

#25737 file explorer resize; #26904 thread details card choices; #26767 turn a No project thread into a project; #26164 fall back when the default provider is out of usage; #26859 Labs limits toggle; #25588 PR maintainer edits; #26730 PR diff follows the file tree.

## Skip

- Mobile, devices (Simlock, Android EAS), marketing, release notes, Stable and Nightly fleet switch, GitCafe: 38 commits tagged by rule.
- Composer rich text toggle #26777: upstream reverted it (#27390).
- Antigravity, 1Password secret providers, Copilot, nixpkgs, Linux-only and Android-only fixes.
- `t3 service protect` and agent CPU yield (#27239, #27176): cloud and service features we do not ship.
- #26727 (timeline perf) is already ported.
