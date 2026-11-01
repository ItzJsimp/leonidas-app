# Release history audit (Phase A)

Date: 2026-10-21 (America/Phoenix). Read only: no change was made on GitHub. Map card: `tasks/overhaul-the-leonidas-code-release-history-and-version-ladder.md` in the AIOS.

## 1. Verdict

- Today's build belongs at **0.5.8** on the new ladder, not near 0.9. The app has many features for its 2 builders, but 0 of the 74 launch-path tasks (roadmap milestones 0.35 to 0.50) are marked done.
- The history fits in **29 chapters**: 5 MINOR steps (0.1 to 0.5) and 24 PATCH steps.
- The new numbers are **lower** than the installed 0.115.0. Every install needs a one-time move. A small "bridge" build can do that move automatically on Windows. Mac needs a manual reinstall in every case.
- 12 old tags (`v0.2.0` to `v0.9.0`) use names the new ladder needs. Phase C cannot run without Jake's yes to move them.

## 2. Re-measured counts (GitHub API, 2026-10-21)

| Measure                                          | Brief said | Measured | Note                                                                                                                       |
| ------------------------------------------------ | ---------- | -------- | -------------------------------------------------------------------------------------------------------------------------- |
| Releases                                         | 175        | 175      | 0 drafts. 1 pre-release (`laya-model-v1`).                                                                                 |
| Publish window (UTC)                             | 10-10 to 10-22 | 2026-10-10 06:29 to 2026-10-22 01:10 | Peak: 33 releases on 2026-10-14.                                                                     |
| Newest                                           | v0.115.0   | v0.115.0 | Flagged latest.                                                                                                            |
| `0.x` releases                                   | n/a        | 158      | v0.2.0 to v0.115.0, no gaps in MINOR. 44 are PATCH releases.                                                               |
| Legacy `v1.0.x`                                  | 16         | 16       | v1.0.1 to v1.0.16, all on 2026-10-10.                                                                                      |
| Not a Leonidas build                             | 1          | 1        | `laya-model-v1` (pre-release, no installer).                                                                               |
| With an image                                    | 2          | 2        | v0.45.0, v0.113.0.                                                                                                         |
| With a story title                               | n/a        | 3        | v0.45.0, v0.90.0 (no image), v0.113.0.                                                                                     |
| No real notes                                    | 25         | 25       | 13 `0.x` (for example v0.56.0, v0.89.0, v0.114.0), 11 legacy (v1.0.1 to v1.0.11), `laya-model-v1`.                         |
| One highlight bullet                             | 61         | 49       | 61 counts all bullets, including Details. Highlights only: 49.                                                             |
| Two or more highlights                           | n/a        | 101      |                                                                                                                            |
| Bullets that follow the guide (verb first)       | n/a        | 139 of 442 (31%) | 14 releases use commit subjects or jargon ("RPC", "contract", "typecheck"). 4 use the banned filler "Behind-the-scenes reliability improvements". |
| Last 40 `origin/main` commits with `Release-Note:` | 2        | 13 of 40 | Correction. But 27 have none, and most are user-visible `feat:` or `fix:` (Gmail, mail autopilot, onboarding screens). Trailers often sit on one summary commit at the end of a feature. |
| Installer downloads per release (x64 `.exe`)     | n/a        | 3 to 6   | About 3 to 6 Windows installs update each time.                                                                            |
| `latest-mac.yml` downloads                        | n/a        | up to 91 per release | At least 1 Mac install polls for updates.                                                                       |

