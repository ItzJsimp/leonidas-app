# Tracker: AIOS task cards

Use this file when the workflow profile names `tasks/` cards as the tracker. It holds the AIOS steps from the retired `task-scoping` skill.

1. **Write each ticket with `scripts/New-Task.ps1`** from the AIOS root, also when the chat started in a project repo. It is the only write path for cards. Pass:
   - `-Name "<NN>-<slug>"`, numbered from `01` in blocker order.
   - `-Project "projects/<slug>/project.md"` (the spec card's `project:` value).
   - `-BlockedBy <slug> ...` for each blocker. The delegation gate and `Audit-Tasks.ps1` read the `blocked_by:` field, not the body. Also list the blockers in the body.
   - `-Verify "<one command that proves it>"`.
   - `-StartFiles <paths>` for the files the ticket likely touches. This field drives parallel-conflict checks, so it is allowed even though ticket bodies carry no paths.
   - `-Content` with `Parent: <spec card link>` as the first line, a one-paragraph intent, and 3 to 6 probe-named `Done when` claims.
2. **Claim rule:** a ticket that this run builds now gets `-Status 'In progress'`, because the autonomous picker takes only `Not started` cards. Tickets left for later stay `Not started`.
3. **Lane gate:** let the gate assign `lane:`. A ticket that lands in `grill` has an open question. Batch all such questions into one `/grill-me` round (at most 3 questions), rewrite the claims, and gate again before you finish.
4. **Plan record:** for a spec card, write the ordered ticket list as a `## Plan` section on that card. Otherwise write `projects/<slug>/plan.md`. Never write `tasks/plan.md`, `tasks/todo.md` or a second `TASKS.md`: the root `TASKS.md` is generated.
5. **Execution notes:** in an `## Execution` section, give each ticket one line: model tier (read live models, cheapest ready model for mechanical tickets), and serial or parallel (no `blocked_by` edge and no shared `start_files` means parallel).
6. **Check:** `pwsh -NoProfile -File scripts/Audit-Tasks.ps1` ends with `[PASS]` (no cycles in `blocked_by`).

Claim shape example:

```markdown
## Done when

- [ ] `pwsh -NoProfile -File scripts/<Script>.ps1 -SelfTest` exits 0
- [ ] `<path/file>` renders the empty, loading and error states from the brief
- [ ] `pwsh -NoProfile -File scripts/Audit-Substrate.ps1` reports 0 defects
```
