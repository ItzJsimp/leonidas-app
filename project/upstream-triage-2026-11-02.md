# Upstream T3 Code triage: provider fixes and server perf (2026-11-02)

Scope: full scan of range `b50d8a1b15..61c3794c32` (315 commits). Classes: REVIEW 132, UI 75, PERF 46, SKIP 38, PORT-NEXT 24. Rules: [the port card](../../../tasks/triage-upstream-t3-code-changes-into-leonidas-code.md). Jake approved this plan on 2026-11-02.

## Port now

| Upstream | Commit       | What                                                              | Conflict risk           |
| -------- | ------------ | ----------------------------------------------------------------- | ----------------------- |
| #28010   | `692dd9ce6f` | Claude: a background-task wake no longer hangs the run            | Low: 2 files, 29 lines  |
| #29168   | `30b9c4a956` | Codex: a background-command wake no longer hangs on a split emoji | Low: 2 files, 61 lines  |
| #27703   | `727a502816` | Cursor: a write-after-end error no longer stops the server        | Low: 2 files            |
| #27320   | `41588d4520` | Claude: approval cards close when Claude withdraws the request    | Low: 2 files, 126 lines |
| #27468   | `aac4c15522` | Delegated tasks finish when the child leaves a watcher running    | Medium: overlap 2/4     |
| #27381   | `0c6c721aea` | Claude threads revert to the right message after /compact         | Medium: overlap 3/4     |

## Port next

| Upstream       | Commit                     | What                                                            | Note                                      |
| -------------- | -------------------------- | --------------------------------------------------------------- | ----------------------------------------- |
| #29582         | `ba962f2d23`               | Codex: checkpoint restore works after the session is archived   | Low risk                                  |
| #23690         | `71a7bf9516`               | Agent session scans no longer hang on an unreadable .git/config | 458 lines. Port the idea, not the commit  |
| #29101, #29652 | `e0513631af`, `71646e031a` | Server reads fewer threads per burst and per cancel             | Measure first. Drop it if no number moves |

## Later

| Upstream               | Why later                                                                                                      |
| ---------------------- | -------------------------------------------------------------------------------------------------------------- |
| #22661, #27779, #29221 | OpenCode 2.x compaction, upgrade and fork fixes. Port as one batch when we move to OpenCode 2.                 |
| #29398, #29419         | Cursor /compact and usage. High overlap (8/9, 5/11). Needs a side-by-side check.                               |
| UI lines (75)          | Held. Jake approves UI changes one by one. PROTECTED lines (#26690, #29480, #28298) need a side-by-side check. |

## Skip

#14693 Kiro (not a kept provider), #27756 secret-provider tokens (Settings), #26833 Effect upgrade (overlap 135/352), #29053 thread tags (overlap 23/47).

Open check: #27822 (Chrome security fixes) is not a code port. Check which Chromium our Electron build ships.
