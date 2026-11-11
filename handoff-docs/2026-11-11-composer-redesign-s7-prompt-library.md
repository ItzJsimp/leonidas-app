---
status: open
---

# Session Handoff: Composer redesign, build S7 (prompt library)

**Date:** 2026-11-11 | **Operator:** Jake | **Status:** Checkpoint (S1 to S6a done, S7 next)
**Saved to:** `handoff-docs/2026-11-11-composer-redesign-s7-prompt-library.md` (task worktree `C:/lcw/composer-redesign`, branch `task/composer-redesign`)

## 0. Resume Prompt

```text
Resume from `C:/lcw/composer-redesign/handoff-docs/2026-11-11-composer-redesign-s7-prompt-library.md`. Read it fully, then the files its §2 lists. Verify git state matches §2 and do not redo anything marked done. Present §5, then start step 1 unless it needs my input.
```

## 1. Goal & Focus

Leonidas Code gets a new composer, built from the approved Doop frame `MJ2ukUgbs-` (canvas `B6wLKwpAtC`). The work runs as slices S1 to S8 on one branch. Each slice ships alone and has its own commit and `Release-Note:` trailer. Nothing is landed on `main` yet. A push to `main` ships a release.

Jake chose option B at the last decision: skip S6b and build **S7, the prompt library**, next. S7 turns the Saved messages sheet into a prompt library: groups, search, Use, and "Save this message". It must read and write `prompts/*.md` in both directions. Saving a message creates `prompts/saved-prompt-<slug>.md`. The data source already exists in `ComposerSavedItems.tsx` (`serverEnvironment.savedItems`, `promptsFolder`).

The task card is the source of truth: `D:/Leonidas AIOS/tasks/plan-composer-and-thread-state-redesign-port-t3-25401-28057.md` (section "Build of the composer pick").

## 2. Changes Landed & Working Tree

- **Canon updated:** `project/agent-gotchas.md` has a new session note at the top (lint-staged data loss, pairing steps, Base UI click, routeTree, slow profiling test). The task card lists S1 to S6a as done with commit hashes. Both edits are in the worktree. The gotchas edit is committed with this handoff.
- **Done and committed on `task/composer-redesign` (not landed):**
  - S1 `40f19aab01`: greeting, red helmet, time-of-day phrases.
  - S2 `a720967afe`: slow red dots behind the hero.
  - S3 `388e95cacd`: composer sits low, greeting above it.
  - S4 `b6047120c9`: plus menu replaces the toolbar row (`ComposerPlusMenu.tsx`, `ComposerSkillsPanel.tsx`, `useAutoPickSkills.ts`).
  - S5 `e3990b4fa2`: reply style and permission in the row under the card (`BranchToolbar.tsx` second host, `composerLayout.settingsControlsHost`, `shouldHostSettingsInStrip`).
  - S6a `b8c4185bfc`: bolt on the model chip in fast mode (`composerProviderState.ts` `speedIcon`), 28 px context ring with percent, blue under 40%, yellow 40 to 69%, red from 70% (`contextSeverity`).
- **Not done:**
  - S6b (round 8): the ring menu holds Context plus Accounts (`UsageOverlayCard.tsx`, `components/usage/UsageLimits.tsx`). Jake skipped it for now.
  - S7 (this handoff), S8 (dictation through the Scribe pill, needs a Scribe HUD API check first).
  - Final: design-audit at 3 sizes, performance-gate with before and after numbers (only S2 has a measured number), replace the Doop frame with a capture of the built screen, then land.
- **Uncommitted state** (`git status -s` in `C:/lcw/composer-redesign`):
  - ` M apps/web/src/routeTree.gen.ts`: the dev server reorders it. Do not commit it. Run `git checkout -- apps/web/src/routeTree.gen.ts` before each commit.
  - `?? .dev.pid`: the dev server PID file. Leave it.
  - ` M project/agent-gotchas.md`: committed together with this doc.
- **Dev server:** `vp run dev` is running for this worktree (web `7228`, server `15268`, PID in `.dev.pid`). Do not kill by pattern.
- **Backup patches:** `C:/lcw/s4-backup.patch`, `s5-backup.patch`, `s6-backup.patch` hold the staged diff of each slice.
- **Main checkout** (`D:/Leonidas AIOS/projects/leonidas-app`) shows other people's edits. Do not touch it.

## 3. Decisions & Constraints

- **Decisions locked:**
  - S6 is split. 6a is done. 6b waits.
  - Reply style comes before permission in the row, as in the Doop frame.
  - Outside the new chat screen, or when the strip is hidden, permission and reply style stay in the composer bar.
  - Recent snips in the plus menu hides when there is no desktop bridge (a plain browser).
  - The ring has its own thresholds (40 and 70). The plan-limit bars keep `usageSeverity` (50 and 90).
  - The ring text uses the token `text-3xs` (10 px). The design shows 9 px, and lint rejects arbitrary sizes.
