import {
  parseEvent,
  type AccountStage,
  type CostCategory,
  type Trade,
  type TradingEvent,
} from "./events.ts";

/** The firm rules for one product. The app reads them from the linked pack. */
export interface ProductRule {
  readonly maxLoss?: number;
  readonly profitTarget?: number;
  readonly winningDayMin?: number;
  readonly drawdown?: "trailing" | "static";
}

export interface Attempt {
  readonly accountId: string;
  readonly via: "purchase" | "reset";
  readonly fee: number;
  readonly startedAt: string;
  readonly result: "open" | "passed" | "failed";
  readonly endedAt: string | null;
}

export interface AccountView {
  readonly id: string;
  readonly firm: string;
  readonly product: string;
  readonly size: string;
  readonly platform: string;
  readonly last4: string;
  readonly stage: AccountStage;
  readonly closedReason: "drawdown" | "rule" | "manual" | null;
  /** Trade result since the current Attempt or Funded account started. Never a Payout. */
  readonly balanceChange: number;
  readonly roomToDrawdown: number | null;
  readonly profitTarget: number | null;
  readonly winningDays: number | null;
  /** The share of total profit that the best day holds. Null without a profit. */
  readonly bestDayPercent: number | null;
}

export type MoneyCategory = CostCategory | "payout";

export interface MoneyPoint {
  readonly at: string;
  readonly category: MoneyCategory;
  /** Negative for a cost, positive for a Payout. */
  readonly amount: number;
  readonly netReturn: number;
}

export interface MonthTotals {
  readonly month: string;
  readonly firmFees: number;
  readonly totalCost: number;
  readonly payouts: number;
  readonly netReturn: number;
}

export interface SetupStats {
  readonly setup: string;
  readonly trades: number;
  readonly wins: number;
  readonly pnl: number;
}

export interface TradingState {
  readonly accounts: readonly AccountView[];
  readonly attempts: readonly Attempt[];
  readonly passRate: {
    readonly passed: number;
    readonly finished: number;
    readonly rate: number | null;
  };
  readonly firmFees: number;
  readonly totalCost: number;
  readonly payouts: number;
  readonly netReturn: number;
  readonly costByCategory: Readonly<Partial<Record<CostCategory, number>>>;
  readonly averageFundedCost: number | null;
  readonly lowestRoom: { readonly accountId: string; readonly room: number } | null;
  readonly moneyTimeline: readonly MoneyPoint[];
  readonly months: readonly MonthTotals[];
  readonly setups: readonly SetupStats[];
  readonly streaks: { readonly clean: number; readonly bestClean: number };
  readonly journey: "sim" | "evaluation" | "funded" | "payouts";
  /** Events that are valid alone but do not fit the history. */
  readonly issues: readonly { readonly eventId: string; readonly reason: string }[];
}

export interface DeriveInput {
  readonly events: readonly TradingEvent[];
  readonly trades: readonly Trade[];
  readonly products?: ReadonlyMap<string, ProductRule>;
}

export const productKey = (firm: string, product: string): string => `${firm}/${product}`;

const FIRM_FEE_CATEGORIES: ReadonlySet<CostCategory> = new Set([
  "evaluation",
  "reset",
  "activation",
]);

// Sums use whole cents, so repeated decimal amounts cannot drift.
export const toCents = (dollars: number): number => Math.round(dollars * 100);
const toDollars = (cents: number): number => cents / 100;

type EventIssue = { eventId: string; reason: string };

/** Applies edits and deletes, then orders the live events by time. Equal times keep ledger order. */
export function liveEvents(events: readonly TradingEvent[], issues: EventIssue[]): TradingEvent[] {
  const live = new Map<string, TradingEvent>();
  for (const event of events) {
    if (event.kind !== "entry.corrected" && event.kind !== "entry.deleted") {
      live.set(event.id, event);
    }
  }
  for (const event of events) {
    if (event.kind !== "entry.corrected" && event.kind !== "entry.deleted") continue;
    const target = live.get(event.targetId);
    if (!target) {
      issues.push({ eventId: event.id, reason: "target entry not found" });
    } else if (event.kind === "entry.deleted") {
      live.delete(event.targetId);
    } else {
      const patched = parseEvent({ ...target, ...event.patch, id: target.id, kind: target.kind });
      if (typeof patched === "string") issues.push({ eventId: event.id, reason: patched });
      else live.set(target.id, patched);
    }
  }
  return [...live.values()]
    .map((event) => ({ event, time: Date.parse(event.at) }))
    .toSorted((a, b) => a.time - b.time)
    .map(({ event }) => event);
}

interface MutableAccount {
  id: string;
  firm: string;
  product: string;
  size: string;
  platform: string;
  last4: string;
  stage: AccountStage;
  closedReason: AccountView["closedReason"];
  /** Null counts every trade: the account has no Attempt or Funded start yet. */
  startMs: number | null;
  days: Map<string, number>;
}

interface MutableAttempt {
  accountId: string;
  via: Attempt["via"];
  fee: number;
  startedAt: string;
  result: Attempt["result"];
  endedAt: string | null;
}

