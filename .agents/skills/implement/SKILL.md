---
name: "implement"
description: "Execute plans and specifications through disciplined test-first slices with mutation gates, AST checks, and atomic commits. Use when a plan or spec is approved and ready to build."
category: "code"
type: "skill"
id: "skill-implement"
title: "Implement: Disciplined Test-First Execution Loop"
kind: "procedure"
load: "on-demand"
owner: "shared"
scope: "structural"
source: "https://github.com/mattpocock/skills (skills/engineering/implement, MIT, adapted for the AIOS)"
distribution: core
verified: "2026-10-08"
related: ["skills-index", "tdd", "execution-standard", "complete-slice", "codebase-design"]
generated: false
---

# Implement: Disciplined Test-First Execution Loop

**Upstream of this skill:** for a new build or non-trivial system (not a one-line fix), run the 6 phases before this one per [`standards/execution-standard.md`](../../../standards/execution-standard.md): Ideate & Scope, Deep Research, Core Principles, Power User Posture, Best Practices, Gap Analysis (with 3 Work Tiers). This skill is that standard's 7th phase, Test-First Execution.

## Purpose

Translates an approved plan, task checklist, or technical specification into tested, production-hardened code through a vertical-slice loop. Enforces observable red-phase validation, counterfactual mutation falsification, static AST pre-flight checks, 3-strike rollback circuit breakers, adversarial chaos probes, and atomic telemetry-backed commits.

---

## Procedure

1. **Intake & Boundary Check:**
   - Read the approved task specification, plan checklist, or prompt brief.
   - Confirm acceptance criteria and prerequisites are unambiguous before writing code.

2. **Slice Extraction & Static Pre-Flight:**
   - Select exactly one vertical slice or numbered task item.
   - Run static AST parsing and inbound symbol checks before modifying code (consult [`verification-patterns.md`](./references/verification-patterns.md)).
   - For shared APIs or cmdlets, inspect callers via `codebase-memory-mcp` (`trace_path` with `direction="inbound"`) to protect external contracts.

3. **Red Phase (Observable Failure & Anti-Tautology Invariant):**
   - Establish a reproducible failing test or check that proves the requirement is currently missing.
   - Run the check and observe the non-zero exit code or assertion failure.
   - **Counterfactual Mutation Inversion:** Verify the test is sensitive: if a return value or condition is flipped, the test MUST fail. Never accept vacuous assertions (consult [`verification-patterns.md`](./references/verification-patterns.md)).

4. **Green Phase (Minimal Direct Implementation):**
   - Write the minimal direct code required to make the failing test pass.
   - Reach for standard library and platform-native tools before adding dependencies or abstractions.

5. **Adversarial Chaos Probe (Dirty Environment Stress):**
   - Once the slice passes green on happy-path inputs, execute the 4-point stress check per [`adversarial-chaos-matrix.md`](./references/adversarial-chaos-matrix.md):
     1. Dirty paths with spaces (e.g. `<repo>/`) and Unicode.
     2. Empty/null input streams and edge collections.
     3. Line-ending CRLF vs LF invariance and UTF-8 encoding.
     4. Subprocess exit code trapping (`$LASTEXITCODE -ne 0`).

6. **Refactor Phase & 3-Strike Rollback Circuit Breaker:**
   - Clean up formatting, streamline logic, and adhere to workspace coding standards.
   - **3-Strike Rollback Invariant:** If an implementation or refactor attempt fails 3 consecutive times, stop editing immediately. Revert dirty changes to the slice start via `git checkout` / `git stash`, drop back to M1 root-cause diagnosis, and resolve the underlying blocker before re-attempting. Never thrash edits in a failing state.

7. **Performance Gate, then Reconcile, Micro-Telemetry & Commit Slice:**
   - Before committing code, run [`performance-gate`](../performance-gate/SKILL.md) on the slice diff (Fast lane for small slices) and fix any FAIL. A slice with a FAIL verdict is not done.
   - Run `pwsh -File scripts/Complete-Slice.ps1 -Paths <files...> -Message "<type>(<scope>): <summary>"` to verify zero em dashes, check drift, log slice telemetry to `logs/slice-telemetry.jsonl`, and execute an atomic git commit per [ADR-0010](../../../decisions/0010-git-history-replaces-the-master-log.md).
   - Reconcile task state by marking the slice item complete (`[x]`) in the active task file under [`tasks/`](../../../tasks/tasks-index.md).

8. **Loop or Finalize:**
   - Repeat steps 2 through 7 for each remaining slice.
   - When all slices complete, verify full suite health and append any discovered quirks to [`logs/lessons-learned.md`](../../../logs/lessons-learned.md).

---

## Execution Guardrails

- **No Simulated Verifications:** Every Red and Green transition must be backed by actual shell execution output. Never assert tests pass without running the command.
- **Single Slice Boundary:** Never modify files outside the current task slice. If a blocker or architectural ambiguity is hit, immediately halt the slice, report the obstacle, and await user direction.
- **No Unsolicited Planning Artifacts (Rule 6):** Never generate `implementation_plan.md` or `walkthrough.md` files unless explicitly requested.
- **Batch Multi-File Operations (Rule 3):** When modifying or refactoring >3 files, write and run a single script rather than executing sequential single-file tool calls.
- **Zero Em-Dash Standard (Rule 4):** Never introduce U+2014 em dashes in code, comments, strings, or documentation.
- **Relative File Links (Rule 7):** Format all path and symbol references in prose as repo-relative clickable links.

---

## Done When

The implementation task is complete when all seven are true:

1. **Every Slice Check Green:** All acceptance criteria in the intake plan have an automated check that passes green.
2. **Adversarial Chaos Survived:** Touched code survives spaces in paths, nulls, and subprocess error trapping.
3. **Substrate Drift Clean:** `scripts/Detect-Drift.ps1` emits zero `[FAIL]` lines.
4. **Punctuation Clean:** `scripts/Find-EmDashes.ps1` reports zero em dashes in touched files.
5. **Atomic Git Log & Telemetry:** Every slice corresponds to a distinct git commit and is logged to `logs/slice-telemetry.jsonl`.
6. **Task Progress Reconciled:** The source task checklist or file in [`tasks/`](../../../tasks/tasks-index.md) reflects updated `[x]` completion states.
7. **Performance Gate Passed:** every code slice carries a `Performance Gate: PASS` (or an owner-accepted PASS-WITH-RISK) verdict.
