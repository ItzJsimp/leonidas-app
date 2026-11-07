---
name: next-action
description: "Grill the user on time, energy and goal, rank the top 5 tasks from the project's task cards, then work the pick in chat, as a fresh-chat prompt, or by delegation. Use when asked what to work on or what is next."
category: flow
scope: structural
distribution: core
license: MIT
---

# Next Action

Read the project's task cards, grill the operator about the session, rank the top 5 tasks, then start the pick right away. Works in any project that has a `tasks/` folder.

The operator should never have to think about what to do next. Ask sharp questions, show real tasks, and then act.

## 1. Read the pool first (facts before questions)

```bash
python <skill-folder>/scripts/resolve_tasks.py --workspace <workspace> --rank --limit 12
```

- The script finds the task store, detects the project and operator, and returns the ranked pool with `route`, `why`, `done_when` and `blocked_by`.
- Read the pool before you ask anything. Every question in step 2 must use what is in the pool.
- `status: not_found`: say so in one line, offer to create the first task card with `task-management`, and stop.
- Python missing: list `tasks/*.md` and read the front matter by hand.

## 2. Grill round 1: the session (one call, 3 questions)

Load [grilling](../grilling/SKILL.md) and ask in its round format with the structured question tool (Claude: `AskUserQuestion`). Do not invent a tool name. If the tool is missing, load it with ToolSearch `select:AskUserQuestion`. If that fails, a `deny` entry in the Claude `settings.json` hides it: tell the operator, and ask in chat only until it is fixed. One call, all three questions together:

1. **Time and energy.** Options: a quick slot (under 30 min, low energy), a focused block (1 to 2 hours), a deep block (2+ hours, high energy). Recommend the one that fits the time of day and the pool.
2. **Kind of win.** Build options from the pool, not from a generic list. Examples: ship something (ready build tasks), settle decisions (`grill` lane cards), clear the review backlog (`Awaiting Review`), do the manual steps (`human` lane). Offer only kinds that exist in the pool. Recommend the kind with the most `Critical` or `High` cards.
3. **Project focus.** Only when the pool spans 2 or more projects. Options: the 2 or 3 projects with the most top-ranked cards, plus the current project. Skip it when the pool has one project.

Skip rules:

- The operator already gave an answer in the prompt (`next action, 1 hour, quick wins`): skip that question.
- The operator says `just pick` or `skip`: skip all questions and rank with defaults. Never offer "skip" as an option. The operator must ask for it.

Map answers to flags: time and energy to `--energy low|medium|high`, kind of win to `--focus code|arch|review|all`, project to `--project <slug>`.

## 3. Rank and show the top 5

```bash
python <skill-folder>/scripts/resolve_tasks.py --workspace <workspace> --rank --energy <e> --focus <f> --project <p>
```

Show the 5 tasks in one `leo:table` block: rank, linked task title, priority, effort, route badge, and a `why now` of 12 words or fewer. Add one line below: the 3 settings you used.

Check the top task before you show it: read its card, confirm `Done when` is testable and nothing in `blocked_by` is open. Replace a task that fails this check with the next one.

## 4. Grill round 2: pick and route (one call, 2 questions)

1. **Which task.** Options: tasks 1 to 4, task 1 first and marked `(Recommended)`. The tool adds "Other" for task 5.
2. **How to run it.** Options:
   - Use the route I flagged for my pick (Recommended)
   - Work it here in this chat
   - Give me a prompt for a fresh chat
   - Delegate it to a subagent

Route badges from the script:

| Badge             | Route             | Meaning                                                       |
| ----------------- | ----------------- | ------------------------------------------------------------- |
| 🟢 In-Chat        | `in-chat`         | Small, clear finish line. Work here.                          |
| 🔵 New Chat       | `prompt-composer` | Large or multi-file. Fresh context is better.                 |
| 🟣 Subagent-Ready | `subagent`        | Autonomous card with start point and checks.                  |
| 🟠 Grill First    | `grill`           | Decisions are open. Run `grilling` on the card first.         |
| ⚪ Human Steps    | `human`           | Needs the operator's accounts or hands. Walk them through it. |
| 🟡 Review         | `review`          | Work is done. Check it against `Done when`.                   |

## 5. Act on the pick

Start in the same turn. Set the card status to `In progress` first.

- **In-chat:** pick the method from the task type, not by habit. Code: `idea-to-ship` or `build` (tests first). Decisions: `grilling` on the card, then write the decisions into it. Docs and admin: do the work and check `Done when`. Review: `review-two-axis` or read the diff against `Done when`.
- **Fresh chat:** run `... --draft-prompt <N>`, improve it with `prompt-composer`, and show it in a fenced block. In Leonidas Code, also open it with `t3_thread_launch` (`message` = the prompt, `workspaceStrategy` = `root`). The operator chose this route, so this counts as the explicit ask for a new thread.
- **Delegate:** follow the project's subagent rule. Ask for approval if the rule requires it. Send `delegate_task` with the card path, objective, file limits and `Done when`. Check the diff and run the checks yourself before you report done. See [verify delegated work](references/hermes-plate-verify.md).
- **Grill first or human:** run the `grilling` skill on the card (it keeps its own capture file). For `human` cards, give numbered steps of 2 minutes or less and the exact link or command for each. Use `wizard` for long flows.

Finish with the proof gate in [proof-gates](references/proof-gates.md): update the card (`Done`, `Awaiting Review` or `Blocked`) with the real check result, stage only files from this task, and commit.

## Done when

- Round 1 and round 2 were asked with the question tool, unless the operator asked to skip.
- The operator saw 5 real tasks from the cards, not a generic list.
- The pick is running, drafted as a prompt, or delegated, and its card status shows it.
- No task was started without the operator's pick.
