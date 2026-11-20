import type { ServerProviderUsageLimits, ServerProviderUsageWindow } from "@t3tools/contracts";
import { elapsedShare } from "@t3tools/shared/usageLimits";

import {
  glanceLimitRows,
  limitLabel,
  usageSeverity,
  type UsageSeverity,
} from "./usageLimitsPopover";

const MINUTE = 60_000;

export interface AccountHeadroom {
  /** Quota left in the tightest window, 0 to 100. */
  readonly leftPercent: number;
  readonly severity: UsageSeverity;
  /** Plain name of the tightest window, such as "5-hour limit". */
  readonly windowLabel: string;
  /** Minutes until the pace so far empties a window before it resets. Null when it will last. */
  readonly minutesToLimit: number | null;
}

/** Minutes until a window runs out at the pace it has kept so far; null when it resets first. */
function minutesUntilEmpty(window: ServerProviderUsageWindow, now: number): number | null {
  if (window.usedPercent >= 100) return 0;
  const elapsed = elapsedShare(window, now);
  if (
    elapsed === null ||
    window.windowDurationMins === undefined ||
    window.resetsAt === undefined
  ) {
    return null;
  }
  const elapsedMinutes = elapsed * window.windowDurationMins;
  if (window.usedPercent <= 0 || elapsedMinutes <= 0) return null;
  const minutes = ((100 - window.usedPercent) / window.usedPercent) * elapsedMinutes;
  const minutesToReset = (Date.parse(window.resetsAt) - now) / MINUTE;
  return minutes < minutesToReset ? Math.ceil(minutes) : null;
}

/**
 * How much room an account has left, from its session and weekly windows: the tightest
 * window sets the percent, and the soonest projected run-out sets the minutes. Null when
 * the provider reports no windows, so the rail shows no ring.
 */
export function accountHeadroom(
  limits: ServerProviderUsageLimits | null | undefined,
  now: number,
): AccountHeadroom | null {
  const windows = glanceLimitRows(limits?.windows ?? [], now).flatMap((row) =>
    row.window ? [row.window] : [],
  );
  const tightest = windows.reduce<ServerProviderUsageWindow | null>(
    (best, window) => (best === null || window.usedPercent > best.usedPercent ? window : best),
    null,
  );
  if (tightest === null) return null;
  const soonest = windows
    .flatMap((window) => minutesUntilEmpty(window, now) ?? [])
    .reduce<number | null>(
      (least, minutes) => (least === null ? minutes : Math.min(least, minutes)),
      null,
    );
  return {
    leftPercent: Math.round(Math.max(0, Math.min(100, 100 - tightest.usedPercent))),
    severity: usageSeverity(tightest.usedPercent),
    windowLabel: limitLabel(tightest, "glance"),
    minutesToLimit: soonest,
  };
}

/** "62% left in the 5-hour limit, limit in about 40 min", for the rail tooltip. */
export function accountHeadroomLabel(headroom: AccountHeadroom): string {
  const left = `${headroom.leftPercent}% left in the ${headroom.windowLabel.toLowerCase()}`;
  const { minutesToLimit } = headroom;
  if (minutesToLimit === null) return left;
  if (minutesToLimit === 0) return `${left}, limit reached`;
  const span =
    minutesToLimit < 60 ? `${minutesToLimit} min` : `${Math.round(minutesToLimit / 6) / 10} hr`;
  return `${left}, limit in about ${span}`;
}
