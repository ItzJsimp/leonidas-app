import type { EnvironmentId, ProviderInstanceId, UsageLimitsReport } from "@t3tools/contracts";
import { useAtomValue } from "@effect/atom-react";
import { useMemo } from "react";

import { activeAccountIds, collectConnectedUsageLimits } from "../lib/connectedUsageLimits";
import { environmentPresentations } from "../state/presentation";

type Account = UsageLimitsReport["accounts"][number];

export interface ConnectedUsageAccounts {
  /** The subscription account(s) behind this chat's provider instance. */
  readonly active: ReadonlyArray<Account>;
  /** Every other connected subscription account. */
  readonly others: ReadonlyArray<Account>;
}

/** Connected accounts split into this chat's own account and the rest. */
export function useConnectedUsageAccounts(
  environmentId: EnvironmentId,
  instanceId: ProviderInstanceId | null,
): ConnectedUsageAccounts {
  const presentations = useAtomValue(environmentPresentations.presentationsAtom);
  const providersByEnvironment = useAtomValue(environmentPresentations.providersByEnvironmentAtom);

  return useMemo(() => {
    const report = collectConnectedUsageLimits(
      new Map(
        [...presentations]
          .filter(
            ([, presentation]) =>
              presentation.connection.phase === "connected" ||
              presentation.connection.phase === "available",
          )
          .map(([id, presentation]) => [
            id,
            {
              entry: presentation.entry,
              serverConfig:
                presentation.serverConfig === null
                  ? null
                  : {
                      providers: providersByEnvironment.get(id) ?? [],
                      usageLimitSources: presentation.serverConfig.usageLimitSources,
                    },
            },
          ]),
      ),
      0,
    );
    const provider = providersByEnvironment
      .get(environmentId)
      ?.find((candidate) => candidate.instanceId === instanceId);
    const activeIds = activeAccountIds(
      report.accounts,
      provider && instanceId
        ? {
            id: `${environmentId}:${instanceId}`,
            driver: provider.driver,
            email: provider.auth.email,
            credentialFingerprint: provider.usageLimits?.credentialFingerprint,
          }
        : null,
    );
    return {
      active: report.accounts.filter((account) => activeIds.has(account.id)),
      others: report.accounts.filter((account) => !activeIds.has(account.id)),
    };
  }, [presentations, providersByEnvironment, environmentId, instanceId]);
}
