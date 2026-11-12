import type { MoneyCategory, MoneyPoint } from "./derive.ts";

export const MONEY_CATEGORIES: readonly MoneyCategory[] = [
  "evaluation",
  "reset",
  "activation",
  "mentorship",
  "data",
  "tools",
  "other",
  "payout",
];

/** Firm fees: the Evaluation, reset and activation fees the firm takes. */
export const isFirmFee = (category: MoneyCategory): boolean =>
  category === "evaluation" || category === "reset" || category === "activation";

export interface MoneySummary {
  /** Dollars per category. Costs and Payouts are both positive here. */
  readonly byCategory: Readonly<Record<MoneyCategory, number>>;
  readonly firmFees: number;
  readonly totalCost: number;
  readonly payouts: number;
  readonly netReturn: number;
}

interface MonthSummary extends MoneySummary {
  /** `YYYY-MM`, read from the text of the event time. */
  readonly month: string;
}

// Same cents rule as derive.ts, so the sums match `state.months` exactly.
const toCents = (dollars: number): number => Math.round(dollars * 100);

/** Sums money points in whole cents. Costs in the timeline are negative, so they flip to positive here. */
export function summarizeMoney(points: readonly MoneyPoint[]): MoneySummary {
  const cents = Object.fromEntries(MONEY_CATEGORIES.map((category) => [category, 0])) as Record<
    MoneyCategory,
    number
  >;
  for (const point of points) {
    const amount = toCents(point.amount);
    cents[point.category] += point.category === "payout" ? amount : -amount;
  }
  let totalCost = 0;
  let firmFees = 0;
  for (const category of MONEY_CATEGORIES) {
    if (category === "payout") continue;
    totalCost += cents[category];
    if (isFirmFee(category)) firmFees += cents[category];
  }
  const payouts = cents.payout;
  return {
    byCategory: Object.fromEntries(
      MONEY_CATEGORIES.map((category) => [category, cents[category] / 100]),
    ) as Record<MoneyCategory, number>,
    firmFees: firmFees / 100,
    totalCost: totalCost / 100,
    payouts: payouts / 100,
    netReturn: (payouts - totalCost) / 100,
  };
}

/** One summary per month that has money, oldest first. */
export function monthlyBreakdown(timeline: readonly MoneyPoint[]): readonly MonthSummary[] {
  const byMonth = new Map<string, MoneyPoint[]>();
  for (const point of timeline) {
    const month = point.at.slice(0, 7);
    byMonth.set(month, [...(byMonth.get(month) ?? []), point]);
  }
  return [...byMonth]
    .toSorted(([a], [b]) => a.localeCompare(b))
    .map(([month, points]) => ({ month, ...summarizeMoney(points) }));
}

export type FeeCapLevel = "ok" | "warn" | "over";

/** The fee cap warns from 80 percent. It only reports. It never blocks a purchase or an entry. */
export function feeCapStatus(input: { readonly spent: number; readonly cap: number | null }): {
  readonly percent: number | null;
  readonly level: FeeCapLevel;
} {
  const cap = input.cap === null ? 0 : toCents(input.cap);
  if (cap <= 0) return { percent: null, level: "ok" };
  const spent = toCents(input.spent);
  // Integer cents compare exactly. Percent keeps two decimals.
  const percent = Math.round((spent * 10_000) / cap) / 100;
  if (spent > cap) return { percent, level: "over" };
  return { percent, level: spent * 100 >= cap * 80 ? "warn" : "ok" };
}
