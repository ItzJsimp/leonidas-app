import { type TimelineRow, TimelineRowCtx, TimelineRowActivityCtx } from "./TimelineRowContext";
import { use, useState, useMemo, memo } from "react";
import { useAtomValue } from "@effect/atom-react";
import { serverEnvironment } from "~/state/server";
import { MessageAuthorHeading, MESSAGE_HEADING_LEVEL } from "./LeoTimelineRowParts";
import { AssistantCitationSource } from "./AssistantCitationSource";
import { AssistantOutput } from "./AssistantOutput";
import { shouldPreserveAssistantLineBreaks } from "@t3tools/shared/markdownPipeline";
import { TurnOnUndoNote } from "./TurnOnUndoNote";
import { useV2ItemSupport } from "../../state/v2ItemSupport";
import { canForkProjectedAssistantItem } from "@t3tools/client-runtime/state/thread-workflows";
import { Tooltip, TooltipTrigger, TooltipPopup } from "../ui/tooltip";
import { Button } from "../ui/button";
import { GitForkIcon, SlidersHorizontalIcon } from "lucide-react";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "../ui/menu";
import { cn } from "~/lib/utils";
import { type ChatMessage, type TurnDiffSummary } from "../../types";
import { resolveRunIdentity } from "./runIdentity.logic";
import { RunIdentityTag } from "./RunIdentityTag";
import { formatDayAwareTimestamp, formatChatTimestampTooltip } from "../../timestampFormat";
import { resolveAssistantMessageCopyState } from "./MessagesTimeline.logic";
import { MessageCopyButton } from "./MessageCopyButton";
import { MessageCaptureButton } from "./MessageCaptureButton";
import { ProposedPlanCard } from "./ProposedPlanCard";
import { HtmlRenderFrame } from "./HtmlRenderFrame";
import { McpAppFrame } from "./McpAppFrame";
import { type RunId } from "@t3tools/contracts";
import { useUiStateStore } from "~/uiStateStore";
import { useThreadShell, useProject } from "../../state/entities";
import { useFileContextMenuHandler } from "../../fileContextMenu";
import { ChangedFilesCard } from "./ChangedFilesTree";

export function AssistantTimelineRow({ row }: { row: Extract<TimelineRow, { kind: "message" }> }) {
  const ctx = use(TimelineRowCtx);
  const aiLevel =
    useAtomValue(serverEnvironment.settingsValueAtom(ctx.activeThreadEnvironmentId))?.aiLevel ??
    "new";
  const undoTarget = row.undoTarget;
  const messageText = row.message.text || (row.message.streaming ? "" : "(empty response)");

  return (
    <>
      <div className="relative min-w-0 px-1 py-0.5">
        <MessageAuthorHeading>Leonidas</MessageAuthorHeading>
        <div data-thread-find-text="true">
          <AssistantCitationSource
            messageId={row.message.id}
            {...(ctx.threadRef ? { threadRef: ctx.threadRef } : {})}
            itemKey={row.id}
            request={ctx.citationRequest}
            listRef={ctx.listRef}
          >
            <AssistantOutput
              onReply={ctx.onDockReply}
              simple={aiLevel !== "builder"}
              text={messageText}
              cwd={ctx.markdownCwd}
              threadRef={ctx.threadRef ?? undefined}
              isStreaming={Boolean(row.message.streaming)}
              lineBreaks={shouldPreserveAssistantLineBreaks(messageText)}
              skills={ctx.skills}
              headingLevelOffset={MESSAGE_HEADING_LEVEL}
              onUseArtifactTemplate={ctx.onUseArtifactTemplate}
              onRunShellCommand={ctx.onRunShellCommand}
              onImageExpand={ctx.onImageExpand}
            />
          </AssistantCitationSource>
          {!undoTarget && row.showAssistantMeta && aiLevel !== "builder" && ctx.markdownCwd ? (
            <TurnOnUndoNote environmentId={ctx.activeThreadEnvironmentId} cwd={ctx.markdownCwd} />
          ) : null}
        </div>
        <AssistantChangedFilesSection
          turnSummary={row.assistantTurnDiffSummary}
          routeThreadKey={ctx.routeThreadKey}
          resolvedTheme={ctx.resolvedTheme}
          onOpenTurnDiff={ctx.onOpenTurnDiff}
        />
        {row.showAssistantMeta ? (
          <AssistantMessageMeta
            className="mt-1.5"
            projectedItem={row.projectedItem}
            message={row.message}
            showCopyButton={row.showAssistantCopyButton}
            copyStreaming={row.assistantCopyStreaming}
          />
        ) : null}
      </div>
    </>
  );
}

