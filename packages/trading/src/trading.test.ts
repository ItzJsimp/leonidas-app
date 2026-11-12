import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, describe, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import { deriveTradingState, productKey } from "./derive.ts";
import {
  parseLedger,
  parseTrades,
  serializeEvent,
  type Trade,
  type TradingEvent,
} from "./events.ts";
import { appendEvent, readLedger } from "./ledgerFile.ts";

// Made-up firms and amounts. Real firm prices stay in the private pack.
let next = 0;
const at = (day: number) => `2026-03-${String(day).padStart(2, "0")}T12:00:00-07:00`;
const base = (day: number) => ({ id: `e${++next}`, at: at(day), author: "Noah" });

const opened = (id: string, day = 1): TradingEvent => ({
  id,
  at: at(day),
  author: "Noah",
  kind: "account.opened",
  firm: "Firm A",
  product: "Plan 1",
  size: "50K",
  platform: "Platform",
  last4: "0001",
  stage: "evaluation",
});
const start = (
  accountId: string,
  day: number,
  via: "purchase" | "reset" = "purchase",
  fee = 100,
): TradingEvent => ({ ...base(day), kind: "attempt.started", accountId, via, fee });
const end = (accountId: string, day: number, result: "passed" | "failed"): TradingEvent => ({
  ...base(day),
  kind: "attempt.ended",
  accountId,
  result,
});
const cost = (
  category: Extract<TradingEvent, { kind: "cost.paid" }>["category"],
  amount: number,
  day = 2,
): TradingEvent => ({ ...base(day), kind: "cost.paid", category, amount });
const payout = (accountId: string, amount: number, day = 20): TradingEvent => ({
  ...base(day),
  kind: "payout.received",
  accountId,
  amount,
});
const trade = (id: string, accountId: string, day: number, pnl: number, extra = {}): Trade => ({
  id,
  accountId,
  day: `2026-03-${String(day).padStart(2, "0")}`,
  at: `2026-03-${String(day).padStart(2, "0")}T13:00:00-07:00`,
  pnl,
  ...extra,
});
const derive = (events: TradingEvent[], trades: Trade[] = []) =>
  deriveTradingState({ events, trades });

describe("Attempts and Pass rate", () => {
  it("Noah case: purchase, fail, 2 Resets, pass is 1 of 3 finished Attempts", () => {
    const state = derive([
      opened("a"),
      start("a", 1),
      end("a", 2, "failed"),
      start("a", 3, "reset"),
      end("a", 4, "failed"),
      start("a", 5, "reset"),
      end("a", 6, "passed"),
    ]);
    assert.deepStrictEqual(
      { passed: state.passRate.passed, finished: state.passRate.finished },
      { passed: 1, finished: 3 },
    );
    assert.closeTo(state.passRate.rate ?? 0, 1 / 3, 1e-9);
  });

  it("keeps open Attempts out of Pass rate", () => {
    const state = derive([
      opened("a"),
      start("a", 1),
      end("a", 2, "passed"),
      opened("b"),
      start("b", 3),
    ]);
    assert.strictEqual(state.attempts.length, 2);
    assert.deepStrictEqual(state.passRate, { passed: 1, finished: 1, rate: 1 });
  });

  it("has no rate before an Attempt ends", () => {
    assert.strictEqual(derive([opened("a"), start("a", 1)]).passRate.rate, null);
  });

  it("orders back-dated events by time, and reports an end with no open Attempt", () => {
    const state = derive([
      opened("a"),
      end("a", 5, "passed"),
      start("a", 2),
      end("a", 9, "failed"),
    ]);
    assert.strictEqual(state.attempts[0]?.result, "passed");
    assert.strictEqual(state.issues.length, 1);
  });
});

