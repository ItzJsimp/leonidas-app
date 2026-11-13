# Estimate subscription token capacity

Open the composer usage panel to see each connected account's plan, session and weekly usage, reset times, and token capacity estimates. The Usage page account details show the same estimates; token category breakdowns remain in the usage report.

Calibration starts automatically when Leonidas observes an identified account with quota windows. It pairs changes in the provider's used percentage with recorded local transcript tokens, and waits for at least five percentage points of paired usage. For example, 50,000 tokens recorded while usage increases from 20% to 30% projects about 500,000 tokens at 100%. Starting at 20% does not count earlier usage.

These are approximate local token equivalents for your observed workload, not a fixed token entitlement. Model mix, caching, quota rounding, other machines, and provider website usage can change the result. Cached input is included; reasoning already included in output is counted once. The remaining-token figure uses the same observed ratio.

Measurements survive a server restart. Account, plan, transcript-home and quota-reset changes start a new calibration. Missing telemetry, shared transcript homes, expired windows and model-specific quotas cannot produce an estimate. Claude and Codex have supported local transcript readers; other subscriptions keep their reported quota bars without a token estimate until reliable correlation is available.

An installed version starts collecting after it includes this feature. It cannot reconstruct historical plan percentages from token transcripts alone.

## See how much one chat used

For Claude accounts, the Limits section of the chat details shows a line such as "This chat used 38% of 5-hour · 4% of weekly". It is the rise in your plan limit while this chat ran, counted from the first time Leonidas saw your limit move.

When another chat, another device or the Claude website used the same account at the same time, the line says "up to". The real share is then lower than the number shown. These are estimates: the provider does not report limits for each request. A chat with no readings shows no line. Leonidas keeps readings for 30 days and stores only numbers, never message text.

## Audit your quota

Open the Usage page and choose **Quota**. It ranks your chats by the share of your plan limits they used, with the account, the 5-hour and weekly shares, and the last time each chat ran. Use 24h, 7d or 30d to change the period.

A share is a percent of one limit. A chat that used two full 5-hour limits shows 200%. A hollow dot means another chat or device may share the number, so it is a ceiling. Shares of different accounts do not add up. Leonidas counts only from the day it first saw your limit move, and keeps readings for 30 days.
