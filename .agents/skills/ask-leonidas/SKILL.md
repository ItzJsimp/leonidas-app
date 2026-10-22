---
name: ask-leonidas
description: "Route user tasks to optimal AIOS skills, resolve workflow boundaries, and plan session handoffs. Use when unsure which skill or workflow fits a task."
category: agents
type: skill
id: skill-ask-leonidas
title: "Ask Leonidas : Master Skill & Flow Router"
kind: procedure
load: on-demand
owner: shared
scope: structural
distribution: template
verified: 2026-09-16
related:
  [
    "skills-index",
    "grill-me",
    "implement",
    "find-skills",
    "chat-sync",
    "next-action",
    "cole-medin-11-tips",
  ]
generated: false
---

# Ask Leonidas: Master Skill & Flow Router

Orient across the 91 AIOS skills on disk, select high-leverage skill pipelines, and resolve session context boundaries.

---

## High-Velocity Intent Router

Walk this precedence ladder top-to-bottom. Select the first matching operational branch:

| Intent / Situation                        | Immediate Action / Flow                 | Primary Skills                                                                                                                           |
| ----------------------------------------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **0. Kickoff / What to Work on Now**      | Mindless Intake -> Gap Audit -> Build   | [`/next-action`](../next-action/SKILL.md) (or [`/current-action`](../next-action/SKILL.md)) -> [`/implement`](../implement/SKILL.md)     |
| **1. Feature Build / New Capability**     | Discovery -> Planning -> Execution      | [`/grill-me`](../grill-me/SKILL.md) -> [`/task-scoping`](../task-scoping/SKILL.md) -> [`/implement`](../implement/SKILL.md)              |
| **2. Foggy / Complex Greenfield Project** | Multi-Gate Checkpoints -> Spec Freeze   | [`/fable-mode`](../fable-mode/SKILL.md) -> [`/task-scoping`](../task-scoping/SKILL.md)                                                   |
| **3. Hardware, Driver, or Crash Triage**  | Crash Forensics -> OS Diagnostics       | [`/pc-incident-forensics`](../pc-incident-forensics/SKILL.md) -> [`/pc-systems-engineer`](../pc-systems-engineer/SKILL.md)               |
| **4. Gaming, Latency & Peripherals**      | Engine Tuning -> Input Calibration      | [`/game-optimization`](../game-optimization/SKILL.md) -> [`/peripherals-display-tuner`](../peripherals-display-tuner/SKILL.md)           |
| **5. Codebase Health & Refactoring**      | Graph AST -> Deepen Modules -> Refactor | [`/graphify`](../graphify/SKILL.md) -> [`/improve-codebase-architecture`](../improve-codebase-architecture/SKILL.md)                     |
| **6. System Auditing & Token Budget**     | Substrate Gate -> Token Pruning         | [`/leonidas-os-audit`](../leonidas-os-audit/SKILL.md) -> [`/token-optimizer`](../token-optimizer/SKILL.md)                               |
| **7. External Package Discovery**         | Open Ecosystem Search (skills.sh)       | [`/find-skills`](../find-skills/SKILL.md)                                                                                                |
| **8. In-Flight Memory / Closeout**        | Harvest Decisions & Sync Canon          | [`/chat-sync`](../chat-sync/SKILL.md) -> the user runs [`/session-handoff`](../session-handoff/SKILL.md) manually (user-only invocation) |

---

## Agent Delegation Fitness Checklist

Before delegating work to a coding agent (connected providers or delegated child agents in Leonidas Code), ask these three questions. Your answer determines scope and preparation depth.

| Fitness Question                              | Example: Brainstorming                                                                                                 | Example: Execution                             | Example: Domain Knowledge                                                                                |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| **Is this brainstorming or creative design?** | "What should our architecture look like?"                                                                              | "Implement feature X as specified."            | "Do we need TypeScript generics here?"                                                                   |
| **Requires upfront human thinking?**          | YES - Architect first, agent implements.                                                                               | NO - Agent owns it; you QA output.             | YES - You provide context first; agent executes.                                                         |
| **Expected depth of domain knowledge?**       | HIGH - You lead; agent supports.                                                                                       | MEDIUM - Spec is locked, agent executes.       | MEDIUM - Incorporate domain context in prompt.                                                           |
| **Best Approach**                             | Interview yourself (or use [`/grill-with-docs`](../grill-with-docs/SKILL.md)), lock the spec, then delegate execution. | Pass locked spec + context; let agent execute. | Provide full context (existing code, patterns, constraints); ask agent to implement within those bounds. |

