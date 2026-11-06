# Workflow profile: Leonidas

The Idea to Ship commands read this file first. Rules come from [AGENTS.md](../AGENTS.md) and [engineering](rules/engineering.md).

## Tracker

- Specs and slices: AIOS task cards with `project: leonidas-code` (`pwsh scripts/New-Task.ps1` from the AIOS root). Without the AIOS: a GitHub issue.
- Claim rule: slices that this run builds now get `-Status 'In progress'`, so the autonomous picker skips them.

## Verify

- Tests: `node_modules/.bin/vp test run <changed test files>`
- Lint: `node_modules/.bin/vp lint <changed files>`
- Typecheck (web): from `apps/web`, `../../node_modules/.bin/vp run typecheck` (about 13 s). Server typecheck has old errors: filter to changed paths.
- Constraints: run the floor checks in [CONSTRAINTS.md](../CONSTRAINTS.md) (lint, fmt, typecheck, secrets, em dash) before each commit.
- Build: CI owns the full build and suite. Never run `vp check`, `vp run -r test` or `vp run -r typecheck` unless asked.
- Server boot: `node scripts/smoke.mjs` when server startup code changed.
- Skills seen by Codex (free): `codex debug prompt-input` in the folder.
- UI check: `test-t3-app` (web) or `test-t3-mobile` (mobile), primary agent only (ask).

## Ship

1. Commit on the current branch with explicit paths. A PR only when the user asks for one: plain conventional title, body from the `pr` skill (problem, fix, model and harness, before/after images for UI).
2. User-visible change: patch notes and version with `leonidas-release`.
3. Release: Gate 2 in this repo is the checks above. When they pass, land with `pwsh scripts/Invoke-MergeQueue.ps1 -Branch task/<slug> -Task <slug> -Wait`. The queue runs the checks and pushes on green. Then confirm the release is published.

## Never

- Edit `.repos/` (vendored, read only).
- Commit motion videos (upload them to GitHub).
