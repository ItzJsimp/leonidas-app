import type { TradingState } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  accountMoney,
  consistencyProgress,
  matchesFilter,
  matchesQuery,
  nextSelection,
  sortAccounts,
  targetProgress,
} from "./accounts.logic";
import { FIFTEEN, account } from "./accounts.fixture";

const countOf = (filter: Parameters<typeof matchesFilter>[1]) =>
  FIFTEEN.filter((item) => matchesFilter(item, filter)).length;

describe("filter chips", () => {
  it("All and each stage show open accounts only; Closed history shows only closed ones", () => {
    expect(countOf("all")).toBe(12);
    expect(countOf("sim")).toBe(3);
    expect(countOf("evaluation")).toBe(5);
    expect(countOf("funded")).toBe(4);
    expect(countOf("closed")).toBe(3);
  });
});

describe("search", () => {
  it("matches firm, product and last four digits, without case", () => {
    const hits = (query: string) => FIFTEEN.filter((item) => matchesQuery(item, query)).length;
    expect(hits("")).toBe(15);
    expect(hits("1007")).toBe(1);
    expect(hits("  FIRM b ")).toBe(8);
    expect(hits("plan 1")).toBe(15);
    expect(hits("no such account")).toBe(0);
  });
});

describe("urgency sort", () => {
  it("puts open accounts by least room first, then no room, then closed by name", () => {
    const ids = sortAccounts(FIFTEEN).map((item) => item.id);
    expect(ids).toEqual([
      "acct-10",
      "acct-4",
      "acct-6",
      "acct-2",
      "acct-9",
      "acct-3",
      "acct-1",
      "acct-11",
      "acct-5",
      "acct-15",
      "acct-12",
      "acct-7",
      "acct-8",
      "acct-14",
      "acct-13",
    ]);
  });
});

describe("keyboard selection", () => {
  const ids = sortAccounts(FIFTEEN.filter((item) => matchesFilter(item, "all"))).map(
    (item) => item.id,
  );

  it("Down walks the 12 visible rows in order and stops at the last one", () => {
    const walk: string[] = [];
    let current: string | null = null;
    for (let step = 0; step < 12; step += 1) {
      current = nextSelection(ids, current, "ArrowDown");
      if (current !== null) walk.push(current);
    }
    expect(walk).toEqual(ids);
    expect(nextSelection(ids, current, "ArrowDown")).toBe(ids.at(-1));
  });

  it("Up with no selection picks the last row, and Up stops at the first", () => {
    expect(nextSelection(ids, null, "ArrowUp")).toBe(ids.at(-1));
    expect(nextSelection(ids, ids[0] ?? null, "ArrowUp")).toBe(ids[0]);
  });

  it("Home and End jump, other keys keep the selection, an empty list selects nothing", () => {
    expect(nextSelection(ids, ids[5] ?? null, "Home")).toBe(ids[0]);
    expect(nextSelection(ids, ids[5] ?? null, "End")).toBe(ids.at(-1));
    expect(nextSelection(ids, ids[5] ?? null, "Enter")).toBe(ids[5]);
    expect(nextSelection([], null, "ArrowDown")).toBeNull();
  });
});

describe("progress", () => {
  it("consistency progress matches a 40 percent invented limit", () => {
    const limit = (best: number | null) =>
      consistencyProgress(account(11, { consistencyPercent: 40, bestDayPercent: best }));
    expect(limit(30)).toEqual({ percent: 75, over: false });
    expect(limit(40)).toEqual({ percent: 100, over: false });
    expect(limit(55)).toEqual({ percent: 100, over: true });
    expect(limit(null)).toEqual({ percent: 0, over: false });
    expect(consistencyProgress(account(11))).toBeNull();
  });

  it("profit target progress is balance over target, from 0 to 100", () => {
    const target = (balance: number) =>
      targetProgress(account(4, { profitTarget: 3000, balanceChange: balance }));
    expect(target(750)).toBe(25);
    expect(target(-150)).toBe(0);
    expect(target(4500)).toBe(100);
    expect(targetProgress(account(4))).toBeNull();
  });
});

describe("accountMoney", () => {
  it("sums one account's Firm fees and Payouts, and skips other costs and accounts", () => {
    const state = {
      moneyTimeline: [
        {
          at: "2026-03-01T12:00:00-07:00",
          category: "evaluation",
          accountId: "acct-4",
          amount: -100,
          netReturn: 0,
        },
        {
          at: "2026-03-09T12:00:00-07:00",
          category: "payout",
          accountId: "acct-4",
          amount: 250,
          netReturn: 0,
        },
        {
          at: "2026-03-10T12:00:00-07:00",
          category: "activation",
          accountId: "acct-4",
          amount: -30,
          netReturn: 0,
        },
        {
          at: "2026-03-11T12:00:00-07:00",
          category: "data",
          accountId: "acct-4",
          amount: -40,
          netReturn: 0,
        },
        {
          at: "2026-03-12T12:00:00-07:00",
          category: "reset",
          accountId: "acct-9",
          amount: -75,
          netReturn: 0,
        },
      ],
    } as unknown as TradingState;
    const money = accountMoney(state, "acct-4");
    expect(money.firmFees).toBe(130);
    expect(money.payoutTotal).toBe(250);
    expect(money.payouts).toEqual([{ at: "2026-03-09T12:00:00-07:00", amount: 250 }]);
  });
});
