import { assert, describe, it } from "@effect/vitest";

import {
  bankrollChances,
  expectedValue,
  planNextTrade,
  positionSize,
  riskStateId,
  type RiskState,
} from "./risk.ts";

// Made-up risk states and limits. The real numbers stay in the private pack repo.
const STATES: RiskState[] = [
  {
    id: "evaluation",
    market: "NQ",
    contracts: 3,
    stopPoints: 12,
    targetPoints: 20,
    stopDollars: 720,
    targetDollars: 1200,
  },
  {
    id: "funded-new",
    market: "NQ",
    contracts: 1,
    stopPoints: 9,
    targetPoints: 30,
    stopDollars: 180,
    targetDollars: 600,
  },
  {
    id: "funded-in-profit",
    market: "NQ",
    contracts: 1,
    stopPoints: 4,
    targetPoints: 4,
    stopDollars: 80,
    targetDollars: 80,
  },
];

type Account = Parameters<typeof planNextTrade>[0]["account"];
const account = (patch: Partial<Account>): Account => ({
  stage: "evaluation",
  closedReason: null,
  balanceChange: 0,
  roomToDrawdown: 5000,
  ...patch,
});
const rules = (patch: { dailyLoss?: number | null } = {}) => ({
  riskStates: STATES,
  dailyLoss: null,
  ...patch,
});

describe("risk state for an account", () => {
  it("maps an Evaluation and a sim account to the evaluation state", () => {
    assert.strictEqual(riskStateId(account({ stage: "evaluation" })), "evaluation");
    assert.strictEqual(riskStateId(account({ stage: "sim" })), "evaluation");
  });

  it("maps a funded account by its balance change", () => {
    assert.strictEqual(riskStateId(account({ stage: "funded", balanceChange: 0 })), "funded-new");
    assert.strictEqual(riskStateId(account({ stage: "funded", balanceChange: -50 })), "funded-new");
    assert.strictEqual(
      riskStateId(account({ stage: "funded", balanceChange: 40 })),
      "funded-in-profit",
    );
  });

  it("gives a closed account no state", () => {
    assert.isNull(riskStateId(account({ closedReason: "drawdown" })));
  });
});

describe("planNextTrade", () => {
  it("uses the state of the account and keeps its points and dollars", () => {
    const plan = planNextTrade({ account: account({ stage: "evaluation" }), rules: rules() });
    assert.deepStrictEqual(
      [plan?.contracts, plan?.stopPoints, plan?.targetPoints, plan?.stopDollars],
      [3, 12, 20, 720],
    );
    const funded = planNextTrade({
      account: account({ stage: "funded", balanceChange: 40 }),
      rules: rules(),
    });
    assert.strictEqual(funded?.stopPoints, 4);
  });

  it("gives the MNQ line the same dollars with ten times the contracts", () => {
    const plan = planNextTrade({ account: account({}), rules: rules() });
    assert.deepStrictEqual(plan?.mnq, { contracts: 30, stopPoints: 12, targetPoints: 20 });
    assert.strictEqual(
      plan?.stopDollars,
      (plan?.mnq.stopPoints ?? 0) * 2 * (plan?.mnq.contracts ?? 0),
    );
  });

  it("returns no plan for a closed account or a missing state", () => {
    assert.isNull(planNextTrade({ account: account({ closedReason: "rule" }), rules: rules() }));
    assert.isNull(planNextTrade({ account: account({}), rules: { ...rules(), riskStates: [] } }));
  });

  it("warns when the stop is larger than the room to Drawdown", () => {
    const plan = planNextTrade({ account: account({ roomToDrawdown: 500 }), rules: rules() });
    assert.deepStrictEqual(
      plan?.warnings.map((w) => w.code),
      ["stop_over_room"],
    );
    assert.include(plan?.warnings[0]?.text ?? "", "$720");
    assert.include(plan?.warnings[0]?.text ?? "", "$500");
  });

  it("warns when the stop is larger than the firm daily loss limit", () => {
    const plan = planNextTrade({ account: account({}), rules: rules({ dailyLoss: 600 }) });
    assert.deepStrictEqual(
      plan?.warnings.map((w) => w.code),
      ["stop_over_daily_loss"],
    );
  });

  it("gives no warning when the stop fits every limit, or no limit is known", () => {
    const fits = planNextTrade({
      account: account({ roomToDrawdown: 800 }),
      rules: rules({ dailyLoss: 800 }),
    });
    assert.deepStrictEqual(fits?.warnings, []);
    const unknown = planNextTrade({
      account: account({ roomToDrawdown: null }),
      rules: rules(),
    });
    assert.deepStrictEqual(unknown?.warnings, []);
  });
});

