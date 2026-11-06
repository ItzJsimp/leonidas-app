---
name: context-budget
description: "Audit context window token consumption across preloaded files, modes, skills, MCP, and system rules."
category: efficiency
scope: structural
distribution: template
type: skill
id: skill-context-budget
title: Context Budget
kind: procedure
load: on-demand
owner: shared
verified: 2026-08-21
related: ["skills-index", "system-prompt-authoring", "context-engineering", "prompt-optimizer"]
generated: false
disable-model-invocation: true
license: MIT
---

# Context Budget

Analyze token overhead across every loaded component in an agent workspace (Leonidas and its provider runtimes) and surface actionable optimizations to reclaim context space.

## When to Use

- Session performance feels slow or agent begins to suffer from context rot
- You have recently added multiple skills, rules, or MCP servers
- Planning to add new components and need to audit available headroom
- Evaluating always-loaded file overhead ([`AGENTS.md`](../../../AGENTS.md), [`CLAUDE.md`](../../../CLAUDE.md), [`MASTER-INSTRUCTIONS.md`](../../../MASTER-INSTRUCTIONS.md))
- Invoking `/context-budget` for a full footprint breakdown

---

## 4-Phase Audit Pipeline

### Phase 1: Component Inventory & Token Estimation

Scan workspace components and calculate token footprints:

- **Prose / Markdown**: `words × 1.3` (or `chars / 4`)
- **Code / JSON**: `chars / 3.5`
- **MCP Server Tools**: `~500 tokens per tool schema`

**1. Always-Loaded Routers & Canon**

- Inspect: [`AGENTS.md`](../../../AGENTS.md), [`CLAUDE.md`](../../../CLAUDE.md), [shared operating layer](../../rules/leonidas-code-overlay.md), [`.agents/antigravity-overlay.md`](../../rules/antigravity-overlay.md), [`MASTER-INSTRUCTIONS.md`](../../../MASTER-INSTRUCTIONS.md), [`BUILD-PLAN.md`](../../../BUILD-PLAN.md)
- Thresholds: Flag if combined always-loaded base exceeds **15,000 words (~20,000 tokens)**. Superseded 2026-09-16 per the user's decision (see `memory/observed/patterns.md`, "Knowledge-Rich Always-Loaded Budget"): the former 6,000-word ceiling starved always-loaded knowledge; the new target balances knowledge density against context cost, reached by pruning stale pointer entries, not by stripping knowledge.

**2. Modes & Personas (`modes/*.md` or `agents/*.md`)**

- Count lines, word count, and frontmatter `description` length
- Thresholds: Flag files >250 lines, or frontmatter descriptions >30 words

**3. Skills (`skills/*/SKILL.md`)**

- Count tokens per skill body AND measure frontmatter `description` length.
- **Tool Registry Description Overhead**: Skill descriptions are permanently loaded into the model's tool registry. Flag any skill frontmatter description >40 words.
- Thresholds: Flag individual skill files >400 lines; detect duplicate vendored copies across repositories.

**4. Standards & Memory (`standards/*.md`, `memory/*.md`)**

- Count static reference files loaded per session
- Thresholds: Flag hardware profiles or raw logs placed in active memory tiers

**5. Model Context Protocol (MCP) Servers**

- Count active MCP servers and registered tool schemas in `settings.json` or `.mcp.json`
- Thresholds: Flag servers with >20 tools, or servers wrapping native CLI tools (`git`, `gh`, `pwsh`)

**6. Cross-Repository Boundary Overlays**

- Measure token cost of loading peer repository rules (e.g. Leonidas loading the peer AIOS instructions). Confirm cross-repo reads require explicit user confirmation to prevent unbounded context inflation.

---

### Phase 2: Classification Matrix

Sort every component into an operational tier:

| Tier                      | Definition                                            | Action                                    |
| ------------------------- | ----------------------------------------------------- | ----------------------------------------- |
| **Tier 1: Always Active** | Core router, universal non-negotiables, active Mode   | Keep lean & tightly pruned                |
| **Tier 2: On-Demand**     | Task-specific skills, reference standards, wiki notes | Load behind pointers; 0 context when idle |
| **Tier 3: Dead Weight**   | Obsolete scripts, unindexed files, duplicate schemas  | Delete or move to `archive/`              |

---

### Phase 3: Problem Pattern Detection

Identify common token-burn antipatterns:

- **Skill Registry Description Bloat**: Overly long description fields in skills that waste tokens on every single turn.
- **Sedimented Instructions**: Old rules, completed roadmap items, or historical bug notes retained in preloaded files.
- **Unbounded Cross-Domain Loading**: Loading entire peer repository master instructions without human-in-the-loop approval.
- **MCP Schema Overload**: Enabling heavy MCP servers whose tools are rarely called.
- **Scattered Truth**: Duplicating system facts across both memory files and skill definitions.

---

### Phase 4: Output Scoreboard

Emit the structured Context Budget Report:

```
Context Budget Report
═══════════════════════════════════════════════════
Target Workspace: [<repo root> / the peer AIOS]
Estimated Preloaded Footprint: ~XX,XXX tokens
Effective Available Headroom: ~XXX,XXX tokens (XX%)

Component Breakdown:
┌───────────────────────────┬────────┬───────────┐
│ Component Area            │ Count  │ Tokens    │
├───────────────────────────┼────────┼───────────┤
│ Routers & Canon Base      │ N      │ ~X,XXX    │
│ Modes & Personas          │ N      │ ~X,XXX    │
│ Skills Library            │ N      │ ~X,XXX    │
│ Standards & Memory        │ N      │ ~X,XXX    │
│ MCP Tool Schemas          │ N      │ ~XX,XXX   │
└───────────────────────────┴────────┴───────────┘

Top Token-Savings Opportunities (Ranked):
1. [Component / Action] → Save ~X,XXX tokens
2. [Component / Action] → Save ~X,XXX tokens
3. [Component / Action] → Save ~X,XXX tokens

Potential Recovery: ~XX,XXX tokens (XX% reduction)
```

In verbose mode (`/context-budget --verbose`), include per-file line counts, heaviest sections, and MCP schema overhead breakdown.