/** Each choice fills the message box. The user checks it, then sends. */
export const ADJUST_REPLIES = [
  { label: "Shorter", reply: "Say your last answer again in fewer words. Keep only what I need." },
  {
    label: "Simpler",
    reply: "Say your last answer again in simpler words. Define each technical term.",
  },
  {
    label: "More detail",
    reply: "Give more detail on your last answer. Show the steps and the reasons.",
  },
] as const;

function AssistantAdjustMenu() {
  const ctx = use(TimelineRowCtx);
  const fill = ctx.onDockReply;
  if (!fill) return null;
  return (
    <Menu>
      <Tooltip>
        <TooltipTrigger
          render={
            <MenuTrigger
              render={
                <Button type="button" size="xs" variant="ghost" aria-label="Adjust this reply" />
              }
            />
          }
        >
          <SlidersHorizontalIcon className="size-3" />
        </TooltipTrigger>
        <TooltipPopup side="top">Adjust</TooltipPopup>
      </Tooltip>
      <MenuPopup side="top" align="start">
        {ADJUST_REPLIES.map((item) => (
          <MenuItem key={item.label} onClick={() => fill(item.reply)}>
            {item.label}
          </MenuItem>
        ))}
      </MenuPopup>
    </Menu>
  );
}

function AssistantForkButton({
  projectedItem,
}: {
  readonly projectedItem: NonNullable<Extract<TimelineRow, { kind: "message" }>["projectedItem"]>;
}) {
  const ctx = use(TimelineRowCtx);
  const [busy, setBusy] = useState(false);
  const support = useV2ItemSupport({
    environmentId: ctx.activeThreadEnvironmentId,
    sourceThreadId: projectedItem.sourceThreadId,
    sourceItemId: projectedItem.sourceItemId,
  });
  const canFork = canForkProjectedAssistantItem({
    projectedItem,
    capabilities: support.providerSession?.capabilities,
  });

  if (!canFork || projectedItem.item.runId === null) return null;
  const runId = projectedItem.item.runId;

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            size="xs"
            variant="ghost"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void ctx
                .onForkFromRun({ sourceThreadId: projectedItem.sourceThreadId, runId })
                .finally(() => setBusy(false));
            }}
            aria-label="Start a new chat from this reply"
          />
        }
      >
        <GitForkIcon className={cn("size-3", busy && "animate-pulse")} />
      </TooltipTrigger>
      <TooltipPopup side="top">Start a new chat from this reply</TooltipPopup>
    </Tooltip>
  );
}

export function AssistantMetaTimelineRow({
  row,
}: {
  row: Extract<TimelineRow, { kind: "assistant-meta" }>;
}) {
  return (
    <div className="px-1">
      <AssistantMessageMeta
        className="mt-0.5"
        projectedItem={row.projectedItem}
        message={row.message}
        showCopyButton={row.showAssistantCopyButton}
        copyStreaming={row.assistantCopyStreaming}
        alwaysVisible
      />
    </div>
  );
}

