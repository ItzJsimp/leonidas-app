import {
  BotIcon,
  CheckIcon,
  CircleIcon,
  ChevronDownIcon,
  EllipsisIcon,
  ListIcon,
} from "lucide-react";
import type { TaskBoardTaskStatus, TaskBoardTeamMember } from "@t3tools/contracts";
import { LegendList, type LegendListRef } from "@legendapp/list/react";
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
} from "react";
import { flushSync } from "react-dom";

import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Menu,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuPopup,
  MenuSeparator,
  MenuTrigger,
} from "~/components/ui/menu";
import { cn } from "~/lib/utils";
import {
  ChecklistBar,
  DueChip,
  PriorityBadge,
  SharedBadge,
  StatusBadge,
  TaskFlagChips,
} from "./TaskBadges";
import { TruncatedText } from "../windows/shared/TruncatedText";
import { TasksEmpty } from "./TaskEmptyStates";
import { PresenceChips } from "./TaskPresence";
import { OwnerCell, ProjectChip, useLatest } from "./TaskRowParts";
import {
  isOpen,
  relativeTime,
  statusLabel,
  type TaskSectionGroup,
  type TaskView,
} from "./taskBoard.logic";
import type { TaskActions, TaskContext } from "./taskBoard.types";
import {
  buildListGroups,
  flattenGroups,
  isGroupExpanded,
  nextTaskId,
  projectNameFor,
  projectNameIndex,
  sameMember,
  visibleTaskIds,
  type ListGroup,
  type ListItem,
  type ListNavigationKey,
} from "./taskRows";

/** A status names the status to set: "done" completes, "todo" reopens. */
type RowAction = "send" | "claim" | "release" | TaskBoardTaskStatus;

/** Open statuses the row menu can move a card to. Complete covers Done. */
const MOVE_TO: ReadonlyArray<TaskBoardTaskStatus> = ["todo", "in_progress", "review", "blocked"];

type RowProps = {
  readonly task: TaskView;
  readonly selected: boolean;
  readonly tabbable: boolean;
  readonly busy: boolean;
  readonly now: number;
  readonly projectName: string | null;
  readonly showStatusBadge: boolean;
  readonly showOwner: boolean;
  readonly canSend: boolean;
  readonly mine: boolean;
  readonly team: ReadonlyArray<TaskBoardTeamMember>;
  readonly onSelect: (task: TaskView) => void;
  readonly onAction: (task: TaskView, action: RowAction) => void;
};

