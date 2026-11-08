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
function isRewrite(item: ScribeHistoryItem): boolean {
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
  keep: (item: ScribeHistoryItem) => boolean = () => true,
): DayGroup[] {
  const needle = query.trim().toLowerCase();
  const groups = new Map<string, { items: ScribeHistoryItem[]; words: number; rewrites: number }>();
  for (const item of items) {
    if (hidden.has(item.id) || !keep(item)) continue;
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

/**
 * A transcript this long passes 4 lines even at the widest layout (about 140 characters a
 * line), so it starts clamped with a Show more button. Shorter text never clamps.
 */
const CLAMP_CHARS = 560;

export function isLongTranscript(text: string): boolean {
  return text.length > CLAMP_CHARS;
}

export type TakeKind = "all" | "dictations" | "rewrites";

/** The app filter value that keeps every app. */
export const ANY_APP = "";

/** "Leonidas Code.exe" and "leonidas code" are one app. */
export function appKey(app: string): string {
  return app.replaceAll(".exe", "").trim().toLowerCase();
}

/** Keeps a take that matches the type chip and the app menu. */
export function takeFilter(kind: TakeKind, app: string): (item: ScribeHistoryItem) => boolean {
  return (item) =>
    (kind === "all" || (kind === "rewrites") === isRewrite(item)) &&
    (app === ANY_APP || appKey(item.app) === app);
}

/** The apps in the loaded takes, most used first, with the name as the engine spells it. */
export function appOptions(
  items: readonly ScribeHistoryItem[],
): Array<{ readonly key: string; readonly label: string; readonly count: number }> {
  const apps = new Map<string, { label: string; count: number }>();
  for (const item of items) {
    const key = appKey(item.app);
    if (!key) continue;
    const label = item.app.replaceAll(".exe", "").trim();
    const entry = apps.get(key) ?? { label, count: 0 };
    entry.count += 1;
    // A spelling with capitals is how the app names itself. Prefer it over a lower-case import.
    if (label !== key) entry.label = label;
    apps.set(key, entry);
  }
  return [...apps].map(([key, entry]) => ({ key, ...entry })).toSorted((a, b) => b.count - a.count);
}

/** A rewrite of a fresh dictation: the dictation's text is the rewrite's selection. */
const FOLD_WINDOW_MS = 30 * 60_000;

/**
 * Rewrites whose selection is a dictation saved up to 30 minutes before. That dictation shows
 * inside the rewrite card, so the list does not show the same words twice.
 */
export function foldRewrites(items: readonly ScribeHistoryItem[]): {
  readonly sources: ReadonlySet<string>;
  readonly rewrites: ReadonlySet<string>;
} {
  const sources = new Set<string>();
  const rewrites = new Set<string>();
  // One pass to index dictations by text, so a search over thousands of rows stays linear.
  const byText = new Map<string, ScribeHistoryItem[]>();
  for (const item of items) {
    if (isRewrite(item)) continue;
    const text = item.cleanedText.trim();
    byText.set(text, [...(byText.get(text) ?? []), item]);
  }
  for (const rewrite of items) {
    if (!isRewrite(rewrite)) continue;
    const selection = rewrite.rawText.trim();
    const at = Date.parse(rewrite.at);
    if (!selection || Number.isNaN(at)) continue;
    const source = byText.get(selection)?.find((item) => {
      const time = Date.parse(item.at);
      return !sources.has(item.id) && time <= at && at - time <= FOLD_WINDOW_MS;
    });
    if (source) {
      sources.add(source.id);
      rewrites.add(rewrite.id);
    }
  }
  return { sources, rewrites };
}
