import { useServerConfigs } from "../../state/entities";
import { resolveProviderInstanceDisplayName } from "@t3tools/client-runtime/state/provider-instance-display";
import {
  selectProviderFailoverTargets,
  type ProviderFailoverTarget,
} from "@t3tools/client-runtime/state/provider-failover";
import { getQuotaPreflightAdvice } from "@t3tools/client-runtime/state/quota-preflight";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/shell";
import type { EnvironmentId, ModelSelection } from "@t3tools/contracts";
import { useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { AppText as Text } from "../../components/ui/AppText";

export function QuotaPreflightCard({
  thread,
  environmentId,
  canSwitchProvider,
  onUpdateModelSelection,
}: {
  thread: EnvironmentThreadShell;
  environmentId: EnvironmentId;
  canSwitchProvider: boolean;
  onUpdateModelSelection: (selection: ModelSelection) => void;
}) {
  const [dismissed, setDismissed] = useState(false);
  const providers = useServerConfigs().get(environmentId)?.providers;
  const currentProvider = providers?.find((p) => p.instanceId === thread.modelSelection.instanceId);

  const failoverTargets = useMemo(
    () =>
      selectProviderFailoverTargets({
        providers: providers ?? [],
        current: thread.modelSelection,
        supportsHandoff: canSwitchProvider,
      }),
    [canSwitchProvider, providers, thread.modelSelection],
  );

  const advice = useMemo(() => {
    if (!currentProvider || dismissed) return null;
    return getQuotaPreflightAdvice({
      current: {
        instanceId: currentProvider.instanceId,
        driverKind: currentProvider.driver,
        label: resolveProviderInstanceDisplayName(currentProvider),
        windows: currentProvider.usageLimits?.windows ?? [],
      },
      recentTurnTokenUsages: [],
      targets: failoverTargets,
      nowMs: Date.now(),
    });
  }, [currentProvider, dismissed, failoverTargets]);

  if (!advice) return null;

  const { target, usedPercent } = advice;
  const pct = usedPercent === null ? null : Math.round(usedPercent);

  return (
    <View className="mx-3 mb-2 gap-2 rounded-xl border border-warning-foreground/25 bg-screen p-3">
      <View className="flex-row items-center justify-between">
        <Text className="text-sm font-medium text-warning-foreground">
          {currentProvider ? resolveProviderInstanceDisplayName(currentProvider) : "Account"} is
          nearly out of usage
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => setDismissed(true)}
          className="p-1 active:opacity-70"
        >
          <Text className="text-xs text-muted-foreground">Dismiss</Text>
        </Pressable>
      </View>
      <Text className="text-xs text-muted-foreground">
        {pct === null ? "" : `${pct}% used. `}Send your next message on {target.label} so this chat
        keeps going.
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Use ${target.label} next`}
        onPress={() => {
          onUpdateModelSelection(target.modelSelection);
          setDismissed(true);
        }}
        className="self-start rounded-lg bg-subtle px-3 py-2 active:opacity-70"
      >
        <Text className="text-sm text-foreground">Use {target.label} next</Text>
      </Pressable>
    </View>
  );
}
