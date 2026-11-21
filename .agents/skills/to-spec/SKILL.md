---
name: to-spec
description: "Turn the settled conversation into a spec with success criteria and boundaries, then publish it to the tracker. Use after a grill, when a feature has no written spec, or when asked for /to-spec."
disable-model-invocation: true
metadata:
  scope: structural
  category: planning
  reach: core
  distribution: portable
  sources: ["mattpocock/to-spec@abeeaf9", "addyosmani/spec-driven-development@aeac41d"]
license: MIT
---

# To Spec

Turn the conversation and your codebase understanding into a **spec**. Main-flow step 2: after `grilling`, before `to-tickets`. `/ask-leonidas` shows the whole flow. Do NOT interview the user: synthesize what you already know. If the goal is still foggy, stop and suggest `/grill-with-docs` first.

**Tracker:** read the Tracker section of the repo's [workflow profile](../../workflow-profile.md) (`.agents/workflow-profile.md`). With no profile, write one local file `.scratch/<feature-slug>/spec.md` and tell the user once. Task cards in an AIOS: follow [references/tracker-task-cards.md](references/tracker-task-cards.md).

## 1. Explore

Explore the repo to understand the current state of the codebase, if you have not already. Use the project's domain glossary words (`CONTEXT.md`) throughout the spec. Respect any ADRs in the area you touch.

## 2. Seams and assumptions

Sketch the seams where you will test the feature. Prefer existing seams to new ones. Use the highest seam possible. If new seams are needed, propose them at the highest point you can. The fewer seams across the codebase, the better: the ideal number is one.

List each assumption you make. Check the seams and the assumptions with the user in one message. End with: "Correct me now, or I continue with these."

## 3. Write

Write the spec with the template below. An empty section reads "none": do not delete it.

<spec-template>

## Problem Statement

The problem that the user is facing, from the user's perspective.

## Solution

The solution to the problem, from the user's perspective.

## User Stories

A LONG, numbered list of user stories. Each user story is in the format:

1. As an <actor>, I want a <feature>, so that <benefit>

<user-story-example>
1. As a mobile bank customer, I want to see balance on my accounts, so that I can make better informed decisions about my spending
</user-story-example>

The list of user stories must be extremely extensive and cover all aspects of the feature.

## Implementation Decisions

A list of implementation decisions that were made. This can include:

- The modules that will be built or modified (the touched areas)
- The interfaces of those modules that will be modified
- Technical clarifications from the developer
- Architectural decisions
- Schema changes
- API contracts
- Specific interactions

Do NOT include specific file paths or code snippets. They may end up being outdated very quickly.

Exception: if a prototype produced a snippet that encodes a decision more precisely than prose can (state machine, reducer, schema, type shape), inline it within the relevant decision and note briefly that it came from a prototype. Trim to the decision-rich parts, not a working demo, just the important bits.

## Testing Decisions

A list of testing decisions that were made. Include:

- A description of what makes a good test (only test external behavior, not implementation details)
- Which modules will be tested
- Prior art for the tests (similar types of tests in the codebase)
- The full build, test and lint commands (from the workflow profile)

## Success Criteria

Specific, testable conditions. Turn each vague request into a condition that a check can prove: a test name, a command result or a screenshot. `implement` maps every criterion to its evidence, and `review-two-axis` checks the diff against them.

## Boundaries

- **Always:** what the work does without asking.
- **Ask first:** what needs the user's yes. If the workflow profile marks a later step as "ask" (a browser or computer-use check), ask it now and record the answer here.
- **Never:** what the work must not touch.

## Out of Scope

The things that are out of scope for this spec, each with a reason.

## Further Notes

Any further notes about the feature, and the open questions.

## Workflow

Only when `idea-to-ship` runs this step: a checklist with one line for each phase (Define, Spec, Plan, Build, Verify, Review, Ship).

</spec-template>

## 4. Publish

Publish the spec to the tracker. Mark it ready for an agent (the `ready-for-agent` label where the tracker has labels): no further triage.

When `idea-to-ship` runs this step, stop at Gate 1. Show the spec link and a summary of 5 lines or fewer. Wait for a clear yes. Run alone, tell the user the next step: `/to-tickets`.

If a later step changes the scope, update the spec first.

## Done when

- The spec is published with every template section, and each success criterion names the check that proves it.
- In an AIOS: `pwsh -NoProfile -File scripts/Audit-Tasks.ps1` ends with `[PASS]`. Under `idea-to-ship`, the user's yes is recorded on the spec card.

Credit: adapted from [mattpocock/skills](https://github.com/mattpocock/skills) (MIT) and [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) (MIT). See [LICENSE](LICENSE).
