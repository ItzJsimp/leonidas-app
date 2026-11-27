// @effect-diagnostics globalDate:off - The card shows wall-clock times and counts down to them.
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import {
  selectProviderFailoverTargets,
  type ProviderFailoverTarget,
} from "@t3tools/client-runtime/state/provider-failover";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/shell";
import { type EnvironmentId, MessageId } from "@t3tools/contracts";
import { formatTokens } from "@t3tools/shared/usageFormat";
import {
  formatLimitCountdown,
  LIMIT_RESUME_MAX_ATTEMPTS,
  limitRereadTokens,
  usageLimitCardState,
} from "@t3tools/shared/usageLimitRecovery";
import { AsyncResult } from "effect/reactivity";
import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";

import { AppText as Text } from "../../components/ui/AppText";
import { Button } from "../../components/ui/Button";
import { ListChoiceRow } from "../../components/ui/ListChoiceRow";
import { ListToggleRow } from "../../components/ui/ListToggleRow";
import { uuidv4 } from "../../lib/uuid";
import { useServerConfigs } from "../../state/entities";
import { threadEnvironment } from "../../state/threads";
import { useAtomCommand } from "../../state/use-atom-command";

/** "Keep waiting" folds the card. The choice holds for the run while the app is open. */
const waitingRuns = new Set<string>();

type CardProps = {
  thread: EnvironmentThreadShell;
  environmentId: EnvironmentId;
  /** Whether the thread's session can hand its conversation to another provider. */
  canSwitchProvider: boolean;
  /** Context the chat holds, so the card can say what a late send reads again. */
  usage?: { readonly usedTokens: number; readonly promptCacheTtlMs?: number | undefined } | null;
  onOpenSettings: () => void;
};

export function UsageLimitRecoveryCard(props: CardProps) {
  const { thread } = props;
  const runId = thread.latestRun?.runId;
  if (
    thread.runtime?.status !== "failed" ||
    thread.runtime.lastErrorClass !== "usage_limit" ||
    !runId
  ) {
    return null;
  }
  const resetAt = thread.runtime.usageLimitResetAt ?? null;
  return <LimitCard key={`${runId}:${resetAt}`} {...props} runId={runId} resetAt={resetAt} />;
}

function formatWhen(ms: number, nowMs: number): string {
  const date = new Date(ms);
  const time = date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return date.toDateString() === new Date(nowMs).toDateString()
    ? time
    : `${date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}, ${time}`;
}

