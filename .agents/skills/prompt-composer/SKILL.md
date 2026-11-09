---
name: "prompt-composer"
description: "Write, audit and grade prompts and agent instructions with model-calibrated structure. Use when writing or improving a prompt, system prompt, brief or agent instruction."
category: "agents"
scope: "structural"
distribution: "portable"
type: "skill"
id: "skill-prompt-composer"
title: "Prompt Composer"
kind: "procedure"
load: "on-demand"
owner: "shared"
verified: "2026-11-09"
related: ["skills-index", "system-prompt-authoring", "model-router", "prompt-standard"]
generated: false
license: MIT
---

# Prompt Composer

Compose, audit and grade prompts so the receiving agent takes the same path every run. Output: a scored diagnosis and one paste-ready prompt.

## Branches

- **Compose:** a request with no draft. Start at Phase 0.
- **Audit:** a draft exists. Keep its intent. Run Phase 0 only when the target model is unknown, then start at Phase 2.
- **Compress:** a long conversational request. Run Phase 0 and Phase 2, then Phase 3.

Neighbors: agent-read files (skills, AGENTS.md, CLAUDE.md) go to [`writing-for-agents`](../writing-for-agents/SKILL.md). Shared document theory is in [`system-prompt-authoring`](../system-prompt-authoring/SKILL.md). Image prompts go to [`image-prompt-craft`](../image-prompt-craft/SKILL.md). Ten prompts at once go to [`autonomous-prompts`](../autonomous-prompts/SKILL.md), which calls this skill per prompt.

## Pipeline

### Phase 0: Target model

Read the provider and model from the harness's live capabilities, not the app name. Live model names: [`tools/model-router.md`](../../../tools/model-router.md). Pick one profile:

- **A, Minimal:** Claude. High steerability and native extended thinking.
- **B, Tool-centric:** Gemini, Antigravity.
- **C, Procedural:** Hermes, GLM, kanban workers, cron fleets.
- **D, Universal:** the target stays unknown after reading the context.

Ask the user only when two profiles stay plausible.

Done when: one profile letter and a one-line reason are written down.

### Phase 1: Intent and skills

1. Label the intent: Build, Bug fix, Refactor, Audit or System instruction.
2. Match the intent to [`skills-index.md`](../skills-index.md). Open each chosen `SKILL.md` to confirm it exists.
3. Place each skill by mode. A manual copy-paste prompt gets its slash command on line 1 (`/grill-me`, `/implement`). An autonomous prompt gets this line in the body: `- **Required Skill:** Load and follow .agents/skills/<name>/SKILL.md before executing.`

Done when: every chosen skill resolves on disk, or the prompt names none.

### Phase 2: Precision audit

Test each sentence of the draft against five levers. Rewrite or delete it at the first fail.

- **No-op:** the model already obeys it by default ("write clean code", "think carefully"). Delete the whole sentence.
- **Positive:** state the target behavior, not the banned one. A prohibition stays only as a hard guardrail, paired with its positive target.
- **Checkable:** each done criterion is binary and observable ("`npm test` exits 0"). Replace "ensure code works".
- **Pointer:** branch-specific material sits behind a pointer, and the pointer's first word is its trigger.
- **Cache:** the agent can look up file trees and package lists with a tool. Cut them. Keep only the unwritten convention, the reason and the gotcha.

Done when: every sentence has survived all five levers or been rewritten.

### Phase 3: Structure

Open the chosen profile in [`references/profiles.md`](references/profiles.md) and write the prompt in that shape. Every profile has a goal, context pointers, rules and a verification step with a command or an observable end state.

Done when: `python .agents/skills/prompt-composer/scripts/lint-prompt.py -` exits 0 with the prompt on stdin.

### Phase 4: Deliver and persist

Print the score block, then one prompt in a fenced block. Make a second variant only when the user asks or two distinct run modes exist. Then apply the reuse test in [`references/persistence.md`](references/persistence.md). Write to `prompts/` only after the user says yes.

Done when: the score block and one fenced prompt are printed, and the reuse question is asked when the prompt qualifies.

## Score block (100 points)

- **Score:** `XX / 100`
- _Clarity & Definition of Done (25):_ terminal states are binary and observable.
- _Model Scaffolding Calibration (20):_ structure matches the target engine.
- _Context Hygiene & Pointers (20):_ references are disclosed, not pasted.
- _Positive Framing & No-Op Pruning (20):_ no vacuous rules and no negation traps.
- _Scope & Guardrail Boundaries (15):_ forbidden files and actions are bounded.
- **Key Enhancements:** 2 to 3 bullets naming what was pruned or sharpened.

## Delegation

Grading 4 or more prompts: give each prompt to one Haiku or Luna subagent. It returns the score block and a one-line fix. The lead agent keeps the Phase 3 rewrite and the final answer.

## Done when

1. `scripts/lint-prompt.py` exits 0 on the delivered prompt, and `--selftest` prints `selftest ok`.
2. The score block lists all five lines, and they sum to the printed total.
3. Nothing is written to `prompts/` before the user says yes.
