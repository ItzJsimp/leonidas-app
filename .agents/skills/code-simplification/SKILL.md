---
name: code-simplification
description: "Simplify code for clarity without changing behavior. Use when code works but is hard to read, when a review flags readability, or when asked for /code-simplify."
category: code
scope: structural
distribution: core
type: skill
id: skill-code-simplification
title: "Code Simplification"
kind: procedure
load: on-demand
owner: shared
verified: 2026-10-12
source: "https://github.com/addyosmani/agent-skills (skills/code-simplification, MIT, commit 1be8e34)"
license: MIT
---

# Code Simplification

> Inspired by the [Claude Code Simplifier plugin](https://github.com/anthropics/claude-plugins-official/blob/main/plugins/code-simplifier/agents/code-simplifier.md). Adapted here as a model-agnostic, process-driven skill for any AI coding agent.

## Overview

Simplify code by reducing complexity while preserving exact behavior. The goal is not fewer lines: it's code that is easier to read, understand, modify, and debug. Every simplification must pass a simple test: "Would a new team member understand this faster than the original?"

## When to Use

- After a feature is working and tests pass, but the implementation feels heavier than it needs to be
- During code review when readability or complexity issues are flagged
- When you encounter deeply nested logic, long functions, or unclear names
- When refactoring code written under time pressure
- When consolidating related logic scattered across files
- After merging changes that introduced duplication or inconsistency

**When NOT to use:**

- Code is already clean and readable: don't simplify for the sake of it
- You don't understand what the code does yet: comprehend before you simplify
- The code is performance-critical and the "simpler" version would be measurably slower
- You're about to rewrite the module entirely: simplifying throwaway code wastes effort

## The five principles

1. **Preserve behavior exactly.** Same inputs, same outputs, same side effects, same errors.
2. **Follow project conventions.** Match the codebase, not your taste.
3. **Prefer clarity over cleverness.** Explicit code beats compact code.
4. **Maintain balance.** Stop before you over-simplify or merge unrelated logic.
5. **Scope to what changed.** Simplify recently modified code. Avoid drive-by refactors unless the user asks for a wider scope.

Full text, with examples: [references/principles.md](references/principles.md).

## The simplification process

1. **Understand before you touch** (Chesterton's Fence): why the code is the way it is. [references/process-steps.md](references/process-steps.md)
2. **Identify the opportunities**: structure, naming, redundancy. [references/process-steps.md](references/process-steps.md)
3. **Apply one change at a time**, below.
4. **Verify the whole**, then compare before and after. [references/process-steps.md](references/process-steps.md)

Language examples (TypeScript, JavaScript, Python, React): [references/language-guidance.md](references/language-guidance.md). Excuses and warning signs: [references/rationalizations-and-red-flags.md](references/rationalizations-and-red-flags.md). When a review flags readability, the finding comes from [`review-two-axis`](../review-two-axis/SKILL.md).

### Step 3: Apply Changes Incrementally

Make one simplification at a time. Run tests after each change. **Submit refactoring changes separately from feature or bug fix changes.** A PR that refactors and adds a feature is two PRs: split them.

```
FOR EACH SIMPLIFICATION:
1. Make the change
2. Run the test suite
3. If tests pass → commit (or continue to next simplification)
4. If tests fail → revert and reconsider
```

Avoid batching multiple simplifications into a single untested change. If something breaks, you need to know which simplification caused it.

**The Rule of 500:** If a refactoring would touch more than 500 lines, invest in automation (codemods, sed scripts, AST transforms) rather than making the changes by hand. Manual edits at that scale are error-prone and exhausting to review.

## Verification

After completing a simplification pass:

- [ ] All existing tests pass without modification
- [ ] Build succeeds with no new warnings
- [ ] Linter/formatter passes (no style regressions)
- [ ] Each simplification is a reviewable, incremental change
- [ ] The diff is clean: no unrelated changes mixed in
- [ ] Simplified code follows project conventions (checked against CLAUDE.md or equivalent)
- [ ] No error handling was removed or weakened
- [ ] No dead code was left behind (unused imports, unreachable branches)
- [ ] A teammate or review agent would approve the change as a net improvement

## Done when

- The project test command exits 0 after each simplification, and the diff holds no unrelated change.
- Each change made the code shorter or clearer, and the checklist above is ticked.

Credit: adapted from [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) (MIT). See [LICENSE](LICENSE).
