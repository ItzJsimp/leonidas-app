---
name: implement
description: "Implement a spec or tickets through test-first slices, one commit each, then verify every success criterion with evidence. Use when work is ready to build, or when asked for /implement."
disable-model-invocation: true
metadata:
  scope: structural
  category: code
  reach: core
  distribution: portable
  sources: ["mattpocock/implement@abeeaf9", "addyosmani/incremental-implementation@aeac41d"]
license: MIT
---

# Implement

Main-flow step 4: after `to-tickets`, before `review-two-axis`. To run a whole ticket graph, use `/implement-spec`. `/ask-leonidas` shows the whole flow.

Implement the work in the spec or tickets the user names. If the user passes a ticket reference, fetch it from the tracker and state its title before you start. If the reference is ambiguous, ask. With no reference, take the next pending ticket whose blockers are done, and stop after it. Note the commit before this work started: it is the fixed point for the review.

## 1. Intake and baseline

- Read the spec or ticket. Confirm that the acceptance criteria and prerequisites are unambiguous before you write code.
- Run `git status --porcelain`. Do not stage changes that are not part of this work. In a shared checkout, stage explicit paths only (`safe-parallel-commit`). If unrelated changes block the work, ask.

## 2. Loop: one slice at a time

Take exactly one vertical slice or ticket. Then:

1. **Pre-flight.** Run static AST checks and inbound symbol checks before you edit ([verification-patterns](references/verification-patterns.md)). For a shared API, inspect the callers first (`trace_path` inbound in `codebase-memory-mcp`, when present).
2. **Red.** Call `tdd` where possible, at the pre-agreed seams. Write a check that fails because the requirement is missing, run it, and see the failure. A bug fix starts with a test that fails because of the bug (Prove-It). Flip a return value or a condition: the test must fail. Accept no vacuous assertion.
3. **Green.** Write the smallest direct code that passes. Use the standard library and platform tools before a dependency or an abstraction.
4. **Chaos probe.** Run the 4-point stress check in [adversarial-chaos-matrix](references/adversarial-chaos-matrix.md): paths with spaces and Unicode, empty or null input, CRLF against LF and UTF-8, subprocess exit codes.
5. **Refactor.** Clean up, and follow the repo's coding standards. Run typecheck and single test files often, not the full suite.
6. **Performance gate.** Run [`performance-gate`](../performance-gate/SKILL.md) on the slice diff (the fast lane for a small slice). Fix every FAIL. A slice with a FAIL is not done.
7. **Commit** to the current branch: one commit per slice, explicit paths only, never `git add -A`. The code compiles and the tests pass after each slice. Mark the ticket done in the tracker.

An AIOS adds a commit script, drift checks and task reconcile: [references/aios-commit-path.md](references/aios-commit-path.md).

## 3. Rules in every slice

- **Scope:** touch only what the slice needs. Write other findings down. Do not fix them. A blocker or an unclear design halts the slice: report it and wait.
- **Real runs:** every red and green step needs real shell output. Never say a test passes without the run.
- **No extra files:** no `implementation_plan.md` or `walkthrough.md` unless the user asks.
- **Many files:** more than 3 files in one change go through one script, not single-file edits.

## 4. Stop and ask

Do not continue when:

- a test or the build still fails after 3 attempts in a row. Stop editing, revert to the slice start (`git checkout` or `git stash`), and load `diagnosing-bugs` before you try again;
- the spec is ambiguous, or the slice needs a decision the spec does not cover;
- the slice is high risk, or `git revert` cannot undo it: auth, permissions, data migration or deletion, payments, secrets, deploy or publish.

A new run continues from the next pending ticket.

## 5. Verify

When every slice is committed:

1. Run the full test suite once, and every check in the workflow profile Verify section: tests for the changed files, lint, typecheck, build. Show each command and its result. Never claim a check you did not run.
2. Map each success criterion in the spec to evidence: a test name, a command result or a screenshot. A criterion with no evidence is a FAIL.
3. For a UI or game change, run the UI check from the profile (for example `design-audit`, a browser pass or a playtest) when the spec Boundaries allow it.
4. Run `performance-gate` on the whole change. It must give a verdict.
5. **PASS:** load `review-two-axis` with the fixed point you noted. When `idea-to-ship` runs this step, stop here: it runs the review. **FAIL:** write each failure as Location, Cause, Fix. Go back to step 2 with a fix slice for each.

Report: slices done, tests added, commits, and items skipped or flagged.

## Done when

- Every slice has a check that failed first and then passed in real output, survived the chaos probe, and has its own commit. Or the report names the stop rule that fired.
- Every success criterion has evidence, the profile test command exits 0, and `performance-gate` gave a verdict.

Credit: adapted from [mattpocock/skills](https://github.com/mattpocock/skills) (MIT) and [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) (MIT). See [LICENSE](LICENSE).
