import type { TradingCrewCard, TradingCrewResult, TradingShareSettings } from "@t3tools/contracts";

import { formatMoney } from "./dashboard.logic";

export const STAGE_TEXT: Readonly<Record<"sim" | "evaluation" | "funded" | "payouts", string>> = {
  sim: "Sim",
  evaluation: "Evaluation",
  funded: "Funded",
  payouts: "Payouts",
};

/** The share groups, in the order the tab lists them. Payouts and money are off by default. */
export const SHARE_GROUPS: readonly {
  readonly key: keyof TradingShareSettings;
  readonly label: string;
  readonly note: string;
}[] = [
  { key: "journey", label: "Journey progress", note: "Your stage, Pass rate and account counts." },
  { key: "habits", label: "Habit stats", note: "Clean streak and days you traded." },
  {
    key: "payouts",
    label: "Payouts",
    note: "How many Payouts you took and their total in dollars.",
  },
  { key: "money", label: "Money", note: "Firm fees, Total cost and net return in dollars." },
];

/** "Never synced", "Synced just now", "Synced 5 minutes ago". The clock is a parameter for tests. */
export function syncedText(iso: string | null, nowMs: number): string {
  if (iso === null) return "Never synced";
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "Never synced";
  const minutes = Math.max(0, Math.floor((nowMs - then) / 60_000));
  if (minutes < 1) return "Synced just now";
  if (minutes < 60) return `Synced ${minutes} ${minutes === 1 ? "minute" : "minutes"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `Synced ${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  return `Synced ${Math.floor(hours / 24)} days ago`;
}

/** The line over the board. Offline shows the last sync time, so the trader knows how old the stats are. */
export function statusLine(
  result: Pick<TradingCrewResult, "status" | "lastSyncAt" | "detail">,
  nowMs: number,
): { readonly text: string; readonly problem: boolean } {
  const last = syncedText(result.lastSyncAt, nowMs);
  switch (result.status) {
    case "offline":
      return { text: `No network. ${last}.`, problem: true };
    case "no_remote":
      return { text: `The pack has no remote to sync with. ${last}.`, problem: true };
    case "error":
      return { text: `Sync stopped. ${result.detail ?? "Try again."} ${last}.`, problem: true };
    default:
      return { text: last, problem: false };
  }
}

/** The trader's own card first, then the others by name. */
export function sortCards(
  cards: readonly TradingCrewCard[],
  self: string | null,
): TradingCrewCard[] {
  return cards.toSorted((a, b) => {
    if (a.trader === self) return -1;
    if (b.trader === self) return 1;
    return a.name.localeCompare(b.name);
  });
}

export const passRateText = (passed: number, finished: number): string =>
  finished === 0
    ? "No finished Attempts"
    : `${Math.round((passed / finished) * 100)}% (${passed} of ${finished})`;

/** The lines of one card. Only shared groups show. */
export function cardRows(card: TradingCrewCard): readonly { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = [];
  if (card.journey) {
    rows.push({ label: "Stage", value: STAGE_TEXT[card.journey.stage] });
    rows.push({
      label: "Pass rate",
      value: passRateText(card.journey.passRate.passed, card.journey.passRate.finished),
    });
    const { sim, evaluation, funded } = card.journey.accounts;
    rows.push({
      label: "Accounts",
      value: `${sim} Sim, ${evaluation} Evaluation, ${funded} Funded`,
    });
  }
  if (card.habits) {
    rows.push({
      label: "Clean streak",
      value: `${card.habits.cleanStreak} (best ${card.habits.bestClean})`,
    });
    rows.push({ label: "Days traded", value: String(card.habits.tradingDays) });
  }
  if (card.payouts) {
    rows.push({
      label: "Payouts",
      value: `${card.payouts.count}, ${formatMoney(card.payouts.total)}`,
    });
  }
  if (card.money) {
    rows.push({ label: "Firm fees", value: formatMoney(card.money.firmFees) });
    rows.push({ label: "Total cost", value: formatMoney(card.money.totalCost) });
    rows.push({ label: "Net return", value: formatMoney(card.money.netReturn) });
  }
  return rows;
}

/** A name the server accepts: 1 to 40 characters with a letter or digit in it. */
export const validName = (name: string): boolean =>
  name.trim().length > 0 && name.trim().length <= 40 && /[a-z0-9]/i.test(name);
