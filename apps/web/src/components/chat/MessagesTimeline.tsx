import { AudioPreviewUnmountContext } from "../files/AudioPreview";

import { useStableHandoffRuns, type TimelineRun } from "./useStableHandoffRuns";
import { ThreadFindTimelineContext } from "./ThreadFindProvider";

import { MarkdownFindContext } from "./markdownFindContext";

import { useChatCanvas } from "./ChatCanvasContext";
import { WorkLogBlock } from "./WorkLog";

import type { WorktreeSetupSnapshot } from "@t3tools/contracts";

import { deriveTimelineMinimapItems } from "./timelineMinimapItems";
import {
  type AssistantCitation,
  type EnvironmentId,
  type MessageId,
  type OrchestrationV2TurnItem,
  type RunAttemptId,
  type ServerProvider,
  type ServerProviderSkill,
  type RunId,
  ThreadId,
} from "@t3tools/contracts";
import { parseScopedThreadKey } from "@t3tools/client-runtime/environment";

import { resolveWorkGroupScrollAnchor } from "@t3tools/client-runtime/work-log/scroll-anchor";

import { observeResize } from "~/lib/observeResize";

const NOOP_USE_ARTIFACT_TEMPLATE = () => {};
const NOOP_OPEN_ATTACHMENT = (_attachment: ChatFileAttachment) => {};

import { resolveChatListAnchoredEndSpace } from "@t3tools/shared/chatList";

import { observeVisibleAnimation } from "../../lib/visibleAnimation";
import {
  memo,
  use,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type SyntheticEvent,
} from "react";
import {
  LegendList,
  type LegendListRef,
  type MaintainScrollAtEndOptions,
} from "@legendapp/list/react";

import { type TimelineEntry } from "../../session-logic";
import type { CodexArtifactTemplate } from "@t3tools/shared/codexArtifactTemplates";
import { type ChatFileAttachment, type TurnDiffSummary } from "../../types";

import { BotIcon, Minimize2Icon } from "lucide-react";
import { ChevronDown, ChevronRight } from "lucide";

import { MorphIcon } from "~/components/MorphIcon";

import { ExpandedImagePreview } from "./ExpandedImagePreview";

import {
  CHAT_TIMELINE_ANCHOR_OFFSET,
  readTimelinePosition,
  rememberTimelinePosition,
  timelineContentOverflowsViewport,
} from "./timelineScrollAnchoring";

import { AssistantSelectionToolbar } from "./AssistantSelectionToolbar";
import type { AssistantCitationSourceAnchor } from "~/lib/assistantTextSelection";
import { type AssistantCitationRequest } from "./AssistantCitationSource";
import { useAssistantCitationTarget, type CitationHistoryPage } from "./useAssistantCitationTarget";
import {
  deriveMessagesTimelineRowsWithState,
  type MessagesTimelineRowsProjection,
  resolveTimelineIsAtEnd,
  resolveTimelineMinimapHasPersistentGutter,
  resolveTimelineMinimapCurrentIndex,
  resolveTimelineMinimapHitStripWidth,
  timelineTurnFoldRunIdsByEntryId,
  resolveTimelineReveal,
  timelineEntryTurnFoldRunId,
  worktreeSetupAgentStarted,
  type MessagesTimelineRow,
  type TimelineLatestRun,
} from "./MessagesTimeline.logic";
import { type ThreadFindMatch } from "./threadFind";
import { useThreadFindNavigation } from "./useThreadFindNavigation";
import { readThreadFindPosition } from "./threadFindPosition";
import type { ThreadFindPositionReader } from "./threadFind";

import { TooltipScrollDismissArea } from "../ui/tooltip";
import { WorktreeSetupCard } from "./WorktreeSetupCard";

import { useOpenPrLink } from "~/lib/openPullRequestLink";
import { useClientSettings } from "~/hooks/useSettings";

import { useMediaQuery } from "~/hooks/useMediaQuery";
import { cn } from "~/lib/utils";

import { type TimestampFormat } from "@t3tools/contracts/settings";

import { type HandoffTimelineRun } from "./V2LifecycleRow";

import { TimelineSystemDivider } from "./TimelineSystemDivider";

import {
  type TimelinePositionState,
  type TimelineReveal,
  TimelineRevealCtx,
  type TimelineRow,
  TimelineRowActivityCtx,
  type TimelineRowActivityState,
  TimelineRowCtx,
  type TimelineRowSharedState,
  type WorkGroupViewState,
} from "./TimelineRowContext";
import {
  LiveWorkEntryTimelineRow,
  ThinkingTimelineRow,
  WorkGroupSection,
  WorkGroupToggleTimelineRow,
  WorkingTimelineRow,
  useStableRows,
} from "./TimelineWorkGroupRows";
import { TimelineMinimap } from "./TimelineMinimap";
import { UserTimelineRow } from "./TimelineUserMessageRow";
import {
  AssistantMetaTimelineRow,
  AssistantTimelineRow,
  HtmlRenderTimelineRow,
  McpAppTimelineRow,
  ProposedPlanTimelineRow,
} from "./TimelineAssistantRows";
import { V2EventTimelineRow } from "./TimelineV2EventRow";
import { ActivityShimmerOverlay, TimelineRowTimestamp } from "./TimelineRowParts";
export { resolvePreviewAnnotationImage } from "./TimelineUserMessageRow";

const TIMELINE_LIST_HEADER = <div className="h-3 sm:h-4" />;
const TIMELINE_LIST_FADE_HEADER = (
  <div className="h-[var(--workspace-titlebar-scroll-fade-height)]" />
);
function TimelineListFooter({
  composerInset,
  children,
}: {
  readonly composerInset: number;
  readonly children?: ReactNode;
}) {
  return (
    <div>
      {children}
      <div aria-hidden style={{ height: composerInset }} />
      <div aria-hidden className="h-3 sm:h-4" />
    </div>
  );
}

const EMPTY_TIMELINE_SKILLS: ReadonlyArray<Pick<ServerProviderSkill, "name" | "displayName">> = [];
const TIMELINE_MAINTAIN_SCROLL_AT_END = {
  animated: false,
  on: {
    dataChange: true,
    // Composer inset changes must not move already-visible messages. New
    // rows and row growth still keep live-follow pinned through the other
    // triggers below.
    footerLayout: false,
    itemLayout: true,
    layout: true,
  },
} as const satisfies MaintainScrollAtEndOptions;
const EMPTY_TIMELINE_RUNS: ReadonlyArray<HandoffTimelineRun> = [];
const EMPTY_RUN_IDS: ReadonlySet<RunId> = new Set();
// Streamed text lands a paragraph at a time. A smooth scroll to the end
// turns each landing into a short glide instead of a jump. Thread switches
// and layout settles keep the instant variant so nothing visibly travels.
const TIMELINE_MAINTAIN_SCROLL_AT_END_SMOOTH = {
  ...TIMELINE_MAINTAIN_SCROLL_AT_END,
  animated: true,
} as const satisfies MaintainScrollAtEndOptions;

// ---------------------------------------------------------------------------
// Props (public API)
// ---------------------------------------------------------------------------

export interface MessagesTimelineHistoryControls {
  readonly hasMoreHistory: boolean;
  readonly loading: boolean;
  readonly error: string | null;
  readonly onLoadEarlier: (throughEntryId?: string) => void;
}

interface MessagesTimelineProps {
  citationRequest?: AssistantCitationRequest | null;
  citationHistoryLoading?: boolean;
  onCiteAssistantText?: (
    citation: AssistantCitation,
    sourceAnchor: AssistantCitationSourceAnchor,
  ) => boolean;
  isWorking: boolean;
  /** The live work belongs to a runless root turn (a provider-native subagent). */
  runlessWorkActive?: boolean;
  activeTurnInProgress: boolean;
  activeTurnStartedAt?: string | null;
  worktreeSetup?: WorktreeSetupSnapshot | null;
  onCancelWorktreeSetup?: () => void;
  /** Runs whose failed workspace preparation can be retried, keyed by run id. */
  retryableWorkspacePreparationRunIds?: ReadonlySet<RunId>;
  onRetryWorkspacePreparation?: (runId: RunId) => void;
  onWorktreeSetupWorkLocally?: () => void;
  onOpenWorktreeSetupTerminal?: (terminalId: string) => void;
  isPreparingWorktree?: boolean;
  isCompacting?: boolean;
  /** The agent waits on an approval or an answer from the user. */
  awaitingUser?: boolean;
  /** Thread state shown after the last message, such as a settled or snoozed line. */
  footer?: ReactNode;

