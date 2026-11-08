import {
  type TimelineWorkEntry,
  TimelineRowCtx,
  TimelineRowActivityCtx,
  WorkGroupViewCtx,
  TimelineRevealCtx,
} from "./TimelineRowContext";
import {
  type EnvironmentId,
  ThreadId,
  type OrchestrationV2TurnItem,
  ORCHESTRATION_V2_WORKSPACE_PREPARATION_FAILURE_CODE,
} from "@t3tools/contracts";
import {
  threadReadTargetId,
  threadReadTargetTitle,
  threadReadLabelPrefix,
  toolGroupAction,
  workEntryDisplayLabel,
  workEntryReadOutput,
} from "./MessagesTimeline.logic";
import { useThreadShell } from "../../state/entities";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { Link } from "@tanstack/react-router";
import {
  type WorkEntryIconName,
  failedToolIconClassName,
  ToolActivityIconView,
  toolIconAcceptsTint,
} from "./TimelineToolActivityIcon";
import { formatWorkspaceRelativePath } from "../../filePathDisplay";
import {
  resolveWorkEntryToolPresentation,
  workEntryViewedImagePath,
  resolveViewedImageAsset,
} from "@t3tools/client-runtime/work-log/presentation";
import { toolGroupSummaryIconName, WorkingTimer } from "./TimelineWorkGroupRows";
import { type Root, type RootContent } from "mdast";
import { use, memo, useState, useRef, useEffect, type KeyboardEvent, useMemo } from "react";
import { WorkLogDetails, WorkLogRow } from "./WorkLog";
import ChatMarkdown, { ChatMarkdownAssetImage } from "../ChatMarkdown";
import { MESSAGE_HEADING_LEVEL, TimelineRowTimestamp } from "./TimelineRowParts";
import { notificationChildThreadId } from "@t3tools/client-runtime/state/thread-execution";
import { SubagentNotificationLink } from "./V2LifecycleRow";
import { useAtomValue } from "@effect/atom-react";
import { environmentThreadDetails } from "../../state/threads";
import { liveBackgroundCommandIds } from "./backgroundCommands";
import { formatUpcomingTimestamp, formatLocalTimeZoneName } from "../../timestampFormat";
import { CircleAlertIcon, RotateCcwIcon, XIcon, ChevronRightIcon } from "lucide-react";
import { cn } from "~/lib/utils";
import { Button, InlineButton } from "../ui/button";
import {
  workEntryDisplayIndicatesToolFailure,
  workEntrySignalsSevereFailure,
  workLogEntryIsToolLike,
} from "../../session-logic";
import {
  getQuestionTextPreview,
  hasQuestionAnswer,
  getQuestionAnswerPreview,
  getQuestionAnswerText,
} from "@t3tools/client-runtime/work-log/user-input";
import { claudeSkillInvocation } from "@t3tools/shared/toolActivity";
import {
  turnItemNeedsDetailFetch,
  turnItemHasDetail,
} from "@t3tools/client-runtime/work-log/item-detail";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { V2ItemInspector, FetchedToolOutput } from "./V2ItemInspector";
import { useAssetUrls } from "../../assets/assetUrls";

/** The thread a `leo_thread_read` call targets, titled from live shell state so renames show. */
export function useThreadReadTarget(entry: TimelineWorkEntry, environmentId: EnvironmentId) {
  const rawThreadId = threadReadTargetId(entry);
  const threadId = rawThreadId === null ? null : ThreadId.make(rawThreadId);
  const shell = useThreadShell(threadId ? scopeThreadRef(environmentId, threadId) : null);
  const title = threadReadTargetTitle(shell);
  return threadId && title ? { threadId, title } : null;
}

export function threadReadLabel(label: string, target: ReturnType<typeof useThreadReadTarget>) {
  const prefix = target && threadReadLabelPrefix(label);
  return prefix ? { ...target, prefix, text: `${prefix} “${target.title}”` } : null;
}

