# Leonidas design standard

This is the design standard for every screen of the Leonidas web app, desktop app and phone web app. Read all of it. Then read the surface spec for the screen that you change.

## Authority

When sources disagree, the first source in this list wins:

1. Jake's newest recorded design pick (a Doop decision or a task card). Update this standard in the same commit.
2. This file.
3. A surface spec. It adds detail and does not weaken this file.
4. The code. Fix the code, or file a task card.

Outside guides (design skills, ReUI rules, the AIOS design system) apply only where this standard is silent.

Each rule has an ID. A tag shows what checks it: `[lint]`, `[test]` or, with no tag, review.

## Scope and sources

The phone design surface is the web app in a phone browser or on the Home Screen. Leonidas ships no native phone app, so `apps/mobile` screens are out of scope.

| Source                          | File                                                                                           |
| ------------------------------- | ---------------------------------------------------------------------------------------------- |
| Color values                    | [`themePalettes.ts`](./packages/shared/src/themePalettes.ts)                                   |
| Type, space, radius, motion     | [`index.css`](./apps/web/src/index.css)                                                        |
| Splash colors per theme         | [`index.html`](./apps/web/index.html), checked by [`themeBoot.test.ts`](./apps/web/src/themeBoot.test.ts) |
| Generated theme CSS             | [`generated-uniwind-themes.css`](./apps/mobile/generated-uniwind-themes.css). After a color change, run `node scripts/generate-uniwind-themes.mts` in `apps/mobile` |
| Approved frames                 | Doop canvas "Leonidas app" (`B6wLKwpAtC`). The `Design system` page holds the theme            |

| Surface spec                                                 | Read it when you change                        |
| ------------------------------------------------------------ | ---------------------------------------------- |
| [Phone](./docs/design/phone.md)                              | Any screen: it holds the phone check           |
| [Navigation](./docs/design/navigation.md)                    | The rail, pins, tabs or tab names              |
| [Browse](./docs/design/browse.md)                            | A long list with a detail pane                 |
| [Chat details panel](./docs/design/chat-details-panel.md)    | The Run, Context and Limits card, or new chat  |
| [Usage Quota tab](./docs/design/usage-quota.md)              | The Quota table                                |

## Principles

- **P1 Quiet surfaces, loud intent.** Surfaces are neutral. Color shows an action or a state.
- **P2 Dense and calm.** Short rows and small type. Weight and surface steps give hierarchy, not boxes.
- **P3 Layout over helper text.** No taglines or secondary labels. If a screen needs them, fix the layout.
- **P4 Reuse first.** Use [`components/ui`](./apps/web/src/components/ui), then [`charts.tsx`](./apps/web/src/components/commandCenter/charts.tsx), then [`twoState`](./apps/web/src/components/twoState). Make a shared component before a one-off. A new ReUI or shadcn item takes Leonidas tokens.
- **P5 Tokens only.** If a value is missing, add a token first.

## Color

Name a color by its role. The app ships several themes, and each theme chooses the hue.

| Role (token file)                 | Classes                                          | Job                                               |
| --------------------------------- | ------------------------------------------------ | ------------------------------------------------- |
| `canvas`, `chrome`, `toolbar`     | `bg-background`                                  | Window floor                                      |
| `sidebar`                         | `bg-sidebar`                                     | Thread list and settings nav                      |
| `surface`                         | `bg-card`                                        | Cards and panels                                  |
| `surfaceRaised`, `surfaceOverlay` | `bg-surface-raised`, `bg-popover`                | Hover, menus, dialogs: one step up per layer      |
| `border`, `input`                 | `border-border`, `border-input`                  | Hairlines and field edges                         |
| `text`, `textMuted`               | `text-foreground`, `text-muted-foreground`       | Body and secondary text                           |
| `messageAction`                   | `bg-primary`, `text-primary`, `border-primary`   | **Act:** send, main button, active tab and rail   |
| `accent`                          | `bg-state`, `text-state-text`, `stroke-state`    | **State:** switch on, checked, progress, Working  |
| `focus`                           | `ring-ring`                                      | Focus ring                                        |
| `error`, `warning`, `update`      | `text-error-foreground`, `bg-warning`, siblings  | Failure, caution, new version                     |
| `series-1`, `series-2`            | `bg-series-1`, `text-series-2`                   | Chart and timeline categories, plus gray          |

The default theme is Leonidas: Graphite (dark) and Linen Sand paper (light). Action is red. State is blue in dark and teal in light.

- **C1 No raw colors** in components. `[lint]`
- **C2 One job per role.** The action color never shows state. A red switch reads as broken. Error is rose, apart from the action red.
- **C3 Text contrast is 4.5:1 or more** for muted, filled-control, error-chip and warning-chip text. `[test]` The same floor applies to all other text. Control edges and icons need 3:1.
- **C4** Small state text uses `text-state-text`, never `text-state`.
- **C5** Color never works alone. Pair it with an icon, word or shape.
- **C6** The sidebar is one visible step from the canvas (1.06:1 or more).
- **C7 Status chips are tinted.** Use the [`Badge`](./apps/web/src/components/ui/badge.tsx) variants `success`, `warning`, `error` and `info`. Never build a tint by hand. A count badge or filter chip keeps its component's look.

## Type

