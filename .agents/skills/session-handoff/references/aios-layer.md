# AIOS layer

Use this file in an AIOS. It holds the parts of the old `session-handoff` skill that depend on AIOS folders, scripts and the commit gate.

## Where a handoff lives

Save to `<project-root>/handoff-docs/YYYY-MM-DD-<topic-slug>.md`. Create `handoff-docs/` if it is missing. Commit the document, then print the resume prompt.

The document carries `status: open` in its frontmatter (`open | resumed | closed | superseded`). A session that resumes a handoff sets `status: resumed`. A session that finishes it sets `closed` and moves it to `handoff-docs/archive/`. The pre-commit Handoff Resume Gate blocks a new handoff document that has no `## 0. Resume Prompt` or no `status`, so a handoff written without this skill loaded still fails closed. `scripts/Check-OpenHandoffs.ps1` lists the open handoffs older than 3 days across both handoff folders.

Template, with the frontmatter and the AIOS links:

```markdown
---
status: open
---

# Session Handoff: <Task Title>
```

The body is the portable template in `SKILL.md`. In section 2, link the canon you updated: `memory/`, `decisions/` and `BUILD-PLAN.md`.

## Step 0: canon synchronization

Run this before you write the document.

1. Scan the conversation for durable decisions, roadmap updates and permanent system facts.
2. Promote every unwritten durable item into `BUILD-PLAN.md`, `decisions/` or `memory/`. The `chat-sync` skill owns this work and can run first.
3. For each project the session touched, apply the write-back rule in `templates/agent-playbook-template.md`: update `projects/<project>/agent-playbook.md` and add one dated line. The handoff holds this session's frontier. The playbook holds what every future session needs.

## The ceremonies, in order

The full map is `workflows/session-ritual-chain.md`. Each ceremony owns one artifact family.

| Order | Ceremony | Mode in this skill | Owns |
| --- | --- | --- | --- |
| 1 | `chat-sync` | (separate skill) | `memory/`, `decisions/`, `tasks/`, `capture/`, `CONTEXT.md`: durable canon, repeatable mid-session |
| 2 | Handoff | Handoff | `handoff-docs/`: the transient frontier and the resume prompt, once per context switch |
| 3 | Close the chat | [references/chat-closeout.md](chat-closeout.md) | `capture/continuations/`, `logs/lessons-learned.md`, the Archival Readiness Stamp |
| 4 | Close the day | [references/daily-closeout.md](daily-closeout.md) | `logs/closeouts/`, git hygiene, tomorrow's seed plan |
| any | Recap | [references/recap.md](recap.md) | nothing: a read-only reporter |

Boundary rules: durable facts go to canon first. Close the chat never re-lists the `chat-sync` checklist. Close the day never re-runs the chat extraction. Recap never replaces a ceremony.
