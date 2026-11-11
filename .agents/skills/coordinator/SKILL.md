---
name: coordinator
description: "Coordinate complex engineering goals across parallel Git worktrees and multi-model worker threads. Use when managing multi-task features, parallel subagents, or full project coordination."
category: agents
type: skill
id: skill-coordinator
title: "Coordinator: Multi-Agent Worktree Orchestration"
kind: procedure
load: on-demand
owner: shared
scope: structural
distribution: core
verified: 2026-10-22
related:
  ["ceo", "using-git-worktrees", "safe-parallel-commit", "task-scoping", "mode-11-coordinator"]
generated: false
---

# Coordinator: Multi-Agent Worktree Orchestration

Use when a complex goal contains independent slices, or when parallel execution accelerates delivery without cross-thread collisions.

## Core Rules

1. **The Coordinator never writes implementation code in the root directory.**
2. **Every parallel worker thread operates in an isolated Git worktree.**
3. **Select worker models based on task economics and complexity.**

## Procedure

### Step 1: Divide Goals into Vertical Slices

- Apply [`task-scoping`](../task-scoping/SKILL.md).
- Identify independent slices. Each slice must deliver an observable outcome and touch at most five files.
- Establish the dependency graph: foundations first, then parallel feature slices, then integration.

### Step 2: Allocate Isolated Worktrees

- Provision an isolated Git worktree for each independent slice.
- Native Leonidas Code launch:
  ```json
  t3_thread_launch({
    "message": "<self-contained worker brief>",
    "workspaceStrategy": {
      "type": "worktree",
      "baseRef": "main",
      "branch": "feat/<slice-name>",
      "startFromOrigin": false
    }
  })
  ```
- Terminal or script fallback:
  ```powershell
  pwsh -NoProfile -File scripts/New-AgentWorkspace.ps1 -Name "feat-<slice-name>" -BaseBranch "main" -LinkSharedState
  ```

### Step 3: Match Models and Dispatch Workers

- Call `orchestrator_capabilities` to discover available models.
- Mechanical tasks, unit tests, and repetitive edits: dispatch to high-speed or low-cost models.
- Core algorithms, security logic, and complex debugging: reserve for frontier models.
- Supply every worker brief with:
  - Exact target files and boundary exclusions.
  - Acceptance criteria and verification command.
  - Expected return format (summary of changes and test output).

### Step 4: Monitor and Review Diffs

- Monitor task progress using `task_status`.
- When a worker finishes, review the diff before merging:
  ```bash
  git diff main...feat/<slice-name>
  ```
- Reject any branch that touches files outside its designated boundary.
- Run the slice verification command in the worktree:
  ```bash
  pytest <target-test-file>
  ```

### Step 5: Merge, Clean Up, and Record Memory

- Merge verified branches into `main` sequentially:
  ```bash
  git checkout main
  git merge --ff-only feat/<slice-name>
  ```
- Remove completed worktrees:
  ```powershell
  pwsh -NoProfile -File scripts/Remove-AgentWorkspace.ps1 -Name "feat-<slice-name>" -DeleteBranch
  ```
- Record new architectural patterns or constraints in `decisions/` or `memory/` to inform subsequent sessions.
