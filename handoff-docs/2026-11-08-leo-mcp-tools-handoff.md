---
status: open
---

# Session Handoff: leo_* MCP tools (live check, T3 clean-up, held git tool)

**Date:** 2026-11-08 | **Operator:** Jake | **Status:** Checkpoint (9 of 10 tool cards landed)
**Saved to:** `handoff-docs/2026-11-08-leo-mcp-tools-handoff.md`

## 0. Resume Prompt

```text
Resume from `handoff-docs/2026-11-08-leo-mcp-tools-handoff.md`. Read it fully, then the files its §2 lists. Verify git state matches §2 and do not redo anything marked done. Present §5, then start step 1 unless it needs my input.
```

## 1. Goal & Focus

Jake wants Leonidas Code agents to reach app features through MCP tools with Leonidas names, and to remove as much T3 branding as the MIT license allows. Source thread: `1ade107f-5f88-4cfb-a14b-683ee68b9b08` ("Audit Leonidas MCP tools").

This session did two things:

- It finished the `leo_*` tool build. The server is `leonidas`. Old names still work through an alias layer for two releases.
- It added 12 new tool names that cover 9 of the 10 tool cards. The tenth card, the git tool, is held on purpose.

Next focus, in Jake's order: **Option A**, a live check of the new tools. **Option B**, the remaining T3 clean-up. Then the held git tool and the small follow-ups in §5.

One wording correction: earlier chat messages said "nine tools". The true count is 12 tool names across 9 cards. Two cards cover a pair of tools each (memory, Scribe, local models cover 2 each).

## 2. Changes Landed & Working Tree

**Landed on `origin/main`** (all through `scripts/Invoke-MergeQueue.ps1`):

| Commit       | What                                                                                                                                                             |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `285322e9b7` | Rename to `leonidas` server and `leo_*` names, alias layer, gate fix in `scripts/Test-DevTip.ps1`                                                                |
| `3e832bafd6` | `leo_aios_memory_search`, `leo_aios_memory_read`, `leo_usage_status`, `leo_release_status`, `leo_hardware_status`, `leo_review_diff_get`, `leo_perf_turn_report` |
| `bca6190125` | `leo_calendar_events`, `leo_scribe_insights`, `leo_local_models_advice`, `leo_scribe_dictionary_add`, `leo_local_models_run`                                     |

**New code, by area** (all under `apps/server/src/` unless noted):

- `mcp/toolkits/insight/` holds the 10 read-only tools. `mcp/toolkits/actions/` holds the 2 write tools (`leo_scribe_dictionary_add`, `leo_local_models_run`).
- Pure logic with tests: `aiosMemory/aiosMemory.ts`, `usage/usageStatus.ts`, `hardwareWatch/hardwareStatus.ts`, `review/reviewDiffLimits.ts`, `diagnostics/turnPerfReport.ts`, `calendar/calendarEvents.ts`, `scribe/scribeSummary.ts`, `localModels/modelPick.ts`.
- `localModels/LocalModelsService.ts` got an `answer` call (it refreshes first).
- `mcp/spawnQuotaGuard.ts` now exports `liveWindows`, `peakPercent`, `accountName`.
- `provider/agentContextBudget.json` is now `mcpToolListJsonBytes: 64716` (was 60479 before this work).
- Labels: `packages/shared/src/t3McpToolPresentation.ts`, `packages/client-runtime/src/t3ToolSummary.ts`, `packages/client-runtime/src/work-log/presentation.ts`.
- `ClaudeAdapterV2.ts` read-only allowlist now also holds `leo_canvas` (an old gap) and the 10 read tools.

**Held, not on `main`:** `leo_git_stacked_action`. Branch `hold/leo-git-stacked-action`, commit `47e4a37cb1`, based on `8957641fad`. It holds the tool, `git/gitActionGuard.ts` with 4 tests, and labels. It exists **only in this clone**.

**Task cards** (AIOS `tasks/`, project `leonidas-product`):

- `review` (landed, no live call yet): `add-the-aiosmemorysearch-and-aiosmemoryread-mcp-tools`, `add-the-usagestatus-mcp-tool`, `add-the-releasestatus-mcp-tool`, `add-the-hardwarestatus-mcp-tool`, `add-the-reviewdiffget-mcp-tool`, `add-the-perfturnreport-mcp-tool`, `add-the-calendarevents-mcp-tool`, `add-the-scribeinsights-and-scribedictionaryadd-mcp-tools`, `add-the-localmodelsadvice-and-localmodelsrun-mcp-tools`.
- `blocked` (held on purpose, has a `Resume:` note): `add-the-gitstackedaction-mcp-tool`.
- `done`: `rename-the-t3-code-mcp-server-and-tools-to-leonidas-names`.
- New, `todo`: `task-dbf45e6a-a3fc-4d81-85f5-5b68ad89138d` (four traps for `project/agent-gotchas.md`).