function accountView(account: MutableAccount, rule: ProductRule | undefined): AccountView {
  let balance = 0;
  let peak = 0;
  let bestDay = 0;
  let winningDays = 0;
  const winningMin = rule?.winningDayMin === undefined ? null : toCents(rule.winningDayMin);
  const dayKeys = [...account.days.keys()].toSorted();
  for (const day of dayKeys) {
    const cents = account.days.get(day) ?? 0;
    balance += cents;
    peak = Math.max(peak, balance);
    bestDay = Math.max(bestDay, cents);
    if (winningMin !== null && cents >= winningMin) winningDays += 1;
  }
  let room: number | null = null;
  if (rule?.maxLoss !== undefined) {
    const maxLoss = toCents(rule.maxLoss);
    // shortcut: end-of-day trailing that locks at the start balance, add intraday when a pack needs it
    const floor = rule.drawdown === "static" ? -maxLoss : -maxLoss + Math.min(peak, maxLoss);
    room = toDollars(balance - floor);
  }
  return {
    id: account.id,
    firm: account.firm,
    product: account.product,
    size: account.size,
    platform: account.platform,
    last4: account.last4,
    stage: account.stage,
    closedReason: account.closedReason,
    balanceChange: toDollars(balance),
    roomToDrawdown: room,
    profitTarget: rule?.profitTarget ?? null,
    winningDays: winningMin === null ? null : winningDays,
    bestDayPercent: balance > 0 ? Math.round((bestDay / balance) * 1000) / 10 : null,
  };
}

