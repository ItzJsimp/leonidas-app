# Prompt: release history and patch note overhaul

Paste everything below the line into a new Leonidas Code chat in the `leonidas-code` project. Use the strongest model as the lead. It delegates the bulk drafting.

---

You lead the release history overhaul for Leonidas Code. This is XL work across many sessions. Load `wayfinder` first and plan it as a map of decision tickets. Then load `idea-to-ship` for each piece. Read `.agents/skills/leonidas-release/SKILL.md` and its writing guide before you write any note. Create the task card first (`task-driven-work`). Obey every rule in `AGENTS.md`: scoped checks only, no push to `main` until I say so, `performance-gate` before done, no em dash, ASD-STE100 prose.

## Why we do this

I plan a public 1.0 launch. The numbers and the notes do not match that plan. Facts that I measured on 2026-10-21 (re-measure them, do not trust them):

- GitHub holds 175 releases, all published 2026-10-10 to 2026-10-22. The newest is v0.115.0.
- Only 2 of the 175 have an image (v0.45.0, v0.113.0). 25 have no real notes. 61 have one bullet.
- 16 releases are legacy `v1.0.1` to `v1.0.16`, and `laya-model-v1` is not a Leonidas build. They sit above every `0.x` tag in version order.
- Of the last 40 commits on `origin/main`, only 2 carry a `Release-Note:` trailer. Most user-visible `feat:` commits (onboarding, activity bar, PC Tuning, Ponytail) have none. Nothing blocks a release with no notes.
- Root cause of the number: `classifyRelease` in `scripts/leonidas-release.ts` makes every `feat:` commit a MINOR bump. Ten releases a day gives 0.115 in 13 days.
- `project-roadmap.json` says `currentVersion` 0.34.0 and plans milestones 0.35 to 0.50, then 1.0.0. It is stale.
- The in-app update history reads the GitHub releases API (`apps/web/src/components/desktop/releaseHistory.ts`). The marketing site reads it too (`apps/marketing/src/lib/releases.ts`). Editing a release body on GitHub changes both with no new build.

## What I want

1. **A clean version ladder from 0.1 up to 0.9, then 1.0.0.** About 20 to 30 curated updates. They start at the original T3 Code fork and end at today. The size of a number step shows the size of the update: a big update moves MINOR (0.4.0 to 0.5.0), a small one moves PATCH (0.4.1 to 0.4.2). Semver needs three parts, so my "0.113" idea is `0.1.3`. The updater and `parseUpdateManifest` accept only `major.minor.patch`.
2. **A scrollable history that tells the build story.** A user opens update history and sees how Leonidas grew from the T3 Code fork. Old entries need to be accurate and readable. They do not need to be polished.
3. **Every new release is polished.** It reads like a game patch on Steam: a title, a hero image, highlights, feature sections with real screenshots, New, Improvements and Fixes lists, known issues, and credits. Easy to scan for someone who has never seen the code.
4. **A system that forces this.** Agents must not be able to ship a release with no notes, weak notes, or no images for a big update.
5. Any other improvement you judge worth it, if it is small and safe. Say what you added and why.

## Phase A: audit (read only, no change to GitHub or the repo)

Produce `project/release-history-audit.md` (a file, not chat). It must hold:

- Re-measured counts: releases, notes quality, images, gaps, legacy releases, the 1.0.x ordering trap.
- The fork point and the first Leonidas-specific commit. Use `git log`, tags, `project/status-log.md`, `project/roadmap.md` and the task cards.
- The roadmap gates (0.35 to 0.50 in `project-roadmap.json`): which are done, with evidence. Place today's build on the new ladder from that evidence. Do not pick a number that flatters us. If the honest answer is not near 0.9, say so.
- A proposed **chapter map**: 20 to 30 entries, each with the old builds it absorbs, a new version, a title, a date range, and 1 line on why it is MINOR or PATCH. Use feature themes and dates, not equal slices.
- A **size rule** for the future: what makes MINOR and what makes PATCH (for example: MINOR = a new capability that a user can name in one sentence and that earns a story with screenshots; PATCH = fixes, polish, small improvements, backend). Make it a rule an agent can apply without asking me.
- How the old 175 builds appear after the change. Compare: keep as archive (marked pre-release or hidden by the reader), move notes into the repo and delete the releases, or keep untouched. Check what the reader and the updater do with each choice. Never delete a tag or an installer asset without my approval.
- The one-time reinstall: the updater rejects any version lower than the installed one, and production has no `allowDowngrade`. Find how the earlier 1.0.x to 0.x migration worked (`scripts/leonidas-release.ts` near the legacy comment, `team-release.yml`, `docs/`). Find which machines have installs (me and Mob; check for others). Plan the migration with the fixed link `Leonidas-Setup.exe`. Cover the Mac build too.
- What must change in code and docs: `classifyRelease` and `nextReleaseVersion`, `leonidas-release.json`, `team-release.yml`, the `leonidas-release` skill text (it says the first release is 0.2.0 and that features advance MINOR), `project-roadmap.json` (change only version fields; keep every `Roadmap key:` so no task reimports), the marketing site.

