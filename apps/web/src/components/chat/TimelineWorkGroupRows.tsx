import {
  memo,
  use,
  useCallback,
  useMemo,
  useRef,
  useEffect,
  useState,
  useLayoutEffect,
  type ReactNode,
} from "react";
import {
  type MessagesTimelineRow,
  workEntryIsVisibleInGroup,
  resolveWorkGroupScrollIndex,
  shouldFollowWorkGroupAppend,
  liveWorkEntryLabel,
  type StableMessagesTimelineRowsState,
  computeStableMessagesTimelineRows,
} from "./MessagesTimeline.logic";
import {
  TimelineRowCtx,
  TimelineRevealCtx,
  type TimelineWorkEntry,
  WorkGroupViewCtx,
  type TimelineRow,
  TimelineRowActivityCtx,
} from "./TimelineRowContext";
import {
  ReasoningTraceContent,
  SimpleWorkEntryRow,
  useThreadReadTarget,
  threadReadLabel,
  remarkThoughtPreview,
  ThreadReadLabel,
  workEntryIconName,
} from "./TimelineWorkEntryRow";
import { formatDuration } from "@t3tools/shared/orchestrationTiming";
import { type LegendListRef, LegendList } from "@legendapp/list/react";
import { resolveWorkGroupScrollAnchor } from "@t3tools/client-runtime/work-log/scroll-anchor";
import { observeResize } from "~/lib/observeResize";
import { WorkLogList, WorkLogRow, WorkLogButton } from "./WorkLog";
import { cn } from "~/lib/utils";
import { getVirtualizedScrollFadeClassName } from "../ui/scroll-area";
import { observeVisibleAnimation } from "../../lib/visibleAnimation";
import { ActivityShimmerOverlay, TimelineRowTimestamp } from "./TimelineRowParts";
import { type WorktreeSetupSnapshot, type ToolActivityIcon } from "@t3tools/contracts";
import { Popover, PopoverTrigger, PopoverPopup } from "../ui/popover";
import { Button } from "../ui/button";
import { Spinner } from "../ui/spinner";
import { WorktreeSetupCard } from "./WorktreeSetupCard";
import { Minimize2Icon, XIcon } from "lucide-react";
import {
  type WorkEntryIconName,
  toolIconAcceptsTint,
  failedToolIconClassName,
  ToolActivityIconView,
} from "./TimelineToolActivityIcon";
import {
  getQuestionTextPreview,
  hasQuestionAnswer,
  getQuestionAnswerPreview,
} from "@t3tools/client-runtime/work-log/user-input";
import { workEntryDisplayIndicatesToolFailure } from "../../session-logic";
import { liveThoughtLine } from "@t3tools/client-runtime/work-log/presentation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { type TimestampFormat } from "@t3tools/contracts/settings";

// ---------------------------------------------------------------------------
// Extracted row sections — own their state / store subscriptions so changes
// re-render only the affected row, not the entire list.
// ---------------------------------------------------------------------------

/** Renders standalone activity or one bounded, virtualized expanded tool group. */
export const WorkGroupSection = memo(function WorkGroupSection({
  anchorKey,
  disclosureAnchorKey = anchorKey,
  groupedEntries,
  isExpandedToolGroup,
  displayLabel,
}: {
  anchorKey: string;
  disclosureAnchorKey?: string;
  groupedEntries: Extract<MessagesTimelineRow, { kind: "work" }>["groupedEntries"];
  isExpandedToolGroup: boolean;
  displayLabel?: string | undefined;
}) {
  const { workspaceRoot, routeThreadKey, onToggleWorkEntry } = use(TimelineRowCtx);
  const reveal = use(TimelineRevealCtx);
  const onToggleStandaloneEntry = useCallback(
    (collapsed: boolean) => onToggleWorkEntry(disclosureAnchorKey, collapsed),
    [disclosureAnchorKey, onToggleWorkEntry],
  );
  const nonEmptyEntries = useMemo(
    () => groupedEntries.filter((entry) => workEntryIsVisibleInGroup(entry, isExpandedToolGroup)),
    [groupedEntries, isExpandedToolGroup],
  );

  if (nonEmptyEntries.length === 0) return null;
  if (isExpandedToolGroup && nonEmptyEntries.every((entry) => entry.itemType === "reasoning")) {
    return <ReasoningTraceContent entries={nonEmptyEntries} />;
  }
  if (isExpandedToolGroup) {
    // A reveal remounts the list so it opens at the requested entry.
    const revealKey =
      reveal && nonEmptyEntries.some((entry) => entry.id === reveal.entryId)
        ? `:${reveal.nonce}`
        : "";
    return (
      <ExpandedWorkGroupEntries
        key={`${routeThreadKey}:${anchorKey}${revealKey}`}
        anchorKey={anchorKey}
        disclosureAnchorKey={disclosureAnchorKey}
        entries={nonEmptyEntries}
        workspaceRoot={workspaceRoot}
      />
    );
  }

  return (
    <section aria-label="Activity">
      {nonEmptyEntries.map((workEntry) => (
        <SimpleWorkEntryRow
          key={workEntry.id}
          workEntry={workEntry}
          workspaceRoot={workspaceRoot}
          displayLabel={displayLabel}
          onToggleEntry={onToggleStandaloneEntry}
        />
      ))}
    </section>
  );
});

