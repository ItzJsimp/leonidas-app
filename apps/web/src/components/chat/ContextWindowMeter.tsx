import { cacheStatusLabel, useCacheAwareness, useCacheActionWarning } from "./CacheAwareness";
import { Button } from "../ui/button";
import { type ContextWindowSnapshot, formatContextWindowTokens } from "~/lib/contextWindow";
import { PreviewCard, PreviewCardPopup, PreviewCardTrigger } from "../ui/preview-card";
import { usageSeverity } from "../../lib/usageLimitsPopover";
import {
  formatContextWindowCompactionMessage,
  formatContextWindowCost,
} from "./ContextWindowMeter.logic";
import { Minimize2Icon } from "lucide-react";
import { cn } from "~/lib/utils";
import { formatTpsLabel } from "./AgentVelocityMeter.logic";
import { composerFloatingLayerProps } from "./composerEventScope";
import { CacheSection, OverheadRows, SpeedSection, type ThreadTarget } from "./AgentVelocityMeter";
import type { VelocitySummary } from "./AgentVelocityMeter.logic";

const SEVERITY_COLOR = {
  normal: "var(--color-info)",
  warning: "var(--color-warning)",
  critical: "var(--color-destructive)",
} as const;

function formatPercentage(value: number | null): string | null {
  if (value === null || !Number.isFinite(value)) {
    return null;
  }
  if (value < 10) {
    return `${value.toFixed(1).replace(/\.0$/, "")}%`;
  }
  return `${Math.round(value)}%`;
}

const RING_RADIUS = 9.75;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

/** The context ring: blue while normal, amber near the limit, red at it. */
export function ContextRing({
  usedPercentage,
  className,
}: {
  usedPercentage: number | null;
  className?: string;
}) {
  const percent = Math.max(0, Math.min(100, usedPercentage ?? 0));
  return (
    <span className={cn("relative flex size-4 shrink-0 items-center justify-center", className)}>
      <svg
        viewBox="0 0 24 24"
        className="-rotate-90 absolute inset-0 size-full transform-gpu mx-0!"
        aria-hidden="true"
      >
        <circle
          cx="12"
          cy="12"
          r={RING_RADIUS}
          fill="none"
          className="stroke-muted-foreground/24"
          strokeWidth="3"
        />
        <circle
          cx="12"
          cy="12"
          r={RING_RADIUS}
          fill="none"
          stroke={SEVERITY_COLOR[usageSeverity(percent)]}
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={RING_CIRCUMFERENCE}
          strokeDashoffset={RING_CIRCUMFERENCE * (1 - percent / 100)}
          className="transition-[stroke-dashoffset,stroke] duration-500 ease-out motion-reduce:transition-none"
        />
      </svg>
    </span>
  );
}

/**
 * The composer's one usage control, beside Send: a context ring with the tokens in context.
 * Hover or focus shows context, prompt cache and speed in one card.
 */
