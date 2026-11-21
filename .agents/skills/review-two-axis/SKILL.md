---
name: review-two-axis
description: "Review a diff on two axes with parallel sub-agents: standards and spec match. Use when asked to review code, a branch, a PR or finished work against a spec or task card."
metadata:
  scope: structural
  category: code
  reach: core
  distribution: portable
  sources: ["mattpocock/code-review@abeeaf9", "addyosmani/code-review-and-quality@aeac41d"]
license: MIT
---

# Review Two Axis

Main-flow step 5, after `implement`. Review the diff between `HEAD` and a fixed point the user supplies on two axes:

- **Standards:** does the code conform to this repo's documented coding standards, and is it sound on the five quality axes?
- **Spec:** does the code faithfully implement the originating issue or spec?

Both axes run as **parallel sub-agents** so they do not pollute each other's context. Start every sub-agent with a fresh context window. This skill then aggregates their findings.

## 1. Pin the fixed point

The user's words are the fixed point: a commit SHA, a branch, a tag, `main`, `HEAD~5`. When `implement` or `idea-to-ship` called this skill, it is the commit before the work started. If none is given, ask.

Capture the diff command once: `git diff <fixed-point>...HEAD` (three dots, so the comparison is against the merge-base). Note the commits with `git log <fixed-point>..HEAD --oneline`.

Confirm that the fixed point resolves (`git rev-parse <fixed-point>`) and that the diff is not empty. A bad ref or an empty diff must fail here, not inside two parallel sub-agents.

## 2. Identify the spec source

Look for the originating spec, in this order:

1. Issue references in the commit messages (`#123`, `Closes #45`, GitLab `!67`), fetched as the Tracker section of the [workflow profile](../../workflow-profile.md) says.
2. A path the user passed as an argument.
3. A spec file under `docs/`, `specs/` or `.scratch/` that matches the branch name or the feature. In an AIOS, also a `tasks/` card (the spec card).
4. Nothing found: ask the user where the spec is. If there is none, the Spec sub-agent is skipped and the report says "no spec available".

## 3. Identify the standards sources

Search the repo for every file that documents how code is written. `CODING_STANDARDS.md` and `CONTRIBUTING.md` must be on the list when they exist.

On top of those, the Standards axis always carries the [smell baseline](references/smell-baseline.md), a fixed set of Fowler code smells that applies even when the repo documents nothing. The repo overrides it, and every smell is a judgement call.

## 4. Spawn both sub-agents in parallel

Issue both calls together, in the foreground, and aggregate the reports they return.

**Standards sub-agent prompt:**

- The diff command and the commit list.
- The standards-source files from step 3, plus the smell baseline pasted in full (the sub-agent has no other access to it).
- The brief: "Report, per file or hunk where relevant: (a) every place the diff violates a documented standard, citing the standard (file and rule); (b) any baseline smell you spot, named, with the hunk quoted; (c) problems on five axes: correctness, readability and simplicity, architecture, security, performance. Review the tests first, then the code. Check that the tests test behavior, not implementation, and that they can fail. Label each finding Critical (blocks ship), Required (fix before ship), Optional or Nit, with `file:line`. Separate hard violations from judgement calls: a documented-standard breach can be hard, a baseline smell is always a judgement call, and a documented repo standard overrides the baseline. Skip anything tooling enforces. Under 400 words."

**Spec sub-agent prompt:**

- The diff command and the commit list.
- The path or the fetched contents of the spec.
- The brief: "Report: (a) requirements the spec asked for that are missing or partial; (b) behaviour in the diff that was not asked for (scope creep); (c) requirements that look implemented but look wrong. Quote the spec line for each finding and label it Critical, Required, Optional or Nit. Under 400 words."

If the spec is missing, skip the Spec sub-agent and say so in the final report.

## 5. Aggregate

Present the two reports under `## Standards` and `## Spec`, verbatim or lightly cleaned. Do **not** merge or rerank findings: the axes are deliberately separate.

End with one line: the total findings per axis, and the worst issue within each axis. Pick no single winner across axes.

## 6. Act on the result

- **Critical or Required findings:** go back to `implement` with a fix slice for each.
- **Readability findings:** run [`code-simplification`](../code-simplification/SKILL.md).

## Why two axes

A change can pass one axis and fail the other. Code that follows every standard but implements the wrong thing: Standards pass, Spec fail. Code that does what the issue asked but breaks the project's conventions: Spec pass, Standards fail. Reporting them apart stops one axis from hiding the other.

## Done when

- `git rev-parse <fixed-point>` exits 0, and each axis reported (or the report names the skipped Spec lane).
- No Critical or Required finding remains after the fixes.

Credit: adapted from [mattpocock/skills](https://github.com/mattpocock/skills) (MIT) and [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) (MIT). See [LICENSE](LICENSE).
