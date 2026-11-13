import type { ChatQuota, ProviderInstanceId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { chatQuotaLineFor, formatQuotaPoints } from "./chatQuotaLine.logic";

const id = (value: string) => value as ProviderInstanceId;
const account = (providerInstanceId: string, five: [number, number], week: [number, number]) => ({
  providerInstanceId: id(providerInstanceId),
  fiveHour: { points: five[0], sharedPoints: five[1] },
  weekly: { points: week[0], sharedPoints: week[1] },
  lastAt: "2026-11-13T05:00:00.000Z",
});
const quota = (...accounts: ChatQuota["accounts"][number][]): ChatQuota => ({
  coverageStart: "2026-11-13T01:00:00.000Z",
  accounts,
});

describe("formatQuotaPoints", () => {
  it("rounds, marks traces and hides none", () => {
    expect(formatQuotaPoints(37.6)).toBe("38");
    expect(formatQuotaPoints(0.4)).toBe("<1");
    expect(formatQuotaPoints(0)).toBeNull();
    expect(formatQuotaPoints(Number.NaN)).toBeNull();
  });
});

describe("chatQuotaLineFor", () => {
  it("shows the account the chat runs on and flags shared points", () => {
    const data = quota(
      account("claudeAgent", [10, 0], [1, 0]),
      account("claudeAgent_bird", [38, 6], [4, 0]),
    );
    expect(chatQuotaLineFor(data, id("claudeAgent_bird"))).toEqual({
      fiveHour: "38",
      weekly: "4",
      shared: true,
    });
    expect(chatQuotaLineFor(data, id("claudeAgent"))?.shared).toBe(false);
  });

  it("hides the line with no data, no matching account or no points", () => {
    expect(chatQuotaLineFor(null, id("claudeAgent"))).toBeNull();
    expect(chatQuotaLineFor(quota(account("claudeAgent", [5, 0], [0, 0])), id("codex"))).toBeNull();
    expect(
      chatQuotaLineFor(quota(account("claudeAgent", [0, 0], [0, 0])), id("claudeAgent")),
    ).toBeNull();
    expect(chatQuotaLineFor(quota(account("claudeAgent", [5, 0], [0, 0])), null)).toBeNull();
  });
});