export function ContextWindowMeter(props: {
  usage: ContextWindowSnapshot | null;
  velocity?: VelocitySummary | null | undefined;
  modelDisplayName?: string | null;
  onCompact?: (() => void) | undefined;
  compactDisabled?: boolean | undefined;
  compactDisabledReason?: string | null | undefined;
  threadTarget?: ThreadTarget | null | undefined;
}) {
  const { modelDisplayName, onCompact, compactDisabled, compactDisabledReason } = props;
  const { usage, velocity } = props;
  const cache = useCacheAwareness({
    usage,
    chatKey: props.threadTarget
      ? `${props.threadTarget.environmentId}:${props.threadTarget.threadId}`
      : undefined,
  });
  const cacheWarning = useCacheActionWarning();
  const compact = () =>
    cacheWarning.run(
      (usage?.cachedInputTokens ?? 0) > 0
        ? {
            category: "context",
            confirmed: true,
            message: "Shortening history resets part of the cache and the summary uses tokens.",
          }
        : null,
      () => onCompact?.(),
    );
  const usedPercentage = formatPercentage(usage?.usedPercentage ?? null);
  const normalizedPercentage = Math.max(0, Math.min(100, usage?.usedPercentage ?? 0));
  const usageColor = SEVERITY_COLOR[usageSeverity(normalizedPercentage)];
  const totalProcessedTokens = usage?.totalProcessedTokens ?? null;
  const showTotalProcessed = totalProcessedTokens !== null && totalProcessedTokens > 0;

  return (
    <>
      {cacheWarning.dialog}
      <PreviewCard>
        <PreviewCardTrigger
          delay={150}
          closeDelay={onCompact ? 150 : 0}
          render={
            <Button
              size="compact"
              variant="ghost-muted"
              className="shrink-0"
              aria-label={`Prompt cache: ${cacheStatusLabel(cache)}. ${
                usage === null
                  ? "Chat memory use not known yet"
                  : usage.maxTokens !== null && usedPercentage
                    ? `Chat memory ${usedPercentage} used`
                    : `Chat memory: ${formatContextWindowTokens(usage.usedTokens)} tokens used`
              }${velocity?.modelStreamTps != null || velocity?.averageTurnTps != null ? `, last reply ${formatTpsLabel(velocity.modelStreamTps ?? velocity.averageTurnTps)}` : ""}. Show usage details`}
            >
              <ContextRing usedPercentage={usage?.usedPercentage ?? null} />
              <span className="text-2xs tabular-nums" aria-hidden>
                {usage === null ? "--" : formatContextWindowTokens(usage.usedTokens)}
              </span>
            </Button>
          }
        />
        <PreviewCardPopup
          {...composerFloatingLayerProps}
          side="top"
          align="end"
          className="w-72 text-left whitespace-normal overflow-visible"
        >
          <div className="flex flex-col gap-2 p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="font-medium text-muted-foreground text-xs">Chat memory</div>
              {usage === null ? (
                <div className="text-secondary-label text-2xs">Not reported yet</div>
              ) : usage.maxTokens !== null && usedPercentage ? (
                <div className="text-secondary-label text-2xs tabular-nums">
                  <span>{usedPercentage}</span>
                  <span className="mx-1">·</span>
                  <span>
                    {formatContextWindowTokens(usage.usedTokens)}/
                    {formatContextWindowTokens(usage.maxTokens ?? null)}
                  </span>
                </div>
              ) : (
                <div className="text-secondary-label text-2xs tabular-nums">
                  {formatContextWindowTokens(usage.usedTokens)}
                </div>
              )}
            </div>
            {usage !== null && usage.maxTokens !== null ? (
              <div
                className="h-1.5 w-full overflow-hidden rounded-full bg-muted/60"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(normalizedPercentage)}
                aria-label="Chat memory use"
              >
                <div
                  className="h-full rounded-full transition-[width,background-color] duration-500 ease-out motion-reduce:transition-none"
                  style={{ width: `${normalizedPercentage}%`, backgroundColor: usageColor }}
                />
              </div>
            ) : null}
            {showTotalProcessed ? (
              <div className="flex items-center justify-between gap-3 text-2xs leading-4">
                <span className="text-secondary-label">Total processed</span>
                <span className="font-medium tabular-nums text-secondary-label">
                  {formatContextWindowTokens(totalProcessedTokens)}
                </span>
              </div>
            ) : null}
            {usage?.cost != null ? (
              <div className="flex items-center justify-between gap-3 text-2xs leading-4">
                <span className="text-secondary-label">Cost</span>
                <span className="font-medium tabular-nums text-secondary-label">
                  {formatContextWindowCost(usage.cost)}
                </span>
              </div>
            ) : null}
            {usage?.compactsAutomatically ? (
              <div className="mt-1 text-pretty text-secondary-label text-2xs font-medium">
                {formatContextWindowCompactionMessage(modelDisplayName, usage.autoCompactThreshold)}
              </div>
            ) : null}
            {props.threadTarget ? (
              <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 text-2xs leading-4 tabular-nums">
                <OverheadRows
                  threadTarget={props.threadTarget}
                  contextTokens={usage?.usedTokens ?? null}
                />
              </dl>
            ) : null}
            <CacheSection
              label={cacheStatusLabel(cache)}
              ledger={velocity?.ledger ?? null}
              cachedTokens={usage?.cachedInputTokens ?? null}
              cacheBreak={velocity?.cacheBreak ?? null}
            />
            {velocity ? <SpeedSection summary={velocity} /> : null}
            {onCompact ? (
              <>
                <Button
                  size="xs"
                  variant="outline"
                  className="mt-1 w-full justify-center"
                  disabled={compactDisabled}
                  onClick={compact}
                >
                  <Minimize2Icon aria-hidden="true" />
                  Shorten history
                </Button>
                {compactDisabled && compactDisabledReason ? (
                  <div className="text-pretty text-secondary-label text-2xs">
                    {compactDisabledReason}
                  </div>
                ) : null}
              </>
            ) : null}
          </div>
        </PreviewCardPopup>
      </PreviewCard>
    </>
  );
}
