import type { FoldedFeedEvent, TaskBoardHomeArea } from "@t3tools/contracts";

import { areaLabel, changedLabel } from "../twoState/areaRows";

const DAY = 24 * 60 * 60_000;
const startOfDay = (ms: number) => new Date(ms).setHours(0, 0, 0, 0);

export interface TaskCounts {
  readonly todo: number;
  readonly inProgress: number;
  readonly review: number;
  readonly blocked: number;
}

/** "9:14 AM" today, "yesterday", else "Oct 18". */
export function sinceLabel(at: number, now: number): string {
  const days = Math.round((startOfDay(now) - startOfDay(at)) / DAY);
  if (days <= 0) {
    return new Date(at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  }
  if (days === 1) return "yesterday";
  return new Date(at).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export type SegmentTone = "foreground" | "muted" | "info" | "warning";

export interface StatusRow {
  readonly key: keyof TaskCounts;
  readonly label: string;
  readonly value: number;
  readonly tone: SegmentTone;
}

const STATUS_ROWS: ReadonlyArray<Pick<StatusRow, "key" | "label" | "tone">> = [
  { key: "inProgress", label: "In progress", tone: "foreground" },
  { key: "todo", label: "To do", tone: "muted" },
  { key: "review", label: "In review", tone: "info" },
  { key: "blocked", label: "Blocked", tone: "warning" },
];

/** The bar holds the statuses that have tasks; the legend always lists all four. */
export function statusSegments(counts: TaskCounts): {
  readonly total: number;
  readonly segments: ReadonlyArray<StatusRow & { readonly percent: number }>;
  readonly legend: ReadonlyArray<StatusRow>;
} {
  const legend = STATUS_ROWS.map((row) => ({ ...row, value: counts[row.key] }));
  const total = legend.reduce((sum, row) => sum + row.value, 0);
  const segments =
    total === 0
      ? []
      : legend
          .filter((row) => row.value > 0)
          .map((row) => ({ ...row, percent: (row.value / total) * 100 }));
  return { total, segments, legend };
}

/** A whole percent from 0 to 100, or null when there is nothing to divide (no tasks). */
export function ringPercent(done: number, total: number): number | null {
  if (!(total > 0)) return null;
  return Math.round((Math.min(done, total) / total) * 100);
}

export interface AreaBar {
  readonly id: string;
  readonly label: string;
  readonly units: number;
  readonly widthPercent: number;
}

export function areaBars(areas: ReadonlyArray<TaskBoardHomeArea>): {
  readonly total: number;
  readonly bars: ReadonlyArray<AreaBar>;
} {
  const sorted = areas.toSorted(
    (a, b) => b.units - a.units || areaLabel(a.id).localeCompare(areaLabel(b.id)),
  );
  const max = sorted[0]?.units ?? 0;
  return {
    total: sorted.reduce((sum, area) => sum + area.units, 0),
    bars: sorted.map((area) => ({
      id: area.id,
      label: areaLabel(area.id),
      units: area.units,
      widthPercent: max > 0 ? (area.units / max) * 100 : 0,
    })),
  };
}

export interface DoneTask {
  readonly status: string;
  readonly completedAt: number | null;
  readonly kind?: string | undefined;
}

export interface DoneDay {
  readonly key: string;
  /** The day of the month, "22". */
  readonly label: string;
  /** "Thursday, October 22", for the tooltip. */
  readonly full: string;
  /** "Oct 9". */
  readonly short: string;
  readonly count: number;
  readonly today: boolean;
}

export interface DoneSeries {
  readonly days: ReadonlyArray<DoneDay>;
  readonly total: number;
  readonly today: number;
  /** Tasks finished per day over the 14 days, to one decimal. */
  readonly average: number;
  readonly week: number;
  readonly weekBefore: number;
  readonly change: string;
}

const DAYS_SHOWN = 14;

/** Finished tasks per local day. Agent run records are not tasks, so they stay out. */
export function doneSeries(tasks: ReadonlyArray<DoneTask>, now: number): DoneSeries {
  const todayStart = startOfDay(now);
  const counts = Array.from({ length: DAYS_SHOWN }, () => 0);
  for (const task of tasks) {
    if (task.status !== "done" || task.completedAt === null || task.kind === "agent_run") continue;
    const back = Math.round((todayStart - startOfDay(task.completedAt)) / DAY);
    if (back >= 0 && back < DAYS_SHOWN) counts[DAYS_SHOWN - 1 - back]! += 1;
  }
  const days = counts.map((count, index) => {
    const date = new Date(todayStart - (DAYS_SHOWN - 1 - index) * DAY);
    return {
      key: `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`,
      label: String(date.getDate()),
      full: date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }),
      short: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      count,
      today: index === DAYS_SHOWN - 1,
    };
  });
  const sum = (from: number, to: number) => counts.slice(from, to).reduce((a, b) => a + b, 0);
  const total = sum(0, DAYS_SHOWN);
  const week = sum(7, DAYS_SHOWN);
  const weekBefore = sum(0, 7);
  const gap = week - weekBefore;
  return {
    days,
    total,
    today: counts[DAYS_SHOWN - 1] ?? 0,
    average: Math.round((total / DAYS_SHOWN) * 10) / 10,
    week,
    weekBefore,
    change:
      gap === 0
        ? "Same as the 7 days before"
        : `${Math.abs(gap)} ${gap > 0 ? "more" : "fewer"} than the 7 days before`,
  };
}

