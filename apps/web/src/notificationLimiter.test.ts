import type { FeedEvent } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  BURST_LIMIT,
  BURST_WINDOW_MS,
  makeAlertLimiter,
  SAME_ALERT_COOLDOWN_MS,
} from "./notificationLimiter";

const event = (title: string, dedupe?: string): FeedEvent =>
  ({
    v: 1,
    id: `evt_${title}`,
    ts: "2026-11-26T00:00:00Z",
    level: "failed",
    type: "automation.failed",
    title,
    actor: { kind: "script", name: "Send-Notification.ps1" },
    ...(dedupe === undefined ? {} : { dedupe }),
  }) as FeedEvent;

describe("alert limiter", () => {
  it("alerts once per day for the same failing job", () => {
    let now = 0;
    const limiter = makeAlertLimiter(() => now);
    const poller = event("Mail poller failed", "job:MailPoller");
    expect(limiter.allow(poller)).toBe(true);
    now += 30 * 60_000;
    expect(limiter.allow(poller)).toBe(false);
    now += SAME_ALERT_COOLDOWN_MS;
    expect(limiter.allow(poller)).toBe(true);
  });

  it("caps a burst of different alerts, then recovers", () => {
    let now = 0;
    const limiter = makeAlertLimiter(() => now);
    const results = Array.from({ length: BURST_LIMIT + 2 }, (_, index) =>
      limiter.allow(event(`job ${index}`)),
    );
    expect(results.filter(Boolean)).toHaveLength(BURST_LIMIT);
    now += BURST_WINDOW_MS;
    expect(limiter.allow(event("later job"))).toBe(true);
  });
});
