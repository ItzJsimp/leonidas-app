# Catch-up: Leonidas patch inventory (research, 2026-11-08)

Scope: `ChatView.tsx`, `chat/ChatComposer.tsx`, `chat/MessagesTimeline.tsx`, `Sidebar.tsx` and the files Batch 15 moved out of them. Source: 173 non-merge commits that touched the four files between `8d199b4f7b` and `origin/main` (list: `C:/lcw/_scratch-b15/research/commits.txt`). "Lines" = lines added plus deleted by those commits in the four files (a rough size; a cherry-picked twin counts once per commit). The four tests (grill Q7): **L** Leonidas-only feature, **P** protected surface (Settings pages and plain-word copy, sidebar structure, accent color, branding), **B** fixes a bug T3 Code still has, **F** measured faster or lighter. `y` yes, `n` no, `?` unknown. Only tagged, not decided.

Not counted: the 4 Batch 15 move commits (`a208c58c90`, `8a400ba523`, `62e996231f`, `8ed6e1a63b`, 9,000 lines) are moves of the features below.

| # | Feature | Lines | Commits (first) | T3 Code counterpart | L | P | B | F |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Sidebar rail: project rail, timeline groups, View menu, one Archive, footer, project icons | 1,359+ | `4bbad41040`, `946a11e913`, `bcee68ef1a` | Sidebar with project list | n | y | n | n |
| 2 | Plain words copy ("say it in plain words", parts 5 to 7, Leonidas and Chat names) | 740+ | `64d1a17ca8`, `6558fb1e48`, `441b95d3d7` | none | n | y | n | n |
| 3 | Activity bar, Activity panel, jump to tool row, background commands | 600+ | `e438f60e46`, `2af8257bf8`, `3f15968dfd` | none | y | n | n | n |
| 4 | Composer approvals and sends (decline and redirect) | 340 | `b172acfe41` | upstream port | n | n | ? | n |
| 5 | Answer blocks (`leo:choices`), question card note and Skip, reply Dock | 380+ | `09bd76699b`, `74f64a8958`, `5e5fd99ddd` | question card | y | n | ? | n |
| 6 | Usage: one usage card, context ring, 5-hour meter, cache status, token counter, limits popover | 330+ | `a1cfcfcbd8`, `878bba635f`, `9be81dfe38` | none | y | n | n | n |
| 7 | Autorouter, model picker with traits and effort, benchmarks, failover | 450+ | `a3ac33215f`, `4244afc666`, `a8c647e0b0`, `fc762cac39` | model picker | y | n | n | n |
| 8 | Quota preflight, handoff nudge (45 percent, turn 30), saved handoff | 260+ | `1562605fdd`, `a198a39e25`, `17ff6102b3` | none | y | n | n | n |
| 9 | Composer render and tap speed (`perf`: stop re-renders, Send paints first) | 400+ | `00a9132e8d`, `ae89deded4`, `cec8b435e9`, `57a192ecc1` | partly (hooks) | n | n | ? | ? |
| 10 | Composer dock: button bar, Skills library, Suggest or Auto-pick skills, mid-message skills | 330+ | `deaedbda91`, `78074322df`, `72a6b4b617` | slash menu | y | n | n | n |
| 11 | Reply style per chat and project, style chip | 100+ | `f0de006110` and others | none | y | n | n | n |
| 12 | Subagents: attach, `@name` route, chip | 140+ | `cee59b8545`, `21ccd09778`, `91886bf81f` | none | y | n | n | n |
| 13 | Rewind to here, rollback mirror, offer saved history for Undo | 160+ | `e7ee185be1`, `5a103bdab7` | rollback | n | n | ? | n |
| 14 | Goals loop and goal tabs (server plus banner) | 130+ | `7437c1bbb8`, `237424e810` | none | y | n | n | n |
| 15 | Sidebar status: needs-you, Done, check or amber dot, cache warmth, worker rollup, hover token totals | 200+ | `2f1eb332eb`, `45bef73dfc` | none | y | y | n | n |
| 16 | Touch and phone: long-press menu, swipe to archive, 44 px targets, phone header | 150+ | `dfe1bee53f`, `e7095f6fea` | partial | n | n | ? | n |
| 17 | Notepad, quick capture, inbox, saved items, Review old chats | 150+ | `25f9ddda6a`, `83dfc93e8e` | none | y | n | n | n |
| 18 | Voice dictation, Snip button, attach SVG and pasted images, inline audio | 200+ | `6528b9c958`, `625a9f0caa`, `ef1ca7ada9`, `30af9079aa` | partial | y | n | ? | n |
| 19 | Split-view chats, drag to snap, layout presets | 30+ | one commit | none | y | n | n | n |
| 20 | Workspace isolation (L3), AIOS workspace switcher | 100+ | `9b8fef54dc`, `86b19623d3` | none | y | n | y | n |
| 21 | Upstream ports already taken (multi-project filter #25284, snooze #26208, styling #25251, #25869, chips) | 450+ | `e654bd80e1`, `e9283ee33b`, `65ed39281e` | same code | n | n | n | n |
| 22 | Per-turn labels (model, effort, account), model switch notes | 100+ | `b09a09e707` | #28995 | y | n | n | n |
| 23 | Plain errors with one recovery action, Sign in button, offline banner | 130+ | `3dc42a2e84`, `19e76c8af6` | none | y | y | n | n |
| 24 | Accessibility pass, shortcuts in tooltips and palette | 100+ | `13ad6c706b`, "second accessibility pass" | none | n | y | ? | n |
| 25 | Community, onboarding, tours, feedback dialog (hidden), Mob update test | 80+ | `77fba73061`, `55dc6d38fb` | none | y | n | n | n |

Tail: about 100 other commits under 23 lines each (title regeneration, rebrand, small fixes). They fall under rows 2, 15, 23 or 24 in most cases.

## Counts

- 25 features. **At least one test passes: 20** (rows 1 to 3, 5 to 8, 10 to 12, 14, 15, 17 to 20, 22 to 25 by L, P or B=y).
- **None pass: 5** (rows 4, 9, 13, 16, 21). Row 21 is upstream code and needs no patch. Rows 4, 9, 13 and 16 are `?`: they need a check against the T3 Code file at each stage (B or F).
- No row has `F = y`. No performance claim in these commits has a before and after number. Row 9 is the only one that can claim F, and it needs a measure.
- The 4 Batch 15 moves already put the biggest feature bodies (sidebar rows, timeline rows, composer parts, terminal) in Leonidas-owned files. What stays inside the four upstream files is the wiring (hooks, props, slots) of rows 3 to 16.

## Not done

I did not read each hunk. Sizes come from commit totals, not per-hunk counts. The line counts are upper bounds for a feature because a commit can mix features. Run `git log --follow` on the moved files for exact numbers when a stage conflicts.