const TaskRow = memo(function TaskRow({
  task,
  selected,
  tabbable,
  busy,
  now,
  projectName,
  showStatusBadge,
  showOwner,
  canSend,
  mine,
  team,
  onSelect,
  onAction,
}: RowProps) {
  const open = isOpen(task);
  const done = task.status === "done";
  // Scrolling mounts many rows; the tooltip and the action menu are the heavy parts, so a row
  // mounts them only once a pointer or focus reaches it. Until then it shows plain stand-ins.
  const [live, setLive] = useState(false);
  const refocusMenu = useRef(false);
  const rowRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!live || !refocusMenu.current) return;
    refocusMenu.current = false;
    rowRef.current?.querySelector<HTMLElement>("[data-row-menu]")?.focus();
  }, [live]);
  const wake = live
    ? undefined
    : (event: FocusEvent) => {
        refocusMenu.current =
          event.target instanceof HTMLElement && event.target.hasAttribute("data-row-menu");
        setLive(true);
      };
  const titleClass = cn("min-w-0 text-sm", done && "text-muted-foreground line-through");
  const menuLabel = `Actions for ${task.title}`;
  return (
    <div
      aria-busy={busy}
      ref={rowRef}
      onFocus={wake}
      // Swap in the live title before the press starts: a press on a node that a later render
      // removes fires no click (fast clicks and touch taps on a long title did nothing).
      onPointerEnter={live ? undefined : () => flushSync(() => setLive(true))}
      role="listitem"
      className={cn(
        "@container group/row relative flex items-center gap-1 border-b pr-2 pl-3 hover:bg-accent/40",
        // A lighter fill keeps status badges at 4.5:1 in light mode; the left bar marks the selection.
        selected &&
          "bg-accent/50 before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-primary hover:bg-accent/50",
        busy && "opacity-60",
      )}
    >
      <Button
        variant="ghost-muted"
        size="icon-sm"
        disabled={busy}
        aria-label={`${done ? "Reopen" : "Complete"} ${task.title}`}
        onClick={() => onAction(task, done ? "todo" : "done")}
      >
        {done ? <CheckIcon /> : <CircleIcon />}
      </Button>
      <button
        aria-current={selected ? "true" : undefined}
        className="flex min-h-9 min-w-0 flex-1 cursor-pointer items-center gap-3 py-1.5 text-left outline-none focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
        data-row-id={task.id}
        onClick={() => onSelect(task)}
        tabIndex={tabbable ? 0 : -1}
        type="button"
      >
        <span className="sr-only">{statusLabel(task.status)}</span>
        {/* Title and its flags share the flexible column; every other column has a fixed width. */}
        <span className="flex min-w-0 flex-1 items-center gap-1.5">
          {live ? (
            <TruncatedText text={task.title} className={titleClass} />
          ) : (
            <span className={cn("block truncate", titleClass)}>{task.title}</span>
          )}
          <span className="hidden shrink-0 items-center gap-1 @min-[30rem]:flex">
            <TaskFlagChips task={task} now={now} />
            <SharedBadge task={task} />
          </span>
          <PresenceChips taskId={task.id} />
        </span>
        {showStatusBadge ? (
          <span className="hidden w-22 shrink-0 @min-[36rem]:flex">
            <StatusBadge status={task.status} />
          </span>
        ) : null}
        {projectName === null ? null : (
          <span className="hidden w-36 min-w-0 shrink-0 @min-[44rem]:flex">
            <ProjectChip name={projectName} />
          </span>
        )}
        <span className="hidden w-16 shrink-0 @min-[36rem]:flex">
          {task.priority === "critical" || task.priority === "high" ? (
            <PriorityBadge priority={task.priority} />
          ) : null}
        </span>
        <span className="hidden w-24 shrink-0 @min-[40rem]:flex">
          {done ? null : <DueChip due={task.due} now={now} />}
        </span>
        <span className="hidden w-24 shrink-0 @min-[52rem]:flex">
          <ChecklistBar checklist={task.checklist} />
        </span>
        {/* Only a card someone has taken shows an owner; "Anyone" on every row was noise. */}
        {showOwner ? (
          <span className="hidden w-24 shrink-0 @min-[60rem]:flex">
            {task.claimedBy ? <OwnerCell task={task} team={team} /> : null}
          </span>
        ) : null}
        <span className="hidden w-20 shrink-0 text-right text-muted-foreground text-xs tabular-nums @min-[36rem]:block">
          {relativeTime(task.updatedAt, now)}
        </span>
      </button>
      <div className="shrink-0 opacity-0 focus-within:opacity-100 group-hover/row:opacity-100 has-[[data-popup-open]]:opacity-100 pointer-coarse:opacity-100">
        {live ? (
          <Menu>
            <MenuTrigger
              render={
                <Button
                  aria-label={menuLabel}
                  data-row-menu
                  disabled={busy}
                  size="icon-xs"
                  variant="ghost-muted"
                />
              }
            >
              <EllipsisIcon />
            </MenuTrigger>
            <MenuPopup align="end">
              {canSend ? (
                <MenuItem onClick={() => onAction(task, "send")}>
                  <BotIcon />
                  Draft AI chat
                </MenuItem>
              ) : null}
              {open && !task.claimedBy ? (
                <MenuItem onClick={() => onAction(task, "claim")}>Take</MenuItem>
              ) : null}
              {open && mine ? (
                <MenuItem onClick={() => onAction(task, "release")}>Give back</MenuItem>
              ) : null}
              {open ? (
                <>
                  <MenuSeparator />
                  <MenuGroup>
                    <MenuGroupLabel>Move to</MenuGroupLabel>
                    {MOVE_TO.filter((status) => status !== task.status).map((status) => (
                      <MenuItem key={status} onClick={() => onAction(task, status)}>
                        {statusLabel(status)}
                      </MenuItem>
                    ))}
                  </MenuGroup>
                </>
              ) : null}
              <MenuSeparator />
              {done ? (
                <MenuItem onClick={() => onAction(task, "todo")}>Reopen</MenuItem>
              ) : (
                <MenuItem onClick={() => onAction(task, "done")}>Complete</MenuItem>
              )}
            </MenuPopup>
          </Menu>
        ) : (
          <Button
            aria-label={menuLabel}
            data-row-menu
            disabled={busy}
            size="icon-xs"
            variant="ghost-muted"
          >
            <EllipsisIcon />
          </Button>
        )}
      </div>
    </div>
  );
});