**Gate rule:** If you're uncertain whether a task should be agent-led or human-led, default to human-led design + agent execution. Never hand off an unlocked spec or ambiguous requirements.

See [`raw/youtube/cole-medin/11-tiny-fixes/analysis.md`](../../../raw/youtube/cole-medin/11-tiny-fixes/analysis.md) (Tip #3: "Assess what should be delegated") for the reasoning behind this gate.

---

## The Core Builder Flow (Idea -> Ship)

Standard route for developing workspace features and scripts:

1. **Sharpen by Interview:** Run [`/grill-me`](../grill-me/SKILL.md), the model-invocable interview (chat-only), to conduct frontier interrogation rounds. Record hard architectural decisions under `decisions/` as ADRs and update [`CONTEXT.md`](../../../CONTEXT.md) via [`/domain-modeling`](../domain-modeling/SKILL.md). When the interview should write to canon as it goes, recommend the user-only [`/grill-with-docs`](../grill-with-docs/SKILL.md) (same engine plus ADR/glossary authoring; `disable-model-invocation: true`, so the router can recommend it but cannot invoke it). ADR-0066.
2. **Prototype Spikes (If Uncertain):** If an architectural question requires visual feedback or state spikes, ask the user to run [`/session-handoff`](../session-handoff/SKILL.md) (user-only invocation) to branch into an isolated scratch session, build the throwaway spike, and hand off back into the main idea thread.
3. **Decompose into Tasks:** Break specifications into testable vertical slices with blocking edges using [`/task-scoping`](../task-scoping/SKILL.md). Record tasks in [`tasks/`](../../../tasks/tasks-index.md) via [`/task-management`](../task-management/SKILL.md).
4. **Disciplined Execution:** Run [`/implement`](../implement/SKILL.md) per task slice test-first (Red-Green-Refactor). Review diffs against a fixed point before committing per [ADR-0010](../../../decisions/0010-git-history-replaces-the-master-log.md).
5. **Session Harvest & Closeout:** Run [`/chat-sync`](../chat-sync/SKILL.md) to harvest durable lessons, memories, and canon updates without wiping session history.

---

## Phase Boundaries & Context Management

A phase boundary is the transition point between two operational chunks (e.g. discovery -> implementation).

### The Five-Action Precedence Tree:

1. **Continue:** Stay in active session if the next phase requires verbatim history as a primary source and the token count is within the **smart zone** (below the selected model's live context warning).
2. **Fresh Session:** Open a new chat window when prior exploration context is disposable. Never run `/clear` (which permanently wipes history).
3. **`/session-handoff`:** Emit a portable briefing when changing providers or accounts inside Leonidas Code, switching directories, or handing off to collaborators.
4. **Subagent:** Dispatch an isolated background agent for autonomous, non-blocking tasks (e.g. test sweeps, diff audits).
5. **`/compact`:** Condense active context with an explicit retention instruction when smart zone limit is reached and session must continue in-place.

_For complete evaluation details, see [references/phase-boundaries.md](references/phase-boundaries.md)._

---

## Deterministic Zero-Token CLI Discovery

Query all AIOS skills and generate routing matrices directly from the terminal without spending LLM tokens:

```powershell
# Search skills by keyword
pwsh -File scripts/Find-SkillFlow.ps1 -Query "performance"

# Filter skills by operational category
pwsh -File scripts/Find-SkillFlow.ps1 -Category "Execution"

# Regenerate catalog matrix from live metadata
pwsh -File scripts/Find-SkillFlow.ps1 -GenerateMatrix
```

_(Script lives at [`scripts/Find-SkillFlow.ps1`](../../../scripts/Find-SkillFlow.ps1))._

---

## Disclosed Reference Modules

- **[`references/catalog-matrix.md`](references/catalog-matrix.md):** Skill classification matrix with invocation types, input/output contracts, and authoritative Mode bindings (generated; regenerate with `Find-SkillFlow.ps1 -GenerateMatrix`).
- **[`references/phase-boundaries.md`](references/phase-boundaries.md):** The 5-action boundary decision tree and primary vs. secondary source tradeoff analysis.
- **[`references/flow-taxonomies.md`](references/flow-taxonomies.md):** End-to-end multi-skill execution recipes across Discovery, Systems, Refactoring, and External Fallbacks.

---

## Done When

A routing request is complete when all three conditions are satisfied:

1. A definitive target skill or multi-skill execution pipeline is identified and announced.
2. The appropriate Mode binding is established per [`modes/router.md`](../../../modes/router.md).
3. Any required phase boundary transitions (Continue, Fresh Session, Handoff, Subagent, Compact) are explicitly declared.
