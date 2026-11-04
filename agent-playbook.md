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
7. Server boot smoke, no install needed: `node scripts/smoke.mjs --runtime "<install>/Leonidas Code.exe" --entry "<install>/resources/server.asar/apps/server/dist/bin.mjs"` (about 8 s, fresh temp home). With an install, plain `node scripts/smoke.mjs`. It fails on a hung server (the 0.62.0 bug).

## 5. Gotchas (the ones that bite first)

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
- **A new Claude account can look signed in at once:** the status probe may find a login outside its `~/.claude-<id>` folder (env token like `CLAUDE_CODE_OAUTH_TOKEN`/`ANTHROPIC_API_KEY`, or an old macOS CLI with one shared keychain entry). `ConnectAccountDialog` now treats a duplicate email as signed out and forces the browser login (`methodId: "force"`). Server reuse is in `ClaudeAuth.ts` `start`. Root cause per user is unconfirmed.
- **The main checkout cannot commit when its install is partial:** the `vp` pre-commit hook fails (code 127, or vite.config cannot load `vitest`). Commit from an installed worktree under `C:/lcw`; a PATH borrow of another worktree's `vp` does not work.
- **Usage limits merge per window, not per snapshot:** `collectLimitAccounts` and `collectConnectedUsageLimits` (`packages/shared/src/`) join one account across devices with `mergeLimitWindows`. Never pick a whole snapshot by `checkedAt`: any one bar's update bumps it, so a device's stale bar wins. Windows past `resetsAt` show 0% in `poolWindows`. Claude polls usage every 60 s only while the app has demand (`ClaudeDriver.ts` `pollUsage`), so an idle device holds old numbers. Run: `npx vp test run packages/shared/src/usageLimits.test.ts` (2 s). Unrelated Windows failures exist in `atomicWrite.test.ts` and `relayClient.test.ts`.
- **Server typecheck has existing errors** in unrelated test files (`aiosDetect.test.ts`, `relativeImportExtensions.test.ts`). Filter the output to your changed paths instead of reading the total.
- **Cache awareness has two halves:** the server sets `promptCacheTtlMs` and `promptCacheAnchorAt` per provider (`ClaudeContextUsage.ts`, `codexProviderTurnTokenUsage` in `CodexAdapterV2.ts`). The web side only reads them (`cacheAwareness.ts`, `CacheAwareness.tsx`). A provider that sends no TTL gets no countdown and no notice. Codex uses the documented 30m default because the 12h option is opt-in and not reported. Do not hard-code 12h. Self-test: `CacheAwareness.test.tsx`, `CodexAdapterV2.test.ts`.

## 6. Why it is this way

- **Native tasks and release planning:** Leonidas owns new tasks; Todoist supplied public interaction references. Agent execution requires explicit delegation. Existing AIOS cards and GitHub sharing remain compatible. Release scope lives in [`project-roadmap.json`](./project-roadmap.json); V1.0 remains an explicitly approved public launch.
- **Roadmap task identity:** Imported briefs carry a durable `Roadmap key:` in their descriptions. Renaming or moving a task must not reimport it. Use the shared `observeResize` helper for map connectors; raw ResizeObserver callbacks fail scoped lint.

- **Reuse electron-updater over a git-pull updater:** installed apps cannot `git pull`; the existing GitHub Releases path needs only a CI workflow. Card: [`t3-code-push-to-update-release-pipeline`](../../tasks/t3-code-push-to-update-release-pipeline.md).
- **Thin rebrand layer:** every branding touch makes `upstream/main` merges harder. Card: [`t3-code-rebrand`](../../tasks/t3-code-rebrand.md).

## 7. Session notes

