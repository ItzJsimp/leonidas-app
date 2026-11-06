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

| Role (token file)                 | CSS / Tailwind                                     | Job                                                                                           |
| --------------------------------- | -------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `canvas`, `chrome`, `toolbar`     | `bg-background`                                    | The window floor                                                                              |
| `sidebar`                         | `bg-sidebar`                                       | Thread list and settings nav. One visible step above the canvas (1.06:1 or more)              |
| `surface`                         | `bg-card`                                          | Cards and panels                                                                              |
| `surfaceRaised`, `surfaceOverlay` | `bg-surface-raised`, `bg-popover`                  | Hover, menus, dialogs. Step up one level per layer                                            |
| `border`, `input`                 | `border-border`, `border-input`                    | Hairlines and field edges                                                                     |
| `text`, `textMuted`               | `text-foreground`, `text-muted-foreground`         | Body text and secondary text (4.5:1 or more)                                                  |
| `messageAction`                   | `bg-primary`, `text-primary`, `border-primary`     | **Act:** send button, main buttons, active tab underline, active rail icon                    |
| `accent`                          | `bg-state`, `text-state-text`, `stroke-state`      | **State:** switches on, checked boxes, progress rings and bars, Working and Connecting labels |
| `focus`                           | `ring-ring`                                        | Focus outline. Quiet gray, never red or blue                                                  |
| `error*`, `warning*`, `update*`   | `text-error-foreground`, `bg-warning` and siblings | Error rose, warning amber, update blue                                                        |

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

The rail groups tabs by job. Each tab has one job. Today's rail items live in [`railItems.ts`](./apps/web/src/components/twoState/railItems.ts); this table is the target.

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
| Create        | Scribe                          | Dictation, rewrite, meetings                           |
| Create        | Images                          | Make pictures locally                                  |
| Create        | Attachments (was Files)         | Every upload and agent output                          |
| Business only | Team, Marketing, Content        | Business workspace tabs                                |
| Builder only  | Developer                       | Git, pull requests, terminals                          |
| Bottom        | Usage, Settings                 |                                                        |

Labels are one plain word. Business tabs follow the workspace template flag; Developer follows the builder flag.

## Doop workflow

Every visible change goes through Doop before code.

1. **Capture.** The agent imports the live screen into a Doop canvas named `Leonidas <surface>` (one canvas per surface). Frame names: `<surface> · <state>`.
2. **Design.** The agent adds 2 or 3 directions as frames of the real screen with real data, on these tokens. Every layer has a `data-doop-name`.
3. **Jake edits.** Jake looks in the Doop app and picks, edits or asks in plain words. The agent changes frames until Jake approves one.
4. **Record.** The agent saves Jake's words (Doop `save_decision`, the task card), deletes rejected frames and renames the pick `<surface> · your pick`.
5. **Build.** The agent builds the approved frame with tokens and shared components, never with copied inline styles.
6. **Prove.** `design-audit` passes from fresh screenshots at 3 sizes. The agent replaces the pick frame with a capture of the built screen.

How-to for each step: the `doop` and `design-build` skills.