**Stop here. Show me the audit and the chapter map. I approve or change them (Gate 1).**

## Phase B: build the system (after Gate 1, local commits only)

Build in the main repo's worktree under `C:/lcw`, one slice per commit, test first.

1. **One shared checker** `scripts/check-release-notes.ts` with tests. It reads the commits in a release range and returns pass or fail with a plain reason. Rules:
   - A range with any user-visible `feat:` or `fix:` commit needs at least 1 `Release-Note:` trailer, written to the guide (verb first, 8 to 18 words, no jargon).
   - A MINOR release needs a `Release-Post:` story file with a title, an intro, at least 1 real screenshot with alt text, and 2 or more feature sections.
   - A range with only internal commits (ci, docs, refactor, test, chore) passes with no bullet, and the release page says so plainly instead of the empty-notes line.
   - Images are WebP or AVIF, at most 2 MB, in `release-posts/`, and show shipped behavior.
2. **The version rule.** Change the classifier so the default is PATCH. MINOR comes only from the size rule (a story trailer such as `Release-Size: big`, or `release_kind` set by hand). `major` before launch maps to the next ladder step. Keep `1.0.0` as explicit `launch`. Handle the `v1.0.x` ordering trap so 1.0.0 is not below an old tag.
3. **Three layers.**
   - A `commit-msg` hook that warns, never blocks, on a `feat:` or `fix:` commit with no trailer. Read the `.git/hooks/pre-commit` gotcha in `LEONIDAS.md` first. Never use `--no-verify`.
   - A CI gate in `team-release.yml` that holds the publish when the checker fails. Add the notes result to `leonidas-release-health.ts`.
   - Update the `leonidas-release` skill and `AGENTS.md` rule 10 so every agent, on every provider, follows one flow. Do not create a second skill.
4. **A story workflow that makes images cheap.** A script or skill step that lists which screens a story needs, opens the dev app on test data with the preview tools, saves a WebP into `release-posts/`, and prints the alt text to review. Never use mock data, personal data or decorative art.
5. **Reader polish.** Check `releaseArticle.ts` and the update dialog against the Steam-style layout above. Add a hero image, "Known issues" and credits only if the parser can carry them without breaking old entries. Verify the reader at wide and narrow widths with `test-t3-app`.

## Phase C: rewrite the history (after Gate 2, outward-facing)

- Delegate the drafting of chapter notes in small batches to cheaper models via `delegate_task`. Give each worker the builds it covers, the commit ranges, the status log lines and the writing guide. Ask for a short structured return. You review every entry against the real commits.
- Every claim comes from a commit, a release body, a task card or the running app. If you cannot verify it, leave it out. No invented improvements.
- Put real screenshots first on the **last 6 chapters** and on any chapter where a still-present feature is cheap to capture from today's app. Older chapters may be text only.
- Keep an archive of every original release body in the repo (`release-posts/archive/`) before you change any release on GitHub. Always pass `-R ItzJsimp/leonidas-code` to `gh`.
- Apply the change to GitHub in a dry run first. Show me the list. Then apply.

## Phase D: switch the numbers (after Gate 3)

- Ship the first build on the new ladder together with the migration, as planned in the audit. A push to `main` ships a release to both machines, so I must say "push".
- Run `scripts/smoke.mjs`. Install on a clean path. Confirm `latest.yml`, the installer and the blockmap match the same commit. Confirm the in-app history shows the new chapters in the right order, with images.
- Update `project/status-log.md`, `project/roadmap.md` and close the card with a verified note.

## Rules for this job

- I approve at three gates: the chapter map (1), the GitHub rewrite (2), the number switch and push (3). Accept only a clear yes.
- Do not weaken `CONSTRAINTS.md` or the writing guide to make a check pass.
- Do not delete releases, tags or installers without a clear yes.
- Report once per phase: what changed, what you ran and saw, what you skipped, and any risk.
