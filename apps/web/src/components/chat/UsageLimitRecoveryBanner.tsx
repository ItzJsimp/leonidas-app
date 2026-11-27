import {
  type OrchestrationV2LimitRecovery,
  type OrchestrationV2LimitRecoveryUpdate,
  type RunId,
} from "@t3tools/contracts";
import type { TimestampFormat } from "@t3tools/contracts/settings";
import {
  isLimitResumeArmed,
  LIMIT_RESUME_MAX_ATTEMPTS,
  limitResumeDueMs,
} from "@t3tools/shared/usageLimitRecovery";
import { ChevronDownIcon, ClockIcon } from "lucide-react";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { formatShortTimestamp } from "../../timestampFormat";
import { cn } from "~/lib/utils";
import { formatContextWindowTokens } from "../../lib/contextWindow";
import { Button } from "../ui/button";
import { Checkbox } from "../ui/checkbox";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "../ui/menu";
import { Radio, RadioGroup } from "../ui/radio-group";
import type { ComposerBannerStackContent } from "./ComposerBannerStack";
import {
  continueWithProvider,
  createTargetForModel,
  type ProviderFailoverTarget,
} from "./providerFailover";

/** A limit that resets later than this is a weekly or monthly one, not the session limit. */
const SESSION_WINDOW_MS = 5 * 60 * 60_000;
/** Used when the provider does not report how long it keeps the prompt cache. */
const DEFAULT_CACHE_TTL_MS = 60 * 60_000;

/** "Keep waiting" folds the card. The choice holds for the run while the app is open. */
const waitingRuns = new Set<string>();

type RecoveryProps = {
  runId: RunId;
  resetAt: string | null;
  stoppedAt: string;
  snoozedUntil: string | null;
  recovery: OrchestrationV2LimitRecovery | null;
  accountLabel: string;
  timestampFormat: TimestampFormat;
  /** Tokens the chat holds, so the card can say what a late send reads again. */
  contextTokens: number | null;
  cacheTtlMs?: number | undefined;
  /** The "all chats" switch in Settings. */
  autoContinueAll: boolean;
  onOpenSettings: () => void;
  onChange: (recovery: OrchestrationV2LimitRecoveryUpdate) => Promise<void>;
  failoverTargets: ReadonlyArray<ProviderFailoverTarget>;
  /** Percent of the limit left, by account id, when the account reports it. */
  headroomByInstance?: Readonly<Record<string, number>>;
  failoverDisabled: boolean;
  onFailover: (target: ProviderFailoverTarget) => Promise<void>;
  /** Continues the chat on the same account. */
  onContinue: () => Promise<void>;
};

export function usageLimitRecoveryBannerItem(props: RecoveryProps): ComposerBannerStackContent {
  return {
    id: `usage-limit-recovery:${props.runId}`,
    variant: "default",
    priority: "urgent",
    content: <UsageLimitCard key={`${props.runId}:${props.resetAt}`} {...props} />,
  };
}

export function formatLimitCountdown(ms: number): string {
  const total = Math.max(1, Math.ceil(ms / 60_000));
  const days = Math.floor(total / 1440);
  const hours = Math.floor((total % 1440) / 60);
  const minutes = total % 60;
  if (days > 0) return `${days} d ${hours} h`;
  return hours > 0 ? `${hours} h ${minutes} m` : `${minutes} m`;
}

function formatWhen(ms: number, nowMs: number, format: TimestampFormat): string {
  const time = formatShortTimestamp(new Date(ms).toISOString(), format);
  const date = new Date(ms);
  return date.toDateString() === new Date(nowMs).toDateString()
    ? time
    : `${date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}, ${time}`;
}

/** The current time, refreshed each half minute and at each moment the card changes. */
function useCardClock(boundaries: ReadonlyArray<number>) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const wakeAt = Math.min(nowMs + 30_000, ...boundaries.filter((at) => at > nowMs));
  useEffect(() => {
    const delay = Math.max(0, wakeAt - Date.now());
    const timer = window.setTimeout(() => setNowMs(Date.now()), delay + 1);
    return () => window.clearTimeout(timer);
  }, [wakeAt]);
  return nowMs;
}

