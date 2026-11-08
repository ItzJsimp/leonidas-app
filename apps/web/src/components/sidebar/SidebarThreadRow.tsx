import { type SidebarThreadSummary } from "../../types";
import {
  threadActivityTimestamp,
  formatWorkingDurationLabel,
  resolveSidebarThreadStatus,
  threadUsageLines,
  type SidebarDropVerb,
  useSidebarRowSubscriptionLease,
  resolveThreadLastVisitedAt,
  useRetainedValue,
  hasUnseenCompletion,
  shouldRecedeSidebarThread,
  sidebarThreadNeedsUser,
  resolveSidebarRowAccessibility,
  resolveReplyStatusMark,
  resolveWorkingStartedAt,
  sidebarWorkerRollup,
  useSidebarCacheWarmth,
} from "../Sidebar.logic";
import { formatRelativeTimeLabel, parseTimestampDate } from "../../timestampFormat";
import { resolveSettledThreadTimestamp } from "@t3tools/client-runtime/state/thread-sort";
import {
  useState,
  useMemo,
  memo,
  type MouseEvent as ReactMouseEvent,
  useEffect,
  useRef,
  useCallback,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useVisibleInterval } from "~/hooks/useVisibleInterval";
import { type ProviderInstanceEntry, shouldShowInstanceBadge } from "../../providerInstances";
import { resolveThreadProviderStack } from "@t3tools/client-runtime/state/models";
import { ProviderInstanceIcon } from "../chat/ProviderInstanceIcon";
import { type ProjectFaviconProject, ProjectFavicon } from "../ProjectFavicon";
import {
  type EnvironmentMachineKind,
  type EnvironmentId,
  type ScopedThreadRef,
  AuthOrchestrationOperateScope,
} from "@t3tools/contracts";
import {
  type TerminalStatusIndicator,
  ThreadPullRequestsMiniList,
  type ThreadChangeRequestSnapshot,
  terminalStatusFromRunningIds,
  useLinkedThreadPullRequest,
  prStatusIndicator,
  resolveThreadPullRequestBadge,
  ThreadPullRequestBadgeControl,
  synchronizeTerminalPulse,
  ThreadWorktreeIndicator,
} from "../ThreadStatusIndicators";
import { threadActivityLine } from "@t3tools/shared/threadIdentity";
import { useSupportsMultiplePullRequests } from "~/hooks/useSupportsMultiplePullRequests";
import { ThreadHoverCardPopup, ThreadHoverCard } from "../ThreadHoverCard";
import { EnvironmentMachineIcon } from "../EnvironmentMachineIcon";
import {
  GitBranchIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CircleAlertIcon,
  ArrowRightLeftIcon,
  TerminalIcon,
  ClockIcon,
  CheckIcon,
  Undo2Icon,
  ArchiveIcon,
  SquarePenIcon,
  PinIcon,
  PinOffIcon,
  AlarmClockIcon,
  AlarmClockOffIcon,
  CircleDashedIcon,
  MessageCircleQuestionIcon,
  ShieldQuestionIcon,
  CircleCheckIcon,
  XIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { MiddleTruncate } from "../ui/middle-truncate";
import { cn } from "~/lib/utils";
import { type SnoozePreset, resolveSnoozePresets, pickSnoozePreset } from "../Sidebar.snooze";
import { type TimestampFormat } from "@t3tools/contracts/settings";
import { Menu, MenuTrigger, MenuPopup, MenuItem, MenuShortcut, MenuSeparator } from "../ui/menu";
import { Tooltip, TooltipTrigger, TooltipPopup } from "../ui/tooltip";
import { requestCustomSnooze } from "../CustomSnoozeDialog";
import { type SidebarSweepAction, type SortableThreadRowBag } from "./SidebarListMarkers";
import { type EnvironmentProject } from "@t3tools/client-runtime/state/shell";
import { scopeThreadRef, scopedThreadKey } from "@t3tools/client-runtime/environment";
import { useEnvironmentScope, readEnvironmentScope } from "../../state/session";
import { toastManager } from "../ui/toast";
import { useUiStateStore } from "../../uiStateStore";
import { useThreadSelectionStore } from "../../threadSelectionStore";
import { useOpenPrLink } from "../../lib/openPullRequestLink";
import { useThreadRunningTerminalIds } from "../../state/terminalSessions";
import { useThreadHasUnsentDraft } from "../../composerDraftStore";
import { discardComposerDraft } from "../../lib/discardComposerDraft";
import { useEnvironmentQuery } from "../../state/query";
import { vcsEnvironment } from "../../state/vcs";
import { resolveThreadCurrentPullRequestLink } from "@t3tools/shared/threadPullRequests";
import { resolveLocalCheckoutBranchMismatch } from "../BranchToolbar.logic";
import { getTriggerDisplayModelLabel } from "../chat/providerIconUtils";
import { useRowTouchGestures } from "../Sidebar.touch";
import { makeWorkspaceFileDropHandlers } from "../chat/workspaceFileDrop";
import { canSnooze } from "@t3tools/client-runtime/state/thread-settled";
import { draftSurfaceClassName, dropVerbBadge, draftPenClassName } from "./SidebarDraftBlock";
import { CSS } from "@dnd-kit/utilities";
import { useRightPanelStore } from "../../rightPanelStore";
import { InlineButton } from "../ui/button";
import { formatDiffCount } from "@t3tools/client-runtime/diff-count";

function compactSidebarTimeLabel(label: string): string {
  if (label === "just now") return "now";
  return label.endsWith(" ago") ? label.slice(0, -4) : label;
}

export function threadTimeLabel(thread: SidebarThreadSummary): string {
  const timestamp = threadActivityTimestamp(thread);
  return compactSidebarTimeLabel(formatRelativeTimeLabel(timestamp));
}

// Settled rows read "how long ago did this wrap up", matching their sort
// key: both go through resolveSettledThreadTimestamp so label and order can't
// disagree.
function settledTimeLabel(thread: SidebarThreadSummary): string {
  const timestamp = resolveSettledThreadTimestamp(thread);
  return timestamp === null ? "" : compactSidebarTimeLabel(formatRelativeTimeLabel(timestamp));
}

// Floats at the row's right edge, vertically centered, while the jump
// modifier is held. An overlay pill instead of an inline slot: the hint
// must neither displace the status/time label (holding ⌘ used to blank
// out "Working") nor shift any layout when it appears. pointer-events-none
// so it never swallows clicks meant for the settle/un-settle buttons it
// can overlap.
function JumpHintBadge(props: { label: string }) {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute right-1.5 top-1/2 z-10 inline-flex h-5 -translate-y-1/2 items-center rounded-full border border-border/80 bg-background/95 px-1.5 font-mono text-3xs font-medium tracking-tight text-foreground shadow-sm"
    >
      {props.label}
    </span>
  );
}

// Self-ticking so only this span re-renders each second, not the whole row.
function WorkingDuration(props: { startedAt: string | null }) {
  const startedMs = props.startedAt !== null ? Date.parse(props.startedAt) : Number.NaN;
  const [, setTick] = useState(0);
  useVisibleInterval(() => setTick((tick) => tick + 1), 1_000, !Number.isNaN(startedMs));
  if (Number.isNaN(startedMs)) return null;
  return <span className="tabular-nums">{formatWorkingDurationLabel(Date.now() - startedMs)}</span>;
}

function terminalProcessLabel(count: number): string {
  return `${count} terminal ${count === 1 ? "process" : "processes"} running`;
}

function SidebarProviderStack(props: {
  thread: SidebarThreadSummary;
  providerEntryByInstanceId: ReadonlyMap<string, ProviderInstanceEntry>;
}) {
  const stack = resolveThreadProviderStack(props.thread);
  const currentInstanceId = stack[stack.length - 1]!;
  const currentEntry = props.providerEntryByInstanceId.get(currentInstanceId) ?? null;
  if (currentEntry === null) return null;
  const showInstanceBadge = shouldShowInstanceBadge(
    currentEntry,
    props.providerEntryByInstanceId.values(),
  );
  const current = (
    <ProviderInstanceIcon
      driverKind={currentEntry.driverKind}
      displayName={currentEntry.displayName}
      accentColor={currentEntry.accentColor}
      acpRegistryAgentId={currentEntry.acpRegistryAgentId}
      acpRegistryIconUrl={currentEntry.acpRegistryIconUrl}
      showBadge={showInstanceBadge}
      // Glyph dims, badge stays saturated; offset matches the composer trigger.
      iconClassName="size-3.5 opacity-60"
      badgeClassName="right-[-0.1875rem] bottom-[-0.1875rem] h-3 min-w-3 px-0.5 text-5xs"
    />
  );
  if (stack.length === 1) {
    return <span className="inline-flex shrink-0 items-center">{current}</span>;
  }
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5">
      {stack.slice(0, -1).map((instanceId) => {
        const entry = props.providerEntryByInstanceId.get(instanceId);
        if (entry === undefined) return null;
        return (
          <ProviderInstanceIcon
            key={instanceId}
            driverKind={entry.driverKind}
            displayName={entry.displayName}
            acpRegistryAgentId={entry.acpRegistryAgentId}
            acpRegistryIconUrl={entry.acpRegistryIconUrl}
            iconClassName="size-3 opacity-35 grayscale"
          />
        );
      })}
      <span className="relative z-10 inline-flex items-center">{current}</span>
    </span>
  );
}

