---
name: to-tickets
description: "Break a spec, plan or conversation into small tracer-bullet tickets with blocking edges, then publish them to the tracker. Use after a spec exists, or when asked for /to-tickets."
disable-model-invocation: true
metadata:
  scope: structural
  category: planning
  reach: core
  distribution: portable
  sources: ["mattpocock/to-tickets@abeeaf9", "addyosmani/planning-and-task-breakdown@aeac41d"]
license: MIT
---

# To Tickets

Break a spec, plan or conversation into **tickets**: tracer-bullet vertical slices. Each ticket declares the tickets that **block** it. Main-flow step 3: after `to-spec`, before `implement` or `implement-spec`. `/ask-leonidas` shows the whole flow.

**Tracker:** read the Tracker section of the repo's [workflow profile](../../workflow-profile.md) (`.agents/workflow-profile.md`). With no profile, write local files under `.scratch/<feature-slug>/issues/` and tell the user once. Task cards in an AIOS: follow [references/tracker-task-cards.md](references/tracker-task-cards.md).

## 1. Gather context

Work from the conversation. If the user passes a reference (a spec path, an issue number or a URL), read its full body and comments. If the goal is still foggy, stop and suggest `/grill-with-docs` first. When `idea-to-ship` runs this step, the spec must carry Gate 1 approval.

## 2. Survey, read only

Write no code in this step. Map what exists: components, scripts, tests, names. Mark each touched piece as reuse, modify or create. Only modify and create get tickets. Note risks and unknowns.

Use the glossary words (`CONTEXT.md`) in titles, and respect the ADRs in the area. Look for a prefactor that makes the change easy: "make the change easy, then make the easy change."

## 3. Draft vertical slices

- Each slice cuts a narrow but complete path through every layer (schema, API, UI, tests). Never one horizontal layer.
- A finished slice is demoable or verifiable alone, and leaves the system working.
- No "set up the project" slices. Prefactoring comes first.
- **Size by files touched:** XS 1, S 1 to 2, M 3 to 5. Split L (6 to 8) and XL (more than 8). Also split a slice that needs more than one fresh context window, more than 3 acceptance bullets, two independent subsystems, or has "and" in its title.
- Each slice gets acceptance criteria, **one command that verifies it**, and its **blocking edges** (tickets that must finish first, or "none").

**Wide refactors are the exception.** One mechanical change whose blast radius fans across the codebase (rename a column, retype a shared symbol) cannot land as one green vertical slice. Sequence it as **expand, migrate, contract**: add the new form beside the old, migrate call sites in batches sized by blast radius (one ticket each, blocked by the expand), then delete the old form in a ticket blocked by every batch. When even the batches cannot stay green alone, let them share an integration branch that blocks a final integrate-and-verify ticket.

## 4. Order and checkpoints

Order: blockers first, then highest risk (fail fast), then most visible (the user checks direction early). After every 2 to 3 slices, add a checkpoint: tests pass, the build passes, the core flow works.

## 5. Quiz the user

Show the breakdown as a numbered list: title, blocked by, what it delivers, size. Ask:

- Does the granularity feel right (too coarse or too fine)?
- Does each ticket depend only on tickets that really gate it?
- Should any ticket be merged or split?

Repeat until the user approves.

## 6. Publish

Publish in dependency order, blockers first, so each edge can name a real identifier. Templates: [references/ticket-templates.md](references/ticket-templates.md).

- **Local files:** one file per ticket, `<NN>-<slug>.md`, numbered from `01`. Never one combined file.
- **A real tracker (GitHub, Linear):** one issue per ticket. Use the native blocking link where one exists. If the source was an issue, make each ticket its sub-issue. Add the `ready-for-agent` label unless told otherwise. Do not close or change the parent issue.
- **Task cards:** see the tracker reference.

Mark mechanical tickets (rename, boilerplate, one-file edit) as fit for a cheap model. Claim the tickets this run builds now, by the tracker's claim rule in the profile. If an unfinished plan for different work exists, ask before you replace it.

Leave file paths and code out of ticket bodies: they go stale. Exception: a prototype snippet that states a decision better than prose (state machine, reducer, schema, type shape). Trim it to the decision and say it came from a prototype.

## 7. Hand on

The **frontier** is every ticket whose blockers are done. Tell the user the next step: `/implement` per ticket, or `/implement-spec` for the whole graph. The spec and tickets now hold the truth, so this is the place to reset context (`/compact`, or a fresh session).

## Done when

- Every ticket is XS, S or M, with acceptance criteria, one verify command and a blocked-by line.
- The user approved the breakdown, and every ticket is published in blocker order.
- The blocking graph has no cycle. In an AIOS: `pwsh -NoProfile -File scripts/Audit-Tasks.ps1` ends with `[PASS]`.

Credit: adapted from [mattpocock/skills](https://github.com/mattpocock/skills) (MIT) and [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) (MIT). See [LICENSE](LICENSE).
