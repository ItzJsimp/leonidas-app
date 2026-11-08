---
name: leonidas-release
description: "Write plain-language patch notes, illustrated update stories, and release trailers for user-visible Leonidas changes; choose versions and verify publication when preparing or shipping Code or Scribe updates."
category: code
scope: structural
distribution: private
---

# Leonidas releases

Use this skill when making a user-visible commit, drafting patch notes, editing a release story, or preparing an update. Every project agent follows the same standard, regardless of provider. Read [the writing guide](references/writing-guide.md) before writing copy. For Code stories, start from [the article template](assets/release-story-template.md). This is the shared standard; do not create a competing patch-note skill.

Reserve **1.0.0 for an explicitly approved public launch**. Before launch use 0.MINOR.PATCH: fixes and maintenance advance PATCH; new capabilities and breaking development changes advance MINOR and reset PATCH. After launch, breaking compatibility advances MAJOR. Never skip arbitrary patch numbers to suggest update size.

Use conventional commit subjects: `fix:`, `feat:`, `ci:`, or `feat!:` / `BREAKING CHANGE:`. Existing `Build:` subjects count as features. For a mixed update the largest category wins. Add one `Release-Note: <user-visible change>` trailer per useful bullet, written to the "Writing patch notes" standard below; a commit subject is never a good bullet. Do not include personal paths, credentials, transcripts, or agent scratch notes.

Read the app's current release and publisher before choosing a version. Leonidas uses `leonidas-release.json`, `scripts/leonidas-release.ts`, and `.github/workflows/team-release.yml`; the workflow computes the next version from commits since the previous published development release. A workflow-dispatch `release_kind` can override auto classification. Launch uses `launch` while the stage is development; change the stage to public after that launch is published.

Scribe's AIOS publisher is `scripts/Sync-ScribeDistro.ps1`; it defaults to `-ReleaseKind auto` and generates notes from Scribe commits since the previous source commit. Override with patch/minor/major only when the classification needs correction. Use `-ReleaseKind launch` explicitly for public launch. `scripts/LeonidasReleasePolicy.ps1` owns its version calculation. Scribe already stores past notes in release-history.json.

Publishing needs the user's authorization. Run scoped checks and build first. The release workflow runs `scripts/smoke.mjs`, which boots the server on a fresh home and fails on a hang; after a layer change in `server.ts`, run it locally before a push (`node scripts/smoke.mjs --runtime <Leonidas.exe> --entry <server.asar>/apps/server/dist/bin.mjs` works without an install). For Code, confirm a complete installer, blockmap, and latest.yml are published for the same source commit. Do not restart a user's live app as verification.

Code's first development release is 0.2.0. Existing legacy 1.0.x installations need a one-time installer migration because automatic updaters reject lower versions. Preserve app identity and user data. Subsequent 0.x releases update normally.

## Writing patch notes

Standard for Leonidas, Scribe and anything Jake builds. Adapted from Keep a Changelog (changelogs are for people, never a commit-log dump; group by Added / Changed / Fixed / Removed), the community `changelog-generator` and `writing-changelogs` skills (translate commits into user impact; breaking changes lead; never claim verified what was not), and the Linear and Raycast changelogs (verb-led one-line bullets that name the symptom, not the cause).

**Audience:** someone who has never seen the code and does not know what a provider, adapter or commit is. They read a popup for ten seconds and want to know what they can now do or no longer suffer.

**Bullet rules**

- Start with a verb in past tense: `Added`, `Improved`, `Fixed` (also `Changed`, `Removed`). Active voice. User-visible outcome first, cause never.
- 8 to 18 words. One idea per bullet; two outcomes become two bullets or one is dropped.
- Say what the user sees in the app (the reply label, the update popup, the usage panel), not what you edited. No file names, function names, package names, commit jargon, PR numbers or internal terms (`provider-core`, `RPC`, `contract`, `projection`, `CI`).
- Max 5 highlight bullets per release. Merge related ones or drop the weakest; never pad. A release with only internal changes gets `Internal improvements only. Nothing new to see in this update.`; do not invent a reliability improvement. The merge queue blocks a user-visible change that has no note, so this line never hides a missed note. Detail-only releases point readers to the additional changes.
- Internal-only work (CI, refactors, tests, docs, dependency bumps) gets no bullet.
- Never claim what you did not run and see work. Unverified means no bullet.
- A change that needs the user to act (restart, re-sign-in, reinstall) says so in the bullet.
- Keep bullets informational. Do not append calls to action such as "walk me through it" or "update now"; installation controls belong in the popup footer.
- Optional `## Details` for power users: extra specifics (limits, settings paths, edge cases), same verb-led style, no cap but stay terse.

**Rewrites from real Code commits**

