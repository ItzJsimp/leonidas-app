---
name: idea-to-ship
description: "Run a build task from idea to ship: define, spec, plan, build, test, review, ship, with two approval stops. Use when asked to build, add, change or fix a feature, or to run the full workflow."
category: idea-to-ship
scope: structural
distribution: core
portable: true
type: skill
id: skill-idea-to-ship
title: "Idea to Ship"
kind: procedure
load: on-demand
owner: shared
verified: 2026-10-21
source: "https://github.com/addyosmani/agent-skills (adapted from .claude/commands, MIT, commit aeac41d)"
---

# Idea to Ship

The conductor. It holds no phase instructions: each phase command holds its own. Load one phase at a time, follow it fully, then go to the next.

## Steps

1. **Read the profile.** Open `.agents/workflow-profile.md` in the repo root. If the file or a section (Tracker, Verify, Ship, Never) is missing, add it from [references/workflow-profile-template.md](references/workflow-profile-template.md). Fill it from the repo's AGENTS.md, CLAUDE.md and package files, and tell the user in one line.
2. **Size the task** by files touched, on the `plan` scale (XS 1, S 1 to 2, M 3 to 5, L 6 to 8, XL more than 8). Say the size and the path in one line. If the size grows during the work, size again.
   - **XS** (1 file, the change is known): run phases 4, 5 and 7 only. Phase 4 starts with a test that fails first (Prove-It). That test is the success criterion. There is no spec card, so record the Gate 2 answer in the report.
   - **S or larger:** run all 7 phases. The plan can be one slice.
   - **XL, or more than one session:** plan it with `wayfinder` first, then run each piece from here.
   - **Bug with unknown cause:** load `diagnosing-bugs` first, then return here as XS or S.
3. **Run the phases in order.** Before each phase, write `Phase N/7: <name>`. Load the command skill with the Skill tool. If the Skill tool is missing, read its `SKILL.md`.

   | #   | Phase  | Load                | Exit condition                        |
   | --- | ------ | ------------------- | ------------------------------------- |
   | 1   | Define | `grilling`          | every open question answered          |
   | 2   | Spec   | `spec`              | spec approved (Gate 1)                |
   | 3   | Plan   | `plan`              | slices written with acceptance checks |
   | 4   | Build  | `build` (auto mode) | every slice committed                 |
   | 5   | Verify | `test`              | PASS                                  |
   | 6   | Review | `review`            | no Critical or Required findings      |
   | 7   | Ship   | `ship`              | user approved (Gate 2), shipped       |

4. **Stop only for these:** Phase 1 questions that only the user can answer, Gate 1 (the spec), Gate 2 (before push, merge, publish or release), the stop rules in `build`, and the 3-loop limit in step 5. At a gate, accept only a clear yes ("yes", "go", "approve"). A hedged answer is not a yes.
5. **Loop on failure.** A FAIL from `test` or `review` goes back to `build`. Write each finding as a fix slice on the spec card, so `build` has a pending slice. After 3 loops on the same failure, stop and report.
6. **Keep the state on the spec card.** Tick the `## Workflow` checklist on the spec card as each phase ends, so the work can continue after compaction or in a new chat.
7. **Report once at the end:** phases run, phases skipped (with reason), commits, checks with results, and gate decisions.

## Done when

- Each phase that ran has met its exit condition, or the report names the phase that stopped and why.
- Each gate that applied has an explicit user answer recorded on the spec card (XS: in the report).