describe("positionSize", () => {
  it("solves dollars from contracts and points", () => {
    assert.deepStrictEqual(positionSize({ market: "NQ", contracts: 2, points: 12 }), {
      ok: true,
      contracts: 2,
      points: 12,
      dollars: 480,
    });
    assert.deepStrictEqual(positionSize({ market: "MNQ", contracts: 10, points: 12 }), {
      ok: true,
      contracts: 10,
      points: 12,
      dollars: 240,
    });
  });

  it("solves points from dollars and contracts", () => {
    const result = positionSize({ market: "NQ", dollars: 500, contracts: 2 });
    assert.strictEqual(result.ok && result.points, 12.5);
  });

  it("rounds contracts down so the trade never risks more than the dollars", () => {
    assert.deepStrictEqual(positionSize({ market: "NQ", dollars: 300, points: 12 }), {
      ok: true,
      contracts: 1,
      points: 12,
      dollars: 240,
    });
    assert.deepStrictEqual(positionSize({ market: "MNQ", dollars: 300, points: 12 }), {
      ok: true,
      contracts: 12,
      points: 12,
      dollars: 288,
    });
  });

  it("says when the dollars cannot pay for one contract", () => {
    assert.deepStrictEqual(positionSize({ market: "NQ", dollars: 70, points: 12 }), {
      ok: false,
      reason: "too_small",
    });
  });

  it("needs exactly two positive whole inputs", () => {
    const invalid = { ok: false, reason: "invalid_input" } as const;
    assert.deepStrictEqual(positionSize({ market: "NQ", points: 12 }), invalid);
    assert.deepStrictEqual(
      positionSize({ market: "NQ", contracts: 1, points: 12, dollars: 240 }),
      invalid,
    );
    assert.deepStrictEqual(positionSize({ market: "NQ", contracts: 0, points: 12 }), invalid);
    assert.deepStrictEqual(positionSize({ market: "NQ", contracts: 1.5, points: 12 }), invalid);
  });
});

describe("expectedValue", () => {
  it("adds the fee and the activation fee over the Pass rate to get the cost", () => {
    const result = expectedValue({
      fee: 90,
      passRate: 0.5,
      activationFee: 40,
      payoutChance: 0.5,
      payoutSize: 1100,
    });
    assert.deepStrictEqual(result, { averageCost: 220, value: 330 });
  });

  it("shows a negative value when the cost is more than the chance times the payout", () => {
    const result = expectedValue({
      fee: 90,
      passRate: 0.3,
      activationFee: 0,
      payoutChance: 0.2,
      payoutSize: 1100,
    });
    assert.deepStrictEqual(result, { averageCost: 300, value: -80 });
  });

  it("gives no result for a Pass rate of 0", () => {
    assert.isNull(
      expectedValue({ fee: 90, passRate: 0, activationFee: 0, payoutChance: 0.5, payoutSize: 1 }),
    );
  });
});

describe("bankrollChances", () => {
  it("counts the Evaluations the bankroll pays for and the chance of 0, 1 and 2 passes", () => {
    assert.deepStrictEqual(bankrollChances({ bankroll: 300, fee: 90, passRate: 0.5 }), {
      attempts: 3,
      exactly: [0.125, 0.375, 0.375],
    });
  });

  it("gives zero chance for a pass count above the attempts", () => {
    assert.deepStrictEqual(bankrollChances({ bankroll: 150, fee: 90, passRate: 0.5 }), {
      attempts: 1,
      exactly: [0.5, 0.5, 0],
    });
    assert.deepStrictEqual(bankrollChances({ bankroll: 80, fee: 90, passRate: 0.5 }), {
      attempts: 0,
      exactly: [1, 0, 0],
    });
  });

  it("gives no result for a fee of 0 or a Pass rate above 1", () => {
    assert.isNull(bankrollChances({ bankroll: 300, fee: 0, passRate: 0.5 }));
    assert.isNull(bankrollChances({ bankroll: 300, fee: 90, passRate: 1.5 }));
  });
});