describe("costs and Payouts", () => {
  const money = [
    opened("a"),
    start("a", 1, "purchase", 100),
    start("a", 2, "reset", 40.1),
    { ...base(3), kind: "funded.opened", accountId: "f", fromAccountId: "a", activationFee: 20.2 },
    cost("evaluation", 10),
    cost("mentorship", 500),
    cost("data", 30),
    cost("tools", 25),
    cost("other", 5),
  ] satisfies TradingEvent[];

  it("Firm fees exclude mentorship, data and tools, and Total cost includes them", () => {
    const state = derive(money);
    assert.strictEqual(state.firmFees, 170.3);
    assert.strictEqual(state.totalCost, 730.3);
    assert.strictEqual(state.costByCategory.mentorship, 500);
  });

  it("a Funded account balance is never a Payout, and net return is Payouts minus Total cost", () => {
    const events = [...money];
    const trades = [trade("t1", "f", 10, 3000)];
    const withoutPayout = derive(events, trades);
    assert.strictEqual(withoutPayout.accounts.find((a) => a.id === "f")?.balanceChange, 3000);
    assert.strictEqual(withoutPayout.payouts, 0);
    assert.strictEqual(withoutPayout.netReturn, -730.3);

    const withPayout = derive([...events, payout("f", 1000)], trades);
    assert.strictEqual(withPayout.payouts, 1000);
    assert.strictEqual(withPayout.netReturn, 269.7);
    assert.strictEqual(withPayout.journey, "payouts");
  });

  it("month totals equal the events of each month, and the timeline ends at net return", () => {
    const state = derive([
      cost("evaluation", 50, 5),
      {
        ...base(1),
        at: "2026-04-02T12:00:00-07:00",
        kind: "cost.paid",
        category: "data",
        amount: 30,
      },
      {
        ...base(1),
        at: "2026-04-03T12:00:00-07:00",
        kind: "payout.received",
        accountId: "x",
        amount: 200,
      },
    ]);
    assert.deepStrictEqual(state.months, [
      { month: "2026-03", firmFees: 50, totalCost: 50, payouts: 0, netReturn: -50 },
      { month: "2026-04", firmFees: 0, totalCost: 30, payouts: 200, netReturn: 170 },
    ]);
    assert.strictEqual(state.moneyTimeline.at(-1)?.netReturn, state.netReturn);
  });

  it("average cost of a Funded account is finished fees per pass plus average activation", () => {
    const state = derive([
      opened("a"),
      start("a", 1, "purchase", 100),
      end("a", 2, "failed"),
      start("a", 3, "reset", 50),
      end("a", 4, "passed"),
      { ...base(5), kind: "funded.opened", accountId: "f", fromAccountId: "a", activationFee: 25 },
    ]);
    assert.strictEqual(state.averageFundedCost, 175);
    assert.strictEqual(derive([opened("a"), start("a", 1)]).averageFundedCost, null);
  });
});

describe("corrections", () => {
  it("edit and delete change the numbers and stay auditable", () => {
    const fee = cost("mentorship", 100);
    const typo = cost("data", 999);
    const state = derive([
      fee,
      typo,
      { ...base(3), kind: "entry.corrected", targetId: fee.id, patch: { amount: 60 } },
      { ...base(3), kind: "entry.deleted", targetId: typo.id },
    ]);
    assert.strictEqual(state.totalCost, 60);
    assert.deepStrictEqual(state.issues, []);
  });

  it("a patch cannot change id or kind, and an invalid patch keeps the original", () => {
    const fee = cost("mentorship", 100);
    const state = derive([
      fee,
      { ...base(3), kind: "entry.corrected", targetId: fee.id, patch: { kind: "payout.received" } },
      { ...base(3), kind: "entry.corrected", targetId: fee.id, patch: { amount: -5 } },
      { ...base(3), kind: "entry.deleted", targetId: "missing" },
    ]);
    assert.strictEqual(state.totalCost, 100);
    assert.strictEqual(state.payouts, 0);
    assert.strictEqual(state.issues.length, 2);
  });
});

