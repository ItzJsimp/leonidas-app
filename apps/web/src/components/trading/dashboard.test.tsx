// @vitest-environment jsdom
import type { TradingState } from "@t3tools/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

import { DashboardView } from "./DashboardView";
import {
  accountPreview,
  chartModel,
  formatMoney,
  formatSigned,
  isEmptyLedger,
  journeySteps,
  keyNumbers,
  setupRows,
} from "./dashboard.logic";

// Made-up firm and amounts. Real firm prices and JJ numbers stay in the private pack.
const account = (index: number, room: number | null = 1000 + index) =>
  ({
    id: `a${index}`,
    firm: "Firm A",
    product: "Plan 1",
    size: "50K",
    platform: "Platform",
    last4: String(1000 + index),
    stage: "evaluation",
    closedReason: null,
    balanceChange: 600,
    roomToDrawdown: room,
    profitTarget: 3000,
    winningDays: null,
    bestDayPercent: null,
  }) as const;

const EMPTY: TradingState = {
  accounts: [],
  attempts: [],
  passRate: { passed: 0, finished: 0, rate: null },
  firmFees: 0,
  totalCost: 0,
  payouts: 0,
  netReturn: 0,
  costByCategory: {},
  averageFundedCost: null,
  lowestRoom: null,
  moneyTimeline: [],
  months: [],
  setups: [],
  streaks: { clean: 0, bestClean: 0 },
  journey: "sim",
  issues: [],
};

const day = (n: number) => `2026-03-${String(n).padStart(2, "0")}T12:00:00-07:00`;
const FILLED: TradingState = {
  ...EMPTY,
  accounts: [account(1), account(2)],
  attempts: [
    {
      accountId: "a1",
      via: "purchase",
      fee: 100,
      startedAt: day(1),
      result: "passed",
      endedAt: day(9),
    },
    {
      accountId: "a2",
      via: "purchase",
      fee: 100,
      startedAt: day(2),
      result: "failed",
      endedAt: day(8),
    },
  ],
  passRate: { passed: 1, finished: 2, rate: 0.5 },
  payouts: 800,
  totalCost: 300,
  netReturn: 500,
  averageFundedCost: 200,
  lowestRoom: { accountId: "a1", room: 1001 },
  moneyTimeline: [
    { at: day(1), category: "evaluation", amount: -100, netReturn: -100 },
    { at: day(2), category: "evaluation", amount: -100, netReturn: -200 },
    { at: day(10), category: "payout", amount: 800, netReturn: 500 },
  ],
  setups: [{ setup: "Continuation", trades: 4, wins: 3, pnl: 120 }],
  streaks: { clean: 3, bestClean: 5 },
  journey: "payouts",
};

describe("money format", () => {
  it("shows whole dollars, cents only when present, and a sign on request", () => {
    expect(formatMoney(1240)).toBe("$1,240");
    expect(formatMoney(12.5)).toBe("$12.50");
    expect(formatSigned(468)).toBe("+$468");
    expect(formatSigned(-120)).toBe("-$120");
    expect(formatSigned(0)).toBe("$0");
  });
});

describe("key numbers", () => {
  it("reads every number from the derived state", () => {
    const byId = Object.fromEntries(keyNumbers(FILLED).map((n) => [n.id, n]));
    expect(byId["net-return"]).toMatchObject({ value: "+$500", note: "$800 in, $300 out" });
    expect(byId["pass-rate"]).toMatchObject({ value: "50%", note: "1 of 2 finished Attempts" });
    expect(byId["funded-cost"]!.value).toBe("$200");
    expect(byId["lowest-room"]).toMatchObject({
      value: "$1,001",
      note: "to Drawdown · Plan 1 1001",
    });
    expect(byId["clean-streak"]).toMatchObject({ value: "3 days", note: "Best 5" });
  });

  it("says None yet before any Attempt, instead of 0 percent", () => {
    const byId = Object.fromEntries(keyNumbers(EMPTY).map((n) => [n.id, n]));
    expect(byId["pass-rate"]!.value).toBe("None yet");
    expect(byId["lowest-room"]!.value).toBe("None");
  });
});

