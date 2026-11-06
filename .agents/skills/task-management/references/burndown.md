# Burndown: analyze the open task list and delegate it by lane and engine

Run when the user asks to work the whole list down ("take my tasks to zero", "what can I start on", "delegate my tasks"). Built from the 2026-10-01 to 2026-10-02 session (`4d4a19b5b`, `bce512026`, `0057b7203`). Decisions and their reasons: [`logs/grill-sessions/2026-10-02-task-burndown-strategy.md`](../../../../logs/grill-sessions/2026-10-02-task-burndown-strategy.md).

## 1. Truth pass (state matches git and disk)

1. Run `python scripts/task-health-sweep.py` and fix every schema and scoping defect it lists, writing all edits through one script (AGENTS.md rule 3).
2. Split the open cards into chunks of about 45 and hand each chunk to one read-only Sonnet `Explore` agent. The brief is [`burndown-audit-brief.md`](./burndown-audit-brief.md) (copy it to a temp folder next to the chunk files): each agent returns DONE, PARTIAL, SUPERSEDED or OPEN per card with evidence, plus proposed gates, and checkpoints to a result file so an interrupted run loses nothing.
3. Verify every DONE and SUPERSEDED claim yourself before closing anything. Apply PARTIAL as `In progress` only; never tick boxes on an agent's word.
4. Reject any proposed gate that drops original scope (fewer gates than before) or that only defers a decision ("name the test file"). Merge the gates by hand, or set `lane: grill`.
5. Before applying any edit script to all cards, run it on 2 cards and diff them (MASTER §3 Session economy).
6. Start the the user pass (step 2) in a fresh chat from the capture file once the truth pass is committed.

## 2. the user pass (one grill, all frontier questions at once)

Ask, using the [grilling](../../grilling/SKILL.md) format, only what the facts can't answer: burndown policy (execute all, bankruptcy with an undo, or keep-or-kill rounds), Hermes status, engine split, session shape, execution order, and approval for the lane re-gate (`Test-TaskGate.ps1 -All -Apply`). Find facts first: lane, priority and age counts, engine health, and money state.

## 3. Engine routing

Use [`workflows/task-pipeline.md`](../../../../workflows/task-pipeline.md) §4. The old fixed table (Antigravity, Hermes, named model versions) was retired on 2026-10-15: Leonidas is the daily harness, and the live model list comes from `orchestrator_capabilities`.

## 3b. Batch ranking and card handling

Rank the next batch with [`burndown-rank.py`](./burndown-rank.py). Per card: probe the gates against disk first (about 1 in 3 cards is already done or built differently than the card says), close with `scripts/Complete-Task.ps1 <file>.md "<resolution>"`, and route any card whose gate needs the user's number, taste or approval to `lane: grill` with a `## Progress` note instead of guessing.

## 4. Session plan

Split the work into themed sessions on one shared `main` checkout. Each session owns its theme's folders and commits with `git commit --only <paths>`; no worktrees, so every chat sees the others' edits immediately. Write one prompt per session with [`prompt-composer`](../../prompt-composer/SKILL.md) into a dated `handoff-docs/` file, ordered: unblock the system first, then smallest cards first.

## Done when

- [ ] The sweep reports 0 finished-but-open cards, 0 duplicates and 0 scoping defects, or only the user-owned items remain.
- [ ] The grill capture file holds the user's verbatim answers and a synthesis.
- [ ] A dated handoff file holds one composed prompt per themed session, and everything is committed with a `Task:` or `Decision:` prefix.
