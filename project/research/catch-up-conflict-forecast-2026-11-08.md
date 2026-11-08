# Catch-up conflict forecast (research, 2026-11-08)

Question: for each of the 11 stage points, how many files conflict with `origin/main` (`5b0249667e`), and how many need judgment?

## Method

- **Command:** `git merge-tree --write-tree --name-only --messages --merge-base=8d199b4f7b origin/main <stage>`. No checkout, no ref change. About 2 minutes for all 11 runs. Script: `C:/lcw/_scratch-b15/research/forecast2.py` (may be wiped).
- **Cumulative.** Each run merges the stage tip into `origin/main` in one step from the original base. "Cumulative" is the conflict count if you merged to that point at once. "New" is the files that conflict at this stage but did not conflict at an earlier one. "New" is the work of this stage if each earlier conflict is fixed once. It is a lower bound: a file that conflicts again at a later stage after your fix does not show.
- **Stages 11** (size rule from the stage-points note): v0.1.0, v0.1.1a (`v0.1.1-nightly.20261018.3302`), v0.1.1b (`v0.1.1-nightly.20261019.3373`), v0.1.1, v0.1.2, v0.1.3, v0.1.4, v0.1.6 (includes v0.1.5), v0.1.7a (`v0.1.7-nightly.20261102.4061`), v0.1.7, tip.
- **Tag method.** Mechanical = modify/delete, rename/delete, rename/rename, file location, lockfile or generated file (`pnpm-lock.yaml`, `*.gen.ts`, snapshots). Judgment = every other conflict (content and add/add). I did not test "formatting only". Some judgment files may be whitespace-only, so the judgment count is an upper bound. A first run of a chained method (each stage merged onto the unresolved result of the last) double-counted conflict markers and is not used.

## Table

| Stage | Cumulative | New | New judgment | New mechanical | New by area (web / server / mobile / desktop / packages / docs+scripts+other) |
| --- | --- | --- | --- | --- | --- |
| v0.1.0 | 174 | 174 | 170 | 4 | 47 / 60 / 27 / 8 / 25 / 7 |
| v0.1.1a | 546 | 373 | 339 | 34 | 177 / 70 / 40 / 9 / 66 / 11 |
| v0.1.1b | 588 | 43 | 42 | 1 | 17 / 10 / 8 / 1 / 5 / 2 |
| v0.1.1 | 679 | 94 | 88 | 6 | 23 / 27 / 13 / 4 / 21 / 6 |
| v0.1.2 | 909 | 244 | 178 | 66 | 85 / 47 / 31 / 21 / 53 / 7 |
| v0.1.3 | 1,075 | 175 | 164 | 11 | 87 / 37 / 15 / 5 / 23 / 8 |
| v0.1.4 | 1,147 | 82 | 75 | 7 | 43 / 14 / 12 / 3 / 4 / 6 |
| v0.1.6 | 1,173 | 25 | 24 | 1 | 9 / 4 / 1 / 2 / 5 / 4 |
| v0.1.7a | 1,187 | 15 | 15 | 0 | 5 / 3 / 3 / 0 / 3 / 1 |
| v0.1.7 | 1,200 | 12 | 12 | 0 | 2 / 6 / 0 / 1 / 2 / 1 |
| tip | 1,236 | 33 | 29 | 4 | 11 / 2 / 11 / 0 / 7 / 2 |

At the tip (one full merge): 1,236 files. Judgment 1,086 (1,009 content, 79 add/add). Mechanical 150 (144 modify/delete, 4 rename/delete, 2 lock or generated). By area: web 483, server 276, packages 210, mobile 159, desktop 53, docs 23, scripts 16, marketing 5, other 11.

## Findings

