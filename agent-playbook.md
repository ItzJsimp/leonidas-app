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

## 5. Top 10 traps (the ones that cost the most)

- **Install a new worktree with `vp install --frozen-lockfile`, not `pnpm`:** plain `pnpm` in the Git Bash shell on the desktop dies with a Node loader error (2026-11-03). Run `vp install` in the background and write the log to a file that ends in `DONE`; the `&` wrapper reports "completed" at once, so wait on the `DONE` line (Monitor with an `until grep -q "^DONE"` loop). Cut the worktree from `origin/main`: `git worktree add /c/lcw/<name> -b <branch> origin/main`.
- **Never run `pnpm install` in the main checkout to link one package:** it added about 1,900 packages to the shared `node_modules` and stopped on the unrelated `@react-navigation/native-stack` patch. Use a `C:/lcw` worktree.
- **Public repo, private data:** never embed business data (prices, names, reply text) in `packages/`. Load packs from the owner's AIOS at run time (`parsePackJson`). If it already sits in unpushed local commits, squash with `git commit-tree <tree> -p <base>` plus `git update-ref refs/heads/main <new> <old>` (compare-and-swap, safe while other sessions commit), then cherry-pick onto a fresh `origin/main` worktree and push with `git push origin <branch>:main`.
- **`gh` defaults to upstream in this fork:** `gh release list` with no `-R` reads `pingdotgg/t3code`. Always pass `-R ItzJsimp/leonidas-code`.
- **The main checkout is shared with live agents:** another session may be committing here every few seconds. Never `git switch`/`git checkout -b` (its commits land on your branch) and never `git stash` (an old `stash@{0}` exists and `pop` applies it). Commit by explicit path with `git commit --only -- <paths>`; for a baseline, compare error lists instead of stashing.
- **Fresh worktrees need an install first:** `pnpm install --frozen-lockfile` (about 7.5 minutes) before any check. Worktrees on D: stall; use `C:/lcw`.
- **A commit that hangs is usually the hook:** let `vp fmt` finish; never bypass it.
- **The main checkout cannot commit when its install is partial:** the `vp` pre-commit hook fails (code 127, or vite.config cannot load `vitest`). Commit from an installed worktree under `C:/lcw`; a PATH borrow of another worktree's `vp` does not work.
- **Never check a real branch out in `C:/lcw/dev-live`:** `Sync-DevLive.ps1` runs `reset --hard` there and would drag that branch's tip along (it lost the only commit of `fix/reveal-in-explorer` once; restored from the reflog). dev-live must stay detached.
- **A branch with a `package.json` change but no `pnpm-lock.yaml` change breaks the dev copy:** the supervisor's patch repair runs `pnpm install --frozen-lockfile`, which then fails. `Update-DevBranch.ps1` skips such branches; fix the lockfile on the branch.

All other traps (install, Git, release, tests, Scribe engine, dev copy, laptop, phone, upstream ports, server HTTP API) are in [project/agent-gotchas.md](./project/agent-gotchas.md). Search it with `rg` before you touch that area.

## 6. Why it is this way

Moved to [project/agent-gotchas.md](./project/agent-gotchas.md#why-it-is-this-way) (dev branch, native tasks, roadmap keys, updater, thin rebrand).

## 7. Session notes

- Session notes live in [project/agent-gotchas.md](./project/agent-gotchas.md#session-notes-newest-first-keep-10-older-in-session-notes-archivemd) (newest 10) and [project/session-notes-archive.md](./project/session-notes-archive.md) (older). Add a new note there, not here.
- This file loads in every session. Keep it under 12 KB (test: `scripts/agent-playbook-budget.test.ts`). A new trap goes to `project/agent-gotchas.md`. Put it in the top 10 here only when it costs more than one that is here now, and move that one out.
