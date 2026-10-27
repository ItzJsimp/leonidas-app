import type { ScribeHistoryItem } from "@t3tools/contracts";

/** Shared by the Insights and Goals ports: local-day math without `new Date`. */

const DAY_MS = 86_400_000;

/** Maps an instant to the local `YYYY-MM-DD` of `timeZone` (the server zone when omitted). */
export const makeDayOf = (timeZone?: string): ((ms: number) => string) => {
  const format = new Intl.DateTimeFormat("en-US", {
    ...(timeZone === undefined ? {} : { timeZone }),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return (ms) => {
    const parts: Record<string, string> = {};
    for (const part of format.formatToParts(ms)) parts[part.type] = part.value;
    return `${parts.year}-${parts.month}-${parts.day}`;
  };
};

const utcDayOf = makeDayOf("UTC");

export const dayNumber = (day: string): number => {
  const [y, m, d] = day.split("-").map(Number);
  return Date.UTC(y as number, (m as number) - 1, d as number) / DAY_MS;
};

export const addDays = (day: string, n: number): string => utcDayOf((dayNumber(day) + n) * DAY_MS);

/** Python `str.split()` count: runs of non-space characters. */
export const countWords = (text: string): number => (text.match(/\S+/g) ?? []).length;

/**
 * The engine lists newest first. The Python code walks history oldest first, and its
 * tie-breaks (top app, mode order) depend on that order, so restore it here.
 */
export const oldestFirst = (
  items: ReadonlyArray<ScribeHistoryItem>,
): Array<{ item: ScribeHistoryItem; ms: number }> =>
  items
    .map((item) => ({ item, ms: Date.parse(item.at) }))
    .filter((row) => Number.isFinite(row.ms))
    .reverse()
    .sort((a, b) => a.ms - b.ms);
