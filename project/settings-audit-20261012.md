---
type: reference
id: leonidas-code-settings-audit-20261012
title: "Leonidas: settings list, reorganisation, bloat, gaps and ship defaults"
description: "Every searchable setting by page (118 rows), a proposed grouping for new users, what to fold or remove, 8 settings to add, and the default values to ship."
scope: structural
owner: leonidas
verified: 2026-10-12
---

# Settings audit (2026-10-12)

Source: the searchable catalogue in `apps/web/src/components/settings/settingsSearch.ts` (118 rows plus one row per keybinding command) and schema defaults in `packages/contracts/src/settings.ts`. Machine-state, secrets and accounts are already excluded from shipping by [`settings-inventory.md`](./settings-inventory.md); this file does not repeat that list. The "Now" defaults below come from the schema; the ones marked (?) were not verified in code and need a check before changing.

## 1. Every setting by page

- **General (50):** Project defaults and overrides; Default model; Permissions; Project grouping; Project order; Snooze limited threads; Auto-resume limited threads; Working section (beta); Auto-settle inactive threads; Auto-settle merged threads; Days of inactivity before auto-settle; Thread notifications; In-app notifications; Time format; Response streaming; Hide whitespace changes; Default diff file state; Diff layout; Proactive panels; Show skills in slash menu; Prompt prediction; Prediction source; Local prediction model; Cloud prediction model; Cloud prediction limit; Rich text composer; Collapse composer on scroll; Send shortcut; Follow-up behavior; Provider update checks; Continue threads after restarts; Background activity; New threads; Submodules; Start from origin; Add project starts in; Unpin confirmation; Archive confirmation; Delete confirmation; Quit shortcut; Text generation model; Version; Update track; t3 command; Privacy policy; Diagnostics; Open source licenses; Plan mode (legacy); Context window indicator (legacy); Sidebar (legacy).
- **Appearance (16):** Color scheme; Themes; Leonidas grid; Crimson glow; Reset to Leonidas; Diff colors; Chat width; Panel animations; Environment identification; Interface font; Prompt font; Code font; Terminal font; Font smoothing; Word wrap; Composer context.
- **Keybindings (1 page, one row per command):** Keybindings.
- **SnapShots (5):** Include app text; Capture shortcut; Capture sound; Capture flash; Capture animations.
- **Providers (4):** Providers; Usage providers; Cursor account usage; Health check interval.
- **Integrations (15):** Agent browser access; Device hosts; Agent device access; Device hub; Simulator support; Browser profiles; Default browser profile; Default browser viewport; Default browser zoom; Default browser appearance; Browser recording frame rate; Show key presses in recordings; Show mouse presses in recordings; Open links in; Auto-show floating preview.
- **Scheduled Tasks:** a list of tasks, not settings.
- **Source Control (10):** Automatically pull; Remove agent credits when merging; Default merge method; Source control; Git fetch interval; Worktree branch naming; GitHub accounts and token; Source control writing style; Follow change request templates; Source control writer model.
- **Storage (4):** Delete now; Worktree cleanup; Worktree location; Artifacts and logs.
- **Connections (9):** Environment icon; Local environment; Network access; Tailscale HTTPS; WSL backend; This machine; Environments; Load balancing; GitHub sharing.
- **Archive (1):** Archived threads (data, not settings).
- **Hidden pages:** Project overview and Actions (only with a project selected), Diagnostics (OpenTelemetry export).

## 2. Proposed organisation

General holds 50 rows, which is why people cannot find things. The 11 pages stay (routes, search and the tour keep working); the sidebar groups them under three headings, shipped now in `SettingsSidebarNav.tsx`:

- **Essentials:** General, Appearance, Providers. What a new user touches on day one.
- **Workflow:** Keybindings, SnapShots, Integrations, Source Control, Scheduled Tasks. Things you turn on as you grow.
- **System:** Connections, Storage, Archive. Rarely visited.

Next step, not yet done: split General into five folded sections by task so the page reads as a short list: **Agents** (model, permissions, follow-up, send shortcut, plan mode), **Threads** (grouping, order, auto-settle, snooze, auto-resume, working section), **Notifications**, **Diffs**, **Composer** (rich text, prediction x5, skills in slash menu, collapse on scroll). **About** (version, update track, licenses, privacy, t3 command, diagnostics) moves to the bottom.

## 3. Keep, fold, remove

- **Fold into an "Advanced" disclosure (not removed):** Browser recording frame rate; Show key presses and mouse presses in recordings; Default browser zoom and appearance; Cloud prediction limit; Local and Cloud prediction model (keep only Prediction source on top); Health check interval; Git fetch interval; Time format; Font smoothing; Panel animations; Tailscale HTTPS; WSL backend; t3 command; Diagnostics and OpenTelemetry export.
- **Remove as bloat:** the three legacy toggles (Plan mode, Context window indicator, Sidebar); they exist only to keep old layouts alive. Also remove Simulator support and Device hub from the default view until mobile devices are part of the pitch (hide, do not delete the code).
- **Merge:** the four prediction rows into one "Prompt prediction" row that expands; the three "confirmation" rows (unpin, archive, delete) into one "Ask before" multi-select; the four capture rows in SnapShots into one "Capture feedback" group.
- **Keep on top:** Default model, Permissions, Project grouping, Project order, Thread notifications, Color scheme, Themes, Providers, Auto-resume limited threads.

