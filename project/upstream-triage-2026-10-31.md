# Upstream T3 Code triage: Oct 24 to 31

Scope: 1,311 first-parent commits on `upstream/main`, `8c0670b2be..7195b69954` (2026-10-31). Jake asked for the full 7 days, including commits already reviewed on Oct 28 and 30. Stable release: v0.1.6. Rules: [port card](../../../tasks/port-upstream-t3-code-oct-11-28-clusters-into-leonidas-code.md).

## How commits are marked

Ledger file: [`upstream-review-ledger.json`](./upstream-review-ledger.json). Each reviewed commit has a `verdict` and a date. The scan (`upstream_scan.py`) shows one tag per commit:

| Tag                                                          | Meaning                                                       |
| ------------------------------------------------------------ | ------------------------------------------------------------- |
| `IMPLEMENTED`                                                | Our git history cites the PR number. Read live, never stored. |
| `seen:port-now`, `seen:port-next`, `seen:later`, `seen:skip` | Reviewed, with a decision. Not implemented yet.               |
| `seen:seen`                                                  | Reviewed, no decision yet.                                    |
| `NEW`                                                        | Not in the ledger. Needs review.                              |

Change a verdict: `python -I .agents/skills/upstream-review/scripts/upstream_scan.py --since <sha> --set <verdict> <sha>...`

## Result

1,278 commits marked, 33 already implemented. Class counts: REVIEW 437, UI 407, SKIP 322, PORT-NEXT 64, PERF 48, PORTED 33.

## Port now (15 commits, 3 task cards)

| Batch       | Upstream                                               | What                                                                                        |
| ----------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| Secrets     | #24698, #24556, #27986, #23313, #24015                 | Tokens and signed URLs stay out of clone errors, traces and logs                            |
| Data safety | #24473, #24489, #16419                                 | No commit on a switched branch, no shared worktree delete offer, Claude stop does not hang  |
| Claude      | #21903, #20145, #26529, #25200, #23481, #23281, #22654 | MCP prompts, command approvals, diff view, usage, resume dialog, `--add-dir`, context meter |

## Port next

- #27252 Stop always completes (overlap 20/37, needs a plan).
- #26348 Electron 44.10.0 (CVE fix).
- About 35 more fixes for Codex, OpenCode, Cursor, ACP and Muse. Marked `port-next` in the ledger.

## Later

- UI features Jake picks one by one (PROTECTED files): #26901 side chats, #26154 pin projects, #19941 local commits in Diff, #28057 model and effort picker.
- Server perf batch, measure first ([bench](./upstream-bench-2026-10-30.md)): #27097, #27098, #27103, #27106, #27110, #27101.

## Skip

1Password and secret providers (#27115, #27746, #27044), linked machines (#16698, #17129, #17130, #16719), T3 Connect, GitHub star prompt (#27832), mobile, marketing, release, nightly. About 320 commits tagged by rule.