/** Only settled rows link the title; the live row is itself a button. */
export function ThreadReadLabel({
  label,
  environmentId,
  linked,
}: {
  label: NonNullable<ReturnType<typeof threadReadLabel>>;
  environmentId: EnvironmentId;
  linked: boolean;
}) {
  return (
    <span className="flex min-w-0">
      <span className="shrink-0">{label.prefix} “</span>
      {linked ? (
        <Link
          to="/$environmentId/$threadId"
          params={{ environmentId, threadId: label.threadId }}
          className="min-w-0 truncate rounded-sm text-foreground underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-ring"
          onClick={stopRowToggle}
          onKeyDown={stopRowToggle}
        >
          {label.title}
        </Link>
      ) : (
        <span className="min-w-0 truncate">{label.title}</span>
      )}
      <span className="shrink-0">”</span>
    </span>
  );
}

function workToneIcon(tone: TimelineWorkEntry["tone"]): {
  iconName: WorkEntryIconName;
  className: string;
} {
  if (tone === "error") {
    return {
      iconName: "circle-alert",
      className: "text-foreground/92",
    };
  }
  if (tone === "thinking") {
    return {
      iconName: "brain",
      className: "text-icon-muted",
    };
  }
  if (tone === "info") {
    return {
      iconName: "check",
      className: "text-muted-foreground",
    };
  }
  return {
    iconName: "zap",
    className: "text-foreground/92",
  };
}

function workEntryRawCommand(
  workEntry: Pick<TimelineWorkEntry, "command" | "rawCommand">,
): string | null {
  const rawCommand = workEntry.rawCommand?.trim();
  if (!rawCommand || !workEntry.command) {
    return null;
  }
  return rawCommand === workEntry.command.trim() ? null : rawCommand;
}

function buildToolCallExpandedBody(
  workEntry: TimelineWorkEntry,
  workspaceRoot: string | undefined,
  visibleLabel: string,
  viewedImagePath: string | null,
): string | null {
  const blocks: string[] = [];
  const seen = new Set<string>([visibleLabel.trim()]);
  const addBlock = (value: string | null | undefined) => {
    const text = value?.trim();
    if (!text || seen.has(text)) return;
    seen.add(text);
    blocks.push(text);
  };
  if (workEntry.itemType === "dynamic_tool" && workEntry.toolData !== undefined) {
    const input =
      workEntry.structuredPayload?.type === "dynamic_tool"
        ? workEntry.structuredPayload.input
        : workEntry.toolData !== null &&
            typeof workEntry.toolData === "object" &&
            "input" in workEntry.toolData
          ? workEntry.toolData.input
          : undefined;
    if (input !== undefined) addBlock(`Tool input\n${JSON.stringify(input, null, 2)}`);
  }
  const command = workEntry.command?.trim();
  const raw = workEntryRawCommand(workEntry);
  if (command === visibleLabel.trim()) {
    seen.add(command);
  } else {
    addBlock(raw ?? command);
  }
  const detail = workEntry.detail?.trim();
  if (detail !== viewedImagePath?.trim()) {
    addBlock(detail);
  }
  const viewedImagePaths = new Set(
    viewedImagePath
      ? [viewedImagePath.trim(), formatWorkspaceRelativePath(viewedImagePath, workspaceRoot)]
      : [],
  );
  const changedFiles = (workEntry.changedFiles ?? []).flatMap((filePath) => {
    const formattedPath = formatWorkspaceRelativePath(filePath, workspaceRoot);
    return viewedImagePaths.has(filePath) ||
      viewedImagePaths.has(formattedPath) ||
      filePath.trim() === detail ||
      formattedPath === detail
      ? []
      : [formattedPath];
  });
  if (changedFiles.length > 0) {
    addBlock([...new Set(changedFiles)].join("\n"));
  }
  return blocks.length > 0 ? blocks.join("\n\n") : null;
}

const toolCallExpandedBodyClassName =
  "max-h-64 cursor-text overflow-auto whitespace-pre-wrap break-words font-mono text-secondary-label text-(length:--font-size-code,var(--text-2xs)) leading-relaxed select-text";

export function workEntryIconName(workEntry: TimelineWorkEntry): WorkEntryIconName {
  if (workEntry.structuredPayload?.type === "notification") {
    if (workEntry.structuredPayload.outcome === "failed") return "circle-alert";
    const source = workEntry.structuredPayload.source;
    switch (source.kind) {
      case "subagent":
      case "delegated_task":
        return "bot";
      case "command":
        return "terminal";
      case "monitor":
        return "eye";
      case "background_task":
        return "zap";
      case "system":
        return "t3-code";
      default:
        source satisfies never;
        return "zap";
    }
  }
  if (workEntry.itemType === "user_input_request" || workEntry.itemType === "approval_request") {
    return "message-circle";
  }
  if (workEntry.toolSurface) return workEntry.toolSurface;
  const toolPresentation = resolveWorkEntryToolPresentation(workEntry);
  if (toolPresentation) return toolPresentation.icon;
  const action = toolGroupAction(workEntry);
  if (action !== "other") return toolGroupSummaryIconName(action);

  switch (workEntry.itemType) {
    case "dynamic_tool":
      return "wrench";
    case "subagent":
      return "bot";
  }

  return workToneIcon(workEntry.tone).iconName;
}

