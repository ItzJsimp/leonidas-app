---
name: ship
description: "Step 7 of Idea to Ship: run a final security and test check, write a GO or NO-GO decision with a rollback plan, then ship after approval. Use when work passed review, or when asked for /ship."
category: idea-to-ship
scope: structural
distribution: core
portable: true
type: skill
id: skill-ship
title: "Ship"
kind: procedure
load: on-demand
owner: shared
verified: 2026-10-16
source: "https://github.com/addyosmani/agent-skills (adapted from .claude/commands, MIT, commit aeac41d)"
---

# /ship: decide, then release

Engines: the ship steps in `.agents/workflow-profile.md` (for example `pr`, `leonidas-release`). Added from Addy Osmani's `/ship` and shipping-and-launch: the fan-out, GO/NO-GO and the rollback plan.

## Steps

1. **Require** a `/test` PASS and a `/review` PASS for this work (XS tasks need the `/test` PASS only). If one is missing, stop.
2. **Fan-out.** Skip this step only when the change is 2 files or fewer, under 50 changed lines, and touches no auth, payments, data access, config or env. Otherwise, start 2 subagents in parallel, in one turn, with these briefs:
   - [references/security-auditor.md](references/security-auditor.md)
   - [references/test-engineer.md](references/test-engineer.md)

   Do not start a code reviewer: `/review` already ran. With no subagent tool, run each brief in turn yourself.

3. **Check directly:** infrastructure (env vars, migrations, feature flags), docs named in the profile, and accessibility if the UI changed.
4. **Write the ship decision:**

   ```markdown
   ## Ship Decision: GO | NO-GO

   ### Blockers

   ### Recommended fixes

   ### Accepted risks

   ### Rollback plan

   - Trigger: <signal>
   - Steps: <exact steps>
   - Time to roll back: <target>
   ```

   GO needs a rollback plan. Any Critical finding means NO-GO, unless the user accepts that risk.

5. **Gate 2.** Show the decision. Wait for a clear yes before any push, merge, publish or release.
6. **Ship.** After the yes, run the profile `Ship` steps in order.
7. **Report** what shipped, with the link, commit or version.

## Done when

- The decision is written, the user gave a clear yes, and every profile ship step ran, with its result shown.
