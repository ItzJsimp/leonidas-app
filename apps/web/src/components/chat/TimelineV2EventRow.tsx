import { type OrchestrationV2TurnItem } from "@t3tools/contracts";
import {
  type LucideIcon,
  CircleAlertIcon,
  XIcon,
  ZapIcon,
  GitForkIcon,
  MinusIcon,
  CheckIcon,
  WrenchIcon,
  ChevronDownIcon,
} from "lucide-react";
import { providerErrorPresentation } from "../../session-logic";
import { type TimelineRow, TimelineRowCtx } from "./TimelineRowContext";
import { use, memo, useState } from "react";
import { SecretRequestCard } from "./SecretRequestCard";
import {
  isV2LifecycleItem,
  V2LifecycleRow,
  SubagentAvatar,
  SubagentElapsed,
} from "./V2LifecycleRow";
import { isClaudeSignedOutFailure, signInInstanceId } from "./signInAgain";
import { cn } from "~/lib/utils";
import ChatMarkdown from "../ChatMarkdown";
import { ClaudeSignInAction } from "./ClaudeSignInAction";
import { V2ItemInspector } from "./V2ItemInspector";
import * as DateTime from "effect/DateTime";
import { useAtomValue } from "@effect/atom-react";
import { environmentThreadDetails } from "../../state/threads";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import {
  subagentGroupSummary,
  summarizeSubagentStatuses,
} from "@t3tools/client-runtime/state/subagent-display";
import { WorkLogBlock } from "./WorkLog";
import { Collapsible, CollapsibleTrigger, CollapsiblePanel } from "../ui/collapsible";

type V2EventTone = "muted" | "warning" | "danger" | "success";

function v2EventPresentation(item: OrchestrationV2TurnItem): {
  readonly label: string;
  readonly detail: string | null;
  readonly tone: V2EventTone;
  readonly icon: LucideIcon;
} {
  switch (item.type) {
    case "error": {
      const presentation = providerErrorPresentation(item);
      return {
        ...presentation,
        tone:
          item.status === "completed"
            ? "success"
            : item.status === "running" || item.failure.class === "usage_limit"
              ? "warning"
              : "danger",
        icon: CircleAlertIcon,
      };
    }
    case "run_interrupt_request":
      return {
        label: "Stop requested",
        detail: item.message,
        tone: "warning",
        icon: CircleAlertIcon,
      };
    case "run_interrupt_result":
      return {
        label: "Reply stopped",
        detail: item.message,
        tone: "danger",
        icon: XIcon,
      };
    case "handoff":
      return {
        label: "Chat moved to another AI account",
        detail:
          item.summary ??
          `${item.fromProviderInstanceIds.join(", ")} → ${item.toProviderInstanceId}`,
        tone: item.status === "failed" ? "danger" : "muted",
        icon: ZapIcon,
      };
    case "fork":
      return {
        label: "New chat started from here",
        detail: `The new chat is ${item.targetThreadId}`,
        tone: "muted",
        icon: GitForkIcon,
      };
    case "compaction": {
      const tokenSummary =
        item.beforeTokenCount === undefined && item.afterTokenCount === undefined
          ? null
          : `${item.beforeTokenCount ?? "?"} → ${item.afterTokenCount ?? "?"} tokens`;
      return {
        label: "History shortened",
        detail: item.summary ?? tokenSummary,
        tone: item.status === "failed" ? "danger" : "muted",
        icon: MinusIcon,
      };
    }
    case "todo_list": {
      const steps = item.steps.map((step) => `${step.status}: ${step.text}`).join("\n");
      return {
        label: "Plan changed",
        detail: [item.explanation, steps].filter(Boolean).join("\n\n") || null,
        tone: item.status === "failed" ? "danger" : "success",
        icon: CheckIcon,
      };
    }
    default:
      return {
        label: item.title?.trim() || item.type.replaceAll("_", " "),
        detail: null,
        tone: item.status === "failed" ? "danger" : "muted",
        icon: WrenchIcon,
      };
  }
}

