/** Time limits and cache wakes for live task commands (decision 0103). */

const MINUTE_MS = 60_000;
export const DEFAULT_LIMIT_MS = 30 * MINUTE_MS;
export const MAX_LIMIT_MS = 4 * 60 * MINUTE_MS;
/** How long the agent has to answer before the command counts as unanswered. */
export const REPLY_DEADLINE_MS = 10 * MINUTE_MS;
// A shorter cache would need a paid wake every few minutes, so it is left to expire.
const MIN_WARM_TTL_MS = 30 * MINUTE_MS;
const WARM_LEAD_MS = 10 * MINUTE_MS;

export function initialLimitMs(timeoutMs: number | undefined): number {
  return Math.min(timeoutMs ?? DEFAULT_LIMIT_MS, MAX_LIMIT_MS);
}

/** The limit after the agent keeps a command: 30 more minutes from now, never past 4 hours. */
export function extendedLimitMs(startedAtMs: number, nowMs: number): number {
  return Math.min(nowMs - startedAtMs + DEFAULT_LIMIT_MS, MAX_LIMIT_MS);
}

/** True shortly before a long-lived prompt cache expires. */
export function cacheWakeDue(
  cache: { readonly expiresAtMs: number; readonly ttlMs: number } | null,
  nowMs: number,
): boolean {
  return (
    cache !== null &&
    cache.ttlMs >= MIN_WARM_TTL_MS &&
    nowMs >= cache.expiresAtMs - WARM_LEAD_MS &&
    nowMs < cache.expiresAtMs
  );
}

export function keptTaskIds(reply: string, taskIds: ReadonlyArray<string>): ReadonlyArray<string> {
  const kept = new Set(
    Array.from(reply.matchAll(/\bKEEP\s+`?([\w:.-]*\w)/gu), (match) => match[1]),
  );
  return taskIds.filter((taskId) => kept.has(taskId));
}