/** The "Updated" chip text for the newest data read. */
export function updatedLabel(at: number, now: number): string {
  if (!(at > 0)) return "Not read yet";
  return `Updated ${changedLabel(at, now)}`;
}

export function oldestAt(events: ReadonlyArray<Pick<FoldedFeedEvent, "ts">>): number | null {
  const times = events.map((event) => Date.parse(event.ts)).filter(Number.isFinite);
  return times.length === 0 ? null : Math.min(...times);
}

/** The first `max` rows of a list and how many were left out. */
export function capRows<T>(rows: readonly T[], max: number) {
  return { shown: rows.slice(0, max), hidden: Math.max(0, rows.length - max) };
}

const GOAL_DATE = /^(\d{4}-\d{2}-\d{2}|[A-Za-z]{3,9}\.? \d{1,2},? \d{4})$/;

/** The goal's status and target in one line. "due X" shows only when the target is a real date. */
export function goalMeta(goal: { status: string; targetDate: string }): string {
  const target = goal.targetDate.trim();
  const isDate = GOAL_DATE.test(target) && Number.isFinite(Date.parse(target));
  return [goal.status.trim(), target && (isDate ? `due ${target}` : target)]
    .filter(Boolean)
    .join(" · ");
}

/**
 * A Needs you row in two lines. App events have a generic title ("Input needed") and the chat
 * name in the body, so the chat name leads and the title moves to the second line.
 */
export function needsYouLine(event: {
  readonly title: string;
  readonly body?: string | undefined;
  readonly actor: { readonly kind: string; readonly name: string };
}): { readonly primary: string; readonly secondary: string } {
  const body = event.body?.trim().split("\n")[0]?.trim() ?? "";
  if (event.actor.kind === "app" && body !== "") {
    return { primary: body, secondary: event.title };
  }
  return { primary: event.title, secondary: event.actor.name };
}

interface GlanceWindow {
  readonly usedPercent: number;
}
interface GlanceAccount {
  readonly id: string;
  readonly label: string;
  readonly displayName?: string | undefined;
  readonly limits: { readonly windows: ReadonlyArray<GlanceWindow> };
}

/** The window closest to its limit: the one that stops work first. */
export function fullestWindow<W extends GlanceWindow>(windows: ReadonlyArray<W>): W | null {
  return windows.reduce<W | null>(
    (best, window) => (best === null || window.usedPercent > best.usedPercent ? window : best),
    null,
  );
}

type Glance<A extends GlanceAccount> = {
  readonly account: A;
  readonly window: A["limits"]["windows"][number];
};

/**
 * The Usage card: the account the next chat uses (else the fullest one) on the gauge, then up to
 * four more accounts, fullest first. Accounts that report no windows stay out.
 */
export function usageGlance<A extends GlanceAccount>(
  active: ReadonlyArray<A>,
  others: ReadonlyArray<A>,
): { readonly main: Glance<A> | null; readonly rest: ReadonlyArray<Glance<A>> } {
  const ranked = (accounts: ReadonlyArray<A>): Glance<A>[] =>
    accounts
      .flatMap((account) => {
        const window = fullestWindow(account.limits.windows);
        return window ? [{ account, window }] : [];
      })
      .toSorted((a, b) => b.window.usedPercent - a.window.usedPercent);
  const mine = ranked(active);
  const rest = ranked(others);
  const main = mine[0] ?? rest[0] ?? null;
  return { main, rest: (mine[0] ? rest : rest.slice(1)).slice(0, 4) };
}

export const accountName = (account: {
  readonly label: string;
  readonly displayName?: string | undefined;
}): string => account.displayName?.trim() || account.label;
