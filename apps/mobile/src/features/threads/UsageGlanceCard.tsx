import { useNavigation } from "@react-navigation/native";
import { ProviderIcon } from "../../components/ProviderIcon";
import { useAtomSet, useAtomValue } from "@effect/atom-react";
import type { EnvironmentId, ProviderInstanceId, ThreadId } from "@t3tools/contracts";
import {
  activeAccountIds,
  collectConnectedUsageLimits,
} from "@t3tools/shared/connectedUsageLimits";
import { formatResetsIn, limitsNotice } from "@t3tools/shared/usageLimits";
import * as Option from "effect/Option";
import { AsyncResult } from "effect/reactivity";
import { useEffect, useMemo, useState } from "react";
import { Pressable, View } from "react-native";

import { AppText as Text } from "../../components/ui/AppText";
import { mobilePreferencesAtom, updateMobilePreferencesAtom } from "../../state/preferences";
import { environmentPresentations } from "../../state/presentation";
import { useEnvironmentThread } from "../../state/threads";

/** Device-local visibility; the collapsed summary leaves the conversation readable. */
export function UsageGlanceCard(props: {
  readonly environmentId: EnvironmentId;
  readonly instanceId: ProviderInstanceId;
  readonly threadId?: ThreadId;
  readonly top?: number;
}) {
  const navigation = useNavigation();
  const [now, setNow] = useState(Date.now);
  const preferences = useAtomValue(mobilePreferencesAtom);
  const save = useAtomSet(updateMobilePreferencesAtom);
  const enabled =
    !AsyncResult.isSuccess(preferences) || preferences.value.usageOverlayEnabled !== false;
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    if (!enabled || !expanded) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, [enabled, expanded]);
  const presentations = useAtomValue(environmentPresentations.presentationsAtom);
  const providersByEnvironment = useAtomValue(environmentPresentations.providersByEnvironmentAtom);
  const thread = useEnvironmentThread(
    props.threadId ? props.environmentId : null,
    props.threadId ?? null,
  );
  const projection = Option.getOrNull(thread.data);
  const usage =
    projection?.providerTurns.findLast((turn) => turn.tokenUsage)?.tokenUsage ??
    projection?.providerThreads.at(-1)?.contextUsage;
  const report = useMemo(
    () =>
      collectConnectedUsageLimits(
        new Map(
          [...presentations]
            .filter(
              ([, p]) => p.connection.phase === "connected" || p.connection.phase === "available",
            )
            .map(([id, p]) => [
              id,
              {
                entry: p.entry,
                serverConfig:
                  p.serverConfig === null
                    ? null
                    : {
                        providers: providersByEnvironment.get(id) ?? [],
                        usageLimitSources: p.serverConfig.usageLimitSources,
                      },
              },
            ]),
        ),
        0,
      ),
    [presentations, providersByEnvironment],
  );
  const provider = providersByEnvironment
    .get(props.environmentId)
    ?.find((p) => p.instanceId === props.instanceId);
  const active = activeAccountIds(
    report.accounts,
    provider
      ? {
          id: `${props.environmentId}:${props.instanceId}`,
          driver: provider.driver,
          email: provider.auth.email,
          credentialFingerprint: provider.usageLimits?.credentialFingerprint,
        }
      : null,
  );
  const accounts = [
    ...report.accounts.filter((a) => active.has(a.id)),
    ...report.accounts.filter((a) => !active.has(a.id)),
  ];
  const percent = usage?.maxTokens
    ? Math.round(Math.min(100, (usage.usedTokens / usage.maxTokens) * 100))
    : null;
  const context = usage
    ? `${usage.usedTokens.toLocaleString()} / ${usage.maxTokens?.toLocaleString() ?? "unknown capacity"} tokens`
    : "Context not reported yet";
  return (
    <View
      pointerEvents="box-none"
      style={{ position: "absolute", top: props.top ?? 8, left: 12, right: 12, zIndex: 20 }}
    >
      <View
        className="self-start rounded-2xl border border-border-subtle bg-card"
        style={{ maxWidth: "100%" }}
      >
        <View className="flex-row items-center">
          {enabled ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Expand context and accounts"
              accessibilityState={{ expanded }}
              onPress={() => setExpanded(!expanded)}
              className="min-h-11 flex-1 justify-center px-3"
            >
              <Text numberOfLines={1} className="text-xs text-foreground">
                {percent === null ? "Context" : `Context ${percent}%`} ·{" "}
                {accounts.find((a) => active.has(a.id))?.displayName ??
                  provider?.displayName ??
                  provider?.driver ??
                  "Accounts"}{" "}
                {expanded ? "▴" : "▾"}
              </Text>
            </Pressable>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={enabled ? "Hide context and accounts" : "Show context and accounts"}
            accessibilityState={{ selected: enabled }}
            onPress={() => {
              save({ usageOverlayEnabled: !enabled });
              setExpanded(false);
            }}
            className="min-h-11 min-w-11 items-center justify-center px-3"
          >
            <Text className="text-xs text-foreground-muted">{enabled ? "×" : "Usage"}</Text>
          </Pressable>
        </View>
        {enabled && expanded ? (
          <View className="w-72 max-w-full px-3 pb-3">
            <Text className="pb-2 text-xs text-foreground-muted">{context}</Text>
            {usage ? (
              <Text className="pb-2 text-xs text-foreground-muted">
                Input {usage.inputTokens?.toLocaleString() ?? "—"} · Cached{" "}
                {usage.cachedInputTokens?.toLocaleString() ?? "—"} · Output{" "}
                {usage.outputTokens?.toLocaleString() ?? "—"}
              </Text>
            ) : null}
            {accounts.slice(0, 5).map((account) => (
              <View key={account.id} className="gap-1 border-t border-border-subtle py-2">
                <View className="flex-row items-center gap-2">
                  <ProviderIcon provider={account.driver} size={active.has(account.id) ? 18 : 14} />
                  <Text
                    numberOfLines={1}
                    className={
                      active.has(account.id)
                        ? "text-sm font-semibold text-foreground"
                        : "text-xs text-foreground"
                    }
                  >
                    {account.displayName ?? account.label}
                    {active.has(account.id) ? " · This chat" : ""}
                  </Text>
                </View>
                {account.plan ? (
                  <Text className="text-xs text-foreground-muted">{account.plan}</Text>
                ) : null}
                {limitsNotice(account.limits) ? (
                  <Text className="text-xs text-foreground-muted">
                    {limitsNotice(account.limits)}
                  </Text>
                ) : (
                  account.limits.windows
                    .filter((window) => window.kind === "session" || window.kind === "weekly")
                    .slice(0, 2)
                    .map((window) => (
                      <Text key={window.id} className="text-xs text-foreground-muted">
                        {window.label ?? window.id}:{" "}
                        {Math.round(Math.max(0, 100 - window.usedPercent))}% left ·{" "}
                        {formatResetsIn(window, now) ?? "Reset not reported"}
                      </Text>
                    ))
                )}
              </View>
            ))}
            <Pressable
              accessibilityRole="button"
              onPress={() =>
                navigation.navigate("SettingsSheet", {
                  screen: "SettingsContent",
                  params: { screen: "SettingsUsage" },
                })
              }
              className="min-h-11 justify-center"
            >
              <Text className="text-xs text-foreground">
                {accounts.length > 5 ? `+${accounts.length - 5} more · ` : ""}Full usage overview →
              </Text>
            </Pressable>
            {accounts.length === 0 ? (
              <Text className="text-xs text-foreground-muted">
                No connected AI accounts reported.
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  );
}
