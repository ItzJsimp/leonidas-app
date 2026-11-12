import type { TradingState } from "@t3tools/contracts";
import {
  MONEY_CATEGORIES,
  feeCapStatus,
  isFirmFee,
  summarizeMoney,
  type FeeCapLevel,
  type MoneyCategory,
  type MoneySummary,
} from "@t3tools/trading";

import {
  CHART_HEIGHT,
  CHART_WIDTH,
  formatMoney,
  formatSigned,
  type ChartPlot,
} from "./dashboard.logic";

/** The month picker value for all months together. Other values are `YYYY-MM`. */
export const ALL_TIME = "all";

const CATEGORY_NAME: Record<MoneyCategory, string> = {
  evaluation: "Evaluation",
  reset: "Reset",
  activation: "Activation",
  mentorship: "Mentorship",
  data: "Data",
  tools: "Tools",
  other: "Other",
  payout: "Payout",
};

const MAX_CAP = 1_000_000;

/** `YYYY-MM` in local time. The ledger text uses the same local clock. */
const monthKey = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

const monthLabel = (key: string): string => {
  const [year, month] = key.split("-").map(Number);
  return new Date(Date.UTC(year!, month! - 1, 1)).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
};

/** All time first, then each month with money, newest first. */
export function monthChoices(
  state: TradingState,
): readonly { readonly value: string; readonly label: string }[] {
  return [
    { value: ALL_TIME, label: "All time" },
    ...state.months
      .map((entry) => entry.month)
      .toReversed()
      .map((month) => ({ value: month, label: monthLabel(month) })),
  ];
}

/** The totals for one picker value. A month that has no money gives zeros. */
export function selectedSummary(
  timeline: TradingState["moneyTimeline"],
  selection: string,
): MoneySummary {
  return summarizeMoney(
    selection === ALL_TIME
      ? timeline
      : timeline.filter((point) => point.at.slice(0, 7) === selection),
  );
}

/** Each cost category that has money in the selection. Zero rows are hidden. */
export function costRows(summary: MoneySummary) {
  return MONEY_CATEGORIES.filter(
    (category) => category !== "payout" && summary.byCategory[category] > 0,
  ).map((category) => ({
    category,
    label: CATEGORY_NAME[category],
    amount: formatMoney(summary.byCategory[category]),
  }));
}

interface FeeCapView {
  readonly spent: number;
  readonly percent: number | null;
  readonly level: FeeCapLevel;
  /** One line for the bar, or null when no cap is set. */
  readonly text: string | null;
}

/** The current month's Firm fees against the cap. Reports only. Nothing is blocked. */
export function feeCapView(
  timeline: TradingState["moneyTimeline"],
  now: Date,
  cap: number | null,
): FeeCapView {
  const spent = selectedSummary(timeline, monthKey(now)).firmFees;
  const status = feeCapStatus({ spent, cap });
  const hasCap = cap !== null && cap > 0;
  let text: string | null = null;
  if (hasCap && status.level === "over") {
    text = `Over the cap by ${formatMoney(Math.round((spent - cap) * 100) / 100)}.`;
  } else if (hasCap) {
    const warning = status.level === "warn" ? "Warning: " : "";
    text = `${warning}${formatMoney(spent)} of ${formatMoney(cap)} used (${status.percent}%).`;
  }
  return { spent, ...status, text };
}

/** The Average cost of a Funded account, or what is missing when the data is not there yet. */
export function fundedCostView(state: TradingState): {
  readonly value: string;
  readonly note: string;
} {
  if (state.averageFundedCost === null) {
    return { value: "Not enough data yet", note: "Needs one passed Attempt." };
  }
  return {
    value: formatMoney(state.averageFundedCost),
    note: "Fees to pass plus activation, per Funded account.",
  };
}

type CapInput =
  | { readonly ok: true; readonly value: number | null }
  | { readonly ok: false; readonly message: string };

/** Empty removes the cap. Otherwise the text must be a dollar amount from 0 to 1,000,000. */
export function parseCapInput(text: string): CapInput {
  const trimmed = text.trim();
  if (trimmed === "") return { ok: true, value: null };
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value < 0 || value > MAX_CAP) {
    return { ok: false, message: "Enter a dollar amount from 0 to 1,000,000." };
  }
  return { ok: true, value };
}

interface ChartMarker {
  readonly key: string;
  readonly kind: "payout" | "fee";
  /** Percent of the chart box, so the marker stays on its point at any width. */
  readonly left: number;
  readonly top: number;
  readonly label: string;
}

/** One marker for each Payout and each Firm fee on the line. The label keeps the sign. */
export function chartMarkers(plot: readonly ChartPlot[]): readonly ChartMarker[] {
  return plot.flatMap(({ point, x, y }, index) => {
    const kind = point.category === "payout" ? "payout" : isFirmFee(point.category) ? "fee" : null;
    if (kind === null) return [];
    const name = kind === "payout" ? "Payout" : "Fee";
    return [
      {
        key: `${index}-${point.category}`,
        kind,
        left: (x / CHART_WIDTH) * 100,
        top: (y / CHART_HEIGHT) * 100,
        label: `${name} ${formatSigned(point.amount)}`,
      },
    ];
  });
}