/** The one source of every Trading number. A pure function of the ledger, the trades and the pack rules. */
export function deriveTradingState(input: DeriveInput): TradingState {
  const issues: EventIssue[] = [];
  const accounts = new Map<string, MutableAccount>();
  const attempts: MutableAttempt[] = [];
  const openAttempts = new Map<string, MutableAttempt[]>();
  const tags = new Map<string, { setup?: string; ruleBreaks?: readonly string[] }>();
  const moneyPoints: { at: string; category: MoneyCategory; cents: number }[] = [];
  let activationCount = 0;
  let activationCents = 0;

  const addCost = (at: string, category: CostCategory, amount: number) => {
    moneyPoints.push({ at, category, cents: -toCents(amount) });
  };

  for (const event of liveEvents(input.events, issues)) {
    const time = Date.parse(event.at);
    switch (event.kind) {
      case "account.opened":
        accounts.set(event.id, {
          id: event.id,
          firm: event.firm,
          product: event.product,
          size: event.size,
          platform: event.platform,
          last4: event.last4,
          stage: event.stage,
          closedReason: null,
          startMs: null,
          days: new Map(),
        });
        break;
      case "attempt.started": {
        const attempt: MutableAttempt = {
          accountId: event.accountId,
          via: event.via,
          fee: event.fee,
          startedAt: event.at,
          result: "open",
          endedAt: null,
        };
        attempts.push(attempt);
        openAttempts.set(event.accountId, [...(openAttempts.get(event.accountId) ?? []), attempt]);
        const account = accounts.get(event.accountId);
        if (account) account.startMs = time;
        addCost(event.at, event.via === "purchase" ? "evaluation" : "reset", event.fee);
        break;
      }
      case "attempt.ended": {
        const attempt = openAttempts.get(event.accountId)?.pop();
        if (!attempt) {
          issues.push({ eventId: event.id, reason: "no open Attempt on this account" });
        } else {
          attempt.result = event.result;
          attempt.endedAt = event.at;
        }
        break;
      }
      case "funded.opened": {
        const source = accounts.get(event.fromAccountId);
        const existing = accounts.get(event.accountId);
        if (existing) {
          existing.stage = "funded";
          existing.startMs = time;
        } else if (source) {
          accounts.set(event.accountId, {
            ...source,
            id: event.accountId,
            stage: "funded",
            closedReason: null,
            startMs: time,
            days: new Map(),
          });
        } else {
          issues.push({ eventId: event.id, reason: "source account not found" });
        }
        activationCount += 1;
        activationCents += toCents(event.activationFee);
        addCost(event.at, "activation", event.activationFee);
        break;
      }
      case "account.closed": {
        const account = accounts.get(event.accountId);
        if (account) account.closedReason = event.reason;
        else issues.push({ eventId: event.id, reason: "account not found" });
        break;
      }
      case "cost.paid":
        addCost(event.at, event.category, event.amount);
        break;
      case "payout.received":
        moneyPoints.push({ at: event.at, category: "payout", cents: toCents(event.amount) });
        break;
      case "trade.tagged": {
        const tag = { ...tags.get(event.tradeId) };
        if (event.setup !== undefined) tag.setup = event.setup;
        if (event.ruleBreaks !== undefined) tag.ruleBreaks = event.ruleBreaks;
        tags.set(event.tradeId, tag);
        break;
      }
      case "entry.corrected":
      case "entry.deleted":
        break;
    }
  }

  const setups = new Map<string, { trades: number; wins: number; cents: number }>();
  const dayClean = new Map<string, boolean>();
  for (const trade of input.trades) {
    const tag = tags.get(trade.id);
    const setup = tag?.setup ?? trade.setup;
    const ruleBreaks = tag?.ruleBreaks ?? trade.ruleBreaks ?? [];
    const cents = toCents(trade.pnl);
    dayClean.set(trade.day, (dayClean.get(trade.day) ?? true) && ruleBreaks.length === 0);
    if (setup !== undefined) {
      const stats = setups.get(setup) ?? { trades: 0, wins: 0, cents: 0 };
      stats.trades += 1;
      stats.wins += cents > 0 ? 1 : 0;
      stats.cents += cents;
      setups.set(setup, stats);
    }
    const account = accounts.get(trade.accountId);
    if (account && (account.startMs === null || Date.parse(trade.at) >= account.startMs)) {
      account.days.set(trade.day, (account.days.get(trade.day) ?? 0) + cents);
    }
  }

  let firmFeeCents = 0;
  let totalCostCents = 0;
  let payoutCents = 0;
  let runningCents = 0;
  const categoryCents = new Map<CostCategory, number>();
  const monthCents = new Map<string, { firm: number; total: number; payouts: number }>();
  const moneyTimeline: MoneyPoint[] = [];
  for (const point of moneyPoints) {
    const month = point.at.slice(0, 7);
    const totals = monthCents.get(month) ?? { firm: 0, total: 0, payouts: 0 };
    if (point.category === "payout") {
      payoutCents += point.cents;
      totals.payouts += point.cents;
    } else {
      const cost = -point.cents;
      totalCostCents += cost;
      totals.total += cost;
      categoryCents.set(point.category, (categoryCents.get(point.category) ?? 0) + cost);
      if (FIRM_FEE_CATEGORIES.has(point.category)) {
        firmFeeCents += cost;
        totals.firm += cost;
      }
    }
    monthCents.set(month, totals);
    runningCents += point.cents;
    moneyTimeline.push({
      at: point.at,
      category: point.category,
      amount: toDollars(point.cents),
      netReturn: toDollars(runningCents),
    });
  }

  const finished = attempts.filter((attempt) => attempt.result !== "open");
  const passed = finished.filter((attempt) => attempt.result === "passed").length;
  const finishedFeeCents = finished.reduce((sum, attempt) => sum + toCents(attempt.fee), 0);
  // Average Evaluation fee divided by Pass rate reduces to finished fees divided by passes.
  const averageFundedCost =
    passed === 0
      ? null
      : toDollars(
          Math.round(
            finishedFeeCents / passed +
              (activationCount === 0 ? 0 : activationCents / activationCount),
          ),
        );

  const accountViews = [...accounts.values()].map((account) =>
    accountView(account, input.products?.get(productKey(account.firm, account.product))),
  );

  let lowestRoom: TradingState["lowestRoom"] = null;
  for (const view of accountViews) {
    if (view.closedReason !== null || view.stage === "sim" || view.roomToDrawdown === null)
      continue;
    if (lowestRoom === null || view.roomToDrawdown < lowestRoom.room) {
      lowestRoom = { accountId: view.id, room: view.roomToDrawdown };
    }
  }

  let clean = 0;
  let bestClean = 0;
  for (const day of [...dayClean.keys()].toSorted()) {
    clean = dayClean.get(day) ? clean + 1 : 0;
    bestClean = Math.max(bestClean, clean);
  }

  const journey: TradingState["journey"] =
    payoutCents > 0
      ? "payouts"
      : accountViews.some((view) => view.stage === "funded")
        ? "funded"
        : attempts.length > 0 || accountViews.some((view) => view.stage === "evaluation")
          ? "evaluation"
          : "sim";

  return {
    accounts: accountViews,
    attempts,
    passRate: {
      passed,
      finished: finished.length,
      rate: finished.length ? passed / finished.length : null,
    },
    firmFees: toDollars(firmFeeCents),
    totalCost: toDollars(totalCostCents),
    payouts: toDollars(payoutCents),
    netReturn: toDollars(payoutCents - totalCostCents),
    costByCategory: Object.fromEntries(
      [...categoryCents].map(([category, cents]) => [category, toDollars(cents)]),
    ),
    averageFundedCost,
    lowestRoom,
    moneyTimeline,
    months: [...monthCents]
      .toSorted(([a], [b]) => a.localeCompare(b))
      .map(([month, totals]) => ({
        month,
        firmFees: toDollars(totals.firm),
        totalCost: toDollars(totals.total),
        payouts: toDollars(totals.payouts),
        netReturn: toDollars(totals.payouts - totals.total),
      })),
    setups: [...setups]
      .toSorted(([a], [b]) => a.localeCompare(b))
      .map(([setup, stats]) => ({
        setup,
        trades: stats.trades,
        wins: stats.wins,
        pnl: toDollars(stats.cents),
      })),
    streaks: { clean, bestClean },
    journey,
    issues,
  };
}
