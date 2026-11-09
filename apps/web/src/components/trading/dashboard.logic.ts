import type { TradingState } from "@t3tools/contracts";

export type Range = "1M" | "3M" | "All";
export const RANGES: readonly Range[] = ["1M", "3M", "All"];

/** The Accounts preview shows this many rows, then a "See all" link. */
export const ACCOUNT_PREVIEW_ROWS = 3;

const WHOLE = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

/** `$1,240`. Cents show only when the amount has them. */
export function formatMoney(amount: number): string {
  const absolute = Math.abs(amount);
  const text = Number.isInteger(absolute)
    ? WHOLE.format(absolute)
    : absolute.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${amount < 0 ? "-" : ""}$${text}`;
}

/** `+$468` or `-$120`. A zero has no sign. */
export function formatSigned(amount: number): string {
  return amount > 0 ? `+${formatMoney(amount)}` : formatMoney(amount);
}

export const isEmptyLedger = (state: TradingState): boolean =>
  state.accounts.length === 0 && state.attempts.length === 0 && state.moneyTimeline.length === 0;

export interface KeyNumber {
  readonly id: "net-return" | "pass-rate" | "funded-cost" | "lowest-room" | "clean-streak";
  readonly label: string;
  readonly value: string;
  readonly note: string;
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

export function keyNumbers(state: TradingState): readonly KeyNumber[] {
  const { passRate, lowestRoom, streaks } = state;
  const lowest = lowestRoom
    ? state.accounts.find((account) => account.id === lowestRoom.accountId)
    : null;
  return [
    {
      id: "net-return",
      label: "Net return",
      value: formatSigned(state.netReturn),
      note: `${formatMoney(state.payouts)} in, ${formatMoney(state.totalCost)} out`,
    },
    {
      id: "pass-rate",
      label: "Pass rate",
      value: passRate.rate === null ? "None yet" : `${Math.round(passRate.rate * 100)}%`,
      note: `${passRate.passed} of ${plural(passRate.finished, "finished Attempt")}`,
    },
    {
      id: "funded-cost",
      label: "Cost to get funded",
      value: state.averageFundedCost === null ? "None yet" : formatMoney(state.averageFundedCost),
      note: "Firm fees per Funded account",
    },
    {
      id: "lowest-room",
      label: "Lowest room",
      value: lowestRoom ? formatMoney(lowestRoom.room) : "None",
      note: lowest ? `to Drawdown · ${lowest.product} ${lowest.last4}` : "to Drawdown",
    },
    {
      id: "clean-streak",
      label: "Clean streak",
      value: plural(streaks.clean, "day"),
      note: `Best ${streaks.bestClean}`,
    },
  ];
}

export interface ChartModel {
  /** SVG point list in a 560 x 180 box, or null with fewer than two points. */
  readonly points: string | null;
  readonly area: string | null;
  readonly zeroY: number;
  readonly last: { readonly x: number; readonly y: number } | null;
  readonly axis: readonly { readonly key: string; readonly label: string; readonly odd: boolean }[];
  readonly payoutNote: string | null;
}

export const CHART_WIDTH = 560;
export const CHART_HEIGHT = 180;
const PAD = 20;
const RANGE_DAYS: Record<Range, number | null> = { "1M": 31, "3M": 92, All: null };
const DAY_MS = 86_400_000;
const AXIS_TICKS = 5;

const dayLabel = (time: number) =>
  new Date(time).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** The net return line for one range. The newest event ends the range, so it needs no clock. */
export function chartModel(state: TradingState, range: Range): ChartModel {
  const all = state.moneyTimeline.map((point) => ({ time: Date.parse(point.at), point }));
  const newest = all.reduce((max, entry) => Math.max(max, entry.time), 0);
  const days = RANGE_DAYS[range];
  const shown = days === null ? all : all.filter((entry) => entry.time >= newest - days * DAY_MS);
  const empty: ChartModel = {
    points: null,
    area: null,
    zeroY: CHART_HEIGHT / 2,
    last: null,
    axis: [],
    payoutNote: null,
  };
  if (shown.length < 2) return empty;

  const first = shown[0]!.time;
  const span = Math.max(newest - first, 1);
  const values = shown.map((entry) => entry.point.netReturn);
  const high = Math.max(0, ...values);
  const low = Math.min(0, ...values);
  const spanY = Math.max(high - low, 1);
  const y = (value: number) => PAD + ((high - value) / spanY) * (CHART_HEIGHT - PAD * 2);
  const x = (time: number) => ((time - first) / span) * CHART_WIDTH;
  const coords = shown.map((entry) => ({ x: x(entry.time), y: y(entry.point.netReturn) }));
  const line = coords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`);
  const lastCoord = coords[coords.length - 1]!;
  const biggest = shown
    .filter((entry) => entry.point.category === "payout")
    .reduce<(typeof shown)[number] | null>(
      (best, entry) => (best === null || entry.point.amount > best.point.amount ? entry : best),
      null,
    );
  return {
    points: line.join(" "),
    area: `M${line.join(" L")} L${CHART_WIDTH},${CHART_HEIGHT} L0,${CHART_HEIGHT}Z`,
    zeroY: y(0),
    last: lastCoord,
    axis: Array.from({ length: AXIS_TICKS }, (_, index) => ({
      key: `tick-${index}`,
      label: dayLabel(first + (span * index) / (AXIS_TICKS - 1)),
      odd: index % 2 === 1,
    })),
    payoutNote: biggest
      ? `Payout ${formatSigned(biggest.point.amount)} · ${dayLabel(biggest.time)}`
      : null,
  };
}