function AssistantMessageMeta({
  className,
  projectedItem,
  message,
  showCopyButton,
  copyStreaming,
  alwaysVisible = false,
}: {
  className?: string;
  projectedItem?: Extract<TimelineRow, { kind: "message" }>["projectedItem"];
  message: ChatMessage;
  showCopyButton: boolean;
  copyStreaming: boolean;
  alwaysVisible?: boolean;
}) {
  const ctx = use(TimelineRowCtx);
  const runId = projectedItem?.item.runId ?? null;
  const run = runId === null ? undefined : ctx.runs.find((candidate) => candidate.id === runId);
  const runIdentity = useMemo(
    () => (run ? resolveRunIdentity(run, ctx.providerStatuses) : undefined),
    [run, ctx.providerStatuses],
  );

  return (
    <div className={cn("flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1", className)}>
      {runIdentity ? <RunIdentityTag identity={runIdentity} /> : null}
      <div
        className={cn(
          "flex items-center gap-2 text-xs tabular-nums transition-opacity duration-200",
          alwaysVisible
            ? "opacity-100"
            : "opacity-0 pointer-coarse:opacity-100 focus-within:opacity-100 group-hover/assistant:opacity-100",
        )}
      >
        {projectedItem && projectedItem.item.status !== "completed" ? (
          <span className="rounded-full border border-border/70 px-1.5 py-0.5 font-mono text-3xs text-muted-foreground">
            {projectedItem.item.status}
          </span>
        ) : null}
        <AssistantCopyButton
          message={message}
          showCopyButton={showCopyButton}
          streaming={copyStreaming}
          threadId={projectedItem?.item.threadId}
        />
        {projectedItem?.item.type === "assistant_message" ? (
          <AssistantForkButton projectedItem={projectedItem} />
        ) : null}
        {showCopyButton && !copyStreaming ? <AssistantAdjustMenu /> : null}
        {!message.streaming && (
          <Tooltip>
            <TooltipTrigger render={<p className="text-muted-foreground text-xs tabular-nums" />}>
              {formatDayAwareTimestamp(message.updatedAt, ctx.timestampFormat)}
            </TooltipTrigger>
            <TooltipPopup>
              {formatChatTimestampTooltip(message.updatedAt, ctx.timestampFormat)}
            </TooltipPopup>
          </Tooltip>
        )}
      </div>
    </div>
  );
}

function AssistantCopyButton({
  message,
  showCopyButton,
  streaming,
  threadId,
}: {
  message: ChatMessage;
  showCopyButton: boolean;
  streaming: boolean;
  threadId: string | undefined;
}) {
  const assistantCopyState = resolveAssistantMessageCopyState({
    text: message.text ?? null,
    showCopyButton,
    streaming,
  });

  if (!assistantCopyState.visible) {
    return null;
  }

  return (
    <>
      <MessageCopyButton text={assistantCopyState.text ?? ""} variant="ghost" />
      <MessageCaptureButton text={assistantCopyState.text ?? ""} threadId={threadId} />
    </>
  );
}

export function ProposedPlanTimelineRow({
  row,
}: {
  row: Extract<TimelineRow, { kind: "proposed-plan" }>;
}) {
  const ctx = use(TimelineRowCtx);

  return (
    <div className="min-w-0 px-1 py-0.5">
      <ProposedPlanCard
        planMarkdown={row.proposedPlan.planMarkdown}
        environmentId={ctx.activeThreadEnvironmentId}
        threadRef={ctx.threadRef ?? undefined}
        cwd={ctx.markdownCwd}
        workspaceRoot={ctx.workspaceRoot}
        findActive={ctx.findActive}
      />
    </div>
  );
}

export function HtmlRenderTimelineRow({
  row,
}: {
  row: Extract<TimelineRow, { kind: "html-render" }>;
}) {
  const ctx = use(TimelineRowCtx);

  return (
    <div className="min-w-0 px-1">
      <HtmlRenderFrame
        // A recycled row must not keep another page's frozen frame.
        key={row.htmlRender.attachmentId}
        environmentId={ctx.activeThreadEnvironmentId}
        htmlRender={row.htmlRender}
        onOpen={ctx.onFileOpen}
      />
    </div>
  );
}

