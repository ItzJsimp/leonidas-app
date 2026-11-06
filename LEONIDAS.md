# Leonidas Code: the shared team brief

The brief both builders' agents read. Each builder's private notes live in their own AI operating system, so anything both sides need goes here or in a linked rule.

## What Leonidas Code is (say it this way every time)

- **T3 Code** is an open-source, MIT-licensed AI coding harness by T3 Tools (`pingdotgg/t3code`). We forked it.
- **Leonidas Code** is our own product from that fork, repo `ItzJsimp/leonidas-app`, with its own features and direction. It is the shell of the **Leonidas app**: the Command Center is a view inside it, Scribe stays a tray process, and each user's AIOS is what it loads for them.
- It replaces the Claude Code and Antigravity front ends for both of us, on our own AI subscriptions.
- Keep the MIT notice in `LICENSE`. Say "T3 Code" only about upstream (merges, credit, internal ids `@t3tools/*`, `T3CODE_*`, `~/.t3`, app id `com.t3tools.t3code`, which stay for data safety). Everywhere a user sees the app, it is Leonidas Code.

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
