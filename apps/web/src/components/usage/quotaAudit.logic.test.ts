import type { ChatQuotaReport, ProviderInstanceId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { buildQuotaRows, quotaRangeFor } from "./quotaAudit.logic";

const chat = (
  threadId: string,
  instance: string,
  five: [number, number],
  week: [number, number],
) => ({
  threadId,
  providerInstanceId: instance as ProviderInstanceId,
  fiveHour: { points: five[0], sharedPoints: five[1] },
  weekly: { points: week[0], sharedPoints: week[1] },
  firstAt: "2026-11-12T01:00:00.000Z",
  lastAt: "2026-11-13T01:00:00.000Z",
});
const lookups = {
  threads: new Map([["t1", { title: "Token audit", projectId: "p1" }]]),
  projects: new Map([["p1", "Leonidas AIOS"]]),
  accounts: new Map([["claudeAgent_justine", { name: "Claude (Justine)", plan: "Pro" }]]),
};

describe("buildQuotaRows", () => {
  it("joins titles, projects and accounts, ranks by weekly points and flags shared ones", () => {
    const report: ChatQuotaReport = {
      coverageStart: "2026-11-05T22:12:00.000Z",
      chats: [
        chat("t2", "claudeAgent_x", [60, 0], [3, 0]),
        chat("t1", "claudeAgent_justine", [168.4, 20], [11.2, 0]),
        chat("t3", "claudeAgent_justine", [0, 0], [0, 0]),
      ],
    };
    const rows = buildQuotaRows(report, lookups);
    expect(rows.map((row) => row.key)).toEqual(["claudeAgent_justine:t1", "claudeAgent_x:t2"]);
    expect(rows[0]).toMatchObject({
      title: "Token audit",
      projectName: "Leonidas AIOS",
      accountName: "Claude (Justine)",
      plan: "Pro",
      fiveHour: 168,
      weekly: 11,
      shared: true,
    });
    expect(rows[1]).toMatchObject({
      title: "Chat no longer in the list",
      projectName: null,
      accountName: "claudeAgent_x",
      plan: null,
      shared: false,
    });
  });
});

describe("quotaRangeFor", () => {
  it("keeps the three quota ranges and falls back to a week", () => {
    expect(quotaRangeFor("24h").days).toBe(1);
    expect(quotaRangeFor("30d").days).toBe(30);
    expect(quotaRangeFor("90d").days).toBe(7);
    expect(quotaRangeFor("15m").days).toBe(7);
  });
});
