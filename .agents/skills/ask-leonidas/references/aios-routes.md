# AIOS routes

Use this file in an AIOS. It holds the intent router and the AIOS steps of the main flow from the old `ask-leonidas` skill. The portable flow map is in `SKILL.md`. The generated matrix of every live skill, with its invocation type, is [skills-catalog-matrix.md](../../skills-catalog-matrix.md). Regenerate it with `pwsh -File scripts/Find-SkillFlow.ps1 -GenerateMatrix`.

## High-Velocity Intent Router

Walk this precedence ladder top-to-bottom. Select the first matching operational branch:

| Intent / Situation                        | Immediate Action / Flow                 | Primary Skills                                                                                                                                                                         |
| ----------------------------------------- | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **0. Kickoff / What to Work on Now**      | Mindless Intake -> Gap Audit -> Build   | [`/next-action`](../../next-action/SKILL.md) -> [`/implement`](../../implement/SKILL.md)                                                                                               |
| **1. Feature Build / New Capability**     | Discovery -> Planning -> Execution      | [`/grill-with-docs`](../../grill-with-docs/SKILL.md) -> [`/to-spec`](../../to-spec/SKILL.md) -> [`/to-tickets`](../../to-tickets/SKILL.md) -> [`/implement`](../../implement/SKILL.md) |
| **2. Foggy / Complex Greenfield Project** | Decision Map -> Spec Freeze             | [`/wayfinder`](../../wayfinder/SKILL.md) -> [`/to-spec`](../../to-spec/SKILL.md) -> [`/to-tickets`](../../to-tickets/SKILL.md)                                                         |
| **3. Hardware, Driver, or Crash Triage**  | Crash Forensics -> OS Diagnostics       | [`/pc-incident-forensics`](../../pc-incident-forensics/SKILL.md) -> [`/pc-systems-engineer`](../../pc-systems-engineer/SKILL.md)                                                       |
| **4. Gaming, Latency & Peripherals**      | Engine Tuning -> Input Calibration      | [`/game-optimization`](../../game-optimization/SKILL.md) -> [`/peripherals-display-tuner`](../../peripherals-display-tuner/SKILL.md)                                                   |
| **5. Codebase Health & Refactoring**      | Graph AST -> Deepen Modules -> Refactor | [`/graphify`](../../graphify/SKILL.md) -> [`/improve-codebase-architecture`](../../improve-codebase-architecture/SKILL.md)                                                             |
| **6. System Auditing & Token Budget**     | Substrate Gate -> Token Pruning         | [`/aios-audit`](../../aios-audit/SKILL.md) -> [`/context-engineering`](../../context-engineering/SKILL.md)                                                                             |
| **7. External Package Discovery**         | Open Ecosystem Search (skills.sh)       | [`/find-skills`](../../find-skills/SKILL.md)                                                                                                                                           |
| **8. In-Flight Memory / Closeout**        | Harvest Decisions & Sync Canon          | [`/chat-sync`](../../chat-sync/SKILL.md) -> the user runs [`/session-handoff`](../../session-handoff/SKILL.md) manually (user-only invocation)                                         |

## The Core Builder Flow (Idea -> Ship)

Standard route for developing workspace features and scripts:

1. **Sharpen by Interview:** Run [`grilling`](../../grilling/SKILL.md) (user slash command: [`/grill-me`](../../grill-me/SKILL.md)), the model-invocable interview (chat-only), to conduct frontier interrogation rounds. Record hard architectural decisions under `decisions/` as ADRs and update [`CONTEXT.md`](../../../../CONTEXT.md) via [`/domain-modeling`](../../domain-modeling/SKILL.md). When the interview should write to canon as it goes, recommend the user-only [`/grill-with-docs`](../../grill-with-docs/SKILL.md) (same engine plus ADR/glossary authoring; `disable-model-invocation: true`, so the router can recommend it but cannot invoke it). ADR-0066.
2. **Prototype Spikes (If Uncertain):** If an architectural question requires visual feedback or state spikes, ask the user to run [`/session-handoff`](../../session-handoff/SKILL.md) (user-only invocation) to branch into an isolated scratch session, build the throwaway spike, and hand off back into the main idea thread.
3. **Decompose into Tasks:** Break specifications into testable vertical slices with blocking edges using [`/to-tickets`](../../to-tickets/SKILL.md). Record tasks in [`tasks/`](../../../../tasks/tasks-index.md) via [`/task-management`](../../task-management/SKILL.md).
4. **Disciplined Execution:** Run [`/implement`](../../implement/SKILL.md) per task slice test-first (Red-Green-Refactor). Review diffs against a fixed point before committing per [ADR-0010](../../../../decisions/0010-git-history-replaces-the-master-log.md).
5. **Session Harvest & Closeout:** Run [`/chat-sync`](../../chat-sync/SKILL.md) to harvest durable lessons, memories, and canon updates without wiping session history.

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

_(Script lives at [`scripts/Find-SkillFlow.ps1`](../../../../scripts/Find-SkillFlow.ps1))._

## Done When

A routing request is complete when all three conditions are satisfied:

1. A definitive target skill or multi-skill execution pipeline is identified and announced.
2. The appropriate Mode binding is established per [`modes/router.md`](../../../../modes/router.md).
3. Any required phase boundary transitions (Continue, Fresh Session, Handoff, Subagent, Compact) are explicitly declared.
