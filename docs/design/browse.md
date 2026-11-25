# Browse: long list plus detail

This spec adds to the [design standard](../../DESIGN.md).

One shared component serves every tab that is a long list with a detail pane. It is a target: no shared component exists yet. The first screen that needs it builds it here. Do not copy a list layout from another screen.

| Part           | Spec                                                                                             |
| -------------- | ------------------------------------------------------------------------------------------------ |
| Search         | One field at the top. It filters as you type. `/` focuses it                                     |
| Filter chips   | One row under search. Multi-select, with a clear button                                          |
| Group          | Optional group headers with counts, for example by month or type                                 |
| Sort           | One menu: newest, oldest, name, most used                                                        |
| List           | Dense rows: title, one muted line, a time or count on the right. Up and down keys move selection |
| Preview        | The right pane shows the selected item and its actions                                           |
| Nothing picked | A summary: totals, newest items and one suggested action. Never a blank pane                     |
| States         | Skeleton rows, an empty state with one action, an error with retry                               |
| Narrow         | Under 1024 px the preview opens over the list, with a back button                                |