const stopRowToggle = (e: { stopPropagation: () => void }) => e.stopPropagation();

export function remarkThoughtPreview(fallback: string) {
  return (tree: Root) => {
    const plainText = (node: Root | RootContent): string => {
      if (node.type === "html" || node.type === "definition") return "";
      if ("alt" in node) return node.alt ?? "";
      if ("value" in node) return node.value;
      if ("children" in node) {
        const separator = ["root", "blockquote", "list", "listItem", "table", "tableRow"].includes(
          node.type,
        )
          ? " "
          : "";
        return node.children.map(plainText).join(separator);
      }
      return node.type === "break" ? " " : "";
    };
    tree.children = [
      { type: "text", value: plainText(tree).replace(/\s+/g, " ").trim() || fallback },
    ];
  };
}

export function ReasoningTraceContent({ entries }: { entries: ReadonlyArray<TimelineWorkEntry> }) {
  const ctx = use(TimelineRowCtx);
  const { isWorking, latestRunId } = use(TimelineRowActivityCtx);
  return (
    <WorkLogDetails>
      {entries.map((entry) => (
        <ChatMarkdown
          key={entry.id}
          className="text-foreground"
          text={entry.detail ?? ""}
          cwd={ctx.markdownCwd}
          threadRef={ctx.threadRef ?? undefined}
          skills={ctx.skills}
          isStreaming={
            isWorking && entry.runId === latestRunId && entry.toolLifecycleStatus === "inProgress"
          }
          headingLevelOffset={MESSAGE_HEADING_LEVEL}
          onUseArtifactTemplate={ctx.onUseArtifactTemplate}
          onImageExpand={ctx.onImageExpand}
          lineBreaks
        />
      ))}
    </WorkLogDetails>
  );
}

type WorkEntryRowProps = {
  workEntry: TimelineWorkEntry;
  workspaceRoot: string | undefined;
  displayLabel?: string | undefined;
  onToggleEntry?: ((collapsed: boolean) => void) | undefined;
};

export const SimpleWorkEntryRow = memo(function SimpleWorkEntryRow(props: WorkEntryRowProps) {
  const ctx = use(TimelineRowCtx);
  const item = props.workEntry.projectedItem?.item;
  const childThreadId =
    item?.type === "notification" ? notificationChildThreadId(item.source) : undefined;
  if (item?.type !== "notification" || childThreadId === undefined) {
    return <WorkEntryLogRow {...props} />;
  }
  return (
    <SubagentNotificationLink
      parentRef={scopeThreadRef(ctx.activeThreadEnvironmentId, item.threadId)}
      childThreadId={childThreadId}
      outcome={item.outcome}
      createdAt={props.workEntry.createdAt}
      timestampFormat={ctx.timestampFormat}
      providerStatuses={ctx.providerStatuses}
      onOpenThread={ctx.onOpenThread}
      fallback={<WorkEntryLogRow {...props} />}
    />
  );
});

/**
 * A backgrounded command settles as completed the moment it launches. While
 * the provider still lists it as running, this chip shows it is alive.
 */
function BackgroundCommandTimer({
  item,
  startedAt,
}: {
  item: OrchestrationV2TurnItem;
  startedAt: string;
}) {
  const ctx = use(TimelineRowCtx);
  const liveIds = useAtomValue(
    environmentThreadDetails.threadAtom(
      scopeThreadRef(ctx.activeThreadEnvironmentId, item.threadId),
    ),
    (thread) =>
      thread === null || thread === undefined
        ? ""
        : liveBackgroundCommandIds(
            thread.projection.turnItems,
            thread.projection.providerThreads.flatMap(
              (providerThread) => providerThread.pendingBackgroundTasks ?? [],
            ),
          ).join("\n"),
  );
  if (!liveIds.split("\n").includes(item.id)) return null;
  return (
    <span className="shrink-0 text-xs text-muted-foreground">
      Running <WorkingTimer createdAt={startedAt} />
    </span>
  );
}