function LimitCard({
  thread,
  environmentId,
  canSwitchProvider,
  usage,
  onOpenSettings,
  runId,
  resetAt,
}: CardProps & {
  runId: NonNullable<EnvironmentThreadShell["latestRun"]>["runId"];
  resetAt: string | null;
}) {
  const updateMetadata = useAtomCommand(threadEnvironment.updateMetadata);
  const startTurn = useAtomCommand(threadEnvironment.startTurn);
  const config = useServerConfigs().get(environmentId);
  // Time is state a timer moves: the compiler caches render output on its inputs.
  const [nowMs, setNowMs] = useState(() => Date.now());
  const resetBoundary = resetAt === null ? Number.NaN : Date.parse(resetAt);
  const wakeAt = resetBoundary > nowMs ? Math.min(nowMs + 30_000, resetBoundary) : nowMs + 30_000;
  useEffect(() => {
    const timer = setTimeout(() => setNowMs(Date.now()), Math.max(0, wakeAt - Date.now()) + 1);
    return () => clearTimeout(timer);
  }, [wakeAt]);

  const state = usageLimitCardState({
    runId,
    resetAt,
    stoppedAt: thread.latestRun?.completedAt ?? thread.updatedAt,
    snoozedUntil: thread.snoozedUntil,
    recovery: thread.limitRecovery,
    nowMs,
  });
  const { canSchedule, snoozed } = state;
  const targets = selectProviderFailoverTargets({
    providers: config?.providers ?? [],
    current: thread.modelSelection,
    supportsHandoff: canSwitchProvider,
    nowMs,
  });
  const accountLabel =
    config?.providers.find((entry) => entry.instanceId === thread.modelSelection.instanceId)
      ?.displayName ?? "This account";

  /** "wait", "auto", or the account id of another account. */
  const [choice, setChoice] = useState("wait");
  const [snoozeChecked, setSnoozeChecked] = useState<boolean | null>(null);
  const [waiting, setWaiting] = useState(() => waitingRuns.has(runId));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const target = targets.find((item) => item.modelSelection.instanceId === choice);
  const selected = target ? choice : choice === "auto" && canSchedule ? "auto" : "wait";
  const wantsSnooze = snoozeChecked ?? snoozed;
  const dueLabel = Number.isFinite(state.dueMs) ? formatWhen(state.dueMs, nowMs) : "";

  function rereads(sendAtMs: number): string | null {
    const tokens = limitRereadTokens({
      contextTokens: usage?.usedTokens,
      cacheTtlMs: usage?.promptCacheTtlMs,
      stoppedMs: state.stoppedMs,
      sendAtMs,
    });
    return tokens === null ? null : `Re-reads ${formatTokens(tokens)} tokens.`;
  }

  function headroom(item: ProviderFailoverTarget): string | null {
    const windows =
      config?.providers
        .find((entry) => entry.instanceId === item.modelSelection.instanceId)
        ?.usageLimits?.windows.filter(
          (window) => window.resetsAt === undefined || Date.parse(window.resetsAt) > nowMs,
        ) ?? [];
    if (windows.length === 0) return null;
    const used = Math.max(...windows.map((window) => window.usedPercent));
    return `${Math.round(Math.max(0, Math.min(100, 100 - used)))}% left`;
  }

  async function run(
    action: () => Promise<AsyncResult.AsyncResult<unknown, unknown>>,
    fallback: string,
  ): Promise<boolean> {
    if (pending) return false;
    setPending(true);
    setError(null);
    const result = await action();
    setPending(false);
    if (!AsyncResult.isFailure(result)) return true;
    const cause = squashAtomCommandFailure(result);
    setError(cause instanceof Error ? cause.message : fallback);
    return false;
  }

  const save = (update: { autoResume?: boolean; snooze?: boolean }) =>
    run(
      () =>
        updateMetadata({
          environmentId,
          input: { threadId: thread.id, limitRecovery: { runId, resetAt: resetAt!, ...update } },
        }),
      "Could not save this choice. Try again.",
    );

  const continueOn = (modelSelection: ProviderFailoverTarget["modelSelection"]) =>
    run(
      () =>
        startTurn({
          environmentId,
          input: {
            creationSource: "mobile",
            threadId: thread.id,
            manualContinuationOfRunId: runId,
            modelSelection,
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
        }),
      "Could not continue this chat. Try again.",
    );

  function confirm() {
    if (target) {
      void continueOn(target.modelSelection);
      return;
    }
    const snooze = canSchedule && wantsSnooze !== snoozed ? { snooze: wantsSnooze } : null;
    if (selected === "auto") {
      void save({ autoResume: true, ...snooze });
      return;
    }
    void (async () => {
      if (snooze && !(await save(snooze))) return;
      waitingRuns.add(runId);
      setWaiting(true);
    })();
  }

  const errorLine = error ? (
    <Text accessibilityRole="alert" className="px-3 text-sm text-destructive">
      {error}
    </Text>
  ) : null;

  const compact = (title: string, detail: string, action: React.ReactNode) => (
    <View className="mx-3 mb-2 gap-2 rounded-xl border border-border-subtle bg-grouped-card p-3">
      <View accessibilityLiveRegion="polite">
        <Text className="text-sm font-semibold text-foreground">{title}</Text>
        <Text className="text-sm text-muted-foreground">{detail}</Text>
      </View>
      {action}
      {errorLine}
    </View>
  );

  if (state.mode === "armed") {
    const retrying = state.attempt > 1;
    return compact(
      retrying ? `Still limited. Retries at ${dueLabel}` : `Continues at ${dueLabel}`,
      retrying ? `Try ${state.attempt} of ${LIMIT_RESUME_MAX_ATTEMPTS}` : accountLabel,
      <Button
        label={retrying ? "Stop" : "Cancel"}
        tone="secondary"
        disabled={pending}
        onPress={() => void save({ autoResume: false })}
      />,
    );
  }

  if (state.mode === "ready") {
    return compact(
      "Your limit reset",
      rereads(nowMs) ?? accountLabel,
      <Button
        label="Continue chat"
        tone="primary"
        disabled={pending}
        onPress={() => void continueOn(thread.modelSelection)}
      />,
    );
  }

  if (waiting) {
    return compact(
      "Waiting for you",
      state.resetKnown ? `Resets ${formatWhen(state.resetMs, nowMs)}` : "Reset time unknown",
      <Button
        label="Change"
        tone="secondary"
        onPress={() => {
          waitingRuns.delete(runId);
          setWaiting(false);
        }}
      />,
    );
  }

  return (
    <View className="mx-3 mb-2 overflow-hidden rounded-xl border border-border-subtle bg-grouped-card">
      <View className="px-3 pt-3 pb-2">
        <Text accessibilityRole="header" className="text-base font-semibold text-foreground">
          {state.title}
        </Text>
        <Text className="text-sm text-muted-foreground">
          {accountLabel}
          {" · "}
          {canSchedule
            ? `Resets ${formatWhen(state.resetMs, nowMs)} · ${formatLimitCountdown(state.resetMs - nowMs)}`
            : "Reset time unknown"}
        </Text>
      </View>
      <View accessibilityRole="radiogroup">
        <ListChoiceRow
          label="Wait for me"
          description="Nothing sends until you send it."
          selected={selected === "wait"}
          disabled={pending}
          onPress={() => setChoice("wait")}
          separated
        />
        {canSchedule ? (
          <ListChoiceRow
            label={`Continue at ${dueLabel}`}
            description={["Sends 2 minutes after the reset.", rereads(state.dueMs)]
              .filter(Boolean)
              .join(" ")}
            selected={selected === "auto"}
            disabled={pending}
            onPress={() => setChoice("auto")}
            separated
          />
        ) : null}
        {targets.map((item) => (
          <ListChoiceRow
            key={item.modelSelection.instanceId}
            label={`Continue now on ${item.label}`}
            description={[item.modelSelection.model, headroom(item)].filter(Boolean).join(" · ")}
            selected={selected === item.modelSelection.instanceId}
            disabled={pending}
            onPress={() => setChoice(item.modelSelection.instanceId)}
            separated
          />
        ))}
      </View>
      {targets.length === 0 && canSwitchProvider ? (
        <Text className="px-3 py-2 text-sm text-muted-foreground">
          No other account is ready to continue this chat.
        </Text>
      ) : null}
      {canSchedule && !target ? (
        <View className="border-t border-border-subtle">
          <ListToggleRow
            label="Snooze this chat until the reset"
            value={wantsSnooze}
            disabled={pending}
            onValueChange={setSnoozeChecked}
          />
        </View>
      ) : null}
      <View className="gap-2 border-t border-border-subtle p-3">
        <Button
          label={
            selected === "auto"
              ? `Schedule for ${dueLabel}`
              : target
                ? "Continue now"
                : "Keep waiting"
          }
          tone="primary"
          fullWidth
          disabled={pending}
          onPress={confirm}
        />
        {state.exhausted || !state.resetKnown ? (
          <Button
            label="Try again now"
            tone="secondary"
            fullWidth
            disabled={pending}
            onPress={() => void continueOn(thread.modelSelection)}
          />
        ) : null}
        {errorLine}
      </View>
      <Pressable
        accessibilityRole="link"
        accessibilityHint="Opens Chat behavior settings"
        onPress={onOpenSettings}
        className="min-h-12 flex-row flex-wrap items-center justify-between gap-2 border-t border-border-subtle px-3 active:opacity-70"
      >
        <Text className="text-sm text-muted-foreground">
          Auto-continue for all chats:{" "}
          <Text className="text-sm font-semibold text-foreground">
            {config?.settings.autoResumeLimitedThreads ? "On" : "Off"}
          </Text>
        </Text>
        <Text className="text-sm font-semibold text-primary-text">Change in Settings</Text>
      </Pressable>
    </View>
  );
}
