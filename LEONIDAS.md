# Leonidas: the shared team brief

The brief every agent on this repo reads. Jake builds alone. Mob and other friends test. Private notes live in Jake's AI operating system, so anything an agent needs goes here or in a linked rule.

## What Leonidas is (say it this way every time)

- **T3 Code** is an open-source, MIT-licensed AI coding harness by T3 Tools (`pingdotgg/t3code`). We forked it.
- **Leonidas** is our own product from that fork, repo `ItzJsimp/leonidas-app`, with its own features and direction. It is one app: the chat surface is **Leonidas Chat**, the Command Center is a view inside it, Scribe stays a tray process, and each user's AIOS is what it loads for them.
- It replaces the Claude Code and Antigravity front ends for Jake, on his own AI subscriptions.
- Keep the MIT notice in `LICENSE`. Say "T3 Code" only about upstream (merges, credit, internal ids `@t3tools/*`, `T3CODE_*`, `~/.t3`, app id `com.t3tools.t3code`, which stay for data safety). Everywhere a user sees the app, it is Leonidas.

## Output standard

The app injects the reply shape (Top / Body / Dock) into every provider; its single source is `LEONIDAS_OUTPUT_STANDARD` in [outputStandard.ts](./packages/provider-core/src/server/outputStandard.ts). Do not restate it in instruction files. Repo-only additions (the pushed-to-main banner): [output-standard rule](./.agents/rules/output-standard.md). Read it on demand: the app already injects the same text, so this brief does not import it.

## Gotchas already paid for

- A copied AIOS git `pre-commit` hook can point at a script missing from this repo and block commits. Rename `.git/hooks/pre-commit` to `pre-commit.aios-disabled` in this clone; never `--no-verify`.
- First installs show a one-time SmartScreen warning (unsigned). Updates still apply.
- Two Claude accounts do not share threads: threads move only between instances with the same `CLAUDE_CONFIG_DIR`.
- Fresh worktrees need `pnpm install --frozen-lockfile` (about 7.5 minutes). Worktrees on D: stall; use `C:/lcw`.
- More: [project/agent-gotchas.md](./project/agent-gotchas.md). Search it before touching updater, release, rebrand, worktree, build-preflight or quota code.

## Read on demand

- **Status log:** [project/status-log.md](./project/status-log.md). One line per finished session at the top.
- **Shipped roadmap:** [project/roadmap.md](./project/roadmap.md). Version plan: [project-roadmap.json](./project-roadmap.json).
- **Machine setup** (new machine, AIOS task views, loading your own AIOS): [project/leonidas-setup.md](./project/leonidas-setup.md).
- **Task system unification plan:** [docs/internals/task-system-unification.md](./docs/internals/task-system-unification.md).
