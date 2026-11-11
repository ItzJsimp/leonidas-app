import { CircleXIcon, ClockIcon, PanelRightIcon } from "lucide-react";
import { memo, useEffect, useState } from "react";

import type { AgentActivity } from "../../agentActivity";
import { cn } from "~/lib/utils";
import { modelDisplayName } from "../subagents/spawnApproval.logic";
import { subagentWaitDetail } from "../subagents/subagentThread.logic";
import { useComposerSubagents } from "../subagents/useComposerSubagents";
import { Button } from "../ui/button";
import { Spinner } from "../ui/spinner";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { AgentElapsed } from "./AgentElapsed";
import { ActivityKindIcon } from "./ActivityPanel";
import { ComposerBanner } from "./ComposerBanner";
import { activityBarView, activityStepLabel, LONG_RUN_MS } from "./composerActivity.logic";

export interface ComposerTasksProgress {
  readonly step: string;
  readonly completedSteps: number;
  readonly totalSteps: number;
  readonly activity?: AgentActivity & {
    readonly startedAt: string | null;
    readonly onOpenFile: (path: string) => void;
    /** Opens and scrolls to the tool call's row in the chat. */
    readonly onShowItem: (itemId: string) => void;
    readonly onTogglePanel: () => void;
    readonly panelOpen: boolean;
  };
  readonly live?: boolean;
}

export interface ComposerTaskStep {
  readonly durationMs?: number;
  readonly step: string;
  readonly status: "pending" | "inProgress" | "completed";
}

/** True once `ms` have passed since `since`; the timer re-renders once, at that moment. */
function useIsPast(since: string | null, ms: number): boolean {
  const deadline = since ? Date.parse(since) + ms : null;
  const [reached, setReached] = useState<number | null>(null);
  useEffect(() => {
    if (deadline === null || Number.isNaN(deadline)) return;
    const timer = setTimeout(() => setReached(deadline), Math.max(0, deadline - Date.now()));
    return () => clearTimeout(timer);
  }, [deadline]);
  return deadline !== null && reached === deadline;
}

const TONE_TEXT = {
  neutral: "text-foreground",
  warning: "text-warning",
  error: "text-destructive",
} as const;

/**
 * The live line above the composer: what the agent does now, how long it has
 * taken, and one button for the plan and everything the agent used.
 */
export const ComposerTasksBadge = memo(function ComposerTasksBadge({
  placement = "tab",
  progress,
}: {
  readonly placement?: "inline" | "tab";
  readonly progress: ComposerTasksProgress;
}) {
  const subagents = useComposerSubagents();
  const activity = progress.activity;
  const now = activity?.now ?? null;
  const longRunning = useIsPast(now?.running ? now.since : null, LONG_RUN_MS);
  if (progress.totalSteps <= 0 && !activity) return null;

  const view = now ? activityBarView(now, longRunning) : null;
  const target =
    now?.kind === "agent"
      ? subagentWaitDetail(view?.target ?? null, subagents, modelDisplayName)
      : (view?.target ?? null);
  const since = now?.running ? (now.since ?? activity?.startedAt ?? null) : activity?.startedAt;
  const stepLabel = activityStepLabel({
    currentStep: activity?.currentStep ?? null,
    completedSteps: progress.completedSteps,
    totalSteps: progress.totalSteps,
  });
  const showItem = now?.itemId && activity ? () => activity.onShowItem(now.itemId!) : undefined;
  const words = (
    <>
      <span className={cn("shrink-0 font-medium", TONE_TEXT[view?.tone ?? "neutral"])}>
        {view?.verb ?? progress.step}
      </span>
      {target ? (
        <span
          className={cn("min-w-0 truncate text-foreground/70", view?.mono && "font-mono text-2xs")}
        >
          {target}
        </span>
      ) : null}
    </>
  );

  const row = (
    <ComposerBanner.Row data-composer-activity-bar="true" data-tone={view?.tone ?? "neutral"}>
      <ComposerBanner.Icon className={cn("[&>svg]:size-3.5", TONE_TEXT[view?.tone ?? "neutral"])}>
        {view?.icon === "failed" ? (
          <CircleXIcon />
        ) : view?.icon === "long" ? (
          <ClockIcon />
        ) : view?.icon === "kind" && now ? (
          <ActivityKindIcon kind={now.kind} />
        ) : view?.icon === "thinking" ? (
          <ActivityKindIcon kind="think" className="text-muted-foreground" />
        ) : (
          <Spinner size="sm" tone="muted" aria-hidden />
        )}
      </ComposerBanner.Icon>
      <ComposerBanner.Content className="gap-1.5">
        {showItem ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  onClick={showItem}
                  aria-label={`${view?.verb ?? ""} ${target ?? ""}. Show it in the chat.`.trim()}
                  className="-ms-1 flex min-w-0 items-baseline gap-1.5 rounded-md px-1 py-0.5 text-start transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
                />
              }
            >
              {words}
            </TooltipTrigger>
            {/* The raw command shows here when the bar shortens it. */}
            {now?.full && now.full !== target ? (
              <TooltipPopup side="top" variant="code">
                {now.full}
              </TooltipPopup>
            ) : (
              <TooltipPopup side="top">Show it in the chat</TooltipPopup>
            )}
          </Tooltip>
        ) : (
          <span className="flex min-w-0 items-baseline gap-1.5">{words}</span>
        )}
        {now && now.alsoRunning > 0 ? (
          <span className="shrink-0 text-muted-foreground tabular-nums">
            +{now.alsoRunning}
            <span className="sr-only"> more running</span>
          </span>
        ) : null}
      </ComposerBanner.Content>
      <ComposerBanner.Actions className="flex-nowrap gap-1.5">
        {since ? (
          <span className="text-muted-foreground tabular-nums">
            <AgentElapsed
              compact
              agent={{ status: "running", startedAt: since, completedAt: null }}
            />
          </span>
        ) : null}
        {activity ? (
          <Button
            size="xs"
            variant="ghost-muted"
            aria-pressed={activity.panelOpen}
            aria-label={`${activity.panelOpen ? "Hide" : "Show"} the activity panel. ${stepLabel}.`}
            onClick={activity.onTogglePanel}
          >
            <PanelRightIcon aria-hidden />
            <span className="hidden @min-[360px]:inline">{stepLabel}</span>
          </Button>
        ) : null}
      </ComposerBanner.Actions>
    </ComposerBanner.Row>
  );
  return placement === "inline" ? (
    row
  ) : (
    <ComposerBanner.Root density="comfortable" data-composer-shoulder-tab>
      {row}
    </ComposerBanner.Root>
  );
});
