# Upstream T3 Code triage: Nov 4 to 11

Scope: 634 commits on `upstream/main` (`34701646e3..6e21f81461`). Digest: [upstream-review-latest.md](./upstream-review-latest.md). Rules: ADR-0096 (real merges by stage, hotfix only by exception).

Classes: 36 PORT-NEXT, 180 UI, 38 PERF, 212 REVIEW, 167 SKIP, 1 PORTED.

## Verdicts

| Verdict | Upstream                       | What                                                                          | Reason                                                          |
| ------- | ------------------------------ | ----------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Later   | #31646                         | Unreadable saved source control token no longer falls back to another account | Hotfix check: 38 predecessors, 2 conflicts. Wait for its stage. |
| Later   | #34176                         | Claude version errors from a custom endpoint                                  | Hotfix check: 96 predecessors, 2 conflicts. Wait for its stage. |
| Later   | #34106                         | Fable resets offered apart from weekly resets                                 | Overlap 10/11, usage area. Side-by-side check at the stage.     |
| Later   | #30323                         | Sends can start a fresh provider session                                      | Overlap 5/6.                                                    |
| Later   | #20058                         | Snooze pending input requests                                                 | Overlap 10/19.                                                  |
| Skip    | GitLab, OpenCode, Cursor items | Provider-specific fixes                                                       | Arrive with the stage merge. No hotfix needed.                  |

No hotfix is approved. No task card is needed.

## Next

Stage 2 is `v0.1.3`. Stage 1 landed as v0.124.103. Its follow-ups are in [the follow-up card](../../../tasks/close-the-catch-up-stage-1-follow-ups-tests-mobile-compiler-bailouts-provider-overrides.md).
