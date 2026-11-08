import type { FeedBadLine, FoldedFeedEvent } from "@t3tools/contracts";

import type { EventMark } from "~/eventFeedStore";
import { feedEventOpenTarget } from "~/eventFeedOpen";

import { isNeedsYou } from "../../twoState/railFeed";

type Marks = Readonly<Record<string, EventMark>>;

export type InboxFilter = "all" | "needs-you" | "finished";

export const INBOX_FILTERS: ReadonlyArray<{ readonly id: InboxFilter; readonly label: string }> = [
  { id: "all", label: "All" },
  { id: "needs-you", label: "Needs you" },
  { id: "finished", label: "Finished" },
];

export type InboxGrouping = "time" | "source";

export const INBOX_GROUPINGS: ReadonlyArray<{
  readonly id: InboxGrouping;
  readonly label: string;
}> = [
  { id: "time", label: "By time" },
  { id: "source", label: "By source" },
];

export interface InboxGroup {
  readonly key: "needs-you" | "today" | "earlier" | `source:${string}`;
  readonly label: string;
  readonly events: ReadonlyArray<FoldedFeedEvent>;
}

const time = (event: FoldedFeedEvent) => Date.parse(event.ts);
const isRead = (marks: Marks, event: FoldedFeedEvent) => marks[event.id]?.read === true;

/** Needs you first (unread questions and failures), then Today, then Earlier. Newest first in each. */
export function groupInbox(
  events: ReadonlyArray<FoldedFeedEvent>,
  marks: Marks,
  now: number,
): ReadonlyArray<InboxGroup> {
  const startOfToday = new Date(now).setHours(0, 0, 0, 0);
  const sorted = events.toSorted((a, b) => time(b) - time(a));
  const needsYou: FoldedFeedEvent[] = [];
  const rest: FoldedFeedEvent[] = [];
  for (const event of sorted) {
    (isNeedsYou(event, isRead(marks, event)) ? needsYou : rest).push(event);
  }
  const groups: InboxGroup[] = [
    { key: "needs-you", label: "Needs you", events: needsYou },
    { key: "today", label: "Today", events: rest.filter((event) => time(event) >= startOfToday) },
    {
      key: "earlier",
      label: "Earlier",
      events: rest.filter((event) => time(event) < startOfToday),
    },
  ];
  return groups.filter((group) => group.events.length > 0);
}

export function inboxCounts(events: ReadonlyArray<FoldedFeedEvent>, marks: Marks) {
  const needsYou = events.filter((event) => isNeedsYou(event, isRead(marks, event))).length;
  return { all: events.length, needsYou, finished: events.length - needsYou };
}

/** Not read. The rail badge counts the same way; dismissed events are already out of the list. */
export const unreadIds = (events: ReadonlyArray<FoldedFeedEvent>, marks: Marks): string[] =>
  events.filter((event) => !isRead(marks, event)).map((event) => event.id);

/** The events a filter pill keeps. Needs you means unread questions and failures. */
export function filterInbox(
  events: ReadonlyArray<FoldedFeedEvent>,
  marks: Marks,
  filter: InboxFilter,
): ReadonlyArray<FoldedFeedEvent> {
  if (filter === "all") return events;
  return events.filter(
    (event) => isNeedsYou(event, isRead(marks, event)) === (filter === "needs-you"),
  );
}

/** One group per source, the source with the newest event first. Newest first inside. */
export function groupBySource(events: ReadonlyArray<FoldedFeedEvent>): ReadonlyArray<InboxGroup> {
  const groups = new Map<string, FoldedFeedEvent[]>();
  for (const event of events.toSorted((a, b) => time(b) - time(a))) {
    const label = event.actor.name;
    const group = groups.get(label);
    if (group) group.push(event);
    else groups.set(label, [event]);
  }
  return [...groups].map(([label, rows]) => ({
    key: `source:${label}` as const,
    label,
    events: rows,
  }));
}

/** The rows in the order the list shows them, for arrow keys and selection. */
export const rowsOf = (groups: ReadonlyArray<InboxGroup>): FoldedFeedEvent[] =>
  groups.flatMap((group) => group.events);

export function searchInbox(
  events: ReadonlyArray<FoldedFeedEvent>,
  query: string,
): ReadonlyArray<FoldedFeedEvent> {
  const needle = query.trim().toLowerCase();
  if (needle === "") return events;
  return events.filter((event) =>
    [event.title, event.body ?? "", event.actor.name].some((text) =>
      text.toLowerCase().includes(needle),
    ),
  );
}

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
  rows: ReadonlyArray<FoldedFeedEvent>,
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

/** The empty inbox text. When every ledger line was rejected, say so instead of "empty". */
export function inboxEmptyText(bad: ReadonlyArray<FeedBadLine>): {
  readonly title: string;
  readonly line: string;
} {
  const first = bad[0];
  if (!first) {
    return {
      title: "Your inbox is empty",
      line: "When a chat needs you or finishes something, it shows here.",
    };
  }
  return {
    title: "No events could be read",
    // The server sends at most 50 bad lines (FEED_MAX_BAD), so 50 means "at least 50".
    line: `Skipped ${bad.length >= 50 ? "50 or more" : bad.length} unreadable ${bad.length === 1 ? "line" : "lines"} in the event files. First: ${first.file.split(/[\\/]/).pop()} line ${first.line}.`,
  };
}