describe("Accounts preview", () => {
  it("shows 3 rows and a See all 12 link with 12 accounts, least room first", () => {
    const state = {
      ...FILLED,
      accounts: Array.from({ length: 12 }, (_, i) => account(i + 1, 5000 - i)),
    };
    const preview = accountPreview(state);
    expect(preview.rows).toHaveLength(3);
    expect(preview.rows[0]!.id).toBe("a12");
    expect(preview.total).toBe(12);
    const html = renderToStaticMarkup(<DashboardView state={state} />);
    expect(html).toContain("See all 12");
    expect(html).toContain('href="/trading/accounts"');
  });

  it("has no See all link when every account fits", () => {
    expect(renderToStaticMarkup(<DashboardView state={FILLED} />)).not.toContain("See all");
  });

  it("leaves closed accounts out", () => {
    const state = {
      ...FILLED,
      accounts: [{ ...account(1), closedReason: "drawdown" as const }, account(2)],
    };
    expect(accountPreview(state).rows.map((r) => r.id)).toEqual(["a2"]);
  });
});

describe("empty ledger", () => {
  it("is empty only with no accounts, Attempts or money", () => {
    expect(isEmptyLedger(EMPTY)).toBe(true);
    expect(isEmptyLedger(FILLED)).toBe(false);
  });
});

describe("chart", () => {
  it("draws no line from fewer than two points", () => {
    expect(chartModel(EMPTY, "All").points).toBeNull();
  });

  it("keeps the line in the box, marks the zero line and the biggest Payout", () => {
    const chart = chartModel(FILLED, "All");
    expect(chart.points!.split(" ")).toHaveLength(3);
    expect(chart.axis).toHaveLength(5);
    expect(chart.payoutNote).toBe("Payout +$800 · Mar 10");
    const ys = chart.points!.split(" ").map((p) => Number(p.split(",")[1]));
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...ys)).toBeLessThanOrEqual(180);
    expect(chart.zeroY).toBeGreaterThan(Math.min(...ys));
  });

  it("1M keeps only the last 31 days before the newest entry", () => {
    const old = {
      ...FILLED,
      moneyTimeline: [
        { at: "2025-12-01T12:00:00-07:00", category: "evaluation", amount: -1, netReturn: -1 },
        ...FILLED.moneyTimeline,
      ],
    };
    expect(chartModel(old, "1M").points!.split(" ")).toHaveLength(3);
    expect(chartModel(old, "All").points!.split(" ")).toHaveLength(4);
  });
});

describe("journey and setups", () => {
  it("marks finished steps and counts open, failed and active", () => {
    const steps = Object.fromEntries(journeySteps(FILLED).map((s) => [s.id, s]));
    expect(steps.attempts).toMatchObject({ value: "2", note: "0 open · 1 failed", done: true });
    expect(steps.passed!.done).toBe(true);
    expect(steps.payouts).toMatchObject({ value: "1 · $800", done: true });
    expect(journeySteps(EMPTY).every((s) => !s.done)).toBe(true);
  });

  it("gives each setup its win percent", () => {
    expect(setupRows(FILLED)).toEqual([
      { setup: "Continuation", detail: "4 trades · 75% wins", winPercent: 75 },
    ]);
  });
});

describe("DashboardView copy", () => {
  it("uses glossary words and links no pack or Crew data it does not have", () => {
    const html = renderToStaticMarkup(<DashboardView state={FILLED} />);
    for (const word of [
      "Net return",
      "Pass rate",
      "Firm fees per Funded account",
      "Your journey",
    ]) {
      expect(html).toContain(word);
    }
    expect(html).toContain("No pack linked");
  });
});