export function SidebarThreadTooltip({
  thread,
  project,
  projectDisplayName,
  environmentLabel,
  environmentMachine,
  providerEntry,
  providerEntryByInstanceId,
  showInstanceBadge,
  modelInstanceId,
  modelLabel,
  branchMismatch,
  terminalStatus,
  terminalProcessCount,
}: {
  thread: SidebarThreadSummary;
  project: ProjectFaviconProject | null;
  projectDisplayName: string | null;
  environmentLabel: string | null;
  environmentMachine: EnvironmentMachineKind;
  providerEntry: ProviderInstanceEntry | null;
  providerEntryByInstanceId: ReadonlyMap<string, ProviderInstanceEntry>;
  showInstanceBadge: boolean;
  modelInstanceId: string;
  modelLabel: string;
  branchMismatch: {
    threadBranch: string;
    currentBranch: string;
  } | null;
  terminalStatus: TerminalStatusIndicator | null;
  terminalProcessCount: number;
}) {
  const driverKind = providerEntry?.driverKind ?? null;
  const activityLine = threadActivityLine({
    status: resolveSidebarThreadStatus(thread),
    summary: thread.activitySummary,
  });
  const previousProviderNames = thread.providerInstanceHistory
    .filter((instanceId) => instanceId !== modelInstanceId)
    .map((instanceId) => providerEntryByInstanceId.get(instanceId)?.displayName ?? instanceId);
  const supportsMultiplePullRequests = useSupportsMultiplePullRequests(thread.environmentId);
  return (
    <ThreadHoverCardPopup side="right" align="start" sideOffset={4}>
      <ThreadHoverCard
        title={thread.title}
        footer={
          supportsMultiplePullRequests && thread.pullRequests.length > 0 ? (
            <div className="border-t border-border/60 pt-2 pl-0.5 text-xs text-muted-foreground">
              <ThreadPullRequestsMiniList pullRequests={thread.pullRequests} />
            </div>
          ) : null
        }
      >
        {activityLine ? (
          <div className="min-w-0 text-xs text-muted-foreground [overflow-wrap:anywhere]">
            {activityLine.text}
            {activityLine.progress
              ? ` · Step ${activityLine.progress} (${thread.activitySummary?.completedSteps ?? 0} completed)`
              : ""}
          </div>
        ) : null}
        {projectDisplayName ? (
          <div className="flex min-w-0 items-center gap-2">
            {project ? <ProjectFavicon project={project} className="size-3 shrink-0" /> : null}
            <div className="min-w-0 truncate text-foreground/75">{projectDisplayName}</div>
          </div>
        ) : null}
        {environmentLabel ? (
          <div className="flex min-w-0 items-center gap-2">
            <EnvironmentMachineIcon
              kind={environmentMachine}
              className="size-3 shrink-0 stroke-muted-foreground"
            />
            <div className="min-w-0 truncate text-foreground/75">{environmentLabel}</div>
          </div>
        ) : null}
        {thread.branch ? (
          <div className="flex min-w-0 items-center gap-2">
            <GitBranchIcon className="size-3 shrink-0 stroke-muted-foreground" />
            <MiddleTruncate value={thread.branch} className="flex" />
          </div>
        ) : null}
        {branchMismatch ? (
          <div className="flex min-w-0 items-start gap-2 text-warning">
            <CircleAlertIcon aria-hidden className="mt-0.5 size-3 shrink-0 stroke-current" />
            <div className="min-w-0 flex-1 wrap-break-word leading-5">
              You're currently checked out on another branch.
            </div>
          </div>
        ) : null}
        {driverKind ? (
          <div className="flex min-w-0 items-center gap-2">
            <ProviderInstanceIcon
              driverKind={driverKind}
              displayName={
                providerEntry?.displayName ?? thread.runtime?.providerName ?? modelInstanceId
              }
              accentColor={providerEntry?.accentColor}
              acpRegistryAgentId={providerEntry?.acpRegistryAgentId}
              acpRegistryIconUrl={providerEntry?.acpRegistryIconUrl}
              // Initials would swallow a size-3 glyph: accent dot, name in label.
              showBadge={showInstanceBadge && providerEntry?.accentColor !== undefined}
              badgeContent="none"
              badgeClassName="h-2 min-w-2 px-0"
              iconClassName="size-3 shrink-0 grayscale opacity-60"
            />
            <div className="min-w-0 truncate text-foreground/75">
              {showInstanceBadge && providerEntry
                ? `${modelLabel} · ${providerEntry.displayName}`
                : modelLabel}
            </div>
          </div>
        ) : null}
        {previousProviderNames.length > 0 ? (
          <div className="flex min-w-0 items-center gap-2">
            <ArrowRightLeftIcon className="size-3 shrink-0 stroke-muted-foreground" />
            <div className="min-w-0 truncate text-foreground/75">
              Handed off from {previousProviderNames.join(", ")}
            </div>
          </div>
        ) : null}
        {threadUsageLines(thread.contextUsage).map((line) => (
          <div key={line} className="min-w-0 truncate pl-5 text-foreground/75">
            {line}
          </div>
        ))}
        {terminalStatus ? (
          <div className="flex min-w-0 items-center gap-2">
            <TerminalIcon
              aria-hidden
              className={cn("size-3 shrink-0", terminalStatus.colorClass)}
            />
            <div className="min-w-0 truncate text-foreground/75">
              {terminalProcessLabel(terminalProcessCount)}
            </div>
          </div>
        ) : null}
        {thread.runtime?.lastError ? (
          <div
            className={cn(
              "flex min-w-0 items-center gap-2",
              thread.runtime.lastErrorClass === "usage_limit" ? "text-warning" : "text-error",
            )}
          >
            <CircleAlertIcon className="size-3 shrink-0 stroke-current" />
            <div className="min-w-0 truncate">
              {thread.runtime.lastErrorClass === "usage_limit"
                ? "Usage limit reached"
                : "Error occurred"}
            </div>
          </div>
        ) : null}
      </ThreadHoverCard>
    </ThreadHoverCardPopup>
  );
}

/**
 * Hover entry point for snooze: a clock button opening the preset menu.
 * Controlled by the row (which also uses the open state to pin its hover
 * actions while the menu is up).
 */
function SnoozeMenuButton(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSnooze: (preset: Pick<SnoozePreset, "snoozedUntil">) => void;
  timestampFormat: TimestampFormat;
  environmentId: EnvironmentId;
}) {
  const { open, onOpenChange, onSnooze, timestampFormat, environmentId } = props;
  // Presets resolve at open time so "In 1 hour" is relative to the click,
  // not to when the row mounted.
  const presets = useMemo(
    () => (open ? resolveSnoozePresets(new Date(), timestampFormat, environmentId) : []),
    [open, timestampFormat, environmentId],
  );
  return (
    <Menu open={open} onOpenChange={onOpenChange}>
      <Tooltip>
        <TooltipTrigger
          render={
            <MenuTrigger
              render={
                <button
                  type="button"
                  aria-label="Snooze chat"
                  onClick={(event) => event.stopPropagation()}
                  onDoubleClick={(event) => event.stopPropagation()}
                  className="inline-flex h-full cursor-pointer items-center gap-0.5 rounded-md bg-transparent px-1.5 text-xs text-muted-foreground hover:text-foreground"
                />
              }
            />
          }
        >
          <ClockIcon className="size-3" />
        </TooltipTrigger>
        <TooltipPopup>Snooze chat</TooltipPopup>
      </Tooltip>
      <MenuPopup side="bottom" align="end">
        {presets.map((preset) => (
          <MenuItem
            key={preset.id}
            onClick={(event) => {
              event.stopPropagation();
              const picked = pickSnoozePreset(presets, preset.id, timestampFormat, environmentId);
              if (picked) onSnooze(picked);
            }}
          >
            {preset.label}
            <MenuShortcut>{preset.whenLabel}</MenuShortcut>
          </MenuItem>
        ))}
        {presets.length > 0 ? <MenuSeparator /> : null}
        <MenuItem
          onClick={async (event) => {
            event.stopPropagation();
            const choice = await requestCustomSnooze();
            if (choice) onSnooze(choice);
          }}
        >
          Custom…
        </MenuItem>
      </MenuPopup>
    </Menu>
  );
}

