// How the chat list is laid out: the user's View menu choices, and the pure
// grouping that turns a flat thread list into labeled groups.

import type { SidebarThreadStatus } from "../Sidebar.logic";

export type SidebarGroupBy = "date" | "status" | "project" | "account" | "classic";
export type SidebarDensity = "comfortable" | "compact";

export interface SidebarView {
  /** date = timeline, status = lanes, project = one group per project, account = one group per account, classic = drag order. */
  readonly groupBy: SidebarGroupBy;
  readonly density: SidebarDensity;
  /** Project icons down the left edge; one click scopes the list. */
  readonly showRail: boolean;
  /** The project name on each row (redundant once the list is scoped). */
  readonly showProject: boolean;
  /** The second line that says why a chat is in its state. */
  readonly showReason: boolean;
  readonly showTime: boolean;
}

export const DEFAULT_SIDEBAR_VIEW: SidebarView = {
  groupBy: "date",
  density: "comfortable",
  showRail: false,
  showProject: true,
  showReason: true,
  showTime: true,
};

const GROUP_BY_VALUES: ReadonlySet<unknown> = new Set<SidebarGroupBy>([
  "date",
  "status",
  "project",
  "account",
  "classic",
]);
const DENSITY_VALUES: ReadonlySet<unknown> = new Set<SidebarDensity>(["comfortable", "compact"]);
const BOOLEAN_KEYS = ["showRail", "showProject", "showReason", "showTime"] as const;

/** Reads a stored view; any unknown or broken field falls back to the default. */
export function parseSidebarView(raw: string | null): SidebarView {
  if (raw === null) return DEFAULT_SIDEBAR_VIEW;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return DEFAULT_SIDEBAR_VIEW;
  }
  if (typeof parsed !== "object" || parsed === null) return DEFAULT_SIDEBAR_VIEW;
  const record = parsed as Record<string, unknown>;
  const view: { -readonly [K in keyof SidebarView]: SidebarView[K] } = { ...DEFAULT_SIDEBAR_VIEW };
  if (GROUP_BY_VALUES.has(record.groupBy)) {
    view.groupBy = record.groupBy as SidebarGroupBy;
  }
  if (DENSITY_VALUES.has(record.density)) {
    view.density = record.density as SidebarDensity;
  }
  for (const key of BOOLEAN_KEYS) {
    if (typeof record[key] === "boolean") view[key] = record[key];
  }
  return view;
}

export type SidebarDateBucket = "today" | "yesterday" | "week" | "month" | "older";

const DATE_BUCKETS: readonly SidebarDateBucket[] = ["today", "yesterday", "week", "month", "older"];
const DATE_BUCKET_LABELS: Record<SidebarDateBucket, string> = {
  today: "Today",
  yesterday: "Yesterday",
  week: "This week",
  month: "This month",
  older: "Older",
};

const DAY_MS = 86_400_000;

function startOfLocalDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** Calendar-day buckets in local time: 11 PM yesterday is Yesterday, not Today. */
export function sidebarDateBucket(iso: string | null | undefined, now: Date): SidebarDateBucket {
  if (!iso) return "older";
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return "older";
  const today = startOfLocalDay(now);
  // Day boundaries from the calendar, so a DST change cannot shift a bucket.
  const yesterday = startOfLocalDay(new Date(today - DAY_MS / 2));
  const daysAgo = Math.round((today - startOfLocalDay(new Date(time))) / DAY_MS);
  if (time >= today) return "today";
  if (time >= yesterday) return "yesterday";
  if (daysAgo < 7) return "week";
  if (daysAgo < 31) return "month";
  return "older";
}

export type SidebarStatusLane = "needs-you" | "running" | "ready" | "recent";

const STATUS_LANES: readonly SidebarStatusLane[] = ["needs-you", "running", "ready", "recent"];
const STATUS_LANE_LABELS: Record<SidebarStatusLane, string> = {
  "needs-you": "Needs you",
  running: "Running",
  ready: "Ready to review",
  recent: "Recent",
};

export function sidebarStatusLane(input: {
  readonly status: SidebarThreadStatus;
  readonly isUnread: boolean;
  readonly isWoke: boolean;
}): SidebarStatusLane {
  const { status } = input;
  if (status === "approval" || status === "input" || status === "failed" || status === "limited") {
    return "needs-you";
  }
  if (input.isWoke) return "needs-you";
  if (status === "working" || status === "waiting") return "running";
  return input.isUnread ? "ready" : "recent";
}

