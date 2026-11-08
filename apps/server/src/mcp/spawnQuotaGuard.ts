/**
 * The quota guard for every `leo_delegate_task` spawn. A child on an account that
 * has used `blockPercent` or more of any live window stops at the limit and
 * loses its work, so the spawn fails and the error names the accounts that
 * still have room. An account with no meter data passes: missing data must
 * not block work.
 */
import type { ServerProvider, ServerProviderUsageWindow } from "@t3tools/contracts";

/** Windows that have not reset yet; a window past its reset time reads as empty. */
export const liveWindows = (
  provider: ServerProvider,
  nowMs: number,
): ReadonlyArray<ServerProviderUsageWindow> =>
  (provider.usageLimits?.windows ?? []).filter(
    (window) => window.resetsAt === undefined || Date.parse(window.resetsAt) > nowMs,
  );

export const peakPercent = (provider: ServerProvider, nowMs: number): number | null => {
  const windows = liveWindows(provider, nowMs);
  return windows.length === 0 ? null : Math.max(...windows.map((window) => window.usedPercent));
};

export const accountName = (provider: ServerProvider): string =>
  provider.displayName ?? provider.auth.label ?? provider.instanceId;

/** The refusal message for a spawn on `target`, or null when the account has room. */
export function spawnQuotaBlock(input: {
  readonly target: ServerProvider | undefined;
  readonly providers: ReadonlyArray<ServerProvider>;
  readonly blockPercent: number;
  readonly nowMs: number;
  /** True for an account that can take a delegated child at all. */
  readonly isRunnable: (provider: ServerProvider) => boolean;
}): string | null {
  const { target, blockPercent, nowMs } = input;
  if (target === undefined) return null;
  const hot = liveWindows(target, nowMs)
    .filter((window) => window.usedPercent >= blockPercent)
    .toSorted((left, right) => right.usedPercent - left.usedPercent)[0];
  const reached = target.connectionIssue === "quota_reached";
  if (hot === undefined && !reached) return null;

  const name = accountName(target);
  const why =
    hot === undefined
      ? `${name} has reached its usage limit`
      : `${name} has used ${Math.round(hot.usedPercent)}% of its ${hot.label} limit${
          hot.resetsAt === undefined ? "" : ` (resets ${hot.resetsAt})`
        }`;
  const room = input.providers
    .filter(
      (provider) =>
        provider.instanceId !== target.instanceId &&
        provider.connectionIssue !== "quota_reached" &&
        input.isRunnable(provider),
    )
    .map((provider) => ({ provider, peak: peakPercent(provider, nowMs) }))
    .filter((entry) => entry.peak === null || entry.peak < blockPercent)
    .toSorted((left, right) => (left.peak ?? 101) - (right.peak ?? 101))
    .slice(0, 4)
    .map(
      ({ provider, peak }) =>
        `${accountName(provider)} (${provider.instanceId}, ${
          peak === null ? "no meter data" : `highest window ${Math.round(peak)}%`
        })`,
    );
  return [
    `${why}, so a child there would stop at the limit and lose its work. Do not spawn on this account.`,
    room.length === 0
      ? "No other account has room. Do the work yourself or ask the user."
      : `Accounts with room: ${room.join("; ")}. Retry with one of these as target.providerInstanceId and a model it offers.`,
  ].join(" ");
}