const NAV_KEYS: ReadonlySet<string> = new Set(["ArrowDown", "ArrowUp", "Home", "End"]);

function GroupHeader({
  group,
  expanded,
  onToggle,
}: {
  readonly group: ListGroup;
  readonly expanded: boolean;
  readonly onToggle: (key: string) => void;
}) {
  // The list role allows only list items as children, so the header button sits in one.
  return (
    <div role="listitem">
      <button
        aria-expanded={expanded}
        className="sticky top-0 z-10 flex h-8 w-full cursor-pointer items-center gap-2 border-b bg-background px-3 text-left font-medium text-muted-foreground text-xs outline-none hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
        onClick={() => onToggle(group.key)}
        type="button"
      >
        <ChevronDownIcon
          aria-hidden
          className={cn("size-3.5 shrink-0", !expanded && "-rotate-90")}
        />
        <span className="truncate text-foreground">{group.label}</span>
        <Badge size="sm" variant="secondary">
          {group.count}
        </Badge>
        {group.openCount !== null && group.openCount !== group.count ? (
          <span className="font-normal tabular-nums">{group.openCount} open</span>
        ) : null}
        {group.hint ? (
          <span className="min-w-0 flex-1 truncate font-normal">{group.hint}</span>
        ) : null}
      </button>
    </div>
  );
}

