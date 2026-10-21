---
type: reference
id: leonidas-code-agent-playbook
title: "Leonidas Code: agent playbook"
description: "Read before changing Leonidas Code (the fork of T3 Code). Where the updater and settings live, upstream traps, the cheap verify loop, gotchas already paid for, and one line per past session."
scope: structural
owner: leonidas
verified: 2026-10-11
---

# Leonidas Code agent playbook

## 1. Start here (under 5 calls)

1. Read [`project/plan.md`](./project/plan.md), [`LEONIDAS.md`](./LEONIDAS.md) (the shared brief; keep [project/roadmap.md](./project/roadmap.md) and the status log in step with the task cards) and the open cards listed in [`project.md`](./project.md).
2. Fork state: `git fetch -q upstream; git rev-list --left-right --count upstream/main...main`.
3. Open only the files the task names, using the map below. The source is this folder.

## 2. Module map

| Area | Files | Self-test |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |\
| Desktop auto-update (poll, download, install, restart) | `apps/desktop/src/updates/DesktopUpdates.ts`, `apps/desktop/src/electron/ElectronUpdater.ts` | `DesktopRemoteUpdates.test.ts` |\
| Update toast and sidebar pill | `apps/web/src/components/desktopUpdate.toast.tsx`, `sidebar/SidebarUpdatePill.tsx` | `desktopUpdate.toast.test.tsx` |\
| What's new popup (shown when an update downloads) | `apps/web/src/components/desktop/LeonidasWhatsNewDialog.tsx`, wired in `DesktopUpdateCoordinator.tsx`; bullets via `getWhatsNewItems` in `desktopUpdate.logic.ts` | `desktopUpdate.logic.test.ts` |\
| Release feed target | `scripts/build-desktop-artifact.ts` `resolveGitHubPublishConfig` | `scripts/build-desktop-artifact.test.ts` |\
| Settings UI | `apps/web/src/components/settings/` | n/a |\
| Local mock update server | `pnpm start:mock-update-server` (`scripts/mock-update-server.ts`) | n/a |\

## 3. Data sources: shape, cost, traps

| Source          | Reached by                                                                                                                   | Latency                                     | Trap                                                                                                                                          |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Update feed     | GitHub Releases of the repo named in `T3CODE_DESKTOP_UPDATE_REPOSITORY` or `GITHUB_REPOSITORY` at build time                 | 4 minute poll (`AUTO_UPDATE_POLL_INTERVAL`) | Baked in at build: an official T3 install keeps updating from `pingdotgg` until replaced by our build. Private repo needs a token in the app. |
| Public download | `releases/latest/download/Leonidas-Setup.exe` on `ItzJsimp/leonidas-code`, a fixed-name copy that `team-release.yml` uploads | n/a                                         | The versioned `Leonidas-Code-<v>-x64.exe` name changes every release; give users only the fixed link. Unsigned, so SmartScreen shows once.    |
| Update channel  | Derived from version string: `-nightly.YYYYMMDD.N` is nightly, else latest                                                   | n/a                                         | Updates whose channel does not match the selected one are ignored silently; version our builds as plain semver (`1.0.<run_number>`).          |

## 4. The cheap build and verify loop

1. Updater logic: run the updater tests in `apps/desktop` (fast, no build).
2. Toast flow end to end: `pnpm start:mock-update-server` plus a mock-updates desktop build, before touching CI.
3. Real proof: push to `main`, wait for the release, confirm the toast on the other machine.
4. First-run starter skills: `node scripts/verify-starter-skills.ts --live` installs all of them into a fresh temp folder and checks both roots plus Claude Code and Codex loading (about 8 s, one haiku call). `--list <folder>` audits any AIOS folder.
5. Which skills Codex sees in a folder, free and with no model call: `codex debug prompt-input` run there (skills are listed as `(file: rN/<name>/SKILL.md)`).
6. Web typecheck: from `apps/web`, `../../node_modules/.bin/vp run typecheck` (about 13 s). `npx tsgo` and a local `tsc` bin do not exist.
7. Dev copy (green icon app): it follows the derived local `dev` branch, not the main checkout. `pwsh scripts/Update-DevBranch.ps1 -Force` rebuilds it (origin/main plus every clean branch of the last 21 days, gated; 1 to 3 min). Read `.t3/dev-branch-status.md` for what merged, what the gate dropped and what needs a person. Tests for that machinery: `pwsh -NoProfile -File scripts/Update-DevBranch.test.ps1` (about 15 s, throwaway repo).
8. Server boot smoke, no install needed: `node scripts/smoke.mjs --runtime "<install>/Leonidas Code.exe" --entry "<install>/resources/server.asar/apps/server/dist/bin.mjs"` (about 8 s, fresh temp home). With an install, plain `node scripts/smoke.mjs`. It fails on a hung server (the 0.62.0 bug).

