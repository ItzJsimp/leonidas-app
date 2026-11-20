import type { TradingCrewCard, TradingCrewResult } from "@t3tools/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

import { CrewBoard, CrewSetup } from "./CrewView";
import { CrewPreview } from "./DashboardView";
import { cardRows, sortCards, statusLine, syncedText, validName } from "./crew.logic";

// The tab reads settings and the sync through these hooks. The tests need neither.
vi.mock("./useTradingCrew", () => ({
  useTradingCrewActions: () => ({
    saveSettings: async () => null,
    syncNow: async () => null,
  }),
}));
// The Dashboard card imports a router link. A plain anchor is enough here.
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: unknown; to: string }) => (
    <a href={to}>{children as never}</a>
  ),
}));

// Made-up traders and numbers.
const NOW = Date.parse("2026-03-21T12:00:00Z");
const card = (trader: string, extra: Partial<TradingCrewCard> = {}): TradingCrewCard => ({
  version: 1,
  trader,
  name: trader[0]!.toUpperCase() + trader.slice(1),
  updatedAt: "2026-03-21T11:55:00Z",
  journey: {
    stage: "evaluation",
    passRate: { passed: 1, finished: 4 },
    accounts: { sim: 0, evaluation: 2, funded: 0 },
  },
  habits: { cleanStreak: 3, bestClean: 7, tradingDays: 12 },
  ...extra,
});
const result = (extra: Partial<TradingCrewResult> = {}): TradingCrewResult => ({
  setup: "on",
  self: "ada",
  cards: [card("bo"), card("ada")],
  skippedCards: 0,
  lastSyncAt: "2026-03-21T11:57:00Z",
  status: "synced",
  detail: null,
  ...extra,
});
const SHARE = { journey: true, habits: true, payouts: false, money: false };

describe("crew logic", () => {
  it("says how old the last sync is", () => {
    expect(syncedText(null, NOW)).toBe("Never synced");
    expect(syncedText("2026-03-21T11:59:40Z", NOW)).toBe("Synced just now");
    expect(syncedText("2026-03-21T11:55:00Z", NOW)).toBe("Synced 5 minutes ago");
    expect(syncedText("2026-03-21T09:00:00Z", NOW)).toBe("Synced 3 hours ago");
  });

  it("shows the last sync time with no network", () => {
    const line = statusLine(
      { status: "offline", lastSyncAt: "2026-03-21T11:50:00Z", detail: null },
      NOW,
    );
    expect(line).toEqual({ text: "No network. Synced 10 minutes ago.", problem: true });
    expect(statusLine({ status: "synced", lastSyncAt: null, detail: null }, NOW).problem).toBe(
      false,
    );
  });

  it("puts your own card first and shows only the groups a trader shared", () => {
    expect(sortCards([card("bo"), card("cy"), card("ada")], "ada").map((c) => c.trader)).toEqual([
      "ada",
      "bo",
      "cy",
    ]);
    const labels = cardRows(card("ada")).map((row) => row.label);
    expect(labels).toContain("Clean streak");
    expect(labels).not.toContain("Payouts");
    expect(labels).not.toContain("Net return");
    const shared = cardRows(
      card("ada", { money: { firmFees: 10, totalCost: 20, netReturn: -20 } }),
    );
    expect(shared.map((row) => row.label)).toContain("Net return");
  });

  it("accepts only names the server accepts", () => {
    expect(validName("Ada")).toBe(true);
    expect(validName("  ")).toBe(false);
    expect(validName("!!!")).toBe(false);
    expect(validName("x".repeat(41))).toBe(false);
  });
});

describe("Crew tab", () => {
  it("offline: shows the last sync time and a Retry action", () => {
    const html = renderToStaticMarkup(
      <CrewBoard
        result={result({ status: "offline", lastSyncAt: "2026-03-21T11:50:00Z" })}
        share={SHARE}
        nowMs={NOW}
      />,
    );
    expect(html).toContain("No network. Synced 10 minutes ago.");
    expect(html).toContain(">Retry<");
    expect(html).not.toContain(">Sync now<");
  });

  it("online: shows Sync now and each card, with no dollar rows unless shared", () => {
    const html = renderToStaticMarkup(<CrewBoard result={result()} share={SHARE} nowMs={NOW} />);
    expect(html).toContain(">Sync now<");
    expect(html).toContain("Ada");
    expect(html).toContain("Bo");
    expect(html).not.toContain("Net return");
    expect(html).not.toContain("$");
  });

  it("explains that Payouts and Money are off by default, and what sharing does", () => {
    const html = renderToStaticMarkup(
      <CrewSetup result={{ setup: "off" }} initialName={null} initialShare={SHARE} />,
    );
    expect(html).toContain("Payouts");
    expect(html).toContain("Payouts and Money stay off until you turn them on");
    expect(html).toContain("Start sharing with the Crew");
  });

  it("without a pack, teaches how to link one", () => {
    const html = renderToStaticMarkup(
      <CrewSetup result={{ setup: "no_pack" }} initialName={null} initialShare={SHARE} />,
    );
    expect(html).toContain("Link your pack in Setup");
  });
});

describe("Dashboard Crew preview", () => {
  it("lists clean streaks, yours first, with the sync time", () => {
    const html = renderToStaticMarkup(<CrewPreview crew={result()} />);
    expect(html.indexOf("Ada")).toBeLessThan(html.indexOf("Bo"));
    expect(html).toContain("Synced");
  });

  it("invites you to join before Crew sync is on", () => {
    expect(renderToStaticMarkup(<CrewPreview crew={null} />)).toContain("Join a Crew");
    expect(renderToStaticMarkup(<CrewPreview crew={result({ setup: "off" })} />)).toContain(
      "Join a Crew",
    );
  });
});
