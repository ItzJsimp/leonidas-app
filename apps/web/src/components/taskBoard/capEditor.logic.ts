/** The limit a project gets with no `cap:` line. Mirrors `PROJECT_CAP` in the server's capRules.ts. */
export const DEFAULT_CAP = 50;
/** 60 percent of the default limit, rounded down, as `parseCapRule` computes it. */
export const DEFAULT_WARN = 30;
const MAX_CAP = 9999;

/**
 * A plain sentence when this limit and warning cannot be saved, else null. The same rules as
 * `capProblem` on the server, so the form refuses before it sends. `null` is an empty field.
 */
export function capFormProblem(cap: number | null, warn: number | null): string | null {
  if (cap === null || warn === null || !Number.isInteger(cap) || !Number.isInteger(warn)) {
    return "Use whole numbers.";
  }
  if (cap < 1 || cap > MAX_CAP) return `The limit must be from 1 to ${MAX_CAP}.`;
  if (warn < 0 || warn > cap) return "The warning must be from 0 up to the limit.";
  return null;
}

/** A heads-up (not a refusal) when the new limit is already below the open count. */
export function capLowerNote(cap: number | null, open: number): string | null {
  return cap !== null && cap < open
    ? `${open} tasks are open, so this project shows as full at once.`
    : null;
}
