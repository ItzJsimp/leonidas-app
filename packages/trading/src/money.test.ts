import { assert, describe, it } from "@effect/vitest";

import { deriveTradingState } from "./derive.ts";
import type { TradingEvent } from "./events.ts";
import { MONEY_CATEGORIES, feeCapStatus, monthlyBreakdown, summarizeMoney } from "./money.ts";

// Made-up firm and amounts. Real firm prices stay in the private pack.
const at = (month: number, day: number) =>
  `2026-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T12:00:00-07:00`;
const base = (id: string, month: number, day: number) => ({
  id,
  at: at(month, day),
  author: "Test",
});

const EVENTS: readonly TradingEvent[] = [
  {
    ...base("a1", 1, 5),
    kind: "account.opened",
    firm: "Firm A",
    product: "Plan 1",
    size: "50K",
    platform: "Platform",
    last4: "0001",
    stage: "evaluation",
  },
  { ...base("a2", 1, 5), kind: "attempt.started", accountId: "a1", via: "purchase", fee: 100.5 },
  { ...base("c1", 1, 9), kind: "cost.paid", category: "mentorship", amount: 40.1 },
  { ...base("c2", 1, 10), kind: "cost.paid", category: "data", amount: 0.1 },
  { ...base("c3", 1, 11), kind: "cost.paid", category: "data", amount: 0.2 },
  { ...base("a3", 1, 20), kind: "attempt.ended", accountId: "a1", result: "passed" },
  {
    ...base("f1", 2, 3),
    kind: "funded.opened",
    accountId: "f1",
    fromAccountId: "a1",
    activationFee: 75,
  },
  {
    ...base("a4", 2, 1),
    kind: "account.opened",
    firm: "Firm A",
    product: "Plan 1",
    size: "50K",
    platform: "Platform",
    last4: "0002",
    stage: "evaluation",
  },
  { ...base("a5", 2, 10), kind: "attempt.started", accountId: "a4", via: "reset", fee: 50 },
  { ...base("p1", 3, 2), kind: "payout.received", accountId: "f1", amount: 300.25 },
  { ...base("p2", 3, 20), kind: "payout.received", accountId: "f1", amount: 120 },
  { ...base("c4", 3, 4), kind: "cost.paid", category: "tools", amount: 15.5 },
  { ...base("c9", 3, 5), kind: "cost.paid", category: "other", amount: 99 },
  { ...base("d1", 3, 6), kind: "entry.deleted", targetId: "c9" },
];

describe("monthlyBreakdown", () => {
  it("sums each category per month in whole cents and matches state.months", () => {
    const state = deriveTradingState({ events: EVENTS, trades: [] });
    const months = monthlyBreakdown(state.moneyTimeline);

    assert.deepStrictEqual(
      months.map((month) => month.month),
      ["2026-01", "2026-02", "2026-03"],
    );
    for (const month of months) {
      const expected = state.months.find((entry) => entry.month === month.month);
      assert.isDefined(expected);
      assert.strictEqual(month.firmFees, expected!.firmFees);
      assert.strictEqual(month.totalCost, expected!.totalCost);
      assert.strictEqual(month.payouts, expected!.payouts);
      assert.strictEqual(month.netReturn, expected!.netReturn);
      assert.deepStrictEqual(Object.keys(month.byCategory).sort(), [...MONEY_CATEGORIES].sort());
    }

    // Fixture sums, by hand: 0.1 + 0.2 must read 0.3, not 0.30000000000000004.
    const [jan, feb, mar] = months;
    assert.strictEqual(jan!.byCategory.evaluation, 100.5);
    assert.strictEqual(jan!.byCategory.mentorship, 40.1);
    assert.strictEqual(jan!.byCategory.data, 0.3);
    assert.strictEqual(jan!.firmFees, 100.5);
    assert.strictEqual(jan!.totalCost, 140.9);
    assert.strictEqual(feb!.byCategory.activation, 75);
    assert.strictEqual(feb!.byCategory.reset, 50);
    assert.strictEqual(feb!.firmFees, 125);
    assert.strictEqual(mar!.byCategory.tools, 15.5);
    // The deleted cost does not count, and the payouts stay out of Total cost.
    assert.strictEqual(mar!.byCategory.other, 0);
    assert.strictEqual(mar!.totalCost, 15.5);
    assert.strictEqual(mar!.payouts, 420.25);
    assert.strictEqual(mar!.netReturn, 404.75);
  });

  it("all time equals the derived totals", () => {
    const state = deriveTradingState({ events: EVENTS, trades: [] });
    const all = summarizeMoney(state.moneyTimeline);
    assert.strictEqual(all.firmFees, state.firmFees);
    assert.strictEqual(all.totalCost, state.totalCost);
    assert.strictEqual(all.payouts, state.payouts);
    assert.strictEqual(all.netReturn, state.netReturn);
  });
});

describe("feeCapStatus", () => {
  it("is ok below 80 percent, warns from 80 up to the cap, and is over above it", () => {
    assert.deepStrictEqual(feeCapStatus({ spent: 79.99, cap: 100 }), {
      percent: 79.99,
      level: "ok",
    });
    assert.deepStrictEqual(feeCapStatus({ spent: 80, cap: 100 }), { percent: 80, level: "warn" });
    assert.deepStrictEqual(feeCapStatus({ spent: 100, cap: 100 }), { percent: 100, level: "warn" });
    assert.deepStrictEqual(feeCapStatus({ spent: 100.01, cap: 100 }), {
      percent: 100.01,
      level: "over",
    });
  });

  it("has no level without a cap, so it never blocks", () => {
    assert.deepStrictEqual(feeCapStatus({ spent: 900, cap: null }), { percent: null, level: "ok" });
    assert.deepStrictEqual(feeCapStatus({ spent: 900, cap: 0 }), { percent: null, level: "ok" });
  });
});
