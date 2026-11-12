import type { TradingAccountView, TradingRiskRulesResult } from "@t3tools/contracts";
import {
  bankrollChances,
  expectedValue,
  planNextTrade,
  positionSize,
  productKey,
  type Market,
  type SizeResult,
  type TradePlan,
} from "@t3tools/trading";

import { formatMoney } from "./dashboard.logic";

export type ReadyRules = Extract<TradingRiskRulesResult, { status: "ready" }>;

/** A typed number. Blank is undefined, text that is not a number is null. */
export function readNumber(text: string): number | undefined | null {
  const clean = text.replace(/[$,\s]/g, "");
  if (clean === "") return undefined;
  const value = Number(clean);
  return Number.isFinite(value) ? value : null;
}

/** A percent typed from 0 to 100, read as a rate from 0 to 1. Null when out of range. */
export function readRate(text: string): number | undefined | null {
  const value = readNumber(text);
  if (typeof value !== "number") return value;
  return value >= 0 && value <= 100 ? value / 100 : null;
}

export const percentText = (rate: number): string => `${Math.round(rate * 1000) / 10}%`;

export function stageLabel(account: Pick<TradingAccountView, "stage">): string {
  if (account.stage === "sim") return "Sim";
  if (account.stage === "evaluation") return "Evaluation";
  return "Funded account";
}

/** The next trade plan of one account, with the firm daily loss limit of its product. */
export function planFor(account: TradingAccountView, rules: ReadyRules): TradePlan | null {
  const limit = rules.limits[productKey(account.firm, account.product)];
  return planNextTrade({
    account,
    rules: { riskStates: rules.riskStates, dailyLoss: limit?.dailyLoss ?? null },
  });
}

export interface EvForm {
  readonly fee: string;
  readonly passRate: string;
  readonly activation: string;
  readonly payoutChance: string;
  readonly payoutSize: string;
}

/** Null until every field holds a valid number. A blank activation fee counts as 0. */
export function evaluationEv(form: EvForm) {
  const fee = readNumber(form.fee);
  const passRate = readRate(form.passRate);
  const payoutChance = readRate(form.payoutChance);
  const payoutSize = readNumber(form.payoutSize);
  const activation = form.activation.trim() === "" ? 0 : readNumber(form.activation);
  if (
    typeof fee !== "number" ||
    typeof passRate !== "number" ||
    typeof payoutChance !== "number" ||
    typeof payoutSize !== "number" ||
    typeof activation !== "number"
  ) {
    return null;
  }
  return expectedValue({ fee, passRate, activationFee: activation, payoutChance, payoutSize });
}

export interface BankrollForm {
  readonly bankroll: string;
  readonly fee: string;
  readonly passRate: string;
}

export function bankrollOdds(form: BankrollForm) {
  const bankroll = readNumber(form.bankroll);
  const fee = readNumber(form.fee);
  const passRate = readRate(form.passRate);
  if (typeof bankroll !== "number" || typeof fee !== "number" || typeof passRate !== "number") {
    return null;
  }
  return bankrollChances({ bankroll, fee, passRate });
}

export interface SizeForm {
  readonly contracts: string;
  readonly points: string;
  readonly dollars: string;
}

/** Leave one box empty to solve it. Any text that is not a number makes the input invalid. */
export function sizeFor(market: Market, form: SizeForm): SizeResult {
  const parts = [readNumber(form.contracts), readNumber(form.points), readNumber(form.dollars)];
  if (parts.some((value) => value === null)) return { ok: false, reason: "invalid_input" };
  const [contracts, points, dollars] = parts.map((value) =>
    typeof value === "number" ? value : undefined,
  );
  return positionSize({ market, contracts, points, dollars });
}

export function sizeText(result: SizeResult, market: Market): string {
  if (!result.ok) {
    return result.reason === "too_small"
      ? "The dollars do not pay for one contract at that many points."
      : "Fill in exactly two boxes with numbers above 0. Leave the third box empty.";
  }
  const points = Math.round(result.points * 100) / 100;
  return `${result.contracts} ${market} contracts at ${points} points risk ${formatMoney(result.dollars)}.`;
}
