import type { ScribeHistoryItem, ScribeInsights } from "@t3tools/contracts";

import { addDays, countWords, makeDayOf, oldestFirst } from "./statsDays.ts";

/**
 * Port of `load_insights` (Python Scribe, controllers/dashboard_controller.py), over engine history.
 * Dropped because the engine has no data for them: audio minutes, speaking pace, time saved,
 * typing speed, the latency radar and drift alerts (they need model names and lens).
 */

const percentile = (values: ReadonlyArray<number>, p: number): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length * p) / 100))] as number;
};

const bump = (map: Map<string, number>, key: string) => map.set(key, (map.get(key) ?? 0) + 1);

/** Python `Counter.most_common`: count descending, ties in first-seen order. */
const mostCommon = (map: ReadonlyMap<string, number>, limit?: number) =>
  [...map]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key, count]) => ({ key, count }));

const sum = (values: ReadonlyArray<number>) => values.reduce((a, b) => a + b, 0);

/** `items` come newest first, as the engine lists them. */
export function computeInsights(
  items: ReadonlyArray<ScribeHistoryItem>,
  now: number,
  timeZone?: string,
): Omit<ScribeInsights, "truncated"> {
  const dayOf = makeDayOf(timeZone);
  const byDay = new Map<string, number>();
  const dictationsByDay = new Map<string, number>();
  const wordsByDay = new Map<string, number>();
  const byMode = new Map<string, number>();
  const byApp = new Map<string, number>();
  const appByDay = new Map<string, Map<string, number>>();
  const totalsByDay = new Map<string, number[]>();
  const totals: number[] = [];
  const stts: number[] = [];
  const polishes: number[] = [];
  let words = 0;
  let transcripts = 0;
  let firstDay: string | null = null;
  let lastDay: string | null = null;

  for (const { item, ms } of oldestFirst(items)) {
    transcripts += 1;
    const textOnly = item.mode === "rewrite";
    // Words you spoke: the raw text of dictations. Rewrites and polish edits are not dictation.
    const rowWords = textOnly ? 0 : countWords(item.rawText.replaceAll("⏸", " "));
    words += rowWords;
    const day = dayOf(ms);
    if (!textOnly) bump(dictationsByDay, day);
    bump(byDay, day);
    wordsByDay.set(day, (wordsByDay.get(day) ?? 0) + rowWords);
    if (firstDay === null || day < firstDay) firstDay = day;
    if (lastDay === null || day > lastDay) lastDay = day;
    bump(byMode, item.mode);
    const app = item.app.replaceAll(".exe", "");
    if (app) {
      bump(byApp, app);
      const apps = appByDay.get(day) ?? new Map<string, number>();
      bump(apps, app);
      appByDay.set(day, apps);
    }
    if (item.metrics.totalMs && !textOnly) {
      totals.push(item.metrics.totalMs);
      const list = totalsByDay.get(day) ?? [];
      list.push(item.metrics.totalMs);
      totalsByDay.set(day, list);
      stts.push(item.metrics.transcribeMs);
      polishes.push(item.metrics.polishMs);
    }
  }

  const today = dayOf(now);
  // Streak: days in a row with any saved item, still alive while today has not started.
  let streakDay = byDay.has(today) ? today : addDays(today, -1);
  let streakDays = 0;
  while (byDay.has(streakDay)) {
    streakDays += 1;
    streakDay = addDays(streakDay, -1);
  }

  const dayRange = (from: number, to: number) =>
    Array.from({ length: to - from }, (_, i) => addDays(today, -(from + i)));
  const week = dayRange(0, 7);
  const prev = dayRange(7, 14);
  const wordsOf = (days: ReadonlyArray<string>) => sum(days.map((d) => wordsByDay.get(d) ?? 0));
  const countOf = (days: ReadonlyArray<string>) => sum(days.map((d) => byDay.get(d) ?? 0));
  const totalsOf = (days: ReadonlyArray<string>) => days.flatMap((d) => totalsByDay.get(d) ?? []);
  const weekApps = new Map<string, number>();
  for (const d of week) {
    for (const [app, n] of appByDay.get(d) ?? []) weekApps.set(app, (weekApps.get(app) ?? 0) + n);
  }

  const sttTotal = sum(stts);
  const legTotal = sttTotal + sum(polishes);
  return {
    words,
    transcripts,
    daysActive: byDay.size,
    firstDay,
    lastDay,
    todayWords: wordsByDay.get(today) ?? 0,
    todayTranscripts: dictationsByDay.get(today) ?? 0,
    streakDays,
    weekAvgWords: Math.trunc(wordsOf(dayRange(1, 8)) / 7),
    weekly: {
      words: wordsOf(week),
      prevWords: wordsOf(prev),
      transcripts: countOf(week),
      prevTranscripts: countOf(prev),
      p50: percentile(totalsOf(week), 50),
      prevP50: percentile(totalsOf(prev), 50),
      topApp: mostCommon(weekApps, 1)[0]?.key ?? "",
      days: [...week].reverse().map((day) => ({ day, words: wordsByDay.get(day) ?? 0 })),
    },
    latencySamples: totals.length,
    p50: percentile(totals, 50),
    p90: percentile(totals, 90),
    sttP50: percentile(stts, 50),
    polishP50: percentile(polishes, 50),
    sttShare: legTotal ? (sttTotal / legTotal) * 100 : 0,
    polishShare: legTotal ? (sum(polishes) / legTotal) * 100 : 0,
    byDay: Object.fromEntries(byDay),
    byMode: mostCommon(byMode),
    byApp: mostCommon(byApp, 8),
  };
}
