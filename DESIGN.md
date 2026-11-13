# Leonidas design system

Every UI change in this app follows this file. Values live in one token file; this file says how to use them. If this file and the code disagree, fix one of them in the same commit.

- **Token file (color values):** [`packages/shared/src/themePalettes.ts`](./packages/shared/src/themePalettes.ts). Web, mobile and native surfaces read it.
- **Token wiring (type, space, radius, motion, color roles to CSS):** [`apps/web/src/index.css`](./apps/web/src/index.css), `@theme` and `:root` blocks.
- **Boot copy:** [`apps/web/index.html`](./apps/web/index.html) keeps 4 splash colors per built-in theme. [`themeBoot.test.ts`](./apps/web/src/themeBoot.test.ts) fails when they drift from the token file.
- **Generated:** [`apps/mobile/generated-uniwind-themes.css`](./apps/mobile/generated-uniwind-themes.css). Run `node scripts/generate-uniwind-themes.mts` in `apps/mobile` after a token change.
- **Design canvas:** Doop, canvas "Leonidas default theme" (`pNsLpULSWA`) holds the approved default theme.

## Principles

1. **Quiet surfaces, loud intent.** Surfaces are neutral graphite grays. Color appears only where the user acts or where state changes.
2. **One job per color.** Red acts. Blue shows state. Rose means error. Amber means warning. Never reuse a color for another job.
3. **Dense and calm.** Dense lists, short rows, small type. Hierarchy comes from weight and gray steps, not from boxes and shadows.
4. **Tokens only.** No hex, font name, radius or duration typed in a component. If a value is missing, add a token first.
5. **Designed in Doop first.** Jake picks from rendered frames of the real screen. The agent builds only the approved frame.

## Tokens

### Color roles