describe("account numbers", () => {
  const products = new Map([
    [productKey("Firm A", "Plan 1"), { maxLoss: 1000, profitTarget: 3000, winningDayMin: 150 }],
  ]);

  it("trails the Drawdown at end of day and locks it at the start balance", () => {
    const state = deriveTradingState({
      events: [opened("a"), start("a", 1)],
      trades: [trade("t1", "a", 2, 400), trade("t2", "a", 3, -100)],
      products,
    });
    const account = state.accounts[0];
    assert.strictEqual(account?.balanceChange, 300);
    assert.strictEqual(account?.roomToDrawdown, 900);
    assert.strictEqual(account?.winningDays, 1);
    assert.strictEqual(account?.bestDayPercent, 133.3);
    assert.deepStrictEqual(state.lowestRoom, { accountId: "a", room: 900 });

    const locked = deriveTradingState({
      events: [opened("a"), start("a", 1)],
      trades: [trade("t1", "a", 2, 5000), trade("t2", "a", 3, -4500)],
      products,
    });
    assert.strictEqual(locked.accounts[0]?.roomToDrawdown, 500);
  });

  it("a Reset starts a fresh balance", () => {
    const state = deriveTradingState({
      events: [opened("a"), start("a", 1), end("a", 3, "failed"), start("a", 4, "reset")],
      trades: [trade("t1", "a", 2, -900), trade("t2", "a", 5, 100)],
      products,
    });
    assert.strictEqual(state.accounts[0]?.balanceChange, 100);
  });

  it("has no room without a pack rule, and closed accounts leave lowest room", () => {
    assert.strictEqual(derive([opened("a")]).accounts[0]?.roomToDrawdown, null);
    const closed = deriveTradingState({
      events: [
        opened("a"),
        { ...base(2), kind: "account.closed", accountId: "a", reason: "manual" },
      ],
      trades: [],
      products,
    });
    assert.strictEqual(closed.lowestRoom, null);
  });

  it("carries the consistency limit from the rule and the best-day share", () => {
    const rules = new Map([
      [productKey("Firm A", "Plan 1"), { maxLoss: 1000, consistencyPercent: 40 }],
    ]);
    const state = deriveTradingState({
      events: [
        opened("a"),
        start("a", 1),
        { ...base(4), kind: "payout.received", accountId: "a", amount: 50 },
      ],
      trades: [trade("t1", "a", 2, 100), trade("t2", "a", 3, 300)],
      products: rules,
    });
    const account = state.accounts[0];
    assert.strictEqual(account?.consistencyPercent, 40);
    assert.strictEqual(account?.bestDayPercent, 75);
    assert.deepStrictEqual(
      state.moneyTimeline.map((point) => point.accountId),
      ["a", "a"],
    );
    assert.strictEqual(derive([opened("a")]).accounts[0]?.consistencyPercent, null);
  });

  it("counts setups and clean-day streaks, and a tag overrides the import", () => {
    const state = derive(
      [
        opened("a"),
        { ...base(1), kind: "trade.tagged", tradeId: "t2", setup: "Setup B", ruleBreaks: [] },
      ],
      [
        trade("t1", "a", 2, 50, { setup: "Setup A" }),
        trade("t2", "a", 3, -20, { setup: "Setup A", ruleBreaks: ["moved stop"] }),
        trade("t3", "a", 4, 10, { ruleBreaks: ["moved stop"] }),
        trade("t4", "a", 5, 10),
        trade("t5", "a", 6, 10),
      ],
    );
    assert.deepStrictEqual(state.setups, [
      { setup: "Setup A", trades: 1, wins: 1, pnl: 50 },
      { setup: "Setup B", trades: 1, wins: 0, pnl: -20 },
    ]);
    assert.deepStrictEqual(state.streaks, { clean: 2, bestClean: 2 });
  });
});

