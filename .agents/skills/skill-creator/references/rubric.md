# The 6-Pillar Skill Evaluation Rubric (100-Point Scale)

Battle-tested evaluation standard for scoring, auditing, and optimizing agent skills across Claude Code and Google Antigravity. Revised 2026-09-10 to account for harness economics, listing budget ceilings, and mechanical verification.

Where the skill standard differs, the standard wins: pillar 3 uses its 1,024 character cap, not 250 and 550. [`scripts/Score-Skill.py`](../../../../scripts/Score-Skill.py) checks the mechanical parts and prints the score.

---

## 1. Rubric Overview

| #                       | Pillar                                             | Max Pts | Core Evaluation Standard                                                                                                               |
| ----------------------- | -------------------------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| 1                       | **Substrate & Domain Grounding**                   | 20      | Integration with AIOS canon (tasks/, decisions/, CONTEXT.md, scripts) vs foreign imports. Every referenced file must exist on disk.    |
| 2                       | **Progressive Disclosure & Information Hierarchy** | 15      | Clean separation of primary steps vs reference material. Complex tables and deep specs pushed to references/ or scripts/. |
| 3                       | **Trigger Precision & Ergonomics**                 | 15      | Front-loaded leading words, positive triggers, description under 250 chars (550 max), appropriate disable-model-invocation.            |
| 4                       | **Completion Criteria & Mechanical Verifiability** | 15      | Explicit "Done when" conditions. At least half the points require a mechanical check (test, script, hook, linter), not just prose.     |
| 5                       | **Distinctness & Boundary Integrity**              | 15      | Single-responsibility boundary, zero alias duplication, non-overlapping capabilities. Clean scope assignment (personal vs structural). |
| 6                       | **Harness Economics & Cache Headroom**             | 20      | Listing-budget efficiency (description tokens against portfolio ceiling), cache-prefix stability, subagent delegability per ADR-0030.  |

---

## 2. Point Breakdown & Scoring Guidelines

### Pillar 1: Substrate & Domain Grounding (20 pts)

- **20 pts:** Flawlessly binds to AIOS stores (tasks/, decisions/, CONTEXT.md, scripts/). Zero hardcoded absolute paths or foreign framework references.
- **10-15 pts:** Mostly grounded, but contains minor loose references or undocumented dependencies.
- **<10 pts:** Contains dead file paths, references non-existent scripts, or imports foreign conventions.

### Pillar 2: Progressive Disclosure & Information Hierarchy (15 pts)

- **15 pts:** Root SKILL.md is a lean execution recipe (<120 lines). Deep reference, schemas, and templates are cleanly disclosed in references/.
- **10 pts:** Mild sprawl (120-200 lines) with some inline reference that could be disclosed.
- **<10 pts:** Monolithic dump (>200 lines) burying execution steps beneath static reference.

### Pillar 3: Trigger Precision & Ergonomics (15 pts)

- **15 pts:** Front-loaded leading words, calibrated length (80-250 chars), positive triggers with clear boundary cues.
- **10 pts:** Description is valid but uses vague verbs or approaches the 550-char ceiling.
- **<10 pts:** Exceeds 550 chars, uses negative prompt bans, or has vague trigger phrases that cause routing collisions.

### Pillar 4: Completion Criteria & Mechanical Verifiability (15 pts)

- **15 pts:** Concrete, testable "Done when" section backed by an automated script, test command, or linter check.
- **8-10 pts:** Checkable criteria present, but relies entirely on honor-system prose without mechanical validation.
- **<8 pts:** Vague or missing completion criteria ("ensure quality", "review code").

### Pillar 5: Distinctness & Boundary Integrity (15 pts)

- **15 pts:** Unique capability boundary. Zero overlap with existing skills. Explicit scope: tag properly assigned.
- **10 pts:** Minor capability overlap with another skill that could be resolved with a pointer.
- **<10 pts:** Redundant alias (e.g. old current-action vs next-action) or untracked cross-tenant duplicate.

### Pillar 6: Harness Economics & Cache Headroom (20 pts)

- **20 pts:** Compact listing footprint (<200 chars). Cache-stable (infrequent edits). Clear model routing delegation (declares Flash/Haiku subagent targets where applicable).
- **10-15 pts:** Moderate token consumption; inline execution when subagents could save tokens.
- **<10 pts:** Uncalibrated description inflating portfolio listing budget; frequent description churn thrashing system cache.

---

## 3. Mandatory Penalties (Hard Deductions)

- **-10 pts:** Any referenced file path absent on disk.
- **-10 pts:** Present in both Leonidas and the peer AIOS repos but missing from scripts/sync/shared-manifest.psd1.
- **-8 pts:** Missing or incorrect scope: tag (scope: structural or scope: personal).
- **-5 pts:** Unquoted YAML frontmatter string values.
- **-2 pts:** Em-dash character (Unicode U+2014) detected.

---

## 4. Triage Classification

- **Grade S (90-100):** Canonical Pillar. Keep as-is. Production gold standard.
- **Grade A (80-89):** Production Grade. High utility, needs minor frontmatter or scope tightening.
- **Grade B (70-79):** Functional. Needs progressive disclosure refactoring or substrate link fixes.
- **Grade C/D/F (<70):** Scrap, Merge, or Complete Rewrite Candidate.