9. Scoped package checks without a full install: from the package folder, `pnpm --config.verify-deps-before-run=false exec vp test run --config ../../vite.config.ts --dir .` and `... exec tsc --noEmit`. Plain `pnpm exec` runs a dependency check that calls the failing `pnpm install` in a partial main checkout. The real gate is an installed `C:/lcw` worktree: `pnpm install --frozen-lockfile` (2.5 minutes with a warm store), then `vp lint --report-unused-disable-directives packages/<pkg>` and `tsc --noEmit` there. Only that toolchain loads the Effect plugin and the type-aware lint, and both found errors that the partial install hid.

## 5. Gotchas (the ones that bite first)

- **A new workspace package needs a lockfile importer:** copy the `packages/business-pack:` block in `pnpm-lock.yaml`, rename it, and insert it in alphabetical order. A full offline `pnpm install` rewrites 342 lines of peer suffixes; revert that. Prove the hand edit with `pnpm install --frozen-lockfile --lockfile-only --offline` (exit 0, no change).
- **Never run `pnpm install` in the main checkout to link one package:** it added about 1,900 packages to the shared `node_modules` and stopped on the unrelated `@react-navigation/native-stack` patch. Use a `C:/lcw` worktree.
- **The Write and Edit tools turn `\u2028` and `\u2029` in your text into real line separators,** which break a regex literal. Fix with Python using `chr(0x2028)`, or build the string with `String.fromCharCode` in the test. A Bash heredoc with backticks or `\n` also fails to parse; use Write.
- **Test output with control characters makes `grep` say "Binary file matches":** pipe through `tr -d '\000-\010\016-\037'` and use `grep -a`.
- **Public repo, private data:** never embed business data (prices, names, reply text) in `packages/`. Load packs from the owner's AIOS at run time (`parsePackJson`). If it already sits in unpushed local commits, squash with `git commit-tree <tree> -p <base>` plus `git update-ref refs/heads/main <new> <old>` (compare-and-swap, safe while other sessions commit), then cherry-pick onto a fresh `origin/main` worktree and push with `git push origin <branch>:main`.

- **Voice keys:** `VoiceKeyStore.ts` uses the OS credential vault. `ServerSecretStore` does not encrypt file bytes.
- **Capture paths:** web dictation lives in `components/voice/`; iOS uses `packages/client-runtime/src/voice-input/controller.ts`. Check both before adding capture logic.

Full list and session notes: [project/agent-gotchas.md](./project/agent-gotchas.md). Search it before touching updater, release, rebrand, worktree, build-preflight or quota code.

- **`gh` defaults to upstream in this fork:** `gh release list` with no `-R` reads `pingdotgg/t3code`. Always pass `-R ItzJsimp/leonidas-code`.
- **A push to `main` ships a release to both machines:** changes stay local commits until Jake says push.
- **Rebrand scope rule:** change user-visible names only; leave `@t3tools/*`, `T3CODE_*`, the `~/.t3` folder and app id `com.t3tools.t3code`, or threads orphan and installs duplicate.
- **No `vp` on PATH:** run `node_modules/.bin/vp test run <files>` from the repo.
- **The main checkout is shared with live agents:** another session may be committing here every few seconds. Never `git switch`/`git checkout -b` (its commits land on your branch) and never `git stash` (an old `stash@{0}` exists and `pop` applies it). Commit by explicit path with `git commit --only -- <paths>`; for a baseline, compare error lists instead of stashing.
- **A dev server for this checkout may already be running:** `vp run dev` then refuses. Start yours with `--home-dir <temp folder>` (own ports and data) and stop only the PID you captured (`/proc/<pid>/winpid`, then `taskkill //T`).
- **Fresh worktrees need an install first:** `pnpm install --frozen-lockfile` (about 7.5 minutes) before any check. Worktrees on D: stall; use `C:/lcw`.
- **A commit that hangs is usually the hook:** let `vp fmt` finish; never bypass it.
- **MCP service test fixtures are partial records:** `OrchestratorMcpService.test.ts` casts runs without `startedAt`/`completedAt`. New code that reads run or turn fields must guard with `== null`, or 7 unrelated tests fail.
- **The main checkout cannot commit when its install is partial:** the `vp` pre-commit hook fails (code 127, or vite.config cannot load `vitest`). Commit from an installed worktree under `C:/lcw`; a PATH borrow of another worktree's `vp` does not work.
- **Server typecheck has existing errors** in unrelated test files (`aiosDetect.test.ts`, `relativeImportExtensions.test.ts`). Filter the output to your changed paths instead of reading the total.

