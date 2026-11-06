---
name: "prompt-composer"
description: "Write, audit and grade prompts and agent instructions with model-calibrated structure. Use when writing or improving a prompt, system prompt, brief or agent instruction."
category: agents
scope: "structural"
distribution: template
type: "skill"
id: "skill-prompt-composer"
title: "Prompt Composer"
kind: "procedure"
load: "on-demand"
owner: "shared"
verified: "2026-09-27"
related: ["skills-index", "system-prompt-authoring", "model-router", "prompt-standard"]
generated: false
license: MIT
---

# Prompt Composer: Agent Instruction & Prompt Authoring Engine

Compose, audit, optimize, and grade high-precision prompts for AI agents. Bridges frontier LLM capabilities with deterministic operational constraints across providers in Leonidas and existing unattended workers.

---

## 1. When to Use

- Composing a new prompt, task specification, or system instruction destined for an AI agent.
- Reviewing, grading, or debugging an existing prompt that caused agent flailing, drift, or excessive token spend.
- Compressing verbose conversational requests into crisp, declarative agent instructions.
- Evaluating whether a generated prompt should be saved to [`prompts/`](../../../prompts/prompts-index.md) as a reusable asset.

### Automatic Invocation Rule

Leonidas AI automatically invokes this skill whenever writing, reviewing, or analyzing prompts destined for agents, ensuring modern prompting principles are applied across all operations.

---

## 2. The 5-Phase Composer Pipeline

```
[Phase 0: Engine & Scaffolding Inference]
                   |
[Phase 1: Intent & Relevant Skill Prepending]
                   |
[Phase 2: Precision Audit & Gap Diagnosis]
                   |
[Phase 3: Model-Calibrated Structure Synthesis]
                   |
[Phase 4: Dual-Variant Output & Persistence Gate]
```

### Phase 0: Engine & Scaffolding Inference

To eliminate user friction, do NOT ask the operator what model will be used unless genuinely ambiguous. Autonomously infer the target model from conversational context or active harness:
Infer the selected provider/model from Leonidas live capabilities, not the app name. Old harness names below identify model families only; they do not route users into old interfaces.

1. **Claude Context (Opus 5.5 / Sonnet 5):** Target if prompt mentions Claude, Anthropic, or runs inside Claude Code. Requires **Minimal Scaffolding** (frontier reasoning, native extended thinking, high steerability).
2. **Antigravity Context (Gemini 3.8 Flash / Pro):** Target if prompt mentions Antigravity, Google AI, or runs inside Antigravity. Requires **Medium Scaffolding** (tool-centric bounds, test-first CLI verification commands).
3. **Hermes Context (GLM 5.3 Flash / Nous):** Target if prompt mentions Hermes, kanban workers, or cron fleets. Requires **High Scaffolding** (strict sequential numbered steps, explicit JSON/schema contracts).
4. **Universal Safe Default:** If target engine cannot be inferred with high confidence, apply the balanced Universal Safe Default that performs reliably across all modern LLMs.

### Phase 1: Intent & Relevant Skill Prepending

1. **Analyze Task Intent:** Categorize as Build/Feature, Bug Fix, Refactor, Audit/Health, or System Instruction.
2. **Skill Discovery:** Match intent against registered skills in [`.agents/skills/skills-index.md`](../skills-index.md).
3. **Execution Mode Tailoring:**
   - **Manual Copy-Paste Mode (Human Operator):** Prepend the relevant interactive slash command on Line 1 so the user can instantly paste and trigger it (e.g. `/grill-me`, `/implement`, `/component-audit`, `/fable-mode`).
   - **Autonomous Agent Mode (Leonidas AI):** Inject a direct skill execution directive inside the prompt body (`- **Required Skill:** Load and follow .agents/skills/<name>/SKILL.md before executing.`).

### Phase 2: Precision Audit & Gap Diagnosis (Matt Pocock Principles)

Audit the draft prompt against the core agent levers:

- **No-Op Pruning:** Purge instructions the model already obeys by default ("Write clean code", "Be thorough", "Think carefully"). If deleting a sentence does not change the output, delete it.
- **Positive Instruction Default:** Convert negative prohibitions into positive target behaviors. Prohibitions activate the forbidden behavior (the "pink elephant" trap). State what the agent _must_ do; reserve negative rules strictly for hard safety boundaries ("DO NOT modify database schemas").
- **Checkable & Exhaustive Done Criteria:** Eliminate vague bounds ("Ensure code works"). Define binary, observable gates ("npm test exits code 0", "AST audit reports 0 drift flags") to prevent premature completion.
- **Context Pointers & Two-Load Balance:** Disclose branch-specific documentation behind context pointers rather than dumping raw text into the prompt envelope. Front-load leading words in pointers.
- **Sediment & Environment Cache Pruning:** Never hardcode package lists or file trees that the agent can inspect dynamically via `view_file` or `run_command`.

