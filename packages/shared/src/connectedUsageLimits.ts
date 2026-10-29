import type { UsageLimitsReport } from "@t3tools/contracts";
import { isProviderAvailable } from "@t3tools/contracts";
import { type LimitPresentations, mergeLimitWindows } from "@t3tools/shared/usageLimits";
import * as DateTime from "effect/DateTime";

type Account = UsageLimitsReport["accounts"][number];

/**
 * The report rows that are this thread's own subscription: same driver, then the same
 * signed-in email, else the same credential, else the same provider instance.
 */
export function activeAccountIds(
  accounts: ReadonlyArray<Account>,
  active: {
    readonly id: string;
    readonly driver: string;
    readonly email?: string | undefined;
    readonly credentialFingerprint?: string | undefined;
  } | null,
): ReadonlySet<string> {
  if (!active) return new Set();
  const email = active.email?.trim().toLowerCase();
  return new Set(
    accounts
      .filter(
        (account) =>
          account.driver === active.driver &&
          (email
            ? account.email?.trim().toLowerCase() === email
            : active.credentialFingerprint
              ? account.limits.credentialFingerprint === active.credentialFingerprint
              : account.id === active.id),
      )
      .map((account) => account.id),
  );
}

/** One row per subscription, including authenticated accounts that cannot report quotas. */
export function collectConnectedUsageLimits(
  presentations: LimitPresentations,
  now: number,
): UsageLimitsReport {
  const accounts = new Map<string, Account>();
  const notices = new Set<string>();
  const merge = (account: Account) => {
    const email = account.email?.trim().toLowerCase();
    const identity = email || account.limits.credentialFingerprint;
    const key = identity ? `${account.driver}:${identity}` : account.id;
    const previous = accounts.get(key);
    if (!previous) {
      accounts.set(key, account);
      return;
    }
    const fresher = Date.parse(account.limits.checkedAt) > Date.parse(previous.limits.checkedAt);
    const winner = fresher ? account : previous;
    // A native name and instance identify the account even when the hub has fresher limits.
    accounts.set(key, {
      ...previous,
      ...winner,
      instanceId: previous.instanceId ?? account.instanceId,
      displayName: previous.displayName ?? account.displayName,
      limits: {
        ...winner.limits,
        windows: mergeLimitWindows(
          winner.limits.windows,
          (fresher ? previous : account).limits.windows,
        ),
      },
    });
  };
  for (const [environmentId, presentation] of presentations) {
    const config = presentation.serverConfig;
    for (const provider of config?.providers ?? []) {
      if (
        !provider.enabled ||
        !provider.installed ||
        !isProviderAvailable(provider) ||
        provider.auth.status !== "authenticated"
      )
        continue;
      merge({
        id: `${environmentId}:${provider.instanceId}`,
        driver: provider.driver,
        label: provider.displayName?.trim() || String(provider.driver),
        instanceId: provider.instanceId,
        ...(provider.displayName ? { displayName: provider.displayName } : {}),
        ...(provider.auth.email ? { email: provider.auth.email } : {}),
        ...(provider.auth.label ? { plan: provider.auth.label } : {}),
        limits: provider.usageLimits ?? {
          checkedAt: provider.checkedAt,
          windows: [],
          unavailable: {
            reason: provider.driver === "antigravity" ? "probeFailed" : "unsupported",
            message:
              provider.driver === "antigravity"
                ? "Could not read Antigravity quota."
                : "Connected. This AI service does not show usage limits.",
          },
        },
      });
    }
    for (const source of config?.usageLimitSources ?? []) {
      for (const account of source.accounts) {
        merge({
          id: `${environmentId}:${source.id}:${account.id}`,
          driver: account.driver,
          label: `${account.driver} · ${source.label} · ${account.id}`,
          sourceLabel: source.label,
          ...(account.email ? { email: account.email } : {}),
          ...(account.plan ? { plan: account.plan } : {}),
          limits: account.usageLimits,
        });
      }
      if (source.error) notices.add(`${source.label}: ${source.error}`);
    }
  }
  return {
    createdAt: DateTime.formatIso(DateTime.makeUnsafe(now)),
    accounts: [...accounts.values()],
    notices: [...notices],
  };
}
