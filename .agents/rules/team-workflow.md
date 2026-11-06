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
3. **Finish and clean up:** do branch work in a worktree ([`using-git-worktrees`](../skills/using-git-worktrees/SKILL.md)). When it is done and all checks pass, merge `origin/main` into the branch and push it to `main`. Then remove the worktree and delete the branch, only after `git merge-base --is-ancestor <branch> origin/main` passes. Never leave a finished branch or worktree behind.
4. If another agent is editing the same area, say so in [the status log](../../project/status-log.md) first.

## Shipping

- **Every push to `main` ships a release** via `.github/workflows/team-release.yml`. An agent pushes by itself when all checks pass. Before pushing: `vp run typecheck` and `vp test run <files you touched>`. Docs-only pushes skip the build.
- Tell Jake before you edit `team-release.yml`; it is the only workflow that runs.
- The repo is **public**. Never commit keys, tokens, `.env`, personal paths or local launchers (use `.git/info/exclude`).
- Keep upstream-file edits small; prefer new files so `git merge upstream/main` stays cheap. Soft fork since 2026-10-18: no full upstream merges. Review upstream fixes every 2 weeks and cherry-pick one at a time ([ledger](../../project/upstream-ledger.md)).
- **Versions:** plain semver, `0.MINOR.PATCH` in development. `feat:` advances minor, fixes patch. User-visible `feat:`/`fix:` need a `Release-Note:` trailer per [leonidas-release](../skills/leonidas-release/SKILL.md) (plain words, verb first, 8-18 words).
- Existing `1.0.x` installs migrate once with the latest `0.x` installer; `scripts/leonidas-update.ps1 -WaitForExit` verifies it.

## Run and verify

- Dev: `vp run dev` (all), `vp run dev:desktop` (Electron). If `vp` is not on PATH: `node_modules/.bin/vp`.
- Checks: `vp run typecheck`, `vp lint`, `vp fmt`, `vp test run <files>`.
- **Always-on dev copy:** `scripts/Install-DevShortcut.ps1` (once per machine) keeps an isolated dev server running (server 23773, web 15733, state in `.t3`). Agents verify UI at `http://localhost:15733` with `preview_open` and the `test-t3-app` skill; never restart the installed app. In a separate worktree, run your own `vp run dev`. Log: `.t3/dev-server.log`.
- Keep the `claude` CLI installed: the Claude provider runs the Claude Agent SDK, which loads `CLAUDE.md`, hooks and skills.
