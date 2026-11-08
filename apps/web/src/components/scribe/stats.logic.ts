import type { ScribeGoals, ScribeInsights } from "@t3tools/contracts";

const WORDS = new Intl.NumberFormat("en-US");

export const formatCount = (value: number): string => WORDS.format(Math.round(value));

/** Engine times are milliseconds. A tenth of a second is the finest step a reader can use. */
export function formatSeconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)} s`;
}

/** The whole page is "no data" until the first dictation is saved. */
export function hasNoStats(insights: ScribeInsights): boolean {
  return insights.words === 0 && insights.transcripts === 0;
}

/** "18% more", "5% fewer", or null when last week has nothing to compare with. */
export function weekChange(words: number, previous: number): string | null {
  if (previous <= 0) return null;
  const percent = Math.round(((words - previous) / previous) * 100);
  if (percent === 0) return "the same as last week";
  return `${Math.abs(percent)}% ${percent > 0 ? "more" : "fewer"} than last week`;
}

/** One plain sentence about the week. The top app is named only when there is one. */
export function weekHeadline(insights: ScribeInsights): string {
  const { words, prevWords, topApp } = insights.weekly;
  if (words === 0) return "You have not dictated this week yet.";
  const change = weekChange(words, prevWords);
  const parts = [`This week you spoke ${formatCount(words)} words`];
  if (change) parts.push(change);
  const tail = topApp ? `, mostly in ${appLabel(topApp)}` : "";
  return `${parts.join(", ")}${tail}.`;
}

/** Local `YYYY-MM-DD` to a short weekday. Parsed as UTC so the zone never shifts the day. */
export function weekdayLabel(day: string): string {
  const parsed = new Date(`${day}T00:00:00Z`);
  return Number.isNaN(parsed.getTime())
    ? day
    : parsed.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
}

/** Bar heights as whole percents of the busiest day. A day with words keeps at least 4 so it shows. */
export function dayBars(
  days: ReadonlyArray<{ readonly day: string; readonly words: number }>,
): Array<{ day: string; label: string; words: number; percent: number; busiest: boolean }> {
  const max = Math.max(0, ...days.map((d) => d.words));
  return days.map((d) => ({
    day: d.day,
    label: weekdayLabel(d.day),
    words: d.words,
    percent: max === 0 ? 0 : d.words > 0 ? Math.max(4, Math.round((d.words / max) * 100)) : 0,
    busiest: max > 0 && d.words === max,
  }));
}

/** Whole percent of `have` in `need`, never above 100. */
export function percentOf(have: number, need: number): number {
  return need <= 0 ? 0 : Math.max(0, Math.min(100, Math.round((have / need) * 100)));
}

/** Rows for a "name and count" list with a bar. The first row is the longest bar. */
export function countRows(
  rows: ReadonlyArray<{ readonly key: string; readonly count: number }>,
  limit: number,
): Array<{ key: string; count: number; percent: number }> {
  const top = rows.slice(0, limit);
  const max = Math.max(0, ...top.map((r) => r.count));
  return top.map((r) => ({
    key: r.key,
    count: r.count,
    percent: max === 0 ? 0 : Math.max(3, Math.round((r.count / max) * 100)),
  }));
}

export interface LevelModel {
  readonly toNext: number;
  readonly percent: number;
  readonly nextRank: string | null;
}

export function levelModel(goals: ScribeGoals): LevelModel {
  return {
    toNext: Math.max(0, goals.levelCeil - goals.xp),
    percent: Math.max(0, Math.min(100, Math.round(goals.levelFrac * 100))),
    nextRank: goals.nextRank ? `${goals.nextRank.name} at level ${goals.nextRank.level}` : null,
  };
}

export function unlockedCount(achievements: ScribeGoals["achievements"]): number {
  return achievements.filter((a) => a.unlocked).length;
}

/** The server merges app names in lower case. Show them with capitals: "leonidas code" to "Leonidas Code". */
export function appLabel(key: string): string {
  return key.replace(/(^|\s)\p{L}/gu, (letter) => letter.toUpperCase());
}

/** The locked achievements nearest to done, closest first. */
export function nextUnlocks(
  achievements: ScribeGoals["achievements"],
  limit: number,
): ScribeGoals["achievements"] {
  return achievements
    .filter((a) => !a.unlocked)
    .toSorted((a, b) => b.have / Math.max(1, b.need) - a.have / Math.max(1, a.need))
    .slice(0, limit);
}

/**
 * Whether a stats tab must refetch for the newest saved dictation. `shown` keeps the id each
 * tab last showed, across tab switches. The first look only records it: that fetch is fresh.
 */
export function needsRefresh(
  shown: Map<string, string | undefined>,
  key: string,
  newest: string | undefined,
): boolean {
  const first = !shown.has(key);
  const changed = shown.get(key) !== newest;
  shown.set(key, newest);
  return !first && changed;
}

/** The zone is sent so "today" and the day bars match the reader's clock, not the server's. */
const readTimeZone = (): string | undefined => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
};

/** One shared object, so the two tabs and the query cache see the same input. */
export const STATS_INPUT: { readonly timeZone?: string } = (() => {
  const timeZone = readTimeZone();
  return timeZone ? { timeZone } : {};
})();