export function McpAppTimelineRow({ row }: { row: Extract<TimelineRow, { kind: "mcp-app" }> }) {
  const ctx = use(TimelineRowCtx);
  const { awaitingUser } = use(TimelineRowActivityCtx);

  return (
    <div className="min-w-0 px-1">
      <McpAppFrame
        // A recycled row must not keep another app's live document.
        key={row.mcpApp.attachmentId}
        environmentId={ctx.activeThreadEnvironmentId}
        threadId={row.sourceThreadId}
        conversationThreadId={ctx.threadRef?.threadId ?? row.sourceThreadId}
        itemId={row.itemId}
        revision={row.revision}
        app={row.mcpApp}
        onSendMessage={ctx.onSendAppMessage}
        awaitingUser={awaitingUser}
        onFullscreenChange={(fullscreen) => ctx.onAppFullscreenChange(row.id, fullscreen)}
      />
    </div>
  );
}

/** Subscribes directly to the UI state store for expand/collapse state,
 *  so toggling re-renders only this component — not the entire list. */
const AssistantChangedFilesSection = memo(function AssistantChangedFilesSection({
  turnSummary,
  routeThreadKey,
  resolvedTheme,
  onOpenTurnDiff,
}: {
  turnSummary: TurnDiffSummary | undefined;
  routeThreadKey: string;
  resolvedTheme: "light" | "dark";
  displayThreadKey?: string;
  onOpenTurnDiff: (runId: RunId, filePath?: string) => void;
}) {
  if (!turnSummary) return null;
  const checkpointFiles = turnSummary.files;
  if (checkpointFiles.length === 0) return null;

  return (
    <AssistantChangedFilesSectionInner
      turnSummary={turnSummary}
      checkpointFiles={checkpointFiles}
      routeThreadKey={routeThreadKey}
      resolvedTheme={resolvedTheme}
      onOpenTurnDiff={onOpenTurnDiff}
    />
  );
});

/** Inner component that only mounts when there are actual changed files,
 *  so the store subscription is unconditional (no hooks after early return). */
function AssistantChangedFilesSectionInner({
  turnSummary,
  checkpointFiles,
  routeThreadKey,
  resolvedTheme,
  onOpenTurnDiff,
}: {
  turnSummary: TurnDiffSummary;
  checkpointFiles: TurnDiffSummary["files"];
  routeThreadKey: string;
  resolvedTheme: "light" | "dark";
  displayThreadKey?: string;
  onOpenTurnDiff: (runId: RunId, filePath?: string) => void;
}) {
  const ctx = use(TimelineRowCtx);
  const persistedExpanded = useUiStateStore(
    (store) => store.threadChangedFilesExpandedById[routeThreadKey]?.[turnSummary.runId],
  );
  const setExpanded = useUiStateStore((store) => store.setThreadChangedFilesExpanded);
  const allDirectoriesExpanded = persistedExpanded ?? false;

  const thread = useThreadShell(ctx.threadRef);
  const activeProject = useProject(
    thread && thread.projectId
      ? { environmentId: thread.environmentId, projectId: thread.projectId }
      : null,
  );
  const onFileContextMenu = useFileContextMenuHandler(ctx.activeThreadEnvironmentId);

  return (
    <ChangedFilesCard
      runId={turnSummary.runId}
      files={checkpointFiles}
      allDirectoriesExpanded={allDirectoriesExpanded}
      resolvedTheme={resolvedTheme}
      onToggleAllDirectories={() =>
        setExpanded(routeThreadKey, turnSummary.runId, !allDirectoriesExpanded)
      }
      onOpenTurnDiff={(runId, filePath) =>
        onOpenTurnDiff((filePath && turnSummary.fileRunIds?.[filePath]) || runId, filePath)
      }
      onFileContextMenu={(filePath, event) =>
        onFileContextMenu(
          {
            environmentId: ctx.activeThreadEnvironmentId,
            filePath,
            workspaceRoot: ctx.workspaceRoot,
            repositoryRoot:
              thread?.worktreePath == null
                ? activeProject?.repositoryIdentity?.rootPath
                : undefined,
          },
          event,
        )
      }
    />
  );
}
