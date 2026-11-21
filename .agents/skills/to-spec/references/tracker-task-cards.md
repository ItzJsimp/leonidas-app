# Tracker: AIOS task cards

Use this file when the workflow profile names `tasks/` cards as the tracker. It holds the AIOS publish steps from the old `to-spec` skill.

1. **Write the spec card with `scripts/New-Task.ps1`** from the AIOS root, also when the chat started in a project repo. It is the only write path for cards. Pass `-Name "<verb-first name>"`, `-Project "projects/<slug>/project.md"`, `-Verify "<one command that proves the spec is met>"` and `-Content` with the spec template.
2. **Gates:** the card has a `## Done when` section with 3 to 6 claims, each named for the check that probes it. Take them from the spec's Success Criteria. The gate rules are in `standards/tasks-standard.md`.
3. **Ready for an agent:** a card with `## Done when` gates needs no extra triage. Let the gate assign `lane:`.
4. **Card sections:** the card holds the `## Workflow` checklist that `idea-to-ship` ticks, then `## Plan` and `## Execution` from `to-tickets`. Never write `tasks/plan.md` or `tasks/todo.md`.
5. **Check:** `pwsh -NoProfile -File scripts/Audit-Tasks.ps1` ends with `[PASS]`.