// Unsent work shares one look: the new-thread draft rows and thread rows
// with unsent composer text both use this tint and pen so they read alike.
/** The old emoji slot: a green check when the last reply is Done, an amber dot for Need you. */
export function ReplyStatusMark({ mark }: { mark: "done" | "need-you" | null }) {
  if (mark === null) return null;
  return mark === "done" ? (
    <CheckIcon aria-label="Done" role="img" className="mr-1.5 inline size-3 text-success" />
  ) : (
    <span
      aria-label="Needs you"
      role="img"
      className="mr-1.5 inline-block size-1.5 rounded-full bg-warning align-middle"
    />
  );
}

export const SidebarThreadRow = memo(function SidebarThreadRow(props: {
  thread: SidebarThreadSummary;
  variant: "card" | "slim";
  // Settled rows un-settle, snoozed rows wake, and cards settle.
  variantAction: SidebarSweepAction;
  // False on environments whose server predates thread.settle/unsettle:
  // the lifecycle affordances hide entirely rather than fail on click.
  settlementSupported: boolean;
  // Same contract for thread.snooze/unsnooze.
  snoozeSupported: boolean;
  // Renders the pin glyph. Pinned cards keep the full settle/snooze quick
  // actions: settling clears the pin server-side, and snoozing hides the
  // card until wake with the pin intact underneath. The glyph is also the
  // in-row pin state cue (the pinned block has no header), so it always
  // shows while pinned; it only becomes a clickable unpin quick-action once
  // the pinning capability is confirmed, and stays a passive marker while
  // the descriptor is not loaded. Pinning itself lives in the context menu.
  pinningSupported: boolean;
  isPinned: boolean;
  // Present on rows whose server supports every drop outcome: dnd-kit
  // sortable bag applied to the row root so the whole row drags (the
  // pointer sensor's distance constraint keeps plain clicks working).
  sortable?: SortableThreadRowBag | undefined;
  dropVerb: SidebarDropVerb | null;
  // While dragging, the pin marker stays only for a pinned thread still over
  // the pinned section. Any other position shows the verb badge instead, and
  // the badge carries its own icon.
  dragOverPinned: boolean;
  // The action this row will take when the sweep is released.
  sweepAction: SidebarSweepAction | null;
  // Compact wake countdown ("2h") for rows in the snoozed shelf.
  snoozeWakeLabelText: string | null;
  // When a snooze ended (timer or early wake); drives the Woke pill until
  // the user visits the thread.
  wokeAt: string | null;
  isActive: boolean;
  openPullRequestsInRightPanel: boolean;
  jumpLabel: string | null;
  currentEnvironmentId: string | null;
  environmentLabel: string | null;
  environmentMachine: EnvironmentMachineKind;
  scratchMachineLabel: string | null;
  project: EnvironmentProject | null;
  projectDisplayName: string | null;
  /** False hides the second line that says why a chat is in its state. */
  showActivityLine?: boolean;
  /** Worker chats that belong to this chat, for the rollup line. */
  workers?: readonly SidebarThreadSummary[] | undefined;
  providerEntryByInstanceId: ReadonlyMap<string, ProviderInstanceEntry>;
  timestampFormat: TimestampFormat;
  onThreadClick: (event: ReactMouseEvent, threadRef: ScopedThreadRef) => void;
  onThreadActivate: (threadRef: ScopedThreadRef) => void;
  onStartRename: (threadRef: ScopedThreadRef, title: string) => void;
  onRenameTitleChange: (title: string) => void;
  onCommitRename: (threadRef: ScopedThreadRef, title: string, originalTitle: string) => void;
  onCancelRename: () => void;
  isRenaming: boolean;
  renamingTitle: string;
  onContextMenu: (threadRef: ScopedThreadRef, position: { x: number; y: number }) => void;
  onSettle: (threadRef: ScopedThreadRef) => void;
  onActionSweepStart: (
    threadRef: ScopedThreadRef,
    action: SidebarSweepAction,
    event: PointerEvent,
  ) => void;
  onUnsettle: (threadRef: ScopedThreadRef) => void;
  onSnooze: (threadRef: ScopedThreadRef, preset: Pick<SnoozePreset, "snoozedUntil">) => void;
  onUnsnooze: (threadRef: ScopedThreadRef) => void;
  onUnpin: (threadRef: ScopedThreadRef) => void;
  onAcknowledgeWoke: (threadRef: ScopedThreadRef, visitedAt: string) => void;
  onFileDropThreads?: ((threadRef: ScopedThreadRef, files: File[]) => void) | undefined;
  changeRequestSnapshot: ThreadChangeRequestSnapshot | null;
  onChangeRequestSnapshot: (
    threadKey: string,
    snapshot: ThreadChangeRequestSnapshot | null,
  ) => void;
}) {
  const {
    isRenaming,
    changeRequestSnapshot,
    onChangeRequestSnapshot,
    onCancelRename,
    onCommitRename,
    onContextMenu,
    onAcknowledgeWoke,
    onFileDropThreads,
    onRenameTitleChange,
    onSettle,
    onActionSweepStart,
    onSnooze,
    onStartRename,
    onThreadActivate,
    onThreadClick,
    onUnsettle,
    onUnsnooze,
    onUnpin,
    openPullRequestsInRightPanel,
    renamingTitle,
    thread,
    variant,
    variantAction,
  } = props;
  const threadRef = useMemo(
    () => scopeThreadRef(thread.environmentId, thread.id),
    [thread.environmentId, thread.id],
  );
  const threadKey = scopedThreadKey(threadRef);
  const canOperateThread = useEnvironmentScope(thread.environmentId, AuthOrchestrationOperateScope);
  useEffect(() => {
    if (!canOperateThread && isRenaming) onCancelRename();
  }, [canOperateThread, isRenaming, onCancelRename]);
  const { leaseLiveStatus, rowRef } = useSidebarRowSubscriptionLease(props.isActive);
  const isRegeneratingTitle = thread.titleRegeneration != null;
  const titleBeforeRegeneration = useRef<string | null>(null);
  useEffect(() => {
    if (isRegeneratingTitle) {
      titleBeforeRegeneration.current ??= thread.title;
      return;
    }
    const before = titleBeforeRegeneration.current;
    titleBeforeRegeneration.current = null;
    // A new title lands in the same update that clears the marker, so equal titles mean no change.
    if (before !== null && before === thread.title) {
      toastManager.add({
        type: "info",
        title: "Title unchanged",
        description: "The current title still fits this thread.",
      });
    }
  }, [isRegeneratingTitle, thread.title]);
  const localLastVisitedAt = useUiStateStore((state) => state.threadLastVisitedAtById[threadKey]);
  const lastVisitedAt = resolveThreadLastVisitedAt(thread.lastVisitedAt, localLastVisitedAt);
  const isSelected = useThreadSelectionStore((state) => state.selectedThreadKeys.has(threadKey));
  const openPrLink = useOpenPrLink();
  const runningTerminalIds = useThreadRunningTerminalIds({
    environmentId: thread.environmentId,
    threadId: thread.id,
  });
  const terminalStatus = terminalStatusFromRunningIds(runningTerminalIds);
  const terminalProcessCount = runningTerminalIds.length;
  // Unsent composer text on this thread. The open thread shows its own
  // composer, so the marker only decorates rows you have navigated away from.
  const hasUnsentDraft = useThreadHasUnsentDraft(threadRef) && !props.isActive;
  const handleDiscardDraftClick = useCallback(
    (event: ReactMouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      discardComposerDraft(threadRef);
    },
    [threadRef],
  );

  const gitCwd = thread.worktreePath ?? props.project?.workspaceRoot ?? null;
  const linkedPullRequestStatus = useLinkedThreadPullRequest(
    thread.environmentId,
    thread.linkedPullRequest,
    leaseLiveStatus,
    thread.pullRequests,
    thread.branchPullRequest,
  );
  const gitStatus = useEnvironmentQuery(
    leaseLiveStatus && (thread.branch != null || thread.worktreePath !== null) && gitCwd !== null
      ? vcsEnvironment.status({
          environmentId: thread.environmentId,
          input: { cwd: gitCwd, includeRemote: false },
        })
      : null,
  );
  const visibleGitStatus = useRetainedValue(
    JSON.stringify([thread.environmentId, gitCwd]),
    gitStatus.data,
  );
  const pr = linkedPullRequestStatus?.pr ?? null;
  const supportsMultiplePullRequests = useSupportsMultiplePullRequests(thread.environmentId);
  const currentLinkedPr = supportsMultiplePullRequests
    ? resolveThreadCurrentPullRequestLink(thread.pullRequests)
    : null;

  // Same semantics as the legacy sidebar (never-visited counts as read):
  // switching sidebars must not light up every historical thread as unread.
  const isUnread = hasUnseenCompletion({ ...thread, lastVisitedAt });
  const status = resolveSidebarThreadStatus(thread);
  const activityLine = threadActivityLine({ status, summary: thread.activitySummary });
  // The line can be hidden from view; screen readers still hear it.
  const visibleActivityLine = props.showActivityLine === false ? null : activityLine;
  const warmth = useSidebarCacheWarmth(thread.contextUsage);
  const rollup = sidebarWorkerRollup(props.workers, isUnread);
  const [workersOpen, setWorkersOpen] = useState(false);
  const isInFlight =
    status === "working" || status === "waiting" || status === "approval" || status === "input";
  // A woken thread reappears at its original position (the sort is
  // deliberately static), so the pill has to carry the weight. Snoozing is
  // an explicit act, so the pill clears only when the user re-engages:
  // reading a completion-triggered wake, clicking the pill, sending a
  // message, settling, archiving, or a change request state that settles the
  // thread. Timer wakes survive a mere visit. An unparseable visit timestamp
  // counts as never-visited, so corrupt local data cannot eat the wake signal.
  const lastVisitedDate = lastVisitedAt === undefined ? null : parseTimestampDate(lastVisitedAt);
  const wokeAtDate = props.wokeAt === null ? null : parseTimestampDate(props.wokeAt);
  const isWoke =
    wokeAtDate !== null &&
    (lastVisitedDate === null || lastVisitedDate < wokeAtDate) &&
    thread.settledOverride !== "settled";
  // Background work always recedes when it is not selected: an unread parent
  // completion must not pull a still-working thread back into the foreground.
  // Ready and action-required rows keep their unread and wake prominence.
  const shouldRecede = shouldRecedeSidebarThread({
    status,
    isUnread,
    isWoke,
    isActive: props.isActive,
    isSelected,
  });
  // Status hues follow the system-wide convention set by sidebar v1 and the
  // mobile Live Activity/widgets (amber approval, indigo input, sky working)
  // so a thread reads the same color everywhere it surfaces.
  const topStatus =
    status === "working"
      ? {
          // A native /goal keeps the agent going across turns until it is met.
          label: thread.goal?.status === "active" ? "Goal" : "Working",
          icon: "working" as const,
          // No shimmer: a label that animates forever is noise in a sidebar
          // full of them (and repaints every vsync on high-refresh displays).
          className: "text-info-foreground",
        }
      : status === "waiting"
        ? {
            // Waiting is calm background presence (post-settle background
            // roster), not active progress, so the label keeps full strength.
            label: "Waiting",
            icon: null,
            className: "text-muted-foreground",
          }
        : status === "approval"
          ? {
              label: "Needs permission",
              icon: "approval" as const,
              className: "text-warning-foreground",
            }
          : status === "input"
            ? {
                label: "Input",
                icon: "input" as const,
                className: "text-indigo-600 dark:text-indigo-300",
              }
            : status === "limited"
              ? {
                  label: "Limited",
                  icon: "failed" as const,
                  className: "text-warning-foreground",
                }
              : status === "failed"
                ? {
                    label: "Failed",
                    icon: "failed" as const,
                    className: "text-error-foreground",
                  }
                : isWoke
                  ? {
                      label: "Woke",
                      icon: "woke" as const,
                      className: "text-warning-foreground",
                    }
                  : isUnread
                    ? {
                        label: "Done",
                        icon: "done" as const,
                        className: "text-success-foreground",
                      }
                    : // Seen completions keep a quiet Done, so a finished chat
                      // never reads like one that has not started.
                      thread.latestRun?.completedAt
                      ? {
                          label: "Done",
                          icon: "done" as const,
                          className: "text-muted-foreground",
                        }
                      : null;
  const needsUserRailClassName = !sidebarThreadNeedsUser(status)
    ? null
    : status === "failed"
      ? "before:bg-error"
      : status === "input"
        ? "before:bg-input-status"
        : "before:bg-warning";
  const isWokeStatus = topStatus?.icon === "woke";

  const branchMismatch = resolveLocalCheckoutBranchMismatch({
    effectiveEnvMode: thread.worktreePath === null ? "local" : "worktree",
    activeWorktreePath: thread.worktreePath,
    activeThreadBranch: thread.branch,
    currentGitBranch: visibleGitStatus?.refName ?? null,
  });
  const prStatus = prStatusIndicator(pr, linkedPullRequestStatus?.sourceControlProvider);

  const modelInstanceId = thread.runtime?.providerInstanceId ?? thread.modelSelection.instanceId;
  const providerEntry = props.providerEntryByInstanceId.get(modelInstanceId) ?? null;
  const showInstanceBadge =
    providerEntry !== null &&
    shouldShowInstanceBadge(providerEntry, props.providerEntryByInstanceId.values());
  const selectedModel = providerEntry?.models.find(
    (model) => model.slug === thread.modelSelection.model,
  );
  const modelLabel = selectedModel
    ? getTriggerDisplayModelLabel(selectedModel)
    : thread.modelSelection.model;

  // The local environment is "this machine" and needs no marker; every other
  // one gets its machine glyph. With no local environment (the hosted app)
  // that is every thread, which is the point: the glyph is what tells rows on
  // different machines apart.
  const isRemote = thread.environmentId !== props.currentEnvironmentId;
  const showsScratchMachine = !thread.branch && props.scratchMachineLabel !== null;

  const detailsTooltip = (
    <SidebarThreadTooltip
      thread={thread}
      project={props.project}
      projectDisplayName={props.projectDisplayName}
      environmentLabel={props.environmentLabel}
      environmentMachine={props.environmentMachine}
      providerEntry={providerEntry}
      providerEntryByInstanceId={props.providerEntryByInstanceId}
      showInstanceBadge={showInstanceBadge}
      modelInstanceId={modelInstanceId}
      modelLabel={modelLabel}
      branchMismatch={branchMismatch}
      terminalStatus={terminalStatus}
      terminalProcessCount={terminalProcessCount}
    />
  );

  // Touch has no hover or right click: a long press opens the row menu and a
  // left swipe archives (or unarchives) the chat.
  const rowElementRef = useRef<HTMLElement | null>(null);
  const setRowElement = useCallback(
    (node: HTMLElement | null) => {
      rowElementRef.current = node;
      rowRef(node);
    },
    [rowRef],
  );
  const swipeRevealRef = useRef<HTMLDivElement>(null);
  const touch = useRowTouchGestures({
    rowRef: rowElementRef,
    revealRef: swipeRevealRef,
    canSwipe: canOperateThread && props.settlementSupported && variantAction !== "unsnooze",
    onLongPress: (point) => onContextMenu(threadRef, point),
    onSwipeCommit: () =>
      variantAction === "unsettle" ? onUnsettle(threadRef) : onSettle(threadRef),
  });
  const swipeReveal = (
    <div
      ref={swipeRevealRef}
      aria-hidden
      className="pointer-events-none absolute inset-0 hidden items-center justify-end gap-1.5 rounded-md bg-primary/15 px-4 text-sm font-medium text-foreground"
    >
      {variantAction === "unsettle" ? (
        <Undo2Icon className="size-4" />
      ) : (
        <ArchiveIcon className="size-4" />
      )}
      {variantAction === "unsettle" ? "Unarchive" : "Archive"}
    </div>
  );

  const handleClick = useCallback(
    (event: ReactMouseEvent) => {
      onThreadClick(event, threadRef);
    },
    [onThreadClick, threadRef],
  );
  const handleAcknowledgeWokeClick = useCallback(
    (event: ReactMouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (props.wokeAt === null) return;
      onAcknowledgeWoke(threadRef, props.wokeAt);
    },
    [onAcknowledgeWoke, props.wokeAt, threadRef],
  );
  const handleContextMenu = useCallback(
    (event: ReactMouseEvent) => {
      event.preventDefault();
      // Android fires this for the long press the touch gesture already handled.
      if (touch.gesture.openedMenuWithin(1000)) return;
      onContextMenu(threadRef, { x: event.clientX, y: event.clientY });
    },
    [onContextMenu, threadRef, touch.gesture],
  );
  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent) => {
      if (event.target !== event.currentTarget) return;
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      onThreadActivate(threadRef);
    },
    [onThreadActivate, threadRef],
  );
  const handleDoubleClick = useCallback(
    (event: ReactMouseEvent) => {
      if (
        !readEnvironmentScope(threadRef.environmentId, AuthOrchestrationOperateScope) ||
        isRenaming ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }
      if ((event.target as HTMLElement).closest("button, a, input")) return;
      event.preventDefault();
      onStartRename(threadRef, thread.title);
    },
    [isRenaming, onStartRename, thread.title, threadRef],
  );
  const [isFileDragOver, setIsFileDragOver] = useState(false);
  const fileDropHandlers = useMemo(
    () =>
      onFileDropThreads
        ? makeWorkspaceFileDropHandlers({
            setDragActive: setIsFileDragOver,
            addFiles: (files) => {
              onFileDropThreads(threadRef, files);
            },
            addFolders: () => {},
          })
        : null,
    [onFileDropThreads, threadRef],
  );
  useEffect(() => {
    if (!isFileDragOver) return;
    const clearFileDrag = () => setIsFileDragOver(false);
    window.addEventListener("dragend", clearFileDrag);
    return () => window.removeEventListener("dragend", clearFileDrag);
  }, [isFileDragOver]);
  const renameCommittedRef = useRef(false);
  useEffect(() => {
    if (isRenaming) renameCommittedRef.current = false;
  }, [isRenaming]);
  const handleRenameKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLInputElement>) => {
      event.stopPropagation();
      if (event.nativeEvent.isComposing || event.keyCode === 229) return;
      if (event.key === "Enter") {
        event.preventDefault();
        renameCommittedRef.current = true;
        onCommitRename(threadRef, renamingTitle, thread.title);
      } else if (event.key === "Escape") {
        event.preventDefault();
        renameCommittedRef.current = true;
        onCancelRename();
      }
    },
    [onCancelRename, onCommitRename, renamingTitle, thread.title, threadRef],
  );
  const handleRenameBlur = useCallback(() => {
    if (!renameCommittedRef.current) {
      onCommitRename(threadRef, renamingTitle, thread.title);
    }
  }, [onCommitRename, renamingTitle, thread.title, threadRef]);
  const handleSettleClick = useCallback(
    (event: ReactMouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      onSettle(threadRef);
    },
    [onSettle, threadRef],
  );
  const handleActionPointerDown = useCallback(
    (event: ReactPointerEvent) => {
      if (!event.isPrimary || event.button !== 0) return;
      // Action buttons sweep their section rather than picking up the row.
      event.stopPropagation();
      onActionSweepStart(threadRef, variantAction, event.nativeEvent);
    },
    [onActionSweepStart, threadRef, variantAction],
  );
  const handleUnsettleClick = useCallback(
    (event: ReactMouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      onUnsettle(threadRef);
    },
    [onUnsettle, threadRef],
  );
  const handleUnsnoozeClick = useCallback(
    (event: ReactMouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      onUnsnooze(threadRef);
    },
    [onUnsnooze, threadRef],
  );
  const handleUnpinClick = useCallback(
    (event: ReactMouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      onUnpin(threadRef);
    },
    [onUnpin, threadRef],
  );
  const handleSnoozePreset = useCallback(
    (preset: Pick<SnoozePreset, "snoozedUntil">) => {
      onSnooze(threadRef, preset);
    },
    [onSnooze, threadRef],
  );
  // While the snooze popover is open the pointer leaves the row, which
  // would fade the hover actions out from under the open menu. Pin them and
  // suppress the row tooltip so its portal cannot overlap the popover.
  const [snoozeMenuOpenRaw, setSnoozeMenuOpen] = useState(false);
  // Snooze is offered only where it can succeed: capability-gated and never
  // on blocked-on-you work or queued turns (the server rejects both).
  const showSnoozeButton =
    canOperateThread &&
    props.snoozeSupported &&
    canSnooze(thread, { now: new Date().toISOString() });
  const showHoverActions =
    (canOperateThread && props.settlementSupported) || showSnoozeButton || hasUnsentDraft;
  // If the thread becomes blocked while the popover is open, the button
  // unmounts without firing onOpenChange(false). Deriving the flag keeps a
  // stale true from permanently hiding the status label / pinning the
  // hover actions, and the effect clears the raw state so the popover
  // doesn't resurrect if the button later remounts.
  const snoozeMenuOpen = snoozeMenuOpenRaw && showSnoozeButton;
  useEffect(() => {
    if (!showSnoozeButton) setSnoozeMenuOpen(false);
  }, [showSnoozeButton]);
  const handlePrClick = useCallback(
    (event: ReactMouseEvent<HTMLElement>, targetUrl?: string) => {
      const url = targetUrl ?? pr?.url ?? currentLinkedPr?.url;
      if (!url) return;
      const showInRightPanel = targetUrl !== undefined || openPullRequestsInRightPanel;
      const openedInRightPanel = openPrLink(event, url, showInRightPanel ? threadRef : undefined);
      if (openedInRightPanel && showInRightPanel && !props.isActive) {
        onThreadActivate(threadRef);
      }
    },
    [
      onThreadActivate,
      openPrLink,
      openPullRequestsInRightPanel,
      pr,
      currentLinkedPr,
      props.isActive,
      threadRef,
    ],
  );

  // All sidebar rows share one surface model. Live threads used to look
  // like elevated cards while settled threads were plain rows, leaving neither
  // a useful hierarchy nor a reliable hover cue. Status now lives in the row
  // content; surface is reserved for interaction (hover, multi-select, route).
  const rowSurfaceClassName = cn(
    "group/sidebar-row relative w-full cursor-pointer overflow-hidden rounded-md text-left outline-none select-none touch-pan-y focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
    variantAction === "unsettle" &&
      !props.isActive &&
      "[&:not(:hover):not(:focus-within)_*]:text-secondary-label",
    props.isActive
      ? "bg-sidebar-row-active text-sidebar-foreground light:ring-1 light:ring-inset light:ring-sidebar-border/70"
      : isSelected || props.sweepAction !== null
        ? "bg-sidebar-row-selected text-sidebar-foreground light:ring-1 light:ring-inset light:ring-sidebar-border/70"
        : hasUnsentDraft
          ? cn(draftSurfaceClassName, "text-sidebar-foreground")
          : shouldRecede
            ? "text-sidebar-muted-foreground/75 hover:bg-sidebar-row-hover hover:text-sidebar-foreground"
            : "bg-transparent text-sidebar-foreground hover:bg-sidebar-row-hover",
    // Background work fades as a whole row, status label included, so it
    // takes less attention than rows that need a human (input, approval).
    shouldRecede &&
      status === "working" &&
      "opacity-70 transition-opacity hover:opacity-100 focus-within:opacity-100 motion-reduce:transition-none",
    // A colored edge marks rows waiting on the user, in their status hue.
    needsUserRailClassName &&
      cn(
        "before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:rounded-full",
        needsUserRailClassName,
      ),
    isFileDragOver && "ring-1 ring-inset ring-primary/70",
    isFileDragOver && !props.isActive && !isSelected && "bg-sidebar-row-hover",
    // The lifted row is an opaque card so the rows beneath it never show
    // through. The row tint is translucent in dark themes and the pointer
    // keeps the hover color applied, so both the tint and the solid sidebar
    // color are stacked as background images.
    props.sortable?.isDragging &&
      "bg-sidebar bg-linear-to-b from-sidebar-row-active to-sidebar-row-active text-sidebar-foreground opacity-100 shadow-lg",
  );
  // dnd-kit props for the row root. Same bag on both variants: every row in
  // the list translates around the gap as the drag passes it.
  const sortable = props.sortable;
  const sortableRootProps = sortable
    ? {
        ref: sortable.setNodeRef,
        style: {
          transform: CSS.Translate.toString(sortable.transform),
          transition: sortable.transition,
          // A zero-height boundary also makes dnd-kit scale the source to
          // zero. Only projected peers use scaleY as a visibility sentinel.
          visibility:
            !sortable.isDragging && sortable.transform?.scaleY === 0
              ? ("hidden" as const)
              : undefined,
        },
        ...sortable.listeners,
      }
    : {};
  // Sweeps reuse the corresponding row-drop action badge.
  const destinationVerb = sortable?.isDragging
    ? props.dropVerb
    : props.sweepAction === "unsnooze"
      ? "wake"
      : props.sweepAction;
  const dragDestination =
    destinationVerb !== null ? (
      <span
        role="status"
        className="pointer-events-none ml-auto inline-flex h-5 shrink-0 items-center gap-1 rounded-sm border border-primary/40 bg-primary/10 px-1.5 text-2xs font-medium text-primary"
      >
        {dropVerbBadge[destinationVerb]}
      </span>
    ) : null;

  const accessibility = resolveSidebarRowAccessibility({
    title: thread.title,
    statusLabel: topStatus?.label ?? null,
    projectDisplayName: props.projectDisplayName,
    isActive: props.isActive,
  });

  const title =
    isRenaming && canOperateThread ? (
      <input
        autoFocus
        value={renamingTitle}
        aria-label="Chat title"
        onChange={(event) => onRenameTitleChange(event.target.value)}
        onFocus={(event) => event.currentTarget.select()}
        onKeyDown={handleRenameKeyDown}
        onBlur={handleRenameBlur}
        onClick={(event) => event.stopPropagation()}
        onDoubleClick={(event) => event.stopPropagation()}
        className="min-w-0 flex-1 rounded-sm border border-input bg-card px-1 text-sm font-medium text-card-foreground outline-none focus:border-foreground"
      />
    ) : (
      <span
        aria-hidden
        className={cn(
          "min-w-0 flex-1 text-sm transition-opacity motion-reduce:transition-none",
          shouldRecede ? "font-normal" : "font-medium",
          variant === "card"
            ? cn(
                "truncate",
                shouldRecede
                  ? "text-foreground/75 group-hover/sidebar-row:text-foreground group-focus-visible/sidebar-row:text-foreground"
                  : status === "failed" && !isUnread && !isWoke
                    ? "text-foreground/95"
                    : "text-foreground",
              )
            : cn(
                "truncate group-focus-within/sidebar-row:text-foreground group-hover/sidebar-row:text-foreground",
                shouldRecede
                  ? "text-secondary-label"
                  : props.isActive || isWoke || status === "input"
                    ? "text-foreground"
                    : isUnread
                      ? "text-muted-foreground"
                      : "text-secondary-label/70",
              ),
          isRegeneratingTitle && "opacity-55",
        )}
      >
        <ReplyStatusMark mark={resolveReplyStatusMark(status, thread.lastReplyStatus)} />
        {thread.title}
      </span>
    );
  const accessibleTitle = isRenaming ? null : <span className="sr-only">{thread.title}</span>;

  // Stacks show their layer count; multiple unrelated links show their total count.
  // Either opens the thread's pull requests tab; a single PR link opens that PR and still
  // supports opening the host in a new tab.
  const prBadgeShape = supportsMultiplePullRequests
    ? resolveThreadPullRequestBadge(thread.pullRequests)
    : null;
  const handlePrListClick = useCallback(() => {
    useRightPanelStore.getState().open(threadRef, "pull-requests");
    if (!props.isActive) onThreadActivate(threadRef);
  }, [onThreadActivate, props.isActive, threadRef]);
  const prBadge =
    prBadgeShape?.kind === "stack" || pr || currentLinkedPr ? (
      <ThreadPullRequestBadgeControl
        render={<InlineButton />}
        badge={prBadgeShape}
        pullRequests={thread.pullRequests}
        number={pr?.number ?? currentLinkedPr?.number}
        url={pr?.url ?? currentLinkedPr?.url}
        status={prStatus}
        onOpenList={handlePrListClick}
        onOpenPullRequest={handlePrClick}
      />
    ) : null;
  const terminalStatusIcon = terminalStatus ? (
    <span
      role="img"
      aria-label={terminalProcessLabel(terminalProcessCount)}
      data-testid={`sidebar-terminal-status-${thread.id}`}
      className={cn("inline-flex shrink-0 items-center justify-center", terminalStatus.colorClass)}
    >
      <TerminalIcon
        className={cn("size-3.5", terminalStatus.pulse && "motion-safe:animate-status-pulse")}
        onAnimationStart={synchronizeTerminalPulse}
      />
    </span>
  ) : null;
  // Same pen the new-thread draft rows lead with, so both kinds of unsent
  // work read the same way in the list.
  const draftIndicator = hasUnsentDraft ? (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            role="img"
            aria-label="Unsent draft"
            data-testid={`sidebar-draft-indicator-${thread.id}`}
            className="inline-flex shrink-0 items-center"
          />
        }
      >
        <SquarePenIcon aria-hidden className={draftPenClassName} />
      </TooltipTrigger>
      <TooltipPopup side="top">Unsent draft</TooltipPopup>
    </Tooltip>
  ) : null;
  const showPin =
    props.isPinned && (!sortable?.isDragging || (props.dragOverPinned && props.dropVerb === null));
  const pinIndicator = showPin ? (
    props.pinningSupported && canOperateThread && !sortable?.isDragging ? (
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              aria-label="Unpin chat"
              onClick={handleUnpinClick}
              className="group/unpin inline-flex cursor-pointer items-center rounded-sm text-muted-foreground/65 outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            />
          }
        >
          {/* Pin marks the pinned state at rest; hover and focus swap in pin-off so the
              icon reads as the action the button performs. */}
          <PinIcon
            aria-hidden
            className="size-3 shrink-0 group-hover/unpin:hidden group-focus-visible/unpin:hidden"
          />
          <PinOffIcon
            aria-hidden
            className="hidden size-3 shrink-0 group-hover/unpin:block group-focus-visible/unpin:block"
          />
        </TooltipTrigger>
        <TooltipPopup>Unpin chat</TooltipPopup>
      </Tooltip>
    ) : (
      <PinIcon
        aria-label="Pinned"
        role="img"
        className="size-3 shrink-0 text-muted-foreground/65"
      />
    )
  ) : null;

  if (variant === "slim") {
    return (
      <li
        data-thread-item={threadKey}
        {...sortableRootProps}
        {...(fileDropHandlers ?? {})}
        className={cn(
          // Matches the h-9 row so unrendered rows never shift the list when they paint.
          "relative list-none [content-visibility:auto] [contain-intrinsic-size:auto_36px]",
          sortable?.isDragging && "z-20",
        )}
      >
        {swipeReveal}
        <Tooltip disabled={sortable?.isDragging}>
          <TooltipTrigger
            render={
              <div
                ref={setRowElement}
                role="button"
                tabIndex={0}
                aria-label={
                  activityLine
                    ? `${accessibility.label}. ${activityLine.text}${activityLine.progress ? `, step ${activityLine.progress}` : ""}`
                    : accessibility.label
                }
                aria-current={accessibility.current}
                data-testid="sidebar-row-slim"
                aria-busy={isRegeneratingTitle || undefined}
                className={cn(rowSurfaceClassName, "flex h-9 items-center gap-2.5 px-2.5")}
                {...touch.handlers}
                onClick={handleClick}
                onDoubleClick={handleDoubleClick}
                onKeyDown={handleKeyDown}
                onContextMenu={handleContextMenu}
              />
            }
          >
            {accessibleTitle}
            {/* Settled history recedes: dimmed favicon at rest, restored on
              hover so the tail stays scannable when you're hunting. */}
            <span
              className={cn(
                "flex shrink-0 items-center transition-opacity",
                (!props.isActive || variantAction === "unsettle") &&
                  "opacity-40 grayscale group-focus-within/sidebar-row:opacity-100 group-focus-within/sidebar-row:grayscale-0 group-hover/sidebar-row:opacity-100 group-hover/sidebar-row:grayscale-0",
              )}
            >
              {props.project ? <ProjectFavicon project={props.project} className="size-4" /> : null}
            </span>
            {draftIndicator}
            {title}
            {pinIndicator}
            {terminalStatusIcon}
            {isRegeneratingTitle ? (
              <span role="status" className="sr-only">
                Regenerating title
              </span>
            ) : null}
            {/* Shelf rows are one line, so the title takes the room a PR number would. */}
            {sortable?.isDragging ? (
              dragDestination
            ) : (
              <span
                className={cn(
                  "relative ml-auto flex h-6 min-w-8 shrink-0 items-center justify-end",
                  props.sweepAction !== null && "hidden",
                )}
              >
                <span
                  className={cn(
                    "inline-flex justify-end tabular-nums text-secondary-label transition-opacity",
                    !isWoke && "group-any-hover/sidebar-row:opacity-0",
                  )}
                >
                  {variantAction === "unsnooze" && props.snoozeWakeLabelText !== null ? (
                    // Snoozed rows show when they come BACK, not when they were
                    // last touched — the return ticket is the row's whole story.
                    <span className="inline-flex items-center gap-1 text-xs text-info-foreground tabular-nums">
                      {/* The clock tells a wake time from an age at a glance. */}
                      <AlarmClockIcon aria-hidden className="size-3" />
                      {props.snoozeWakeLabelText}
                    </span>
                  ) : isWoke ? (
                    // A wake can land straight in the settled tail (e.g. PR
                    // merged while snoozed); the signal must survive the trip.
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <button
                            type="button"
                            aria-label="Dismiss Woke notification"
                            onClick={handleAcknowledgeWokeClick}
                            className="inline-flex cursor-pointer items-center gap-1 rounded-sm text-xs font-medium text-warning-foreground outline-none hover:underline focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                          >
                            <AlarmClockIcon aria-hidden className="size-3" />
                            <span role="status">Woke</span>
                          </button>
                        }
                      />
                      <TooltipPopup side="top">Dismiss Woke notification</TooltipPopup>
                    </Tooltip>
                  ) : variantAction !== "unsettle" && topStatus && topStatus.icon !== "done" ? (
                    <span className={cn("text-xs font-medium", topStatus.className)}>
                      {topStatus.label}
                    </span>
                  ) : (
                    <span data-row-part="time" className="text-xs">
                      {variantAction === "unsettle"
                        ? settledTimeLabel(thread)
                        : threadTimeLabel(thread)}
                    </span>
                  )}
                </span>
                {variantAction === "unsnooze" ? (
                  !props.snoozeSupported ? null : (
                    <button
                      type="button"
                      aria-label="Bring chat back now"
                      onClick={handleUnsnoozeClick}
                      onPointerDown={handleActionPointerDown}
                      className={cn(
                        "pointer-events-none absolute inset-y-0 right-0 -mr-1 inline-flex cursor-pointer items-center gap-1 rounded-md bg-transparent px-1.5 text-xs text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:pointer-events-auto focus-visible:opacity-100 group-any-hover/sidebar-row:pointer-events-auto group-any-hover/sidebar-row:opacity-100",
                        isWoke && "group-any-hover/sidebar-row:static",
                      )}
                    >
                      <AlarmClockOffIcon className="mb-px size-3" />
                    </button>
                  )
                ) : !props.settlementSupported ? null : variantAction === "unsettle" ? (
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <button
                          type="button"
                          aria-label="Unarchive chat"
                          onClick={handleUnsettleClick}
                          onPointerDown={handleActionPointerDown}
                          className={cn(
                            "pointer-events-none absolute inset-y-0 right-0 -mr-1 inline-flex cursor-pointer items-center gap-1 rounded-md bg-transparent px-1.5 text-xs text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:pointer-events-auto focus-visible:opacity-100 group-any-hover/sidebar-row:pointer-events-auto group-any-hover/sidebar-row:opacity-100",
                            isWoke && "group-any-hover/sidebar-row:static",
                          )}
                        />
                      }
                    >
                      <Undo2Icon className="mb-px size-3.5" />
                    </TooltipTrigger>
                    <TooltipPopup side="top">Unarchive chat</TooltipPopup>
                  </Tooltip>
                ) : (
                  <button
                    type="button"
                    aria-label="Archive chat"
                    onClick={handleSettleClick}
                    onPointerDown={handleActionPointerDown}
                    className={cn(
                      "pointer-events-none absolute inset-y-0 right-0 inline-flex cursor-pointer items-center gap-1 rounded-md bg-transparent px-2 text-xs text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:pointer-events-auto focus-visible:opacity-100 group-any-hover/sidebar-row:pointer-events-auto group-any-hover/sidebar-row:opacity-100",
                      isWoke && "group-any-hover/sidebar-row:static",
                    )}
                  >
                    <CheckIcon className="size-3" />
                  </button>
                )}
              </span>
            )}
            {props.sweepAction !== null ? dragDestination : null}
            {props.jumpLabel ? <JumpHintBadge label={props.jumpLabel} /> : null}
          </TooltipTrigger>
          {detailsTooltip}
        </Tooltip>
      </li>
    );
  }

  const diff = latestRunDiff(thread);
  // Only the provider icon would remain, so the row drops the line instead of leaving it blank.
  const metaLineEmpty =
    !props.projectDisplayName &&
    !thread.branch &&
    !showsScratchMachine &&
    prBadge === null &&
    diff === null &&
    !isRemote &&
    runningTerminalIds.length === 0;

  return (
    <li
      data-thread-item={threadKey}
      {...sortableRootProps}
      {...(fileDropHandlers ?? {})}
      className={cn(
        "relative list-none py-0.5 [content-visibility:auto]",
        visibleActivityLine
          ? "[contain-intrinsic-size:auto_88px]"
          : metaLineEmpty
            ? "[contain-intrinsic-size:auto_44px]"
            : "[contain-intrinsic-size:auto_60px]",
        sortable?.isDragging && "z-20",
      )}
    >
      {swipeReveal}
      <Tooltip disabled={snoozeMenuOpen || sortable?.isDragging}>
        <TooltipTrigger
          render={
            <div
              ref={setRowElement}
              role="button"
              tabIndex={0}
              aria-label={
                activityLine
                  ? `${accessibility.label}. ${activityLine.text}${activityLine.progress ? `, step ${activityLine.progress}` : ""}`
                  : accessibility.label
              }
              aria-current={accessibility.current}
              data-testid="sidebar-row-card"
              aria-busy={isRegeneratingTitle || undefined}
              className={rowSurfaceClassName}
              {...touch.handlers}
              onClick={handleClick}
              onDoubleClick={handleDoubleClick}
              onKeyDown={handleKeyDown}
              onContextMenu={handleContextMenu}
            />
          }
        >
          {accessibleTitle}
          <div
            className={cn(
              "relative z-10 px-(--sidebar-row-content-inset) py-(--sidebar-content-inset)",
              metaLineEmpty
                ? "h-auto"
                : visibleActivityLine || rollup
                  ? "min-h-[5.5rem]"
                  : "min-h-[3.75rem]",
            )}
          >
            {warmth ? (
              <span
                aria-hidden
                data-row-part="cache-bar"
                className="absolute bottom-2.5 left-1 top-2.5 w-[3px] overflow-hidden rounded-full bg-sidebar-border"
              >
                <span
                  className={cn(
                    "absolute inset-x-0 bottom-0",
                    warmth.low ? "bg-warning" : "bg-state",
                  )}
                  style={{ height: `${Math.round(warmth.fraction * 100)}%` }}
                />
              </span>
            ) : null}
            <div className="flex h-5 min-w-0 items-center gap-1.5">
              {draftIndicator}
              {rollup ? (
                <button
                  type="button"
                  aria-label={workersOpen ? "Hide workers" : "Show workers"}
                  aria-expanded={workersOpen}
                  onClick={(event) => {
                    event.stopPropagation();
                    setWorkersOpen((open) => !open);
                  }}
                  onDoubleClick={(event) => event.stopPropagation()}
                  className="inline-flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-sm text-muted-foreground hover:text-foreground"
                >
                  {workersOpen ? (
                    <ChevronDownIcon aria-hidden className="size-3.5" />
                  ) : (
                    <ChevronRightIcon aria-hidden className="size-3.5" />
                  )}
                </button>
              ) : null}
              {title}
              {pinIndicator}
              {/* The visible state owns this slot's width: status at rest,
                  actions on hover/keyboard focus or while the popover is open. Keeping
                  the hidden state out of flow lets the project label reclaim
                  space without either state overlapping it. */}
              {sortable?.isDragging ? (
                dragDestination
              ) : (
                <span
                  className={cn(
                    "group/sidebar-status-slot relative ml-auto flex h-5 min-w-8 shrink-0 items-stretch justify-end text-xs",
                    props.sweepAction !== null && "hidden",
                  )}
                >
                  {/* Read-only status labels yield to the hover actions. Woke is
                    itself an action, so it stays pointer-enabled and visible
                    while the other controls appear beside it. */}
                  <span
                    className={cn(
                      isWokeStatus
                        ? "pointer-events-auto"
                        : "pointer-events-none group-has-[:focus-visible]/sidebar-status-slot:absolute group-has-[:focus-visible]/sidebar-status-slot:right-0 group-has-[:focus-visible]/sidebar-status-slot:opacity-0 group-any-hover/sidebar-row:absolute group-any-hover/sidebar-row:right-0 group-any-hover/sidebar-row:opacity-0",
                      "flex items-center self-center justify-self-end tabular-nums text-secondary-label",
                      snoozeMenuOpen && "pointer-events-none absolute right-0 opacity-0",
                    )}
                  >
                    {topStatus ? (
                      isWokeStatus ? (
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <button
                                type="button"
                                aria-label="Dismiss Woke notification"
                                onClick={handleAcknowledgeWokeClick}
                                className={cn(
                                  "inline-flex cursor-pointer items-center gap-1 rounded-sm font-medium outline-none hover:underline focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                                  topStatus.className,
                                )}
                              >
                                <AlarmClockIcon aria-hidden className="size-4 shrink-0" />
                                <span role="status">{topStatus.label}</span>
                              </button>
                            }
                          />
                          <TooltipPopup side="top">Dismiss Woke notification</TooltipPopup>
                        </Tooltip>
                      ) : (
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 font-medium",
                            topStatus.className,
                          )}
                        >
                          {topStatus.icon === "working" ? (
                            <CircleDashedIcon aria-hidden className="size-4 shrink-0" />
                          ) : topStatus.icon === "input" ? (
                            <MessageCircleQuestionIcon aria-hidden className="size-4 shrink-0" />
                          ) : topStatus.icon === "approval" ? (
                            <ShieldQuestionIcon aria-hidden className="size-4 shrink-0" />
                          ) : topStatus.icon === "failed" ? (
                            <CircleAlertIcon aria-hidden className="size-4 shrink-0" />
                          ) : topStatus.icon === "done" ? (
                            <CircleCheckIcon aria-hidden className="size-4 shrink-0" />
                          ) : null}
                          {/* The label alone is the live region: a role="status"
                            wrapper around the ticking duration would make
                            screen readers announce every second. */}
                          <span role="status">{topStatus.label}</span>
                          {status === "working" ? (
                            <span aria-hidden>
                              <WorkingDuration startedAt={resolveWorkingStartedAt(thread)} />
                            </span>
                          ) : null}
                        </span>
                      )
                    ) : (
                      <span data-row-part="time" className="text-2xs">
                        {threadTimeLabel(thread)}
                      </span>
                    )}
                  </span>
                  {props.settlementSupported || showSnoozeButton || hasUnsentDraft ? (
                    <span
                      className={cn(
                        // focus-visible, not focus-within: a mouse click leaves
                        // the Settle button focused, and a plain focus-within
                        // would keep the controls pinned over the status label
                        // once the pointer moves away (e.g. after a failed
                        // settle) instead of cross-fading back.
                        "pointer-events-none absolute inset-y-0 right-0 flex items-stretch opacity-0 has-[:focus-visible]:pointer-events-auto has-[:focus-visible]:static has-[:focus-visible]:opacity-100 group-any-hover/sidebar-row:pointer-events-auto group-any-hover/sidebar-row:static group-any-hover/sidebar-row:opacity-100",
                        snoozeMenuOpen && "pointer-events-auto static opacity-100",
                      )}
                    >
                      {hasUnsentDraft ? (
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <button
                                type="button"
                                aria-label="Discard draft"
                                onClick={handleDiscardDraftClick}
                                className="inline-flex cursor-pointer items-center rounded-md bg-transparent px-1.5 text-xs text-muted-foreground hover:text-foreground"
                              />
                            }
                          >
                            <XIcon className="size-3.5" />
                          </TooltipTrigger>
                          <TooltipPopup side="top">Discard draft</TooltipPopup>
                        </Tooltip>
                      ) : null}
                      {showSnoozeButton ? (
                        <SnoozeMenuButton
                          open={snoozeMenuOpen}
                          onOpenChange={setSnoozeMenuOpen}
                          onSnooze={handleSnoozePreset}
                          timestampFormat={props.timestampFormat}
                          environmentId={thread.environmentId}
                        />
                      ) : null}
                      {props.settlementSupported ? (
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <button
                                type="button"
                                aria-label="Archive chat"
                                onClick={handleSettleClick}
                                onPointerDown={handleActionPointerDown}
                                className="-mr-1 inline-flex cursor-pointer items-center gap-1 rounded-md bg-transparent px-1.5 text-xs text-muted-foreground hover:text-foreground"
                              />
                            }
                          >
                            <ArchiveIcon className="size-3.5" />
                            Archive
                          </TooltipTrigger>
                          <TooltipPopup>Archive chat</TooltipPopup>
                        </Tooltip>
                      ) : null}
                    </span>
                  ) : null}
                </span>
              )}
              {/* A sweep hides the slot rather than unmounting it, so the
                  pressed action button stays connected and a cancelled sweep's
                  release click still fires and is consumed. */}
              {props.sweepAction !== null ? dragDestination : null}
            </div>
            {isRegeneratingTitle || metaLineEmpty ? (
              <div className="flex min-w-0 items-baseline">
                {isRegeneratingTitle ? (
                  <span role="status" className="sr-only">
                    Regenerating title
                  </span>
                ) : null}
                {metaLineEmpty ? (
                  <span aria-hidden className="ml-auto inline-flex shrink-0 self-center pl-1.5">
                    <SidebarProviderStack
                      thread={thread}
                      providerEntryByInstanceId={props.providerEntryByInstanceId}
                    />
                  </span>
                ) : null}
              </div>
            ) : null}
            {rollup ? (
              <div className="mt-0.5" data-row-part="workers">
                <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                  <span className="min-w-0 flex-1 truncate">
                    {rollup.items.length} {rollup.items.length === 1 ? "worker" : "workers"}
                    {rollup.running > 0
                      ? ` · ${rollup.done} done · ${rollup.running} running`
                      : ` finished${rollup.failed ? ` · ${rollup.failed} failed` : ""} · open to review`}
                  </span>
                  <span aria-hidden className="flex shrink-0 gap-0.5">
                    {rollup.items.slice(0, 6).map((item) => (
                      <span
                        key={item.id}
                        className={cn(
                          "h-1 w-3 rounded-full",
                          item.state === "running"
                            ? "bg-state"
                            : item.state === "failed"
                              ? "bg-error"
                              : "bg-muted-foreground",
                        )}
                      />
                    ))}
                  </span>
                </div>
                {workersOpen ? (
                  <ul aria-label="Workers" className="ml-2 mt-1 border-l border-border pl-3">
                    {rollup.items.map((item) => (
                      <li key={item.id} className="flex h-6 min-w-0 items-center gap-2 text-xs">
                        <span className="min-w-0 flex-1 truncate text-foreground">
                          {item.title}
                        </span>
                        <span
                          className={cn(
                            "shrink-0 text-2xs",
                            item.state === "running"
                              ? "font-medium text-state-text"
                              : item.state === "failed"
                                ? "text-error-foreground"
                                : "text-muted-foreground",
                          )}
                        >
                          {item.state === "running"
                            ? "Running"
                            : item.state === "failed"
                              ? "Failed"
                              : "Done"}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : visibleActivityLine ? (
              <div className="mt-1 flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                <span className="min-w-0 flex-1 truncate">{visibleActivityLine.text}</span>
                {visibleActivityLine.progress ? (
                  <span
                    className="shrink-0 tabular-nums text-info-foreground"
                    aria-label={`Step ${visibleActivityLine.progress}`}
                  >
                    {visibleActivityLine.progress}
                  </span>
                ) : null}
              </div>
            ) : null}
            <div
              className={cn(
                "mt-0.5 flex min-w-0 items-center gap-1.5 text-secondary-label text-xs",
                metaLineEmpty && "hidden",
              )}
            >
              {props.project ? (
                <ProjectFavicon project={props.project} className="size-4 shrink-0" />
              ) : null}
              {props.projectDisplayName ? (
                <span
                  className={cn(
                    "min-w-0 max-w-[28%] truncate",
                    shouldRecede ? "font-normal" : "font-medium",
                  )}
                >
                  {props.projectDisplayName}
                </span>
              ) : null}
              {props.projectDisplayName && (thread.branch || showsScratchMachine) ? (
                <span aria-hidden className="text-muted-foreground">
                  ·
                </span>
              ) : null}
              {/* The branch remains independent of the live plan step. */}
              {thread.branch ? (
                <>
                  <ThreadWorktreeIndicator thread={thread} />
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <span
                          className={cn(
                            "flex min-w-16 flex-1 items-center gap-1",
                            branchMismatch ? "text-warning-foreground" : "text-muted-foreground",
                          )}
                        />
                      }
                    >
                      <GitBranchIcon aria-hidden className="size-3 shrink-0" />
                      <MiddleTruncate value={thread.branch} showTitle={false} />
                      {branchMismatch ? (
                        <TriangleAlertIcon
                          aria-label="The main folder is on another branch"
                          className="size-3 shrink-0"
                        />
                      ) : null}
                    </TooltipTrigger>
                    <TooltipPopup side="top">
                      {branchMismatch
                        ? `Chat branch: ${thread.branch}. The main folder is on: ${visibleGitStatus?.refName}. Chats in the main folder share it.`
                        : `${thread.worktreePath ? "Separate copy" : "Main folder"}: ${thread.branch}`}
                    </TooltipPopup>
                  </Tooltip>
                </>
              ) : showsScratchMachine ? (
                <>
                  <EnvironmentMachineIcon
                    aria-hidden
                    kind={props.environmentMachine}
                    className="size-3 shrink-0"
                  />
                  <span className="min-w-0 flex-1 truncate">{props.scratchMachineLabel}</span>
                </>
              ) : (
                <span className="flex-1" />
              )}
              {terminalStatusIcon}
              {prBadge}
              {diff ? (
                <span className="shrink-0 font-mono">
                  <span className="text-diff-addition-foreground">
                    +{formatDiffCount(diff.insertions)}
                  </span>{" "}
                  <span className="text-diff-deletion-foreground">
                    −{formatDiffCount(diff.deletions)}
                  </span>
                </span>
              ) : null}
              {warmth ? (
                <span
                  data-row-part="cache-label"
                  className={cn(
                    "shrink-0 text-2xs tabular-nums",
                    warmth.low ? "font-medium text-warning-foreground" : "text-muted-foreground",
                  )}
                >
                  {warmth.label}
                </span>
              ) : null}
              <span
                aria-hidden
                className="pointer-events-none ml-auto inline-flex shrink-0 items-center gap-1"
              >
                {isRemote && !showsScratchMachine ? (
                  <span className="inline-flex shrink-0 items-center text-sidebar-muted-foreground/70">
                    <EnvironmentMachineIcon
                      aria-hidden
                      kind={props.environmentMachine}
                      className="size-3.5"
                    />
                  </span>
                ) : null}
                <SidebarProviderStack
                  thread={thread}
                  providerEntryByInstanceId={props.providerEntryByInstanceId}
                />
              </span>
            </div>
          </div>
          {props.jumpLabel ? <JumpHintBadge label={props.jumpLabel} /> : null}
        </TooltipTrigger>
        {detailsTooltip}
      </Tooltip>
    </li>
  );
});

function latestRunDiff(
  thread: SidebarThreadSummary,
): { insertions: number; deletions: number } | null {
  // Shells don't carry checkpoint summaries; diff stats render only when the
  // shell projection grows them. Kept as a seam so the row layout is ready.
  void thread;
  return null;
}
