# Upstream T3 Code triage: secrets, Codex limits and long-thread fixes (2026-11-04)

Scope: scan of range `647bd148b3..34701646e3` (46 commits). Classes: UI 16, SKIP 16, REVIEW 11, PORT-NEXT 3. Stable release: v0.1.7. Rules: [the port card](../../../tasks/triage-upstream-t3-code-changes-into-leonidas-code.md). Soft fork: hand-port the idea. Jake approved this plan on 2026-11-04.

## Port now

| Upstream                                                               | What                                                      | Conflict risk                                   |
| ---------------------------------------------------------------------- | --------------------------------------------------------- | ----------------------------------------------- |
| Picker slices 1a to 1c (branch `feat/picker-effort-column`, 3 commits) | Push the new model picker to main                         | Low. Checked: typecheck, 59 of 59 tests, smoke. |
| #30257 (`9e85538535`)                                                  | Agents ask for secrets with `request_secret`, not in chat | Medium (7/10 files overlap)                     |
| #25341 (`935818e422`)                                                  | Codex usage-limit errors offer the recovery options       | Medium (6/8)                                    |

## Port next

| Upstream                  | What                                                              | Note                                                 |
| ------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------- |
| #28995                    | Thread note when model or effort changes                          | High. Cherry-pick failed before. Port the idea.      |
| #28952                    | Usage totals filter by provider and model                         | Usage page is PROTECTED. Side-by-side check first.   |
| #26435, #31071, #28204    | Old questions stay answerable, threads keep syncing, wakeups kept | Low                                                  |
| #30567, #30561 and 4 more | Perf for big repos and long threads                               | Measure first. Drop any change that moves no number. |

## Later

#29909 (needs notification routing). #30085, #29000 (small UI). #29803 (MCP Apps, large).

## Skip

Kiro, managed policies, shareable thread links, Gemini. #30474, #30501, #30523, #31028, #31111 (jose, crypto and tsgo refactors). #31269 (revert). Mobile and relay files.
