# Upstream T3 Code triage: model picker, switch note and unmerged ports (2026-11-03)

Scope: scan of range `61c3794c32..647bd148b3` (195 commits). Classes: REVIEW 108, UI 29, SKIP 29, PORT-NEXT 16, PERF 13. Rules: [the port card](../../../tasks/triage-upstream-t3-code-changes-into-leonidas-code.md). Soft fork: hand-port the idea. Jake approved this plan on 2026-11-03.

Jake asked for upstream #28845 and a bullet list. #28845 is an open "DO NOT MERGE" workspace-panes redesign (part 6 of a 6-PR stack). The bullets match release-note features, so they map to the commits below.

## Port now

| Upstream                                                                                                                      | What                                                                                                 | Conflict risk                                          |
| ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Branches `port/24117-commit-behind` (77 ahead of main), `upstream-port/batch-2026-11-01` (47), `upstream-port/git-lease` (63) | Merge finished, tested ports into main: #24117, #28474, #28573, #29168, #27320, #27703 and the batch | Medium. Check each branch for unrelated commits first. |
| #28076, #28409, #28307, #28162, #28044, #26881, #29017, #26415, #23493                                                        | Model picker polish: stays open, fixed position, short windows, IME, Default or check mark           | Medium. We changed `ModelPickerContent.tsx` 9 times.   |

## Port next

| Upstream                               | What                                                                            | Note                                                                                              |
| -------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| #28057 (`c96c1b69f5`)                  | One control for model and effort (Jake's screenshot)                            | High. New 476-line `ComposerModelEffort.tsx`. Port in slices. Keep our readiness badge and stars. |
| #28995 (`c65f8d552b`)                  | Thread note when you switch model or effort                                     | Medium. Server `modelSwitch.ts`, contracts, web rows. Skip the mobile files.                      |
| #28952 (`e6e2ab05cc`)                  | Usage totals filter by provider and model                                       | Usage page is PROTECTED. Side-by-side check first.                                                |
| #29909, #29582                         | Subagent questions reach a busy parent. Codex checkpoint restore after archive. | Low to medium.                                                                                    |
| #30561, #29806, #30357, #30359, #29971 | Perf for big repos and long threads                                             | Measure first. Drop any change that moves no number.                                              |

## Later

#19941 Diff pane local commits (plan first). #28010, #27468, #27381 (need #22709 and rollback code). #28027, #28549 (need budget and `GuestInput.ts`). #29398, #29419 Cursor (high overlap).

## Skip

#28845 workspace panes (open, experimental, clashes with our sidebar). Gemini (no provider upstream, not kept). #14693 Kiro. #26833 Effect upgrade. #27756 and #27760 secret-provider tokens (Settings).

## Port results (2026-11-03, none pushed)

| Branch (in `C:/lcw/up-port`)      | Ported                 | Result                                                                                                                          |
| --------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `port/picker-polish-2026-11-03-b` | #23493                 | Done by hand, typecheck and release-note check pass                                                                             |
| `port/server-fixes-2026-11-03`    | #29582                 | Done by hand, new test fails without the fix                                                                                    |
| `port/provider-fixes-2026-11-03`  | #29910, #29605, #29748 | Done. #29748 needed a helper from an earlier upstream commit. 72 of 73 tests pass, the 1 failure also happens on `origin/main`. |

Not portable by cherry-pick or small hand port: #29909 (notification routing missing), #28995 (heavy conflicts, deleted files), #29757 (plugin discovery code missing), #28631, #29824, #29765, #29819, #30201 (OpenCode and ACP tests conflict). #29008, #29105 conflict in files we restructured.

**Pushed 2026-11-03:** all three branches, combined as `5f2c28d1de..c8ccdd8c8e` on `origin/main`.
