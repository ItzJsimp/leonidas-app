# Ticket templates

## Local file (`.scratch/<feature-slug>/issues/<NN>-<slug>.md`)

```markdown
# <NN>: <Ticket title>

**What to build:** the end-to-end behaviour this ticket makes work, from the user's view, not a layer-by-layer list.

**Blocked by:** the numbers and titles of the tickets that gate this one, or "None (can start immediately)".

**Size:** XS, S or M.

**Verify:** `<one command that proves it>`

**Status:** ready-for-agent

- [ ] Acceptance criterion 1
- [ ] Acceptance criterion 2
```

## Issue on a real tracker

```markdown
## Parent

A reference to the parent issue (omit when the source was not an issue).

## What to build

The end-to-end behaviour this ticket makes work, from the user's view.

## Acceptance criteria

- [ ] Criterion 1
- [ ] Criterion 2

## Verify

`<one command that proves it>`

## Blocked by

- A reference to each blocking ticket, or "None (can start immediately)". Omit this section when the blockers are native links.
```
