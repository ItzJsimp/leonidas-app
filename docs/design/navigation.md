# Navigation

This spec adds to the [design standard](../../DESIGN.md).

The rail is the only app navigation. It groups tabs by job, and each tab has one job. [`railItems.ts`](../../apps/web/src/components/twoState/railItems.ts) is the source. The [drift test](../../apps/web/src/designStandard.test.ts) compares these tables with it, so change both together.

## Personal and business rail

| Group    | Id             | Label          | Short   | Its one job                              |
| -------- | -------------- | -------------- | ------- | ---------------------------------------- |
| home     | chat           | Leonidas Chat  | Chat    | Talk with Leonidas and run agents        |
| home     | command-center | Command Center | Command | See what needs you, jump anywhere        |
| work     | today          | Today          |         | Plan and run the day                     |
| work     | inbox          | Notifications  | Alerts  | What changed or needs action             |
| work     | tasks          | Tasks          |         | What to do                               |
| work     | projects       | Projects       |         | Projects and their files                 |
| brain    | memory         | Memory         |         | What Leonidas knows                      |
| brain    | library        | Library        |         | Skills, reply styles and rules           |
| brain    | subagents      | Agents         |         | The agent team and its runs              |
| brain    | automations    | Automations    |         | Everything that runs alone               |
| create   | scribe         | Scribe         |         | Dictation and rewrite                    |
| create   | meetings       | Meetings       |         | Record, read and share calls             |
| create   | images         | Images         |         | Make pictures locally                    |
| create   | files          | Files          |         | Every upload and agent output            |
| business | content        | Marketing      |         | Posts and campaigns                      |
| business | deals          | Content        |         | Deals, scripts and filming               |
| business | team           | Team           |         | Members, roles and areas                 |
| builder  | developer      | Developer      |         | Git, pull requests and terminals         |
| home     | usage          | Usage          |         | Plan use (bottom)                        |
| home     | settings       | Settings       |         | App settings (bottom)                    |

Planned names: Library becomes Skills, and Files becomes Attachments.

## Trading rail

A Trading workspace replaces the personal rail.

| Group | Id                | Label         | Short | Its one job                        |
| ----- | ----------------- | ------------- | ----- | ---------------------------------- |
| trade | trading-dashboard | Dashboard     |       | Trading at a glance                |
| trade | trading-journal   | Journal       |       | Log and review trades              |
| trade | trading-accounts  | Accounts      |       | Evaluation and funded accounts     |
| trade | trading-risk      | Risk          |       | How much you can lose today        |
| trade | trading-money     | Money         |       | Fees, payouts and total cost       |
| learn | trading-library   | Library       |       | Course, pages, cards and resources |
| learn | chat              | Leonidas Chat | Chat  | Talk with Leonidas                 |
| crew  | trading-crew      | Crew          |       | The crew board                     |

## Rules

- The label under an icon is the short name, or else the label. Keep it to one word where it can be.
- Business tabs follow the workspace template. Developer follows the builder flag. Scribe and Meetings show only when the server host can run Scribe.
- **One state, no collapse.** Each tab is an icon with its name under it. The workspace picker is on top. Thin dividers separate groups. Every tab stays visible, with its count.
- **Current page:** `text-primary` on `bg-primary/14`. Other icons are muted and brighten on hover.
- **Bottom:** Usage (a gauge) and Settings show the icon alone. Their names stay in the tooltip and `aria-label`.
- **Long rail:** it scrolls and does not fold. A 3 rem fade marks each edge with hidden rows (a row is 38 px). The picker and the bottom icons stay fixed.
- **Chat panel pins:** the Chat page shows New chat, then pinned tabs. Defaults: Notifications, Tasks, Projects and Agents. A pin never removes a tab from the rail. Pin or unpin by right-click on a rail tab, by Edit tabs in the More menu, or by the unpin button. Chat cannot be pinned.
- **Under 728 px:** the rail is a drawer with names beside the icons and group names. The user cannot set this.
