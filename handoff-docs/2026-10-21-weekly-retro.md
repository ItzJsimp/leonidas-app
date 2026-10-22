# Weekly retro: 2026-10-14 to 2026-10-21

Sources: `git log` of this repo (456 non-merge commits), `git log -- tasks` of the AIOS (card status changes), `handoff-docs/` (no new file since 2026-10-16).

## Shape of the week

- 192 `feat`, 153 `fix`, 23 `docs`, 15 `test`, 7 `perf`.
- 49 of the fixes are `fix(server)`. Most are single-fix ports from upstream T3 Code (the subject ends in `(#NNNNN)`).
- Hot files: `apps/server/src/ws.ts` (37 commits), `packages/contracts/src/rpc.ts` (31), `RpcInstrumentation.ts` (30), `RpcAuthorization.ts` (29). Each new RPC touches four to five files by hand.

## Time sink 1: full upstream merge, then six reverts and a policy change

- **Evidence:** six reverts on 2026-10-18: `e092301504`, `60861355e1`, `0dfd9f614d`, `9860e97be1`, `0680e7bdca`, `7362e73c46`. Each undoes an imported upstream fix. The same evening `b10dec2b4d` records the soft fork policy and adds a 1,255-line `project/upstream-ledger.md` (1,093 upstream commits, 241 TAKE, 625 REVIEW).
- **Cost:** the import, the six reverts and the ledger all landed in one day. The revert bodies hold no cause, so the reason for each revert is not recorded.
- **Sharpest cut:** a ported upstream fix needs its row in `project/upstream-ledger.md` marked TAKE by a person before the commit. Let `Update-DevBranch.ps1` or CI refuse a `(#NNNNN)` subject with no matching TAKE row. Do not use a merge for upstream again.

## Time sink 2: typecheck and gate repairs after the feature commit

- **Evidence:** seven repair commits in six days: `c715aade65` (10-16), `ad02d0b4fb`, `3c7dc2141d`, `7c367b96aa`, `9c1656512c` (10-17), `4e62c05896` (10-21), plus release-build repairs `9b74609911`, `4d407530ce`, `203cde7074`. `13a498e78c` already widened the release gate to server, web and provider-core types.
- **Cause:** the main checkout has a partial install, so the commit hook and the Effect diagnostics do not run there. The error shows up later, at the release gate. The playbook and `antifragile.md` already record this trap (line 588), but a note did not stop it.
- **Sharpest cut:** make the commit fail on the main checkout when `vp` is missing, with one message: "commit from an installed `C:/lcw` worktree". A rule that a person must remember did not hold.

## Time sink 3: bulk card writes that damaged cards

- **Evidence:** the triage apply (`35e4cd2b0`, 368 cards, 10-19 19:32) left a second `status:` or `project:` line in 295 cards. `8975d9f81` fixed them two hours later. The app read the first line and Python read the last, so the board looked wrong (already in `antifragile.md` line 695). Earlier, the automated sync `f75c6213d` (10-16, 477 files) changed `delete-leonidas-code-d-backup-after-switch-to-c` and `show-perf-benchmark-trends-on-the-command-tab-and-merge-perfharness-into-main` from Done to Not started. `show-goo-busters-gb-cards-on-the-leonidas-code-board` went Awaiting Review to Not started (`f4c6fc605`) before it reached Done (`2377ed293`). The sync commit may have a valid cause. This retro did not trace it.
- **Cost:** card state could not be trusted for a day. ADR-0090 (`8e904f74c`, the task reconciler) is now the structural answer.
- **Sharpest cut:** any script that writes more than 20 cards runs on 3 cards first, then a validator checks for a repeated front-matter key. Only then does it write the rest.

## Process refinement (one)

**A note that fails twice in one week becomes a check.** Sink 2 repeated a logged trap (`antifragile.md` line 588). Sink 3 repeated the shape of a logged one (line 695). When a gotcha recurs inside seven days, the retro owner must add a hook or CI job in the same session. The retro owner may not add a playbook line. This follows the `retro` skill rule: build the deterministic check first.

## Durable lessons captured

- **Added to `memory/observed/antifragile.md`:** the wholesale upstream import and its six reverts (sink 1).
- **Added to `memory/observed/patterns.md`:** Jake decides a batch from one prepared table and one approval.
- **Skipped as duplicates:** the partial-install typecheck trap and the triage duplicate-key defect. Both are already logged.

## Open

- The sync commit `f75c6213d` and the Done to Not started moves: cause not checked.
- Nothing is pushed. A push to `main` ships a release.
