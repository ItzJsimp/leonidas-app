import type { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { useEffect, useMemo, useState } from "react";

import {
  contextWindowFigures,
  formatTokenCount,
  usedPercentLabel,
} from "../../lib/usageLimitsPopover";
import { cn } from "../../lib/utils";
import { useThreadContextBreakdown } from "../../state/queries";
import { Dialog, DialogPanel, DialogPopup } from "../ui/dialog";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { barSegments } from "./ContextBreakdown.logic";
import { deriveTrimSuggestions } from "./ContextTrim.logic";
import { ContextRing } from "./ContextWindowMeter";
import { deriveWasteFindings } from "./ContextWaste.logic";
import { DetailedContextBreakdownView } from "./DetailedContextBreakdownView";
import { UsageBar } from "./PlanUsageLimits";
import {
  THREAD_DETAILS_FOLD_EXEMPT,
  ThreadDetailsFoldButton,
  ThreadDetailsFoldLine,
  ThreadDetailsSection,
} from "./ThreadDetailsSection";
import type { ThreadDetailsUsageProps } from "./ThreadDetailsUsage";

const MAX_CONTEXT_SEGMENTS = 6;
const MAX_TRIM_ROWS = 3;
const TRIM_KIND_LABEL = {
  mcp: "Tool",
  skill: "Skill",
  agent: "Helper",
  memory: "File",
  "tool-results": "Shorten:",
} as const;
const sumTokens = (rows: ReadonlyArray<{ readonly tokens: number }> | undefined) =>
  rows?.reduce((total, row) => total + row.tokens, 0) ?? 0;

/** Segmented context bar; a click shows the categories, trim and waste lists. */
function ContextSegments({
  environmentId,
  threadId,
  usedTokens,
  onOpenDetails,
}: {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
  readonly usedTokens: number;
  readonly onOpenDetails: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const query = useThreadContextBreakdown({ environmentId, threadId });
  const { refresh } = query;
  // Re-read after each reported usage change so the split follows the conversation.
  useEffect(() => {
    refresh();
  }, [usedTokens, refresh]);

  const segments = useMemo(
    () => (query.data ? barSegments(query.data.categories, query.data.maxTokens) : []),
    [query.data],
  );
  const trim = useMemo(() => (query.data ? deriveTrimSuggestions(query.data) : []), [query.data]);
  const waste = useMemo(() => (query.data ? deriveWasteFindings(query.data) : []), [query.data]);
  const used = segments.filter((segment) => segment.kind === "used" && segment.tokens > 0);
  if (used.length === 0) return null;
  const top = used.slice(0, MAX_CONTEXT_SEGMENTS);
  const named = new Set(top.map((segment) => segment.name.toLowerCase()));
  const extras: Array<{ name: string; label?: string; title?: string; tokens: number }> = [
    { name: "Skills", tokens: sumTokens(query.data?.skills) },
    {
      name: "Connected tools",
      label: "Tools",
      title: "Tools",
      tokens: sumTokens(query.data?.mcpTools),
    },
    { name: "Agents", label: "Helpers", tokens: sumTokens(query.data?.agents) },
  ].filter(
    (extra) =>
      extra.tokens > 0 &&
      !named.has(extra.name.toLowerCase()) &&
      !(extra.title && named.has(extra.title.toLowerCase())),
  );

  return (
    <div className="flex flex-col gap-1.5">
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              onClick={() => setExpanded((prev) => !prev)}
              aria-expanded={expanded}
              aria-label="Show or hide what fills the context"
              className="flex h-1 w-full cursor-pointer gap-px overflow-hidden rounded-full bg-muted-foreground/20"
            />
          }
        >
          {segments
            .filter((segment) => segment.width > 0)
            .map((segment) => (
              <div
                key={segment.name}
                className={cn(segment.fill, "min-w-0.5 opacity-85")}
                style={{ width: `${segment.width}%` }}
              />
            ))}
        </TooltipTrigger>
        <TooltipPopup side="bottom">
          {expanded ? "Hide" : "Show"} what fills the context ({used.length} kinds)
        </TooltipPopup>
      </Tooltip>

      {expanded ? (
        <div className="flex flex-col gap-1.5 pt-0.5">
          <ul className="flex flex-col gap-0.5 text-2xs text-muted-foreground">
            {top.map((segment) => (
              <li key={segment.name} className="flex min-w-0 items-center gap-1.5">
                <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", segment.fill)} />
                <span className="min-w-0 flex-1 truncate">{segment.name}</span>
                <span className="tabular-nums text-foreground">
                  {formatTokenCount(segment.tokens)}
                </span>
              </li>
            ))}
            {extras.map((extra) => (
              <li key={extra.name} className="flex min-w-0 items-center gap-1.5">
                <span
                  aria-hidden
                  className="size-1.5 shrink-0 rounded-full bg-muted-foreground/50"
                />
                <span className="min-w-0 flex-1 truncate">{extra.label ?? extra.name}</span>
                <span className="tabular-nums text-foreground">
                  {formatTokenCount(extra.tokens)}
                </span>
              </li>
            ))}
          </ul>
          {trim.length > 0 ? (
            <div className="flex flex-col gap-0.5 border-t border-border/50 pt-1">
              <span className="text-2xs font-medium text-foreground">Trim: loaded every turn</span>
              <ul className="flex flex-col gap-0.5 text-2xs text-muted-foreground">
                {trim.slice(0, MAX_TRIM_ROWS).map((item) => (
                  <li key={item.key} className="flex min-w-0 items-center gap-1.5">
                    <Tooltip>
                      <TooltipTrigger render={<span className="min-w-0 flex-1 truncate" />}>
                        {TRIM_KIND_LABEL[item.kind]} {item.label}
                        {item.unused ? " (not used in this chat)" : ""}
                      </TooltipTrigger>
                      <TooltipPopup>{item.label}</TooltipPopup>
                    </Tooltip>
                    <span className="tabular-nums text-foreground">
                      {item.estimated ? "~" : ""}
                      {formatTokenCount(item.tokens)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {waste.length > 0 ? (
            <div className="flex flex-col gap-0.5 border-t border-border/50 pt-1">
              <span className="text-2xs font-medium text-foreground">Waste: repeated work</span>
              <ul className="flex flex-col gap-0.5 text-2xs text-muted-foreground">
                {waste.map((item) => (
                  <li key={item.key} className="flex min-w-0 items-center gap-1.5">
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    <span className="tabular-nums text-foreground">
                      ~{formatTokenCount(item.tokens)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <button
            type="button"
            onClick={onOpenDetails}
            className="cursor-pointer self-start text-2xs text-muted-foreground transition-colors hover:text-foreground"
          >
            See the full list
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** Context: the composer's ring, the model, the percent used and what fills it. */
export function ThreadDetailsContext({
  usage,
  folded,
}: {
  readonly usage: ThreadDetailsUsageProps;
  readonly folded: boolean;
}) {
  const [opened, setOpened] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const { environmentId, threadId } = usage;
  const figures = contextWindowFigures(usage.contextWindow);
  const percent =
    figures.state === "reported" && figures.usedPercent != null
      ? usedPercentLabel(figures.usedPercent)
      : null;
  const percentLabel = percent === null ? "–" : `${percent}%`;
  const tokens =
    figures.state === "reported"
      ? `${formatTokenCount(figures.usedTokens)} / ${figures.maxTokens ? formatTokenCount(figures.maxTokens) : "unlimited"}`
      : figures.state === "pending"
        ? `0 / ${formatTokenCount(figures.maxTokens)}`
        : null;
  const model = usage.modelLabel || "No model selected";

  if (folded && !opened) {
    return (
      <ThreadDetailsFoldLine
        label="Context"
        ariaLabel={`Context: ${percent === null ? "not measured yet" : `${percent}% used`}. Show context`}
        onOpen={() => setOpened(true)}
      >
        <ContextRing usedPercentage={percent} />
        <span className="min-w-0 flex-1 truncate text-muted-foreground">{model}</span>
        <span className="shrink-0 font-semibold tabular-nums">{percentLabel}</span>
      </ThreadDetailsFoldLine>
    );
  }

  return (
    <ThreadDetailsSection
      headingId="thread-details-context-heading"
      title="Context"
      actions={
        <>
          {tokens ? (
            <Tooltip>
              <TooltipTrigger
                render={<span className="text-2xs tabular-nums text-muted-foreground" />}
              >
                {tokens}
              </TooltipTrigger>
              <TooltipPopup side="top">
                Tokens in this chat's context, of the model's limit
              </TooltipPopup>
            </Tooltip>
          ) : null}
          {folded ? (
            <ThreadDetailsFoldButton label="context" onFold={() => setOpened(false)} />
          ) : null}
        </>
      }
    >
      <div
        {...(folded ? THREAD_DETAILS_FOLD_EXEMPT : {})}
        className="flex flex-col gap-2 rounded-lg border border-border bg-background px-2.5 py-2"
      >
        <div className="flex min-w-0 items-center gap-2 text-xs">
          <ContextRing usedPercentage={percent} />
          <span className="min-w-0 truncate font-medium text-foreground">{model}</span>
          {usage.effortLabel ? (
            <span className="shrink-0 text-2xs text-muted-foreground">{usage.effortLabel}</span>
          ) : null}
          <span className="ms-auto shrink-0 text-2xs font-semibold tabular-nums text-foreground">
            {percentLabel}
          </span>
        </div>
        {threadId && figures.state === "reported" ? (
          <ContextSegments
            environmentId={environmentId}
            threadId={threadId}
            usedTokens={figures.usedTokens}
            onOpenDetails={() => setDetailsOpen(true)}
          />
        ) : (
          <UsageBar
            fill="used"
            usedPercent={percent ?? 0}
            label={`Context: ${percent ?? 0}% used`}
            className="h-1 bg-muted-foreground/20"
          />
        )}
      </div>
      {threadId ? (
        <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
          <DialogPopup className="max-w-2xl">
            <DialogPanel>
              <DetailedContextBreakdownView
                environmentId={environmentId}
                threadId={threadId}
                onBack={() => setDetailsOpen(false)}
              />
            </DialogPanel>
          </DialogPopup>
        </Dialog>
      ) : null}
    </ThreadDetailsSection>
  );
}
