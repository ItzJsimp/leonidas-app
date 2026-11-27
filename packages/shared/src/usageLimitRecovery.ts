/** Timing rules for a chat that a usage limit stopped. Server, web and mobile use the same values. */

/** Providers can report the reset a little early, so an automatic send waits past it. */
export const LIMIT_RESUME_BUFFER_MS = 2 * 60_000;
/** Space between an automatic send that hit the limit again and the next one. */
const LIMIT_RESUME_RETRY_MS = 5 * 60_000;
/** The first automatic send plus two retries. */
export const LIMIT_RESUME_MAX_ATTEMPTS = 3;

/**
 * Whether an automatic send is scheduled. A record without `attempt` predates this flow: a
 * setting the user may not have known about armed it, so it never sends.
 */
export function isLimitResumeArmed(
  recovery:
    | { readonly autoResume: boolean; readonly attempt?: number | undefined }
    | null
    | undefined,
): boolean {
  return recovery?.autoResume === true && recovery.attempt !== undefined;
}

export function limitResumeDueMs(input: {
  readonly resetMs: number;
  readonly attempt: number;
  /** When the run that hit the limit ended. */
  readonly stoppedMs: number;
}): number {
  const afterReset = input.resetMs + LIMIT_RESUME_BUFFER_MS;
  return input.attempt > 1
    ? Math.max(afterReset, input.stoppedMs + LIMIT_RESUME_RETRY_MS)
    : afterReset;
}

/** Message ids of automatic sends start with this, which marks the run they continue. */
export function limitResumeMessagePrefix(threadId: string, runId: string): string {
  return `limit-resume:${threadId}:${runId}:`;
}

/** A limit that resets later than this is a weekly or monthly one, not the session limit. */
const SESSION_WINDOW_MS = 5 * 60 * 60_000;
/** Used when the provider does not report how long it keeps the prompt cache. */
const DEFAULT_CACHE_TTL_MS = 60 * 60_000;

/** What the session limit card shows. Web and mobile draw the same states. */
export function usageLimitCardState(input: {
  readonly runId: string;
  readonly resetAt: string | null;
  readonly stoppedAt: string;
  readonly snoozedUntil: string | null;
  readonly recovery:
    | {
        readonly runId: string;
        readonly resetAt: string;
        readonly autoResume: boolean;
        readonly snooze?: boolean | undefined;
        readonly attempt?: number | undefined;
      }
    | null
    | undefined;
  readonly nowMs: number;
}) {
  const stoppedMs = Date.parse(input.stoppedAt);
  const resetMs = input.resetAt === null ? Number.NaN : Date.parse(input.resetAt);
  const current =
    input.recovery?.runId === input.runId && input.recovery.resetAt === input.resetAt
      ? input.recovery
      : null;
  const armed = isLimitResumeArmed(current);
  const attempt = current?.attempt ?? 1;
  const exhausted = !armed && attempt > LIMIT_RESUME_MAX_ATTEMPTS;
  // A reset that had passed when the run stopped says nothing about when to try again.
  const resetKnown = Number.isFinite(resetMs) && resetMs > stoppedMs;
  const resetPassed = resetKnown && resetMs <= input.nowMs;
  const dueMs = limitResumeDueMs({ resetMs, attempt: armed ? attempt : 1, stoppedMs });
  return {
    stoppedMs,
    resetMs,
    dueMs,
    attempt,
    exhausted,
    resetKnown,
    mode: armed
      ? ("armed" as const)
      : resetPassed && !exhausted
        ? ("ready" as const)
        : ("choose" as const),
    canSchedule: resetKnown && !resetPassed,
    snoozed:
      current?.snooze === true &&
      input.snoozedUntil !== null &&
      Date.parse(input.snoozedUntil) === resetMs,
    title: exhausted
      ? `Still limited after ${LIMIT_RESUME_MAX_ATTEMPTS} tries`
      : resetKnown && resetMs - stoppedMs > SESSION_WINDOW_MS
        ? "Usage limit reached"
        : "Session limit reached",
  };
}

/** Tokens a send at `sendAtMs` reads again because the prompt cache ended, or null. */
export function limitRereadTokens(input: {
  readonly contextTokens: number | null | undefined;
  readonly cacheTtlMs?: number | undefined;
  readonly stoppedMs: number;
  readonly sendAtMs: number;
}): number | null {
  const ttl = input.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
  return input.contextTokens && input.sendAtMs - input.stoppedMs >= ttl
    ? input.contextTokens
    : null;
}

export function formatLimitCountdown(ms: number): string {
  const total = Math.max(1, Math.ceil(ms / 60_000));
  const days = Math.floor(total / 1440);
  const hours = Math.floor((total % 1440) / 60);
  const minutes = total % 60;
  if (days > 0) return `${days} d ${hours} h`;
  return hours > 0 ? `${hours} h ${minutes} m` : `${minutes} m`;
}
