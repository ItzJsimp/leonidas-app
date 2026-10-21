---
name: plan
description: "Step 3 of Idea to Ship: break an approved spec into small, ordered vertical slices with acceptance checks. Use after a spec is approved, or when asked for /plan."
category: idea-to-ship
scope: structural
distribution: core
portable: true
type: skill
id: skill-plan
title: "Plan"
kind: procedure
load: on-demand
owner: shared
verified: 2026-10-16
source: "https://github.com/addyosmani/agent-skills (adapted from .claude/commands, MIT, commit aeac41d)"
---

# /plan: slice the work

Engine: `task-scoping`. Added from Addy Osmani's planning-and-task-breakdown: sizing, checkpoints and ordering. Added from `to-tickets`: blocked-by edges.

## Steps

1. **Require an approved spec.** If there is none, stop and tell the user to run `/spec`.
2. **Survey, read only.** Load `task-scoping` and follow it. Write no code in this phase.
3. **Size each slice.** XS = 1 file. S = 1 to 2 files. M = 3 to 5 files. L = 6 to 8 files: split it. XL = more than 8 files: you must split it. Also split a slice when it needs more than one session, needs more than 3 acceptance bullets, touches two independent subsystems, or has "and" in its title.
4. **Write each slice** with: acceptance criteria, the command that verifies it, and a `Blocked by:` line (names of slices that must finish first, or "none").
5. **Order the slices.** Dependencies first. High-risk slices early. Each slice leaves the system in a working state.
6. **Add a checkpoint after every 2 to 3 slices:** tests pass, the build passes, the core flow works.
7. **Write the output to the tracker in the profile.** Never write `tasks/plan.md` or `tasks/todo.md` in a repo that keeps task cards in `tasks/`. If an unfinished plan for different work exists, ask before you replace it.
8. **Write the execution plan** in a `## Execution` section on the spec card. For each slice, decide:
   - **Where it runs:** this chat (default), a subagent, or a new chat. Use a new chat only when the remaining work will not fit in this chat's context; write a resume prompt for it.
   - **Parallel or serial:** slices with no `Blocked by:` edge between them and no shared files can run in parallel as subagents. Slices that touch the same files run in order in this chat.
   - **Model and effort:** pick from the models that the harness reports as available now. Use a small, fast model for mechanical slices (rename, boilerplate, one-file edit). Keep architecture, risky and integration slices on the main model. Never name a model that the harness does not report.
9. **Claim the slices that this run builds,** so a background task runner does not take them at the same time. Follow the tracker's claim rule in the profile.
10. **Continue.** From the conductor, go to `/build` in this chat, and follow the execution plan. When run alone, show the plan and stop.

## Done when

- Every slice is XS, S or M, and has acceptance criteria, a verify command and a `Blocked by:` line.
- The spec card has an `## Execution` section that gives each slice a place, an order or parallel group, and a model tier.
