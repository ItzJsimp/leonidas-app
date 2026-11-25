import type { FeedBadLine, FoldedFeedEvent } from "@t3tools/contracts";

import { feedEventOpenTarget } from "~/eventFeedOpen";
import type { EventMark } from "~/eventFeedStore";

import { plainEventTitle } from "../../twoState/eventText";
import { eventIds, isEventRead, isNeedsYou, type MergedFeedEvent } from "../../twoState/railFeed";

type Marks = Readonly<Record<string, EventMark>>;

export type InboxTypeFilter = "all" | "needs-you" | "failed" | "updates";

export const INBOX_TYPE_FILTERS: ReadonlyArray<{
  readonly id: InboxTypeFilter;
  readonly label: string;
}> = [
  { id: "all", label: "All types" },
  { id: "needs-you", label: "Needs you" },
  { id: "failed", label: "Failed" },
  { id: "updates", label: "Updates" },
];

export type EventKind = "failed" | "approval" | "input" | "limit" | "finished" | "update";

export type InboxUrgencyKey = "needs-you" | "updates" | "earlier";

export interface InboxGroup {
  readonly key: InboxUrgencyKey;
  readonly label: string;
  readonly events: ReadonlyArray<MergedFeedEvent>;
}

export interface InboxSourceMeta {
  /** Project name when linked to a thread, otherwise the source actor name. */
  readonly project: string;
  /** Thread title when linked to a known thread. */
  readonly threadTitle: string | null;
}

export interface InboxFilterState {
  readonly type: InboxTypeFilter;
  readonly project: string;
  readonly unreadOnly: boolean;
  readonly query: string;
}

export const CLEAR_OLDER_OPTIONS = [
  { id: "24h", label: "Older than 24 hours", ms: 24 * 60 * 60 * 1000 },
  { id: "7d", label: "Older than 7 days", ms: 7 * 24 * 60 * 60 * 1000 },
  { id: "30d", label: "Older than 30 days", ms: 30 * 24 * 60 * 60 * 1000 },
] as const;

const MAX_TITLE_CHARS = 60;
const time = (event: FoldedFeedEvent) => Date.parse(event.ts);

/** Classifies a notification by event type for row iconography. */
export function eventKind(event: Pick<FoldedFeedEvent, "type" | "level">): EventKind {
  const type = event.type.toLowerCase();
  if (event.level === "failed" || type.endsWith(".failed") || type.includes("error")) {
    return "failed";
  }
  if (type === "agent.usage_limit" || type.includes("limit") || type.includes("quota")) {
    return "limit";
  }
  if (
    type === "agent.needs_permission" ||
    type.includes("permission") ||
    type.includes("approval")
  ) {
    return "approval";
  }
  if (type === "agent.needs_input" || event.level === "needs_you") {
    return "input";
  }
  if (
    type === "agent.finished" ||
    type === "agent.child_finished" ||
    type.endsWith(".finished") ||
    type.endsWith(".completed") ||
    type.endsWith(".done")
  ) {
    return "finished";
  }
  return "update";
}

/** Single-line notification title clamped to 60 characters or fewer. */
export function formatInboxTitle(title: string, maxChars = MAX_TITLE_CHARS): string {
  const clean = plainEventTitle(title).replace(/\s+/g, " ").trim();
  if (clean.length <= maxChars) return clean;
  return `${clean.slice(0, Math.max(1, maxChars - 1)).trimEnd()}…`;
}

/** Needs you first (unread approvals, input, limits, failures), then Updates (today), then Earlier. */
export function groupInbox(
  events: ReadonlyArray<MergedFeedEvent>,
  marks: Marks,
  now: number,
): ReadonlyArray<InboxGroup> {
  const startOfToday = new Date(now).setHours(0, 0, 0, 0);
  const sorted = events.toSorted((a, b) => time(b) - time(a));
  const needsYou: MergedFeedEvent[] = [];
  const updates: MergedFeedEvent[] = [];
  const earlier: MergedFeedEvent[] = [];
  for (const event of sorted) {
    if (isNeedsYou(event, isEventRead(event, marks))) {
      needsYou.push(event);
    } else if (time(event) >= startOfToday) {
      updates.push(event);
    } else {
      earlier.push(event);
    }
  }
  const groups: InboxGroup[] = [
    { key: "needs-you", label: "Needs you", events: needsYou },
    { key: "updates", label: "Updates", events: updates },
    { key: "earlier", label: "Earlier", events: earlier },
  ];
  return groups.filter((group) => group.events.length > 0);
}

