# Prompt Improver Skill

Moved whole from the retired `prompt-improver` skill on 2026-11-20. It was the `/prompt-improver` skill. The prompt hook (`scripts/prompt-improver/engine.py`) nudges the agent to this branch.

## Purpose

Transform vague, ambiguous prompts into actionable, well-defined requests through systematic research and targeted clarification. This skill is invoked when a prompt has been identified as needing enrichment, ensuring the AI lands the right output on the first try.

## When This Skill is Invoked

**Automatic Invocation:**

- In **Claude Code**: The `UserPromptSubmit` hook evaluates prompt clarity. If vague (missing target, ambiguous scope, unclear criteria), it prompts this skill.
- In **Antigravity**: When prompt clarity evaluation indicates missing specifics or ambiguous requirements, the agent activates this procedure before making changes.

**Manual Invocation:**

- When an operator or agent explicitly invokes `@skills/prompt-improver` or requests prompt enrichment.
- When prompt lacks sufficient context even with conversation history.

**Assumptions:**

- Evaluation has determined the prompt is ambiguous or underspecified.
- Proceed directly to research and clarification without guessing or assuming intent.

## Core Workflow

Follow this 4-phase procedure:

### Phase 1: Research

Gather grounded context before asking any questions or modifying code.

**Research Strategy:**

1. **Check conversation history first**: Avoid redundant exploration if the relevant files, errors, or context were already discussed in recent turns.
2. **Review codebase & repository**:
   - **Claude Code**: Use `Task/Explore` for architecture, `Grep`/`Glob` for patterns, `git log` for recent commits.
   - **Antigravity**: Use `grep_search`, `find_by_name`, `view_file`, or invoke a `research` subagent for broad surveys.
3. **Gather domain & documentation context**:
   - Check local docs ([`wiki/`](../../../../wiki/wiki-index.md), [`decisions/`](../../../../decisions/decisions-index.md), [`memory/`](../../../../memory/memory-index.md)).
   - Use web search / fetch tools for third-party libraries or current documentation.
4. **Document findings**: Base all question options on actual findings in the project, never generic placeholders.

### Phase 2: Formulate Options

Draft 1–3 tightly focused multiple-choice questions grounded in findings:

- Each option represents a concrete, feasible implementation path.
- Explicitly designate one option as **"(Recommended)"** with technical rationale.
- Avoid open-ended or trivial yes/no questions.

### Phase 3: Present Questions

- **Claude Code**: Use `AskUserQuestion` hook tool:
  ```json
  {
    "questions": [
      {
        "question": "Which component should be refactored?",
        "header": "Component",
        "multiSelect": false,
        "options": [
          {
            "label": "Auth service (src/auth.ts)",
            "description": "Resolves session timeout issues"
          },
          { "label": "User API (src/users.ts)", "description": "Extracts service layer" }
        ]
      }
    ]
  }
  ```
- **Antigravity**: Use `ask_question` (or create an `implementation_plan.md` in planning mode):
  ```json
  {
    "questions": [
      {
        "question": "Which component should be refactored?",
        "is_multi_select": false,
        "options": [
          "(Recommended) Auth service (src/auth.ts) - resolves session timeout issues",
          "User API (src/users.ts) - extracts service layer"
        ]
      }
    ]
  }
  ```

### Phase 4: Execute with Context

Once the operator responds:

1. Synthesize the original intent with the selected options and research findings.
2. Execute the request with full precision as if it had been specified clearly from the start.
3. Validate changes with tests or diagnostics.

## Key Principles

1. **Research First**: Never formulate questions from assumptions; ground them in project files.
2. **Be Specific**: Anchor every choice to concrete paths, functions, or architectural patterns.
3. **Keep Context Lean**: Synthesize conclusions rather than dumping full file contents.
4. **Bypass Respect**: Recognize bypass prefixes (`*` to skip evaluation, `/` for commands, `#` for notes).

## Progressive Disclosure

For comprehensive reference:

- **Research strategies**: [`references/research-strategies.md`](clarify-research-strategies.md)
- **Question patterns**: [`references/question-patterns.md`](clarify-question-patterns.md)
- **Comprehensive examples**: [`references/examples.md`](clarify-examples.md)
