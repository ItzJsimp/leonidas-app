# Ship-gate sweep, 2026-11-14

Scope: formatting, unused code, icons, mobile static checks and the native crate. The baseline-failures work owns test, lint and typecheck failures. This sweep does not touch those checks.

## Result table

Each check ran once before any edit. `pnpm` on this machine fails (the corepack shim has no `pnpm.js`). Each row therefore ran the command that the script wraps.

The "after" columns describe the local checkout on 2026-11-18, before it landed on `origin/main`. The landed tree differs. See "Landed tree" below.

| Check                                      | Command run                                                                               | Exit before | Failures before          | Exit after | Failures after |
| ------------------------------------------ | ----------------------------------------------------------------------------------------- | ----------- | ------------------------ | ---------- | -------------- |
| `fmt:check`                                | `vp fmt --check`                                                                          | 1           | 44 files                 | 0          | 0              |
| `knip:check`, pass 1 (files, dependencies) | `knip --include files,dependencies`                                                       | 1           | 17 files, 1 dependency   | 0          | 0              |
| `knip:check`, pass 2 (exports)             | `knip --workspace ... --exports`                                                          | 1           | 103 exports, 1 duplicate | 0          | 0              |
| `icons:check`                              | `node scripts/export-brand-icons.ts --check`                                              | 1           | Missing tool             | 1          | Missing tool   |
| `lint:mobile`                              | `node scripts/mobile-native-static-check.ts`                                              | 0           | 0                        | 0          | 0              |
| `test:resource-monitor`                    | `cargo test --locked --manifest-path native/resource-monitor/Cargo.toml`                  | 101         | Missing tool             | 101        | Missing tool   |
| `cargo clippy`                             | `cargo clippy --locked --manifest-path native/resource-monitor/Cargo.toml -- -D warnings` | 101         | Missing tool             | 101        | Missing tool   |

## Rows that stay red

- **`icons:check`:** the script needs Icon Composer 2.x (design generation 26) from Xcode. Windows has no such tool. Run it on a Mac or set `ICON_COMPOSER_TOOL`. No file is at fault.
- **`test:resource-monitor` and `clippy`:** the MSVC `link.exe` is not installed. Git Bash finds the GNU `link` first, and PowerShell finds no linker. Install the Visual Studio "C++ build tools" workload, then run both commands again. No Rust source is at fault.
- **`lint:mobile`:** exit 0, but `swiftlint`, `ktlint` and `detekt` are not installed. The script skips those three linters. The result covers the file-layout checks only.
- **`pnpm`:** the corepack shim is broken. Fix it with `corepack enable` or reinstall Node. The fallback `pnpm.exe` in `vite-plus` rewrote 165 unrelated lockfile lines, so it was not used for the lockfile.

## What the sweep changed

- **Formatting:** `vp fmt` ran on 37 clean tracked files that failed (`.agents/skills/*`, `project/*`, `project-roadmap.json`, two test files and one tracked `.wrangler` bundle). The three large JSON files keep the same data after parse. `.claude/settings.local.json` (git-ignored) also passes now. Six dirty files failed at scan time. Their owner sessions cleared them before the final run: `ClaudeAdapterV2.ts`, `ClaudeAdapterV2.test.ts`, `TaskBoardService.ts`, `aiosCardReader.test.ts`, `aiosCards.ts` and `docs/user/permission-modes.md`.
- **Unused files:** 14 deleted. All were orphaned upstream ports with no importer: the ChatView helper hooks, `copyPromptLink.ts`, `ThreadLinkPrompt.tsx`, the update-everything dialog, hook and capsule, and the mobile `features/threads/ProjectCloneBanner.tsx`.
- **Unused exports:** 77 `export` keywords removed where the name is still used in the same file. The alias `T3_CODE_ORCHESTRATION_INSTRUCTIONS` was removed, and its one test now uses `LEONIDAS_ORCHESTRATION_INSTRUCTIONS`.
- **Unused dependency:** `remark-math` removed from `apps/web/package.json` and from its `apps/web` entry in `pnpm-lock.yaml` (3 lines by hand). `packages/shared` still declares and uses it. `pnpm install --frozen-lockfile --lockfile-only` passes.

