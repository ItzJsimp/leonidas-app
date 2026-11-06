---
type: reference
id: t3-code-settings-inventory
title: "Leonidas: settings inventory and proposed team values"
description: "Where every Leonidas setting is persisted, which can never be shipped (secrets, accounts, machine paths), the team-defaults seed that shipped on the server, and the remaining values awaiting Jake's approval."
scope: structural
owner: leonidas
verified: 2026-10-11
---

# Leonidas settings inventory

Source: read-only sweep of `this repo` on 2026-10-10 (`packages/contracts/src/settings.ts`, `apps/server/src/serverSettings.ts`, `apps/desktop/src/settings/DesktopAppSettings.ts`). Companion: [`settings-walkthrough.md`](./settings-walkthrough.md). Card: [`leonidas-code-settings-parity-for-jake-and-mob`](../../../tasks/leonidas-code-settings-parity-for-jake-and-mob.md).

## Where settings live (`~/.t3/userdata`)

- **S** `settings.json` (server; keys marked PROJ also have per-project overrides keyed by machine-local project id, so never ship those overrides).
- **C** client settings (`client-settings.json` on desktop, localStorage `t3code:client-settings:v1` in a browser).
- **D** `desktop-settings.json` (window, WSL, Tailscale, update channel: machine state).
- **K** `keybindings.json` (seeded from `DEFAULT_KEYBINDINGS` when missing).
- **LS** localStorage (theme keys `t3code:theme*`).
  Pages: Project, General, Appearance, Keybindings, SnapShots, Providers, Integrations, Scheduled Tasks, Source Control, Storage, Connections, Archive (Archive and Scheduled Tasks hold data, not settings).

## Never ship

- **Secrets:** GitHub and Bitbucket tokens, usage-limit management keys, provider env values (secret store); `antigravity.apiKey` (plaintext in `settings.json`).
- **Accounts:** `github.hosts[].account`, `bitbucket.email`, `antigravity.gcpProject`, the T3 Connect/Clerk session, DPoP keys in IndexedDB, `onboardingCompletedAt`, Claude and Codex home dirs (`auth.json`, `.claude.json`).
- **Machine:** every D key, `worktreesDirectory`, `addProjectBaseDirectory`, binary and home paths, `deviceHosts`, `browserProfiles`, `mainWindowBounds`, observability URLs.
- **Each person logs in on their own machine:** Claude account(s), GitHub (`gh`), Codex if used. Nothing here can be copied across.

## Seed mechanism (server side shipped 2026-10-11)

The server seed lives in `TEAM_SERVER_SETTINGS_DEFAULTS` and `applyTeamSettingsDefaults` (`packages/shared/src/serverSettings.ts`), applied at the end of `loadSettingsFromDisk` (`apps/server/src/serverSettings.ts`). It fills a team default only where the settings file has no key of its own, so an explicit choice always wins. Two details that are easy to get wrong:

- The seed is an **overlay, not a migration**: `writeSettingsAtomically` strips against `EFFECTIVE_SERVER_SETTINGS_DEFAULTS` (schema defaults with the team defaults folded in), so a value the machine never chose stays out of its file even after the user edits something else. Without that, the first settings change would bake the seed in and later team-default changes would stop reaching that machine.
- Presence is read per top-level key from the raw file, before decoding. Once a file carries any `storageCleanup`, the rest of that object is the user's to set.

The **Settings UI baseline is `EFFECTIVE_SERVER_SETTINGS_DEFAULTS`**, not `DEFAULT_SERVER_SETTINGS`. A seeded key compared against the schema default looks modified and its Reset button would undo the team default. Because the write path strips against the same object, Reset is a real return to the team default: the value it writes is stripped, so the key leaves the file and the team default governs it again instead of being pinned. Any test fixture that means "a machine that has chosen nothing" must fold the team defaults in too, or every seeded key reads as changed.
Still open:

