import type { ServerProviderUsageLimits, ServerProviderUsageWindow } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import { describe, expect, it } from "vite-plus/test";

import { accountHeadroom, accountHeadroomLabel } from "./accountHeadroom";

const NOW = Date.parse("2026-11-19T12:00:00.000Z");
const at = (minutes: number) => DateTime.formatIso(DateTime.makeUnsafe(NOW + minutes * 60_000));
const session = (over: Partial<ServerProviderUsageWindow>): ServerProviderUsageWindow => ({
  id: "session",
  kind: "session",
  label: "5-hour",
  usedPercent: 0,
  windowDurationMins: 300,
  ...over,
});
const weekly = (over: Partial<ServerProviderUsageWindow>): ServerProviderUsageWindow => ({
  id: "weekly",
  kind: "weekly",
  label: "Weekly",
  usedPercent: 0,
  windowDurationMins: 10_080,
  ...over,
});
const limits = (...windows: ServerProviderUsageWindow[]) =>
  ({ checkedAt: at(0), windows }) as ServerProviderUsageLimits;

describe("accountHeadroom", () => {
  it("is null when the provider reports no windows", () => {
    expect(accountHeadroom(undefined, NOW)).toBeNull();
    expect(accountHeadroom(limits(), NOW)).toBeNull();
  });

  it("reads the tightest window", () => {
    const headroom = accountHeadroom(
      limits(
        session({ usedPercent: 30, resetsAt: at(240) }),
        weekly({ usedPercent: 80, resetsAt: at(3000) }),
      ),
      NOW,
    );
    expect(headroom).toMatchObject({
      leftPercent: 20,
      severity: "warning",
      windowLabel: "Weekly limit",
    });
  });

  it("projects the minutes until a window empties at its pace so far", () => {
    // 120 of 300 minutes gone and 50% used: the other 50% lasts 120 more minutes, before the reset.
    const headroom = accountHeadroom(limits(session({ usedPercent: 50, resetsAt: at(180) })), NOW);
    expect(headroom?.minutesToLimit).toBe(120);
  });

  it("gives no minutes when the window resets before it empties", () => {
    const headroom = accountHeadroom(limits(session({ usedPercent: 20, resetsAt: at(180) })), NOW);
    expect(headroom?.minutesToLimit).toBeNull();
    expect(headroom?.leftPercent).toBe(80);
  });

  it("uses the soonest run-out across windows", () => {
    const headroom = accountHeadroom(
      limits(
        session({ usedPercent: 50, resetsAt: at(180) }),
        weekly({ usedPercent: 90, resetsAt: at(5040) }),
      ),
      NOW,
    );
    // Weekly: 5040 of 10080 minutes gone at 90% used, so 560 minutes left; session: 120.
    expect(headroom?.minutesToLimit).toBe(120);
  });

  it("reads a window past its reset as full again", () => {
    const headroom = accountHeadroom(limits(session({ usedPercent: 95, resetsAt: at(-5) })), NOW);
    expect(headroom).toMatchObject({ leftPercent: 100, severity: "normal", minutesToLimit: null });
  });

  it("says the limit is reached at 100% used", () => {
    const headroom = accountHeadroom(limits(session({ usedPercent: 100, resetsAt: at(60) })), NOW);
    expect(headroom?.minutesToLimit).toBe(0);
    expect(accountHeadroomLabel(headroom!)).toBe("0% left in the 5-hour limit, limit reached");
  });
});

describe("accountHeadroomLabel", () => {
  it("names the window and the time left", () => {
    const base = { leftPercent: 62, severity: "normal", windowLabel: "5-hour limit" } as const;
    expect(accountHeadroomLabel({ ...base, minutesToLimit: null })).toBe(
      "62% left in the 5-hour limit",
    );
    expect(accountHeadroomLabel({ ...base, minutesToLimit: 40 })).toBe(
      "62% left in the 5-hour limit, limit in about 40 min",
    );
    expect(accountHeadroomLabel({ ...base, minutesToLimit: 150 })).toBe(
      "62% left in the 5-hour limit, limit in about 2.5 hr",
    );
  });
});
