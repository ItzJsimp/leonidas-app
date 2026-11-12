import type { TradingAccountView, TradingImportFile, TradingTradeView } from "@t3tools/contracts";

import { randomUUID } from "../../lib/utils";

import { localDay, stampAt, type ClientEvent } from "./addMenu.logic";

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

export const RULE_CHECK_WAITING = "Rule check waits for market data";

/** The rule check line for one trade: its setup and rule breaks, once the pack check graded it. */
export function gradeLine(trade: TradingTradeView): string | null {
  if (trade.check !== "graded" || !trade.setup) return null;
  const breaks = trade.ruleBreaks ?? [];
  return breaks.length === 0
    ? `${trade.setup}, no rule breaks`
    : `${trade.setup}: ${breaks.join(", ")}`;
}

/** What the toast says about the rule check after an import. Null says nothing. */
export function importCheckText(check: string): string | null {
  switch (check) {
    case "waiting":
      return RULE_CHECK_WAITING;
    case "graded":
      return "Rule check done";
    case "failed":
      return "The rule check could not run. The trades are saved.";
    case "pending":
      return "Allow the rule check to grade new trades.";
    default:
      return null;
  }
}

/** Open accounts, the ones an import can go to. */
export const importAccounts = (
  accounts: readonly TradingAccountView[],
): readonly TradingAccountView[] => accounts.filter((account) => account.closedReason === null);

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

/** The note starts with these three headings, so a new day has a place for each. */
export const DAY_NOTE_TEMPLATE = "## What went well\n\n## What to fix\n\n## How I felt\n";
/** The server refuses a longer note. The editor stops at the same length. */
export const NOTE_LIMIT = 20_000;

interface DayRow {
  readonly day: string;
  readonly count: number;
  readonly pnl: number;
  /** Rule breaks counted over the day's trades. */
  readonly breaks: number;
}

/** One row per day with trades, plus today, newest first. Today shows even with no trades yet. */
export function dayRows(trades: readonly TradingTradeView[], today: string): readonly DayRow[] {
  const byDay = new Map<string, JournalDay>(tradesByDay(trades).map((day) => [day.day, day]));
  if (!byDay.has(today)) byDay.set(today, { day: today, pnl: 0, trades: [] });
  return [...byDay.values()]
    .toSorted((a, b) => b.day.localeCompare(a.day))
    .map((day) => ({
      day: day.day,
      count: day.trades.length,
      pnl: day.pnl,
      breaks: day.trades.reduce((sum, trade) => sum + (trade.ruleBreaks?.length ?? 0), 0),
    }));
}

/** The first column of a trade row: its time, or "Manual" for a trade the trader typed in. */
export const tradeWhen = (trade: TradingTradeView): string =>
  trade.id.startsWith("manual-") ? "Manual" : tradeTime(trade.at);

/** Setup names for the tag menu. A setup already on the trade stays listed, even if the pack lost it. */
export function setupChoices(
  setups: readonly { readonly name: string }[],
  current: string | undefined,
): readonly (readonly [string, string])[] {
  const names = setups.map((setup) => setup.name);
  if (current !== undefined && !names.includes(current)) names.unshift(current);
  return names.map((name) => [name, name] as const);
}

/** The event that tags one trade with a setup. The server sets the author. */
export function buildTagEvent(tradeId: string, setup: string, now: Date = new Date()): ClientEvent {
  return {
    id: randomUUID(),
    at: stampAt(localDay(now), now),
    kind: "trade.tagged",
    tradeId,
    setup,
  };
}

/** A rough size in tokens: about one token for every four characters. */
export const tokenEstimate = (characters: number): number => Math.ceil(characters / 4);

/** The prompt for Review with AI. It names the day's files; the thread reads them in the workspace. */
export const reviewPrompt = (day: string): string =>
  `Review my trading day ${day}. Read trading/days/${day}.md for my notes, then the trades for ${day} in trading/trades.jsonl. Say what went well, which rules I broke, and what to do next.`;

/** The day and file name of a saved screenshot path, or null when the path is not one we wrote. */
export function screenshotParts(
  path: string,
): { readonly day: string; readonly name: string } | null {
  const match = /^screenshots\/(\d{4}-\d{2}-\d{2})\/([0-9a-f]{32}\.(?:png|jpg|webp))$/.exec(path);
  if (!match?.[1] || !match[2]) return null;
  return { day: match[1], name: match[2] };
}

/** What a Journal save failed on, in plain words. */
export function journalErrorText(reason: string | undefined): string {
  switch (reason) {
    case "unknown_account":
      return "That account is closed or gone. Pick an open account.";
    case "invalid_trade":
      return "Check the trade. Each number must be a real number.";
    case "invalid_day":
      return "Pick a valid day.";
    case "note_too_long":
      return "The note is longer than 20,000 characters. Shorten it.";
    case "unknown_trade":
      return "That trade is not in this Trading workspace.";
    case "unsupported_image":
      return "Paste a PNG, JPG or WebP image.";
    case "image_too_large":
      return "The image is larger than 5 MB. Paste a smaller image.";
    case "image_mismatch":
      return "That file is not the image type it claims to be.";
    default:
      return "Could not save. Try again.";
  }
}

/** The reason a server error carries, such as `unknown_account`, or undefined. */
export function errorReason(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("reason" in error)) return undefined;
  return typeof error.reason === "string" ? error.reason : undefined;
}

/** The picture types the Journal accepts for a screenshot. */
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export const isImageType = (type: string): type is (typeof IMAGE_TYPES)[number] =>
  (IMAGE_TYPES as readonly string[]).includes(type);