export interface SidebarThreadGroup<T> {
  readonly id: string;
  /** Null for the single classic group, which has no header. */
  readonly label: string | null;
  readonly items: readonly T[];
}

function byTimeDesc<T>(items: readonly T[], timeOf: (item: T) => string | null): T[] {
  const ms = (item: T) => {
    const value = timeOf(item);
    const parsed = value ? Date.parse(value) : Number.NaN;
    return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed;
  };
  return items.toSorted((left, right) => ms(right) - ms(left));
}

export function groupSidebarThreads<T>(
  items: readonly T[],
  options: {
    readonly groupBy: SidebarGroupBy;
    readonly now: Date;
    readonly timeOf: (item: T) => string | null;
    readonly laneOf: (item: T) => SidebarStatusLane;
    /** Project order and names for groupBy "project" (upstream #21039, #26387). */
    readonly projects?: ReadonlyArray<{ readonly key: string; readonly label: string }>;
    readonly projectKeyOf?: (item: T) => string | null;
    readonly accountKeyOf?: (item: T) => string | null;
    readonly accountLabelOf?: (key: string) => string;
  },
): SidebarThreadGroup<T>[] {
  if (items.length === 0) return [];
  if (options.groupBy === "classic") return [{ id: "all", label: null, items }];
  const sorted = byTimeDesc(items, options.timeOf);
  if (options.groupBy === "project") {
    const buckets = new Map<string | null, T[]>();
    for (const item of sorted) {
      const key = options.projectKeyOf?.(item) ?? null;
      const bucket = buckets.get(key);
      if (bucket) bucket.push(item);
      else buckets.set(key, [item]);
    }
    // Projects with no chats get no group. Chats outside every listed project
    // stay visible in a last group instead of disappearing.
    const groups: SidebarThreadGroup<T>[] = [];
    for (const project of options.projects ?? []) {
      const bucket = buckets.get(project.key);
      if (!bucket) continue;
      groups.push({ id: `project:${project.key}`, label: project.label, items: bucket });
      buckets.delete(project.key);
    }
    const rest = byTimeDesc([...buckets.values()].flat(), options.timeOf);
    if (rest.length > 0) groups.push({ id: "project:other", label: "Other", items: rest });
    return groups;
  }
  if (options.groupBy === "account") {
    const buckets = new Map<string | null, T[]>();
    for (const item of sorted) {
      const key = options.accountKeyOf?.(item) ?? null;
      const bucket = buckets.get(key);
      if (bucket) bucket.push(item);
      else buckets.set(key, [item]);
    }
    // Sort account groups by most recent activity in each group.
    const groups: { key: string | null; items: T[]; mostRecentMs: number }[] = [];
    for (const [key, bucket] of buckets) {
      const mostRecentTime = bucket[0] ? options.timeOf(bucket[0]) : null;
      const parsed = mostRecentTime ? Date.parse(mostRecentTime) : Number.NaN;
      const mostRecentMs = Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed;
      groups.push({ key, items: bucket, mostRecentMs });
    }
    groups.sort((a, b) => b.mostRecentMs - a.mostRecentMs);
    return groups.map((g) => {
      if (g.key === null) {
        return { id: "account:other", label: "Other", items: g.items };
      }
      const label = options.accountLabelOf?.(g.key) ?? g.key;
      return { id: `account:${g.key}`, label, items: g.items };
    });
  }
  const keyOf =
    options.groupBy === "date"
      ? (item: T) => sidebarDateBucket(options.timeOf(item), options.now)
      : options.laneOf;
  const order: readonly string[] = options.groupBy === "date" ? DATE_BUCKETS : STATUS_LANES;
  const labels: Record<string, string> =
    options.groupBy === "date" ? DATE_BUCKET_LABELS : STATUS_LANE_LABELS;
  const buckets = new Map<string, T[]>();
  for (const item of sorted) {
    const key = keyOf(item);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(item);
    else buckets.set(key, [item]);
  }
  return order.flatMap((id) => {
    const bucket = buckets.get(id);
    return bucket ? [{ id, label: labels[id]!, items: bucket }] : [];
  });
}
