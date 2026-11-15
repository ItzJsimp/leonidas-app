# Ship-gate sweep, 2026-11-14

Scope: formatting, unused code, icons, mobile static checks and the native crate. The baseline-failures work owns test, lint and typecheck failures. This sweep does not touch those checks.

## Result table

Each check ran once before any edit. `pnpm` on this machine fails (the corepack shim has no `pnpm.js`). Each row therefore ran the command that the script wraps.

| Check                                      | Command run                                                                               | Exit before | Failures before          | Exit after | Failures after |
| ------------------------------------------ | ----------------------------------------------------------------------------------------- | ----------- | ------------------------ | ---------- | -------------- |
| `fmt:check`                                | `vp fmt --check`                                                                          | 1           | 44 files                 | 0          | 0              |
| `knip:check`, pass 1 (files, dependencies) | `knip --include files,dependencies`                                                       | 1           | 17 files, 1 dependency   | 1          | 3 files        |
| `knip:check`, pass 2 (exports)             | `knip --workspace ... --exports`                                                          | 1           | 103 exports, 1 duplicate | 1          | 31 exports     |
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

## Findings left alone, with owner

| Item                                                               | Why it stays                                                                                                                                                                            | Owner path                      |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| `scripts/catchup/cli.ts`                                           | The CLI entry of the documented catch-up tool. Nothing imports it. Fixing it needs a `knip.jsonc` entry, which this sweep must not change.                                              | `scripts/catchup/`              |
| `apps/web/src/components/chat/MarkdownMath.tsx`, `MathTypeset.tsx` | The LaTeX port is half wired. `markdown-clipboard.ts`, `index.css` and `markdown-clipboard.math.browser.test.ts` still refer to it. Delete or wire it as one decision.                  | `apps/web/src/components/chat/` |
| `ANTIGRAVITY_EFFORT_ORDER` in `packages/shared/src/model.ts`       | The file was dirty at scan time.                                                                                                                                                        | Antigravity model work          |
| 30 exports with no use anywhere (table below)                      | Removing each one leaves dead imports and, in 6 files, whole dead components. A trial run added more than 50 lint warnings and was reverted. Each needs a real delete with its imports. | Unowned                         |

Task card: not created. The `leonidas-app` project holds 221 open tasks (cap 100) and `-AllowOverCap` needs Jake's approval.

### Exports with no use (unowned)

| File                                                              | Exports                                                                                                                                                                                                                                     |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/server/src/provider/CodexProvider.ts`                       | `codexAppServerEnvironment`                                                                                                                                                                                                                 |
| `packages/shared/src/model.ts`                                    | `ANTIGRAVITY_EFFORT_ORDER`                                                                                                                                                                                                                  |
| `packages/shared/src/htmlRender.ts`                               | `htmlRenderShortcutsMessage`                                                                                                                                                                                                                |
| `packages/shared/src/mcpServerName.ts`                            | `LEGACY_MCP_SERVER_NAMES`                                                                                                                                                                                                                   |
| `apps/web/vite/warmBundledDev.ts`                                 | `warmBundledDevPlugin`                                                                                                                                                                                                                      |
| `apps/web/src/components/HostedEmptyState.tsx`                    | `HostedEmptyState`                                                                                                                                                                                                                          |
| `apps/web/src/components/ThreadStatusIndicators.tsx`              | `ThreadTerminalStatusButton`                                                                                                                                                                                                                |
| `apps/web/src/components/chat/ChatOverlayHosts.tsx`               | `openPullRequestThreadDialog`, `PullRequestThreadDialogHost`, `openDeviceSetupDialog`, `DeviceSetupDialogHost`, `openBranchRestoreConfirm`, `BranchRestoreConfirmHost`                                                                      |
| `apps/web/src/components/chat/friendlyError.ts`                   | `friendlyErrorToastFields`                                                                                                                                                                                                                  |
| `apps/web/src/components/chat/TraitsPicker.tsx`                   | `getReasoningTraitStep`                                                                                                                                                                                                                     |
| `apps/web/src/components/settings/ProviderSettingsPanel.logic.ts` | `buildProviderInstanceOverridePatch`                                                                                                                                                                                                        |
| `apps/web/src/components/twoState/useLiveArea.ts`                 | `useLiveArea`                                                                                                                                                                                                                               |
| `apps/web/src/components/AddProjectToMachineDialog.tsx`           | `openAddProjectToMachine`                                                                                                                                                                                                                   |
| `apps/web/src/components/sidebar/updateEverythingRun.tsx`         | `useUpdateEverythingRun`, `retryFailedUpdateRunServers`, `dismissSettledUpdateRunMachines`, `waitForServerUpdateHandoff`, `waitForUpdateRestart`, `postponeUpdateRestart`, `saveUpdateEverythingResult`, `clearSavedUpdateEverythingResult` |
| `apps/web/src/components/chat/PlanUsageLimits.tsx`                | `UsageRing`                                                                                                                                                                                                                                 |
| `apps/web/src/components/marketing/state.ts`                      | `isUnused`                                                                                                                                                                                                                                  |
| `apps/web/src/components/scribe/StatsParts.tsx`                   | `StatsSection`                                                                                                                                                                                                                              |
| `apps/web/src/components/NightlyMobileBeta.tsx`                   | `NightlyMobileBetaNotice`                                                                                                                                                                                                                   |
| `apps/web/src/components/calendar/useCalendar.ts`                 | `useUpNextCount`                                                                                                                                                                                                                            |
