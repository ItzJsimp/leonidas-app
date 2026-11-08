# Catch-up stage points (research, 2026-11-08)

Base `8d199b4f7b` (2026-10-11). Tip `upstream/main` `3da48c1234` (2026-11-08), 4,414 commits ahead of the base. Read-only `git` commands only. Tags are from `pingdotgg/t3code`.

"Files" = files changed between the previous point and this one (`.repos/` excluded). "Overlap" = those files that Leonidas also changed since the base (`origin/main`, 4,459 files).

| Stage point | Tag or sha | Kind | Date | Commits | Files | Overlap |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | v0.1.0 `81493efb71` | stable | 2026-10-15 | 305 | 1,440 | 588 |
| 2 | v0.1.1 `fe27e8e3dc` | stable | 2026-10-20 | 1,486 | 4,402 | 1,388 |
| 3 | v0.1.2 `044f07257c` | stable | 2026-10-22 | 260 | 2,575 | 772 |
| 4 | v0.1.3 `d2c440312e` | stable | 2026-10-26 | 518 | 3,573 | 1,216 |
| 5 | v0.1.4 `783581d461` | stable | 2026-10-28 | 261 | 2,012 | 726 |
| 6 | v0.1.5 `6d450a4284` | stable | 2026-10-29 | 25 | 178 | 106 |
| 7 | v0.1.6 `2359643cff` | stable | 2026-10-31 | 521 | 1,367 | 557 |
| 8 | v0.1.7 `322f6544df` | stable | 2026-11-03 | 659 | 1,724 | 655 |
| 9 | tip `3da48c1234` | nightly (v0.1.8-nightly.20261108.4380 +5) | 2026-11-08 | 379 | 1,834 | 595 |

## Findings

- **Stage count:** 9 stable-tag stages. A week-only rule gives 4 stages of about 1,100 commits each. That is too big for one conflict pass. Size is a better rule than calendar.
- **Too large:** stage 2 (v0.1.1, 1,486 commits, 4,402 files). Split at two nightly tags: `v0.1.1-nightly.20261018.3302` (494 commits after v0.1.0) and `v0.1.1-nightly.20261019.3373` (893 after v0.1.0). Parts: 494, 399, 593 commits.
- **Borderline:** stage 8 (659 commits). Split in two if its first pass shows more than 150 conflicted files. Stage 6 (25 commits) can join stage 7.
- **Rule proposed:** a stage ends at the last stable tag or nightly tag that keeps the stage under 600 commits. This gives 11 stages.
- **Stable and nightly:** 8 stable tags (v0.1.0 to v0.1.7) and the tip is nightly. About 750 nightly tags exist in total. The tip is not a release.
- **Withdrawn tags:** not provable from `git`. A deleted tag leaves no trace in the repo. `gh release list -R pingdotgg/t3code` shows 200 releases and 0 drafts. Result: unknown. Check `gh release list` again at each stage.
- **Anomaly:** the diff v0.1.6 to v0.1.7 shows 29,524 files before the `.repos/` filter (vendored `alchemy-effect`, `effect`, `effect-smol` mirrors). Those are not product code. Exclude `.repos/` from every stage.
