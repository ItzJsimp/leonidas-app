# Upstream T3 Code triage: header and Diff pane (2026-11-01)

Scope: three commits found by the first `/upstream-review` scan (2026-10-31), topic "header icons". None is about icons. They touch the git actions button and the Diff pane. Rules: [the port card](../../../tasks/port-upstream-t3-code-oct-11-28-clusters-into-leonidas-code.md). Soft fork: hand-port the idea.

## Port next

| Upstream | Commit       | What                                                       | Conflict risk                      | Card                                                                                |
| -------- | ------------ | ---------------------------------------------------------- | ---------------------------------- | ----------------------------------------------------------------------------------- |
| #24117   | `e9dd8a68ee` | Git actions button offers Commit when the branch is behind | Low: 2 lines in 2 files plus tests | [card](../../../tasks/port-upstream-commit-button-when-behind-upstream-t3-24117.md) |

Ported 2026-11-01 as `f2d1359473` on `port/24117-commit-behind` (`C:/lcw/up-port`, not pushed). The cherry-pick applied clean, and `isBehind` already existed in both functions. One of our old tests expected Commit, push & PR for this case. Upstream deleted that test earlier (#22557), so it was removed here.

## Port next, plan first

| Upstream | Commit       | What                                  | Conflict risk                                                                  | Card                                                                                      |
| -------- | ------------ | ------------------------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| #19941   | `5ef56853ef` | Review local commits in the Diff pane | High: 33 files, 1,375 lines. `DiffPanel.tsx` changed 27 times upstream, 3 ours | [card](../../../tasks/port-upstream-review-of-local-commits-in-the-diff-pane-t3-19941.md) |

Jake chose this on 2026-11-01. Skip `apps/mobile/src/features/review/reviewModel.ts`. A new RPC needs entries in 4 files (see the playbook gotchas).

## Later

| Upstream | Commit       | What                                                     | Why later                                                                                                        |
| -------- | ------------ | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| #27418   | `aaee7743f8` | Git actions panel stops re-rendering on streamed updates | Needs `useQuietThreadProjection`, which our tree lacks. It needs an earlier upstream commit. No measured number. |

## Newer commits, reviewed the same day (range `7195b69954..b50d8a1b15`)

| Upstream | Commit       | What                                                | Result                                                                                                                                                                                                                                     |
| -------- | ------------ | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| #28474   | `ce9e016406` | Interrupted scheduled task runs no longer stay busy | Ported by hand as `a5654cb536`. Reserve and release now run as one `acquireUseRelease`. The webhook queue part needs code we lack and is skipped. The new test fails on the old code and passes on the new code.                           |
| #28573   | `b50d8a1b15` | Space above PR detail metadata                      | Ported clean as `8d703f81e6`. One class added.                                                                                                                                                                                             |
| #28549   | `37d7615a91` | Desktop preview keeps host focus on pointer presses | Later. Needs `GuestInput.ts`, which our tree lacks (deleted in HEAD), so it needs an earlier upstream commit.                                                                                                                              |
| #28027   | `6328c84722` | `preview_open` goes straight to a dev-server port   | Later. It adds a `target` field to a tool every agent sees, so `agentContextBudget.json` and the evals change. The source files apply clean, only the tests and the budget conflict. Port it when the tool-list size change is acceptable. |

Branch `port/24117-commit-behind` in `C:/lcw/up-port` holds all three ports (#24117, #28474, #28573) as commits `f2d1359473`, `a5654cb536`, `8d703f81e6`. Not pushed.
