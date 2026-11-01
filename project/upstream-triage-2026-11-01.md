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

## Not reviewed in this pass

The scan range ended at `37d7615a91` and holds 3 newer commits outside the topic: #28474 (scheduled task runs stay busy after an interrupt), #28549 (desktop preview focus), #28027 (`preview_open` goes to a dev-server port). They are unchecked. The review marker in `upstream-review-state.json` stays at `7195b69954`, so the next scan lists them.