- **2026-11-03:** Add-Claude-account skip-to-signed-in bug: guard added in `ConnectAccountDialog.tsx`/`.logic.ts` (`sharesLoginWithOtherAccount`) and `ClaudeSignInCard` (`forceSignIn`, `onSignedIn`). Not pushed. Open: ask the user for OS, `claude --version`, `claude auth status`, and env tokens; ChatGPT callback failure needs OS, browser page after login, firewall or VPN, and server log. `vp test run` works from `apps/web`; import tests from `vite-plus/test`, not `vitest`.
- **2026-10-31:** A chat waiting on a question now shows a cache warning on the card (`usePendingCacheNote`, `ComposerPendingUserInputPanel.tsx`) and one toast when the cache ends while the card is open. Codex chats now report a 30m TTL. Not committed, not pushed. Open: no toast for chats you are not viewing, because the app does not track pending questions per chat.
- **2026-10-28 (3):** `LimitsFocusRefresh` (mounted in `routes/__root.tsx`) refreshes providers on window focus or return to visible, once a minute per environment (commit `11e99cfa0d`). `UsagePage.refresh.test.tsx` fails alone here with `document is not defined`; not caused by this work.
- **2026-10-28 (2):** Claude limits no longer regress (commit `5c179f7b7d`): `ClaudeProvider.ts` marks the SDK-cache fallback `cached: true` and `resolveUsageLimitsAfterProbe` keeps published windows over it. Poll pauses on lock, low power, or a background window by design (`BackgroundPolicy.ts`). Not pushed.
- **2026-10-28:** Usage-limit mismatch across devices fixed (commit `4886cd7e08`): per-window merge plus expired windows show 0%. Not pushed. Open: idle devices still hold stale reads (poll runs only on demand); a reset credit shows the old high value until the other device re-reads.
- **2026-10-16:** Task board perf (branch `perf/task-scan`, worktree `C:/lcw/task-board-v2`): `aiosCardReader.ts` watches each card folder and serves the last scan; call `cardReader.invalidate()` after any card write. The task table renders through LegendList (`flattenGroups` in `taskRows.ts`); board columns page at `COLUMN_PAGE`. Fixture: `node C:/lcw/task-perf/make-fixture.mjs` (600 real cards + project symlinks). Dev pairing: `node apps/server/src/bin.ts auth pairing create --base-dir <home> --json`, field `credential`. `preview_resize` can fail with ECONNRESET; reopen the tab and retry.
- **2026-10-16:** Subagents (ADR-0082) live in `apps/server/src/subagents/` (spec parser with `extends`, spawn tiers, `SpawnApprovals` broker, Studio catalog) and `apps/web/src/components/subagents/`; starters in `packages/shared/src/subagentStarters/`. Branch `feat/subagent-spawn-path`, worktree `C:/lcw/subagents`. Studio data needs an AIOS root: start the dev server with `LEONIDAS_AIOS_ROOT=<folder with tasks/>`. Code that holds `\n` escapes must go through Write or Edit, not a Bash heredoc.
- **2026-10-16:** Opt-in usage analytics slice 1 (`apps/web/src/lib/usageAnalytics/`, `components/usageAnalytics/`, commit `24d1511edc`): PostHog EU, random install ID, consent dialog, 5 events. Key via `VITE_POSTHOG_KEY` (`apps/web/.env.local`, CI var `POSTHOG_PROJECT_KEY`). Browser panel default profile shows a blank page (HTTP 431); use the incognito profile. Slice 2 plan: `handoff-docs/2026-10-16-usage-analytics-slice-2.md`.
- **2026-10-15:** Providers page is now accounts grouped by service (`ProviderAccountGroups.tsx`, `providerAccounts.logic.ts`); the full editor opens only in the Settings sheet. Claude installs from `ClaudeInstallation.ts` (official installer) and the driver also searches `~/.local/bin`. Mint a dev pairing token with `node apps/server/src/bin.ts auth pairing create --base-dir <home> --json`.
- **2026-10-15:** Task completion celebration slice 1: `TaskBoardService.completions` (last 20, `SubscriptionRef`) streams over `taskBoard.subscribeCompletions` to `apps/web/src/components/taskCelebration/`. Board writes announce in `persist`; AIOS card writes announce in `cardUpdate`. Hand edits to card files do not announce yet. A toast lasts 2.5 s: verify it with a MutationObserver on `[aria-label=Notifications]` (the region has no `role` attribute).
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