| Commit subject (bad bullet)                                                 | Patch note (good)                                                                        |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `fix(provider-core): suppress invented prediction reports and placeholders` | Fixed prompt suggestions sometimes showing invented text or empty placeholders.          |
| `feat(chat): show which model, effort and account ran each turn`            | Added a label on every reply showing which model, effort level and account produced it.  |
| `fix(tokens): rolling averages need a full window and use turn totals only` | Fixed speed averages showing misleading numbers before enough replies had been measured. |
| `fix(activity): keep long filenames inside the composer panel`              | Fixed long file names spilling outside the activity panel.                               |
| `fix(updates): use theme colors for the update notice`                      | Improved the update notice so it follows your chosen theme colors.                       |
| `feat(desktop): track update delivery and safely migrate legacy installs`   | Added a safe one-time switch for older installs so future updates arrive normally.       |
| `fix(ci): cache only the filtered desktop dependency store`                 | (no bullet: internal)                                                                    |

Rewrites are illustrations: check each against the diff or the running app before writing the real bullet.

**Trailer to bullet mapping** (`scripts/leonidas-release.ts` in the Code repo)

- **Read-only notes:** update history and the update popup show plain text, with five highlights and expandable additional changes. Do not add walkthrough, tour, install, or restart actions to individual bullets. Existing tour markers are hidden for older releases; new trailers should omit them.
- Each `Release-Note:` trailer becomes exactly one bullet, verbatim, so write it in final form (starts with the verb). Put it on the commit that makes the outcome true; several trailers per commit are fine, and any commit type may carry one.
- Order: curated trailers only (features, then fixes, then the rest). The first 5 distinct bullets are highlights; overflow and every `Release-Detail:` trailer go under `## Details`. Raw commit subjects never become notes. Write a trailer on every user-visible `feat:` and `fix:` commit; commits without trailers contribute only release metadata.
- **Enforced:** `scripts/Invoke-MergeQueue.ps1` runs `scripts/check-release-notes.ts` on the branch range and refuses to land a user-visible `feat:` or `fix:` without a passing `Release-Note:` (8 to 18 words, verb first, no jargon). Use `Release-Note: none` for internal work. A `Release-Size: big` release also needs a `Release-Post:` story with screenshots. The generated notes never carry the Windows unsigned-installer warning; it lives on the download page and in the README only.
- Output shape without a story: `# <version> · Development`, five highlight bullets, optional `## Details`, then the final `leonidas-release` metadata comment. With a `Release-Post:` story: the authored title, introduction, images and feature sections, followed by generated `## Patch notes` grouped under `### New`, `### Fixes`, and `### Improvements`, optional `## Details`, then the same metadata. Empty groups are omitted. Do not manually add those generated sections to the story or duplicate the trailers. The dialog parses this format; preserve it. Authors come from git author names; coAuthors come from `Co-Authored-By:` trailers, so keep that trailer on agent commits.
- Scribe's generator (`scripts/Sync-ScribeDistro.ps1`) should follow these wording rules; its output shape is still its own until aligned.

**Checklist before writing a `Release-Note:` trailer** (run silently, fix before committing)

1. Can a user see or feel this change? If not, no trailer.
2. Did I run it and see it work? If not, no trailer.
3. Does it start with Added / Improved / Fixed / Changed / Removed, in 8 to 18 words, one idea?
4. Does it open with what the user can now do or no longer suffers, not how it was built?
5. Does it contain zero file names, identifiers, package names, PR numbers or internal terms? Replace each with the thing on screen.
6. Would a friend who has never seen the app understand it without asking a question?
7. Are there already 5 highlights this release? Merge, drop the weakest, or use `Release-Detail:`.
8. Does the user need to act (restart, sign in again)? Say so.

## Illustrated release stories

For a user-visible update, write a named story in `release-posts/<slug>.md` and add `Release-Post: release-posts/<slug>.md` to its commit. The latest post trailer in the release range wins. The publisher reads that file, appends the curated patch-note trailers, and preserves the build metadata. Do not change the workflow to publish a story separately from its installer.

Start with one `# Title`, a short introduction about what changed for the user, then real screenshots and `##` feature sections. Use plain language and explain what the user can do, where to start, and any limits. Put small fixes in the generated patch notes instead of giving each its own feature story. Avoid invented claims, mock data, personal information, and decorative images standing in for a real product change.

Save sanitized screenshots beside the post, preferably WebP or AVIF, at most 2 MB each. Use relative Markdown image links with descriptive alt text. The publisher pins these to the exact source commit; later updates cannot replace an older story image. Public HTTPS image URLs also work. Images must show the verified shipped behavior. Do not commit screenshots used only for PR evidence.

Before committing, verify the post in the dev reader, including images, captions, narrow layout, and full notes. Preserve the existing updater confirmation and waiting-for-agents behavior. Commit locally; push only when the user asks.
