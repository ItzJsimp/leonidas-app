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
