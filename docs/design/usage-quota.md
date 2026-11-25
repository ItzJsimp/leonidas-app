# Usage Quota tab

This spec adds to the [design standard](../../DESIGN.md).

Jake's pick: Doop `9S7bhAMQ5E` (one ranked table of chats). The **Quota** tab follows Cost, Text used and Limits on the Usage page. It has no shortcut key.

- **Table:** Chat (title, project), Account (name, plan chip), 5-hour, Weekly and Last active. Sort by weekly points, then 5-hour points. Eight rows show first, then "Show all".
- **Units:** both columns are percent of one limit, so a chat that used two 5-hour windows reads 200%. Bars scale to the largest row on screen. Points of different accounts do not add up, and the footnote says so.
- **Shared mark:** a hollow `warning-foreground` ring before a figure means that another chat or device may share the points. Screen readers get "Up to".
- **Range:** only 24h, 7d and 30d work, because readings are kept for 30 days. Other presets are disabled. A saved 90d or short range becomes 7d.
- **Empty and error:** "No quota readings in this period" teaches what creates readings. A failed read says to try Refresh. A chat that the app no longer lists keeps its row as "Chat no longer in the list".
- **Narrow:** the table scrolls sideways inside its card from 44 rem down. The page never scrolls sideways.
