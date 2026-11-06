# Harness layers: who owns what

Leonidas is a front end and manager. It is not a harness on top of a harness. Each vendor engine runs as a child process, and the app shows and steers it.

| Layer  | Engine                                        | Started by                                                     | Source                                                                         |
| ------ | --------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Claude | Claude Agent SDK (same engine as Claude Code) | `apps/server/src/orchestration-v2/Adapters/ClaudeAdapterV2.ts` | `systemPrompt` preset `claude_code` plus our appended instructions             |
| Codex  | `codex app-server`                            | `CodexAdapterV2.ts`                                            | `CodexDeveloperInstructions.ts`                                                |
| App    | Leonidas                                      | n/a                                                            | threads, tasks, delegation, reply format, `/` skill folders, updates, previews |

## Where to edit

- Claude hooks, skills, `CLAUDE.md`, settings, MCP: Claude config (`CLAUDE_CONFIG_DIR`, default `~/.claude`, and the project `.claude` folder).
- Codex config, skills, `AGENTS.md`: Codex config. The two engines do not share config.
- App features: the app code in this repo.
- If the change must also work in plain Claude Code or Codex, use engine config. If it only works inside the app, use the app.

## Traps

- A second Claude account means a different `CLAUDE_CONFIG_DIR`, so different threads and settings.
- The capability probe loads `user`, `project` and `local` settings but turns hooks off (`ClaudeProvider.ts`). Live sessions set no `settingSources` (`ClaudeAdapterV2.ts`) and do load hooks and `CLAUDE.md`. Verified 2026-10-15: a live app session ran `SessionStart` hooks and imported the `CLAUDE.md` chain. Re-check after an SDK upgrade.
- Do not repeat the reply format in instruction files. `LEONIDAS_OUTPUT_STANDARD` adds it.

## How every agent learns this

The short form is `HARNESS_AWARENESS` in `packages/provider-core/src/server/harnessAwareness.ts`. `buildRuntimeInstructions` injects it into every provider session in every AIOS. Change the text there and in this file together.