| Token                    | Value                        | Use                                             |
| ------------------------ | ---------------------------- | ----------------------------------------------- |
| `font-sans`              | Geist, then the system stack | All UI text                                     |
| `font-mono`              | Geist Mono                   | Code, IDs, numbers that line up                 |
| `font-display`           | IBM Plex Sans Condensed      | Page titles, section headings, large numbers    |
| `text-5xs` to `text-2xs` | 7 to 11 px                   | Badges, counters, metadata only                 |
| `text-xs`, `text-sm`     | 12 and 14 px                 | Dense rows and body                             |

- Page title: `font-display text-3xl font-bold`. Settings section heading: `font-display text-base font-semibold`. Card title: `text-sm font-semibold`.
- Weights: 400 body, 500 labels and selected items, 600 titles.
- Numbers that update or compare use `tabular-nums`.
- **T1 No typed text size** such as `text-[13px]`. `[lint]`

## Space, radius and layers

- **S1** Use the 4 px grid. Tight inside a group, wider between groups.
- Shared insets: `--sidebar-content-inset`, `--command-content-inset`, `--floating-content-inset`, `--workspace-gutter`.
- Radius: `--radius` (8 px) drives `rounded-sm` to `rounded-3xl`. Controls use `--control-radius`. Inner corners are tighter than outer corners.
- **S2** Use surface steps for depth. Only floating layers cast a shadow. `surface-glass` is for floating overlays.
- **S3** Layers: `z-10` to `z-40` inside a screen, 45 terminal drawer, `--z-sheet` 46, 47 to 49 preview player, 50 and up dialogs and popovers. Add no higher layer.
- **S4** Icons come from `lucide-react`. Use `size-4` in controls, `size-3.5` in dense rows, `size-3` in metadata, `size-5` for large targets.

## Motion

- **M1** Use `duration-micro` (150 ms) for feedback and `duration-entrance` (240 ms) for entrances. No typed duration. `[lint]` `ease-drawer` is for things that slide in.
- **M2** Animate `opacity` and `transform`. Components own their press and loading motion.
- **M3** No motion on actions that a person does many times a day.
- **M4** Honor `prefers-reduced-motion` and the Calm switch. Calm stops non-essential motion, with the chat background dots. The dots ignore the system setting. Calm is not built yet.

## Components and states

- **K1 Buttons:** one filled `bg-primary` button per group. Others are outline or ghost. Pick a `variant` and `size`. Never restyle a `components/ui` item with `className`. `[lint]`
- **K2** A switch that is on and a checked box use `bg-state`. Progress uses `state`, and green only at 100 percent.
- **K3** A selected tab has a `border-primary` underline and `font-medium` text.
- **K4** Every data view has loading, empty, error and long-text states. Controls show hover, pressed, focus, disabled and busy.
- **K5** An empty state teaches and offers one action. An error says what failed and what to do next.
- **K6** Wait under 1 second: show nothing. Up to 10 seconds: skeleton or spinner. Longer: progress.
- **K7** Forms keep visible labels, show an error under its field and keep the input after a failure.
- **K8** Offer undo for a reversible action. Confirm an irreversible one with an alert dialog whose button names the action.
- **K9** A toast reports background results. It is never the only place for an error that needs action.

## Words

- **W1** Plain words and sentence case. A button starts with a verb. A tab name is one word where it fits.
- **W2** Write in ASD-STE100 Simplified Technical English. No em dash.

## Accessibility

- **A1** The keyboard reaches every control, in reading order.
- **A2** Focus shows a 2 px inset ring with `ring-ring`. `[lint]`
- **A3** A target is 24 by 24 px or more. On touch it is 44 px (`touch-hit`).
- **A4** An icon button has an `aria-label` and a `Tooltip`. Never use the native `title` as a tooltip. `[lint]`
- **A5** Announce changed counts in a polite live region.
- **A6** The contrast setting in Appearance keeps working.

## Screen done checklist

- [ ] Create, edit and delete work for anything that the user owns.
- [ ] A list over 20 items has search and filter.
- [ ] A detail pane is never blank.
- [ ] States in K4 work.
- [ ] Screenshots pass at 1920x1080, 1366x768 and 390x844. These sizes replace skill defaults.
- [ ] The [phone check](./docs/design/phone.md) passes.
- [ ] `design-audit` passes, and values come from tokens.

## Design process

- **D1** Jake picks a new surface or a new layout from rendered Doop frames before the build. Compare two directions. Add a third only when asked.
- **D2** Any other change reuses the approved design, passes the checklist and ships. No new pick.
- **D3** Record Jake's words (Doop `save_decision` and the task card). Delete rejected frames.
- Frames are `<Surface> · <state>`. Layers are `<Role> · <label>`.
- The `doop` and `design` skills give the steps and the frame and screenshot limits.

## Checks

| Check                                                                              | Covers                                                         |
| ---------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| [`designStandard.test.ts`](./apps/web/src/designStandard.test.ts)                  | Links, cited tokens, length, rail tables, C3                   |
| [`no-typed-design-values`](./oxlint-plugin-t3code/rules/no-typed-design-values.ts) | M1, T1. Old cases are a baseline that only shrinks             |
| Other lint rules in [`vite.config.ts`](./vite.config.ts)                           | C1, K1, A2, A4                                                 |

Keep this file at 1500 words or fewer. Put screen detail in a surface spec.

## Known gaps

The code does not yet meet these rules. Do not copy them.

- C2: the dark Leonidas error color is red. A task card tracks the rose change.
- C3: muted text on raised surfaces is under 4.5:1 in Ember, Grove, Iris and Ocean.
- C3: field edges in the dark Leonidas theme are under 3:1.
- M4: the Calm switch has a task card.