function WorkEntryLogRow(props: WorkEntryRowProps) {
  const { workEntry, workspaceRoot, displayLabel } = props;
  const ctx = use(TimelineRowCtx);
  const { threadRef, onImageExpand, timestampFormat } = ctx;
  const { retryableWorkspacePreparationRunIds, onRetryWorkspacePreparation } = ctx;
  const threadTarget = useThreadReadTarget(workEntry, ctx.activeThreadEnvironmentId);
  const createdThread =
    workEntry.projectedItem?.item.type === "thread_created"
      ? workEntry.projectedItem.item
      : undefined;
  const notifiedSubagentThreadId =
    workEntry.projectedItem?.item.type === "notification"
      ? notificationChildThreadId(workEntry.projectedItem.item.source)
      : undefined;
  const groupView = use(WorkGroupViewCtx);
  const [expanded, setExpanded] = useState(
    () => groupView?.state.expandedEntries.has(workEntry.id) ?? false,
  );
  const toggleExpanded = () => {
    const next = !expanded;
    if (groupView) {
      groupView.onToggleEntry(!next);
      if (next) groupView.state.expandedEntries.add(workEntry.id);
      else groupView.state.expandedEntries.delete(workEntry.id);
    } else {
      props.onToggleEntry?.(!next);
    }
    setExpanded(next);
  };
  const reveal = use(TimelineRevealCtx);
  const revealed = reveal?.entryId === workEntry.id ? reveal : null;
  const rowRef = useRef<HTMLDivElement>(null);
  const [highlighted, setHighlighted] = useState(false);
  useEffect(() => {
    // A row that mounts later (scrolled into the list) skips an old request.
    if (revealed === null || Date.now() - revealed.at > 3_000) return;
    groupView?.state.expandedEntries.add(workEntry.id);
    setExpanded(true);
    setHighlighted(true);
    const frame = requestAnimationFrame(() => rowRef.current?.scrollIntoView({ block: "nearest" }));
    const timer = setTimeout(() => setHighlighted(false), 1_600);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
    };
  }, [revealed, groupView, workEntry.id]);
  const failureItem = workEntry.projectedItem?.item;
  if (failureItem?.type === "error" && failureItem.status === "failed") {
    const warning = failureItem.failure.class === "usage_limit";
    const resetAt = failureItem.failure.resetAt;
    const resetTime = resetAt
      ? `${formatUpcomingTimestamp(resetAt, timestampFormat)} ${formatLocalTimeZoneName(resetAt)}`.trim()
      : null;
    const label = warning
      ? `You used all of your AI account limit.${resetTime ? ` Try again after ${resetTime}.` : ""}`
      : workEntry.label;
    const retryRunId =
      failureItem.runId !== null &&
      retryableWorkspacePreparationRunIds.has(failureItem.runId) &&
      failureItem.failure.code === ORCHESTRATION_V2_WORKSPACE_PREPARATION_FAILURE_CODE
        ? failureItem.runId
        : null;
    return (
      <WorkLogRow
        data-v2-item-type="error"
        data-v2-item-visibility={workEntry.projectedItem?.visibility}
        wrapLabel
        icon={
          <CircleAlertIcon
            className={cn("size-4", warning ? "text-warning" : "text-destructive")}
          />
        }
        label={
          <span
            className={cn("text-sm font-medium", warning ? "text-warning" : "text-destructive")}
          >
            {label}
          </span>
        }
        trailing={
          <TimelineRowTimestamp
            createdAt={workEntry.createdAt}
            timestampFormat={timestampFormat}
            alwaysVisible
          />
        }
      >
        {!warning ? (
          <p className="ms-7 whitespace-pre-wrap break-words py-1 text-sm leading-relaxed text-foreground/80">
            {failureItem.failure.message}
          </p>
        ) : null}
        {retryRunId !== null && onRetryWorkspacePreparation ? (
          <div className="ms-7 pb-1">
            <Button
              type="button"
              size="xs"
              variant="outline"
              onClick={() => onRetryWorkspacePreparation(retryRunId)}
            >
              <RotateCcwIcon aria-hidden />
              Retry
            </Button>
          </div>
        ) : null}
      </WorkLogRow>
    );
  }
  const iconConfig = workToneIcon(workEntry.tone);
  const showWarningIndicator = workEntry.sourceActivityKind === "runtime.warning";
  const showFailedIndicator =
    !showWarningIndicator && workEntryDisplayIndicatesToolFailure(workEntry);
  const showDestructiveRowStyle =
    !showWarningIndicator &&
    showFailedIndicator &&
    (workEntrySignalsSevereFailure(workEntry) || !workLogEntryIsToolLike(workEntry));
  const entryIconName =
    showWarningIndicator || showDestructiveRowStyle ? "circle-alert" : workEntryIconName(workEntry);
  const entryToolIcon =
    showWarningIndicator || showDestructiveRowStyle
      ? undefined
      : (workEntry.toolIcon ?? workEntry.toolSource?.icon);
  const isReasoning = workEntry.itemType === "reasoning";
  // The question is the row's identity: a generic "User input submitted"
  // label buries what was asked, so lead with the question text (even over a
  // lone tool row's display label) and keep the answer as the trailing preview.
  const questionHeading = workEntry.questionAnswer
    ? getQuestionTextPreview(workEntry.questionAnswer)
    : "";
  const previewText =
    isReasoning && expanded
      ? workEntry.toolLifecycleStatus === "inProgress"
        ? "Thinking"
        : "Thought"
      : questionHeading || (displayLabel ?? workEntryDisplayLabel(workEntry, workspaceRoot));
  const answerPreview =
    workEntry.questionAnswer && hasQuestionAnswer(workEntry.questionAnswer)
      ? getQuestionAnswerPreview(workEntry.questionAnswer)
      : null;
  const viewedImagePath = workEntryViewedImagePath(workEntry);
  const payload = workEntry.structuredPayload;
  const skill =
    payload?.type === "dynamic_tool"
      ? claudeSkillInvocation(payload.toolName, payload.input)
      : undefined;
  // Reads and skills expand to plain text instead of the item inspector. A
  // skill's heading already names it, so only its arguments are left to show.
  const plainOutput =
    toolGroupAction(workEntry) === "read"
      ? workEntryReadOutput(workEntry, workspaceRoot)
      : skill
        ? (skill.args ?? null)
        : undefined;
  const viewedImage =
    viewedImagePath && threadRef
      ? resolveViewedImageAsset(viewedImagePath, {
          threadId: threadRef.threadId,
          workspaceRoot,
        })
      : null;
  const canExpand =
    previewText.trim().length > 0 ||
    (workEntry.itemType === "dynamic_tool" && workEntry.toolData !== undefined) ||
    Boolean(
      workEntryRawCommand(workEntry) ||
      workEntry.command?.trim() ||
      workEntry.detail?.trim() ||
      workEntry.changedFiles?.length ||
      viewedImage,
    );
  const expandedBody =
    expanded && !isReasoning
      ? plainOutput !== undefined
        ? plainOutput
        : buildToolCallExpandedBody(
            workEntry,
            workspaceRoot,
            previewText,
            viewedImage ? viewedImagePath : null,
          )
      : null;
  // Projected rows expand to the item inspector, so only offer a disclosure
  // when it has something to show, even if that output still has to load.
  // Reads and skills still fetch the output the timeline withheld.
  const plainOutputFetches =
    plainOutput !== undefined &&
    workEntry.projectedItem !== undefined &&
    turnItemNeedsDetailFetch(workEntry.projectedItem.item);
  const canExpandProjectedItem =
    plainOutput !== undefined
      ? Boolean(plainOutput || viewedImage || workEntry.questionAnswer || plainOutputFetches)
      : workEntry.projectedItem === undefined
        ? canExpand
        : isReasoning
          ? Boolean(workEntry.detail?.trim())
          : Boolean(
              viewedImage ||
              workEntry.questionAnswer ||
              turnItemHasDetail(workEntry.projectedItem.item),
            );
  // Reserve destructive row styling for severe failures, not routine tool errors.
  const iconWrapperClass = cn(
    "flex size-4 items-center justify-center",
    showWarningIndicator
      ? "text-warning"
      : showDestructiveRowStyle
        ? "text-destructive"
        : showFailedIndicator
          ? failedToolIconClassName
          : workEntry.tone === "tool"
            ? "text-icon-muted"
            : iconConfig.className,
  );
  const headingClass = showWarningIndicator
    ? "font-medium text-warning"
    : showDestructiveRowStyle
      ? "font-medium text-destructive"
      : workLogEntryIsToolLike(workEntry)
        ? "text-secondary-label"
        : "text-foreground/80";
  const threadLabel = isReasoning ? null : threadReadLabel(previewText, threadTarget);
  const accessiblePreview = [threadLabel?.text ?? previewText, answerPreview]
    .filter(Boolean)
    .join(": ");
  const accessibleDisplayText = showFailedIndicator
    ? `${accessiblePreview}, tool call failed`
    : accessiblePreview;
  const rowToggleProps = canExpandProjectedItem
    ? {
        role: "button" as const,
        tabIndex: 0 as const,
        "aria-label": accessibleDisplayText,
        "aria-expanded": expanded,
        onClick: toggleExpanded,
        onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            toggleExpanded();
          }
        },
      }
    : {};

  return (
    <WorkLogRow
      ref={rowRef}
      data-revealed={highlighted || undefined}
      data-v2-item-type={workEntry.projectedItem?.item.type}
      data-v2-item-visibility={workEntry.projectedItem?.visibility}
      {...rowToggleProps}
      icon={
        <span
          className={iconWrapperClass}
          role={showFailedIndicator ? "img" : undefined}
          aria-label={showFailedIndicator ? "Tool failed" : undefined}
        >
          <ToolActivityIconView
            icon={entryToolIcon}
            fallbackName={entryIconName}
            className="block size-4 shrink-0 stroke-2"
            muted
          />
        </span>
      }
      label={
        <div className="min-w-0 flex-1 overflow-hidden">
          <p className="flex min-w-0 w-full items-baseline gap-1.5 text-sm leading-relaxed">
            <span
              className={cn(answerPreview ? "min-w-0" : "min-w-0 flex-1", "truncate", headingClass)}
            >
              {isReasoning && !expanded ? (
                <ReactMarkdown
                  remarkPlugins={[
                    remarkGfm,
                    [
                      remarkThoughtPreview,
                      workEntry.toolLifecycleStatus === "inProgress" ? "Thinking" : "Thought",
                    ],
                  ]}
                >
                  {workEntry.detail ?? previewText}
                </ReactMarkdown>
              ) : threadLabel ? (
                <ThreadReadLabel
                  label={threadLabel}
                  environmentId={ctx.activeThreadEnvironmentId}
                  linked
                />
              ) : (
                previewText
              )}
            </span>
            {answerPreview ? (
              <span
                className={cn(
                  "min-w-0 truncate",
                  !expanded &&
                    workEntry.questionAnswer &&
                    hasQuestionAnswer(workEntry.questionAnswer)
                    ? "text-foreground"
                    : "text-muted-foreground",
                )}
              >
                {answerPreview}
              </span>
            ) : null}
          </p>
        </div>
      }
      trailing={
        <>
          {createdThread ? (
            <button
              type="button"
              className="shrink-0 rounded-sm text-sm text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              aria-label={`Open ${createdThread.title ?? "new chat"}`}
              onClick={(event) => {
                event.stopPropagation();
                ctx.onOpenThread(createdThread.targetThreadId);
              }}
              onKeyDown={stopRowToggle}
            >
              Open chat
            </button>
          ) : null}
          {notifiedSubagentThreadId ? (
            <InlineButton
              aria-label="Open the helper chat"
              onClick={(event) => {
                event.stopPropagation();
                ctx.onOpenThread(notifiedSubagentThreadId);
              }}
              onKeyDown={stopRowToggle}
            >
              Open helper
            </InlineButton>
          ) : null}
          {showFailedIndicator &&
          !showDestructiveRowStyle &&
          !toolIconAcceptsTint(entryIconName, entryToolIcon) ? (
            <XIcon aria-hidden className={cn("size-3 shrink-0", failedToolIconClassName)} />
          ) : null}
          {workEntry.projectedItem?.item.type === "command_execution" &&
          workEntry.projectedItem.item.status === "completed" &&
          workEntry.projectedItem.item.output !== undefined ? (
            <BackgroundCommandTimer
              item={workEntry.projectedItem.item}
              startedAt={workEntry.createdAt}
            />
          ) : null}
          <TimelineRowTimestamp createdAt={workEntry.createdAt} timestampFormat={timestampFormat} />
          <span
            className={cn(
              "flex size-4 shrink-0 items-center justify-center",
              !canExpandProjectedItem && "invisible",
            )}
            aria-hidden
          >
            <ChevronRightIcon
              className={cn(
                "size-3 shrink-0 text-icon-muted opacity-70 transition-transform duration-200",
                expanded && "rotate-90",
              )}
            />
          </span>
        </>
      }
    >
      {expanded && viewedImage && threadRef ? (
        <WorkLogDetails kind="media">
          <ChatMarkdownAssetImage
            environmentId={threadRef.environmentId}
            resource={viewedImage.resource}
            alt={viewedImage.alt}
            srcFragment={viewedImage.srcFragment}
            workspaceRoot={workspaceRoot}
            maxHeightRem={16}
            onImageExpand={onImageExpand}
          />
        </WorkLogDetails>
      ) : null}
      {expanded && workEntry.questionAnswer ? (
        <QuestionAnswerHistory answer={workEntry.questionAnswer} />
      ) : null}
      {expanded && isReasoning ? <ReasoningTraceContent entries={[workEntry]} /> : null}
      {expanded &&
      !isReasoning &&
      !workEntry.questionAnswer &&
      canExpandProjectedItem &&
      (expandedBody ||
        plainOutputFetches ||
        (workEntry.projectedItem && plainOutput === undefined)) ? (
        <WorkLogDetails kind="panel">
          {workEntry.projectedItem && plainOutput === undefined ? (
            <V2ItemInspector
              projectedItem={workEntry.projectedItem}
              environmentId={ctx.activeThreadEnvironmentId}
              cwd={ctx.markdownCwd}
              workspaceRoot={workspaceRoot}
              onOpenThread={ctx.onOpenThread}
              onOpenTurnDiff={ctx.onOpenTurnDiff}
              onRollbackCheckpoint={ctx.onRollbackCheckpoint}
              onImageExpand={ctx.onImageExpand}
            />
          ) : (
            <>
              {expandedBody ? (
                <pre className={toolCallExpandedBodyClassName}>{expandedBody}</pre>
              ) : null}
              {plainOutputFetches && workEntry.projectedItem ? (
                <FetchedToolOutput
                  projectedItem={workEntry.projectedItem}
                  environmentId={ctx.activeThreadEnvironmentId}
                  onImageExpand={onImageExpand}
                />
              ) : null}
            </>
          )}
        </WorkLogDetails>
      ) : null}
    </WorkLogRow>
  );
}