function formatWorkingTimer(startIso: string, endIso: string): string | null {
  const startedAtMs = Date.parse(startIso);
  const endedAtMs = Date.parse(endIso);
  if (!Number.isFinite(startedAtMs) || !Number.isFinite(endedAtMs)) {
    return null;
  }

  const elapsedSeconds = Math.max(0, Math.floor((endedAtMs - startedAtMs) / 1000));
  if (elapsedSeconds < 60) {
    return `${elapsedSeconds}s`;
  }

  return formatDuration(elapsedSeconds * 1_000);
}

function formatWorkingTimerNow(startIso: string): string {
  return formatWorkingTimer(startIso, new Date().toISOString()) ?? "0s";
}

export function WorkingTimer({ createdAt }: { createdAt: string }) {
  const textRef = useRef<HTMLSpanElement>(null);
  const initialText = formatWorkingTimerNow(createdAt);

  useEffect(() => {
    const updateText = () => {
      if (textRef.current) {
        textRef.current.textContent = formatWorkingTimerNow(createdAt);
      }
    };
    updateText();
    const id = setInterval(updateText, 1000);
    return () => clearInterval(id);
  }, [createdAt]);

  return (
    <span ref={textRef} className="tabular-nums">
      {initialText}
    </span>
  );
}

// Matches the grouped WorkLog row's min-h-6.
const compactWorkEntryHeight = 24;

