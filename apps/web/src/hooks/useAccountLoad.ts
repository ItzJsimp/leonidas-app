import {
  countAccountLoad,
  resolveAccountKey,
  type AccountLoad,
} from "@t3tools/client-runtime/state/activeAgentCounts";
import { useAtomValue } from "@effect/atom-react";
import { useMemo } from "react";

import { environmentPresentations } from "../state/presentation";
import { useThreadShells } from "../state/entities";

const NO_LOAD: AccountLoad = { chats: 0, running: 0 };

/**
 * Open chats and running agents per provider instance, summed over every connected
 * environment and merged across instances that share one underlying account. Look up
 * by `${environmentId}:${instanceId}` (the usage account id).
 */
export function useAccountLoad(): (scopedInstanceId: string) => AccountLoad {
  const threads = useThreadShells();
  const providersByEnvironment = useAtomValue(environmentPresentations.providersByEnvironmentAtom);
  return useMemo(() => {
    const providers = [...providersByEnvironment].flatMap(([environmentId, environmentProviders]) =>
      environmentProviders.map((provider) => ({
        ...provider,
        environmentId: String(environmentId),
      })),
    );
    const byAccount = countAccountLoad({ providers, threads });
    const keys = new Map(
      providers.map((p) => [`${p.environmentId}:${p.instanceId}`, resolveAccountKey(p)]),
    );
    return (scopedInstanceId) => {
      const key = keys.get(scopedInstanceId);
      return (key && byAccount.get(key)) || NO_LOAD;
    };
  }, [providersByEnvironment, threads]);
}
