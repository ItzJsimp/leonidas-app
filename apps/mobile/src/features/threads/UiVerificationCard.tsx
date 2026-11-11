import {
  uiChangedPaths,
  uiVerificationPrompt,
} from "@t3tools/client-runtime/state/ui-verification";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/shell";
import type { OrchestrationV2TurnItem } from "@t3tools/contracts";
import { useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { AppText as Text } from "../../components/ui/AppText";

export function UiVerificationCard({
  thread,
  turnItems,
  getDraftMessage,
  onChangeDraftMessage,
}: {
  thread: EnvironmentThreadShell;
  turnItems: ReadonlyArray<OrchestrationV2TurnItem>;
  getDraftMessage: () => string;
  onChangeDraftMessage: (message: string) => void;
}) {
  const [dismissedRunId, setDismissedRunId] = useState<string | null>(null);
  const latestRunId = thread.latestRun?.runId;

  const paths = useMemo(() => {
    if (!latestRunId || dismissedRunId === latestRunId) return [];
    if (thread.latestRun?.status !== "completed") return [];
    return uiChangedPaths(turnItems, latestRunId);
  }, [latestRunId, dismissedRunId, thread.latestRun?.status, turnItems]);

  if (paths.length === 0) return null;

  const names = paths.map((path) => path.split("/").at(-1) ?? path);
  const extra = names.length > 3 ? ` and ${names.length - 3} more` : "";

  return (
    <View className="mx-3 mb-2 gap-2 rounded-xl border border-info-foreground/25 bg-screen p-3">
      <View className="flex-row items-center justify-between">
        <Text className="text-sm font-medium text-info-foreground">
          Check the screens you changed
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => setDismissedRunId(latestRunId ?? null)}
          className="p-1 active:opacity-70"
        >
          <Text className="text-xs text-muted-foreground">Dismiss</Text>
        </Pressable>
      </View>
      <Text className="text-xs text-muted-foreground">
        {names.slice(0, 3).join(", ")}
        {extra} changed in your last turn.
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Verify in preview"
        onPress={() => {
          if (getDraftMessage().trim().length === 0) {
            onChangeDraftMessage(uiVerificationPrompt(paths));
          }
          setDismissedRunId(latestRunId ?? null);
        }}
        className="self-start rounded-lg bg-subtle px-3 py-2 active:opacity-70"
      >
        <Text className="text-sm text-foreground">Verify in preview</Text>
      </Pressable>
    </View>
  );
}
