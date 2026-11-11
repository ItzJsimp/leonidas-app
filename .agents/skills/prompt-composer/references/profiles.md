# Prompt profiles

Open the section for the profile chosen in Phase 0. Skip the others. Live model names: [`tools/model-router.md`](../../../../tools/model-router.md).

Every profile ends with a verification step that names a command or an observable state.

## Profile A: Minimal (Claude)

Frontier reasoning and native extended thinking. State the goal, the context pointers and the gate. Leave the steps out.

```markdown
[/slash-command, manual mode only]
<task>
[Action verb + exact scope]
</task>

<context>
- [Key files, constraints or context pointers]
</context>

<rules>
- [Positive target behavior]
- DO NOT: [Hard boundary, paired with the positive target above]
</rules>

<verification>
- [Exact test command or observable end state]
</verification>
```

## Profile B: Tool-centric (Gemini, Antigravity)

- Markdown sections: `## Objective`, `## Environment & Tools`, `## Constraints`, `## Verification`.
- Name each tool the agent may call and its parameters.
- Write verification as a CLI command that runs first (test-first).

## Profile C: Procedural (Hermes, GLM, kanban workers, cron fleets)

- Numbered gates: Step 1, Step 2, Step 3. Each step ends on a checkable condition.
- Output as a JSON schema or a Markdown table.
- Give each error branch a retry limit and a stop condition.

## Profile D: Universal default

Target unknown. Use four sections: Goal Statement, Context & Constraints, Execution Focus, Definition of Done. Keep tokens dense and the gate checkable.
