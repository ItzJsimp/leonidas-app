---
name: domain-modeling
description: "Sharpen the domain model while designing: challenge terms, write CONTEXT.md glossary entries, record ADRs. Use when naming concepts, resolving fuzzy terms, or deciding architecture."
category: code
scope: structural
source: "https://github.com/mattpocock/skills (skills/engineering/domain-modeling, MIT, commit abeeaf9, adapted for the AIOS)"
distribution: core
license: MIT
---

# Domain Modeling

Actively build and sharpen the project's domain model as you design. This is the _active_ discipline: challenging terms, inventing edge-case scenarios, and writing the glossary and decisions down the moment they crystallise. (Merely _reading_ `CONTEXT.md` for vocabulary is not this skill: that's a one-line habit any skill can do. This skill is for when you're changing the model, not just consuming it.)

## File structure

Most repos have a single context:

```
/
├── CONTEXT.md
├── decisions/ (or docs/adr/)
│   ├── 0001-event-sourced-orders.md
│   └── 0002-postgres-for-write-model.md
└── src/
```

If a `CONTEXT-MAP.md` exists at the root, the repo has multiple contexts. The map points to where each one lives:

```
/
├── CONTEXT-MAP.md
├── decisions/                        ← system-wide decisions
└── projects/ (or src/)
    ├── ordering/
    │   ├── CONTEXT.md
    │   └── decisions/                ← context-specific decisions
    └── billing/
        ├── CONTEXT.md
        └── decisions/
```

Create files lazily: only when you have something to write. If no `CONTEXT.md` exists, create one when the first term is resolved. If no `decisions/` or `docs/adr/` exists, create `decisions/` (in AIOS) or `docs/adr/` (in external projects) when the first ADR is needed.

## During the session

### Challenge against the glossary

When the user uses a term that conflicts with the existing language in `CONTEXT.md`, call it out immediately. "Your glossary defines 'cancellation' as X, but you seem to mean Y. Which is it?"

### Sharpen fuzzy language

When the user uses vague or overloaded terms, propose a precise canonical term. "You're saying 'account': do you mean the Customer or the User? Those are different things."

### Discuss concrete scenarios

When domain relationships are being discussed, stress-test them with specific scenarios. Invent scenarios that probe edge cases and force the user to be precise about the boundaries between concepts.

### Test candidate names with scenarios

When one concept has two or more candidate names, put them in a table with the columns: candidate name, a realistic scenario (a sentence the team would say, or a short user flow), reads naturally here, used aloud. Weight the name the user already says out loud: spoken use beats a tidy name that nobody says.

### Cross-reference with code & ADRs

When the user states how something works, check whether the code agrees. If you find a contradiction, surface it: "Your code cancels entire Orders, but you just said partial cancellation is possible. Which is right?"

When a new architectural direction is proposed, scan existing ADRs in `decisions/` (or `docs/adr/`) to detect conflicts or superseding relationships before writing.

### Update CONTEXT.md inline

When a term is resolved, update `CONTEXT.md` right there. Don't batch these up: capture them as they happen. Use the format in [`CONTEXT-FORMAT.md`](./CONTEXT-FORMAT.md).

`CONTEXT.md` should be totally devoid of implementation details. Do not treat `CONTEXT.md` as a spec, a scratch pad, or a repository for implementation decisions. It is a glossary and nothing else.

### Offer ADRs sparingly

Only offer to create an ADR when all three are true:

1. **Hard to reverse**: the cost of changing your mind later is meaningful
2. **Surprising without context**: a future reader will wonder "why did they do it this way?"
3. **The result of a real trade-off**: there were genuine alternatives and you picked one for specific reasons

If any of the three is missing, skip the ADR. Use the format in [`ADR-FORMAT.md`](./ADR-FORMAT.md).

Credit: adapted from [mattpocock/skills](https://github.com/mattpocock/skills) (MIT). See [LICENSE](LICENSE).
