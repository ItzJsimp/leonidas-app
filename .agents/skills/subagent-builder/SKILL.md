---
name: subagent-builder
description: "Write, edit or audit an AIOS or project subagent spec in .agents/subagents/ that runs through Leonidas app delegate. Use when asked to create, change, extend or review a subagent."
category: agents
scope: structural
distribution: core
disable-model-invocation: true
license: MIT
---

# Subagent builder

A subagent is a persona the app starts as a child thread through `delegate_task` with `subagent: "<name>"` ([ADR-0082](../../../decisions/0082-subagents-use-spawn-tiers-and-per-subagent-context-lists-through-app-delegate.md)). The child gets only its body, its Context List and its tools, so it starts lean on any provider. Format: [`references/canonical-spec.md`](./references/canonical-spec.md).

Custom subagents do not compile to `.claude/agents` or `.codex/agents`. Native helpers (Claude Explore, Codex explorer) are separate and need no spec.

## 1. Pick the construct first

| Construct | Use when                                                                                    |
| --------- | ------------------------------------------------------------------------------------------- |
| Subagent  | Work that fills context: searches over 5 files, test loops, builds, reviews, design passes. |
| Inline    | Under 30 seconds or 2 files or fewer.                                                       |
| Skill     | A procedure the parent or a subagent loads on demand.                                       |
| Mode      | A change of lens or tone. Modes never name a model.                                         |

Before you write a new spec, check the 7 starters (frontend-designer, researcher, reviewer, explorer, verifier, backend-builder, summarizer). Extend one when it covers 80 percent of the role.

## 2. Write the spec

1. **One role.** If the role has two jobs, make two subagents.
2. **Model:** the cheapest model that does the job. A free-tier model (Haiku 5.5, GPT-6 Luna, Gemini 3.8 Flash Low or Medium) starts with no card; any other model asks the user first. Add `tier: confirm` when a cheap model can still do costly work.
3. **Tools:** list only what the role uses. Read-only roles get `Read`, `Grep`, `Glob`. Add `Bash` for checks, `Edit` and `Write` for builders. Name each app MCP tool (`mcp__t3-code__preview_open`); each named `mcp__` tool adds about 1,300 start tokens (the child loads only the tools you name).
4. **Context List:** the files it always needs, for example a project `DESIGN.md`. Each file adds its size to every start. Keep the default empty.
5. **Never-list:** short, checkable bans, for example "Commit or push."
6. **Body:** the role in one sentence, numbered work steps, and a return contract with a word cap and evidence (paths, lines, commands, screenshot paths). Use mechanical rules, not adjectives.

## 3. Check it

1. Run `pwsh scripts/Sync-Subagents.ps1` in the AIOS. It must report 0 errors for the spec.
2. Start it once: call `delegate_task` with `subagent`, `mode: "wait"` and a 1-line task. Read the start tokens from `task_status` usage. Write the number in the task card when the spec is new.

## 4. Audit existing subagents

1. **Overlap:** two specs compete for one task. Merge them, or extend one from the other.
2. **Tool creep:** a write tool on a read-only role. Remove it.
3. **Model fit:** a confirm-tier model on a lookup role. Move it to the free tier.
4. **Return contract:** no word cap or no evidence rule. Add both.

## Done when

- The spec parses (`Sync-Subagents.ps1` shows 0 errors) and one live start returned a result.
- No em dash (U+2014) in the file.
