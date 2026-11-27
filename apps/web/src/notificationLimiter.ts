import type { FeedEvent } from "@t3tools/contracts";

/** The same source and problem alerts at most once per day; the Inbox still counts every repeat. */
export const SAME_ALERT_COOLDOWN_MS = 24 * 60 * 60 * 1000;
/** Across all types, at most this many alerts per window; the rest go quietly to the Inbox. */
export const BURST_LIMIT = 3;
export const BURST_WINDOW_MS = 60_000;

/** What makes two events "the same alert": the sender's dedupe key, else who said what about what. */
const alertKey = (event: FeedEvent): string =>
  event.dedupe ??
  `${event.actor.name}|${event.type}|${event.title}|${JSON.stringify(event.target ?? null)}`;

/**
 * One rule for every notification: a repeat or a burst never becomes a stack of pop-ups, sounds or
 * system alerts. Inbox entries are not affected.
 * shortcut: state lives in memory, so the first repeat after a restart may alert once more; save
 * it to storage if that proves noisy.
 */
export function makeAlertLimiter(now: () => number = Date.now) {
  const lastByKey = new Map<string, number>();
  let recent: number[] = [];
  return {
    /** True when this event may alert now. A true answer records the alert. */
    allow(event: FeedEvent): boolean {
      const at = now();
      const key = alertKey(event);
      const last = lastByKey.get(key);
      if (last !== undefined && at - last < SAME_ALERT_COOLDOWN_MS) return false;
      recent = recent.filter((time) => at - time < BURST_WINDOW_MS);
      if (recent.length >= BURST_LIMIT) return false;
      recent.push(at);
      lastByKey.set(key, at);
      return true;
    },
  };
}