  listRef: React.RefObject<LegendListRef | null>;
  timelineEntries: ReadonlyArray<TimelineEntry>;
  latestRun: TimelineLatestRun | null;
  runningRunId?: RunId | null;
  turnDiffSummaries: ReadonlyArray<TurnDiffSummary>;
  routeThreadKey: string;
  displayThreadKey?: string;
  onOpenTurnDiff: (runId: RunId, filePath?: string) => void;
  onOpenThread: (threadId: OrchestrationV2TurnItem["threadId"]) => void;
  parentThreadLink?: {
    readonly threadId: ThreadId;
    readonly title: string;
  } | null;
  onForkFromRun: (input: {
    readonly sourceThreadId: ThreadId;
    readonly runId: RunId;
  }) => Promise<void>;
  onRollbackCheckpoint: (input: {
    readonly checkpointId: string;
    readonly scopeId: string;
  }) => void;
  supportsConversationRollback: boolean;
  onRevertToTurnCount: (targetTurnCount: number, messageId: MessageId) => void;
  onUseArtifactTemplate?: (template: CodexArtifactTemplate) => void;
  onDockReply?: (text: string) => void;
  onSendAppMessage?: (text: string) => Promise<void>;
  onRunShellCommand?: (command: string) => void;
  isRevertingCheckpoint: boolean;
  onImageExpand: (preview: ExpandedImagePreview) => void;
  onFileOpen?: (attachment: ChatFileAttachment) => void;
  onFileDownload?: (attachment: ChatFileAttachment) => void;
  activeThreadEnvironmentId: EnvironmentId;
  markdownCwd: string | undefined;
  resolvedTheme: "light" | "dark";
  timestampFormat: TimestampFormat;
  workspaceRoot: string | undefined;
  skills?: ReadonlyArray<Pick<ServerProviderSkill, "name" | "displayName">>;
  providerStatuses: ReadonlyArray<ServerProvider>;
  runs: ReadonlyArray<TimelineRun>;
  anchorMessageId: MessageId | null;
  onAnchorReady: (messageId: MessageId, anchorIndex: number) => void;
  onAnchorSizeChanged: (messageId: MessageId, size: number) => void;
  contentInsetEndAdjustment: number;
  onIsAtEndChange: (isAtEnd: boolean) => void;
  /**
   * Whether the timeline should keep pinning to the live edge as content
   * grows. Off while the user is reading history; LegendList's own
   * maintainScrollAtEnd would otherwise re-pin regardless of ChatView's
   * scroll-mode refs whenever the user drifts near the bottom.
   */
  liveFollowEnabled: boolean;
  /**
   * Whether the real rows extend past the viewport above the composer.
   * Reported after scrolls, row size changes, and viewport resizes.
   */
  onContentOverflowChange?: (overflows: boolean) => void;
  onToolOutputCollapsedAtEnd?: () => void;
  onManualNavigation: () => void;
  findOpen?: boolean;
  cancelPositionRestoreRef?: React.RefObject<(() => void) | null> | undefined;
  hideEmptyPlaceholder?: boolean;
  topFadeEnabled?: boolean;
  historyControls?: MessagesTimelineHistoryControls | undefined;
  /** Non-null when older turns exist beyond the loaded window. */
  loadEarlier?: CitationHistoryPage | null;
  findPositionReaderRef?: React.RefObject<ThreadFindPositionReader | null>;
  findExpanded?: boolean;
  findQuery?: string;
  activeFindMatch?: ThreadFindMatch | null;
  findNavigationId?: number;
  /** Open and scroll to one tool call; a new nonce repeats the request. */
  revealRequest?: { readonly itemId: string; readonly nonce: number; readonly at: number } | null;
}

// ---------------------------------------------------------------------------
// MessagesTimeline — list owner
// ---------------------------------------------------------------------------

export function MessagesTimeline(props: MessagesTimelineProps) {
  const find = useContext(ThreadFindTimelineContext);
  const findOpen = find?.findOpen ?? props.findOpen;
  const { onManualNavigation } = props;
  useEffect(() => {
    if (findOpen) onManualNavigation();
  }, [findOpen, onManualNavigation]);
  return (
    <ConversationTimeline
      {...props}
      {...find}
      liveFollowEnabled={!findOpen && props.liveFollowEnabled}
    />
  );
}