## Round 2, 2026-11-18

Jake chose to remove the 30 exports that nothing uses. The sweep deleted each declaration with the TypeScript parser, then ran `vp lint --fix-dangerously` on the 18 files to remove dead imports and locals. 3 functions and 1 dead local were removed by hand. One more export (`isServerUpdateHandedOff`) lost its last user and was removed the same way. About 730 lines left the 18 files.

- **Kept on purpose:** `twoState/useLiveArea.ts` keeps only `IDLE`. Two tests mock the module through `importActual`, and `reactCompilerCoverage.test.ts` lists the file.
- **Dead functions removed:** `PairingSteps` in `HostedEmptyState.tsx`, `isNoticeDismissed` and `dismissNotice` in `NightlyMobileBeta.tsx`.
- **Proof:** `knip` exports pass exits 0. Typecheck for `apps/web` and `packages/shared` exits 0. `apps/server` still shows 463 errors, the same count as before, in test files this sweep does not touch. Unit tests pass in `packages/shared` (69) and `apps/server` (44, 10 skipped). Web unit tests: 27 of 28 files pass. The one failing file is `reactCompilerCoverage.test.ts`, with 4 failures in `ThreadDetailsSection`, `ThreadDetailsUsage`, `UserMessageMoreMenu` and `DiscordNamesCard`. This sweep does not touch those 4 files.
- **Not run:** the `*.browser.test.tsx` projects. `ChatOverlayHosts.browser.test.tsx` and `HostedEmptyState.browser.test.tsx` import only exports that remain.

## Round 3, 2026-11-18

Jake asked the sweep to decide the 3 files that knip still listed.

- **`scripts/catchup/cli.ts`:** fixed. The root `package.json` now has the script `"catchup": "node scripts/catchup/cli.ts"`. The file header already says to run the tool this way. Knip reads the script and counts the file as an entry. `knip.jsonc` did not change. `node scripts/catchup/cli.ts` prints its command list.
- **`MarkdownMath.tsx` and `MathTypeset.tsx`:** kept. The setting `mathRenderingEnabled` (`packages/contracts/src/settings.ts`), the user text in `docs/user/appearance.md` ("Render math") and three patches in `patches/` all exist. `ChatMarkdown.tsx` never uses the two files, and `SettingsPanels.tsx` has no toggle. A delete would break a documented feature. A wire-up is a feature port: upstream commit `cb0553ea39` touched `ChatMarkdown.tsx`, `MessagesTimeline.tsx` and the settings panel. That work is outside a ship-gate sweep.

## Round 4, 2026-11-18

Jake chose to port LaTeX rendering from upstream commit `cb0553ea39`. The setting, the doc text, the patches, the shared parser, the clipboard code and mobile support already existed. The web render path was the missing part.

- **`ChatMarkdown.tsx`:** reads `mathRenderingEnabled`. When it is on, the Markdown pipeline adds `remark-math`, and `code` and `pre` render formulas through `MarkdownMath`. When it is off, TeX stays plain text and KaTeX stays out of the render path.
- **Settings:** a "Render math" switch in Settings, Appearance, with a reset button, a restore entry and a search item.
- **Dependency:** `remark-math` is back in `apps/web/package.json` and its lockfile entry (round 1 had removed it). `pnpm install --frozen-lockfile --lockfile-only` passes.
- **Tests:** 4 new tests in `ChatMarkdown.test.tsx` (off keeps text, on wraps inline and display formulas, a `math` fence renders, prices stay text). All 85 tests in that file pass.
- **Not ported in round 4:** the upstream `inline` mode and the reasoning and review-comment changes. Round 5 covers them. Sent user messages already render formulas, because `LeoTimelineUserMessageRow.tsx` draws them with `ChatMarkdown`.
- **Proof:** both knip passes exit 0. `tsc` for `apps/web` exits 0. Lint counts match HEAD for the 3 changed source files. 63 of 64 related web test files pass. The one failure is the same 4 `reactCompilerCoverage.test.ts` cases as before.

