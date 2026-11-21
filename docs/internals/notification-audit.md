# Notification audit

Date: 2026-11-21. Task card: `audit-and-fix-the-leonidas-notification-system`. Branch: `task/notification-audit`.

Problem: Jake gets too many notifications. Many are duplicates. He skips toasts because they are long or unclear.

## 1. What counts as a notification

A notification tells the user that something outside the current screen needs a look or a decision. It comes from an event that the user did not just cause. A status line, a log line, and feedback for a click on the same screen are not notifications. They stay on the screen where they happen.

| Tier       | Events                                                             | Shows as                                   | Sound |
| ---------- | ------------------------------------------------------------------ | ------------------------------------------ | ----- |
| Interrupt  | Approval needed, input needed, failure, usage limit                | Toast, or system alert if the window hides | Yes   |
| Quiet      | A chat finished after 2 minutes or more, on a chat you do not view | Toast, or system alert if the window hides | Yes   |
| Inbox only | Delegated task finished, task worked on, AIOS changed, script info | Inbox row and Command Center count         | No    |

Rules for every tier:

- Interrupt and Quiet events also stay in the inbox.
- The user can move any event type to Toast, Inbox only, or Off (Inbox, Rules).
- A repeat of the same event inside 1 hour folds into one inbox row with a count.

## 2. Inventory

Counts come from `rg` on `apps/web/src` and from `events/2026-10.jsonl` and `events/2026-11.jsonl` in Jake's AIOS (read only).

| Source                       | Trigger                                    | Channel                                      | Copy                                        | Sound      | Sticky or auto                               | Setting                                | Owner file                                                                                  |
| ---------------------------- | ------------------------------------------ | -------------------------------------------- | ------------------------------------------- | ---------- | -------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------- |
| Chat finished                | Run ends, 2 minutes or more                | Feed event, toast, system alert, badge, push | "Chat finished" + chat name                 | Completion | Auto (5 s default)                           | Mode, In-app toggle, type rule         | `components/ThreadNotificationCoordinator.tsx`                                              |
| Chat needs your answer       | Thread waits for input                     | Same                                         | "Chat needs your answer" + chat name        | Input      | Auto                                         | Same                                   | Same                                                                                        |
| Chat needs permission        | Approval request                           | Same                                         | "Chat needs permission" + chat name         | Input      | Auto                                         | Same                                   | Same                                                                                        |
| Chat failed, usage limit     | Run fails, or limit reached                | Same                                         | "Chat failed", "Usage limit reached"        | Input      | Auto                                         | Same                                   | Same                                                                                        |
| Delegated task finished      | Child thread ends                          | Feed event (was also toast)                  | "Delegated task finished"                   | None now   | None now                                     | Type rule                              | `notificationRules.ts`                                                                      |
| Script and automation events | `Send-Notification.ps1` writes a feed line | Feed event, toast on failure and needs_you   | Script title, up to 80 characters           | Input      | Auto                                         | Type rule                              | `apps/server/src/events/feedFile.ts`                                                        |
| Task ledger, AIOS changes    | `task.worked`, `aios.changed`              | Inbox only                                   | Task or change name                         | None       | n/a                                          | Type rule                              | `apps/server/src/taskBoard/TaskLedger.ts`, `events/AiosChangeLog.ts`                        |
| Review guide result          | PR guide run ends                          | Toast, system alert, sound (no feed event)   | "Review guide ready", "Review guide failed" | Yes        | Auto                                         | Mode only                              | `components/pullRequest/guide/PullRequestGuideRunCoordinator.tsx`                           |
| Provider update available    | Launch, new version                        | Toast (was sticky), sidebar pill             | "AI service updates ready"                  | None       | Auto 15 s (was sticky)                       | Provider update checks                 | `components/ProviderUpdateLaunchNotification.tsx`                                           |
| Provider update progress     | User clicks Update                         | Toast                                        | Progress and result                         | None       | Sticky until result                          | None                                   | `components/ProviderUpdatePrimaryNotification.tsx`                                          |
| App update                   | Manual check, launch notice                | Toast                                        | "You're up to date", error                  | None       | Auto                                         | None                                   | `components/desktopUpdate.toast.tsx`, `sidebar/updateEverythingRun.tsx`                     |
| Slow requests, host freeze   | Server slow, host stalls                   | Toast                                        | "Some requests are slow"                    | None       | Sticky (slow requests)                       | None                                   | `SlowRpcRequestToastCoordinator.tsx`, `HostFreezeToastCoordinator.tsx`                      |
| Error toasts                 | Failed user action                         | Toast with one action                        | Title and reason from `userErrorToast.ts`   | None       | Auto                                         | None                                   | `lib/userErrorToast.ts` and 326 call sites                                                  |
| Success toasts               | Saved, copied, done                        | Toast                                        | Short result                                | None       | Auto                                         | None                                   | 109 call sites                                                                              |
| Task celebration             | Task completed                             | Toast, 2.5 s                                 | Celebration line                            | None       | Auto 2.5 s                                   | None                                   | `components/taskCelebration/TaskCelebrationCoordinator.tsx`                                 |
| Context handoff nudge        | Chat grows long                            | Toast                                        | "Move to a new chat"                        | None       | Sticky                                       | None                                   | `components/chat/ContextHandoffNudge.tsx`                                                   |
| Usage warning                | Usage reaches the set percent              | Inline banner above the composer             | Percent used                                | None       | Stays while true                             | Usage warning                          | `components/chat/QuotaPreflightBanner.tsx`                                                  |
| Desktop badge                | System alert queue                         | Windows overlay icon, favicon                | Count                                       | None       | Clears on focus                              | Mode (needs system alerts)             | `apps/desktop/src/ipc/methods/notificationBadge.ts`                                         |
| Mobile push                  | Thread state change                        | Push through the cloud relay                 | Server text                                 | Yes        | n/a                                          | Phone settings                         | `apps/server/src/relay/AgentAwarenessRelay.ts`, `apps/mobile/src/features/agent-awareness/` |
| Voice announcements          | Scripts call `Send-VoiceAnnouncement.ps1`  | Speech                                       | One spoken line                             | Speech     | Rate limit: 1 line per 10 minutes per source | Voice daemon, `voice_interval_minutes` | AIOS `scripts/Send-VoiceAnnouncement.ps1`                                                   |
| Windows toast skill          | `Send-TaskToast.ps1`                       | Windows Action Center                        | Title and message                           | Preset     | Auto                                         | None                                   | AIOS `scripts/Send-TaskToast.ps1` (no script calls it)                                      |