function ExpandedWorkGroupEntries({
  anchorKey,
  disclosureAnchorKey,
  entries,
  workspaceRoot,
}: {
  anchorKey: string;
  disclosureAnchorKey: string;
  entries: TimelineWorkEntry[];
  workspaceRoot: string | undefined;
}) {
  const { workGroupViewState: viewState, onToggleWorkEntry } = use(TimelineRowCtx);
  const [initialScrollIndex] = useState(() =>
    resolveWorkGroupScrollIndex(entries, viewState.scrollPositions.get(anchorKey)),
  );
  const [restoringPosition, setRestoringPosition] = useState(initialScrollIndex !== undefined);
  const listRef = useRef<LegendListRef>(null);
  const [expandedContentHeight, setExpandedContentHeight] = useState(0);
  const [fades, setFades] = useState({ top: false, bottom: false, viewportHeight: 0 });
  const [appendState, setAppendState] = useState({ entries, follow: false });
  // Capture the pre-change edge once per incoming array, before new layout
  // metrics arrive. Edge/viewport changes never turn a status update into a follow.
  if (appendState.entries !== entries) {
    setAppendState({
      entries,
      follow:
        fades.viewportHeight > 0 &&
        shouldFollowWorkGroupAppend(appendState.entries, entries, fades.bottom ? Infinity : 0),
    });
  }

  const groupView = useMemo(
    () => ({
      state: viewState,
      onToggleEntry: (collapsed: boolean) => onToggleWorkEntry(disclosureAnchorKey, collapsed),
    }),
    [disclosureAnchorKey, onToggleWorkEntry, viewState],
  );
  const updateScrollFades = useCallback(() => {
    const element = listRef.current?.getScrollableNode();
    if (!element) return;
    const distanceFromEnd = element.scrollHeight - element.clientHeight - element.scrollTop;
    const viewportHeight = element.clientHeight;
    const top = element.scrollTop > 1;
    const bottom = distanceFromEnd > 1;
    setFades((previous) =>
      previous.top === top &&
      previous.bottom === bottom &&
      previous.viewportHeight === viewportHeight
        ? previous
        : { top, bottom, viewportHeight },
    );
  }, []);

  const handleScroll = useCallback(() => {
    const state = listRef.current?.getState();
    const position = state && resolveWorkGroupScrollAnchor(state);
    if (position) {
      viewState.scrollPositions.set(anchorKey, {
        entryId: position.rowId,
        offset: position.offsetWithinRow,
      });
    }
    updateScrollFades();
  }, [anchorKey, updateScrollFades, viewState]);

  const handleLoad = useCallback(() => {
    const list = listRef.current;
    const element = list?.getScrollableNode();
    if (initialScrollIndex && list && element) {
      // Bootstrap can report the restored target before the DOM has applied it.
      // Reconcile once at load, before releasing the measured anchor row.
      const offset = Math.max(
        0,
        Math.min(list.getState().scroll, element.scrollHeight - element.clientHeight),
      );
      if (Math.abs(element.scrollTop - offset) > 1) {
        void list.scrollToOffset({ offset, animated: false });
      }
    }
    setRestoringPosition(false);
  }, [initialScrollIndex]);

  useLayoutEffect(() => {
    const element = listRef.current?.getScrollableNode();
    if (!element) return;
    updateScrollFades();
    const content = element.firstElementChild;
    return observeResize(content ? [element, content] : element, updateScrollFades);
  }, [updateScrollFades]);

  const renderEntry = useCallback(
    ({ item }: { item: TimelineWorkEntry }) => (
      <SimpleWorkEntryRow key={item.id} workEntry={item} workspaceRoot={workspaceRoot} />
    ),
    [workspaceRoot],
  );

  const updateExpandedContentHeight = useCallback(() => {
    const state = listRef.current?.getState();
    let height = 0;
    for (const entryId of viewState.expandedEntries) {
      if (state?.indexByKey(entryId) === undefined) continue;
      // Each open row adds room for its details, including while scrolled out of view.
      height += Math.max(
        0,
        (state.sizes.get(entryId) ?? compactWorkEntryHeight) - compactWorkEntryHeight,
      );
    }
    setExpandedContentHeight(height);
  }, [viewState]);

  useLayoutEffect(updateExpandedContentHeight, [entries, updateExpandedContentHeight]);

  return (
    <WorkGroupViewCtx value={groupView}>
      <WorkLogList>
        <LegendList
          ref={listRef}
          data={entries}
          extraData={workspaceRoot}
          keyExtractor={workEntryKey}
          renderItem={renderEntry}
          estimatedItemSize={compactWorkEntryHeight}
          drawDistance={240}
          recycleItems
          {...(initialScrollIndex ? { initialScrollIndex } : {})}
          maintainScrollAtEnd={
            appendState.follow ? { animated: false, on: { dataChange: true } } : false
          }
          maintainScrollAtEndThreshold={1 / Math.max(1, fades.viewportHeight)}
          // Measure the restored row even when an intra-row offset puts its
          // estimated bounds outside the list's small bootstrap render window.
          {...(restoringPosition && initialScrollIndex
            ? { alwaysRender: { indices: [initialScrollIndex.index] } }
            : {})}
          maintainVisibleContentPosition
          onLoad={handleLoad}
          onScroll={handleScroll}
          onLayout={updateScrollFades}
          onItemSizeChanged={updateExpandedContentHeight}
          tabIndex={0}
          role="region"
          aria-label="Tools used"
          data-tool-group-scroll
          style={{ maxHeight: `calc(min(18rem, 50dvh) + ${expandedContentHeight}px)` }}
          className={cn(
            "scrollbar-gutter-stable scroll-py-6 overflow-x-hidden rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/70",
            getVirtualizedScrollFadeClassName(fades),
          )}
        />
      </WorkLogList>
    </WorkGroupViewCtx>
  );
}

const workEntryKey = (entry: TimelineWorkEntry) => entry.id;