- **Never check a real branch out in `C:/lcw/dev-live`:** `Sync-DevLive.ps1` runs `reset --hard` there and would drag that branch's tip along (it lost the only commit of `fix/reveal-in-explorer` once; restored from the reflog). dev-live must stay detached.
- **A branch with a `package.json` change but no `pnpm-lock.yaml` change breaks the dev copy:** the supervisor's patch repair runs `pnpm install --frozen-lockfile`, which then fails. `Update-DevBranch.ps1` skips such branches; fix the lockfile on the branch.
- **A cherry-picked commit conflicts with its own twin on `origin/main`:** the hash differs, the patch is the same. `New-CleanBranch.ps1` (`git cherry`) drops it. A conflict with merge context only 3 lines away is still a real conflict.
- **Chromium `--app` windows file under the browser, not the pinned shortcut:** `Set-DevWindowIdentity.ps1` stamps one AppUserModelID on both and the dev server serves the green favicon (`LEONIDAS_DEV_ICON=1`). I could not confirm the taskbar result by screenshot; the capture shows no taskbar.
- **Published `origin/main` can already fail tests:** `WelcomeWizard.terminal.test.tsx` fails 2 of 7 there (`voiceStatus is not a function`). The dev gate compares against origin/main and does not blame branches for it.

## 6. Why it is this way

- **`dev` is a derived local branch, never pushed:** the dev copy mirrored the main checkout, so feature branches and publishes never reached it. `dev` = origin/main plus clean branches, rebuilt from scratch each time and moved only when the gate is green (bisect to the culprit, drop it, hold the last good tip after 3 drops). Mixed-session branches stay out until a person or agent resolves them in `C:/lcw/dev-rebase`; `git rerere` keeps each resolution.

- **Native tasks and release planning:** Leonidas owns new tasks; Todoist supplied public interaction references. Agent execution requires explicit delegation. Existing AIOS cards and GitHub sharing remain compatible. Release scope lives in [`project-roadmap.json`](./project-roadmap.json); V1.0 remains an explicitly approved public launch.
- **Roadmap task identity:** Imported briefs carry a durable `Roadmap key:` in their descriptions. Renaming or moving a task must not reimport it. Use the shared `observeResize` helper for map connectors; raw ResizeObserver callbacks fail scoped lint.

- **Reuse electron-updater over a git-pull updater:** installed apps cannot `git pull`; the existing GitHub Releases path needs only a CI workflow. Card: [`t3-code-push-to-update-release-pipeline`](../../tasks/t3-code-push-to-update-release-pipeline.md).
- **Thin rebrand layer:** every branding touch makes `upstream/main` merges harder. Card: [`t3-code-rebrand`](../../tasks/t3-code-rebrand.md).

## 7. Session notes

- **2026-10-20 (mail autopilot slice 1):** `packages/mail-autopilot` shipped to `origin/main` (`57137ebac5`): pure rules engine (`classify`, `plan`, `parsePack`, `parsePackJson`), closed action list with no send, example pack, 64 tests. Slice 2 (Gmail `MailProvider`, draft and label only) comes next; worktree `C:/lcw/mail-autopilot` is installed for it. Real SimplyGersi pack lives in the SimplyGersi AIOS (`projects/email-agent/packs/simplygersi.json`). Local `main` holds a twin commit (`993cb015cf`): drop it at the next sync. Spec and record: the audit task card in the AIOS `tasks/`.

- **2026-10-20 (dev copy):** Tasks window work was built but only on `feat/task-cap-rules`, so the dev copy never showed it. Added `Update-DevBranch.ps1` (derived `dev` branch, green gate with bisect, clean-branch rebuilds), `Test-DevTip.ps1`, `New-CleanBranch.ps1`, `Set-DevWindowIdentity.ps1` and a dev-only green favicon; `feat/task-cap-clean` carries the 8 task-cap commits on current origin/main (not pushed). 10 branches still need a conflict resolution (see `.t3/dev-branch-status.md`); the supervisor's one-build-at-a-time fix starts at its next restart.

