---
name: "ceo"
description: "Run complex, parallel work with one orchestrator and cheaper bounded workers, then check each result. Use when a task has independent slices or spans many files."
category: "agents"
type: "skill"
id: "skill-ceo"
title: "CEO: Plan, Delegate, Review"
kind: "procedure"
load: "on-demand"
owner: "shared"
scope: "structural"
distribution: "core"
verified: "2026-10-11"
related:
  ["skills-index", "implement", "codebase-design", "efficiency-standard", "ai-build-protocol"]
generated: false
---

# Tiered Orchestration: Plan, Delegate, Review

Use a strong orchestrator to plan and review complex work while lower-cost agents handle bounded pieces that benefit from parallel work or specialization.

## Use it when

- Work spans independent modules or has distinct research and implementation slices.
- Broad repository exploration would otherwise consume the main agent's context.
- A mechanical change can be isolated behind a clear interface and acceptance checks.
- Expected savings exceed the extra calls, coordination, and review.

Keep focused fixes, direct questions, tightly coupled sequences, and tasks with no useful child assignment in the current agent.

## Set the roles

- The current thread model is the orchestrator. It cannot switch itself to a stronger model. Select a frontier-capable model before work that needs frontier-level planning or review.
- The orchestrator owns planning, interface decisions, integration, final review, and the user-facing result.
- Choose each worker's exact provider instance and model from the live orchestrator_capabilities result. Match tool support, context, reliability, quota, and cost to the slice.
- If a requested worker model is absent, stop that branch and explain the catalog gap. Do not silently use a different model or router.

## Run the work

1. Identify independent slices and decisions that must stay with the orchestrator.
2. Write one brief per child with target files, exclusions, acceptance checks, authorized verification, and return format.
3. Use delegate_task for app-owned child work. Run independent slices asynchronously and dependent work sequentially.
4. Use the smallest worker count that preserves useful parallelism.
5. Track taskId for every child and use task_status or task_cancel to manage it.

## Review and deliver

Inspect each child's exact diff and files. Check scope, contracts, edge cases, errors, and project rules. Run only the focused verification allowed by the user and repository. Correct omissions and report checks that could not be run.

For comparisons, record worker and orchestrator requests, actual provider/model, token usage, elapsed time, accepted diff, correction rounds, and human review time. A free model can have request caps and can increase total effort through retries or review.
