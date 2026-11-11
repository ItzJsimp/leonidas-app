import { type AssistantCitationTarget } from "./AssistantCitationSource";
import { type LegendListRef } from "@legendapp/list/react";
import { type TimestampFormat } from "@t3tools/contracts/settings";
import {
  type ScopedThreadRef,
  type ServerProviderSkill,
  type ServerProvider,
  type EnvironmentId,
  type MessageId,
  type RunId,
  type OrchestrationV2TurnItem,
  ThreadId,
  type RunAttemptId,
  type WorktreeSetupSnapshot,
} from "@t3tools/contracts";
import { type TimelineRun } from "./useStableHandoffRuns";
import { type CodexArtifactTemplate } from "@t3tools/shared/codexArtifactTemplates";
import { ExpandedImagePreview } from "./ExpandedImagePreview";
import { type ChatFileAttachment } from "../../types";
import { type MouseEvent, createContext } from "react";
import { type WorkGroupScrollAnchor, type MessagesTimelineRow } from "./MessagesTimeline.logic";

// ---------------------------------------------------------------------------
// Context — shared state consumed by every row component via Context.
// Propagates through LegendList's memo boundaries for shared callbacks and
// non-row-scoped state. `nowIso` is intentionally excluded — self-ticking
// components (LiveElapsed) handle it.
// ---------------------------------------------------------------------------

export interface TimelineRowSharedState {
  citationRequest: AssistantCitationTarget | null;
  listRef: React.RefObject<LegendListRef | null>;
  timestampFormat: TimestampFormat;
  routeThreadKey: string;
  threadRef: ScopedThreadRef | null;
  markdownCwd: string | undefined;
  resolvedTheme: "light" | "dark";
  workspaceRoot: string | undefined;
  skills: ReadonlyArray<Pick<ServerProviderSkill, "name" | "displayName">>;
  /** Provider snapshots for resolving handoff endpoints to icons + model names. */
  providerStatuses: ReadonlyArray<ServerProvider>;
  /** Projection runs, for recovering handoff models on legacy items. */
  runs: ReadonlyArray<TimelineRun>;
  activeThreadEnvironmentId: EnvironmentId;
  onRevertToTurnCount: (
    targetTurnCount: number,
    messageId: MessageId,
    restoreFiles?: boolean,
  ) => void;
  onUseArtifactTemplate: (template: CodexArtifactTemplate) => void;
  onDockReply: ((text: string) => void) | undefined;
  onRetryRun?: ((runId: RunId) => void) | undefined;
  /** Sends text an MCP App asked to post, after the user approved it. */
  onSendAppMessage: ((text: string) => Promise<void>) | undefined;
  /**
   * An MCP App row entering or leaving full screen. The row stays rendered
   * and the list stops following new output meanwhile, so the app is not
   * virtualized away while the reader is using it.
   */
  onAppFullscreenChange: (rowId: string, fullscreen: boolean) => void;
  onRunShellCommand: ((command: string) => void) | undefined;
  findActive: boolean;
  onImageExpand: (preview: ExpandedImagePreview) => void;
  displayThreadKey?: string;
  onOpenTurnDiff: (runId: RunId, filePath?: string) => void;
  onOpenThread: (threadId: OrchestrationV2TurnItem["threadId"]) => void;
  onForkFromRun: (input: {
    readonly sourceThreadId: ThreadId;
    readonly runId: RunId;
  }) => Promise<void>;
  onRollbackCheckpoint: (input: {
    readonly checkpointId: string;
    readonly scopeId: string;
  }) => void;
  onToggleTurnFold: (runId: RunId) => void;
  onToggleAttemptFold: (attemptId: RunAttemptId) => void;
  onFileOpen: (attachment: ChatFileAttachment) => void;
  onFileDownload: (attachment: ChatFileAttachment) => void;
  openPullRequest: (event: MouseEvent<HTMLElement>, url: string) => void;
  onToggleWorkGroup: (groupId: string, anchorKey: string) => void;
  onToggleWorkEntry: (anchorKey: string, collapsed: boolean) => void;
  onCancelWorktreeSetup: (() => void) | null;
  retryableWorkspacePreparationRunIds: ReadonlySet<RunId>;
  onRetryWorkspacePreparation: ((runId: RunId) => void) | null;
  onWorktreeSetupWorkLocally: (() => void) | null;
  onOpenWorktreeSetupTerminal: ((terminalId: string) => void) | null;
  workGroupViewState: WorkGroupViewState;
}

export interface TimelineRowActivityState {
  isWorking: boolean;
  isCompacting: boolean;
  isRevertingCheckpoint: boolean;
  activeTurnInProgress: boolean;
  /** The agent waits on an approval or an answer from the user. */
  awaitingUser: boolean;
  isPreparingWorktree: boolean;
  latestRunId: RunId | null;
  /**
   * A worktree setup whose script is still running after the agent took
   * over. The working header shows it as a chip with a popover; the stage
   * list itself has already left the timeline.
   */
  backgroundWorktreeSetup: WorktreeSetupSnapshot | null;
}

export const TimelineRowCtx = createContext<TimelineRowSharedState>(null!);

export const TimelineRowActivityCtx = createContext<TimelineRowActivityState>(null!);

/** A tool call the activity bar asked to show; its row opens and briefly highlights. */
export interface TimelineReveal {
  readonly entryId: string;
  readonly nonce: number;
  /** Rows that mount later (scrolled into the list) skip a reveal older than a few seconds. */
  readonly at: number;
}

export const TimelineRevealCtx = createContext<TimelineReveal | null>(null);

export interface WorkGroupViewState {
  scrollPositions: Map<string, WorkGroupScrollAnchor>;
  expandedEntries: Set<string>;
}

export const WorkGroupViewCtx = createContext<{
  state: WorkGroupViewState;
  onToggleEntry: (collapsed: boolean) => void;
} | null>(null);

export interface TimelinePositionState {
  readonly contentLength?: number;
  readonly scroll?: number;
  readonly scrollLength?: number;
  readonly positionAtIndex?: (index: number) => number | undefined;
  readonly sizeAtIndex?: (index: number) => number | undefined;
}

// ---------------------------------------------------------------------------
// TimelineRowContent — the actual row component
// ---------------------------------------------------------------------------

export type TimelineWorkEntry = Extract<
  MessagesTimelineRow,
  { kind: "work" }
>["groupedEntries"][number];

export type TimelineRow = MessagesTimelineRow;