- **Constraints** (from `AGENTS.md`):
  - No em dash in anything you write. Write in ASD-STE100.
  - Never edit the main checkout. Land only with `pwsh scripts/Invoke-MergeQueue.ps1 -Branch task/composer-redesign -Task composer-redesign -Wait` after all slices pass. A push ships a release.
  - Scoped checks only: `vp test run <files>`, scoped lint and typecheck. No repo-wide runs.
  - Every code change passes the `performance-gate` skill before "done". A perf claim needs a before and after number.
  - Every user-visible commit has a final-form `Release-Note:` trailer (8 to 18 words, verb first, plain). Read the `leonidas-release` skill first.
  - Never run a server against `~/.t3/userdata`. Do not set `VITE_HTTP_URL` or `VITE_WS_URL`.
  - Never weaken `CONSTRAINTS.md` to pass a change.

## 4. Dead Ends & Ruled Out Approaches

- **`git add -A` or `git add apps/web`:** a hook blocks it (ADR-0037). Name each path.
- **A failed commit that runs `lint-staged`:** it can print "Failed to back up original state" and reset the worktree to HEAD. I lost unstaged edits to three renamed files. Do not stage with `-A`. Save `git diff --cached > /c/lcw/<slug>-backup.patch` before each commit. `git stash apply --index` fails while the dev server rewrites `routeTree.gen.ts`. Use `git checkout stash@{0} -- <paths>` instead. The stash holds only the staged state.
- **Browser preview on `127.0.0.1`:** the page loads, but the socket returns 401 (cookie host mismatch). Do not retry it.
- **Browser preview on `localhost` in the default profile:** HTTP 431 (too many cookies). Use the incognito profile.
- **Reusing a pairing code:** it is single use, and a tab in another profile can use it up. Make a new one per tab.
- **Coordinate click on Base UI menus:** it sometimes does nothing. Click by `selector`, or dispatch pointerdown, pointerup and click.
- **Waiting on `git fsck --lost-found`:** it timed out at 30 minutes and found nothing. Do not run it.

## 5. Next Session Action Plan

1. [ ] Verify state: `git -C C:/lcw/composer-redesign log --oneline -7` shows `b8c4185bfc` on top (plus this handoff commit). Check `git branch --show-current` prints `task/composer-redesign`. Check the dev server answers: `curl -s -o /dev/null -w "%{http_code}" http://localhost:7228/pair` prints 200. If it does not, start `vp run dev` in the worktree.
2. [ ] Read the S7 design: call `get_guide` (topic `doop-instructions`), then `get_frame_screenshot` for frame `MJ2ukUgbs-` at scale 2, with agent name `Claude`. The prompt library is one state in that frame: groups, search, Use, Save this message. If a state is hidden, read the frame HTML with `get_frame`.
3. [ ] Skim, do not read whole: `apps/web/src/components/chat/ComposerSavedItems.tsx` (1063 lines: `SavedItemsPanel` line 342, `FilterMenu` 264, `StatusTabs` 315, `promptsFolder` notice near line 590), `apps/server/src/savedItems/SavedItemService.ts`, `packages/contracts/src/savedItem.ts`. Use the `code-skimmer` skill.
4. [ ] Build S7 in small steps, test first: (a) library list with groups and search, (b) Use puts the text in the composer or starts a new chat, (c) Save this message writes `prompts/saved-prompt-<slug>.md` and the library reads files in `prompts/` back. The sheet opens from the plus menu through `isPromptLibraryOpen` in `ChatComposer.tsx`. Keep the existing sheet props `sheet={{ open, onOpenChange }}`.
5. [ ] Check in the dev server at 1280 and 390 px (steps in §6). Run the scoped tests, `tsc`, lint and `vp fmt`. Commit with explicit paths and a `Release-Note:` trailer. Back up first.
6. [ ] Update the task card: tick S7, add the commit hash and what is left. Then ask Jake: S8, S6b, or the Final gate.

## 6. How to Run / Verify

- Typecheck: `cd C:/lcw/composer-redesign/apps/web && npx tsc --noEmit`
- Tests (scoped): `cd C:/lcw/composer-redesign/apps/web && vp test run src/components/chat/ComposerSavedItems`
- Lint and format (scoped): `cd C:/lcw/composer-redesign && vp fmt <files> && vp lint <files>`. `BranchToolbar.tsx:400` has a lint error that is not mine.
- Browser check:
  1. `node apps/server/src/bin.ts pair --base-dir C:/lcw/composer-redesign/.t3` prints a one-time token.
  2. Open `http://localhost:7228/pair` with the **incognito** profile and `open=false`. Type the token in the input and press Enter.
  3. Click Continue, Continue, "Skip for now" (at about x=956, 947, 822 and y=718). Click "Skip tour". Click "Leonidas Chat" twice. The new chat screen shows at `/draft/<id>`.
  4. Resize to 390 x 800 for the narrow check. Close the tab when you finish.
- Commit protocol: `git checkout -- apps/web/src/routeTree.gen.ts`, then `git add <explicit paths>`, then `git diff --cached > /c/lcw/<slug>-backup.patch`, then `git commit`.
- `ChatComposer.profiling.test.tsx` takes 13 to 25 s against a 15 s limit. Rerun once before you call it a failure.

## 7. Suggested Skills for Next Agent

- `code-skimmer`: `ComposerSavedItems.tsx` has 1063 lines.
- `test-t3-app`: browser checks against the isolated dev state.
- `doop`: read the approved frame before you change layout.
- `performance-gate`: required before "done" on any code change.
- `leonidas-release`: write the `Release-Note:` trailer in final form.
- `safe-parallel-commit`: explicit-path staging and recovery.
