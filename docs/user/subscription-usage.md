# Estimate subscription token capacity

Open the composer usage panel to see each connected account's plan, session and weekly usage, reset times, and token capacity estimates. The Usage page account details show the same estimates; token category breakdowns remain in the usage report.

Calibration starts automatically when Leonidas observes an identified account with quota windows. It pairs changes in the provider's used percentage with recorded local transcript tokens, and waits for at least five percentage points of paired usage. For example, 50,000 tokens recorded while usage increases from 20% to 30% projects about 500,000 tokens at 100%. Starting at 20% does not count earlier usage.

These are approximate local token equivalents for your observed workload, not a fixed token entitlement. Model mix, caching, quota rounding, other machines, and provider website usage can change the result. Cached input is included; reasoning already included in output is counted once. The remaining-token figure uses the same observed ratio.

Measurements survive a server restart. Account, plan, transcript-home and quota-reset changes start a new calibration. Missing telemetry, shared transcript homes, expired windows and model-specific quotas cannot produce an estimate. Claude and Codex have supported local transcript readers; other subscriptions keep their reported quota bars without a token estimate until reliable correlation is available.

An installed version starts collecting after it includes this feature. It cannot reconstruct historical plan percentages from token transcripts alone.