1. **Client keys** (`timestampFormat`, `chatWidth`, `planModeEnabled`, `contextWindowMeterEnabled`, notification mode): seed `client-settings.json` (path in `apps/desktop/src/app/DesktopEnvironment.ts` L210) only when absent, and decide what web localStorage (`t3code:client-settings:v1`) does. Precedent for a startup seed: `syncDefaultKeybindingsOnStartup` in `apps/server/src/keybindings.ts`.
2. **Trap to document either way:** a key the user resets to default is absent on disk, so the seed refills it on the next start.
3. **Keybindings:** change `DEFAULT_KEYBINDINGS` in `packages/shared/src/keybindings.ts` instead of seeding.

## Proposed values

**Shipped 2026-10-11** in `TEAM_SERVER_SETTINGS_DEFAULTS` — these are fork correctness and hygiene rather than taste, so they did not wait for review. Revert any line you disagree with; it is one line in that constant.

| Page           | Key                              | Shipped                                          | Why                                                                                                        |
| -------------- | -------------------------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| General        | continueThreadsAfterServerUpdate | true                                             | Every push to `main` ships an update; without this a restart cancels the running turn and never resumes it |
| Source Control | branchNamingMode                 | semantic                                         | Readable branches, matching the already-forked `branchNamePrefix`                                          |
| Storage        | storageCleanup                   | worktrees 14 days, browser artifacts 14, logs 30 | Stops silent disk growth                                                                                   |

**Still awaiting Jake** (every remaining value is a preference, so none of it shipped). Nothing below is built yet; the client half needs its own seed first.

| Page           | Key                                            | Proposed                 | Why                                                                 |
| -------------- | ---------------------------------------------- | ------------------------ | ------------------------------------------------------------------- |
| General        | timestampFormat                                | 12-hour                  | Jake's standing rule: no 24-hour time                               |
| General        | autoResumeLimitedThreads, snoozeLimitedThreads | true                     | Two Claude accounts hit limits; resume without babysitting          |
| General        | notificationMode / inAppNotificationsEnabled   | notifications / true     | Finished-turn alerts without double sound over the voice daemon     |
| General        | planModeEnabled, contextWindowMeterEnabled     | true                     | Plan before big work; Jake's 400K context threshold needs the meter |
| General        | showSkillsInSlashMenu, composerRichTextEnabled | true                     | Skills are the main AIOS entry point                                |
| General        | sendShortcut                                   | enter                    | Keep default; revisit if dictation sends mid-sentence               |
| General        | followUpBehavior                               | queue                    | Default; keep                                                       |
| General        | confirmThreadDelete                            | true                     | Default; keep                                                       |
| Appearance     | chatWidth                                      | wide                     | Dense output, tables                                                |
| Appearance     | panelAnimationDurationMs                       | 0                        | Default; snappy                                                     |
| Providers      | claudeAgent enabled; codex, others             | claudeAgent on, rest off | Only provider Jake uses; fewer toggles                              |
| Providers      | claudeAgent.autoCompactWindow                  | 400000                   | Jake's context ceiling                                              |
| Source Control | branchNamePrefix                               | (already `leonidas`)     | Done with the rebrand, before this work                             |
| Integrations   | enableAgentBrowserAccess                       | true                     | Default; keep                                                       |
| Integrations   | enableAgentDeviceAccess                        | false                    | Default; keep                                                       |
| Connections    | loadBalancingEnabled                           | false                    | Balances machines, not accounts; no use                             |
| Connections    | updateChannel                                  | latest                   | Our releases are plain semver                                       |
| Keybindings    | defaults                                       | keep; list Jake's wants  | Awaiting Jake                                                       |
| SnapShots      | snapShotEnabled                                | false                    | Unclear value; Jake to say                                          |

Unknown and needing Jake: theme choice (LS key), font sizes and families, SnapShots, sidebar sort and grouping, which accounts to sign into.
