---
name: session-handoff
description: "Compact the session into a handoff document for a fresh agent, recap what changed, or close a chat or day. Use when switching task or engine, ending a session, or asked for a handoff or recap."
argument-hint: "What will the next session be used for?"
disable-model-invocation: true
metadata:
  scope: structural
  category: flow
  reach: core
  distribution: portable
  sources: ["mattpocock/handoff@abeeaf9"]
license: MIT
---

# Session Handoff

Turn everything this session learned into one **handoff document**, so a fresh agent can resume cold without losing context or repeating failed approaches. The purpose is transfer, not archival: capture the _state, reasoning and transient frontier_ that only lives in this chat, and point at permanent repository artifacts instead of copying them.

## Pick the mode

| Mode | Use when | Follow |
| --- | --- | --- |
| **Handoff** (default) | The task, engine or directory changes, or the context is full. | This file |
| **Recap** | The user wants a read-only summary of what changed. Formerly `/recap`. | [references/recap.md](references/recap.md) |
| **Close the chat** | A substantive session ends. AIOS only. Formerly `/chat-closeout`. | [references/chat-closeout.md](references/chat-closeout.md) |
| **Close the day** | The working day ends. AIOS only. Formerly `/daily-closeout`. | [references/daily-closeout.md](references/daily-closeout.md) |

In an AIOS, also read [references/aios-layer.md](references/aios-layer.md): where handoffs live, the resume gate, and the order of the ceremonies.

## Rules

1. **Durable facts first.** Never trap a durable decision, a system fact or a standing preference in a handoff. Write it to the repo's own docs first (an ADR, a spec, the plan, a memory file).
2. **Only the transient frontier.** Record what a zero-context agent cannot find by reading the repo: uncommitted diffs, active spikes, dead ends, the next 2 to 3 tasks, and open blocker questions. Do not copy content that a spec, plan, ADR, issue, commit or diff already holds. Name it by path or URL.
3. **Goal-slanted.** If the user passes a focus argument (for example `/session-handoff fix frame pacing`), tailor the whole document around it.
4. **Redact.** Write no secret, API key, password, token or personal data. Refer to it by name (`the API key in .env`).
5. **One resume prompt.** The document opens with a `## 0. Resume Prompt` block. The last chat message prints only that block, never the whole document.

## Steps

1. **Promote durable facts** to the repo docs (rule 1).
2. **Inspect the tree.** Run `git status -s` for the exact list of modified, untracked and deleted files. Note test results, running tools and scratch scripts.
3. **Write the document.** Save it to the temporary folder of the OS (`$TMPDIR`, else `/tmp`; `%TEMP%` on Windows), not the workspace. An AIOS saves it in `handoff-docs/` instead (the AIOS layer). Use the template below.
   - **Current state, next steps, verification:** ASD-STE100 style. One instruction per sentence, active voice, present tense, 20 words or fewer for a procedure sentence, concrete file paths.
   - **Goal, decisions and constraints, dead ends:** conversational, so the _why_ and the discarded options survive.
4. **Emit the resume prompt.** End the turn with the §0 block in a `text` fence under a `Resume prompt` line. Print nothing else from the document.

````markdown
# Session Handoff: <Task Title>

**Date:** YYYY-MM-DD | **Operator:** <user> | **Status:** In Progress, Checkpoint or Blocked
**Saved to:** `<path of this document>`

## 0. Resume Prompt

```text
Resume from `<path of this document>`. Read it fully, then the files its §2 lists. Verify git state matches §2 and do not redo anything marked done. Present §5, then start step 1 unless it needs my input.
```

## 1. Goal & Focus

What we are building and why. Slanted toward the next session's focus when one was given.

## 2. Changes Landed & Working Tree

- **Canon updated:** the repo docs you wrote durable facts to.
- **Modified:** `path/to/file.ext`, one-line summary.
- **Created:** `path/to/new_file.ext`, purpose.
- **Uncommitted state:** the output of `git status -s`.

## 3. Decisions & Constraints

- **Decisions locked:** the choices made, with links to the docs that hold them.
- **Constraints:** hard boundaries not to cross.

## 4. Dead Ends & Ruled Out Approaches

- **Discarded option:** what was tried, why it failed, and why not to try it again.

## 5. Next Session Action Plan

1. [ ] The next action, with the exact target file.
2. [ ] The follow-up implementation or verification step.

## 6. How to Run / Verify

The exact command that builds, tests or verifies the current state.

## 7. Suggested Skills for Next Agent

- `skill-name`: why the next agent should call it.
````

## Done when

- The document exists with the resume prompt as §0, holds no secret, and copies nothing that another artifact holds.
- The chat ends with only the §0 block. In an AIOS: `pwsh -NoProfile -File scripts/Check-OpenHandoffs.ps1` runs, and the commit passes the Handoff Resume Gate.

Credit: the handoff rules are adapted from [mattpocock/skills](https://github.com/mattpocock/skills) (MIT). See [LICENSE](LICENSE).
