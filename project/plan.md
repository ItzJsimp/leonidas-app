# Leonidas Code: plan and constraints

Shared Jake + Mob fork of T3 Code, the agent harness that replaces the Claude Code front end and Antigravity. Agent playbook (read first): [`agent-playbook.md`](../agent-playbook.md). Ledger: [`project.md`](../project.md). Settings guide: [`settings-walkthrough.md`](./settings-walkthrough.md). Name check: [`name-research.md`](./name-research.md).

## What already exists in T3 Code (do not rebuild)

| Need | Already in source | Gap |
|---|---|---|
| Update toast, accept now or later, restart | `apps/desktop/src/updates/DesktopUpdates.ts` (electron-updater, polls every 4 minutes), `apps/web/src/components/desktopUpdate.toast.tsx`, `SidebarUpdatePill.tsx` | Builds point at `pingdotgg` releases. Fix: publish our own GitHub Releases; `scripts/build-desktop-artifact.ts` `resolveGitHubPublishConfig` already reads `GITHUB_REPOSITORY`, so a CI build in our repo auto-targets our repo. |
| Two Claude accounts + Antigravity + Codex in one app | Provider instances with per-instance `CLAUDE_CONFIG_DIR`; Antigravity driver in `packages/` | None found. |
| Claude canon (`CLAUDE.md`, hooks, skills, MCP) | Claude provider runs the Claude Agent SDK, which loads them | Keep the `claude` CLI installed; only its GUI is retired. |

## Plan

1. **Shared repo from Mob's build.** Mob pushes his modified source to a new repo (or a branch of `ItzJsimp/t3code`); both clone it; the other is added as collaborator. Card: [`t3-code-shared-repo-from-mob-build`](../../../tasks/t3-code-shared-repo-from-mob-build.md).
2. **Push-to-update pipeline.** Slim GitHub Actions workflow: on push to `main`, build the Windows NSIS installer with `GITHUB_REPOSITORY` set, publish a GitHub Release with version `1.0.<run_number>`. The existing updater shows the toast on the other machine within about 4 minutes of the release landing. Card: [`t3-code-push-to-update-release-pipeline`](../../../tasks/t3-code-push-to-update-release-pipeline.md).
3. **Synced task board.** Panel in the web UI, backed by a shared store both instances watch; agents add tasks through a CLI or MCP tool. Card: [`t3-code-synced-task-board`](../../../tasks/t3-code-synced-task-board.md).
4. **Rebrand.** Product name, icons, window title, installer name, update repo. Keep it a thin layer so upstream merges stay cheap. Card: [`t3-code-rebrand`](../../../tasks/t3-code-rebrand.md).

## Constraints that shape the build

- **Public vs private repo:** electron-updater reads public GitHub Releases with no token. A private repo needs a token baked into each install and burns the 2,000 free Actions minutes per month (Windows minutes count double).
- **Unsigned installer:** Windows SmartScreen warns on first install; electron-updater still installs updates because no `publisherName` is set.
- **Upstream divergence:** once installs come from our repo, upstream T3 fixes arrive only when we merge `upstream/main`. Every rebrand touch makes that merge harder.
- **Mob's side:** Mob's AIOS clones this repo to the same path (`projects/leonidas-app/`); nothing here writes to his machine.
