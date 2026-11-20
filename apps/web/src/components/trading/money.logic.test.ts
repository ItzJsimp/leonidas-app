import { deriveTradingState, type TradingEvent } from "@t3tools/trading";
import { describe, expect, it } from "vite-plus/test";

import { chartModel } from "./dashboard.logic";
import {
  ALL_TIME,
  chartMarkers,
  costRows,
  feeCapView,
  fundedCostView,
  monthChoices,
  parseCapInput,
  selectedSummary,
} from "./money.logic";

// Made-up firm and amounts. Real firm prices stay in the private pack.
const at = (day: number) => `2026-03-${String(day).padStart(2, "0")}T12:00:00-07:00`;
const EVENTS: readonly TradingEvent[] = [
  {
    id: "a1",
    at: at(1),
    author: "Test",
    kind: "account.opened",
    firm: "Firm A",
    product: "Plan 1",
    size: "50K",
    platform: "Platform",
    last4: "0001",
    stage: "evaluation",
  },
  {
    id: "a2",
    at: at(1),
    author: "Test",
    kind: "attempt.started",
    accountId: "a1",
    via: "purchase",
    fee: 100,
  },
  { id: "c1", at: at(2), author: "Test", kind: "cost.paid", category: "mentorship", amount: 40 },
  { id: "p1", at: at(3), author: "Test", kind: "payout.received", accountId: "a1", amount: 300 },
];

describe("chartMarkers", () => {
  it("marks each Payout and Firm fee with a signed dollar label, and skips other costs", () => {
    const state = deriveTradingState({ events: EVENTS, trades: [] });
    const markers = chartMarkers(chartModel(state, "All").plot);
    expect(markers.map((marker) => [marker.kind, marker.label])).toEqual([
      ["fee", "Fee -$100"],
      ["payout", "Payout +$300"],
    ]);
    for (const marker of markers) {
      expect(marker.left).toBeGreaterThanOrEqual(0);
      expect(marker.left).toBeLessThanOrEqual(100);
    }
  });
});

describe("feeCapView", () => {
  const state = deriveTradingState({ events: EVENTS, trades: [] });
  const march = new Date(2026, 2, 15);

  it("shows the spent amount and the warning text at 80 percent", () => {
    expect(feeCapView(state.moneyTimeline, march, 125)).toMatchObject({
      spent: 100,
      level: "warn",
      text: "Warning: $100 of $125 used (80%).",
    });
  });

  it("says how far over the cap it is, and has no text without a cap", () => {
    expect(feeCapView(state.moneyTimeline, march, 80).text).toBe("Over the cap by $20.");
    expect(feeCapView(state.moneyTimeline, march, null).text).toBeNull();
    expect(feeCapView(state.moneyTimeline, new Date(2026, 3, 1), 80)).toMatchObject({
      spent: 0,
      level: "ok",
    });
  });
});

describe("month and cost helpers", () => {
  const state = deriveTradingState({ events: EVENTS, trades: [] });

  it("lists All time first, then months with money", () => {
    expect(monthChoices(state)).toEqual([
      { value: ALL_TIME, label: "All time" },
      { value: "2026-03", label: "March 2026" },
    ]);
  });

  it("shows only the cost categories that have money", () => {
    const rows = costRows(selectedSummary(state.moneyTimeline, ALL_TIME));
    expect(rows).toEqual([
      { category: "evaluation", label: "Evaluation", amount: "$100" },
      { category: "mentorship", label: "Mentorship", amount: "$40" },
    ]);
  });

  it("says what is missing for the Funded account cost", () => {
    expect(fundedCostView(state)).toEqual({
      value: "Not enough data yet",
      note: "Needs one passed Attempt.",
    });
  });
});

describe("parseCapInput", () => {
  it("reads empty as no cap and a dollar amount as a number", () => {
    expect(parseCapInput("  ")).toEqual({ ok: true, value: null });
    expect(parseCapInput("250.5")).toEqual({ ok: true, value: 250.5 });
  });

  it("rejects negative, NaN and too large amounts", () => {
    for (const text of ["-5", "abc", "1000001"]) {
      expect(parseCapInput(text).ok).toBe(false);
    }
  });
});