export function WorkingTimelineRow({ row }: { row: Extract<TimelineRow, { kind: "working" }> }) {
  const { isCompacting, isPreparingWorktree, backgroundWorktreeSetup, awaitingUser } =
    use(TimelineRowActivityCtx);
  // One span for every label so the setup-to-working handoff swaps text in
  // place instead of remounting the row.
  const shimmer = isPreparingWorktree || isCompacting;
  const label = isPreparingWorktree ? (
    "Making a separate copy…"
  ) : isCompacting ? (
    <CompactingLabel />
  ) : awaitingUser ? (
    // The turn clock counts the wait for the user, so it would read as work.
    "Waiting for your answer"
  ) : row.createdAt ? (
    <>
      Working for <WorkingTimer createdAt={row.createdAt} />
    </>
  ) : (
    "Working..."
  );
  return (
    <div className="border-b border-border/60 pb-2 pt-1">
      <div className="flex h-6 min-w-0 items-baseline gap-2 px-1 text-sm leading-relaxed text-muted-foreground tabular-nums">
        <span
          ref={shimmer ? observeVisibleAnimation : undefined}
          className="relative shrink-0 overflow-hidden whitespace-nowrap"
        >
          {label}
          {shimmer ? <ActivityShimmerOverlay>{label}</ActivityShimmerOverlay> : null}
        </span>
        {backgroundWorktreeSetup ? (
          <BackgroundWorktreeSetupChip snapshot={backgroundWorktreeSetup} />
        ) : null}
      </div>
    </div>
  );
}

/**
 * Trailing chip in the working header while a setup script still runs after
 * the agent started. Opens the stage list and live output in a popover; the
 * chip leaves with the script, so nothing lingers in the timeline.
 */
function BackgroundWorktreeSetupChip({ snapshot }: { snapshot: WorktreeSetupSnapshot }) {
  const ctx = use(TimelineRowCtx);
  const terminalId = snapshot.setupScript?.terminalId ?? null;
  const openTerminal = ctx.onOpenWorktreeSetupTerminal;
  const onOpenTerminal = useMemo(
    () => (openTerminal && terminalId ? () => openTerminal(terminalId) : null),
    [openTerminal, terminalId],
  );
  const scriptName = snapshot.setupScript?.name ?? "Setup steps";
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant="ghost-muted"
            size="micro"
            className="ml-auto min-w-0 shrink-0"
            aria-label={`${scriptName} is still running. Show setup progress.`}
          />
        }
      >
        <Spinner className="size-3 shrink-0" />
        <span className="truncate">{scriptName}</span>
      </PopoverTrigger>
      <PopoverPopup side="bottom" align="end" width="lg" padding="compact">
        <WorktreeSetupCard
          snapshot={snapshot}
          embedded
          onCancel={null}
          onWorkLocally={null}
          onOpenTerminal={onOpenTerminal}
        />
      </PopoverPopup>
    </Popover>
  );
}

function CompactingLabel() {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Minimize2Icon aria-hidden="true" className="size-3" />
      Compacting…
    </span>
  );
}

export function ThinkingTimelineRow({ row }: { row: Extract<TimelineRow, { kind: "thinking" }> }) {
  const ctx = use(TimelineRowCtx);
  const { isCompacting, isPreparingWorktree } = use(TimelineRowActivityCtx);
  // Reserve the activity row during setup so the handoff keeps the same height.
  if (isPreparingWorktree || isCompacting) return <WorkLogRow label="" />;
  const activity = <LiveActivityRow label="Thinking" iconName="brain" active shimmer />;
  const { groupId } = row;
  if (groupId === undefined) return activity;
  return (
    <button
      type="button"
      className="group/live-work flex min-h-6 w-full max-w-full cursor-pointer items-center rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/70"
      aria-expanded={row.expanded === true}
      onClick={() => ctx.onToggleWorkGroup(groupId, row.id)}
    >
      {activity}
    </button>
  );
}

function LiveActivityRow({
  label,
  iconName,
  toolIcon,
  failed = false,
  active = false,
  shimmer = false,
}: {
  label: ReactNode;
  iconName?: WorkEntryIconName;
  toolIcon?: ToolActivityIcon | undefined;
  failed?: boolean;
  active?: boolean;
  shimmer?: boolean;
}) {
  const animated = active && !failed;
  const showShimmer = animated && shimmer;
  return (
    <div
      ref={animated ? observeVisibleAnimation : undefined}
      className="relative min-h-6 w-fit max-w-full min-w-0 overflow-hidden rounded-md text-sm leading-relaxed"
    >
      <LiveActivityContent
        label={label}
        iconName={iconName}
        toolIcon={toolIcon}
        failed={failed}
        announceFailure={failed}
        active={animated && !shimmer}
      />
      {showShimmer ? (
        <ActivityShimmerOverlay>
          <LiveActivityContent label={label} iconName={iconName} toolIcon={toolIcon} highlighted />
        </ActivityShimmerOverlay>
      ) : null}
    </div>
  );
}

