# Subagent spec format v1

One file per subagent: `.agents/subagents/<name>.md`. An AIOS Subagent lives at the AIOS root. A Project Subagent lives at `projects/<p>/.agents/subagents/` and can extend a base. The app parser is `apps/server/src/subagents/subagentPersona.ts`; it rejects any field not listed here.

## Frontmatter

```yaml
---
name: roblox-ui-designer # required; must match the file name
description: "Designs Roblox UI for Rent Due games." # one line; shown in the Studio and the @ menu
extends: frontend-designer # optional; base found in .agents/subagents/ above this folder
model: claude-opus-5-5 # catalog model id; inherited when extends sets it
account: balanced # optional; a provider instance id, or balanced (default: the app picks)
tier: confirm # optional; forces the confirm card. Leave it out to use the model map
enabled: true # optional; false keeps it in the catalog but off
tools: [Read, Edit, Write, Glob, Grep, Bash, mcp__leonidas__leo_preview_open]
context: [projects/rent-due-games/DESIGN.md] # loaded after the body; relative to the folder that holds .agents/
never: ["Commit or push.", "Install packages."]
scope: structural # optional AIOS metadata (personal or structural); a spawn ignores it
---
```

The body after the frontmatter is the whole persona prompt. No CLAUDE.md chain, skill list or app standard loads with it.

## Merge rules for `extends`

| Field                                      | Child set                            | Child not set |
| ------------------------------------------ | ------------------------------------ | ------------- |
| `description`, `model`, `account`, `tools` | Replaces the base value              | Inherits      |
| `tier`                                     | `confirm` anywhere in the chain wins | Inherits      |
| `context`, `never`                         | Added after the base items           | Inherits      |
| body                                       | Follows the base body                | Base body     |
| `enabled`                                  | Its own value                        | `true`        |

- A same-name project copy can `extends` the AIOS original to change one field.
- The chain stops at 4 levels; a loop or a missing base is an error.

## Spawn tiers

- The free tier (default Haiku 5.5, GPT-6 Luna, Gemini 3.8 Flash Low and Medium) starts at once. Every other model shows the confirm card.
- Settings holds the app's free list. `.agents/subagents/model-tiers.json` overrides it:

```json
{
  "free": ["claude-haiku-5-5"],
  "confirm": ["gpt-6-luna"],
  "goodFor": { "free": "Lookups and summaries.", "confirm": "Design and architecture." }
}
```

## Engines

- **Claude child:** the body is the whole system prompt, with `settingSources: []` and only the listed tools. The app MCP server loads only when `tools` names an `mcp__` tool.
- **Codex child:** the body leads `developer_instructions`. Codex still loads AGENTS.md, so a Codex child starts larger than a Claude child.
- **Antigravity child:** ignores the persona today.

## Check

`pwsh scripts/Sync-Subagents.ps1` in an AIOS checks every spec against this format. It writes nothing to `.claude/agents` or `.codex/agents`.