function QuestionAnswerHistory({
  answer,
}: {
  answer: import("@t3tools/contracts").UserInputAttachmentAnswerPayload;
}) {
  const { activeThreadEnvironmentId } = use(TimelineRowCtx);
  const attachments = useMemo(() => Object.values(answer.attachmentsByQuestionId).flat(), [answer]);
  const resources = useMemo(
    () =>
      attachments.map((attachment) => ({
        _tag: "attachment" as const,
        attachmentId: attachment.id,
      })),
    [attachments],
  );
  const urls = useAssetUrls(activeThreadEnvironmentId, resources);
  return (
    <div className="ms-7 mt-2 space-y-2" onClick={stopRowToggle}>
      {[
        ...new Set([
          ...Object.keys(answer.questionTextById ?? {}),
          ...Object.keys(answer.answers),
          ...Object.keys(answer.attachmentsByQuestionId),
        ]),
      ].map((questionId) => (
        <div key={questionId} className="space-y-1">
          {answer.questionTextById?.[questionId] ? (
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">
              {answer.questionTextById[questionId]}
            </p>
          ) : null}
          {getQuestionAnswerText(answer.answers[questionId]) ? (
            <p className="ms-3 whitespace-pre-wrap text-sm text-muted-foreground">
              {getQuestionAnswerText(answer.answers[questionId])}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {(answer.attachmentsByQuestionId[questionId] ?? []).map((attachment) => {
              const url = urls[attachments.indexOf(attachment)];
              return (
                <a
                  key={attachment.id}
                  href={url ?? undefined}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm underline"
                >
                  {attachment.type === "image" && url ? (
                    <img
                      src={url}
                      alt={attachment.name}
                      className="h-20 max-w-32 rounded object-contain"
                    />
                  ) : (
                    attachment.name
                  )}
                </a>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
