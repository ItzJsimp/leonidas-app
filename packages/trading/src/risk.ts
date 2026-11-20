import type { AccountView } from "./derive.ts";
import { toCents } from "./derive.ts";
import type { PackRiskState } from "./pack.ts";

/** Dollars for one point of one contract. */
const POINT_VALUE = { NQ: 20, MNQ: 2 } as const;
export type Market = keyof typeof POINT_VALUE;
/** The MNQ line keeps the NQ dollars, so it needs this many times the contracts. */
const MNQ_PER_NQ = POINT_VALUE.NQ / POINT_VALUE.MNQ;

export type RiskState = Pick<
  PackRiskState,
  "id" | "market" | "contracts" | "stopPoints" | "targetPoints" | "stopDollars" | "targetDollars"
>;

export interface RiskRules {
  readonly riskStates: readonly RiskState[];
  /** The firm daily loss limit for the account's product, or null when unknown. */
  readonly dailyLoss: number | null;
}

export type PlanAccount = Pick<
  AccountView,
  "stage" | "closedReason" | "balanceChange" | "roomToDrawdown"
>;

export interface RiskWarning {
  readonly code: "stop_over_room" | "stop_over_daily_loss";
  readonly text: string;
}

export interface TradePlan {
  readonly market: string;
  readonly contracts: number;
  readonly stopPoints: number;
  readonly targetPoints: number;
  readonly stopDollars: number;
  readonly targetDollars: number;
  readonly mnq: {
    readonly contracts: number;
    readonly stopPoints: number;
    readonly targetPoints: number;
  };
  /** Data only. A warning never blocks the plan. */
  readonly warnings: readonly RiskWarning[];
}

const money = (dollars: number): string => `$${Math.round(dollars).toLocaleString("en-US")}`;

/** The pack risk state an account uses. Null for a closed account. */
export function riskStateId(account: PlanAccount): string | null {
  if (account.closedReason !== null) return null;
  if (account.stage !== "funded") return "evaluation";
  return account.balanceChange > 0 ? "funded-in-profit" : "funded-new";
}

export function planNextTrade({
  account,
  rules,
}: {
  readonly account: PlanAccount;
  readonly rules: RiskRules;
}): TradePlan | null {
  const id = riskStateId(account);
  const state = rules.riskStates.find((item) => item.id === id);
  if (state === undefined) return null;
  const warnings: RiskWarning[] = [];
  if (
    account.roomToDrawdown !== null &&
    toCents(state.stopDollars) > toCents(account.roomToDrawdown)
  ) {
    warnings.push({
      code: "stop_over_room",
      text: `The stop is ${money(state.stopDollars)}. Room to Drawdown is ${money(account.roomToDrawdown)}.`,
    });
  }
  if (rules.dailyLoss !== null && toCents(state.stopDollars) > toCents(rules.dailyLoss)) {
    warnings.push({
      code: "stop_over_daily_loss",
      text: `The stop is ${money(state.stopDollars)}. The firm daily loss limit is ${money(rules.dailyLoss)}.`,
    });
  }
  return {
    market: state.market,
    contracts: state.contracts,
    stopPoints: state.stopPoints,
    targetPoints: state.targetPoints,
    stopDollars: state.stopDollars,
    targetDollars: state.targetDollars,
    mnq: {
      contracts: state.contracts * MNQ_PER_NQ,
      stopPoints: state.stopPoints,
      targetPoints: state.targetPoints,
    },
    warnings,
  };
}

export interface SizeInput {
  readonly market: Market;
  readonly contracts?: number | undefined;
  readonly points?: number | undefined;
  readonly dollars?: number | undefined;
}

export type SizeResult =
  | {
      readonly ok: true;
      readonly contracts: number;
      readonly points: number;
      readonly dollars: number;
    }
  | { readonly ok: false; readonly reason: "invalid_input" | "too_small" };

/** Give exactly two of contracts, points and dollars. The script solves the third. */
export function positionSize(input: SizeInput): SizeResult {
  const given = [input.contracts, input.points, input.dollars].filter((v) => v !== undefined);
  const valid =
    given.length === 2 &&
    given.every((v) => Number.isFinite(v) && v > 0) &&
    (input.contracts === undefined || Number.isInteger(input.contracts));
  if (!valid) return { ok: false, reason: "invalid_input" };
  const value = POINT_VALUE[input.market];
  const risk = (contracts: number, points: number) =>
    Math.round(value * points * contracts * 100) / 100;
  if (input.dollars === undefined) {
    const { contracts = 0, points = 0 } = input;
    return { ok: true, contracts, points, dollars: risk(contracts, points) };
  }
  if (input.points === undefined) {
    const points = input.dollars / (value * (input.contracts ?? 0));
    return { ok: true, contracts: input.contracts ?? 0, points, dollars: input.dollars };
  }
  // Tolerance for float noise, so 500 / (20 x 12.5) counts as 2.
  const contracts = Math.floor(input.dollars / (value * input.points) + 1e-9);
  if (contracts < 1) return { ok: false, reason: "too_small" };
  return { ok: true, contracts, points: input.points, dollars: risk(contracts, input.points) };
}

/** The cost of a funded account is the fee over the Pass rate, plus any activation fee. */
export function expectedValue({
  fee,
  passRate,
  activationFee,
  payoutChance,
  payoutSize,
}: {
  readonly fee: number;
  readonly passRate: number;
  readonly activationFee: number;
  readonly payoutChance: number;
  readonly payoutSize: number;
}): { readonly averageCost: number; readonly value: number } | null {
  if (!(passRate > 0 && passRate <= 1) || !(payoutChance >= 0 && payoutChance <= 1)) return null;
  if (fee < 0 || activationFee < 0 || payoutSize < 0) return null;
  const averageCost = Math.round(toCents(fee) / passRate) + toCents(activationFee);
  const value = Math.round(payoutChance * toCents(payoutSize)) - averageCost;
  return { averageCost: averageCost / 100, value: value / 100 };
}

/** Chance of exactly 0, 1 and 2 passes with the Evaluations the bankroll pays for. */
export function bankrollChances({
  bankroll,
  fee,
  passRate,
}: {
  readonly bankroll: number;
  readonly fee: number;
  readonly passRate: number;
}): { readonly attempts: number; readonly exactly: readonly [number, number, number] } | null {
  if (!(fee > 0) || bankroll < 0 || !(passRate >= 0 && passRate <= 1)) return null;
  const attempts = Math.floor(toCents(bankroll) / toCents(fee));
  // Ways to choose 0, 1 and 2 passes from the attempts.
  const ways = [1, attempts, (attempts * (attempts - 1)) / 2];
  const chance = (passes: number) =>
    passes > attempts
      ? 0
      : (ways[passes] ?? 0) * passRate ** passes * (1 - passRate) ** (attempts - passes);
  return { attempts, exactly: [chance(0), chance(1), chance(2)] };
}