Toast call sites in `apps/web/src`: 532 new toasts and 24 updates. Types: error 326, success 109 (after), warning 43, info 41, loading 6.

## 3. Duplicate map

Mark: **x** means the event fired on more than one channel for one cause. Fixed means this change gives one channel.

| Event                          | Channels before                                                                                 | Duplicate | After                                                                       |
| ------------------------------ | ----------------------------------------------------------------------------------------------- | --------- | --------------------------------------------------------------------------- |
| Turn done on a viewed chat     | Sound (always), no toast                                                                        | **x**     | Nothing. The chat is on screen.                                             |
| Turn done on another chat      | Feed row, toast, sound, push to phone                                                           | **x**     | Feed row, one toast, one sound. Phone push stays (see section 9).           |
| Turn done, window hidden       | Feed row, system alert, sound, badge, push                                                      | **x**     | Same set. Sound and alert are one pair for one hidden window.               |
| Delegated task finished        | Toast for the child, toast for the parent                                                       | **x**     | Inbox row for the child. The parent toast is the only pop-up.               |
| Input or approval needed       | Feed row, toast, sound, push                                                                    | **x**     | One toast per type. A second chat replaces the toast and adds "and 1 more". |
| Same failure repeats           | One toast, one sound, one inbox row per script run (271 "AIOS Sync Failing" events in 2 months) | **x**     | One row with a count per hour. One toast per hour.                          |
| Review guide result            | Sound and system alert during quiet hours, volume ignored                                       | **x**     | Quiet hours and volume apply.                                               |
| Update ready                   | Sticky toast, sidebar pill                                                                      | **x**     | Pill stays. Toast leaves after 15 seconds.                                  |
| Error with a raw message       | Toast with raw text, console                                                                    | no        | Short reason in the toast. Raw error goes to the console.                   |
| PR or git result               | One toast that updates its own state                                                            | no        | No change.                                                                  |
| Scribe                         | Toast in settings, voice line                                                                   | no        | No change. Different events.                                                |
| Scheduled task                 | Run result row, toast from the prompt (health runs send "one toast" and one per large issue)    | **x**     | Prompts live in the AIOS. See section 6.                                    |
| Voice and feed from one script | `Audit-ColdReality.ps1` and `Run-DailyBriefing.ps1` send a feed event and a spoken line         | **x**     | AIOS scripts. See section 6.                                                |

## 4. Verdicts

