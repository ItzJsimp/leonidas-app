import { Button } from "../../components/ui/Button";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import { AsyncResult } from "effect/reactivity";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/shell";
import {
  selectProviderFailoverTargets,
  type ProviderFailoverTarget,
} from "@t3tools/client-runtime/state/provider-failover";
import { type EnvironmentId, MessageId } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { AppText as Text } from "../../components/ui/AppText";
import { threadEnvironment } from "../../state/threads";
import { useAtomCommand } from "../../state/use-atom-command";

export function UsageLimitRecoveryCard({
  thread,
  environmentId,
  canSwitchProvider,
}: {
  thread: EnvironmentThreadShell;
  environmentId: EnvironmentId;
  /** Whether the thread's session can hand its conversation to another provider. */
  canSwitchProvider: boolean;
}) {
  const updateMetadata = useAtomCommand(threadEnvironment.updateMetadata);
  const startTurn = useAtomCommand(threadEnvironment.startTurn);
  const providers = useServerConfigs().get(environmentId)?.providers;
  const failoverTargets = useMemo(
    () =>
      selectProviderFailoverTargets({
        providers: providers ?? [],
        current: thread.modelSelection,
        supportsHandoff: canSwitchProvider,
      }),
    [canSwitchProvider, providers, thread.modelSelection],
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const resetAt = thread.runtime?.usageLimitResetAt ?? null;
  const canSchedule =
    resetAt !== null &&
    Date.parse(resetAt) > Date.parse(thread.latestRun?.completedAt ?? thread.updatedAt);
  // Whether the reset already passed is state a timer flips at resetAt: the
  // compiler caches render output on its inputs, so reading the clock during
  // render would leave the snooze button enabled after the reset.
  const resetAtMs = resetAt === null ? null : Date.parse(resetAt);
  const [resetPassedFor, setResetPassedFor] = useState<number | null>(null);
  const resetPassed = resetAtMs !== null && resetPassedFor === resetAtMs;
  useEffect(() => {
    if (resetAtMs === null || Number.isNaN(resetAtMs)) return;
    const flip = () => setResetPassedFor(resetAtMs);
    const delay = resetAtMs - Date.now();
    if (delay <= 0) {
      flip();
      return;
    }
    // Beyond setTimeout's 32-bit range the card re-renders long before then.
    if (delay > 2_147_483_647) return;
    const timer = setTimeout(flip, delay);
    return () => clearTimeout(timer);
  }, [resetAtMs]);
  const runId = thread.latestRun?.runId;
  const recovery = thread.limitRecovery;
  const scheduled =
    recovery?.runId === runId && recovery?.resetAt === resetAt && recovery?.autoResume;
  if (
    thread.runtime?.status !== "failed" ||
    thread.runtime.lastErrorClass !== "usage_limit" ||
    !runId
  )
    return null;
  const snoozed =
    recovery?.snooze === true &&
    recovery.runId === runId &&
    recovery.resetAt === resetAt &&
    resetAt !== null &&
    thread.snoozedUntil !== null &&
    Date.parse(thread.snoozedUntil) === Date.parse(resetAt);
  async function continueWith(target: ProviderFailoverTarget) {
    if (pending || !runId) return;
    setPending(true);
    setError(null);
    try {
      const result = await startTurn({
        environmentId,
        input: {
          creationSource: "mobile",
          threadId: thread.id,
          manualContinuationOfRunId: runId,
          modelSelection: target.modelSelection,
          message: {
            messageId: MessageId.make(uuidv4()),
            role: "user",
            text: "Continue where you left off. Check the saved conversation and unfinished work before taking action.",
            attachments: [],
          },
          runtimeMode: thread.runtimeMode,
          interactionMode: thread.interactionMode,
          dispatchMode: "start",
        },
      });
      if (result._tag === "Failure") throw squashAtomCommandFailure(result);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not change the AI account. Try again.",
      );
    } finally {
      setPending(false);
    }
  }
  async function toggle(action: "resume" | "snooze") {
    if (!resetAt || !runId || !canSchedule) return;
    if (action === "snooze" && !snoozed && Date.parse(resetAt) <= Date.now()) {
      setError("The reset time has passed. Send a new message to try again.");
      return;
    }
    setPending(true);
    setError(null);
    const result = await updateMetadata({
      environmentId,
      input: {
        threadId: thread.id,
        limitRecovery: {
          runId,
          resetAt,
          ...(action === "resume" ? { autoResume: !scheduled } : { snooze: !snoozed }),
        },
      },
    });
    setPending(false);
    if (AsyncResult.isFailure(result)) {
      const cause = squashAtomCommandFailure(result);
      setError(cause instanceof Error ? cause.message : "Could not change limit recovery.");
    }
  }
  return (
    <View className="mx-3 mb-2 gap-2 rounded-xl border border-warning-foreground/25 bg-screen p-3">
      <Text className="text-sm text-warning-foreground">
        {resetAt
          ? `Usage limit resets ${DateTime.toDateUtc(DateTime.makeUnsafe(resetAt)).toLocaleString()}.`
          : "The AI service did not give a reset time. Send a new message when your usage is available."}
      </Text>
      {failoverTargets.length > 0 ? (
        <View className="flex-row flex-wrap gap-2">
          {failoverTargets.map((target) => (
            <Pressable
              key={target.modelSelection.instanceId}
              accessibilityRole="button"
              accessibilityLabel={`Continue in this chat using ${target.modelSelection.model} with conversation context`}
              disabled={pending}
              onPress={() => void continueWith(target)}
              className="self-start rounded-lg bg-subtle px-3 py-2 active:opacity-70"
            >
              <Text className="text-sm text-foreground">
                {pending ? "Starting..." : `Continue with ${target.label}`}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : canSwitchProvider ? (
        <Text className="text-sm text-muted-foreground">
          No other Claude or Codex AI account is ready to continue this chat.
        </Text>
      ) : null}
      {canSchedule ? (
        <View className="flex-row flex-wrap gap-2">
          <Button
            label={scheduled ? "Cancel auto-resume" : "Resume at reset"}
            tone="secondary"
            disabled={pending}
            onPress={() => void toggle("resume")}
          />
          <Button
            label={snoozed ? "Wake now" : "Snooze until reset"}
            tone="secondary"
            disabled={pending || (!snoozed && resetPassed)}
            onPress={() => void toggle("snooze")}
          />
        </View>
      ) : null}
      {error ? (
        <Text accessibilityRole="alert" className="text-sm text-destructive">
          {error}
        </Text>
      ) : null}
    </View>
  );
}
