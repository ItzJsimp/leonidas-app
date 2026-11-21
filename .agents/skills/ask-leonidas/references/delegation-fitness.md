# Agent delegation fitness

Moved whole from `SKILL.md` on 2026-11-20. Nothing is cut.

Before delegating work to a coding agent (connected providers or delegated child agents in Leonidas), ask these three questions. Your answer determines scope and preparation depth.

| Fitness Question                              | Example: Brainstorming                                                                                                    | Example: Execution                             | Example: Domain Knowledge                                                                                |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| **Is this brainstorming or creative design?** | "What should our architecture look like?"                                                                                 | "Implement feature X as specified."            | "Do we need TypeScript generics here?"                                                                   |
| **Requires upfront human thinking?**          | YES - Architect first, agent implements.                                                                                  | NO - Agent owns it; you QA output.             | YES - You provide context first; agent executes.                                                         |
| **Expected depth of domain knowledge?**       | HIGH - You lead; agent supports.                                                                                          | MEDIUM - Spec is locked, agent executes.       | MEDIUM - Incorporate domain context in prompt.                                                           |
| **Best Approach**                             | Interview yourself (or use [`/grill-with-docs`](../../grill-with-docs/SKILL.md)), lock the spec, then delegate execution. | Pass locked spec + context; let agent execute. | Provide full context (existing code, patterns, constraints); ask agent to implement within those bounds. |

**Gate rule:** If you're uncertain whether a task should be agent-led or human-led, default to human-led design + agent execution. Never hand off an unlocked spec or ambiguous requirements.

See [`raw/youtube/cole-medin/11-tiny-fixes/analysis.md`](../../../../raw/youtube/cole-medin/11-tiny-fixes/analysis.md) (Tip #3: "Assess what should be delegated") for the reasoning behind this gate.
