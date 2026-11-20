import type { ChatQuota, ProviderInstanceId } from "@t3tools/contracts";

export interface ChatQuotaLineView {
  /** Whole percents of one 5-hour limit, "<1" for a trace, null for none. */
  readonly fiveHour: string | null;
  readonly weekly: string | null;
  /** True when another chat or device may have used part of it, so the numbers are a ceiling. */
  readonly shared: boolean;
}

export function formatQuotaPoints(points: number): string | null {
  if (!(points > 0)) return null;
  return points < 1 ? "<1" : String(Math.round(points));
}

/** The chat's share on the account it runs on now. Points of different accounts never add up. */
export function chatQuotaLineFor(
  quota: ChatQuota | null,
  instanceId: ProviderInstanceId | null,
): ChatQuotaLineView | null {
  const row = quota?.accounts.find((account) => account.providerInstanceId === instanceId);
  if (!row) return null;
  const fiveHour = formatQuotaPoints(row.fiveHour.points);
  const weekly = formatQuotaPoints(row.weekly.points);
  if (fiveHour === null && weekly === null) return null;
  return {
    fiveHour,
    weekly,
    shared: row.fiveHour.sharedPoints > 0 || row.weekly.sharedPoints > 0,
  };
}