- **2026-10-17:** The Models tab token report reads counts only. Input totals include cache reads, so show cached input apart. Ollama stopped after a dev server kill; the cause is not confirmed. Stop only a captured process PID.
- **2026-10-17 (evening):** Token report (slice 8a) shipped in `v0.89.0` via another session's push. Traps: `inputTokens` includes cache reads (98% of 30 days), so show cached input apart; Effect code needs `Clock.currentTimeMillis`, not `Date.now()`; Ollama stopped by itself after a dev server kill, cause not found. Release-Note trailers must start with Added, Improved or Fixed (10 of 12 did not; story `release-posts/local-models.md` covers it, commit `84f1c9ab44`, not pushed). Before a Gate 2 push, run `git fetch` and check that `main` does not already hold your commits.

- **2026-10-17 (later):** Local models slices 2 to 7 on `feat/models-tab` (12 commits, not pushed): `localModels/approvedModels.json` (parser drops bad entries), `speedTest`, `startOllama` plus WSL port warning (`netstat`, `tasklist`), `modelAdvisor.ts` (one PowerShell call, 2.3 s), `images/onDemandSource.ts` (ComfyUI start, free, idle stop; settings `startCommand`, `startFolder`, `idleMinutes` in the images `settings.json`, no UI), `ModelCompare.ts` (blind A/B, picks in `local-models/compare-picks.jsonl`). Traps: run `vp fmt` on explicit paths only (a folder run rewrites unrelated files, revert them); a Bash heredoc that holds quotes or backslashes can fail, so write code with Write and wire it with a Python file; `ProviderTextGeneration` has no free-form answer operation, so a cloud compare needs a new one; the preview tool can ECONNRESET, wait and retry; identify the dev server by port owner (`Get-NetTCPConnection`), not by the shell PID.
- **2026-10-17:** Models tab slice 1 (`feat/models-tab`, worktree `C:/lcw/models-tab`, 6 commits, not pushed): `apps/server/src/localModels/` (engine + service), `hardwareWatch/localModelFit.ts`, `apps/web/src/components/settings/ModelsSettings.tsx`, route `/settings/models`. Traps: Ollama 0.40.5 `/api/ps` reports a wrong size (use `/api/tags` file size); a loaded model holds VRAM, so release it before labelling fit; first hardware sample arrives seconds after start; `vp` is not on PATH, run `export PATH=<worktree>/node_modules/.bin:$PATH` before `node scripts/dev-runner.ts dev --home-dir <temp>`; a new RPC needs entries in `RpcAuthorization.ts`, `RpcInstrumentation.ts`, `clientRpcPermissions.ts` and `client-runtime/src/rpc/client.ts`; a fresh install shows Ollama (local) off (add an account with id other than `ollama`).
- **2026-10-16:** Task board perf (branch `perf/task-scan`, worktree `C:/lcw/task-board-v2`): `aiosCardReader.ts` watches each card folder and serves the last scan; call `cardReader.invalidate()` after any card write. The task table renders through LegendList (`flattenGroups` in `taskRows.ts`); board columns page at `COLUMN_PAGE`. Fixture: `node C:/lcw/task-perf/make-fixture.mjs` (600 real cards + project symlinks). Dev pairing: `node apps/server/src/bin.ts auth pairing create --base-dir <home> --json`, field `credential`. `preview_resize` can fail with ECONNRESET; reopen the tab and retry.
- **2026-10-16:** Subagents (ADR-0082) live in `apps/server/src/subagents/` (spec parser with `extends`, spawn tiers, `SpawnApprovals` broker, Studio catalog) and `apps/web/src/components/subagents/`; starters in `packages/shared/src/subagentStarters/`. Branch `feat/subagent-spawn-path`, worktree `C:/lcw/subagents`. Studio data needs an AIOS root: start the dev server with `LEONIDAS_AIOS_ROOT=<folder with tasks/>`. Code that holds `\n` escapes must go through Write or Edit, not a Bash heredoc.
- **2026-10-16:** Opt-in usage analytics slice 1 (`apps/web/src/lib/usageAnalytics/`, `components/usageAnalytics/`, commit `24d1511edc`): PostHog EU, random install ID, consent dialog, 5 events. Key via `VITE_POSTHOG_KEY` (`apps/web/.env.local`, CI var `POSTHOG_PROJECT_KEY`). Browser panel default profile shows a blank page (HTTP 431); use the incognito profile. Slice 2 plan: `handoff-docs/2026-10-16-usage-analytics-slice-2.md`.
- **2026-10-15:** Providers page is now accounts grouped by service (`ProviderAccountGroups.tsx`, `providerAccounts.logic.ts`); the full editor opens only in the Settings sheet. Claude installs from `ClaudeInstallation.ts` (official installer) and the driver also searches `~/.local/bin`. Mint a dev pairing token with `node apps/server/src/bin.ts auth pairing create --base-dir <home> --json`.
- **2026-10-15:** Task completion celebration slice 1: `TaskBoardService.completions` (last 20, `SubscriptionRef`) streams over `taskBoard.subscribeCompletions` to `apps/web/src/components/taskCelebration/`. Board writes announce in `persist`; AIOS card writes announce in `cardUpdate`. Hand edits to card files do not announce yet. A toast lasts 2.5 s: verify it with a MutationObserver on `[aria-label=Notifications]` (the region has no `role` attribute).
- **2026-10-15 (voice):** Composer dictation and the Voice wizard step are in `6528b9c958`. Ten synthetic takes reached the real composer. Real audio, embedded Groq browsing, AI levels, and the coach remain open. See [voice input](./docs/internals/voice-input.md).