| Source                                | Verdict                    | Reason                                      |
| ------------------------------------- | -------------------------- | ------------------------------------------- |
| Chat needs answer, permission, failed | Keep                       | The user must act.                          |
| Chat finished (2 minutes or more)     | Keep                       | The user is away from that chat.            |
| Sound on a viewed chat                | Delete                     | The user already sees the chat.             |
| Delegated task finished               | Demote to inbox            | The parent chat reports the result.         |
| Repeat script events                  | Merge                      | One cause needs one alert per hour.         |
| Toast stack of one type               | Merge                      | A new toast replaces the old one.           |
| Review guide quiet hours              | Merge into the chat rules  | Quiet hours must apply to every sound.      |
| Provider update launch toast          | Demote to badge (the pill) | The pill stays until the update is done.    |
| "File deleted", "Chat deleted"        | Delete                     | The row is gone from the screen.            |
| "Organized N tasks"                   | Delete                     | The board shows the result.                 |
| "Deleted action"                      | Delete                     | The action leaves the list.                 |
| "Imported N chats" (setup)            | Keep                       | One-time setup result with no other trace.  |
| "Undo" toasts (mark all done)         | Keep                       | The toast holds the only way back.          |
| Task celebration                      | Keep                       | A short reward. Auto-dismiss after 2.5 s.   |
| Slow requests, host freeze            | Keep                       | The user needs to know why the app is slow. |
| Usage warning banner                  | Keep                       | It is inline, not a toast.                  |
| `Send-TaskToast.ps1`                  | Delete (follow-up card)    | No script calls it.                         |
| "Stretch Break" reminders             | Demote to Off for Jake     | 659 inbox rows in November. See section 6.  |

## 5. What this change does

- Server: events with no `dedupe` key now fold by source, type, title and target (`feedFile.ts`). A repeat inside 1 hour raises the count and never raises a new toast.
- Focus rule: a viewed chat raises no toast, sound or system alert (`ThreadNotificationCoordinator.tsx`).
- Snooze: a snoozed chat raises no pop-up. Its events stay in the inbox.
- Merge: one toast per event type. A repeat replaces it and adds "and N more" (`addReplacingToast` in `ui/replacingToast.ts`).
- Defaults: a finished delegated task goes to the inbox (`notificationRules.ts`).
- Copy: chat titles read "Chat finished", "Chat needs your answer", "Chat needs permission". The body is one line of 80 characters or fewer.
- Review guide: quiet hours and volume apply. The failure toast no longer shows raw text.
- Update toast: the provider update toast leaves after 15 seconds.
- Success toasts: four deleted (see section 4). Fifteen error, warning and info toasts rewritten to the copy standard.

## 6. Scope A: Jake's setup

Read only. Sources: `leo_environment_read`, `leo_list_scheduled_tasks`, `leo_thread_list`, `.claude/settings.json`, and the event log. No write to `~/.t3/userdata`.

Event log, October and November: 10,912 events. By level: 8,671 info, 1,364 needs_you, 877 failed.

| Running item                                             | Notifies today                                                                                     | Should notify                                                         | Change                                                                                                        |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Chats (5 running, 3 provider accounts)                   | Toast, sound, system alert for each chat state change. 1,005 finished, 526 needs input in November | Needs answer, permission, failure. Finished only for chats not viewed | Done in this change (focus rule, snooze, merge)                                                               |
| Delegated subagents                                      | 53 "Delegated task finished" toasts in November                                                    | Inbox only                                                            | Done: default rule changed                                                                                    |
| Watchdog (`Watch-AiosDaemons.ps1`)                       | 207 "VoiceDaemon Circuit Breaker Tripped", 124 "ActivityWatch Restart Failed"                      | One alert per hour per failure                                        | Done: fold by title. Follow-up: stop the watchdog from re-sending while the breaker is open                   |
| AIOS sync                                                | 271 "AIOS Sync Failing"                                                                            | One alert per hour                                                    | Done: fold. Follow-up card: fix the sync                                                                      |
| Movement reminder (`Send-MovementReminder.ps1`)          | 659 "Stretch Break" inbox rows in November                                                         | Nothing in the inbox                                                  | Jake sets type `health.info` to Off in Inbox, Rules. The app cannot write his settings                        |
| Weekly health scheduled tasks (3 enabled)                | Prompts say "send one toast" and "toast for every large issue"                                     | One digest event per week                                             | AIOS prompts: replace per-issue toasts with the digest. Follow-up card                                        |
| Scheduled tasks (2 disabled: perf agent, hourly latency) | None                                                                                               | None                                                                  | No change                                                                                                     |
| Watched pull requests                                    | None active in this project. PR 38 is linked to a chat                                             | Merge or check failure only                                           | No change                                                                                                     |
| Scribe                                                   | Toasts in settings, voice lines                                                                    | Failure only                                                          | No change                                                                                                     |
| Voice announcements                                      | 7 scripts speak. Daemon limit is 1 line per 10 minutes per source                                  | Approval, blocking question, failure                                  | `Audit-ColdReality.ps1` and `Run-DailyBriefing.ps1` also write a feed event. Keep one channel. Follow-up card |
| Windows toast skill                                      | No caller                                                                                          | None                                                                  | Remove `Send-TaskToast.ps1` in a follow-up card                                                               |
| Hooks in `.claude/settings.json`                         | None notify                                                                                        | None                                                                  | No change                                                                                                     |
| Mobile                                                   | Push for each thread state change through the relay                                                | Same tiers as the desktop                                             | Follow-up: needs desktop presence in the cloud                                                                |
| Desktop badge                                            | Count of open system alerts. Clears on focus                                                       | Same                                                                  | No change                                                                                                     |

