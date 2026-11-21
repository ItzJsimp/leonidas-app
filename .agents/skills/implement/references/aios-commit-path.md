# AIOS commit path

Use this file when the repo has `scripts/Complete-Slice.ps1`. It holds the AIOS steps from the old `implement` skill.

1. **Before the first slice of a new build** (not a one-line fix): run the 6 phases before this skill, per `standards/execution-standard.md`: Ideate and Scope, Deep Research, Core Principles, Power User Posture, Best Practices, Gap Analysis (with 3 Work Tiers). This skill is that standard's 7th phase, Test-First Execution.
2. **Commit a slice** (step 2.7) with `pwsh -File scripts/Complete-Slice.ps1 -Paths <files...> -Message "<type>(<scope>): <summary>"`. It checks for zero em dashes, checks drift, logs slice telemetry to `logs/slice-telemetry.jsonl`, and makes one atomic git commit (ADR-0010).
3. **Reconcile:** tick the slice item `[x]` in the active card under `tasks/`.
4. **After the last slice:** add any quirk you found to `logs/lessons-learned.md`.
5. **Canon rules:** no em dash (U+2014) in code, comments, strings or docs. Write each path in prose as a repo-relative clickable link.

Extra Done when checks:

- `pwsh -NoProfile -File scripts/Detect-Drift.ps1` prints zero `[FAIL]` lines.
- `pwsh -NoProfile -File scripts/Find-EmDashes.ps1` reports zero em dashes in the touched files.
- Every slice is one distinct git commit, logged in `logs/slice-telemetry.jsonl`, and the card shows `[x]`.
- Each code slice carries a `Performance Gate: PASS` verdict (or a PASS-WITH-RISK that the owner accepted).