- **2026-10-15:** Task board reader (`readAiosTasks`, `aiosCards.ts`) also reads `projects/<slug>/<child>/tasks` when `<child>` has its own `.git` (Goo Busters GB cards). GB words `doing`, `later`, `cut` and priority `P0` to `P3` map in `statusFromCard` and `priorityFromCard`. `findCardFile` searches the game repo, and `applyCardPatch` writes GB words (`doing`, `P0`, unquoted) for cards with `owner` and `system`.

In [project/agent-gotchas.md](./project/agent-gotchas.md); older ones in [project/session-notes-archive.md](./project/session-notes-archive.md).

- **2026-10-15:** Main checkout `node_modules` had no `.bin`; a `pnpm install` there is blocked by `scripts/guard-main-install.mjs`. Install and commit from a worktree under `C:/lcw` (2.5 minutes). The preview pairing token is one-time: pair once, then click, do not navigate by URL.
  In [project/agent-gotchas.md](./project/agent-gotchas.md); older ones in [project/session-notes-archive.md](./project/session-notes-archive.md).

- 2026-10-15: boot smoke gate `scripts/smoke.mjs` added to `team-release.yml`; proved on the original 0.62.0 `server.asar` (fails, "request hung") and the current build (passes, 7.6 s). `project add` falls back to offline silently; the smoke checks `server-runtime.json` still exists to prove the live path.
- 2026-10-14: fixed-name `Leonidas-Setup.exe` added to every release (`team-release.yml`, commit `5de80b185c`) as the one beginner download link; Scribe still has 0 releases, so dictation is not installable from a link.
- 2026-10-14: skill folders in the `/` menu (`packages/client-runtime/src/skillFolders.ts`, `apps/web/src/components/chat/composerSkillFolders.logic.ts`, `settings/SkillFoldersEditor.tsx`), commits `e518535038` and `b0e9835b08`; checked live in Claude, 97 flat rows became 9 folders. Open: AIOS mirror file, category and source for Codex skills.
- 2026-10-14: delegated task status returns a provider-reported `usage` block (`apps/server/src/mcp/delegatedTaskUsage.ts`, commit `c0efa878cf`); harness-gates card 1 of 4. Cards 2 to 4 build on it.
- 2026-10-14: AIOS Home on the Command tab (`taskBoard.home`, `aiosHome.ts`, `AiosHomeCard.tsx`), verified live on 583 cards; Home build 1 ms, shared card scan 92 ms warm is the next cost to cut.
- 2026-10-14: starter skills verified 22/22 in both roots for Claude Code and Codex; `SKILL_ROOTS` now lives in `skillPacks.ts` so the wizard and the verifier share it.
- 2026-10-17: always-on service built on branch `feat/always-on-service` (worktree `projects/leonidas-code-always-on`, head `99ab65e867`): background mode + tray, catch-up window, idle watchdog, per-task token cap (migration 66). Run `vp` from the worktree root with `node_modules/.bin` on PATH; lint only works from the root. Verify and review still open.
- 2026-10-17: always-on verify and review done (head `aafd5aee7f`). To prove a test failure is old, run `git checkout --detach <base>` inside the worktree, run the test, then switch back (no second install needed). 33 tests fail on the baseline too: 3 in `apps/server/src/mcp`, 30 in `apps/desktop/src`. `watchRun` now ends after 20 failed thread reads. Open: success criterion 5 (launch at login) and the S6 install proof need Jake.
