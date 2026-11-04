---
name: code-simplify
description: "Simplify recently changed code without changing behavior, with a test run after each change. Use after review flags readability, or when asked for /code-simplify."
category: idea-to-ship
scope: structural
distribution: core
disable-model-invocation: true
portable: true
type: skill
id: skill-code-simplify
title: "Code Simplify"
kind: procedure
load: on-demand
owner: shared
verified: 2026-10-16
source: "https://github.com/addyosmani/agent-skills (adapted from .claude/commands, MIT, commit aeac41d)"
license: MIT
---

# /code-simplify

A short entry point to `code-simplification`.

## Steps

1. **Find the target:** the recent changes, unless the user gives a wider scope.
2. **Load `code-simplification`** and follow it.
3. **Apply one simplification at a time.** Run the tests after each one. If a test fails, revert that change.
4. **Finish** with tests and the build passing and a clean diff.

## Done when

- Behavior is the same (tests pass), and each change made the code shorter or clearer.

Credit: adapted from [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) (MIT). See [LICENSE](LICENSE).