/** Underlying event ids for every unread row (including merged duplicates). */
export function unreadIds(events: ReadonlyArray<MergedFeedEvent>, marks: Marks): string[] {
  const ids: string[] = [];
  for (const event of events) {
    if (!isEventRead(event, marks)) {
      ids.push(...eventIds(event));
    }
  }
  return ids;
}

/** Underlying event ids for every row older than `cutoffMs` relative to `now`. */
export function olderThanIds(
  events: ReadonlyArray<MergedFeedEvent>,
  cutoffMs: number,
  now: number,
): { readonly rows: number; readonly ids: string[] } {
  const ids: string[] = [];
  let rows = 0;
  for (const event of events) {
    const at = time(event);
    if (Number.isFinite(at) && now - at >= cutoffMs) {
      rows += 1;
      ids.push(...eventIds(event));
    }
  }
  return { rows, ids };
}

/** Unique sorted project/source filter labels across the visible feed. */
export function projectOptions(
  events: ReadonlyArray<MergedFeedEvent>,
  resolveSource: (event: MergedFeedEvent) => InboxSourceMeta,
): string[] {
  const names = new Set<string>();
  for (const event of events) {
    const project = resolveSource(event).project.trim();
    if (project) names.add(project);
  }
  return [...names].toSorted((a, b) => a.localeCompare(b));
}

/** Applies type, project, unread, and text search filters in one pass. */
export function filterInboxEvents(
  events: ReadonlyArray<MergedFeedEvent>,
  marks: Marks,
  filters: InboxFilterState,
  resolveSource: (event: MergedFeedEvent) => InboxSourceMeta,
): MergedFeedEvent[] {
  const needle = filters.query.trim().toLowerCase();
  return events.filter((event) => {
    const read = isEventRead(event, marks);
    if (filters.unreadOnly && read) return false;
    if (filters.type === "needs-you" && !isNeedsYou(event, read)) return false;
    if (filters.type === "failed" && eventKind(event) !== "failed") return false;
    if (filters.type === "updates" && isNeedsYou(event, read)) return false;
    const source = resolveSource(event);
    if (filters.project !== "all" && source.project !== filters.project) return false;
    if (needle !== "") {
      const hay = [
        plainEventTitle(event.title),
        event.body ?? "",
        event.actor.name,
        source.project,
        source.threadTitle ?? "",
      ];
      if (!hay.some((text) => text.toLowerCase().includes(needle))) return false;
    }
    return true;
  });
}

/** The rows in the order the list shows them, for arrow keys and selection. */
export const rowsOf = (groups: ReadonlyArray<InboxGroup>): MergedFeedEvent[] =>
  groups.flatMap((group) => group.events);

/** The index an arrow key moves to in a list, or null when the key does nothing. */
export function nextRowIndex(key: string, index: number, count: number): number | null {
  if (count === 0) return null;
  if (key === "ArrowDown") return Math.min(index + 1, count - 1);
  if (key === "ArrowUp") return Math.max(index - 1, 0);
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  return null;
}

/** The row to focus when row `id` leaves its place: the next row, else the previous one. */
export function neighborRowId(
  rows: ReadonlyArray<Pick<FoldedFeedEvent, "id">>,
  id: string,
): string | undefined {
  const index = rows.findIndex((row) => row.id === id);
  if (index < 0) return undefined;
  return (rows[index + 1] ?? rows[index - 1])?.id;
}

export const sourceLabel = (event: FoldedFeedEvent): string => event.actor.name;

/** The chat an event links to, or null when it links to none. */
export function linkedThreadId(event: FoldedFeedEvent): string | null {
  const target = feedEventOpenTarget(event);
  return target !== null && "thread" in target ? target.thread : null;
}

/** The empty inbox text. One plain line when empty, or skipped-line details when unreadable. */
export function inboxEmptyText(bad: ReadonlyArray<FeedBadLine>): {
  readonly title: string;
  readonly line: string;
} {
  const first = bad[0];
  if (!first) {
    return {
      title: "No notifications.",
      line: "",
    };
  }
  return {
    title: "No events could be read",
    // The server sends at most 50 bad lines (FEED_MAX_BAD), so 50 means "at least 50".
    line: `Skipped ${bad.length >= 50 ? "50 or more" : bad.length} unreadable ${bad.length === 1 ? "line" : "lines"} in the event files. First: ${first.file.split(/[\\/]/).pop()} line ${first.line}.`,
  };
}
