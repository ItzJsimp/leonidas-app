# Workflow (one builder, one `main`)

Read before pushing, branching or picking a roadmap task.

## Who does what (v0.35 to v1.0.0)

The plan lives in [project-roadmap.json](../../project-roadmap.json): one milestone per version, each task ending in a `Roadmap key:` line and a `## Lane` section. Jake approved it on 2026-10-13. Windows plus remote web ships first; macOS follows launch. v1.0.0 is the public launch and needs Jake's explicit approval.

- **Builder:** Jake builds alone. Agents work in their own worktrees on his tasks.
- **Testers:** Mob and other friends test builds and report bugs. They do not build.
- **Jake decides** what the app looks like or says, plus business, legal and money. Pricing, terms and partner papers are not in this repo.

## Branches and sync

1. Startup hooks run [guarded source sync](../../scripts/Sync-LeonidasSource.ps1): it fast-forwards only clean `main` checkouts. Integrate divergent history deliberately, preserving upstream merge commits. Push small commits often.
2. **Branch status:** [`Write-BranchStatus.ps1`](../../scripts/Write-BranchStatus.ps1) writes `.git/leonidas/branch-status.md`. Before work, read it, tell the user which branch you are on and whether it is behind `main`, and never delete or switch a branch marked uncommitted. Run it yourself if the file is missing or stale (about 30 seconds).
3. **Claim, work, land:** `scripts/Start-AgentTask.ps1 -Task <slug>` claims the task (`.git/leonidas-claims/<slug>.json`: owner, worktree, time) and cuts `C:/lcw/<slug>` on `task/<slug>` from `origin/main`. A second claim gets "taken". Run `vp install --frozen-lockfile` there, work, commit. `scripts/Invoke-MergeQueue.ps1 -Branch task/<slug> -Task <slug> -Wait` lands it: one branch at a time onto the newest `origin/main` in `C:/lcw/land`, then `Test-DevTip.ps1` (typecheck, scoped tests), the boot smoke when `apps/server` or `packages` changed, and the push. Landing releases the claim. It removes the worktree and branch only when the worktree is clean and no process uses it; a busy one stays for its agent to remove. A conflict or a red check returns the branch to you with the claim still held. `-Status` lists the queue. Tests: `pwsh -NoProfile -File scripts/AgentQueue.test.ps1` (throwaway repo, about 40 s). Never leave a finished branch or worktree behind.
4. If another agent is editing the same area, say so in [the status log](../../project/status-log.md) first.

## Shipping

- **Every push to `main` ships to both machines** via `.github/workflows/team-release.yml`. The merge queue (item 3) is the only push path: it runs the checks and pushes on green, with no extra ask (Jake, 2026-11-05). Docs-only pushes skip the build.
- Tell Jake before editing `team-release.yml`; it is the only workflow that runs.
- The repo is **public**. Never commit keys, tokens, `.env`, personal paths or local launchers (use `.git/info/exclude`).
- Keep upstream-file edits small; prefer new files so `git merge upstream/main` stays cheap. T3 Code comes in by real merges: five staged merges now (`v0.1.1`, `v0.1.3`, `v0.1.6`, `v0.1.7`, tip), then every 7 days. Run each stage with the `upstream-review` skill and one "go" from Jake. Never hand-port a whole feature. A single hotfix may be cherry-picked after the predecessor check in that skill. Plan: the AIOS ADR-0096.
- **Versions:** plain semver, `0.MINOR.PATCH` in development. `feat:` advances minor, fixes patch. User-visible `feat:`/`fix:` need a `Release-Note:` trailer per [leonidas-release](../skills/leonidas-release/SKILL.md) (plain words, verb first, 8-18 words).
- Existing `1.0.x` installs migrate once with the latest `0.x` installer; `scripts/leonidas-update.ps1 -WaitForExit` verifies it.

## Run and verify

- Dev: `vp run dev` (all), `vp run dev:desktop` (Electron). If `vp` is not on PATH: `node_modules/.bin/vp`.
- Checks: `vp run typecheck`, `vp lint`, `vp fmt`, `vp test run <files>`.
- **Always-on dev copy:** `scripts/Install-DevShortcut.ps1` (once per machine) keeps an isolated dev server running (server 23773, web 15733, state in `.t3`). Agents verify UI at `http://localhost:15733` with `preview_open` and the `test-t3-app` skill; never restart the installed app. In a separate worktree, run your own `vp run dev`. Log: `.t3/dev-server.log`.
- Keep the `claude` CLI installed: the Claude provider runs the Claude Agent SDK, which loads `CLAUDE.md`, hooks and skills.
