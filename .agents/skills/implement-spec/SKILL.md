---
name: implement-spec
description: "Implement a whole spec and its tickets on one integration branch, with one implementer subagent per ticket in its own worktree. Use after /to-tickets, or when asked for /implement-spec."
disable-model-invocation: true
metadata:
  scope: structural
  category: code
  reach: core
  distribution: portable
  sources: ["mattpocock/implement-spec@abeeaf9", "addyosmani/planning-and-task-breakdown@aeac41d"]
license: MIT
---

# Implement Spec

Main-flow step 4 for a whole ticket graph: after `to-tickets`. For one ticket, use [`implement`](../implement/SKILL.md). `/ask-leonidas` shows the whole flow.

You have a spec with tickets. The goal is the entire spec implemented on one **integration branch**, with every ticket resolved the way the tracker closes work. Read the tracker from the [workflow profile](../../workflow-profile.md) (`.agents/workflow-profile.md`).

The tickets are not a list of steps. They are a **task graph** with blocking edges. There is always a **frontier**: the tickets whose blockers are done.

## Rules for subagents

- Start every subagent with a fresh context window.
- Keep talk sparse. Pass **context pointers** (the spec, the tickets, the notes, earlier commits). Do not copy what a pointer already holds.
- Run **implementer subagents** in the background where possible, for most concurrency.
- Use the cheapest ready model that fits each ticket. Use the model tier in the ticket's `## Execution` note. Ask the user before you use a more expensive model.
- Two tickets that edit the same files run one after the other, even with no blocking edge. A ticket that the Execution notes mark serial waits for its turn. Do a tightly coupled ticket in this chat.
- Never edit the main checkout. Create each worktree the way the repo says (some repos claim a worktree with a script). Remove only the worktrees you created.

## Steps

1. **Read the graph.** Read the spec, the tickets and the Execution notes. List the frontier.
2. **Explore (optional).** Use an **exploration subagent** for any codebase or documentation research the tickets need. It saves markdown notes in a folder outside the repo that every later subagent can read. Implementers then spend their time on implementation.
3. **Create the integration branch.** If the tracker closes work through pull requests, or the user asks for one, open a draft PR after the first merge in step 5 (a branch with no commits ahead of its base cannot open one). Mark it as closing the spec and the tickets.
4. **Start implementers.** For each frontier ticket, claim it by the tracker's claim rule in the profile, so no other agent takes it. Give it a fresh **implementer subagent** in its own worktree on its own branch. Each implementer:
   - confirms that its worktree is based on the integration branch, and resets onto it if not;
   - reads [`implement`](../implement/SKILL.md) and follows steps 1 to 4 (it calls `tdd` for red and green). It reads the file and does not call it as a skill, because `implement` is user-started;
   - merges the integration branch tip into its own branch before it reports done.
5. **Merge.** When an implementer finishes, check its result against the ticket's acceptance criteria. Then a **merger subagent** merges its branch into the integration branch.
6. **Widen the frontier.** If a merge opens new tickets, start more implementers for them.
7. **Verify and review.** When every ticket is complete, run `implement` step 5 (Verify) on the integration branch. Then load [`review-two-axis`](../review-two-axis/SKILL.md) with the commit before the integration branch started as the fixed point. Fix all the findings in one fresh implementer subagent.
8. **Land.** If a draft PR exists, mark it ready for review. Otherwise resolve each ticket the way the tracker closes work. Land the integration branch through the repo's ship path (the Ship section of the profile). Ask for the user's clear yes before a push, merge, publish or release.
9. **Clean up.** Remove every implementer worktree you made. Report the integration branch.

An implementer that meets a stop rule of `implement` (section 4) reports back to this chat. Decide, or ask the user. Do not let it continue.

## Done when

- Every ticket is resolved the way the tracker closes work, and `git branch --no-merged <integration-branch>` lists no ticket branch.
- The profile test command exits 0 on the integration branch, and `review-two-axis` reports no Critical or Required finding.
- `git worktree list` shows none of the implementer worktrees.

Credit: adapted from [mattpocock/skills](https://github.com/mattpocock/skills) (MIT) and [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) (MIT). See [LICENSE](LICENSE).
