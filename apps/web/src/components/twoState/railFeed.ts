import type { FoldedFeedEvent } from "@t3tools/contracts";

import { feedEventOpenTarget } from "~/eventFeedOpen";
import type { EventMark } from "~/eventFeedStore";

import { plainEventTitle } from "./eventText";

/** Rows the Activity section keeps. The bell inbox holds every event. */
const ACTIVITY_LIMIT = 20;

export interface MergedFeedEvent extends FoldedFeedEvent {
  /** Every underlying event id merged into this row, newest first. */
  readonly mergedIds: ReadonlyArray<string>;
  /** Timestamp of the oldest merged occurrence. */
  readonly firstTs: string;
  /** True only when every merged occurrence is marked read. */
  readonly mergedRead: boolean;
}

/** Underlying event ids for a single or merged feed event. */
export function eventIds(event: FoldedFeedEvent | MergedFeedEvent): ReadonlyArray<string> {
  return "mergedIds" in event && event.mergedIds.length > 0 ? event.mergedIds : [event.id];
}

/** True when the event (and all merged duplicates) is marked read. */
export function isEventRead(
  event: FoldedFeedEvent | MergedFeedEvent,
  marks: Readonly<Record<string, EventMark>>,
): boolean {
  return eventIds(event).every((id) => marks[id]?.read === true);
}

const PER_THREAD_AGENT_TYPES = new Set<string>([
  "agent.needs_permission",
  "agent.usage_limit",
  "agent.failed",
]);

/** Needs you holds unread `needs_you` and `failed` alerts. Task work logs stay in Activity. */
export function isNeedsYou(event: FoldedFeedEvent, read: boolean): boolean {
  if (read || event.type === "task.worked") return false;
  return event.level === "needs_you" || event.level === "failed";
}

/** Stable key for merging repeated alerts across time windows into one row. */
export function duplicateKey(event: FoldedFeedEvent): string {
  // Built-in watchers report point-in-time state; keep one current row per watcher.
  if (event.type.startsWith("watcher.")) return `watcher:${event.type}`;
  // Per-thread chat alerts fold into one latest row per chat instead of one per turn.
  const threadId = event.target?.thread?.trim();
  if (threadId && PER_THREAD_AGENT_TYPES.has(event.type)) {
    return `thread:${event.type}:${threadId}`;
  }
  const explicit = event.dedupe?.trim();
  if (explicit) return `dedupe:${explicit}`;
  const title = plainEventTitle(event.title).replace(/\s+/g, " ").trim().toLowerCase();
  const target = event.target;
  const targetKey = `${target?.thread ?? ""}|${target?.url ?? ""}|${target?.task ?? ""}`;
  return `${event.actor.name.trim().toLowerCase()}|${event.type}|${title}|${targetKey}`;
}

const eventTime = (event: FoldedFeedEvent): number => {
  const parsed = Date.parse(event.ts);
  return Number.isFinite(parsed) ? parsed : 0;
};

/**
 * Merges duplicate alerts into one row with a summed repeat count.
 * Newest occurrence supplies the row id, timestamp, body, and actions.
 */
export function mergeDuplicateEvents(
  events: ReadonlyArray<FoldedFeedEvent>,
  marks: Readonly<Record<string, EventMark>>,
): MergedFeedEvent[] {
  if (events.length === 0) return [];
  const sorted = events.toSorted((a, b) => eventTime(b) - eventTime(a));
  const grouped = new Map<string, FoldedFeedEvent[]>();
  for (const event of sorted) {
    const key = duplicateKey(event);
    const bucket = grouped.get(key);
    if (bucket) bucket.push(event);
    else grouped.set(key, [event]);
  }
  const merged: MergedFeedEvent[] = [];
  for (const bucket of grouped.values()) {
    const newest = bucket[0]!;
    const oldest = bucket[bucket.length - 1]!;
    let totalCount = 0;
    const ids: string[] = [];
    for (const item of bucket) {
      totalCount += Math.max(1, item.count);
      ids.push(item.id);
    }
    merged.push({
      ...newest,
      count: totalCount,
      mergedIds: ids,
      firstTs: oldest.ts,
      mergedRead: ids.every((id) => marks[id]?.read === true),
    });
  }
  return merged;
}

/** The right rail: Needs you first, then Activity without those items. Order stays newest first. */
export function splitFeed<T extends FoldedFeedEvent>(
  events: ReadonlyArray<T>,
  marks: Readonly<Record<string, EventMark>>,
  limit = ACTIVITY_LIMIT,
): { readonly needsYou: T[]; readonly activity: T[] } {
  const needsYou: T[] = [];
  const activity: T[] = [];
  for (const event of events) {
    if (isNeedsYou(event, isEventRead(event, marks))) needsYou.push(event);
    else if (activity.length < limit) activity.push(event);
  }
  return { needsYou, activity };
}

/** The one button on a Needs you row, or null when the event opens nothing. */
export function actionLabel(event: FoldedFeedEvent): string | null {
  const label = event.actions?.[0]?.label;
  if (label !== undefined) return label;
  const target = feedEventOpenTarget(event);
  if (target === null) return null;
  return "thread" in target ? "Open chat" : "Open link";
}