## Round 5, 2026-11-18

Jake asked for the upstream `MessagesTimeline` math changes. The upstream code does not touch sent user messages. It covers compact reasoning previews and the review-comment card. In our fork those are `LeoTimelineWorkEntryRow.tsx`, `LeoTimelineWorkGroupRows.tsx` and `LeoTimelineUserMessageRow.tsx`.

- **`ChatMarkdown` `inline` prop:** renders in a `span` with no block text styles, and its formulas are not focusable. A compact label can now hold a formula.
- **Reasoning previews:** `ThoughtPreview` replaces three `ReactMarkdown` calls and the live thought line. With Render math off it uses the old plain-label renderer, so the default path and its cost do not change. With it on, it uses `ChatMarkdown` in `inline` mode.
- **`remarkThoughtPreview`:** moved to `chat/remarkThoughtPreview.ts` and rewritten as upstream does. It keeps formulas and flattens everything else. `LeoTimelineWorkEntryRow.tsx` shrinks by about 25 lines.
- **Review-comment card:** with Render math on, the comment text renders through `ChatMarkdown`. With it off, the plain text renderer stays.
- **Tests:** 4 new tests for `remarkThoughtPreview` and 1 for `inline` mode. All 90 tests in those two files pass.
- **Proof:** both knip passes exit 0. `tsc` for `apps/web` exits 0. Lint counts match HEAD for all 4 changed files. 8 of 9 related web test files pass. The one failure is the same 4 `reactCompilerCoverage.test.ts` cases as before.
- **Not tested:** the real KaTeX output in a collapsed reasoning row, and the review card in the app. Only the transform and the markup are tested.

## Landed tree, 2026-11-18

The LaTeX work and the cleanup landed on `origin/main` as `27c19da76b` through the merge queue. The 5 sweep commits were cherry-picked onto the newest `origin/main`. Three files conflicted because upstream had changed them, and each kept upstream's version: `AppRail.tsx`, `HostedEmptyState.tsx` and `packages/shared/src/model.ts`. Both knip passes and the format check ran on the landed tree.

| Check                | Exit | Failures   | Cause                                                                                                                                                                       |
| -------------------- | ---- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fmt:check`          | 1    | 8 files    | A local commit from another session swept up the formatted copies, so they never reached `main`.                                                                            |
| `knip:check`, pass 1 | 1    | 2 files    | `ComposerSubagentsButton.tsx` and `useThreadSubagentAttach.ts`: other work (subagents).                                                                                     |
| `knip:check`, pass 2 | 1    | 11 exports | 4 in subagents and trading server files, 5 in trading, home and subagent web files, 1 in `AiosRootTip.tsx`, and `HostedEmptyState` (kept from upstream after the conflict). |

The follow-up change after this landing formats the 8 files and removes the dead `HostedEmptyState` and `PairingSteps` components. `fmt:check` then exits 0 on that branch. Knip was not run again after the follow-up. The other 10 export findings and the 2 files belong to the subagents, trading and home chat work. This sweep did not touch them.

## Findings left alone, with owner

| Item                                                                             | Why it stays                                                 | Owner path                 |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------ | -------------------------- |
| 2 files and 10 exports from subagents, trading and home chat work (listed above) | Other sessions own that code.                                | Subagents and trading work |
| 4 failures in `reactCompilerCoverage.test.ts`                                    | Manual memo calls in 4 files that this sweep does not touch. | Baseline-failures work     |

Task card: not created. The `leonidas-app` project holds 221 open tasks (cap 100) and `-AllowOverCap` needs Jake's approval.
