import type { ChatQuotaReport } from "@t3tools/contracts";

export const QUOTA_RANGES = [
  { id: "24h", days: 1 },
  { id: "7d", days: 7 },
  { id: "30d", days: 30 },
] as const;
export type QuotaRangeId = (typeof QUOTA_RANGES)[number]["id"];

/** Readings last 30 days, so longer or shorter presets fall back to a week. */
export function quotaRangeFor(rangeId: string): (typeof QUOTA_RANGES)[number] {
  return QUOTA_RANGES.find((range) => range.id === rangeId) ?? QUOTA_RANGES[1];
}

export interface QuotaAuditRow {
  readonly key: string;
  readonly title: string;
  readonly projectName: string | null;
  readonly accountName: string;
  readonly plan: string | null;
  readonly fiveHour: number;
  readonly weekly: number;
  /** Another chat or device may share the points, so they are a ceiling. */
  readonly shared: boolean;
  readonly lastAt: string;
}

export interface QuotaAuditLookups {
  readonly threads: ReadonlyMap<string, { readonly title: string; readonly projectId: string }>;
  readonly projects: ReadonlyMap<string, string>;
  readonly accounts: ReadonlyMap<string, { readonly name: string; readonly plan: string | null }>;
}

/** Chats the app no longer knows keep a row: the quota they used is still spent. */
export function buildQuotaRows(
  report: ChatQuotaReport,
  lookups: QuotaAuditLookups,
): ReadonlyArray<QuotaAuditRow> {
  return report.chats
    .filter((chat) => chat.fiveHour.points > 0 || chat.weekly.points > 0)
    .map((chat) => {
      const thread = lookups.threads.get(chat.threadId);
      const account = lookups.accounts.get(chat.providerInstanceId);
      return {
        key: `${chat.providerInstanceId}:${chat.threadId}`,
        title: thread?.title ?? "Chat no longer in the list",
        projectName: thread ? (lookups.projects.get(thread.projectId) ?? null) : null,
        accountName: account?.name ?? chat.providerInstanceId,
        plan: account?.plan ?? null,
        fiveHour: Math.round(chat.fiveHour.points),
        weekly: Math.round(chat.weekly.points),
        shared: chat.fiveHour.sharedPoints > 0 || chat.weekly.sharedPoints > 0,
        lastAt: chat.lastAt,
      };
    })
    .toSorted((a, b) => b.weekly - a.weekly || b.fiveHour - a.fiveHour);
}