const ConversationTimeline = memo(function ConversationTimeline({
  citationRequest = null,
  citationHistoryLoading = false,
  onCiteAssistantText,
  isWorking,
  runlessWorkActive = false,
  activeTurnInProgress,
  activeTurnStartedAt = null,
  worktreeSetup = null,
  footer = null,
  onCancelWorktreeSetup,
  retryableWorkspacePreparationRunIds = EMPTY_RUN_IDS,
  onRetryWorkspacePreparation,
  onWorktreeSetupWorkLocally,
  onOpenWorktreeSetupTerminal,
  isPreparingWorktree = false,
  isCompacting = false,
  awaitingUser = false,
  listRef,
  timelineEntries,
  findExpanded = false,
  findQuery = "",
  activeFindMatch = null,
  findNavigationId = 0,
  findPositionReaderRef,
  revealRequest = null,
  latestRun,
  runningRunId = null,
  turnDiffSummaries,
  routeThreadKey,
  displayThreadKey,
  onOpenTurnDiff,
  onOpenThread,
  parentThreadLink = null,
  onForkFromRun,
  onRollbackCheckpoint,
  supportsConversationRollback,
  onRevertToTurnCount,
  onUseArtifactTemplate = NOOP_USE_ARTIFACT_TEMPLATE,
  onDockReply,
  onSendAppMessage,
  onRunShellCommand,
  isRevertingCheckpoint,
  onImageExpand,
  onFileOpen = NOOP_OPEN_ATTACHMENT,
  onFileDownload = NOOP_OPEN_ATTACHMENT,
  activeThreadEnvironmentId,
  markdownCwd,
  resolvedTheme,
  timestampFormat,
  workspaceRoot,
  skills = EMPTY_TIMELINE_SKILLS,
  providerStatuses,
  runs: runsProp,
  anchorMessageId,
  onAnchorReady,
  onAnchorSizeChanged,
  contentInsetEndAdjustment,
  onIsAtEndChange,
  onContentOverflowChange,
  liveFollowEnabled,
  onToolOutputCollapsedAtEnd,
  onManualNavigation,
  cancelPositionRestoreRef,
  hideEmptyPlaceholder = false,
  topFadeEnabled = false,
  historyControls,
  loadEarlier = null,
}: MessagesTimelineProps) {
  const listIdentityKey = displayThreadKey ?? routeThreadKey;
  const rememberedPosition = useMemo(
    () => readTimelinePosition(listIdentityKey),
    [listIdentityKey],
  );
  const [expandedRunIds, setExpandedRunIds] = useState<ReadonlySet<RunId>>(
    () => rememberedPosition?.disclosures?.runs ?? new Set(),
  );
  const [expandedWorkGroupIds, setExpandedWorkGroupIds] = useState<ReadonlySet<string>>(
    () => rememberedPosition?.disclosures?.workGroups ?? new Set(),
  );
  const [expandedAttemptIds, setExpandedAttemptIds] = useState<ReadonlySet<RunAttemptId>>(
    () => rememberedPosition?.disclosures?.attempts ?? new Set(),
  );
  const [positionedThreadKey, setPositionedThreadKey] = useState<string | null>(() =>
    rememberedPosition?.atEnd === false ? null : listIdentityKey,
  );
  const restoringThreadPosition = positionedThreadKey !== listIdentityKey;
  const prefersReducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const listIdentityRef = useRef(listIdentityKey);
  const previousLatestRunRef = useRef(latestRun);
  // The list stays mounted across thread switches. Its first end pins on the
  // new thread must snap, not glide, even if that thread is mid-turn.
  const [settlingListIdentity, setSettlingListIdentity] = useState<string | null>(null);
  const [playingAudioRows, setPlayingAudioRows] = useState<ReadonlyMap<HTMLAudioElement, string>>(
    () => new Map(),
  );
  let paintedExpandedRunIds = expandedRunIds;
  let paintedExpandedWorkGroupIds = expandedWorkGroupIds;
  let paintedExpandedAttemptIds = expandedAttemptIds;
  if (listIdentityRef.current !== listIdentityKey) {
    listIdentityRef.current = listIdentityKey;
    setPlayingAudioRows(new Map());
    setPositionedThreadKey(null);
    previousLatestRunRef.current = latestRun;
    setSettlingListIdentity(listIdentityKey);
    paintedExpandedRunIds = rememberedPosition?.disclosures?.runs ?? new Set();
    paintedExpandedWorkGroupIds = rememberedPosition?.disclosures?.workGroups ?? new Set();
    paintedExpandedAttemptIds = rememberedPosition?.disclosures?.attempts ?? new Set();
    setExpandedRunIds(paintedExpandedRunIds);
    setExpandedWorkGroupIds(paintedExpandedWorkGroupIds);
    setExpandedAttemptIds(paintedExpandedAttemptIds);
  }
  const citationThreadRef = useMemo(() => parseScopedThreadKey(routeThreadKey), [routeThreadKey]);
  const openPullRequest = useOpenPrLink(citationThreadRef ?? undefined);
  const expandCitedRun = useCallback((runId: RunId) => {
    setExpandedRunIds((current) => (current.has(runId) ? current : new Set([...current, runId])));
  }, []);
  // Nested tool state shares the bounded thread-position cache.
  const workGroupViewState = useMemo<WorkGroupViewState>(
    () =>
      rememberedPosition?.disclosures?.workGroupState ?? {
        scrollPositions: new Map(),
        expandedEntries: new Set(),
      },
    [listIdentityKey, rememberedPosition],
  );
  const [minimapStripMap] = useState(() => new Map<string, HTMLSpanElement>());
  const [disclosureToggleSettling, setDisclosureToggleSettling] = useState(false);
  const disclosureAnchorKeyRef = useRef<string | null>(null);
  const disclosureSettleFrameRef = useRef<number | null>(null);
  const disclosureSettleSecondFrameRef = useRef<number | null>(null);
  const normalizedFindQuery = findQuery.trim();
  const findActive = findExpanded;

  useEffect(() => {
    return () => {
      if (disclosureSettleFrameRef.current !== null) {
        cancelAnimationFrame(disclosureSettleFrameRef.current);
      }
      if (disclosureSettleSecondFrameRef.current !== null) {
        cancelAnimationFrame(disclosureSettleSecondFrameRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (settlingListIdentity === null) return;
    // Two frames covers the fresh-data layout pass and the initial end pin.
    let second: number | null = null;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => {
        setSettlingListIdentity((current) => (current === settlingListIdentity ? null : current));
      });
    });
    return () => {
      cancelAnimationFrame(first);
      if (second !== null) cancelAnimationFrame(second);
    };
  }, [settlingListIdentity]);

  // A toggle made at the end keeps the end in view while rows re-measure.
  // Anywhere else, the toggled row holds its place.
  const disclosurePinsEndRef = useRef(false);
  const disclosureCollapsedRef = useRef(false);
  const pinDisclosureToEnd = useCallback(() => {
    if (!disclosurePinsEndRef.current) return;
    const element = listRef.current?.getScrollableNode();
    if (element) element.scrollTop = element.scrollHeight;
  }, [listRef]);

  // Settles two frames after the last toggle, or after the last row resize
  // while pinned to the end, since tool output can render a few frames late.
  const scheduleDisclosureSettle = useCallback(() => {
    if (disclosureSettleFrameRef.current !== null) {
      cancelAnimationFrame(disclosureSettleFrameRef.current);
    }
    if (disclosureSettleSecondFrameRef.current !== null) {
      cancelAnimationFrame(disclosureSettleSecondFrameRef.current);
    }
    disclosureSettleFrameRef.current = requestAnimationFrame(() => {
      pinDisclosureToEnd();
      disclosureSettleSecondFrameRef.current = requestAnimationFrame(() => {
        pinDisclosureToEnd();
        disclosurePinsEndRef.current = false;
        disclosureAnchorKeyRef.current = null;
        setDisclosureToggleSettling(false);
        disclosureSettleFrameRef.current = null;
        disclosureSettleSecondFrameRef.current = null;
        // Wait for row measurement and the disclosure click's blur check.
        // Closing output can reveal the end without a scroll event.
        if (
          disclosureCollapsedRef.current &&
          resolveTimelineIsAtEnd(listRef.current?.getState()) === true
        ) {
          onToolOutputCollapsedAtEnd?.();
        }
      });
    });
  }, [listRef, onToolOutputCollapsedAtEnd, pinDisclosureToEnd]);

  const suspendEndScrollMaintenanceForDisclosure = useCallback(
    (anchorKey: string, collapsed = false) => {
      disclosureAnchorKeyRef.current = anchorKey;
      disclosureCollapsedRef.current = collapsed;
      disclosurePinsEndRef.current = resolveTimelineIsAtEnd(listRef.current?.getState()) === true;
      setDisclosureToggleSettling(true);
      scheduleDisclosureSettle();
    },
    [listRef, scheduleDisclosureSettle],
  );

  const shouldRestoreVisibleContentPosition = useCallback((row: MessagesTimelineRow) => {
    if (disclosurePinsEndRef.current) return false;
    const disclosureAnchorKey = disclosureAnchorKeyRef.current;
    return disclosureAnchorKey === null || row.id === disclosureAnchorKey;
  }, []);

  const onToggleTurnFold = useCallback(
    (runId: RunId) => {
      suspendEndScrollMaintenanceForDisclosure(`turn-fold:${runId}`);
      setExpandedRunIds((existing) => {
        const next = new Set(existing);
        if (next.has(runId)) {
          next.delete(runId);
        } else {
          next.add(runId);
        }
        return next;
      });
    },
    [suspendEndScrollMaintenanceForDisclosure],
  );
  const onToggleWorkGroup = useCallback(
    (groupId: string, anchorKey: string) => {
      suspendEndScrollMaintenanceForDisclosure(anchorKey, expandedWorkGroupIds.has(groupId));
      setExpandedWorkGroupIds((existing) => {
        const next = new Set(existing);
        if (next.has(groupId)) {
          next.delete(groupId);
        } else {
          next.add(groupId);
        }
        return next;
      });
    },
    [expandedWorkGroupIds, suspendEndScrollMaintenanceForDisclosure],
  );
  const onToggleAttemptFold = useCallback(
    (attemptId: RunAttemptId) => {
      suspendEndScrollMaintenanceForDisclosure(`attempt-fold:${attemptId}`);
      setExpandedAttemptIds((existing) => {
        const next = new Set(existing);
        if (next.has(attemptId)) {
          next.delete(attemptId);
        } else {
          next.add(attemptId);
        }
        return next;
      });
    },
    [suspendEndScrollMaintenanceForDisclosure],
  );

  // An in-session interrupt leaves its turn expanded so the user keeps their
  // place; the next turn (or a reload, since this is local state) folds it.

  useEffect(() => {
    const previous = previousLatestRunRef.current;
    previousLatestRunRef.current = latestRun;
    if (!latestRun || previous?.runId === undefined) {
      return;
    }
    if (latestRun.runId === previous.runId) {
      if (previous.status === "running" && latestRun.status === "interrupted") {
        setExpandedRunIds((existing) => {
          const next = new Set(existing);
          next.add(latestRun.runId);
          return next;
        });
      }
      return;
    }
    setExpandedRunIds((existing) => {
      if (!existing.has(previous.runId)) {
        return existing;
      }
      const next = new Set(existing);
      next.delete(previous.runId);
      return next;
    });
  }, [latestRun]);

  // Find the fold that hides the match: imported turns have no run id but still
  // fold under a synthetic key, so the match's own run id cannot open them.
  const findFoldRunIds = useMemo(
    () =>
      findActive
        ? timelineTurnFoldRunIdsByEntryId({
            timelineEntries,
            latestRun,
            runningRunId,
            isWorking,
            runlessWorkActive,
          })
        : null,
    [findActive, timelineEntries, latestRun, runningRunId, isWorking, runlessWorkActive],
  );
  const activeFindRunId = activeFindMatch
    ? findFoldRunIds?.get(activeFindMatch.entryId)
    : undefined;
  useEffect(() => {
    if (!activeFindRunId) return;
    setExpandedRunIds((previous) =>
      previous.has(activeFindRunId) ? previous : new Set(previous).add(activeFindRunId),
    );
  }, [activeFindRunId]);
  const visibleExpandedRunIds = useMemo(() => {
    if (!activeFindRunId || paintedExpandedRunIds.has(activeFindRunId)) {
      return paintedExpandedRunIds;
    }
    return new Set(paintedExpandedRunIds).add(activeFindRunId);
  }, [activeFindRunId, paintedExpandedRunIds]);

  const activeFindAttemptId = activeFindMatch
    ? timelineEntries.find((entry) => entry.id === activeFindMatch.entryId)?.attempt?.id
    : undefined;
  useEffect(() => {
    if (!activeFindAttemptId) return;
    setExpandedAttemptIds((previous) =>
      previous.has(activeFindAttemptId) ? previous : new Set(previous).add(activeFindAttemptId),
    );
  }, [activeFindAttemptId]);
  const visibleExpandedAttemptIds = useMemo(
    () =>
      activeFindAttemptId && !paintedExpandedAttemptIds.has(activeFindAttemptId)
        ? new Set(paintedExpandedAttemptIds).add(activeFindAttemptId)
        : paintedExpandedAttemptIds,
    [activeFindAttemptId, paintedExpandedAttemptIds],
  );

  const rowsProjectionRef = useRef<{
    readonly threadKey: string;
    readonly workspaceRoot: string | undefined;
    readonly projection: MessagesTimelineRowsProjection;
  } | null>(null);
  const rawRows = useMemo(() => {
    const previous = rowsProjectionRef.current;
    const projection = deriveMessagesTimelineRowsWithState(
      {
        timelineEntries,
        latestRun,
        runningRunId,
        expandedRunIds: visibleExpandedRunIds,
        expandedAttemptIds: visibleExpandedAttemptIds,
        expandedWorkGroupIds,
        isWorking,
        runlessWorkActive,
        activeTurnStartedAt,
        turnDiffSummaries,
        supportsConversationRollback,
        worktreeSetup,
      },
      previous?.threadKey === listIdentityKey && previous.workspaceRoot === workspaceRoot
        ? previous.projection
        : null,
    );
    rowsProjectionRef.current = { threadKey: listIdentityKey, workspaceRoot, projection };
    return projection.rows;
  }, [
    rowsProjectionRef,
    listIdentityKey,
    workspaceRoot,
    timelineEntries,
    latestRun,
    runningRunId,
    visibleExpandedRunIds,
    visibleExpandedAttemptIds,
    expandedWorkGroupIds,
    isWorking,
    runlessWorkActive,
    activeTurnStartedAt,
    turnDiffSummaries,
    supportsConversationRollback,
    worktreeSetup,
  ]);
  const rows = useStableRows(rawRows, listIdentityKey);

  // Open whatever hides the requested tool call (a folded turn, an attempt, a group),
  // one level per render, then scroll to its row and open it.
  const [pendingReveal, setPendingReveal] = useState<{
    readonly itemId: string;
    readonly nonce: number;
    readonly steps: number;
  } | null>(null);
  const [revealedEntry, setRevealedEntry] = useState<TimelineReveal | null>(null);
  useEffect(() => {
    // A list that mounts later must not replay an old request and scroll by surprise.
    if (revealRequest && Date.now() - revealRequest.at < 3_000) {
      setPendingReveal({ itemId: revealRequest.itemId, nonce: revealRequest.nonce, steps: 0 });
    }
  }, [revealRequest]);
  useEffect(() => {
    if (!pendingReveal) return;
    const { itemId, nonce, steps } = pendingReveal;
    const step = resolveTimelineReveal({
      rows,
      timelineEntries,
      foldRunId: timelineEntryTurnFoldRunId(
        { timelineEntries, latestRun, runningRunId, isWorking, runlessWorkActive },
        itemId,
      ),
      itemId,
    });
    const add =
      <T,>(value: T) =>
      (current: ReadonlySet<T>) =>
        current.has(value) ? current : new Set(current).add(value);
    if (step.kind === "missing" || steps >= 4) {
      setPendingReveal(null);
      return;
    }
    if (step.kind === "row") {
      const row = rows[step.index];
      workGroupViewState.expandedEntries.add(itemId);
      if (row?.kind === "work" && row.isExpandedToolGroup) {
        workGroupViewState.scrollPositions.set(row.id, { entryId: itemId, offset: 0 });
      }
      setPendingReveal(null);
      setRevealedEntry({ entryId: itemId, nonce, at: Date.now() });
      onManualNavigation();
      void listRef.current?.scrollToIndex({
        index: step.index,
        animated: !prefersReducedMotion,
        viewPosition: 0.35,
      });
      return;
    }
    if (step.kind === "open-run") setExpandedRunIds(add(step.runId));
    else if (step.kind === "open-attempt") setExpandedAttemptIds(add(step.attemptId));
    else setExpandedWorkGroupIds(add(step.groupId));
    setPendingReveal({ itemId, nonce, steps: steps + 1 });
  }, [
    pendingReveal,
    rows,
    timelineEntries,
    latestRun,
    runningRunId,
    isWorking,
    runlessWorkActive,
    workGroupViewState,
    onManualNavigation,
    listRef,
    prefersReducedMotion,
  ]);
  // Run status/timestamps churn on every stream event; the shared row context
  // must not change with them or every timeline row re-renders per event.
  const runs = useStableHandoffRuns(runsProp);
  const minimapItems = useMemo(() => deriveTimelineMinimapItems(rows), [rows]);
  const restoreRowIndex =
    restoringThreadPosition && rememberedPosition?.atEnd === false
      ? rows.findIndex((row) => row.id === rememberedPosition.rowId)
      : -1;
  const restoringAlwaysRender = useMemo(
    () =>
      restoringThreadPosition && restoreRowIndex >= 0 ? { indices: [restoreRowIndex] } : undefined,
    [restoreRowIndex, restoringThreadPosition],
  );
  useLayoutEffect(() => {
    if (!restoringThreadPosition || rows.length === 0) return;
    const list = listRef.current;
    if (!list) return;
    if (citationRequest !== null) {
      setPositionedThreadKey(listIdentityKey);
      return;
    }
    let cancelled = false;
    let settleFrame: number | null = null;
    const viewport: HTMLElement | null = list.getScrollableNode();
    const cancelRestoration = () => {
      if (cancelled) return;
      cancelled = true;
      if (settleFrame !== null) cancelAnimationFrame(settleFrame);
      // Supersede any pending estimated-index scroll before the browser applies the gesture.
      if (viewport) void list.scrollToOffset({ offset: viewport.scrollTop, animated: false });
      setPositionedThreadKey(listIdentityKey);
    };
    const cancelForNavigation = () => {
      cancelRestoration();
      onManualNavigation();
    };
    const onScrollKey = (event: globalThis.KeyboardEvent) => {
      if (
        ["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(event.key) &&
        !(
          event.target instanceof Element &&
          event.target.closest("input, textarea, [contenteditable=true]")
        )
      )
        cancelForNavigation();
    };
    viewport?.addEventListener("wheel", cancelForNavigation, { passive: true });
    viewport?.addEventListener("touchmove", cancelForNavigation, { passive: true });
    viewport?.addEventListener("pointerdown", cancelForNavigation, { passive: true });
    viewport?.ownerDocument.addEventListener("keydown", onScrollKey);
    const position = rememberedPosition;
    const index = position ? rows.findIndex((row) => row.id === position.rowId) : -1;
    if (position?.atEnd === false) onManualNavigation();
    if (cancelPositionRestoreRef) cancelPositionRestoreRef.current = cancelRestoration;
    const scrolling =
      position?.atEnd === false
        ? index >= 0
          ? list.scrollToIndex({
              index,
              animated: false,
              viewPosition: 0,
              viewOffset: -position.offsetWithinRow,
            })
          : list.scrollToOffset({ offset: position.scrollOffset, animated: false })
        : list.scrollToEnd({ animated: false });
    void Promise.resolve(scrolling).then(() => {
      if (cancelled) return;
      if (position?.atEnd !== false || index < 0) {
        setPositionedThreadKey(listIdentityKey);
        return;
      }
      // Index scrolling starts from estimates. Keep the saved row mounted
      // until its measured position and the DOM agree for two layout frames.
      let stableFrames = 0;
      const reconcile = () => {
        if (cancelled) return;
        const state = list.getState();
        const rowIndex = state.indexByKey(position.rowId);
        const row = rowIndex === undefined ? undefined : state.elementAtIndex(rowIndex);
        const element = list.getScrollableNode();
        if (!row || !element) return;
        const offset = Math.max(
          0,
          Math.min(
            element.scrollTop +
              row.getBoundingClientRect().top -
              element.getBoundingClientRect().top +
              position.offsetWithinRow,
            element.scrollHeight - element.clientHeight,
          ),
        );
        if (Math.abs(element.scrollTop - offset) > 1) {
          stableFrames = 0;
          void list.scrollToOffset({ offset, animated: false }).then(() => {
            if (!cancelled) settleFrame = requestAnimationFrame(reconcile);
          });
          return;
        }
        if (++stableFrames >= 2) {
          setPositionedThreadKey(listIdentityKey);
        } else {
          settleFrame = requestAnimationFrame(reconcile);
        }
      };
      settleFrame = requestAnimationFrame(reconcile);
    });
    return () => {
      cancelled = true;
      if (cancelPositionRestoreRef?.current === cancelRestoration) {
        cancelPositionRestoreRef.current = null;
      }
      if (settleFrame !== null) cancelAnimationFrame(settleFrame);
      viewport?.removeEventListener("wheel", cancelForNavigation);
      viewport?.removeEventListener("touchmove", cancelForNavigation);
      viewport?.removeEventListener("pointerdown", cancelForNavigation);
      viewport?.ownerDocument.removeEventListener("keydown", onScrollKey);
    };
  }, [
    citationRequest,
    cancelPositionRestoreRef,
    listIdentityKey,
    listRef,
    onManualNavigation,
    rememberedPosition,
    restoringThreadPosition,
    rows,
  ]);

  const [timelineViewportElement, setTimelineViewportElement] = useState<HTMLDivElement | null>(
    null,
  );
  // Re-measure the minimap gutter when the chat column changes width without a viewport resize.
  const chatWidth = useClientSettings((settings) => settings.chatWidth);
  const {
    target: readyCitationRequest,
    positioning: citationPositioning,
    onListLoad: onCitationListLoad,
    alwaysRender: citationAlwaysRender,
  } = useAssistantCitationTarget({
    request: citationRequest,
    entries: timelineEntries,
    rows,
    listRef,
    viewport: timelineViewportElement,
    historyLoading: citationHistoryLoading,
    loadEarlier,
    onExpandTurn: expandCitedRun,
    onManualNavigation,
  });
  const [findListReady, setFindListReady] = useState(false);
  const handleListLoad = useCallback(() => {
    onCitationListLoad();
    setFindListReady(true);
  }, [onCitationListLoad]);
  const [minimapHasPersistentGutter, setMinimapHasPersistentGutter] = useState(false);
  const [fullscreenAppRowId, setFullscreenAppRowId] = useState<string | null>(null);
  // Only the row that holds the pin can release it.
  const onAppFullscreenChange = useCallback((rowId: string, fullscreen: boolean) => {
    setFullscreenAppRowId((current) => (fullscreen ? rowId : current === rowId ? null : current));
  }, []);
  // Every pin holds at once, so navigating to a citation or restoring a
  // position never drops a full-screen app's row. The app is pinned by key,
  // which stays right as earlier rows load in.
  const alwaysRender = useMemo(() => {
    const indices = restoringAlwaysRender?.indices ?? [];
    const keys = [
      ...(citationAlwaysRender?.keys ?? []),
      ...(fullscreenAppRowId === null ? [] : [fullscreenAppRowId]),
      // A playing audio row stays mounted so scrolling does not stop the sound.
      ...new Set(
        [...playingAudioRows].filter(([audio]) => audio.isConnected).map(([, rowId]) => rowId),
      ),
    ];
    if (indices.length === 0 && keys.length === 0) return undefined;
    return {
      ...(indices.length === 0 ? {} : { indices }),
      ...(keys.length === 0 ? {} : { keys }),
    };
  }, [citationAlwaysRender, restoringAlwaysRender, fullscreenAppRowId, playingAudioRows]);
  const [minimapHitStripWidth, setMinimapHitStripWidth] = useState(0);
  const [minimapCurrentIndex, setMinimapCurrentIndex] = useState<number | null>(null);
  const handleAnchorReady = useCallback(
    (info: { anchorIndex: number | undefined }) => {
      if (anchorMessageId !== null && info.anchorIndex !== undefined) {
        onAnchorReady(anchorMessageId, info.anchorIndex);
      }
    },
    [anchorMessageId, onAnchorReady],
  );
  const handleAnchorSizeChanged = useCallback(
    (size: number) => {
      if (anchorMessageId !== null) {
        onAnchorSizeChanged(anchorMessageId, size);
      }
    },
    [anchorMessageId, onAnchorSizeChanged],
  );
  const anchoredEndSpace = useMemo(() => {
    const config = resolveChatListAnchoredEndSpace(
      rows,
      anchorMessageId,
      (row) => (row.kind === "message" && row.message.role === "user" ? row.message.id : null),
      { anchorOffset: CHAT_TIMELINE_ANCHOR_OFFSET },
    );
    return config
      ? { ...config, onReady: handleAnchorReady, onSizeChanged: handleAnchorSizeChanged }
      : undefined;
  }, [anchorMessageId, handleAnchorReady, handleAnchorSizeChanged, rows]);
  const maintainVisibleContentPosition = useMemo(
    () => ({
      data: true,
      size: true,
      shouldRestorePosition: shouldRestoreVisibleContentPosition,
    }),
    [shouldRestoreVisibleContentPosition],
  );
  const timelineListFooter = useMemo(
    () => (
      <TimelineListFooter composerInset={anchoredEndSpace ? 0 : contentInsetEndAdjustment}>
        {footer}
      </TimelineListFooter>
    ),
    [anchoredEndSpace, contentInsetEndAdjustment, footer],
  );

  const measureContentOverflow = useCallback(
    () =>
      timelineContentOverflowsViewport(listRef.current?.getState?.(), {
        composerInset: contentInsetEndAdjustment,
        anchorOffset: CHAT_TIMELINE_ANCHOR_OFFSET,
      }),
    [contentInsetEndAdjustment, listRef],
  );
  // LegendList lays rows out from layout effects, so a read on the next frame
  // sees the settled positions. One frame is shared across bursts of size
  // changes.
  const contentOverflowFrameRef = useRef<number | null>(null);
  const cancelContentOverflowFrame = useCallback(() => {
    if (contentOverflowFrameRef.current !== null) {
      cancelAnimationFrame(contentOverflowFrameRef.current);
      contentOverflowFrameRef.current = null;
    }
  }, []);
  const reportContentOverflow = useCallback(() => {
    if (!onContentOverflowChange || contentOverflowFrameRef.current !== null) return;
    contentOverflowFrameRef.current = requestAnimationFrame(() => {
      contentOverflowFrameRef.current = null;
      onContentOverflowChange(measureContentOverflow());
    });
  }, [measureContentOverflow, onContentOverflowChange]);
  const handleItemSizeChanged = useCallback(() => {
    if (disclosurePinsEndRef.current) {
      queueMicrotask(pinDisclosureToEnd);
      scheduleDisclosureSettle();
    }
    reportContentOverflow();
  }, [pinDisclosureToEnd, reportContentOverflow, scheduleDisclosureSettle]);
  useEffect(() => cancelContentOverflowFrame, [cancelContentOverflowFrame]);
  // The list's own layout effects have already run here, so estimated row
  // positions are in place. Reporting before the first paint lets a thread
  // open in its final composer layout instead of correcting it a frame later.
  // A frame scheduled with the previous inset would overwrite this read, so
  // it is dropped first.
  useLayoutEffect(() => {
    cancelContentOverflowFrame();
    onContentOverflowChange?.(measureContentOverflow());
  }, [cancelContentOverflowFrame, measureContentOverflow, onContentOverflowChange, rows.length]);

  const handleScroll = useCallback(() => {
    const state = listRef.current?.getState?.();
    if (restoringThreadPosition || state?.data !== rows) return;
    const isAtEnd = resolveTimelineIsAtEnd(state);
    const position = state?.data?.length ? resolveWorkGroupScrollAnchor(state) : undefined;
    if (position && state && isAtEnd !== undefined) {
      const index = state.indexByKey(position.rowId);
      const row = index === undefined ? undefined : state.elementAtIndex(index);
      const element = listRef.current?.getScrollableNode();
      if (row && element) {
        rememberTimelinePosition(listIdentityKey, {
          ...position,
          // DOM geometry includes the header and the virtualizer's layout adjustment.
          // Restore reads the offset only for positions not at the end, and this runs
          // on every streamed delta, so pinned views skip the forced layout reads.
          offsetWithinRow: isAtEnd
            ? 0
            : element.getBoundingClientRect().top - row.getBoundingClientRect().top,
          scrollOffset: element.scrollTop,
          atEnd: isAtEnd,
          disclosures: {
            runs: paintedExpandedRunIds,
            workGroups: paintedExpandedWorkGroupIds,
            attempts: paintedExpandedAttemptIds,
            workGroupState: workGroupViewState,
          },
        });
      }
    }
    if (isAtEnd !== undefined && !citationPositioning) {
      onIsAtEndChange(isAtEnd);
    }
    reportContentOverflow();
    if (!state || minimapItems.length === 0) {
      return;
    }

    const scrollTop = state.scroll ?? 0;
    const scrollBottom = scrollTop + (state.scrollLength ?? 0);

    const itemBounds = minimapItems.map((item) => ({
      top: resolveTimelineRowTop(state, item.rowIndex),
      height: resolveTimelineRowHeight(state, item.rowIndex),
    }));

    for (const [index, item] of minimapItems.entries()) {
      const strip = minimapStripMap.get(item.id);
      const bounds = itemBounds[index];
      const rowTop = bounds?.top ?? null;
      const rowHeight = bounds?.height ?? null;
      const inView =
        rowTop !== null &&
        rowTop < scrollBottom &&
        rowTop + Math.max(1, rowHeight ?? 1) > scrollTop;

      // Skip no-op attribute writes: this runs for every strip on every scroll
      // tick, and rewriting an unchanged attribute still dirties style state.
      const next = inView ? "true" : "false";
      if (strip && strip.dataset.inView !== next) {
        strip.dataset.inView = next;
      }
    }
    const nextCurrentIndex = resolveTimelineMinimapCurrentIndex({
      scrollTop,
      scrollBottom,
      itemBounds,
    });
    setMinimapCurrentIndex((current) =>
      current === nextCurrentIndex ? current : nextCurrentIndex,
    );
  }, [
    citationPositioning,
    paintedExpandedRunIds,
    paintedExpandedWorkGroupIds,
    paintedExpandedAttemptIds,
    workGroupViewState,
    rows,
    listIdentityKey,
    restoringThreadPosition,
    listRef,
    minimapItems,
    minimapStripMap,
    onIsAtEndChange,
    reportContentOverflow,
  ]);

  useEffect(() => {
    const frame = requestAnimationFrame(handleScroll);
    return () => cancelAnimationFrame(frame);
  }, [handleScroll, rows.length]);

  useEffect(() => {
    if (!timelineViewportElement) {
      return;
    }

    const measure = () => {
      const viewportWidth = timelineViewportElement.getBoundingClientRect().width;
      // Without a mounted row, treat the column as full width so the strip stays inert.
      const contentWidth =
        timelineViewportElement
          .querySelector<HTMLElement>("[data-timeline-root]")
          ?.getBoundingClientRect().width ?? viewportWidth;
      const nextHasPersistentGutter = resolveTimelineMinimapHasPersistentGutter(
        viewportWidth,
        contentWidth,
      );
      setMinimapHasPersistentGutter((current) =>
        current === nextHasPersistentGutter ? current : nextHasPersistentGutter,
      );
      setMinimapHitStripWidth(resolveTimelineMinimapHitStripWidth(viewportWidth, contentWidth));
      reportContentOverflow();
    };

    const frame = requestAnimationFrame(measure);

    const stopObserving = observeResize(timelineViewportElement, measure);

    return () => {
      cancelAnimationFrame(frame);
      stopObserving();
    };
  }, [timelineViewportElement, rows.length, reportContentOverflow, chatWidth]);

  const sharedState = useMemo<TimelineRowSharedState>(
    () => ({
      citationRequest: readyCitationRequest,
      listRef,
      timestampFormat,
      routeThreadKey,
      // Keep Markdown callbacks memoized during unrelated activity updates.
      threadRef: citationThreadRef,
      markdownCwd,
      resolvedTheme,
      workspaceRoot,
      skills,
      providerStatuses,
      runs,
      activeThreadEnvironmentId,
      onRevertToTurnCount,
      onRunShellCommand,
      findActive,
      onImageExpand,
      onFileOpen,
      onUseArtifactTemplate,
      onDockReply,
      onSendAppMessage,
      onAppFullscreenChange,
      onFileDownload,
      openPullRequest,
      onOpenTurnDiff,
      onOpenThread,
      onForkFromRun,
      onRollbackCheckpoint,
      onToggleTurnFold,
      onToggleAttemptFold,
      onToggleWorkGroup,
      onToggleWorkEntry: suspendEndScrollMaintenanceForDisclosure,
      onCancelWorktreeSetup: onCancelWorktreeSetup ?? null,
      retryableWorkspacePreparationRunIds,
      onRetryWorkspacePreparation: onRetryWorkspacePreparation ?? null,
      onWorktreeSetupWorkLocally: onWorktreeSetupWorkLocally ?? null,
      onOpenWorktreeSetupTerminal: onOpenWorktreeSetupTerminal ?? null,
      workGroupViewState,
    }),
    [
      readyCitationRequest,
      listRef,
      timestampFormat,
      routeThreadKey,
      citationThreadRef,
      markdownCwd,
      resolvedTheme,
      workspaceRoot,
      skills,
      providerStatuses,
      runs,
      activeThreadEnvironmentId,
      onRevertToTurnCount,
      onRunShellCommand,
      findActive,
      onImageExpand,
      onFileOpen,
      onUseArtifactTemplate,
      onDockReply,
      onSendAppMessage,
      onAppFullscreenChange,
      onFileDownload,
      openPullRequest,
      onOpenTurnDiff,
      onOpenThread,
      onForkFromRun,
      onRollbackCheckpoint,
      onToggleTurnFold,
      onToggleAttemptFold,
      onToggleWorkGroup,
      suspendEndScrollMaintenanceForDisclosure,
      onCancelWorktreeSetup,
      retryableWorkspacePreparationRunIds,
      onRetryWorkspacePreparation,
      onWorktreeSetupWorkLocally,
      onOpenWorktreeSetupTerminal,
      workGroupViewState,
    ],
  );
  const compactionAwaitingRow =
    isCompacting && !rows.some((row) => row.kind === "context-compaction" && row.active);
  const backgroundWorktreeSetup =
    worktreeSetup !== null &&
    worktreeSetup.phase === "running" &&
    worktreeSetupAgentStarted(worktreeSetup) &&
    latestRun?.startedAt != null
      ? worktreeSetup
      : null;
  const activityState = useMemo<TimelineRowActivityState>(
    () => ({
      isWorking,
      isCompacting: compactionAwaitingRow,
      isRevertingCheckpoint,
      backgroundWorktreeSetup,
      activeTurnInProgress,
      awaitingUser,
      isPreparingWorktree,
      latestRunId: latestRun?.runId ?? null,
    }),
    [
      awaitingUser,
      compactionAwaitingRow,
      backgroundWorktreeSetup,
      activeTurnInProgress,
      isPreparingWorktree,
      isRevertingCheckpoint,
      isWorking,
      latestRun?.runId,
    ],
  );
  const listHeader = useMemo(() => {
    const leadingContent =
      parentThreadLink === null ? (
        topFadeEnabled ? (
          TIMELINE_LIST_FADE_HEADER
        ) : (
          TIMELINE_LIST_HEADER
        )
      ) : (
        <div className="messages-timeline-row-frame">
          <div className="chat-content-lane pt-1 sm:pt-2">
            <TimelineSystemDivider
              label="Helper in"
              detail={parentThreadLink.title}
              icon={BotIcon}
              actionLabel="Open main chat"
              onAction={() => onOpenThread(parentThreadLink.threadId)}
            />
          </div>
        </div>
      );
    return (
      <>
        {parentThreadLink === null ? leadingContent : null}
        {historyControls ? <TimelineHistoryControl {...historyControls} /> : null}
        {parentThreadLink !== null ? leadingContent : null}
      </>
    );
  }, [historyControls, onOpenThread, parentThreadLink, topFadeEnabled]);

  const canvas = useChatCanvas();
  const registerTimeline = canvas?.registerTimeline;
  const setTimelineList = useCallback(
    (list: LegendListRef | null) => {
      listRef.current = list;
      registerTimeline?.(list?.getScrollableNode() ?? null);
    },
    [listRef, registerTimeline],
  );

  useLayoutEffect(() => {
    if (!findPositionReaderRef || !timelineViewportElement) return;
    const read: ThreadFindPositionReader = (query) => {
      // Imported turns fold under a synthetic key, so match folds by key, not run id.
      const foldRunIds =
        findFoldRunIds ??
        timelineTurnFoldRunIdsByEntryId({
          timelineEntries,
          latestRun,
          runningRunId,
          isWorking,
          runlessWorkActive,
        });
      const entryById = new Map(timelineEntries.map((entry) => [entry.id, entry]));
      return readThreadFindPosition(
        timelineViewportElement,
        query,
        (rowId) => {
          const rowIndex = rows.findIndex((row) => row.id === rowId);
          for (const row of rows.slice(Math.max(0, rowIndex))) {
            // Ordinary rows map to one entry by id; only folds need a scan.
            if (row.kind !== "turn-fold" && row.kind !== "attempt-fold") {
              const entry = entryById.get(row.kind === "assistant-meta" ? row.message.id : row.id);
              if (entry && (entry.kind === "message" || entry.kind === "proposed-plan"))
                return entry.id;
              continue;
            }
            const entry = timelineEntries.find((entry) => {
              const runId =
                row.kind === "turn-fold"
                  ? foldRunIds.get(entry.id)
                  : entry.kind === "message"
                    ? entry.message.runId
                    : entry.kind === "proposed-plan"
                      ? entry.proposedPlan.runId
                      : null;
              return (
                runId === row.runId &&
                (entry.kind !== "message" || entry.message.role === "assistant") &&
                (row.kind !== "attempt-fold" || entry.attempt?.id === row.attemptId)
              );
            });
            if (entry && (entry.kind === "message" || entry.kind === "proposed-plan"))
              return entry.id;
          }
          return undefined;
        },
        contentInsetEndAdjustment,
      );
    };
    findPositionReaderRef.current = read;
    return () => {
      if (findPositionReaderRef.current === read) findPositionReaderRef.current = null;
    };
  }, [
    contentInsetEndAdjustment,
    findFoldRunIds,
    findPositionReaderRef,
    isWorking,
    latestRun,
    rows,
    runlessWorkActive,
    runningRunId,
    timelineEntries,
    timelineViewportElement,
  ]);

  useThreadFindNavigation({
    listReady: findListReady,
    historyControls,
    entries: timelineEntries,
    container: timelineViewportElement,
    query: normalizedFindQuery,
    match: activeFindMatch,
    navigationId: findNavigationId,
    rowIndex: activeFindMatch ? rows.findIndex((row) => row.id === activeFindMatch.entryId) : -1,
    listRef,
    contentInsetEndAdjustment,
  });

  // Stable renderItem — no closure deps. Row components read shared state
  // from TimelineRowCtx, which propagates through LegendList's memo.
  const onAudioPlaybackChange = useCallback((rowId: string, event: SyntheticEvent) => {
    const audio = event.target;
    if (!(audio instanceof HTMLAudioElement)) return;
    setPlayingAudioRows((current) => {
      const playing = !audio.paused && !audio.ended;
      if (playing === current.has(audio)) return current;
      const next = new Map(current);
      if (playing) next.set(audio, rowId);
      else next.delete(audio);
      return next;
    });
  }, []);
  const onAudioUnmount = useCallback((audio: HTMLAudioElement) => {
    setPlayingAudioRows((current) => {
      if (!current.has(audio)) return current;
      const next = new Map(current);
      next.delete(audio);
      return next;
    });
  }, []);
  const renderItem = useCallback(
    ({ item }: { item: MessagesTimelineRow }) => (
      <div
        className="messages-timeline-row-frame"
        onPlayCapture={(event) => onAudioPlaybackChange(item.id, event)}
        onPauseCapture={(event) => onAudioPlaybackChange(item.id, event)}
        onEndedCapture={(event) => onAudioPlaybackChange(item.id, event)}
      >
        <div className="chat-content-lane overflow-x-clip" data-timeline-root="true">
          <AudioPreviewUnmountContext value={onAudioUnmount}>
            <TimelineRowContent row={item} />
          </AudioPreviewUnmountContext>
        </div>
      </div>
    ),
    [onAudioPlaybackChange, onAudioUnmount],
  );

  if (
    rows.length === 0 &&
    !isWorking &&
    parentThreadLink === null &&
    historyControls === undefined &&
    // A status line (settled, snoozed) still needs the list, whose footer renders it.
    footer === null
  ) {
    if (hideEmptyPlaceholder) {
      // Occupy the pane with the theme surface so a thread switch cannot
      // punch a hole through to the window chrome (white in light mode).
      return <div className="h-full min-h-0 bg-background" data-timeline-loading="true" />;
    }
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-muted-foreground">
          No messages yet. Type a message below to start.
        </p>
      </div>
    );
  }

  return (
    <MarkdownFindContext value={findActive}>
      <TimelineRowCtx value={sharedState}>
        <TimelineRevealCtx value={revealedEntry}>
          <TimelineRowActivityCtx value={activityState}>
            <TooltipScrollDismissArea
              ref={setTimelineViewportElement}
              className="relative h-full min-h-0"
              data-assistant-citation-viewport="true"
            >
              {onCiteAssistantText && citationThreadRef ? (
                <AssistantSelectionToolbar
                  viewport={timelineViewportElement}
                  threadRef={citationThreadRef}
                  onCite={onCiteAssistantText}
                />
              ) : null}
              <LegendList<MessagesTimelineRow>
                ref={setTimelineList}
                data={rows}
                extraData={`${listIdentityKey}:${rows.length}`}
                keyExtractor={keyExtractor}
                getItemType={getItemType}
                renderItem={renderItem}
                estimatedItemSize={90}
                initialScrollAtEnd={
                  !findActive && citationRequest === null && rememberedPosition?.atEnd !== false
                }
                // Legend needs a data refresh to mount new pins without a scroll event.
                dataVersion={`${readyCitationRequest?.key ?? listIdentityKey}:${alwaysRender?.keys?.join(",") ?? ""}`}
                {...(alwaysRender ? { alwaysRender } : {})}
                onLoad={handleListLoad}
                {...(anchoredEndSpace ? { anchoredEndSpace } : {})}
                contentInsetEndAdjustment={anchoredEndSpace ? contentInsetEndAdjustment : 0}
                maintainScrollAtEnd={
                  citationPositioning ||
                  (restoringThreadPosition && rememberedPosition?.atEnd === false) ||
                  anchoredEndSpace ||
                  !liveFollowEnabled ||
                  fullscreenAppRowId !== null ||
                  disclosureToggleSettling
                    ? false
                    : isWorking && !prefersReducedMotion && settlingListIdentity === null
                      ? TIMELINE_MAINTAIN_SCROLL_AT_END_SMOOTH
                      : TIMELINE_MAINTAIN_SCROLL_AT_END
                }
                maintainVisibleContentPosition={
                  findActive ||
                  citationPositioning ||
                  (restoringThreadPosition && rememberedPosition?.atEnd === false)
                    ? false
                    : maintainVisibleContentPosition
                }
                maintainScrollAtEndThreshold={1}
                onScroll={handleScroll}
                onItemSizeChanged={handleItemSizeChanged}
                className={cn(
                  "messages-timeline-scroll scrollbar-gutter-both h-full min-h-0 overflow-x-hidden overscroll-y-contain",
                  topFadeEnabled && "topbar-scroll-fade",
                )}
                ListHeaderComponent={listHeader}
                ListFooterComponent={timelineListFooter}
              />
              <TimelineMinimap
                items={minimapItems}
                hasPersistentGutter={minimapHasPersistentGutter}
                hitStripWidth={minimapHitStripWidth}
                currentIndex={minimapCurrentIndex}
                stripMap={minimapStripMap}
                onSelect={(item) => {
                  onManualNavigation();
                  void listRef.current?.scrollToIndex({
                    index: item.rowIndex,
                    animated: true,
                    viewOffset: 24,
                  });
                }}
              />
            </TooltipScrollDismissArea>
          </TimelineRowActivityCtx>
        </TimelineRevealCtx>
      </TimelineRowCtx>
    </MarkdownFindContext>
  );
});