function LiveActivityContent({
  label,
  iconName,
  toolIcon,
  failed = false,
  announceFailure = false,
  active = false,
  highlighted = false,
}: {
  label: ReactNode;
  iconName: WorkEntryIconName | undefined;
  toolIcon?: ToolActivityIcon | undefined;
  failed?: boolean;
  announceFailure?: boolean;
  active?: boolean;
  highlighted?: boolean;
}) {
  const showTrailingFailureMark =
    failed && iconName !== undefined && !toolIconAcceptsTint(iconName, toolIcon);

  return (
    <WorkLogRow
      icon={
        iconName ? (
          <span
            className={cn(
              "flex size-4 items-center justify-center",
              failed
                ? failedToolIconClassName
                : highlighted
                  ? "text-foreground"
                  : "text-icon-muted",
            )}
            role={announceFailure ? "img" : undefined}
            aria-label={announceFailure ? "Tool failed" : undefined}
          >
            <ToolActivityIconView
              icon={toolIcon}
              fallbackName={iconName}
              className="block size-4 shrink-0 stroke-2"
              muted={!highlighted}
            />
          </span>
        ) : null
      }
      label={
        <span
          className={cn(
            "block truncate",
            highlighted && "text-foreground",
            active && "live-tool-shine",
          )}
        >
          {label}
        </span>
      }
      trailing={
        showTrailingFailureMark ? (
          <XIcon aria-hidden className={cn("size-3 shrink-0", failedToolIconClassName)} />
        ) : null
      }
    />
  );
}

export function LiveWorkEntryTimelineRow({
  row,
}: {
  row: Extract<TimelineRow, { kind: "work-live" }>;
}) {
  const ctx = use(TimelineRowCtx);
  const threadTarget = useThreadReadTarget(row.entry, ctx.activeThreadEnvironmentId);
  const questionHeading = row.entry.questionAnswer
    ? getQuestionTextPreview(row.entry.questionAnswer)
    : "";
  const label = questionHeading || liveWorkEntryLabel(row.entry, ctx.workspaceRoot, row.active);
  const threadLabel = threadReadLabel(label, threadTarget);

  const failed = workEntryDisplayIndicatesToolFailure(row.entry);
  // The expanded group already lists the thought, so the preview steps aside.
  const thoughtLine = row.thought && !row.expanded ? liveThoughtLine(row.thought.detail ?? "") : "";
  // While the thought itself streams, the status line just says Thinking.
  const thoughtIsStatus = thoughtLine !== "" && row.entry === row.thought;

  return (
    <button
      type="button"
      className={cn(
        "group/live-work flex w-full max-w-full cursor-pointer rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/70",
        thoughtLine ? "flex-col items-start" : "min-h-6 items-center",
      )}
      aria-label={
        failed
          ? `${thoughtLine ? `${thoughtLine} ` : ""}${threadLabel?.text ?? label}, tool call failed`
          : undefined
      }
      aria-expanded={row.expanded}
      onClick={() => ctx.onToggleWorkGroup(row.groupId, row.id)}
    >
      {thoughtLine ? (
        // The latest thought's first sentence sits above the status line as an
        // ordinary work-log row, so a finding never hides behind the next tool call.
        <WorkLogRow
          icon={
            <span className="flex size-4 items-center justify-center text-icon-muted">
              <ToolActivityIconView
                icon={undefined}
                fallbackName="brain"
                className="block size-4 shrink-0 stroke-2"
                muted
              />
            </span>
          }
          label={<span className="line-clamp-4">{thoughtLine}</span>}
          wrapLabel
        />
      ) : null}
      <LiveActivityRow
        label={
          thoughtIsStatus ? (
            row.active ? (
              "Thinking"
            ) : (
              "Thought"
            )
          ) : row.entry.questionAnswer && hasQuestionAnswer(row.entry.questionAnswer) ? (
            <span className="flex min-w-0 gap-1.5">
              <span className="min-w-0 truncate">{label}</span>
              <span className="min-w-0 truncate text-foreground">
                {getQuestionAnswerPreview(row.entry.questionAnswer)}
              </span>
            </span>
          ) : row.entry.itemType === "reasoning" ? (
            <ReactMarkdown
              remarkPlugins={[
                remarkGfm,
                [remarkThoughtPreview, row.active ? "Thinking" : "Thought"],
              ]}
            >
              {row.entry.detail ?? label}
            </ReactMarkdown>
          ) : threadLabel ? (
            <ThreadReadLabel
              label={threadLabel}
              environmentId={ctx.activeThreadEnvironmentId}
              linked={false}
            />
          ) : (
            label
          )
        }
        iconName={workEntryIconName(row.entry)}
        toolIcon={row.entry.toolIcon ?? row.entry.toolSource?.icon}
        failed={failed}
        active={row.active}
      />
    </button>
  );
}

