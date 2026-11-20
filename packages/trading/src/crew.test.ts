// @effect-diagnostics globalDate:off - the card carries an ISO time.
import { assert, describe, it } from "@effect/vitest";

import {
  DEFAULT_SHARE,
  buildCrewCard,
  parseCrewCard,
  traderSlug,
  type ShareSettings,
} from "./crew.ts";
import { deriveTradingState } from "./derive.ts";
import type { Trade, TradingEvent } from "./events.ts";

// Made-up amounts. They are odd numbers, so a leak is easy to spot in the card text.
const at = (day: number) => `2026-03-${String(day).padStart(2, "0")}T12:00:00-07:00`;
const events: TradingEvent[] = [
  {
    id: "a1",
    at: at(1),
    author: "Ada",
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
    author: "Ada",
    kind: "attempt.started",
    accountId: "a1",
    via: "purchase",
    fee: 137.31,
  },
  { id: "a3", at: at(2), author: "Ada", kind: "cost.paid", category: "mentorship", amount: 211.17 },
  { id: "a4", at: at(9), author: "Ada", kind: "attempt.ended", accountId: "a1", result: "passed" },
  { id: "a5", at: at(20), author: "Ada", kind: "payout.received", accountId: "a1", amount: 913.43 },
];
const trades: Trade[] = [
  { id: "t1", accountId: "a1", day: "2026-03-03", at: at(3), pnl: 421.77 },
  { id: "t2", accountId: "a1", day: "2026-03-03", at: at(3), pnl: -52.19 },
  { id: "t3", accountId: "a1", day: "2026-03-04", at: at(4), pnl: 88.05 },
];
const state = deriveTradingState({ events, trades });
const card = (share: ShareSettings) =>
  buildCrewCard({
    state,
    trades,
    name: "Ada Lovelace",
    share,
    now: new Date("2026-03-21T00:00:00Z"),
  });

const DOLLARS = [
  "137.31",
  "211.17",
  "913.43",
  "421.77",
  "52.19",
  "88.05",
  "firmFees",
  "netReturn",
  "total",
];

describe("crew card privacy", () => {
  it("holds no dollar fields with the default share settings", () => {
    const text = JSON.stringify(card(DEFAULT_SHARE));
    for (const needle of DOLLARS) assert.isFalse(text.includes(needle), `leaked ${needle}`);
    const parsed = JSON.parse(text) as Record<string, unknown>;
    assert.deepStrictEqual(Object.keys(parsed).toSorted(), [
      "habits",
      "journey",
      "name",
      "trader",
      "updatedAt",
      "version",
    ]);
  });

  it("adds Payouts and money only after the trader opts in to each group", () => {
    const payoutsOnly = JSON.stringify(card({ ...DEFAULT_SHARE, payouts: true }));
    assert.isTrue(payoutsOnly.includes('"payouts"'));
    assert.isFalse(payoutsOnly.includes('"money"'));
    const all = card({ journey: true, habits: true, payouts: true, money: true });
    assert.strictEqual(all.money?.totalCost, state.totalCost);
    assert.strictEqual(all.payouts?.count, 1);
  });

  it("shares nothing but the name when every group is off", () => {
    const empty = card({ journey: false, habits: false, payouts: false, money: false });
    assert.deepStrictEqual(Object.keys(empty).toSorted(), [
      "name",
      "trader",
      "updatedAt",
      "version",
    ]);
  });

  it("counts open accounts by stage, pass rate and trading days", () => {
    const shared = card(DEFAULT_SHARE);
    assert.deepStrictEqual(shared.journey?.passRate, { passed: 1, finished: 1 });
    assert.strictEqual(shared.habits?.tradingDays, 2);
  });
});

describe("crew card reader", () => {
  it("reads a card it built", () => {
    const built = card({ journey: true, habits: true, payouts: true, money: true });
    assert.deepStrictEqual(parseCrewCard(JSON.stringify(built)), built);
  });

  it("rejects unknown keys, prototype keys, bad types and a bad file name part", () => {
    const base = JSON.parse(JSON.stringify(card(DEFAULT_SHARE))) as Record<string, unknown>;
    const bad = [
      { ...base, extra: 1 },
      { ...base, trader: "../evil" },
      { ...base, version: 2 },
      { ...base, habits: { cleanStreak: "5", bestClean: 1, tradingDays: 1 } },
      {
        ...base,
        journey: {
          stage: "rich",
          passRate: { passed: 0, finished: 0 },
          accounts: { sim: 0, evaluation: 0, funded: 0 },
        },
      },
    ];
    for (const value of bad) assert.isNull(parseCrewCard(JSON.stringify(value)));
    assert.isNull(parseCrewCard('{"__proto__":{"x":1},"version":1}'));
    assert.isNull(parseCrewCard("not json"));
    assert.isNull(parseCrewCard(`{"version":1,"pad":"${"x".repeat(25_000)}"}`));
  });
});

describe("trader slug", () => {
  it("keeps letters, digits and dashes only and is never empty", () => {
    assert.strictEqual(traderSlug("Ada Lovelace"), "ada-lovelace");
    assert.strictEqual(traderSlug("../../x"), "x");
    assert.strictEqual(traderSlug("日本語"), "trader");
    assert.strictEqual(traderSlug(""), "trader");
  });
});