describe("ledger", () => {
  it("skips and reports a corrupt line, and later lines still load", () => {
    const good = opened("a");
    const later = start("a", 2);
    const text = `﻿${serializeEvent(good)}{"torn":\n${serializeEvent(later)}`;
    const { events, issues } = parseLedger(text);
    assert.deepStrictEqual(
      events.map((e) => e.id),
      ["a", later.id],
    );
    assert.deepStrictEqual(issues, [{ line: 2, reason: "not valid JSON" }]);
  });

  it("rejects an unknown kind, an unknown key, a bad amount and a repeated id", () => {
    const good = opened("a");
    const lines = [
      JSON.stringify({ ...base(1), kind: "__proto__" }),
      JSON.stringify({ ...good, id: "b", extra: 1 }),
      JSON.stringify({ ...base(1), kind: "cost.paid", category: "data", amount: -1 }),
      JSON.stringify({ ...base(1), kind: "cost.paid", category: "toString", amount: 1 }),
      JSON.stringify(good),
      JSON.stringify(good),
    ];
    const { events, issues } = parseLedger(lines.join("\r\n"));
    assert.strictEqual(events.length, 1);
    assert.deepStrictEqual(
      issues.map((i) => i.line),
      [1, 2, 3, 4, 6],
    );
  });

  it("parses trades with the same skip rule", () => {
    const { trades, issues } = parseTrades(
      `${JSON.stringify(trade("t1", "a", 2, -5.5))}\nnope\n${JSON.stringify({ id: "t2" })}\n`,
    );
    assert.strictEqual(trades.length, 1);
    assert.strictEqual(issues.length, 2);
  });

  it.effect("appends one line per event, keeps a torn line separate, and refuses a bad event", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const paths = yield* Path.Path;
      const dir = yield* fs.makeTempDirectoryScoped({ prefix: "trading-ledger-" });
      const path = paths.join(dir, "trading", "ledger.jsonl");
      assert.deepStrictEqual(yield* readLedger(path), { events: [], issues: [] });

      yield* appendEvent(path, opened("a"));
      yield* fs.writeFileString(path, `${yield* fs.readFileString(path)}{"torn":true`);
      yield* appendEvent(path, opened("b"));
      yield* appendEvent(path, opened("c"));

      const { events, issues } = yield* readLedger(path);
      assert.deepStrictEqual(
        events.map((e) => e.id),
        ["a", "b", "c"],
      );
      assert.strictEqual(issues.length, 1);

      const before = yield* fs.readFileString(path);
      const bad = { ...cost("data", 1), amount: -1 } as TradingEvent;
      assert.isTrue(Exit.isFailure(yield* Effect.exit(appendEvent(path, bad))));
      assert.strictEqual(yield* fs.readFileString(path), before);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
});

describe("performance", () => {
  it("derives state for 1,000 events and 5,000 trades in under 50 ms", () => {
    const events: TradingEvent[] = [];
    for (let i = 0; i < 200; i++) {
      const day = (i % 27) + 1;
      events.push(opened(`p${i}`, day), start(`p${i}`, day), end(`p${i}`, day, "passed"));
      events.push(cost("data", 10, day), payout(`p${i}`, 20, day));
    }
    const trades = Array.from({ length: 5000 }, (_, i) =>
      trade(`x${i}`, `p${i % 200}`, (i % 27) + 1, i % 3 ? 10 : -7, { setup: `S${i % 5}` }),
    );
    const products = new Map([[productKey("Firm A", "Plan 1"), { maxLoss: 1000 }]]);
    assert.strictEqual(events.length, 1000);
    // Warm-up, so the budget measures the steady cost and not the JIT.
    for (let i = 0; i < 5; i++) deriveTradingState({ events, trades, products });
    const started = performance.now();
    const state = deriveTradingState({ events, trades, products });
    const elapsed = performance.now() - started;
    assert.strictEqual(state.passRate.finished, 200);
    assert.isBelow(elapsed, 50);
  });
});