function TimelineHistoryControl(props: MessagesTimelineHistoryControls) {
  if (!props.hasMoreHistory && props.error === null) {
    return null;
  }
  return (
    <div className="messages-timeline-row-frame">
      <div className="chat-content-lane flex flex-col gap-1.5 pb-2">
        {props.hasMoreHistory ? (
          <button
            type="button"
            disabled={props.loading}
            aria-label="Show earlier replies"
            onClick={() => props.onLoadEarlier()}
            className="w-full py-1.5 text-xs text-muted-foreground/60 hover:text-foreground disabled:cursor-default"
          >
            {props.loading ? "Loading earlier replies…" : "Show earlier replies"}
          </button>
        ) : null}
        {props.error !== null ? (
          <p role="status" className="text-center text-muted-foreground text-xs">
            {props.error}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function keyExtractor(item: MessagesTimelineRow) {
  return item.id;
}

function getItemType(item: MessagesTimelineRow) {
  return item.kind === "message" ? `message:${item.message.role}` : item.kind;
}

function resolveTimelineRowTop(state: TimelinePositionState, rowIndex: number) {
  const top = state.positionAtIndex?.(rowIndex);
  return typeof top === "number" && Number.isFinite(top) ? top : null;
}

function resolveTimelineRowHeight(state: TimelinePositionState, rowIndex: number) {
  const height = state.sizeAtIndex?.(rowIndex);
  return typeof height === "number" && Number.isFinite(height) ? height : null;
}

const TimelineRowContent = memo(function TimelineRowContent({ row }: { row: TimelineRow }) {
  const isExpandedToolGroup = row.kind === "work" && row.isExpandedToolGroup;
  const isSubagentGroup = row.kind === "event" && row.projectedItem.item.type === "subagent";
  const isWorkLogRow =
    row.kind === "work" ||
    row.kind === "work-live" ||
    row.kind === "work-toggle" ||
    row.kind === "thinking";
  const isExpandedToolGroupHeader =
    (row.kind === "work-toggle" || row.kind === "work-live" || row.kind === "thinking") &&
    row.expanded === true;

  return (
    <div
      className={cn(
        // Commentary (non-terminal assistant) rows carry no metadata row, so
        // they sit closer to the work that follows them.
        isWorkLogRow || isSubagentGroup
          ? undefined
          : row.kind === "turn-fold" || row.kind === "working"
            ? "pb-1.5"
            : (row.kind === "message" &&
                  row.message.role === "assistant" &&
                  !row.showAssistantMeta) ||
                row.kind === "worktree-setup" ||
                row.kind === "event" ||
                row.kind === "attempt-fold" ||
                row.kind === "html-render" ||
                row.kind === "mcp-app"
              ? "pb-2"
              : "pb-4",
        (row.kind === "message" && row.message.role === "assistant") ||
          row.kind === "assistant-meta"
          ? "group/assistant"
          : null,
      )}
      data-timeline-row-id={row.id}
      data-timeline-row-kind={row.kind}
      data-message-id={
        row.kind === "message" || row.kind === "assistant-meta" ? row.message.id : undefined
      }
      data-message-role={row.kind === "message" ? row.message.role : undefined}
    >
      {isWorkLogRow ? (
        <WorkLogBlock
          continues={row.continuesWorkLog}
          layout={
            isExpandedToolGroup
              ? "group-content"
              : isExpandedToolGroupHeader
                ? "group-header"
                : "standalone"
          }
        >
          {row.kind === "work" ? (
            <WorkGroupSection
              anchorKey={row.id}
              groupedEntries={row.groupedEntries}
              isExpandedToolGroup={row.isExpandedToolGroup}
              displayLabel={row.displayLabel}
            />
          ) : null}
          {row.kind === "work-live" ? <LiveWorkEntryTimelineRow row={row} /> : null}
          {row.kind === "work-toggle" ? <WorkGroupToggleTimelineRow row={row} /> : null}
          {row.kind === "thinking" ? <ThinkingTimelineRow row={row} /> : null}
        </WorkLogBlock>
      ) : null}
      {row.kind === "turn-fold" ? <TurnFoldTimelineRow row={row} /> : null}
      {row.kind === "attempt-fold" ? <AttemptFoldTimelineRow row={row} /> : null}
      {row.kind === "context-compaction" ? <ContextCompactionTimelineRow row={row} /> : null}
      {row.kind === "message" && row.message.role === "user" ? <UserTimelineRow row={row} /> : null}
      {row.kind === "message" && row.message.role === "assistant" ? (
        <AssistantTimelineRow row={row} />
      ) : null}
      {row.kind === "assistant-meta" ? <AssistantMetaTimelineRow row={row} /> : null}
      {row.kind === "proposed-plan" ? <ProposedPlanTimelineRow row={row} /> : null}
      {row.kind === "html-render" ? <HtmlRenderTimelineRow row={row} /> : null}
      {row.kind === "mcp-app" ? <McpAppTimelineRow row={row} /> : null}
      {row.kind === "working" ? <WorkingTimelineRow row={row} /> : null}
      {row.kind === "worktree-setup" ? <WorktreeSetupTimelineRow row={row} /> : null}
      {row.kind === "event" ? <V2EventTimelineRow row={row} /> : null}
    </div>
  );
});

function WorktreeSetupTimelineRow({
  row,
}: {
  row: Extract<TimelineRow, { kind: "worktree-setup" }>;
}) {
  const ctx = use(TimelineRowCtx);
  const terminalId = row.snapshot.setupScript?.terminalId ?? null;
  const openTerminal = ctx.onOpenWorktreeSetupTerminal;
  const onOpenTerminal = useMemo(
    () => (openTerminal && terminalId ? () => openTerminal(terminalId) : null),
    [openTerminal, terminalId],
  );
  return (
    <WorktreeSetupCard
      snapshot={row.snapshot}
      embedded={row.embedded}
      onCancel={row.embedded ? null : ctx.onCancelWorktreeSetup}
      onWorkLocally={
        !row.embedded && row.snapshot.phase === "running" ? ctx.onWorktreeSetupWorkLocally : null
      }
      onOpenTerminal={onOpenTerminal}
    />
  );
}

function ContextCompactionTimelineRow({
  row,
}: {
  row: Extract<TimelineRow, { kind: "context-compaction" }>;
}) {
  return (
    <div
      role="separator"
      aria-label={row.label}
      className="mx-auto flex w-full max-w-(--chat-content-max-width) items-center gap-3 py-1 text-muted-foreground text-xs"
    >
      <span className="h-px flex-1 bg-border/70" />
      <span
        ref={row.active ? observeVisibleAnimation : undefined}
        className="relative shrink-0 overflow-hidden"
      >
        <span className="flex items-center gap-1.5">
          <Minimize2Icon aria-hidden="true" className="size-3" />
          {row.label}
        </span>
        {row.active ? (
          <ActivityShimmerOverlay>
            <span className="flex items-center gap-1.5">
              <Minimize2Icon aria-hidden="true" className="size-3" />
              {row.label}
            </span>
          </ActivityShimmerOverlay>
        ) : null}
      </span>
      <span className="h-px flex-1 bg-border/70" />
    </div>
  );
}

function TurnFoldTimelineRow({ row }: { row: Extract<TimelineRow, { kind: "turn-fold" }> }) {
  const ctx = use(TimelineRowCtx);

  return (
    <div className="group/timeline-row relative flex items-center gap-1 border-b border-border/60 pb-2 pe-0.5 pt-1">
      <button
        type="button"
        aria-expanded={row.expanded}
        data-scroll-anchor-ignore
        onClick={() => ctx.onToggleTurnFold(row.runId)}
        className="relative touch-hit flex cursor-pointer select-none items-center gap-1 rounded-md px-1 text-sm leading-relaxed text-muted-foreground tabular-nums transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/70"
      >
        <span>{row.label}</span>
        <MorphIcon className="size-3.5" icon={row.expanded ? ChevronDown : ChevronRight} />
      </button>
      <TimelineRowTimestamp
        createdAt={row.createdAt}
        timestampFormat={ctx.timestampFormat}
        className="ms-auto"
      />
    </div>
  );
}

function AttemptFoldTimelineRow({ row }: { row: Extract<TimelineRow, { kind: "attempt-fold" }> }) {
  const ctx = use(TimelineRowCtx);

  return (
    <button
      type="button"
      aria-expanded={row.expanded}
      data-scroll-anchor-ignore
      data-superseded-attempt-id={row.attemptId}
      onClick={() => ctx.onToggleAttemptFold(row.attemptId)}
      className="flex w-full cursor-pointer select-none items-center gap-2 rounded-md border border-border/60 bg-muted/20 px-2.5 py-2 text-left transition-colors hover:bg-muted/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/70"
    >
      <MorphIcon
        className="size-3.5 shrink-0 text-muted-foreground"
        icon={row.expanded ? ChevronDown : ChevronRight}
      />
      <span className="text-xs font-medium text-foreground/80">{row.label}</span>
      <span className="text-2xs text-muted-foreground">Cut off when you sent a message now</span>
    </button>
  );
}