export interface AccountRow {
  readonly id: string;
  readonly title: string;
  readonly firm: string;
  readonly detail: string;
  /** 0 to 100, how far the account is toward its goal. */
  readonly percent: number;
  readonly room: string;
}

const STAGE_NAME = { sim: "Sim", evaluation: "Evaluation", funded: "Funded" } as const;

/** Open accounts with the least room first, because those need a look. */
export function accountPreview(state: TradingState) {
  const open = state.accounts.filter((account) => account.closedReason === null);
  const sorted = [...open].sort(
    (a, b) =>
      (a.roomToDrawdown ?? Number.POSITIVE_INFINITY) -
      (b.roomToDrawdown ?? Number.POSITIVE_INFINITY),
  );
  const rows: AccountRow[] = sorted.slice(0, ACCOUNT_PREVIEW_ROWS).map((account) => {
    const target = account.profitTarget;
    const percent = target ? Math.max(0, Math.min(100, (account.balanceChange / target) * 100)) : 0;
    return {
      id: account.id,
      title: `${account.size} ${account.product} · ${account.last4}`,
      firm: account.firm,
      detail: target
        ? `${formatMoney(account.balanceChange)} / ${formatMoney(target)}`
        : STAGE_NAME[account.stage],
      percent: Math.round(percent),
      room: account.roomToDrawdown === null ? "No limit" : formatMoney(account.roomToDrawdown),
    };
  });
  return { rows, total: open.length, hidden: Math.max(0, open.length - rows.length) };
}

export interface JourneyStep {
  readonly id: "sim" | "attempts" | "passed" | "funded" | "payouts";
  readonly label: string;
  readonly value: string;
  readonly note: string;
  readonly done: boolean;
}

export function journeySteps(state: TradingState): readonly JourneyStep[] {
  const open = state.attempts.filter((attempt) => attempt.result === "open").length;
  const failed = state.attempts.filter((attempt) => attempt.result === "failed").length;
  const funded = state.accounts.filter((account) => account.stage === "funded");
  const fundedOpen = funded.filter((account) => account.closedReason === null).length;
  const payoutCount = state.moneyTimeline.filter((point) => point.category === "payout").length;
  return [
    {
      id: "sim",
      label: "Sim",
      value: String(state.accounts.filter((a) => a.stage === "sim").length),
      note: "Sim accounts",
      done: state.journey !== "sim",
    },
    {
      id: "attempts",
      label: "Attempts",
      value: String(state.attempts.length),
      note: `${open} open · ${failed} failed`,
      done: state.attempts.length > 0,
    },
    {
      id: "passed",
      label: "Passed",
      value: String(state.passRate.passed),
      note:
        state.averageFundedCost === null
          ? "No Funded account yet"
          : `${formatMoney(state.averageFundedCost)} each to get funded`,
      done: state.passRate.passed > 0,
    },
    {
      id: "funded",
      label: "Funded",
      value: String(funded.length),
      note: `${fundedOpen} active now · ${funded.length - fundedOpen} lost`,
      done: funded.length > 0,
    },
    {
      id: "payouts",
      label: "Payouts",
      value: payoutCount === 0 ? "0" : `${payoutCount} · ${formatMoney(state.payouts)}`,
      note: payoutCount === 0 ? "Your first Payout is next" : "Paid so far",
      done: payoutCount > 0,
    },
  ];
}

export interface SetupRow {
  readonly setup: string;
  readonly detail: string;
  readonly winPercent: number;
}

export const setupRows = (state: TradingState): readonly SetupRow[] =>
  state.setups.map((entry) => {
    const winPercent = entry.trades === 0 ? 0 : Math.round((entry.wins / entry.trades) * 100);
    return {
      setup: entry.setup,
      detail: `${plural(entry.trades, "trade")} · ${winPercent}% wins`,
      winPercent,
    };
  });