function UsageLimitCard(props: RecoveryProps) {
  const { runId, resetAt, recovery, failoverTargets, failoverDisabled, onChange } = props;
  const titleId = useId();
  const stoppedMs = Date.parse(props.stoppedAt);
  const resetMs = resetAt === null ? Number.NaN : Date.parse(resetAt);
  const current = recovery?.runId === runId && recovery.resetAt === resetAt ? recovery : null;
  const armed = current !== null && isLimitResumeArmed(current);
  const attempt = current?.attempt ?? 1;
  const exhausted = !armed && attempt > LIMIT_RESUME_MAX_ATTEMPTS;
  // A reset that had passed when the run stopped says nothing about when to try again.
  const resetKnown = Number.isFinite(resetMs) && resetMs > stoppedMs;
  const dueMs = limitResumeDueMs({
    resetMs,
    attempt: armed ? attempt : 1,
    stoppedMs,
  });
  const nowMs = useCardClock(Number.isFinite(resetMs) ? [resetMs, dueMs] : []);
  const resetPassed = resetKnown && resetMs <= nowMs;
  const snoozed =
    current?.snooze === true &&
    props.snoozedUntil !== null &&
    Date.parse(props.snoozedUntil) === resetMs;

  const [choice, setChoice] = useState<"wait" | "auto" | "other">("wait");
  const [snoozeChecked, setSnoozeChecked] = useState<boolean | null>(null);
  const [waiting, setWaiting] = useState(() => waitingRuns.has(runId));
  const [picked, setPicked] = useState<ProviderFailoverTarget | null>(null);
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);

  const target =
    (picked && failoverTargets.find((item) => item.instanceId === picked.instanceId) && picked) ||
    failoverTargets[0];
  const canSchedule = resetKnown && !resetPassed;
  const selected =
    (choice === "auto" && !canSchedule) || (choice === "other" && !target) ? "wait" : choice;
  const wantsSnooze = snoozeChecked ?? snoozed;
  const dueLabel = Number.isFinite(dueMs) ? formatWhen(dueMs, nowMs, props.timestampFormat) : "";

  function rereads(sendAtMs: number): string | null {
    const ttl = props.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
    if (!props.contextTokens || sendAtMs - stoppedMs < ttl) return null;
    return `Re-reads ${formatContextWindowTokens(props.contextTokens)} tokens.`;
  }

  async function run(action: () => Promise<void>, fallback: string) {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setPending(true);
    setError(null);
    try {
      await action();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : fallback);
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }

  const save = (update: { autoResume?: boolean; snooze?: boolean }) =>
    run(
      () => onChange({ runId, resetAt: resetAt!, ...update }),
      "Could not save this choice. Try again.",
    );

  const continueHere = () => run(props.onContinue, "Could not continue this chat. Try again.");

  function confirm() {
    if (selected === "other") {
      void run(
        () =>
          continueWithProvider({
            // `run` already blocks a second click.
            pending: { current: false },
            targets: failoverDisabled ? [] : failoverTargets,
            target: target!,
            continueWith: props.onFailover,
          }),
        "Could not switch AI accounts. Try again.",
      );
      return;
    }
    const snooze = canSchedule && wantsSnooze !== snoozed ? { snooze: wantsSnooze } : null;
    if (selected === "auto") {
      void save({ autoResume: true, ...snooze });
      return;
    }
    void (async () => {
      if (snooze) await save(snooze);
      waitingRuns.add(runId);
      setWaiting(true);
    })();
  }

  const errorLine = error ? (
    <p role="alert" className="w-full text-xs text-destructive">
      {error}
    </p>
  ) : null;

  if (armed) {
    return (
      <CompactRow
        tone="state"
        title={attempt > 1 ? `Still limited. Retries at ${dueLabel}` : `Continues at ${dueLabel}`}
        detail={attempt > 1 ? `Try ${attempt} of ${LIMIT_RESUME_MAX_ATTEMPTS}` : props.accountLabel}
        action={
          <Button
            size="xs"
            variant="outline"
            disabled={pending}
            onClick={() => void save({ autoResume: false })}
          >
            {attempt > 1 ? "Stop" : "Cancel"}
          </Button>
        }
      >
        {errorLine}
      </CompactRow>
    );
  }

  if (resetPassed && !exhausted) {
    return (
      <CompactRow
        tone="state"
        title="Your limit reset"
        detail={rereads(nowMs) ?? props.accountLabel}
        action={
          <Button
            size="xs"
            disabled={pending || failoverDisabled}
            onClick={() => void continueHere()}
          >
            {pending ? "Starting..." : "Continue chat"}
          </Button>
        }
      >
        {errorLine}
      </CompactRow>
    );
  }

  if (waiting) {
    return (
      <CompactRow
        tone="warning"
        title="Waiting for you"
        detail={
          resetKnown
            ? `Resets ${formatWhen(resetMs, nowMs, props.timestampFormat)}`
            : "Reset time unknown"
        }
        action={
          <Button
            size="xs"
            variant="outline"
            onClick={() => {
              waitingRuns.delete(runId);
              setWaiting(false);
            }}
          >
            Change
          </Button>
        }
      />
    );
  }

  const title = exhausted
    ? `Still limited after ${LIMIT_RESUME_MAX_ATTEMPTS} tries`
    : resetKnown && resetMs - stoppedMs > SESSION_WINDOW_MS
      ? "Usage limit reached"
      : "Session limit reached";
  const confirmLabel =
    selected === "auto"
      ? `Schedule for ${dueLabel}`
      : selected === "other"
        ? "Continue now"
        : "Keep waiting";
  const headroom = target ? props.headroomByInstance?.[target.instanceId] : undefined;
  const targetModel = target?.availableModels.find(
    (model) => model.slug === target.modelSelection.model,
  )?.name;

  return (
    <div className="flex w-full flex-col gap-2 p-3 text-sm">
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <ClockIcon aria-hidden className="size-4 shrink-0 text-warning-foreground" />
        <h2 id={titleId} className="font-semibold">
          {title}
        </h2>
        <span className="truncate text-muted-foreground">{props.accountLabel}</span>
        <span className="ml-auto text-xs text-muted-foreground tabular-nums">
          {canSchedule
            ? `Resets ${formatWhen(resetMs, nowMs, props.timestampFormat)} · ${formatLimitCountdown(resetMs - nowMs)}`
            : "Reset time unknown"}
        </span>
      </div>

      <RadioGroup
        aria-labelledby={titleId}
        disabled={pending}
        value={selected}
        onValueChange={(value) => setChoice(value as typeof choice)}
      >
        <Option value="wait" selected={selected} title="Wait for me">
          Nothing sends until you send it.
        </Option>
        {canSchedule ? (
          <Option value="auto" selected={selected} title={`Continue at ${dueLabel}`}>
            {["Sends 2 minutes after the reset.", rereads(dueMs)].filter(Boolean).join(" ")}
          </Option>
        ) : null}
        <Option
          value="other"
          selected={selected}
          disabled={!target || failoverDisabled}
          title="Continue now on another account"
          aside={
            target && (failoverTargets.length > 1 || target.availableModels.length > 1) ? (
              <Menu>
                <MenuTrigger
                  render={<Button size="xs" variant="outline" disabled={pending} />}
                  aria-label="Change account or model"
                >
                  Change
                  <ChevronDownIcon className="size-3" />
                </MenuTrigger>
                <MenuPopup align="end" className="min-w-48">
                  {failoverTargets.map((item) => (
                    <div key={item.instanceId}>
                      <div className="px-2 py-1 text-xs font-medium text-muted-foreground">
                        {item.label}
                      </div>
                      {item.availableModels.map((model) => (
                        <MenuItem
                          key={model.slug}
                          onClick={() => {
                            setPicked(createTargetForModel(item, model.slug));
                            setChoice("other");
                          }}
                        >
                          {model.name}
                        </MenuItem>
                      ))}
                    </div>
                  ))}
                </MenuPopup>
              </Menu>
            ) : null
          }
        >
          {target
            ? [target.label, targetModel, headroom === undefined ? null : `${headroom}% left`]
                .filter(Boolean)
                .join(" · ")
            : "No other account is ready. Add one in Settings."}
        </Option>
      </RadioGroup>

      <div className="flex flex-wrap items-center gap-2 pt-1">
        {canSchedule ? (
          <label className="flex items-center gap-2 text-muted-foreground">
            <Checkbox
              checked={wantsSnooze}
              disabled={pending || selected === "other"}
              onCheckedChange={(checked) => setSnoozeChecked(checked)}
            />
            Snooze this chat until the reset
          </label>
        ) : null}
        <div className="ml-auto flex gap-2">
          {exhausted || !resetKnown ? (
            <Button
              size="xs"
              variant="outline"
              disabled={pending || failoverDisabled}
              onClick={() => void continueHere()}
            >
              Try again now
            </Button>
          ) : null}
          <Button
            size="xs"
            disabled={pending || (selected === "other" && failoverDisabled)}
            onClick={confirm}
          >
            {pending ? "Saving..." : confirmLabel}
          </Button>
        </div>
        {errorLine}
      </div>

      <div className="-mx-3 -mb-3 flex flex-wrap items-center gap-2 border-t border-border px-3 py-1.5 text-xs">
        <span className="text-muted-foreground">
          Auto-continue for all chats:{" "}
          <strong className="font-semibold text-foreground">
            {props.autoContinueAll ? "On" : "Off"}
          </strong>
        </span>
        <Button size="xs" variant="link" className="ml-auto" onClick={props.onOpenSettings}>
          Change in Settings
        </Button>
      </div>
    </div>
  );
}

function Option({
  value,
  selected,
  title,
  children,
  aside,
  disabled,
}: {
  value: string;
  selected: string;
  title: string;
  children: ReactNode;
  aside?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-lg border border-border px-3 py-2",
        selected === value && "border-state bg-surface-raised",
      )}
    >
      <label className="flex min-w-0 flex-1 items-center gap-3">
        <Radio value={value} disabled={disabled} />
        <span className="flex min-w-0 flex-col">
          <span className="font-medium">{title}</span>
          <span className="text-xs text-muted-foreground tabular-nums">{children}</span>
        </span>
      </label>
      {aside}
    </div>
  );
}

function CompactRow({
  tone,
  title,
  detail,
  action,
  children,
}: {
  tone: "state" | "warning";
  title: string;
  detail: string;
  action: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
      <span
        aria-hidden
        className={cn("size-2 shrink-0 rounded-full", tone === "state" ? "bg-state" : "bg-warning")}
      />
      <p role="status" className="min-w-0 flex-1 tabular-nums">
        <span className="font-semibold">{title}</span>
        <span className="text-muted-foreground"> · {detail}</span>
      </p>
      {action}
      {children}
    </div>
  );
}