- **Front-loaded.** The first 4 stages (up to v0.1.1) hold 679 of 1,236 files (55 percent). v0.1.1a alone is 373. After v0.1.4 each stage is under 35 files. The staged plan gets cheap fast.
- **Hot stages:** v0.1.1a (373), v0.1.2 (244, with 66 mechanical), v0.1.3 (175). Plan the most time there.
- **Web is the largest area** at 483 files, then server 276 and packages 210. Mobile is 159 files, so a mobile decision (keep or skip) cuts about 13 percent.
- **modify/delete:** 144. 138 of them are files that upstream deleted and Leonidas modified (web 78, mobile 34, server 16, packages 5, scripts 4, desktop 3). Only 6 are files that Leonidas deleted and upstream modified (marketing 1, server 2, web 2, and 1 other). So the answer to "areas Leonidas does not use" is 6 files. The 138 need a decision per file: drop our edit or move it to the new upstream home.
- **add/add: 79.** Both sides added the same path with different content. Many are ports of an upstream file that Leonidas copied early (for example `outboundHttp.ts`, `modelSwitch.ts`, `assetImageSource.ts`). Batch 15 also gave 18 new Leonidas files names that upstream already uses (the 8 `Timeline*` row files, 3 `Sidebar*` files, 2 composer parts and 5 hooks). Correction (2026-11-08): the first draft said four. Fixed in `b49ae2ed6e`: the 18 files now carry a `Leo` prefix. Full-merge conflicts went from 1,236 to 1,218 files and add/add from 79 to 64.

## The 20 hardest files (conflict hunks in the full-merge tip result)

| Hunks | File | Reason |
| --- | --- | --- |
| 77 | `apps/web/src/components/chat/ChatComposer.tsx` | Leonidas wiring vs upstream hook split |
| 77 | `apps/web/src/components/ChatView.tsx` | `onSend` and 111-variable closure vs upstream hooks |
| 58 | `apps/server/src/orchestration-v2/Adapters/ClaudeAdapterV2.ts` | both sides rewrote the Claude adapter |
| 55 | `apps/web/src/components/sidebar/SidebarThreadRow.tsx` | name collision: our 1,855-line row vs upstream row (renamed `LeoSidebarThreadRow.tsx` after this run) |
| 53 | `apps/web/src/components/settings/settingsSearch.ts` | Leonidas plain-word settings vs new upstream entries |
| 42 | `apps/web/src/components/Sidebar.tsx` | protected sidebar structure vs upstream sidebar work |
| 40 | `apps/server/src/orchestration-v2/Adapters/ClaudeAdapterV2.test.ts` | follows the adapter |
| 31 | `apps/web/src/components/chat/TimelineWorkGroupRows.tsx` | name collision, since renamed with a `Leo` prefix |
| 27 | `apps/web/src/components/chat/MessagesTimeline.tsx` | Leonidas timeline rows vs upstream row files |
| 26 | `apps/web/src/components/chat/TimelineUserMessageRow.tsx` | name collision, since renamed with a `Leo` prefix |
| 26 | `apps/server/src/mcp/OrchestratorMcpService.test.ts` | Leonidas `leo_*` tools vs upstream MCP changes |
| 25 | `packages/contracts/src/settings.ts` | both sides added settings keys |
| 24 | `apps/web/src/components/settings/SettingsPanels.tsx` | protected Settings pages |
| 24 | `apps/web/src/components/CommandPalette.tsx` | Leonidas shortcuts and commands |
| 23 | `apps/web/src/components/chat/TimelineWorkEntryRow.tsx` | name collision, since renamed with a `Leo` prefix |
| 21 | `apps/server/src/ws.ts` | RPC list changed on both sides |
| 20 | `packages/contracts/src/orchestratorMcp.ts` | `leo_*` tool contracts vs upstream |
| 20 | `apps/web/src/components/settings/ConnectionsSettings.tsx` | protected Settings, new upstream connections |
| 20 | `apps/web/src/components/pullRequest/PullRequestDetailPanel.tsx` | Leonidas PR page vs upstream panel |
| 18 | `apps/web/src/components/ChatMarkdown.tsx` | markdown split upstream (`Markdown*.tsx` files) |

Reasons are inferred from file names and the inventory note, not from reading each hunk.

## Not done

- No stage was resolved. "New" assumes each file is fixed once.
- Formatting-only conflicts were not separated out.
- Hunk counts come from the full-merge result, not from each stage.