export function V2EventTimelineRow({ row }: { row: Extract<TimelineRow, { kind: "event" }> }) {
  const ctx = use(TimelineRowCtx);
  const { item, visibility, sourceThreadId } = row.projectedItem;
  if (item.type === "subagent" && (row.subagents?.length ?? 1) > 1) {
    return <V2SubagentGroup key={row.id} row={row} />;
  }
  if (item.type === "secret_request") {
    return (
      <SecretRequestCard
        environmentId={ctx.activeThreadEnvironmentId}
        item={item}
        visibility={visibility}
      />
    );
  }
  if (isV2LifecycleItem(item)) {
    return (
      <V2LifecycleRow
        environmentId={ctx.activeThreadEnvironmentId}
        item={item}
        resourceSummary={row.resourceSummary}
        createdAt={row.createdAt}
        timestampFormat={ctx.timestampFormat}
        providerStatuses={ctx.providerStatuses}
        runs={ctx.runs}
        onOpenThread={ctx.onOpenThread}
      />
    );
  }
  const presentation = v2EventPresentation(item);
  const Icon = presentation.icon;
  if (item.type === "error") {
    const signInProvider =
      item.status === "failed" && isClaudeSignedOutFailure(item.failure)
        ? ctx.providerStatuses.find(
            (candidate) => candidate.instanceId === signInInstanceId(ctx.runs, item.runId),
          )
        : undefined;
    return (
      <details
        open={signInProvider !== undefined || undefined}
        className={cn(
          "group rounded-md border",
          presentation.tone === "warning" && "border-warning/25 bg-warning/5",
          presentation.tone === "danger" && "border-destructive/25 bg-destructive/5",
          presentation.tone === "success" && "border-success/20 bg-success/5",
        )}
        data-v2-item-type={item.type}
        data-v2-item-visibility={visibility}
        data-v2-event-disclosure="true"
      >
        <summary className="flex min-w-0 cursor-pointer list-none items-center gap-2 px-2.5 py-1.5 text-xs [&::-webkit-details-marker]:hidden">
          <Icon
            className={cn(
              "size-3.5 shrink-0",
              presentation.tone === "warning" && "text-warning",
              presentation.tone === "danger" && "text-destructive",
              presentation.tone === "success" && "text-success",
            )}
          />
          <span className="shrink-0 font-medium text-foreground/90">{presentation.label}</span>
          {item.status !== "completed" ? (
            <span
              className={cn(
                "shrink-0 rounded-full border px-1.5 py-0.5 font-mono text-3xs",
                item.status === "failed"
                  ? "border-destructive/40 text-destructive"
                  : "border-border/70 text-muted-foreground",
              )}
            >
              {item.status}
            </span>
          ) : null}
          {presentation.detail ? (
            <span className="min-w-0 flex-1 truncate text-muted-foreground/65">
              {presentation.detail}
            </span>
          ) : null}
          {visibility !== "local" ? (
            <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-3xs text-muted-foreground">
              {visibility === "inherited" ? "From an earlier chat" : "Added by the app"}
            </span>
          ) : null}
          <ChevronDownIcon className="size-3 shrink-0 text-muted-foreground/60 transition-transform group-open:rotate-180" />
        </summary>
        <div className="border-t border-border/45 px-3 py-2 ps-8">
          {presentation.detail ? (
            <div className="text-xs leading-relaxed text-muted-foreground">
              <ChatMarkdown
                text={presentation.detail}
                cwd={ctx.markdownCwd}
                threadRef={ctx.threadRef ?? undefined}
                skills={ctx.skills}
                lineBreaks
              />
            </div>
          ) : null}
          {signInProvider !== undefined ? (
            <ClaudeSignInAction
              environmentId={ctx.activeThreadEnvironmentId}
              provider={signInProvider}
            />
          ) : null}
          {visibility === "inherited" ? (
            <p className="mt-1 font-mono text-3xs text-muted-foreground/65">
              From {sourceThreadId}
            </p>
          ) : null}
          <div className={presentation.detail ? "mt-2" : undefined}>
            <V2ItemInspector
              projectedItem={row.projectedItem}
              environmentId={ctx.activeThreadEnvironmentId}
              cwd={ctx.markdownCwd}
              workspaceRoot={ctx.workspaceRoot}
              onOpenThread={ctx.onOpenThread}
              onOpenTurnDiff={ctx.onOpenTurnDiff}
              onRollbackCheckpoint={ctx.onRollbackCheckpoint}
              onImageExpand={ctx.onImageExpand}
            />
          </div>
        </div>
      </details>
    );
  }
  return (
    <section
      className={cn(
        "rounded-lg border px-3 py-2",
        presentation.tone === "warning" && "border-warning/25 bg-warning/5",
        presentation.tone === "danger" && "border-destructive/25 bg-destructive/5",
        presentation.tone === "success" && "border-success/20 bg-success/5",
        presentation.tone === "muted" && "border-border/60 bg-card/30",
      )}
      data-v2-item-type={item.type}
      data-v2-item-visibility={visibility}
    >
      <div className="flex items-start gap-2.5">
        <Icon
          className={cn(
            "mt-0.5 size-3.5 shrink-0",
            presentation.tone === "warning" && "text-warning",
            presentation.tone === "danger" && "text-destructive",
            presentation.tone === "success" && "text-success",
            presentation.tone === "muted" && "text-muted-foreground",
          )}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-xs font-medium text-foreground/90">{presentation.label}</span>
            {item.status !== "completed" ? (
              <span
                className={cn(
                  "rounded-full border px-1.5 py-0.5 font-mono text-3xs",
                  item.status === "failed"
                    ? "border-destructive/40 text-destructive"
                    : "border-border/70 text-muted-foreground",
                )}
              >
                {item.status}
              </span>
            ) : null}
            {visibility !== "local" ? (
              <span className="rounded-full bg-muted px-1.5 py-0.5 text-3xs text-muted-foreground">
                {visibility === "inherited" ? "From an earlier chat" : "Added by the app"}
              </span>
            ) : null}
          </div>
          {presentation.detail ? (
            <div className="mt-1 text-xs leading-relaxed text-muted-foreground">
              <ChatMarkdown
                text={presentation.detail}
                cwd={ctx.markdownCwd}
                threadRef={ctx.threadRef ?? undefined}
                skills={ctx.skills}
                lineBreaks
              />
            </div>
          ) : null}
          {visibility === "inherited" ? (
            <p className="mt-1 font-mono text-3xs text-muted-foreground/65">
              From {sourceThreadId}
            </p>
          ) : null}
          <div className="mt-2">
            <V2ItemInspector
              projectedItem={row.projectedItem}
              environmentId={ctx.activeThreadEnvironmentId}
              cwd={ctx.markdownCwd}
              workspaceRoot={ctx.workspaceRoot}
              onOpenThread={ctx.onOpenThread}
              onOpenTurnDiff={ctx.onOpenTurnDiff}
              onRollbackCheckpoint={ctx.onRollbackCheckpoint}
              onImageExpand={ctx.onImageExpand}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * One elapsed span for the whole group: first launch to last settle, ticking
 * while any member works. A settled member without a completion time leaves
 * the end unknown, so the span is withheld rather than cut short.
 */
function subagentGroupTiming(
  agents: ReadonlyArray<{
    status: OrchestrationV2TurnItem["status"];
    startedAt: DateTime.Utc | null;
    completedAt: DateTime.Utc | null;
  }>,
) {
  let startMs: number | null = null;
  let endMs: number | null = null;
  let endUnknown = false;
  for (const agent of agents) {
    if (agent.startedAt) {
      const ms = DateTime.toEpochMillis(agent.startedAt);
      startMs = startMs === null ? ms : Math.min(startMs, ms);
    }
    if (agent.completedAt) {
      const ms = DateTime.toEpochMillis(agent.completedAt);
      endMs = endMs === null ? ms : Math.max(endMs, ms);
    } else {
      endUnknown = true;
    }
  }
  const live = agents.some(
    ({ status }) => status === "pending" || status === "running" || status === "waiting",
  );
  return {
    status: live ? ("running" as const) : ("completed" as const),
    startedAt: startMs === null ? null : new Date(startMs).toISOString(),
    completedAt: live || endUnknown || endMs === null ? null : new Date(endMs).toISOString(),
  };
}

const V2SubagentGroup = memo(function V2SubagentGroup({
  row,
}: {
  row: Extract<TimelineRow, { kind: "event" }>;
}) {
  const ctx = use(TimelineRowCtx);
  const groupId = `subagent-group:${row.id}`;
  const [expanded, setExpanded] = useState(() =>
    ctx.workGroupViewState.expandedEntries.has(groupId),
  );
  const members = (row.subagents ?? [row.projectedItem]).flatMap(({ item }) =>
    item.type === "subagent" ? [item] : [],
  );
  const liveAgents = useAtomValue(
    environmentThreadDetails.threadAtom(
      scopeThreadRef(ctx.activeThreadEnvironmentId, row.projectedItem.item.threadId),
    ),
    (thread) => thread?.projection.subagents,
  );
  const agents = members.map((item) => {
    const live = liveAgents?.find((agent) => agent.id === item.subagentId);
    return {
      item,
      live,
      status: live?.status ?? item.status,
      startedAt: live?.startedAt ?? item.startedAt,
      completedAt: live?.completedAt ?? item.completedAt,
    };
  });
  const summary = subagentGroupSummary(agents);
  const label = `${members.length} ${members.length === 1 ? "helper" : "helpers"}`;
  const statusSummary = summarizeSubagentStatuses(agents.map(({ status }) => status));
  const toggleExpanded = (open: boolean) => {
    ctx.onToggleWorkEntry(row.id, expanded);
    if (open) ctx.workGroupViewState.expandedEntries.add(groupId);
    else ctx.workGroupViewState.expandedEntries.delete(groupId);
    setExpanded(open);
  };
  return (
    <WorkLogBlock continues={row.continuesWorkLog}>
      <Collapsible open={expanded} onOpenChange={toggleExpanded} data-subagent-group>
        <CollapsibleTrigger
          aria-label={label}
          aria-description={statusSummary}
          className={cn(
            "flex w-full min-w-0 items-center gap-3 py-2 text-left transition-opacity hover:opacity-100",
            expanded || summary.active
              ? "text-foreground opacity-100"
              : "text-muted-foreground opacity-55",
          )}
        >
          <span className="flex shrink-0 items-center -space-x-1.5" aria-hidden>
            {agents.slice(0, 3).map(({ item, live, status }) => (
              <SubagentAvatar
                key={item.id}
                driver={live?.driver ?? item.driver}
                provider={ctx.providerStatuses.find(
                  (provider) =>
                    provider.instanceId === (live?.providerInstanceId ?? item.providerInstanceId),
                )}
                model={live?.model ?? item.model}
                providerInstanceId={live?.providerInstanceId ?? item.providerInstanceId}
                providers={ctx.providerStatuses}
                status={agents.length === 1 ? status : undefined}
              />
            ))}
            {agents.length > 3 ? (
              <span className="inline-flex size-6 items-center justify-center rounded-full bg-muted text-3xs font-medium text-muted-foreground ring-2 ring-background">
                +{agents.length - 3}
              </span>
            ) : null}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-semibold">{label}</span>
            <span
              className={cn(
                "block truncate text-3xs text-muted-foreground",
                summary.active ? "text-info" : summary.failed && "text-destructive",
              )}
            >
              {statusSummary}
            </span>
          </span>
          <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
            <SubagentElapsed agent={subagentGroupTiming(agents)} />
          </span>
          <ChevronDownIcon
            aria-hidden
            className={cn(
              "size-3.5 shrink-0 text-muted-foreground transition-transform",
              expanded && "rotate-180",
            )}
          />
        </CollapsibleTrigger>
        {/* Virtualized rows must settle before disclosure scroll anchoring resumes. */}
        <CollapsiblePanel animate={false}>
          {expanded ? (
            <div className="mt-1 mb-1 rounded-lg border border-border/60 bg-card/30 p-1">
              {members.map((item) => (
                <V2LifecycleRow
                  environmentId={ctx.activeThreadEnvironmentId}
                  key={item.id}
                  item={item}
                  createdAt={row.createdAt}
                  timestampFormat={ctx.timestampFormat}
                  providerStatuses={ctx.providerStatuses}
                  runs={ctx.runs}
                  onOpenThread={ctx.onOpenThread}
                />
              ))}
            </div>
          ) : null}
        </CollapsiblePanel>
      </Collapsible>
    </WorkLogBlock>
  );
});