**Release runs:** the `Team release` runs for `bca6190125`, `2d118eda6c`, `b9b812d4b8` show `cancelled`. A newer merge replaced each one. That is not a failure. The newest run, for `8499fce881`, was `in_progress` and holds all three landings.

**Local branches that are merged and safe to delete:** `task/leo-mcp-priority-tools`, `task/leo-mcp-last-four`. The worktrees `C:/lcw/leo-mcp-priority-tools` and `C:/lcw/leo-mcp-last-four` are already removed.

**Working tree of the main checkout** (`git status -s` at handoff). These files belong to other agents, not to this work. Do not touch them:

```text
 M apps/web/public/data/brain.json
 M apps/web/src/components/ChatView.tsx
 M apps/web/src/components/desktop/releaseArticle.test.ts
 M apps/web/src/components/desktop/releaseArticle.ts
 M project.md
M  scripts/Start-AgentTask.ps1
M  scripts/Sync-DefaultSkills.ps1
 M scripts/leonidas-release.test.ts
 M scripts/leonidas-release.ts
?? .agents/reply-styles/
?? .agents/skills/coordinator/
?? apps/web/src/pendingUserInputDraftStore.test.ts
?? apps/web/src/pendingUserInputDraftStore.ts
?? project/release-history-audit.md
?? project/release-history-overhaul-prompt.md
```

## 3. Decisions & Constraints

- **Decisions locked (Jake):**
  - Rename every literal. Prefix `leo_` on all tools. Server name `leonidas`. Aliases for two releases. License notice on a Third-party licenses screen in Settings. See the rename task card.
  - Land the six read-and-status tools together. Land the last batch except the git tool. Hold the git tool for a live check.
- **Constraints:**
  - Never edit the main checkout for code. Use `pwsh scripts/Start-AgentTask.ps1 -Task <slug>`, then work in `C:/lcw/<slug>`. Land with `pwsh scripts/Invoke-MergeQueue.ps1 -Branch task/<slug> -Task <slug> -Wait`.
  - A push to `main` ships a release. Ask before landing unless Jake already said to.
  - Do not rename internal ids: `@t3tools/*`, `T3CODE_*`, `~/.t3`, app id `com.t3tools.t3code` (see `LEONIDAS.md`).
  - Never open `~/.t3/userdata` read-write. Never start a server against it.
  - Public repo: no keys, personal paths or tokens in commits. No em dash.
  - Fresh worktrees need `vp install --frozen-lockfile` (about 2 minutes with a warm store). Wait for the `DONE` line in the log.
- **Merge gate:** `scripts/Test-DevTip.ps1` fails a test only if `origin/main` does not already fail it, compared by test name. The 2 `ClaudeAdapterV2.test.ts` failures ("closes the CLI when it never answers the MCP registration" and "persists a todo_list from inline Claude task-tool frames") already fail on `main`.
- **Tool access rules:** read tools use `McpToolAccess.reads`. Write tools use `McpToolAccess.writes` and must declare `ThreadManagementService`. Only read-only tools go in the Claude allowlist.

## 4. Dead Ends & Ruled Out Approaches

