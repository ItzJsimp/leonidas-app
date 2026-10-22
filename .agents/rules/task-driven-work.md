# Task-driven work (every agent, every provider)

Work in Leonidas Code is organized around tasks. The Tasks page (Inbox, Today, Upcoming, All tasks; Dashboard, Board, List, Roadmap) is how the user sees and steers everything, so what you do has to be visible there.

## Start

1. Call `board_task_list` (and `board_task_get` for detail) before starting substantive work. Look for an existing task that covers it. Never create a duplicate.
2. If one fits, call `board_task_update` with `claim=true` and status `in_progress`. If none fits and the work is more than a quick answer, call `board_task_create` first, then start. Use this thread's project unless the work belongs elsewhere.

## While working

- Log actionable items you notice (bugs, missing tests, follow-ups, decisions that need the user) with `board_task_create`. Do this for work you will not finish now; do not create a task for what you are about to complete.
- **The server writes the log.** It records each linked chat, each run result, the ledger entries and the idle flag on the card. Do not write them by hand. Do not copy them into a `note`.
- Add one `note` per task through `board_task_update` for what the log cannot show: the reason for a choice, a rejected approach, or the next step.
- **Checkpoint when work stops unfinished.** At the end of a turn that leaves work open, or when work stops (limit, error, user stop), call `board_task_update` with a `note` that starts with `Resume:` and gives the reason, next step, blockers and branch. Skip the changed paths and run results: the log holds them. A new session resumes from this note, never from the old chat. A chat is safe to archive only when its task note is current.
- Base the plan, commits and your final summary on the task. Name the task in your closing message.

## Finish

- Set `review` when a human must check it, or `done` when it is verified. Put the exact check and its result in `note`. Never mark `done` for something you did not verify.
- Leave blocked work as `blocked` with the reason in `note`, not as `in_progress`.

## Boundaries

- Creating, claiming, updating and completing tasks is autonomous. Setting due dates and priorities is fine when you are filing a new task; do not change them on tasks someone else owns without saying so.
- Creating or assigning a task never starts paid agent work. Delegating execution, publishing and deleting need explicit user approval.
- Do not hand-edit `tasks/*.md` or `TASKS.md`. Use the task tools; AIOS sessions without them use `scripts/New-Task.ps1`.
- One-line questions and pure lookups need no task.
