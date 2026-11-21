---
name: skill-creator
description: "Create, refactor or learn a skill from an idea, a doc, a past chat or repeated corrections, with a sharp trigger description. Use when a task should become a skill or a skill needs fixing."
metadata:
  scope: structural
  category: agents
  reach: core
  distribution: portable
  sources: ["mattpocock/writing-for-agents@abeeaf9"]
license: MIT
---

# Skill Creator

The authoring workflow for an agent skill: from intent and trigger design to progressive disclosure and a check that proves it. The rules for names, tags and budgets live in the repo's skill standard. If they disagree with this file, the standard wins. In an AIOS, read [references/aios-layer.md](references/aios-layer.md) for the standard, the scaffold script and the sync and lint steps.

**Draft first.** Write or change a skill only after the user accepts the draft.

Writing theory (pointers, leading words, information hierarchy, pruning) is in [`writing-for-agents`](../writing-for-agents/SKILL.md). This skill adds the skill-specific parts: frontmatter, invocation and packaging.

## 1. Two loops (Cole Medin and Nate Herk pattern)

1. **Outer loop: intent, posture, pointer.**
   - Ask what the skill is: a repeatable capability, a one-off task or a domain coach.
   - Choose the invocation posture (step 2) and the distribution.
   - Design the context pointer: the key use case first, then trigger words and positive trigger branches. Hard cap 1,024 characters, no length target. A trigger test decides.
2. **Inner loop: draft, disclose, verify.**
   - Scaffold the folder, then draft `SKILL.md` around sequential steps and completion criteria.
   - Push background material, large schemas and scripts into `references/` or `scripts/`.
   - Score the draft with [references/rubric.md](references/rubric.md), then run the repo's lint.

## 2. Authoring steps

1. **Triage.** Search the existing skills first. If one covers 80% of the capability, refactor it instead of adding a new one. Decide how the skill runs: automated steps, interactive grilling, or a manual walkthrough.
2. **Invocation posture and frontmatter.** Model-invoked: omit `disable-model-invocation`. Write a description that is front-loaded (an active verb first), positive (target situations, not exclusions) and measured. Do not cut trigger words to save length. User-invoked: set `disable-model-invocation: true` and write a short human-facing summary. A user-invoked skill costs no listing tokens, so use it for destructive operations, rare scripts and manual walkthroughs. Details: [references/skill-mechanics.md](references/skill-mechanics.md), [references/harness-economics.md](references/harness-economics.md), [references/templates.md](references/templates.md).
3. **Scaffold.** Create `<skill-name>/SKILL.md` and, when needed, `references/` and `scripts/`.
4. **Draft `SKILL.md`.** A title and a one or two line mission. Then numbered steps, kept lean. A table or schema over 30 lines goes to `references/<topic>.md`, with a link. End with a **Done when** section of checkable gates ("all unit tests pass and the lint reports 0 errors"), not vague ones ("ensure clean design").
5. **Verify.** Run the repo's lint and link check, then score the skill with the rubric.

## 3. Learn a skill from a source

Use this when the user gives a doc, a URL, notes or a past chat and wants a skill from it.

1. Read the source. Use the session search for past chats.
2. Extract a repeatable procedure: trigger, steps and an observable result. A fact without a procedure belongs in memory, not in a skill.
3. Check the existing skills for overlap. If one covers most of the procedure, propose an edit to it.
4. Draft the skill with section 2.
5. Show the exact draft, the proposed path and the distribution. Ask the user to accept, edit or reject.
6. On acceptance, write the skill, run the checks and commit the accepted change. Report unrelated check failures as such.

## 4. Tune a skill from repeated corrections

Use this when the user asks to improve skills from repeated corrections. It needs a signal collector, so it is an AIOS procedure: [references/learn-and-tune.md](references/learn-and-tune.md).

## Done when

- The user accepted every skill change, and each change is its own commit.
- The skill has a description of 1,024 characters or fewer, a `Done when` section, and links that resolve.
- In an AIOS: `python scripts/Score-Skill.py --skill <name>` prints 90 or more.

Credit: the skill mechanics are adapted from [mattpocock/skills](https://github.com/mattpocock/skills) (MIT). See [LICENSE](LICENSE).
