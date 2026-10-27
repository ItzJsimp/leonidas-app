import type { ScribeHistoryItem } from "@t3tools/contracts";

/** Days a page shows before "Show older days". Same numbers as the Qt Transcripts page. */
export const DAYS_PER_PAGE = 5;
/** Cards a day shows before "Show all". */
export const ITEMS_PER_DAY = 10;

export interface DayGroup {
  readonly day: string;
  readonly items: readonly ScribeHistoryItem[];
  readonly words: number;
  readonly rewrites: number;
}

/** "3 dictations · 1 rewrite · 120 words" for a day header. */
export function daySummary(group: DayGroup): string {
  const dictations = group.items.length - group.rewrites;
  const parts = [];
  if (dictations > 0 || group.rewrites === 0) {
    parts.push(`${dictations} ${dictations === 1 ? "dictation" : "dictations"}`);
  }
  if (group.rewrites > 0) {
    parts.push(`${group.rewrites} ${group.rewrites === 1 ? "rewrite" : "rewrites"}`);
  }
  parts.push(`${group.words.toLocaleString("en-US")} ${group.words === 1 ? "word" : "words"}`);
  return parts.join(" · ");
}

const pad = (value: number) => String(value).padStart(2, "0");

/** The local calendar day of an ISO time as `YYYY-MM-DD`, or "" when the time is unreadable. */
export function dayKey(at: string): string {
  const time = new Date(at);
  if (Number.isNaN(time.getTime())) return "";
  return `${time.getFullYear()}-${pad(time.getMonth() + 1)}-${pad(time.getDate())}`;
}

function ordinal(day: number): string {
  if (day % 100 >= 11 && day % 100 <= 13) return `${day}th`;
  return `${day}${({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[day % 10] ?? "th"}`;
}

/** "Today", "Yesterday", then "Wednesday, September 23rd, 2026". */
export function dayLabel(day: string, today: Date = new Date()): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) return day || "Undated";
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (Number.isNaN(date.getTime())) return day;
  const sameDay = (other: Date) =>
    date.getFullYear() === other.getFullYear() &&
    date.getMonth() === other.getMonth() &&
    date.getDate() === other.getDate();
  if (sameDay(today)) return "Today";
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  if (sameDay(yesterday)) return "Yesterday";
  const weekday = date.toLocaleDateString("en-US", { weekday: "long" });
  const month = date.toLocaleDateString("en-US", { month: "long" });
  return `${weekday}, ${month} ${ordinal(date.getDate())}, ${date.getFullYear()}`;
}

/** A rewrite of selected text (contract v1.4): `rawText` is the selection, `cleanedText` the result. */
export function isRewrite(item: ScribeHistoryItem): boolean {
  return item.mode === "rewrite";
}

/** "Rewrite: Shorter", or "Rewrite" when the item has no preset name. Null for a dictation. */
export function rewriteLabel(item: ScribeHistoryItem): string | null {
  if (!isRewrite(item)) return null;
  // `preset` is optional and not in the shared contract yet, so read it defensively.
  const preset: unknown = (item as { preset?: unknown }).preset;
  return typeof preset === "string" && preset.trim() ? `Rewrite: ${preset.trim()}` : "Rewrite";
}

/** Spoken words: the raw words, or the cleaned words when the raw text is empty. A rewrite has none. */
export function spokenWords(item: ScribeHistoryItem): number {
  if (isRewrite(item)) return 0;
  const text = item.rawText.trim() ? item.rawText : item.cleanedText;
  return text.replaceAll("⏸", " ").split(/\s+/).filter(Boolean).length;
}

/**
 * Newest-first items into day groups. `hidden` holds ids that wait behind an Undo toast.
 * A search matches the cleaned or the raw text, ignoring case.
 */
export function groupByDay(
  items: readonly ScribeHistoryItem[],
  query: string,
  hidden: ReadonlySet<string>,
): DayGroup[] {
  const needle = query.trim().toLowerCase();
  const groups = new Map<string, { items: ScribeHistoryItem[]; words: number; rewrites: number }>();
  for (const item of items) {
    if (hidden.has(item.id)) continue;
    if (
      needle &&
      !item.cleanedText.toLowerCase().includes(needle) &&
      !item.rawText.toLowerCase().includes(needle)
    ) {
      continue;
    }
    const key = dayKey(item.at);
    const group = groups.get(key) ?? { items: [], words: 0, rewrites: 0 };
    group.items.push(item);
    group.words += spokenWords(item);
    if (isRewrite(item)) group.rewrites += 1;
    groups.set(key, group);
  }
  return [...groups].map(([day, group]) => ({ day, ...group }));
}

export function visibleDayItems(group: DayGroup, open: boolean): readonly ScribeHistoryItem[] {
  return open ? group.items : group.items.slice(0, ITEMS_PER_DAY);
}

/** The "Show older days" button text, or null when every day is already shown. */
export function moreDaysLabel(totalDays: number, shown: number): string | null {
  const remaining = totalDays - shown;
  if (remaining <= 0) return null;
  const step = Math.min(DAYS_PER_PAGE, remaining);
  return `Show ${step} older ${remaining === 1 ? "day" : "days"} of ${remaining.toLocaleString("en-US")}`;
}

/** Live saves first, then the loaded pages, with no id twice and no deleted id. */
export function mergeTranscripts(
  saved: readonly ScribeHistoryItem[],
  loaded: readonly ScribeHistoryItem[],
  deleted: ReadonlySet<string>,
): ScribeHistoryItem[] {
  const seen = new Set<string>();
  const out: ScribeHistoryItem[] = [];
  for (const item of [...saved, ...loaded]) {
    if (seen.has(item.id) || deleted.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}

/** The time of day as `7:45 PM` (12-hour clock, local time). */
export function timeLabel(at: string): string {
  const time = new Date(at);
  if (Number.isNaN(time.getTime())) return "";
  const hours = time.getHours();
  return `${hours % 12 === 0 ? 12 : hours % 12}:${pad(time.getMinutes())} ${hours < 12 ? "AM" : "PM"}`;
}