### Phase 3: Model-Calibrated Scaffolding

Apply the scaffolding profile matched in Phase 0:

#### Profile A: Minimal Scaffolding (Claude Opus 5.5 / Sonnet 5)

- Outer XML envelope (`<task>`, `<context>`, `<rules>`, `<verification>`).
- Declarative high-level goal; zero procedural micro-management.
- Paired guardrails (positive target default + explicit negative boundary).
- Leverages native extended thinking without "think step by step" scaffolding.

#### Profile B: Tool-Centric Scaffolding (Gemini 3.8 Flash / Pro)

- Clear semantic Markdown sections (`## Objective`, `## Environment & Tools`, `## Constraints`, `## Verification`).
- Explicit tool calling boundaries and parameter schemas.
- Test-first programmatic verification commands (CLI scripts).

#### Profile C: Procedural Scaffolding (GLM 5.3 Flash / Hermes)

- Sequentially numbered procedural execution gates (Step 1, Step 2, Step 3).
- Strict output formatting schemas (JSON schema or Markdown table).
- Explicit error handling branches and retry limits.

#### Profile D: Universal Safe Default (Balanced)

- 4-section standard architecture: Goal Statement, Context & Constraints, Execution Focus, and Definition of Done.
- High token density, zero conversational fluff, checkable verification gates.

---

## 3. Output Format Standard

When invoked, the skill outputs a structured diagnosis followed by one primary, production-ready prompt by default:

### 1. Diagnosis & Grading (100-Point Rubric)

- **Score:** `XX / 100`
- **Breakdown:**
  - _Clarity & Definition of Done (25 pts):_ Are terminal states binary and observable?
  - _Model Scaffolding Calibration (20 pts):_ Is structure tuned to target engine capability?
  - _Context Hygiene & Pointers (20 pts):_ Are references disclosed rather than bloated?
  - _Positive Framing & No-Op Pruning (20 pts):_ Are vacuous rules and negative traps eliminated?
  - _Scope & Guardrail Boundaries (15 pts):_ Are forbidden files/actions explicitly bounded?
- **Key Enhancements Made:** 2-3 bullets stating what was pruned or sharpened.

### 2. Primary Production Prompt (Zero-Edit Direct-Paste)

Deliver the single optimal, model-calibrated production prompt ready to copy-paste immediately into the target agent. Dual variants or reusable templates are omitted by default and generated only when explicitly requested by the operator or when two fundamentally distinct execution modes exist.

```markdown
[/slash-command if manual]
<task>
[Action verb + exact scope]
</task>

<context>
- [Key files, environment constraints, or disclosed pointers]
</context>

<rules>
- [Positive target instruction 1]
- [Positive target instruction 2]
- DO NOT: [Hard negative boundary]
</rules>

<verification>
- [Exact test command or observable terminal condition]
</verification>
```

---

## 4. Persistence Gate Standard (`prompts/`)

Prompts must NOT be saved to the repository automatically. After outputting the prompt, evaluate the persistence criteria:

1. **Reusability Evaluation:**
   - Is this prompt expected to be run **3 to 5+ times**, or on a **regular recurring cadence** (e.g. daily briefing, substrate audit, release checklist)?
   - If NO: Keep output in chat context / task notes. Do not save to disk.
   - If YES: Prompt the operator:
     > _"This prompt qualifies as a reusable asset (cadence >=3-5 runs). Would you like me to save it to `prompts/<slug>.md`?"_
2. **Saving & Indexing (When Confirmed by the user):**
   - **Filename Standard:** `prompts/<action>-<domain>-<descriptor>.md` (clean, human-scannable kebab-case, e.g. `audit-substrate-health.md`, `compose-agent-prompt.md`).
   - **Canonical Frontmatter:**
     ```yaml
     ---
     type: prompt
     id: prompt-<slug>
     title: "Descriptive Actionable Title"
     description: "One-line summary of prompt execution."
     input_source: "active session / working tree"
     target_sink: "chat response | files"
     token_budget: 1500
     model_affinity: "frontier | fast | any"
     status: "Active"
     verified: YYYY-MM-DD
     ---
     ```
   - **Index Regeneration:** Automatically run `pwsh scripts/Build-Index.ps1` to update [`prompts/prompts-index.md`](../../../prompts/prompts-index.md).

---

## 5. Done When

The composition or review task is complete when:

1. Target model scaffolding is correctly calibrated (or universal safe default applied).
2. Relevant AIOS skills are detected and prepended (slash command for manual, direct directive for autonomous).
3. All no-ops and conversational pleasantries are pruned.
4. Definition of Done contains binary, observable verification gates.
5. Single primary calibrated prompt is delivered inside a fenced code block (with dual variants omitted unless requested).
6. Persistence evaluation is completed and the user's approval is requested before saving to `prompts/`.