- **Reuse the old memory code (`ce0cd64c73`):** it hard-codes `D:/Leonidas AIOS` and breaks the public-repo rule. The tools now use `workspaceRoot` from `mcp/toolkits/marketing/handlers.ts`.
- **`AgentTurnPerf` as the perf source:** it only writes a log file and holds no per-thread data. `leo_perf_turn_report` reads the thread projection instead.
- **`modelAdvisor.ts` for model advice:** it lists memory-heavy programs and picks no model. `modelPick.ts` ranks installed models.
- **Hard-code the Phoenix time zone:** the repo is public. `leo_calendar_events` uses the server's zone and returns it.
- **A `readOnly(tool)` helper in `insight/tools.ts`:** it loses the tool types (`any` requirements). Chain `.annotate(...)` on each tool.
- **Shell heredocs for text with backslashes:** the Bash tool turns `\\` into `\` and one stray quote can stop the whole command. Use the Write or Edit tool. (Card `task-dbf45e6a-...` records this.)
- **A tool-list change without updating tests:** the first queue run failed on 4 type errors. Two tests build the full tool layer and need stubs. The budget test needs the new byte count.
- **Landing the git tool with the rest:** Jake chose to hold it. It can commit and push, so it needs a live check first.

## 5. Next Session Action Plan

Option A first, then Option B, then the rest.

1. [ ] **Option A, live check.** Confirm the release run for `8499fce881` is green: `gh run list -R ItzJsimp/leonidas-app -w "Team release" -L 3`. Install the update. Open a **new** chat, because chats started before the update still list the old `mcp__t3-code__` names.
2. [ ] In that chat, call each new tool once and write the result in its task card note. Use `leo_aios_memory_search` (query a known memory word, then `leo_aios_memory_read` with a returned path), `leo_usage_status`, `leo_release_status`, `leo_hardware_status` (expect `volume.*.used` alerts if a drive is full), `leo_review_diff_get`, `leo_perf_turn_report`, `leo_calendar_events` (a 1-day range), `leo_scribe_insights`, `leo_local_models_advice`, and `leo_local_models_run` (needs Ollama running and one installed model). Test `leo_scribe_dictionary_add` last with a harmless pair, then confirm the pair in the Scribe dictionary.
3. [ ] Set each passing card to `done`. Fix any failing tool in a new worktree and say so in the card.
4. [ ] **Option B, T3 clean-up outside the MCP names.** Claim a new task. Rename: ACP `clientInfo` names, the `<t3_code_instructions>` tags (`T3_CODE_ORCHESTRATION_INSTRUCTIONS` in `ClaudeAdapterV2.ts` and `packages/provider-core/src/server/orchestrationInstructions.ts`), the `T3_MCP_*` env names, the OpenCode `INSTRUCTIONS_KEY`, and the web `t3-code` icon id (`icon` in `t3McpToolPresentation.ts` and the web code that reads it). Keep every internal id from §3. Keep saved threads working. Run `rg -n "t3-code|t3_code|T3_MCP"` before and after to prove the change. Present the list to Jake before you rename anything that touches stored data or env vars users may have set.
5. [ ] Update the wording rule in `LEONIDAS.md` ("say it this way every time"): Jake wants no T3 mention where a user sees the app. Ask Jake how much of the fork credit stays outside the license screen.
6. [ ] **Held git tool.** Follow the `Resume:` note on card `add-the-gitstackedaction-mcp-tool`: rebase `hold/leo-git-stacked-action` on `origin/main`, re-add the tool to the `actions` toolkit, recompute `agentContextBudget.json`, run a live check in a throwaway repo (commit, push of a task branch, PR link, refused `main` push), then land. Push the hold branch to origin first only if Jake agrees.
7. [ ] **`soul.md`** (in the AIOS, not this repo): after the update installs, replace the PowerShell dictionary script with `leo_scribe_dictionary_add`.
8. [ ] Do the small follow-ups: card `task-dbf45e6a-...` (four traps, dead link, session-note limit); the status log line that still says "not live-checked"; delete merged local branches `task/leo-mcp-priority-tools` and `task/leo-mcp-last-four`; remove the alias layer two releases after `285322e9b7` ships.

Jake's own steps (cannot be automated): re-add saved Claude rules `mcp__t3-code__*` as `mcp__leonidas__*` in any `settings.json` outside the app. Decide whether to run the upstream sync (4,399 commits behind `upstream/main` on 2026-11-08, a separate project).

## 6. How to Run / Verify

- Fork state: `git fetch -q upstream; git rev-list --left-right --count upstream/main...main`.
- Scoped tests for the tool work (from `apps/server` in an installed worktree): `../../node_modules/.bin/vp test run src/mcp/toolkits src/mcp/McpToolNames.test.ts src/provider/AgentContextBudget.test.ts src/aiosMemory src/calendar src/scribe/scribeSummary.test.ts src/localModels src/usage/usageStatus.test.ts src/hardwareWatch/hardwareStatus.test.ts src/review src/diagnostics/turnPerfReport.test.ts`.
- Typecheck for changed server files: `../../node_modules/.bin/tsc --noEmit 2>&1 | grep "error TS"` and filter to your files. The package has old errors.
- Lint from the repo root: `./node_modules/.bin/vp lint --report-unused-disable-directives <paths>`. Lint needs the repo root. It fails from `apps/server`.
- Tool-list size: the budget test prints the new byte count when it fails.
- Isolated live check (used on 2026-11-08): start a dev server on a temporary state folder, never on `~/.t3/userdata`, call a tool from an agent, then stop only the process you started. Read the `test-t3-app` skill first.
- Release: `gh run list -R ItzJsimp/leonidas-app -w "Team release" -L 3`. Always pass `-R`. Without it `gh` reads the upstream repo.

## 7. Suggested Skills for Next Agent

- `test-t3-app`: for the isolated live check and the browser panel.
- `diagnosing-bugs`: if a live call fails.
- `performance-gate`: before any code change is called done.
- `leonidas-release`: before a commit with a `Release-Note:` trailer.
- `safe-parallel-commit`: for commits in the shared main checkout.