export function TaskListView(props: {
  tasks: ReadonlyArray<TaskView>;
  sections: ReadonlyArray<TaskSectionGroup>;
  groupBy: "state" | "owner" | "project" | "status" | "none";
  context: TaskContext;
  actions: TaskActions;
  selectedId: string | null;
  onSelect: (task: TaskView) => void;
  onClearFilters: (() => void) | null;
}) {
  const { tasks, sections, groupBy, context, actions, selectedId } = props;
  const actionsRef = useLatest(actions);
  const onSelectRef = useLatest(props.onSelect);
  const listRef = useRef<HTMLDivElement>(null);
  const virtualRef = useRef<LegendListRef | null>(null);
  const [overrides, setOverrides] = useState<Readonly<Record<string, boolean>>>({});

  const groups = useMemo(
    () => buildListGroups({ tasks, sections, groupBy, team: context.team, now: context.now }),
    [tasks, sections, groupBy, context.team, context.now],
  );
  const projectNames = useMemo(() => projectNameIndex(context.projects), [context.projects]);
  // Inside a single project the chip on every row only repeats the page title.
  const singleProject = useMemo(
    () => new Set(tasks.map((task) => task.section)).size <= 1,
    [tasks],
  );
  // The owner column shows only when some card in the list has an owner.
  const showOwner = useMemo(() => tasks.some((task) => task.claimedBy), [tasks]);
  const visibleIds = useMemo(() => visibleTaskIds(groups, overrides), [groups, overrides]);
  const tasksById = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks]);
  const items = useMemo(() => flattenGroups(groups, overrides), [groups, overrides]);
  const stickyHeaderIndices = useMemo(
    () => items.flatMap((item, index) => (item.kind === "header" ? [index] : [])),
    [items],
  );
  const tabbableId =
    selectedId !== null && visibleIds.includes(selectedId) ? selectedId : (visibleIds[0] ?? null);

  const select = useCallback((task: TaskView) => onSelectRef.current(task), [onSelectRef]);
  const toggle = useCallback(
    (key: string) => {
      const group = groups.find((candidate) => candidate.key === key);
      if (!group) return;
      setOverrides((current) => ({ ...current, [key]: !isGroupExpanded(group, current) }));
    },
    [groups],
  );
  const runAction = useCallback(
    (task: TaskView, action: RowAction) => {
      const current = actionsRef.current;
      switch (action) {
        case "send":
          return current.sendToAgent(task);
        case "claim":
          return current.claim(task);
        case "release":
          return current.release(task);
        default:
          return current.setStatus(task, action);
      }
    },
    [actionsRef],
  );

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!NAV_KEYS.has(event.key) || !(event.target instanceof HTMLElement)) return;
    const currentId = event.target.closest("[data-row-id]")?.getAttribute("data-row-id");
    // Only rows take part; group headers and menus keep their own key handling.
    if (currentId === undefined || currentId === null) return;
    event.preventDefault();
    const nextId = nextTaskId(visibleIds, currentId, event.key as ListNavigationKey);
    const next = nextId === null ? undefined : tasksById.get(nextId);
    if (!next || nextId === currentId) return;
    select(next);
    // The target row may be outside the rendered window: scroll it in, then focus it.
    const focusRow = () =>
      listRef.current
        ?.querySelector<HTMLElement>(`[data-row-id="${CSS.escape(nextId!)}"]`)
        ?.focus({ preventScroll: true });
    const index = items.findIndex((item) => item.kind === "task" && item.key === nextId);
    void Promise.resolve(
      index < 0
        ? undefined
        : virtualRef.current?.scrollToIndex({ index, animated: false, viewPosition: 0.5 }),
    ).then(() => requestAnimationFrame(focusRow));
  };

  if (groups.length === 0) {
    return <TasksEmpty icon={<ListIcon />} onClearFilters={props.onClearFilters} />;
  }

  const renderItem = ({ item }: { item: ListItem }) =>
    item.kind === "header" ? (
      <GroupHeader
        expanded={isGroupExpanded(item.group, overrides)}
        group={item.group}
        onToggle={toggle}
      />
    ) : (
      <TaskRow
        busy={actions.isBusy(item.task.id)}
        canSend={actions.canSendToAgent(item.task)}
        mine={sameMember(item.task.claimedBy, context.member)}
        team={context.team}
        now={context.now}
        onAction={runAction}
        onSelect={select}
        projectName={
          groupBy === "project" || singleProject ? null : projectNameFor(item.task, projectNames)
        }
        selected={selectedId === item.task.id}
        showStatusBadge={groupBy !== "status"}
        showOwner={showOwner}
        tabbable={tabbableId === item.task.id}
        task={item.task}
      />
    );

  // Only the rows in view (plus a margin) are mounted; a 400-task board stays light to switch.
  return (
    <div className="h-full min-h-0" onKeyDown={onKeyDown} ref={listRef} role="list">
      <LegendList<ListItem>
        ref={virtualRef}
        className="h-full overflow-y-auto"
        data={items}
        drawDistance={600}
        estimatedItemSize={37}
        extraData={renderItem}
        getItemType={(item) => item.kind}
        keyExtractor={(item) => item.key}
        renderItem={renderItem}
        stickyHeaderIndices={stickyHeaderIndices}
      />
    </div>
  );
}
