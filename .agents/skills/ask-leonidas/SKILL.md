---
name: ask-leonidas
description: "Route a task to the right skill, flow and phase boundary. Use when unsure which skill or workflow fits, what to run next, or whether to continue, hand off or compact."
metadata:
  scope: structural
  category: agents
  reach: core
  distribution: portable
  sources: ["mattpocock/ask-matt@abeeaf9"]
license: MIT
---

# Ask Leonidas

You do not remember every skill, so ask. Before you state what a skill does, or recommend that a step be skipped, read that skill's `SKILL.md`: the summaries here are for orientation only.

A **flow** is a path through the skills. Most paths run along one **main flow**, and two **on-ramps** merge onto it. Everything else is standalone, or a vocabulary layer that runs underneath. In an AIOS, also read [references/aios-routes.md](references/aios-routes.md): the intent router for PC, gaming, audit and wiki work.

## The main flow: idea to ship

The route most work travels: you have an idea and want it built. [`idea-to-ship`](../idea-to-ship/SKILL.md) runs the same steps as an autopilot with two gates.

1. **`/grill-with-docs`** sharpens the idea by interview. Start here when you work in a working directory: it keeps what it learns in `CONTEXT.md` and in ADRs. With no working directory, use `/grill-me`. Both run the same `/grilling` primitive.
2. **Branch: can you settle every question in conversation?** If a question needs a runnable answer (state, business logic, a UI you must see), detour through a prototype. Either dispatch **`/prototype`** in a background subagent while the grilling goes on, or bridge it with `/session-handoff` in both directions: hand off out, open a fresh session on that file, run `/prototype`, then hand back what you learned and point to it from the original thread.
3. **Branch: is this a multi-session build?**
   - **Yes:** **`/to-spec`** turns the thread into a spec. **`/to-tickets`** splits it into tracer-bullet tickets, each with its **blocking edges**. Then work the tickets one of two ways:
     - **`/implement`** per ticket, in a fresh session each time. Each ticket is self-contained, so the last one's context is disposable.
     - **`/implement-spec`** for the whole spec in one run. It reads the tickets as a **task graph**, runs implementer subagents across the ready **frontier**, and lands one **integration branch**.
   - **No:** **`/implement`** right here, in the same context window.

   Either way, **`/tdd`** builds the code (one red-green slice at a time) and **`/review-two-axis`** closes it: a two-axis review (Standards and Spec) of the diff. Use `/tdd` alone to build one behaviour test-first without a spec. Use `/review-two-axis` alone to review a branch or a PR against a fixed point. When the work goes up as a pull request, **`/pr`** shapes the body.

4. **`/retro`** closes the loop. After a build, and most of all one that went sideways, it looks back over the session and suggests changes to the agent's **environment**, not the code: pointers, automated checks, coding standards, steering files, tooling.

**Context hygiene.** Keep steps 1 to 3 in **one unbroken context window**, so the grilling, the spec and the tickets build on the same thinking. Compact or reset only after `/to-tickets`. Each `/implement` then starts fresh from its ticket. Run `/retro` in the session it reviews. The limit is the **smart zone**, the part of the window where the model still reasons sharply: about 150k tokens, or the selected model's live context warning when that is lower. If a session nears it before `/to-tickets`, `/compact` at the nearest phase boundary.

## On-ramps

A starting situation that makes work, then merges onto the main flow.

- **Something is broken:** **`/diagnosing-bugs`**. For the hard ones: the bug that resists a first look, the flake, the regression between two good states. It builds a **tight feedback loop** first (one command that goes red on this bug), then fixes with a regression test. Run `/retro` in the same session afterwards. If the finding is that no good seam exists, go to `/improve-codebase-architecture`.
- **A huge, foggy effort** (a greenfield project, or a feature too big for one session): **`/wayfinder`**. It charts a shared map of **decision tickets** and resolves them one at a time, making decisions, not deliverables. It hands off at `/to-spec`, which collapses the map into a buildable plan. Go straight to `/implement` only when the effort turned out small.

## Codebase health

**`/improve-codebase-architecture`** runs whenever you have a spare moment. It surfaces **deepening opportunities**. Picking one makes an idea that you take into the main flow at `/grill-with-docs`. **`/codebase-design`** is the bench where you design the chosen one.

## Vocabulary underneath

Two model-invoked references run beneath the other skills. Use them directly when the **words**, not the process, are the problem.

- **`/domain-modeling`** sharpens the project's domain language: it challenges a fuzzy term, resolves an overloaded word, and records a hard-to-reverse decision as an ADR.
- **`/codebase-design`** is the deep-module vocabulary (module, interface, depth, seam, adapter, leverage, locality) for the _shape_ of a module.

## Phase boundaries

A **phase** is a chunk of work inside a session. At the **boundary** between two phases you have five options:

- **Continue:** stay put. It costs nothing and loses nothing.
- **Fresh session:** open a new chat when nothing here matters to what is next. Never run `/clear`: it wipes the history.
- **`/session-handoff`:** write a portable file. Use it only for a **new harness**, a **new directory**, a **colleague**, or a side task forked **mid-phase**.
- **Subagent:** send a tightly scoped task to its own window and get a report back.
- **`/compact`:** compress this context. It is the default at the bottom of the tree, not the first reach.

The ordered tree and its reasoning: [references/phase-boundaries.md](references/phase-boundaries.md). Decide **at** a boundary. Mid-phase, continue or split the rest into subagents.

## Standalone

- **`/next-action`:** ranks what to work on now.
- **`/find-skills`:** finds an external skill when none here fits.
- **`/grill-me`:** the same interview as `/grill-with-docs`, but stateless. Use it when no working directory exists.
- **`/grilling`:** the interview primitive. Rounds, the frontier, facts are the agent's job and decisions are yours.
- **`/prototype`:** a small throwaway program that answers one design question. The answer folds into the real code.
- **`/research`:** delegates reading legwork to a background agent, which leaves a cited Markdown file.
- **`/to-questionnaire`:** for when the answer is in someone else's head. It writes them a questionnaire.
- **`/wizard`:** for the steps only a human can take. It makes an interactive script that captures each value.
- **`/wait-what`:** the fix for a message that did not land. The agent re-pitches it in plain words with the missing context.
- **`/teach`:** learn a concept over several sessions.
- **`/writing-for-agents`:** the reference for documents that agents read: skills, `AGENTS.md`, pointed-at docs.

More: [references/flow-taxonomies.md](references/flow-taxonomies.md) (multi-skill recipes), [references/delegation-fitness.md](references/delegation-fitness.md) (before you hand work to an agent).

## Done when

- A target skill or a skill pipeline is named and announced, and the phase boundary action (continue, fresh session, handoff, subagent, compact) is declared when one applies.
- In an AIOS, when unsure: `pwsh -File scripts/Find-SkillFlow.ps1 -Query "<topic>"` lists the matching skills.

Credit: the flow map is adapted from [mattpocock/skills](https://github.com/mattpocock/skills) `ask-matt` (MIT). See [LICENSE](LICENSE).
