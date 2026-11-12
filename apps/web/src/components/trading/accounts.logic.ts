import type { TradingAccountView, TradingState } from "@t3tools/contracts";

import { accountLabel } from "./addMenu.logic";

export type AccountFilter = "all" | "sim" | "evaluation" | "funded" | "closed";

export const ACCOUNT_FILTERS: readonly { readonly id: AccountFilter; readonly label: string }[] = [
  { id: "all", label: "All" },
  { id: "sim", label: "Sim" },
  { id: "evaluation", label: "Evaluation" },
  { id: "funded", label: "Funded" },
  { id: "closed", label: "Closed history" },
];

export const STAGE_LABEL = {
  sim: "Sim",
  evaluation: "Evaluation",
  funded: "Funded",
  closed: "Closed",
} as const;

/** The stage chip: Closed once an account has a closed reason, else its stage. */
export const stageOf = (account: TradingAccountView): keyof typeof STAGE_LABEL =>
  account.closedReason === null ? account.stage : "closed";

/** Closed accounts show only under the Closed chip. */
export function matchesFilter(account: TradingAccountView, filter: AccountFilter): boolean {
  if (filter === "closed") return account.closedReason !== null;
  if (account.closedReason !== null) return false;
  return filter === "all" || account.stage === filter;
}

/** Matches firm, product and last four digits. An empty search matches all. */
export function matchesQuery(account: TradingAccountView, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (needle === "") return true;
  return `${account.firm} ${account.product} ${account.last4}`.toLowerCase().includes(needle);
}

// 0: open with a room number, 1: open without one, 2: closed.
const urgencyRank = (account: TradingAccountView): number =>
  account.closedReason !== null ? 2 : account.roomToDrawdown === null ? 1 : 0;

/** Most urgent first: least room to Drawdown, then no room, then closed. Ties by name. */
export function sortAccounts(accounts: readonly TradingAccountView[]): TradingAccountView[] {
  return accounts.toSorted((a, b) => {
    const rank = urgencyRank(a) - urgencyRank(b);
    if (rank !== 0) return rank;
    if (urgencyRank(a) === 0) {
      const room = (a.roomToDrawdown ?? 0) - (b.roomToDrawdown ?? 0);
      if (room !== 0) return room;
    }
    return accountLabel(a).localeCompare(accountLabel(b));
  });
}

export const LIST_KEYS: ReadonlySet<string> = new Set(["ArrowUp", "ArrowDown", "Home", "End"]);

/** The id a list key selects. With no selection, Down picks the first and Up the last. */
export function nextSelection(
  ids: readonly string[],
  current: string | null,
  key: string,
): string | null {
  const last = ids.length - 1;
  if (last < 0) return null;
  const index = current === null ? -1 : ids.indexOf(current);
  switch (key) {
    case "ArrowDown":
      return ids[index < 0 ? 0 : Math.min(index + 1, last)] ?? null;
    case "ArrowUp":
      return ids[index < 0 ? last : Math.max(index - 1, 0)] ?? null;
    case "Home":
      return ids[0] ?? null;
    case "End":
      return ids[last] ?? null;
    default:
      return current;
  }
}

/** Share of the profit target reached, from 0 to 100. Null without a target. */
export function targetProgress(account: TradingAccountView): number | null {
  if (account.profitTarget === null || account.profitTarget <= 0) return null;
  const share = (account.balanceChange / account.profitTarget) * 100;
  return Math.max(0, Math.min(100, Math.round(share)));
}

/** Best day as a share of the pack limit, capped at 100. Over when the best day is above the limit. */
export function consistencyProgress(
  account: TradingAccountView,
): { readonly percent: number; readonly over: boolean } | null {
  const limit = account.consistencyPercent;
  if (limit === null || limit <= 0) return null;
  const best = account.bestDayPercent ?? 0;
  return { percent: Math.min(100, Math.round((best / limit) * 100)), over: best > limit };
}

// Same set as FIRM_FEE_CATEGORIES in packages/trading/src/derive.ts.
const FIRM_FEE = new Set(["evaluation", "reset", "activation"]);

/** Firm fees and Payouts of one account, in dollars, from the money timeline. */
export function accountMoney(state: TradingState, accountId: string) {
  let feeCents = 0;
  let payoutCents = 0;
  const payouts: { readonly at: string; readonly amount: number }[] = [];
  for (const point of state.moneyTimeline) {
    if (point.accountId !== accountId) continue;
    if (point.category === "payout") {
      payoutCents += Math.round(point.amount * 100);
      payouts.push({ at: point.at, amount: point.amount });
    } else if (FIRM_FEE.has(point.category)) {
      feeCents += Math.round(-point.amount * 100);
    }
  }
  return { firmFees: feeCents / 100, payoutTotal: payoutCents / 100, payouts };
}