export function toolGroupSummaryIconName(
  kind: Extract<TimelineRow, { kind: "work-toggle" }>["summaryKind"],
): WorkEntryIconName {
  switch (kind) {
    case "pull-request":
    case "link-pr":
    case "unlink-pr":
    case "list-prs":
    case "watch-pr":
    case "unwatch-pr":
      return "pull-request";
    case "read":
      return "eye";
    case "edit":
      return "square-pen";
    case "command":
      return "terminal";
    case "thread-create":
      return "leonidas";
    case "browser":
      return "browser";
    case "device":
      return "device";
    case "search":
      return "globe";
    case "code-search":
      return "search";
    case "other":
      return "wrench";
    case "dynamic-tool":
      return "hammer";
    case "reasoning":
      return "brain";
    case "agent-tool":
      return "bot";
    case "tone-tool":
      return "zap";
    case "update":
    case "mixed":
      return "hammer";
  }
}

export function WorkGroupToggleTimelineRow({
  row,
}: {
  row: Extract<TimelineRow, { kind: "work-toggle" }>;
}) {
  const ctx = use(TimelineRowCtx);
  return (
    <WorkGroupHeader
      label={row.summary}
      iconName={row.summaryToolIcon ?? row.toolSurface ?? toolGroupSummaryIconName(row.summaryKind)}
      toolIcon={row.toolIcon}
      failed={row.hasFailure}
      expanded={row.expanded}
      createdAt={row.createdAt}
      timestampFormat={ctx.timestampFormat}
      onToggle={() => ctx.onToggleWorkGroup(row.groupId, row.id)}
    />
  );
}

function WorkGroupHeader(props: {
  label: string;
  iconName: WorkEntryIconName;
  toolIcon?: ToolActivityIcon | undefined;
  failed?: boolean | undefined;
  active?: boolean | undefined;
  expanded: boolean;
  createdAt: string;
  timestampFormat: TimestampFormat;
  onToggle: () => void;
}) {
  return (
    <WorkLogButton
      ref={props.active && !props.failed ? observeVisibleAnimation : undefined}
      aria-label={props.failed ? `${props.label}, tool call failed` : props.label}
      aria-expanded={props.expanded}
      onClick={props.onToggle}
      icon={
        <ToolActivityIconView
          icon={props.toolIcon}
          fallbackName={props.iconName}
          className="size-4 shrink-0 stroke-2 text-icon-muted"
          muted
        />
      }
      label={
        <span className={cn("block truncate", props.active && !props.failed && "live-tool-shine")}>
          {props.label}
        </span>
      }
      trailing={
        <TimelineRowTimestamp createdAt={props.createdAt} timestampFormat={props.timestampFormat} />
      }
    />
  );
}

// ---------------------------------------------------------------------------
// Structural sharing — reuse old row references when data hasn't changed
// so LegendList (and React) can skip re-rendering unchanged items.
// ---------------------------------------------------------------------------

/** Returns a structurally-shared copy of `rows`: for each row whose content
 *  hasn't changed since last call, the previous object reference is reused. */
export function useStableRows(
  rows: MessagesTimelineRow[],
  identity: string,
): MessagesTimelineRow[] {
  const prevState = useRef<StableMessagesTimelineRowsState>({
    byId: new Map<string, MessagesTimelineRow>(),
    result: [],
  });
  const prevIdentity = useRef(identity);

  return useMemo(() => {
    const previous =
      prevIdentity.current === identity
        ? prevState.current
        : { byId: new Map<string, MessagesTimelineRow>(), result: [] };
    prevIdentity.current = identity;
    const nextState = computeStableMessagesTimelineRows(rows, previous);
    prevState.current = nextState;
    return nextState.result;
  }, [identity, rows]);
}
