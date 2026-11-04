---
name: review
description: "Step 6 of Idea to Ship: review the diff against the spec and on five quality axes, with severity labels. Use after verify passes, before ship, or when asked for /review."
category: idea-to-ship
scope: structural
distribution: core
portable: true
type: skill
id: skill-review
title: "review"
kind: procedure
load: on-demand
owner: shared
verified: 2026-10-16
source: "https://github.com/addyosmani/agent-skills (adapted from .claude/commands, MIT, commit aeac41d)"
license: MIT
---

# /review: spec match and code health

Engine: `review-two-axis` (a standards lane and a spec lane, in parallel). Added from Addy Osmani's code-review-and-quality: five axes and severity labels.

## Steps

1. **Pin the fixed point:** the commit before this work started.
2. **Load `review-two-axis`** and give it the spec card as the spec source.
3. **The standards lane covers 5 axes:** correctness, readability and simplicity, architecture, security, performance. Review the tests first, then the code.
4. **Label each finding:** Critical (blocks ship), Required (fix before ship), Optional, Nit. Give a `file:line` for each.
5. **Check the checks.** Make sure that the tests from `/build` test the behavior, not the implementation, and that they can fail.
6. **Act on the result.** Critical or Required findings: go back to `/build`. Readability findings: you can run `/code-simplify`.

## Done when

- No Critical or Required finding remains, and each lane reported a result.

Credit: adapted from [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) (MIT). See [LICENSE](LICENSE).