## 4. Missing settings to add (8)

1. **Quiet hours:** silence sounds and notifications between two times.
2. **Notification sound choice** (and a volume), matching the update toast sound.
3. **Daily spend or usage warning:** warn at a percentage of the subscription window (the data already exists in Usage).
4. **Default reasoning effort** for new threads, per provider.
5. **Default thread workspace per project:** worktree or main checkout without opening `t3.json`.
6. **Auto-launch on login** and **start minimised to tray**, for the always-on Scribe workflow.
7. **Settings export and import** (JSON, secrets excluded) so Jake and Mob can sync a baseline.
8. **Reset section to defaults** button per page (today there is only a device-wide restore).

## 5. Defaults to ship

"Now" is the schema default. Where Now equals the recommendation the cell says keep.

| Setting                             | Now                | Ship                                 | Reason                                                                                            |
| ----------------------------------- | ------------------ | ------------------------------------ | ------------------------------------------------------------------------------------------------- |
| Permissions                         | Full access        | Full access                          | Leonidas is a power-user tool; Jake's rule is to default to full access. Show a first-run notice. |
| Thread notifications                | Off                | On, only when the app is not focused | Notifications are the main reason to leave a thread running.                                      |
| In-app notifications                | Off                | On                                   | A finished or blocked thread should be visible without a system alert.                            |
| Auto-resume limited threads         | Off                | On                                   | Matches the limit failover promise.                                                               |
| Snooze limited threads              | Off                | Off                                  | Avoid hiding work from a new user.                                                                |
| Working section (beta)              | Off                | Off                                  | Still beta.                                                                                       |
| Hide whitespace changes             | On                 | Keep                                 | Cleaner diffs.                                                                                    |
| Default diff file state             | Collapsed          | Keep                                 | Large diffs stay scannable.                                                                       |
| Diff layout                         | schema default (?) | Unified                              | Narrow windows.                                                                                   |
| Chat width                          | Comfortable        | Keep                                 |                                                                                                   |
| Response streaming                  | paragraph          | Keep                                 | Calm output, fewer repaints.                                                                      |
| Send shortcut                       | Enter              | Keep                                 |                                                                                                   |
| Follow-up behavior                  | Queue              | Keep                                 |                                                                                                   |
| Rich text composer                  | On                 | Keep                                 |                                                                                                   |
| Collapse composer on scroll         | On                 | Keep                                 |                                                                                                   |
| Show skills in slash menu           | On                 | Keep                                 |                                                                                                   |
| Proactive panels                    | Off                | Off                                  | Panels opening unasked feels like a bug.                                                          |
| Prompt prediction                   | schema default (?) | On, local source only                | Ghost text is a Leonidas signature; avoid cloud cost by default.                                  |
| Provider update checks              | On                 | Keep                                 |                                                                                                   |
| Continue threads after restarts     | schema default (?) | On                                   | Matches Jake's "continue interrupted runs" rule.                                                  |
| Delete confirmation                 | On                 | Keep                                 |                                                                                                   |
| Archive and Unpin confirmation      | Off                | Keep                                 |                                                                                                   |
| Quit confirmation                   | schema default (?) | Only when threads are running        |                                                                                                   |
| Project grouping                    | schema default (?) | Group matching repos                 |                                                                                                   |
| Project order                       | Last user message  | Keep                                 |                                                                                                   |
| Environment identification          | schema default (?) | Pill                                 | Artwork backdrop costs GPU on every redraw.                                                       |
| Panel animations                    | schema default (?) | On, short duration                   |                                                                                                   |
| Font smoothing                      | On                 | Keep                                 |                                                                                                   |
| Word wrap                           | On                 | Keep                                 |                                                                                                   |
| Agent browser access                | On                 | Keep                                 |                                                                                                   |
| Agent device access, Device support | Off                | Off                                  | Needs a device first.                                                                             |
| Default merge method                | schema default (?) | Squash                               | One commit per task on `main`.                                                                    |
| Automatically pull                  | Off                | On for the project's default branch  | Matches the shared `main` workflow.                                                               |
| Remove agent credits when merging   | schema default (?) | Off                                  | Honest attribution is the default.                                                                |
| Worktree cleanup                    | Never              | After merge, only when unchanged     | Disk is the real constraint on this machine (HDD).                                                |
| Load balancing                      | Off                | Off                                  | Accounts do not share threads.                                                                    |
| SnapShots                           | Off                | Off                                  | Needs setup; flash, sound and animation keep their On defaults.                                   |
| Update track                        | latest             | latest                               |                                                                                                   |
| Theme                               | Leonidas           | Leonidas                             |                                                                                                   |

Rows marked (?) are not read from code this session. Confirm them in `packages/contracts/src/settings.ts` before changing any value; a changed default only applies to machines that have not set the key, per the overlay mechanism in `settings-inventory.md`.
