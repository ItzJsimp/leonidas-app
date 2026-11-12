import type { TradingAccountView } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  bankrollOdds,
  evaluationEv,
  planFor,
  readNumber,
  readRate,
  sizeFor,
  sizeText,
  type ReadyRules,
} from "./risk.logic";

// Made-up pack values. The real numbers stay in the private pack repo.
const RULES: ReadyRules = {
  status: "ready",
  riskStates: [
    {
      id: "evaluation",
      market: "NQ",
      contracts: 2,
      stopPoints: 12,
      targetPoints: 20,
      stopDollars: 480,
      targetDollars: 800,
    },
  ],
  firstDay: null,
  limits: { "Firm A/Plan 1": { dailyLoss: 300, maxLoss: null } },
};

const ACCOUNT: TradingAccountView = {
  id: "a1",
  firm: "Firm A",
  product: "Plan 1",
  size: "50K",
  platform: "TopstepX",
  last4: "0001",
  stage: "evaluation",
  closedReason: null,
  balanceChange: 0,
  roomToDrawdown: 5000,
  profitTarget: null,
  winningDays: null,
  bestDayPercent: null,
};

describe("risk input", () => {
  it("reads blank as undefined, other text as null, and a percent as a rate", () => {
    expect(readNumber("  ")).toBeUndefined();
    expect(readNumber("$1,250")).toBe(1250);
    expect(readNumber("abc")).toBeNull();
    expect(readRate("40")).toBe(0.4);
    expect(readRate("140")).toBeNull();
  });
});

describe("risk calculators", () => {
  it("gives the cost and the value, and a blank activation fee counts as 0", () => {
    const form = {
      fee: "90",
      passRate: "50",
      activation: "",
      payoutChance: "50",
      payoutSize: "1100",
    };
    expect(evaluationEv(form)).toEqual({ averageCost: 180, value: 370 });
    expect(evaluationEv({ ...form, activation: "x" })).toBeNull();
    expect(evaluationEv({ ...form, passRate: "0" })).toBeNull();
  });

  it("counts the Evaluations a bankroll pays for", () => {
    expect(bankrollOdds({ bankroll: "300", fee: "90", passRate: "50" })).toEqual({
      attempts: 3,
      exactly: [0.125, 0.375, 0.375],
    });
    expect(bankrollOdds({ bankroll: "300", fee: "", passRate: "50" })).toBeNull();
  });

  it("solves the empty box and rejects text in a box", () => {
    expect(sizeFor("NQ", { contracts: "2", points: "12", dollars: "" })).toEqual({
      ok: true,
      contracts: 2,
      points: 12,
      dollars: 480,
    });
    expect(sizeFor("NQ", { contracts: "", points: "12", dollars: "500" })).toMatchObject({
      ok: true,
      contracts: 2,
    });
    expect(sizeFor("NQ", { contracts: "2", points: "x", dollars: "" })).toEqual({
      ok: false,
      reason: "invalid_input",
    });
  });

  it("words the size result in plain text", () => {
    const mnq = sizeFor("MNQ", { contracts: "10", points: "12", dollars: "" });
    expect(sizeText(mnq, "MNQ")).toBe("10 MNQ contracts at 12 points risk $240.");
    const small = sizeFor("NQ", { contracts: "", points: "12", dollars: "70" });
    expect(sizeText(small, "NQ")).toBe(
      "The dollars do not pay for one contract at that many points.",
    );
  });
});

describe("plan for an account", () => {
  it("reads the daily loss limit of the account's product", () => {
    expect(planFor(ACCOUNT, RULES)?.warnings.map((w) => w.code)).toEqual(["stop_over_daily_loss"]);
    expect(planFor({ ...ACCOUNT, product: "Other" }, RULES)?.warnings).toEqual([]);
  });
});
