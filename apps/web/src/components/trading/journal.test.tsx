// @vitest-environment jsdom
import type { TradingAccountView, TradingTradeView } from "@t3tools/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { ImportPromptView } from "./ImportPrompt";
import { JournalView } from "./JournalView";
import { TOPSTEPX_EXPORT_STEPS, importSummary, tradesByDay } from "./journal.logic";

// Made-up firm and trades. Real exports stay on the trader's PC.
const account = (id: string, closed = false) =>
  ({
    id,
    firm: "Firm A",
    product: "Plan 1",
    size: "50K",
    platform: "TopstepX",
    last4: id.slice(-4),
    stage: "evaluation",
    closedReason: closed ? "manual" : null,
    balanceChange: 0,
    roomToDrawdown: null,
    profitTarget: null,
    winningDays: null,
    bestDayPercent: null,
  }) satisfies TradingAccountView;
const trade = (id: string, day: string, time: string, pnl: number): TradingTradeView => ({
  id: `topstepx:${id}`,
  accountId: "acct-0001",
  day,
  at: `${day}T${time}:00-05:00`,
  pnl,
  contract: "MNQZ6",
  side: "long",
  size: 2,
  points: 2.5,
});
const TRADES = [
  trade("1", "2026-11-03", "10:00", 10.1),
  trade("3", "2026-11-04", "10:40", -5),
  trade("2", "2026-11-04", "10:30", 8.2),
];
const FILE = { name: "trades.csv", trades: 2, firstDay: "2026-11-04", lastDay: "2026-11-04" };
const noop = async () => ({ ok: false as const, message: "" });

describe("Journal", () => {
  it("groups trades by day, newest day first, in time order, with whole-cent totals", () => {
    const days = tradesByDay(TRADES);
    expect(days.map((day) => day.day)).toEqual(["2026-11-04", "2026-11-03"]);
    expect(days[0]?.trades.map((item) => item.id)).toEqual(["topstepx:2", "topstepx:3"]);
    expect(days[0]?.pnl).toBe(3.2);
  });

  it("shows each day and trade with net dollars and the account name", () => {
    const html = renderToStaticMarkup(
      <JournalView trades={TRADES} accounts={[account("acct-0001")]} />,
    );
    expect(html).toContain("Nov 4");
    expect(html).toContain("+$3.20");
    expect(html).toContain("Long 2 MNQZ6");
    expect(html).toContain("Firm A Plan 1 50K ·0001");
    expect(html).toContain("How to export from TopstepX");
  });

  it("guides the TopstepX export in 5 steps or fewer", () => {
    expect(TOPSTEPX_EXPORT_STEPS.length).toBeLessThanOrEqual(5);
    const text = TOPSTEPX_EXPORT_STEPS.join(" ");
    for (const part of ["Trades tab", "Export", "date range", "Downloads"]) {
      expect(text).toContain(part);
    }
  });
});

describe("Import prompt", () => {
  it("asks which account, with only open accounts to pick", () => {
    expect(importSummary(FILE)).toBe("2 trades, Nov 4");
    const html = renderToStaticMarkup(
      <ImportPromptView
        file={FILE}
        accounts={[account("acct-0001"), account("acct-0002", true), account("acct-0003")]}
        onImport={noop}
        onNotNow={() => undefined}
      />,
    );
    expect(html).toContain("New TopstepX export");
    expect(html).toContain("2 trades, Nov 4 · trades.csv");
    expect(html).toContain("Which account?");
    expect(html).toContain("Not now");
  });

  it("asks for an account first when none is open", () => {
    const html = renderToStaticMarkup(
      <ImportPromptView
        file={FILE}
        accounts={[account("acct-0002", true)]}
        onImport={noop}
        onNotNow={() => undefined}
      />,
    );
    expect(html).toContain("Add an account, then import this file.");
    expect(html).not.toContain("Which account?");
  });
});
