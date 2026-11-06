# Leonidas Code: agent router

You are building **Leonidas Code**, the Leonidas team's AI coding app (a fork of T3 Code, MIT). Builders: Jake and Mob, one shared `main`. Brief: [LEONIDAS.md](./LEONIDAS.md). This file is the always-loaded router; detail lives in the rule files below, read when the task needs them.

## 1. Load your operator's AIOS first

This project lives inside its builder's AI operating system at `../../`. If `../../AGENTS.md` exists, read it, then `../../memory/jake.md` (or that AIOS's identity file), `../../memory/soul.md` and `../../modes/router.md` before acting. Claude loads these through `CLAUDE.md`; other engines read them by hand. If the parent AIOS is missing, work from this repo alone and say so once. Never copy personal canon into this repo: it is public.

**AIOS template for new users:** the universal template lives in the Leonidas AIOS at `../../scripts/universal-template/` and is built by `../../scripts/Export-UniversalAIOS.py` into `../../_dist/aios-universal-template/`. Any change to the reply standard, onboarding or default canon must also update that template.

## 2. Non-negotiables

1. **Never kill by pattern.** No `pkill -f`, `pgrep | kill`, or killing a PID matched by name or path; your own process carries the worktree path. Kill only a PID you captured at spawn, or your port's owner after confirming its cwd.
2. **Never write to the live install.** `~/.t3/userdata` is the real database in use. Read or copy from it; never start a server against it or open it read-write.
3. **Never bake in origins.** Do not set `VITE_HTTP_URL` or `VITE_WS_URL` for dev; it silently breaks remote browsers.
4. **A push to `main` ships a release to both machines.** Commit locally; push only when the user says so.
5. **Scoped checks only:** `vp test run <files>`, scoped lint and typecheck. No repo-wide `vp check` or `-r` runs unless asked.
6. **Performance gate:** every code change passes [`performance-gate`](./.agents/skills/performance-gate/SKILL.md) before "done". A perf claim needs a before and after number.
7. **Task first:** find or create the task card before substantive work and close it with a verified note ([task-driven-work](./.agents/rules/task-driven-work.md)).
8. **Public repo:** no keys, tokens, `.env`, personal paths or launchers in commits.
9. No em dash (U+2014) in anything you write. Plain words for user-facing text.
10. **Release notes are for users:** before committing a user-visible change or writing an update, read [leonidas-release](./.agents/skills/leonidas-release/SKILL.md) and its [writing guide](./.agents/skills/leonidas-release/references/writing-guide.md). Use final plain-language `Release-Note:` trailers. Release authors use the illustrated story template; never publish raw commit messages as patch notes.
11. **ASD-STE100 language:** write all prose in ASD-STE100 Simplified Technical English: short active sentences (20 words or fewer in instructions), one meaning per word, no idioms. Code, paths and identifiers stay as written. Short form lives in [outputStandard.ts](./packages/provider-core/src/server/outputStandard.ts).
12. **Constraints:** read [CONSTRAINTS.md](./CONSTRAINTS.md) before you edit. Never weaken it to make a change pass.
13. **Code search:** use `codebase-memory-mcp` (`search_graph`) to find where a symbol is defined. Use `rg` to find who uses it: the graph returns no callers for Effect services. Run `rg` before you trust an empty graph result.

## 3. Read when the task calls for it

| Task                                                                                                                  | Read                                                                   |
| --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Any code change: principles, surfaces, dev servers, test data, verifying, PRs, docs, architecture, taste              | [engineering](./.agents/rules/engineering.md)                          |
| Any UI task: screens, components, colors, theme, tokens, layout (design in Doop first)                                | [DESIGN.md](./DESIGN.md)                                               |
| Pushing, branching, roadmap lanes, versions, release notes, dev copy                                                  | [team-workflow](./.agents/rules/team-workflow.md)                      |
| Starting or closing work, task cards                                                                                  | [task-driven-work](./.agents/rules/task-driven-work.md)                |
| Hooks, skills, config, or how Claude, Codex and the app layer together                                                | [harness-layers](./.agents/rules/harness-layers.md)                    |
| Delegating to another model                                                                                           | [tiered-models](./.agents/rules/tiered-models.md)                      |
| Reply format additions (pushed-to-main banner)                                                                        | [output-standard](./.agents/rules/output-standard.md)                  |
| Module map, data sources, cheap verify loop, top 10 traps                                                             | [agent-playbook](./agent-playbook.md)                                  |
| All other traps (install, Git, release, tests, Scribe, dev copy, laptop, phone, upstream ports, server HTTP API), why | [project/agent-gotchas.md](./project/agent-gotchas.md)                 |
| Past session notes (newest 10 in agent-gotchas.md, older here)                                                        | [project/session-notes-archive.md](./project/session-notes-archive.md) |
| Preparing a release                                                                                                   | [leonidas-release](./.agents/skills/leonidas-release/SKILL.md)         |
| UI verification                                                                                                       | `test-t3-app` (web), `test-t3-mobile` (mobile) skills                  |
| Server code                                                                                                           | `docs/internals/effect-services.md`, `.repos/effect-smol/LLMS.md`      |

## 4. Where things live

- **Code:** `apps/server` (orchestration, providers), `apps/web`, `apps/desktop`, `apps/mobile`, `packages/contracts`, `packages/shared`, `packages/client-runtime`.
- **Tasks:** the AIOS `tasks/` folder is the only write path; `tasks/` here is a generated view.
- **Skills:** `.agents/skills/` holds the one committed copy of every shared skill, so each contributor gets them with git pull. Jake's AIOS links to these folders, so an edit in either place is the same file. Private AIOS skills stay out; a few personal core skills are linked per machine and git-excluded.
- **Instruction adapters:** `CLAUDE.md`, `GEMINI.md` and `.cursor/rules/leonidas.mdc` are generated from this file by `scripts/Build-AgentAdapters.ps1`. Edit this file, then run it.
- **Laya (optional local checker):** a per-user pack adds a bash gate hook (`.claude/hooks/laya-gate.py`) and the `laya` MCP tools. Without the pack both do nothing. Install it from the Leonidas AIOS with `python scripts/laya/install_pack.py`.

@LEONIDAS.md