The default dark theme is **Graphite** (Jake's pick, 2026-11-06): the T3 Original dark values, lifted halfway toward the public "T3 Soft" theme. Light mode keeps Linen Sand paper.

| Role (token file)                  | CSS / Tailwind                                     | Job                                                                                            |
| ---------------------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `canvas`, `chrome`, `toolbar`      | `bg-background`                                    | The window floor                                                                               |
| `sidebar`                          | `bg-sidebar`                                       | Thread list and settings nav. One visible step above the canvas (1.06:1 or more)               |
| `surface`                          | `bg-card`                                          | Cards and panels                                                                               |
| `surfaceRaised`, `surfaceOverlay`  | `bg-surface-raised`, `bg-popover`                  | Hover, menus, dialogs. Step up one level per layer                                             |
| `border`, `input`                  | `border-border`, `border-input`                    | Hairlines and field edges                                                                      |
| `text`, `textMuted`                | `text-foreground`, `text-muted-foreground`         | Body text and secondary text (4.5:1 or more)                                                   |
| `messageAction`                    | `bg-primary`, `text-primary`, `border-primary`     | **Act:** send button, main buttons, active tab underline, active rail icon                     |
| `accent`                           | `bg-state`, `text-state-text`, `stroke-state`      | **State:** switches on, checked boxes, progress rings and bars, Working and Connecting labels  |
| `focus`                            | `ring-ring`                                        | Focus outline. Quiet gray, never red or blue                                                   |
| `series-1`, `series-2` (index.css) | `bg-series-1`, `text-series-2`                     | **Kind:** categories in timelines and charts (teal, violet), plus gray. Pair each with a shape |
| `error*`, `warning*`, `update*`    | `text-error-foreground`, `bg-warning` and siblings | Error rose, warning amber, update blue                                                         |

Rules:

- `text-state-text` is a lighter mix of the state color, so small text stays readable. Never put small text in `text-state`.
- White text on `bg-primary` and `bg-state` must clear 4.5:1. Check with the contrast script in the PR.
- Status chips use a solid fill with white text. Never colored text on a tint (Jake, 2026-11-04).
- Red stays out of state. A red switch reads as "off" or "broken".

### Type

| Token                    | Value                        | Use                             |
| ------------------------ | ---------------------------- | ------------------------------- |
| `font-sans`              | Geist, then the system stack | All UI text                     |
| `font-mono`              | Geist Mono                   | Code, IDs, numbers that line up |
| `font-display`           | IBM Plex Sans Condensed      | Large page titles only          |
| `text-5xs` to `text-2xs` | 7 to 11 px                   | Badges, counters, metadata      |
| `text-xs`, `text-sm`     | 12, 14 px                    | Dense rows and body             |
| Tab labels               | 13 px (`WindowHeader.tsx`)   | Window tabs                     |

Weights: 400 body, 500 labels and selected items, 600 titles. Numbers that update or compare use `tabular-nums`.

### Space and radius

- **Space:** 4 px grid (Tailwind spacing). Tight inside a group, wider between groups.
- **Shared insets:** `--sidebar-content-inset`, `--command-content-inset`, `--floating-content-inset`, `--workspace-gutter`.
- **Radius:** `--radius` (8 px) with `rounded-sm` to `rounded-3xl` derived from it. `--control-radius` for controls. Inner corners are tighter than outer corners.

### Motion

- Micro feedback 150 ms, entrances 240 ms, `--ease-drawer` for things that slide in.
- Animate `opacity` and `transform` only. Loading uses the stepped `animate-skeleton`.
- Honor `prefers-reduced-motion` and the Calm switch. No motion on actions done many times a day.

## Component rules

- **Reuse first:** `apps/web/src/components/ui` (button, switch, checkbox, menu, dialog), then `components/commandCenter/charts.tsx` (ProgressBar, Ring, HalfGauge), then `components/twoState` (rail, window header, tabs). Add a new shared component before you add a one-off.
- **Buttons:** one filled `bg-primary` button per group. Others are outline or ghost. Every icon button has an `aria-label` and a tooltip.
- **Switch:** white thumb, `bg-state` track when on, `bg-input` when off.
- **Checkbox:** `bg-state` fill with a `text-state-foreground` check.
- **Progress:** track `muted-foreground/70`, fill `state`, green only at 100 percent.
- **Tabs:** selected tab has a `border-primary` underline and `font-medium` text.
- **Rail:** the current page icon is `text-primary` on `bg-primary/14`. Other icons are muted and turn white on hover.
- **Focus:** a 2 px inset gray ring on every focusable control.
- **Empty and error states:** an empty state teaches and offers one action. An error says what failed and what to do next.

## Tab done checklist

A tab ships only when every line is true. Check each one in the PR.

- [ ] Create, edit and delete work for anything the user owns.
- [ ] Search and filter exist on any list over 20 items.
- [ ] The detail pane never sits empty. It shows a summary or the newest item.
- [ ] The empty state teaches and offers one action.
- [ ] Screenshots pass at 1920x1080 and 1366x768, plus 390 wide when the tab works on phones.
- [ ] Every value comes from tokens. `design-audit` passes.

## Browse component

One shared component for every "long list plus detail" tab: Decisions, Logs, Wiki and Skills. Build it once; never copy the layout.

| Part           | Spec                                                                                                      |
| -------------- | --------------------------------------------------------------------------------------------------------- |
| Search         | One field at the top. Filters as you type. `/` focuses it                                                 |
| Filter chips   | One row under search. Solid chips, multi-select, a clear button                                           |
| Group          | Optional group headers with counts, for example by month or type                                          |
| Sort           | One menu: newest, oldest, name, most used                                                                 |
| List           | Dense rows: title, one muted line, a time or count on the right. Keyboard up and down moves the selection |
| Preview        | The right pane shows the selected item with its actions (open, edit, delete)                              |
| Nothing picked | The preview shows a summary: totals, the newest items and one suggested action. Never a blank pane        |
| States         | Loading skeleton shaped like rows, an empty state with one action, an error with retry                    |
| Narrow         | Under 1024 px the preview opens over the list, with a back button                                         |

## Rail groups

The rail groups tabs by job. Each tab has one job. [`railItems.ts`](./apps/web/src/components/twoState/railItems.ts) gives each item its group, in this order. The renames marked "was" are still targets.

| Group         | Tab                             | Its one job                                            |
| ------------- | ------------------------------- | ------------------------------------------------------ |
| Home          | Command Center                  | See everything at a glance, jump anywhere              |
| Home          | Today                           | Plan and run the day                                   |
| Home          | Notifications                   | What changed or needs action, plus toasts              |
| Work          | Chat                            | Talk with Leonidas and run agents                      |
| Work          | Tasks                           | What to do                                             |
| Work          | Projects                        | Projects and their files. The AIOS is the Home project |
| Brain         | Memory                          | What Leonidas knows (Browse plus brain map)            |
| Brain         | Skills (was Library)            | Open, edit, create and switch skills                   |
| Brain         | Agents (Subagents plus Helpers) | Build your agent team, see every run                   |
| Brain         | Automations                     | See and control everything that runs alone             |
| Create        | Scribe                          | Dictation and rewrite                                  |
| Create        | Meetings                        | Record, read and share calls                           |
| Create        | Images                          | Make pictures locally                                  |
| Create        | Attachments (was Files)         | Every upload and agent output                          |
| Business only | Team, Marketing, Content        | Business workspace tabs                                |
| Builder only  | Developer                       | Git, pull requests, terminals                          |
| Bottom        | Usage, Settings                 |                                                        |

Labels are one plain word. Business tabs follow the workspace template flag; Developer follows the builder flag.

- **Expanded (default):** group names and labels. The header is the workspace picker (picture tile, name, Personal or Business chip) with the collapse icon beside it.
- **Collapsed:** icons only, a thin divider between groups. The workspace picture sits on top, the expand icon under it, then a divider.
- The app remembers the state. Every tab stays visible: a long business rail scrolls, it does not fold. The list fades at each edge that has more rows out of view (3 rem deep, so it reaches into the next row; a row is 38 px). The header and Usage and Settings stay fixed.

## Chat details panel

One card holds **Run**, **Context** and **Limits**, in that order. `Ctrl+Shift+B` (`threadPanel.toggle`) shows or hides it. It opens by default. Decision record: ADR 0100 in the Leonidas AIOS. Doop frames: `dBl8_4S-Tq` (the built 1440 screen) and `eQT4quJsfT` (new chat plus panel at 1280, and the Limits-hidden state).

- **Placement:** the card sits inline at the top right while the chat keeps at least 480 px beside it (`threadDetailsCardLayout.ts`). With less room it becomes a popover that stays closed until the user opens it. A popover may cover the chat, like a menu.
- **One chat axis:** the header title, the timeline and the composer share one centre line, in the space left of the card (`chatCanvasLayout.ts`). At 1024 px with both sidebars open, the header buttons need 224 px, so the title may shift 24 px. That is the designed fallback.
- **Density:** a short card folds Context to one line first, then trims Run. Limits never folds by itself. The user folds it with the chevron, and the choice is saved (`usageOverlayEnabled`). Do not add an automatic Limits fold.
- **Limits ledger:** columns are Account, 5-hour and Weekly. Extra windows are sub-rows under their account. Each row keeps a 24 px slot for the reset chip on the name line, so chips line up in one column. A blue dot marks the account this chat uses, with the text "Active" for screen readers.
- **This chat line:** under the ledger, one muted line reads "This chat used 38% of 5-hour · 4% of weekly" for the account the chat runs on. "up to" shows when another chat or device may share the points. It is hidden when the chat has no readings, and it never folds on its own. It reads the server log in `ChatQuotaLog.ts` through `server.getChatQuota`.
- **Context:** the card shows the model, its effort, a ring and a segmented bar. On a new chat it shows the model the composer will send with, not the project default.
- **Targets and tokens:** icon buttons are at least 24 by 24 px. Status chips use a solid fill. No colored `border-left` thicker than 1 px. No hex in components.
- **New chat hero:** the red helmet at 60 percent, a time-of-day greeting with the project picker, and slow red dots. Jake's pick (Doop `MJ2ukUgbs-`) is dots only, with no haze. The dots have soft edges, show behind every chat (half strength behind an active chat) and always drift: Jake chose that they ignore `prefers-reduced-motion`, the one exception to the motion rule above. The helmet glow is 406 px wide and fades out from the helmet. The question line sits 24 px above the composer.

## Usage Quota tab

Jake's pick: Doop `9S7bhAMQ5E` (A, one ranked table of chats). The **Quota** tab sits after Cost, Text used and Limits on the Usage page. It has no shortcut key.

- **Table:** columns are Chat (title, project), Account (name, plan chip), 5-hour, Weekly and Last active. Rows are sorted by weekly points, then 5-hour points. Eight rows show first, then "Show all".
- **Units:** both columns are percent of one limit, so a chat that used two 5-hour windows reads 200%. Bars scale to the largest row on screen. Points of different accounts do not add up, so the footnote says so.
- **Shared mark:** a hollow `warning-foreground` ring before the figure means another chat or device may share the points. Screen readers get "Up to".
- **Range:** only 24h, 7d and 30d work, because readings are kept 30 days. The other presets are disabled. A saved 90d or short range falls back to 7d.
- **Empty and error:** "No quota readings in this period" teaches what creates readings. A failed read says to try Refresh. A chat the app no longer lists keeps its row as "Chat no longer in the list".
- **Narrow windows:** the table scrolls sideways inside its card from 44 rem down. The page itself never scrolls sideways.

## Doop workflow

Every visible change follows the Doop reference. Reuse an approved frame for small edits.
Follow the [design review limits](.agents/skills/design-build/references/review-budget.md) across all design skills.

1. **Capture.** The agent inspects the live screen and reuses the relevant frame in the "Leonidas app" Doop canvas, on the page for its surface (Composer, Model picker, Command Center). Page 1, "Design system", holds the tokens and the theme. Frames are `<Surface> · <state>` and layers are `<Role> · <label>` (the doop skill, "Naming").
2. **Design.** Reuse the approved frame for a small edit. For an unresolved layout, compare two directions. Add a third only when asked.
3. **Jake chooses when needed.** Existing approval covers an unchanged design. Apply feedback to the same frames and keep review images local.
4. **Record.** The agent saves Jake's words (Doop `save_decision`, the task card), deletes rejected frames and renames the pick `<surface> · your pick`.
5. **Build.** The agent builds the approved frame with tokens and shared components, never with copied inline styles.
6. **Prove.** `design-audit` passes from three local viewport captures. These do not create new Doop frames. Update the chosen frame once with the built screen.

How-to for each step: the `doop` and `design-build` skills.
