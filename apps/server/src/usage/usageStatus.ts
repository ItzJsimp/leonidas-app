import type { ServerProvider } from "@t3tools/contracts";

import { accountName, liveWindows, peakPercent } from "../mcp/spawnQuotaGuard.ts";

/** `no_data` is an account that reports no meter. Missing data never counts as "at limit". */
export type AccountUsageState = "ok" | "near_limit" | "at_limit" | "no_data";

export interface AccountUsage {
  readonly providerInstanceId: string;
  readonly account: string;
  readonly driver: string;
  readonly state: AccountUsageState;
  readonly highestUsedPercent: number | null;
  readonly windows: ReadonlyArray<{
    readonly label: string;
    readonly usedPercent: number;
    readonly remainingPercent: number;
    readonly resetsAt?: string;
  }>;
}

/**
 * The usage of every connected account, for the "skip accounts near their limit" rule. It shows
 * the account name only: never an email, key or credential fingerprint.
 */
export function usageStatus(
  providers: ReadonlyArray<ServerProvider>,
  nowMs: number,
  nearLimitPercent: number,
): ReadonlyArray<AccountUsage> {
  return providers.map((provider) => {
    const highest = peakPercent(provider, nowMs);
    const state: AccountUsageState =
      provider.connectionIssue === "quota_reached" || (highest !== null && highest >= 100)
        ? "at_limit"
        : highest === null
          ? "no_data"
          : highest >= nearLimitPercent
            ? "near_limit"
            : "ok";
    return {
      providerInstanceId: provider.instanceId,
      // An account label can be an email, so fall back to the instance id.
      account: accountName(provider).includes("@") ? provider.instanceId : accountName(provider),
      driver: provider.driver,
      state,
      highestUsedPercent: highest,
      windows: liveWindows(provider, nowMs).map((window) => ({
        label: window.label,
        usedPercent: window.usedPercent,
        remainingPercent: Math.max(0, 100 - window.usedPercent),
        ...(window.resetsAt === undefined ? {} : { resetsAt: window.resetsAt }),
      })),
    };
  });
}