Rule for Jake: interrupt only for approval needed, input needed, failure, and "chat finished" on a chat he does not view. Everything else goes to the inbox or the badge.

## 7. Scope B: all users

### Channels

| Channel      | Shows when                                                                                | Why                                                  |
| ------------ | ----------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Toast        | The window shows, the chat is not on screen, In-app is on                                 | The user is here and can act at once                 |
| System alert | The window is hidden, Mode includes notifications, permission granted, not in quiet hours | The user is away                                     |
| Sound        | An alert shows (toast or system alert), Mode includes sound, not in quiet hours           | One sound for one alert                              |
| Badge        | System alerts wait in the queue                                                           | A glance shows that something waits. Clears on focus |
| Inbox        | Always, unless the type is Off                                                            | One place for every event                            |
| Mobile push  | A phone is paired and the app is in the background                                        | The user is away from the desktop                    |

### Controls

| Control                         | Exists                  | Where                                            |
| ------------------------------- | ----------------------- | ------------------------------------------------ |
| Mode (off, alerts, sound, both) | Yes                     | Settings, Notifications                          |
| In-app toast on or off          | Yes                     | Settings, Notifications                          |
| Quiet hours                     | Yes                     | Settings, Notifications                          |
| Volume                          | Yes                     | Settings, Notifications                          |
| Per event type                  | Yes                     | Inbox, Rules (Toast, Inbox only, Off)            |
| Per chat                        | Added                   | Snooze the chat. A snoozed chat raises no pop-up |
| Usage warning percent           | Yes                     | Settings, Notifications                          |
| Minimum run time for "finished" | No (fixed at 2 minutes) | Follow-up only if the noise returns              |
| Mute badge only                 | No                      | Not needed after the focus rule                  |

### Defaults for a new user

Today a new user gets `notificationMode: "off"` and `inAppNotificationsEnabled: false`. The coordinator does not run. This is low noise and has no duplicates, but a new user never learns that a chat needs an approval. The change keeps this default, because a new default would also apply to every existing user who never set it. A follow-up card proposes a migration that turns In-app on for "needs you" events only.

### Focus rule

A window the user looks at must not raise a system alert or a sound for the same event.

- Viewed chat and visible window: no toast, no sound, no system alert.
- Hidden window: one system alert and one sound.
- Visible window, other chat: one toast and one sound.
- The review guide follows the same quiet hours and volume.

## 8. Toast counts

Measured by `count_toasts.py` (a scratch script). Template parts such as `${name}` count as 10 characters. Only literal text is measured. 125 toasts have a dynamic title and are not measured.

| Measure                                   | Before | After |
| ----------------------------------------- | ------ | ----- |
| New toast call sites                      | 537    | 532   |
| All call sites (new and update)           | 561    | 556   |
| Success toasts                            | 113    | 109   |
| Sticky toasts (`timeout: 0`)              | 14     | 13    |
| Titles over 60 characters                 | 5      | 0     |
| Bodies of 100 characters or more          | 5      | 0     |
| Toasts that break the title or body limit | 10     | 0     |

## 9. Not changed, and why

- Mobile push still runs in parallel with a desktop toast. The server does not know if the user looks at the desktop. A fix needs desktop presence in the cloud relay.
- New-user defaults stay silent. See section 7.
- 124 toasts have a dynamic title. A runtime check needs a toast manager hook. Not added to keep the diff small.
- `ThreadNotificationCoordinator.browser.test.tsx` lists old titles ("Approval needed", "Thread failed"). They already differ from the shipped titles. The browser test run is not in the scoped set.
- AIOS scripts and prompts (health prompts, watchdog, movement reminder) are Jake's files. They need a separate card.

## 10. Follow-up cards

1. AIOS: replace per-issue toasts in the weekly health prompts with one digest event.
2. AIOS: stop `Watch-AiosDaemons.ps1` from re-sending while a breaker is open. Fix `AIOS Sync Failing`.
3. AIOS: one channel (voice or feed) in `Audit-ColdReality.ps1` and `Run-DailyBriefing.ps1`. Remove `Send-TaskToast.ps1`.
4. App: migrate In-app toasts to on for "needs you" events only.
5. Cloud: send desktop presence to the relay so a phone push waits while the desktop is in focus.

## 11. Verification

See the task card for the proof receipt and the performance-gate verdict.
