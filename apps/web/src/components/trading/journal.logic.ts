import type { TradingAccountView, TradingImportFile, TradingTradeView } from "@t3tools/contracts";

/** How to get a Trades export out of TopstepX. The Journal shows these steps in order. */
export const TOPSTEPX_EXPORT_STEPS = [
  "Open TopstepX and pick the account.",
  "Open the Trades tab, not Orders.",
  "Select Export.",
  "Pick the date range, for example today.",
  "Save the file in your Downloads folder. Leonidas finds it.",
] as const;

export interface JournalDay {
  readonly day: string;
  readonly pnl: number;
  readonly trades: readonly TradingTradeView[];
}

/** Trades by trade day, newest day first. Inside a day, trades keep time order. */
export function tradesByDay(trades: readonly TradingTradeView[]): readonly JournalDay[] {
  const byDay = new Map<string, TradingTradeView[]>();
  for (const trade of trades) {
    const list = byDay.get(trade.day);
    if (list) list.push(trade);
    else byDay.set(trade.day, [trade]);
  }
  return [...byDay.entries()]
    .toSorted(([a], [b]) => b.localeCompare(a))
    .map(([day, list]) => ({
      day,
      // Whole cents, so the day total cannot drift.
      pnl: list.reduce((sum, trade) => sum + Math.round(trade.pnl * 100), 0) / 100,
      trades: list.toSorted((a, b) => Date.parse(a.at) - Date.parse(b.at)),
    }));
}

/** Open accounts, the ones an import can go to. */
export const importAccounts = (
  accounts: readonly TradingAccountView[],
): readonly TradingAccountView[] => accounts.filter((account) => account.closedReason === null);

export const accountLabel = (account: TradingAccountView): string =>
  `${account.firm} ${account.product} ${account.last4}`;

const DAY_FORMAT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

/** "2026-11-04" to "Nov 4". */
export const formatDay = (day: string): string => DAY_FORMAT.format(new Date(`${day}T00:00:00Z`));

/** The time of day as the export wrote it, for example "10:30". */
export const tradeTime = (at: string): string => at.slice(11, 16);

/** "12 trades, Nov 4" or "1 trade, Nov 3 to Nov 4". */
export function importSummary(file: TradingImportFile): string {
  const count = `${file.trades} ${file.trades === 1 ? "trade" : "trades"}`;
  if (!file.firstDay || !file.lastDay) return count;
  const span =
    file.firstDay === file.lastDay
      ? formatDay(file.firstDay)
      : `${formatDay(file.firstDay)} to ${formatDay(file.lastDay)}`;
  return `${count}, ${span}`;
}

/** What failed and what to do next, for each import error reason. */
export function importErrorText(reason: string | undefined): string {
  switch (reason) {
    case "file_not_found":
      return "The file is no longer in Downloads. Export it again.";
    case "not_an_export":
      return "This file is not a TopstepX Trades export.";
    case "unknown_account":
      return "That account is closed or gone. Pick an open account.";
    default:
      return "The import failed. Try again.";
  }
}
