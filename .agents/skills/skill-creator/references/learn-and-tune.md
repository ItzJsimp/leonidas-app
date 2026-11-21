# Learn and tune (AIOS)

Use this file in an AIOS. It holds the `Tune existing skills` procedure from the old `skill-learn` skill, and the AIOS commands for its `Skill Learn from a source` procedure (section 3 of `SKILL.md`).

Hermes reserves `/learn`. The old command was `/skill-learn <source>` or `/skill-learn tune`. Both are now this skill. Draft first. Write canonical skills only after the user accepts each proposal.

## Learn from a source: AIOS commands

- Draft with the quoted name and description, a category from `.agents/skills/_categories.json`, scope, distribution, a numbered workflow and checkable completion criteria.
- Check `.agents/skills/skills-index.md` for overlap.
- On acceptance, run `scripts/Sync-AgentSkills.ps1`, `scripts/Audit-Substrate.ps1` and `scripts/Build-Index.ps1`, then commit the accepted change. Keep unrelated check failures explicit.

## Tune existing skills

1. Run `python scripts/Collect-SkillSignals.py --ready`. The collector scans the supported Claude transcripts for this AIOS. Three distinct sessions qualify a skill for evidence review. Signals are leads, not proof of a skill defect. If none qualify, report the watch list and stop.
2. Ask which skills to review and which model to use for this batch. Use this chat or an authorized connected model. Choose no preset nightly or session-end model.
3. Read `python scripts/Collect-SkillSignals.py --show <skill>` and the skill itself. Check the original sessions. Discard corrections about the project, answers to interview questions and unsupported attribution. Find a repeated instruction-level failure.
4. Draft the smallest change: the exact current lines, the replacement lines and the evidence from several sessions. Save `logs/skill-proposals/<date>-<skill>.md` with status `proposed`, the drafting model, the selected signal IDs and the source sessions.
5. Ask accept or reject for each proposal. On acceptance, apply only the reviewed diff, verify it and commit it. If verification or application fails, leave the proposal and the signals pending.
6. After a successful acceptance or rejection, run `python scripts/Collect-SkillSignals.py --consume <skill> --ids <reviewed-id,reviewed-id>` and update the proposal status. Consume only the evidence that this batch reviewed.

The Claude SessionEnd hook collects signals without model calls. Other providers can run the collector by hand against supported stored transcripts. Codex and app-owned transcript adapters are not implemented yet.

## Done when

- Every canonical skill change was accepted by the user and committed separately.
- Each proposal records the exact diff, the model and the evidence IDs.
- Only the reviewed evidence is consumed after a successful decision.
- Verification results separate this change from unrelated repository failures.