**The ordering trap.** Semver puts `v1.0.1` to `v1.0.16` above every `0.x` tag. The CI and the release script hide it with a `v0.` filter (`scripts/leonidas-release.ts`, `team-release.yml` line 297). Any tool that sorts tags (GitHub's tag list, `git tag --sort`, a future script) still shows 1.0.16 as the newest. No `v1.0.0` tag exists, so the launch tag is free.

**A second trap the brief did not name.** Upstream T3 Code itself has tags `v0.1.0` and `v0.1.1` (and nightlies `v0.1.2-nightly.*`). `git fetch upstream` copies them into local clones. The fetch on 2026-10-21 already failed with `refs/tags/v0.68.2 ... reference already exists`. Our ladder `v0.1.0` and `v0.1.1` will clash with upstream's tags in every local clone.

## 3. Fork point and first Leonidas commit

- **Fork parent:** `5fe9d024d9` (upstream T3 Code, 2026-10-09 16:58 -0700, "fix(mobile): prevent row presses during native back swipes"). It sits after upstream `v0.0.45`, at nightly `v0.0.46-nightly.20261009.2886`.
- **First Leonidas commit:** `0305263d3f` (Mob, 2026-10-09, "Add header usage-limits popover button").
- **First Jake commit and the release pipeline:** `576af045d6` (2026-10-09, "ci: team release workflow"). Release `v1.0.1` says "Built from 576af04".
- **Rebrand:** `ded8ae8d08` (2026-10-10, "rebrand desktop app to Leonidas Code").
- **Upstream merges since the fork:** `b74fe5a322` (2026-10-11) and `1b4de047c0` (2026-10-18). Today `origin/main` holds 1,100 commits that upstream does not have. Upstream holds 2,026 commits that we do not have.
- **Commit types in our 1,100 commits:** 407 `feat`, 300 `fix`, 79 `docs`, 44 `refactor`, 44 `chore`, 26 `test`, 20 `perf`, 15 `Build`, 11 `ci`, the rest other.
- **Root cause of the high numbers (confirmed):** `classifyRelease` returns `minor` for any `feat:` or `Build:` commit. Every push to `main` publishes. 158 `0.x` releases in 11 days gave 0.115.

## 4. Roadmap gates and the honest place for today's build

`project-roadmap.json` says `currentVersion` 0.34.0. That is stale: the app shipped 0.34.0 on 2026-10-13. Status of each gate from the AIOS task cards (matched by `Roadmap key:`):

| Milestone | Title                                      | Cards done | Evidence that work exists anyway                                                   |
| --------- | ------------------------------------------ | ---------- | ---------------------------------------------------------------------------------- |
| 0.35      | Feasibility check                          | 0 of 5     | none                                                                               |
| 0.36      | Guided mode by default                     | 0 of 6     | none                                                                               |
| 0.37      | One install                                | 0 of 5     | Composer dictation shipped (v0.88.0); card "Awaiting Review". Scribe is not bundled. |
| 0.38      | Clipboard history and more AI accounts     | 0 of 5     | Antigravity limits shipped (v0.22.0, v0.75.0). No clipboard history.                |
| 0.39      | Connect an account without getting stuck   | 0 of 5     | One-click Claude (v0.61.0), 3-step connect (v0.71.0), plain errors (v0.69.0). Cards Dormant. |
| 0.40      | Assistant and a fresh AIOS                 | 0 of 5     | 3-screen setup (v0.109.0). Interview cards Retired.                                 |
| 0.41      | Suggest a small build                      | 0 of 5     | none                                                                               |
| 0.42      | A guided first build that runs             | 0 of 5     | none                                                                               |
| 0.43      | Your work stays yours                      | 0 of 4     | none                                                                               |
| 0.44      | Five-user beginner test                    | 0 of 4     | not run                                                                            |
| 0.45      | Updates you can trust                      | 0 of 4     | "Update when safe" exists since 1.0.x. No stable channel.                          |
| 0.46      | Pilot ready                                | 0 of 5     | I'm stuck button (v0.103.0)                                                        |
| 0.47      | 20-user pilot                              | 0 of 4     | not run                                                                            |
| 0.48      | Accounts and founding seats                | 0 of 5     | none                                                                               |
| 0.49      | Checkout, trial, signed installers         | 0 of 4     | none. Installers are unsigned.                                                     |
| 0.50      | Release candidate                          | 0 of 5     | none                                                                               |

Some cards lag the code (0.37, 0.39, 0.40 have real shipped work). Even with generous credit, at most 3 of 16 milestones are partly met, and no user test, pilot, signing or billing exists. The 1.0 definition needs all of them.

**Placement.** On a 0.1 to 0.9 ladder, 1.0 is launch and 0.9 is the release candidate. The remaining launch path is about 4 large steps, so today sits at the end of step 5:

- 0.6: one install, and connect any account without getting stuck (milestones 0.35, 0.37, 0.38, 0.39)
- 0.7: your assistant, a guided first build, your work stays yours (0.36, 0.40 to 0.43)
- 0.8: tested by beginners, trusted updates, pilot (0.44 to 0.47)
- 0.9: accounts, checkout, signed installers, release candidate (0.48 to 0.50)
- 1.0.0: public launch

The honest number for today is **0.5.8**. It is not near 0.9. A higher number would claim launch work that has not started.

## 5. Chapter map (29 entries)

History rule: a MINOR opens a new era (a new kind of use for the app). A PATCH is a chapter inside the era. Dates are UTC publish dates of the absorbed builds.

| New    | Kind  | Title                                          | Absorbs            | Dates        | Why this size                                                                 |
| ------ | ----- | ---------------------------------------------- | ------------------ | ------------ | ----------------------------------------------------------------------------- |
| 0.1.0  | MINOR | Leonidas Code begins                           | v1.0.1 to v1.0.16  | 10-09 to 10-10 | First release: fork, rebrand, push-to-update, usage popover, prompt prediction. |
| 0.1.1  | PATCH | See your tokens and patch notes in the app     | v0.2.0 to v0.2.1   | 10-11        | Token counter and update history extend era 1.                                |
| 0.1.2  | PATCH | Safer updates and a compact limits popup       | v0.3.0 to v0.3.2   | 10-11        | Update safety and polish.                                                      |
| 0.1.3  | PATCH | A first Command Center and shared tasks        | v0.4.0 to v0.9.0   | 10-11        | Read-only views of existing data; no new kind of use yet.                      |
| 0.2.0  | MINOR | Let the app pick the model and the account     | v0.10.0 to v0.16.0 | 10-11 to 10-12 | New era: Autorouter, account-aware helpers, handoffs between providers.     |
| 0.2.1  | PATCH | Questions as cards, and a welcome screen       | v0.17.0 to v0.18.0 | 10-12        | Two focused additions.                                                         |
| 0.2.2  | PATCH | Rank models and pick usage ranges              | v0.19.0 to v0.21.1 | 10-12        | Extends routing with rankings.                                                 |
| 0.2.3  | PATCH | Antigravity accounts and clearer chat lists    | v0.22.0 to v0.24.4 | 10-12        | One more provider plus polish.                                                 |
| 0.2.4  | PATCH | Cheaper helpers and fresh limits               | v0.25.0 to v0.27.0 | 10-12        | Refines routing cost.                                                          |
| 0.3.0  | MINOR | Save prompts and rewind any message            | v0.28.0 to v0.32.0 | 10-13        | New era: daily-driver tools (saved items, multi-skill, benchmarks, rewind).   |
| 0.3.1  | PATCH | One usage card                                 | v0.33.0 to v0.34.0 | 10-13        | Merges 3 panels.                                                               |
| 0.3.2  | PATCH | A stability pass                               | v0.35.0 to v0.35.11 | 10-13 to 10-14 | Fixes only.                                                                 |
| 0.3.3  | PATCH | Tasks on your phone and batch agents           | v0.36.0 to v0.42.1 | 10-14        | Task workflow additions inside era 3.                                          |
| 0.3.4  | PATCH | See what costs tokens, and watch your PC       | v0.43.0 to v0.50.0 | 10-14        | Keeps the v0.45.0 story and its image.                                         |
| 0.3.5  | PATCH | Your AIOS Home and skill folders               | v0.51.0 to v0.58.0 | 10-14        | Extends the Command Center.                                                    |
| 0.3.6  | PATCH | A token popover that adds up                   | v0.59.0 to v0.60.0 | 10-15        | Fixes and accuracy.                                                            |
| 0.4.0  | MINOR | Connect Claude with one click                  | v0.61.0 to v0.68.2 | 10-15        | New era: first run for people who never used a terminal.                       |
| 0.4.1  | PATCH | A one-click installer and simple sign-in       | v0.69.0 to v0.72.0 | 10-15        | Extends first run.                                                             |
| 0.4.2  | PATCH | PC Tuning                                      | v0.73.0 to v0.75.0 | 10-15 to 10-16 | Renames and grows System Care.                                               |
| 0.4.3  | PATCH | Opt-in usage numbers and API keys              | v0.76.0 to v0.79.0 | 10-16        | Settings and consent.                                                          |
| 0.5.0  | MINOR | Helpers, pictures and screen snips             | v0.80.0 to v0.87.0 | 10-17        | New era: the app does more than chat (subagents, local Images, Snip).          |
| 0.5.1  | PATCH | Talk to your AI, and run models on your PC     | v0.88.0 to v0.91.0 | 10-17        | Voice and local models; keeps the v0.90.0 story.                               |
| 0.5.2  | PATCH | Safety checks and richer replies               | v0.92.0 to v0.95.1 | 10-17 to 10-19 | Laya, answer blocks, memory use.                                             |
| 0.5.3  | PATCH | Faster offline dictation and Ponytail          | v0.96.0 to v0.97.0 | 10-19        | Speed and a rule set.                                                          |
| 0.5.4  | PATCH | Leonidas on the Mac                            | v0.98.0 to v0.102.0 | 10-19       | Unsigned Mac download; more microphones.                                       |
| 0.5.5  | PATCH | An I'm stuck button and stronger privacy       | v0.103.0 to v0.104.3 | 10-20 to 10-21 | Help and privacy.                                                          |
| 0.5.6  | PATCH | The Git tab                                    | v0.105.0 to v0.108.0 | 10-21      | One new tab plus fixes.                                                        |
| 0.5.7  | PATCH | Set up in 3 screens                            | v0.109.0 to v0.111.0 | 10-21      | Onboarding rework; PC Tuning tabs.                                             |
| 0.5.8  | PATCH | Choose how the AI answers                      | v0.112.0 to v0.115.0 | 10-21 to 10-22 | Reply styles; keeps the v0.113.0 story and image.                          |

Screenshots first (Phase C): 0.5.3 to 0.5.8. Cheap extra captures where the feature still exists today: 0.3.0 (rewind), 0.4.2 (PC Tuning), 0.5.0 (Images), 0.5.1 (Models tab).

The first new build after the switch is **0.5.9** (PATCH). Note: the Mac chapter (0.5.4) is a real platform change, but it is unsigned and does not auto-update, so it stays PATCH.

## 6. Size rule for the future

The current pace is about 10 releases and 30 `feat:` commits a day. A rule of "any nameable feature is MINOR" would use up 0.6 to 0.9 in a few days. So MINOR must follow the ladder, not single features.

**Rule (an agent applies it without asking):**

1. **MINOR** only when the release completes the next ladder step in `project-roadmap.json`: every milestone that the step groups has all its Done-when boxes ticked. The release must carry a `Release-Post:` story that passes the checker. Mark it with `Release-Size: big`.
2. **PATCH** for everything else: new features, fixes, polish, backend. A big feature still gets a story (`Release-Post:`), but the number moves PATCH.
3. **launch** (1.0.0) only by hand with `release_kind: launch` after Jake's written yes.
4. `release_kind: minor` by hand stays possible. The checker still requires the story.

Effect: PATCH numbers grow high inside a step (for example 0.5.40). That is honest: many small updates, one big step. The card `add-a-stable-release-channel-and-pr-checks-before-the-10-launch` would cut that count, but it is a separate decision.

Jake's alternative from the brief (MINOR = a nameable capability with a story) is in Gate 1, decision B.

## 7. What happens to the 175 old builds

What the readers do today:

- **In-app history** (`apps/web/src/components/desktop/releaseHistory.ts`): reads the list API 10 rows per page, in GitHub's order (newest created first). It drops drafts, pre-releases and any tag that is not `v<major>.<minor>.<patch>`. It shows `published_at` as the date.
- **Updater** (electron-updater 6.8.9, stable channel): reads `releases/latest` only. `allowDowngrade` is false on stable, so it ignores any lower version.
- **Release script and CI**: take the first non-draft, non-pre-release `v0.` release in API order as "previous". That is the newest **created**, not the highest version.
- **Marketing site** (`apps/marketing/src/lib/releases.ts`): reads `releases/latest` for downloads, and the list only for nightly. It does not read history. Correction to the brief: it needs no change.

| Option | What it does | Reader | Updater | Release script | Risk |
| --- | --- | --- | --- | --- | --- |
| **A. Archive by new tag name (recommended)** | Each old release moves to tag `archive/<old tag>` (for example `archive/v0.45.0`), same commit, same body, same installers. The 12 old tags `v0.2.0` to `v0.9.0` are then deleted so the ladder can use those names. | Hides them (tag is not semver). Shows only chapters. | No effect (latest stays the current build). | Ignores them. | Needs Jake's yes for 12 tag deletions. Old direct links to `/releases/tag/v0.45.0` break; `/releases/tag/archive/v0.45.0` works. |
| B. Notes into the repo, delete releases | Bodies go to `release-posts/archive/`, releases deleted. | Clean. | No effect. | Clean. | Deletes 175 installers. Not reversible. Not recommended. |
| C. Keep untouched | Old releases stay. | Shows 158 old entries mixed with chapters. | No effect. | Picks a wrong "previous". | The ladder cannot use `v0.2.0` to `v0.9.0`. Does not work. |
| A-light. Mark pre-release only | Old releases become pre-releases, tags kept. | Hides them. | Stable: no effect. Nightly channel reads pre-releases and could see them. | Ignores them. | Name clash on `v0.2.0` to `v0.9.0` remains. Does not work alone. |

Legacy `v1.0.1` to `v1.0.16` and `laya-model-v1` get option A too (archive tags). That removes the 1.0.x trap from the release list. Their git tags can stay or go (Jake's choice; nothing reads them after the move).

Chapter releases: one release per chapter, tag on the last commit of the builds it absorbs, no installer, created oldest first with `--latest=false`. The date range goes in the metadata comment, because `published_at` would show the day of the rewrite (reader change in Phase B).

## 8. The one-time move from 0.115.0 to 0.5.9

**How the last move worked (1.0.x to 0.2.0).** No code in the updater. A manual script, `scripts/leonidas-update.ps1 -WaitForExit`, ran once per machine (`docs/operations/leonidas-release-health.md`). It downloads the `latest` installer, checks SHA-256 and the `latest.yml` SHA-512, waits for the app to close, runs the installer with `/S /currentuser --updated /KEEP_APP_DATA`, and checks the installed version. Data stayed. It never stops a running app.

**Installs found.** About 3 to 6 Windows installs download each installer (Jake's machines and Mob's). At least 1 Mac install polls `latest-mac.yml`: the MacBook Air M3 of a friend (card `ship-the-unsigned-macos-build-of-leonidas-code-for-a-mac-user`). I cannot name the other Windows installs from the data. Jake and Mob must confirm the list.

**Options:**

1. **Bridge build (recommended).** Ship `v0.115.1` on the old numbers. Its only change: on the stable channel, when the installed version is 0.10.0 or higher and the offered version is a ladder version below 0.10.0, allow that one downgrade. Wait until every known install reports 0.115.1 (update receipts, or `.exe` download count). Then publish 0.5.9 as latest. Every Windows install moves with the normal "Update when safe" flow. After the move, the rule never fires again (0.5.9 is below 0.10.0). Cost: one small tested change in `DesktopUpdates.ts` plus one extra release.
2. **Manual reinstall.** Publish 0.5.9 as latest. Each Windows machine runs `Leonidas-Setup.exe` (or `scripts/leonidas-update.ps1 -WaitForExit`) once. Proven path. Any machine that misses it stays on 0.115.0 forever without a warning.
3. **Switch at 1.0.0 only.** Keep shipping 0.115.x PATCHes until launch. 1.0.0 is above 0.115.0, so no move is needed. Chapters still rewrite the history. Cost: the ladder 0.6 to 0.9 never appears on real builds.

**Fallback for every option:** the fixed link `https://github.com/ItzJsimp/leonidas-code/releases/latest/download/Leonidas-Setup.exe`. App data in `~/.t3` stays because app id `com.t3tools.t3code` does not change.

**Mac.** Unsigned Mac builds cannot auto-update (Squirrel.Mac checks the signature). The Mac user downloads `Leonidas-Setup-mac.dmg` from `releases/latest/download/` and replaces the app once, with any option. Send the user one short message with the link.

## 9. What must change

| Where | Change |
| --- | --- |
| `scripts/leonidas-release.ts` `classifyRelease` | Default `patch`. `minor` only from `Release-Size: big` (or `release_kind: minor`). `feat!:` before launch maps to `minor` with the same story check. |
| `scripts/leonidas-release.ts` `nextReleaseVersion` | Keep `launch` = 1.0.0. No change to the arithmetic. |
| `scripts/leonidas-release.ts` `main` | "Previous" = highest semver among non-draft, non-pre-release `v0.` releases, not the first in API order. Read all pages, not only the first 100. |
| `team-release.yml` | Same "previous" fix at line 295 to 297. Run `check-release-notes.ts` before publish; fail holds the release. Publish chapter-safe: never mark a chapter as latest. |
| `leonidas-release.json` | `initialVersion` 0.1.0 stays. Optional: add `ladderFloor` for the bridge rule. |
| `scripts/leonidas-release-health.ts` | Add the notes check result. |
| `releaseHistory.ts`, `releaseArticle.ts` | Read a chapter date range from the metadata comment. Optional hero, known issues, credits. |
| `DesktopUpdates.ts` | Bridge rule (option 1 only), with a test. |
| `leonidas-release` skill | Remove "first development release is 0.2.0" and "new capabilities advance MINOR". Add the size rule, the checker, the image workflow. |
| `AGENTS.md` rule 10 | Point at the checker. Keep one skill. |
| `docs/user/install.md`, `docs/operations/leonidas-release-health.md` | Describe the ladder and the one-time move. |
| `project-roadmap.json` | `currentVersion` 0.5.8. Milestone versions move into the 0.6 to 0.9 steps. Keep every `Roadmap key:`. Check in Phase B that the board accepts 2 milestones with the same step, and that cards with a `milestone` field do not lose their link. |
| `project/roadmap.md` | Link the new ladder. |
| Marketing site | No change needed (reads latest only). |
| Local git config | `git config remote.upstream.tagOpt --no-tags` in each clone, so upstream `v0.1.x` tags do not clash. Documented in `project/agent-gotchas.md`. |

## 10. Small extra improvements (proposed, safe)

- **Internal-only line:** a range with only `ci`, `docs`, `refactor`, `test`, `chore` gets "This update changes how Leonidas is built. Nothing changes in the app." instead of "No patch notes were provided". Honest, and it removes the empty-notes look.
- **Ban the filler line** "Behind-the-scenes reliability improvements" in the checker (the guide already forbids invented reliability claims).
- **Upstream tags off** in local clones (section 9). Stops the fetch error seen on 2026-10-21.

## 11. Gate 1 decisions for Jake

- **A. Today's number:** 0.5.8 (recommended), or another number with a reason.
- **B. Size rule:** MINOR = a completed ladder step (recommended), or MINOR = any nameable capability with a story (uses up 0.6 to 0.9 within days at the current pace).
- **C. Chapter map:** approve the 29 entries in section 5, or name changes.
- **D. Old builds:** option A, archive tags plus deletion of the 12 tags `v0.2.0` to `v0.9.0` (recommended). Also: keep or delete the git tags `v1.0.1` to `v1.0.16` and `v0.10.0` to `v0.115.0` after their releases move.
- **E. Migration:** bridge build (recommended), manual reinstall, or switch only at 1.0.0. Plus: who else has an install.

**Jake's answers (2026-10-21, Gate 1 passed):** A and C: 0.5.8 and the 29 chapters as written. B: MINOR = a finished ladder step. D: archive tags, delete only the 12 tags `v0.2.0` to `v0.9.0` (the deletion itself runs after the Gate 2 dry-run list). E: bridge build first. Open: the full list of installs.
