import type { TaskBoardTeamMember, TaskBoardTaskStatus } from "@t3tools/contracts";
import { BotIcon, EllipsisIcon, KanbanIcon } from "lucide-react";
import { memo, useCallback, useMemo, useRef, useState, type DragEvent } from "react";

import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Menu,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuPopup,
  MenuTrigger,
} from "~/components/ui/menu";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";
import { cn } from "~/lib/utils";
import { ChecklistBar, DueChip, PriorityBadge, SharedBadge, TaskFlagChips } from "./TaskBadges";
import { TasksEmpty, type TasksEmptyContext } from "./TaskEmptyStates";
import { PresenceChips } from "./TaskPresence";
import { OwnerCell, ProjectChip, useLatest } from "./TaskRowParts";
import { groupByStatus, statusLabel, type TaskView } from "./taskBoard.logic";
import type { TaskActions, TaskContext } from "./taskBoard.types";
import {
  COLUMN_PAGE,
  DONE_COLUMN_PAGE,
  moveTargets,
  pageColumn,
  projectNameFor,
  projectNameIndex,
  statusChangeForDrop,
} from "./taskRows";

type KanbanCardProps = {
  readonly task: TaskView;
  readonly selected: boolean;
  readonly busy: boolean;
  readonly dragging: boolean;
  readonly now: number;
  readonly projectName: string | null;
  readonly team: ReadonlyArray<TaskBoardTeamMember>;
  readonly canSend: boolean;
  readonly onSelect: (task: TaskView) => void;
  readonly onMove: (task: TaskView, status: TaskBoardTaskStatus) => void;
  readonly onSend: (task: TaskView) => void;
  readonly onDragStart: (event: DragEvent<HTMLElement>, task: TaskView) => void;
  readonly onDragEnd: () => void;
};

const KanbanCard = memo(function KanbanCard({
  task,
  selected,
  busy,
  dragging,
  now,
  projectName,
  team,
  canSend,
  onSelect,
  onMove,
  onSend,
  onDragStart,
  onDragEnd,
}: KanbanCardProps) {
  const closed = task.status === "done";
  return (
    <article
      aria-busy={busy}
      aria-current={selected ? "true" : undefined}
      className={cn(
        "group/card flex cursor-grab flex-col gap-1.5 rounded-lg border bg-card p-2 text-card-foreground shadow-xs/5 active:cursor-grabbing",
        selected && "ring-2 ring-ring",
        (dragging || busy) && "opacity-50",
      )}
      data-task-id={task.id}
      draggable={!busy}
      onClick={() => onSelect(task)}
      onDragEnd={onDragEnd}
      onDragStart={(event) => onDragStart(event, task)}
    >
      <div className="flex items-start gap-1.5">
        <button
          className="min-w-0 flex-1 cursor-pointer text-left font-medium text-sm leading-snug outline-none focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          onClick={(event) => {
            event.stopPropagation();
            onSelect(task);
          }}
          type="button"
        >
          <span className="line-clamp-2 wrap-anywhere">{task.title}</span>
        </button>
        <div
          className="-my-0.5 -mr-1 flex shrink-0 items-center opacity-0 group-focus-within/card:opacity-100 group-hover/card:opacity-100 has-[[data-popup-open]]:opacity-100 pointer-coarse:opacity-100"
          onClick={(event) => event.stopPropagation()}
        >
          {canSend ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    aria-label={`Draft an AI chat for ${task.title}`}
                    disabled={busy}
                    onClick={() => onSend(task)}
                    size="icon-xs"
                    variant="ghost-muted"
                  />
                }
              >
                <BotIcon />
              </TooltipTrigger>
              <TooltipPopup>Draft AI chat</TooltipPopup>
            </Tooltip>
          ) : null}
          <Menu>
            <MenuTrigger
              render={
                <Button
                  aria-label={`Move ${task.title} to another column`}
                  disabled={busy}
                  size="icon-xs"
                  variant="ghost-muted"
                />
              }
            >
              <EllipsisIcon />
            </MenuTrigger>
            <MenuPopup align="end">
              <MenuGroup>
                <MenuGroupLabel>Move to</MenuGroupLabel>
                {moveTargets(task.status).map((status) => (
                  <MenuItem key={status} onClick={() => onMove(task, status)}>
                    {statusLabel(status)}
                  </MenuItem>
                ))}
              </MenuGroup>
            </MenuPopup>
          </Menu>
        </div>
      </div>
      {/* A done card keeps only its title, so the narrow Done column stays light. */}
      {closed ? null : (
        <>
          <div className="flex flex-wrap items-center gap-1">
            <PriorityBadge priority={task.priority} />
            <DueChip due={task.due} now={now} />
            <TaskFlagChips task={task} now={now} />
            <SharedBadge task={task} />
            <ProjectChip name={projectName} />
          </div>
          <ChecklistBar checklist={task.checklist} />
        </>
      )}
      <PresenceChips taskId={task.id} />
      {/* Only a card someone has taken shows an owner; "Anyone" on every card was noise. */}
      {task.claimedBy ? <OwnerCell task={task} team={team} /> : null}
    </article>
  );
});

type ColumnProps = {
  readonly status: TaskBoardTaskStatus;
  readonly tasks: ReadonlyArray<TaskView>;
  readonly hidden: number;
  readonly page: number;
  readonly isOver: boolean;
  readonly selectedId: string | null;
  readonly draggingId: string | null;
  readonly now: number;
  readonly projectNames: ReadonlyMap<string, string>;
  readonly team: ReadonlyArray<TaskBoardTeamMember>;
  readonly isBusy: (taskId: string) => boolean;
  readonly canSend: (task: TaskView) => boolean;
  readonly onShowMore: (status: TaskBoardTaskStatus) => void;
  readonly onColumnDragOver: (event: DragEvent<HTMLElement>, status: TaskBoardTaskStatus) => void;
  readonly onColumnDragLeave: (event: DragEvent<HTMLElement>, status: TaskBoardTaskStatus) => void;
  readonly onColumnDrop: (event: DragEvent<HTMLElement>, status: TaskBoardTaskStatus) => void;
  readonly card: Pick<
    KanbanCardProps,
    "onSelect" | "onMove" | "onSend" | "onDragStart" | "onDragEnd"
  >;
};

function KanbanColumn({
  status,
  tasks,
  hidden,
  page,
  isOver,
  selectedId,
  draggingId,
  now,
  projectNames,
  team,
  isBusy,
  canSend,
  onShowMore,
  onColumnDragOver,
  onColumnDragLeave,
  onColumnDrop,
  card,
}: ColumnProps) {
  const label = statusLabel(status);
  return (
    <section
      aria-label={label}
      className={cn(
        "flex h-full w-[min(80vw,14rem)] shrink-0 snap-start flex-col rounded-xl border bg-muted/40 sm:w-56",
        // A wide pane fits every column: open columns share the width; Done and empty ones stay narrow.
        status === "done" || tasks.length + hidden === 0
          ? "@4xl/board:flex-[0_0_11rem]"
          : "@4xl/board:min-w-0 @4xl/board:flex-[1_1_0%]",
        isOver && "bg-accent/60 ring-2 ring-primary/50",
      )}
      onDragLeave={(event) => onColumnDragLeave(event, status)}
      onDragOver={(event) => onColumnDragOver(event, status)}
      onDrop={(event) => onColumnDrop(event, status)}
    >
      <header className="flex items-center gap-2 px-3 py-2">
        <h3 className="font-medium text-sm">{label}</h3>
        <Badge size="sm" variant="secondary">
          {tasks.length + hidden}
        </Badge>
      </header>
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain p-2 pt-0">
        {tasks.length === 0 ? (
          <p className="rounded-lg border border-dashed px-3 py-6 text-center text-muted-foreground text-xs">
            {isOver ? "Drop to move here" : "No tasks. Drag a card here to move it."}
          </p>
        ) : (
          tasks.map((task) => (
            <KanbanCard
              key={task.id}
              busy={isBusy(task.id)}
              canSend={(task.status === "todo" || task.status === "in_progress") && canSend(task)}
              dragging={draggingId === task.id}
              now={now}
              projectName={projectNameFor(task, projectNames)}
              team={team}
              selected={selectedId === task.id}
              task={task}
              {...card}
            />
          ))
        )}
        {hidden > 0 ? (
          <Button onClick={() => onShowMore(status)} size="sm" variant="ghost-muted">
            Show {Math.min(page, hidden)} more
            <span className="text-muted-foreground tabular-nums">({hidden} hidden)</span>
          </Button>
        ) : null}
      </div>
    </section>
  );
}

export function TaskKanbanView(props: {
  tasks: ReadonlyArray<TaskView>;
  context: TaskContext;
  actions: TaskActions;
  selectedId: string | null;
  onSelect: (task: TaskView) => void;
  empty: TasksEmptyContext;
}) {
  const { tasks, context, actions, selectedId } = props;
  const actionsRef = useLatest(actions);
  const onSelectRef = useLatest(props.onSelect);
  const dragged = useRef<TaskView | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overStatus, setOverStatus] = useState<TaskBoardTaskStatus | null>(null);
  // Extra cards per column the user asked for with "Show more".
  const [extra, setExtra] = useState<Readonly<Partial<Record<TaskBoardTaskStatus, number>>>>({});

  const columns = useMemo(
    () =>
      groupByStatus(tasks).map((column) => {
        const { visible, hidden, page } = pageColumn(
          column.status,
          column.tasks,
          extra[column.status] ?? 0,
        );
        return { status: column.status, tasks: visible, hidden, page };
      }),
    [tasks, extra],
  );
  const projectNames = useMemo(() => projectNameIndex(context.projects), [context.projects]);

  const select = useCallback((task: TaskView) => onSelectRef.current(task), [onSelectRef]);
  const move = useCallback(
    (task: TaskView, status: TaskBoardTaskStatus) => actionsRef.current.setStatus(task, status),
    [actionsRef],
  );
  const send = useCallback((task: TaskView) => actionsRef.current.sendToAgent(task), [actionsRef]);
  const isBusy = useCallback((id: string) => actionsRef.current.isBusy(id), [actionsRef]);
  const canSend = useCallback(
    (task: TaskView) => actionsRef.current.canSendToAgent(task),
    [actionsRef],
  );

  const clearDrag = useCallback(() => {
    dragged.current = null;
    setDraggingId(null);
    setOverStatus(null);
  }, []);
  const dragStart = useCallback((event: DragEvent<HTMLElement>, task: TaskView) => {
    dragged.current = task;
    event.dataTransfer.effectAllowed = "move";
    // Firefox only starts a drag when some data is set.
    event.dataTransfer.setData("text/plain", task.id);
    setDraggingId(task.id);
  }, []);
  const columnDragOver = useCallback(
    (event: DragEvent<HTMLElement>, status: TaskBoardTaskStatus) => {
      if (!dragged.current) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      setOverStatus(status);
    },
    [],
  );
  const columnDragLeave = useCallback(
    (event: DragEvent<HTMLElement>, status: TaskBoardTaskStatus) => {
      if (
        event.relatedTarget instanceof Node &&
        event.currentTarget.contains(event.relatedTarget)
      ) {
        return;
      }
      setOverStatus((current) => (current === status ? null : current));
    },
    [],
  );
  const columnDrop = useCallback(
    (event: DragEvent<HTMLElement>, status: TaskBoardTaskStatus) => {
      const task = dragged.current;
      if (!task) return;
      event.preventDefault();
      clearDrag();
      const next = statusChangeForDrop(task, status);
      if (next) actionsRef.current.setStatus(task, next);
    },
    [actionsRef, clearDrag],
  );
  const showMore = useCallback(
    (status: TaskBoardTaskStatus) =>
      setExtra((current) => ({
        ...current,
        [status]: (current[status] ?? 0) + (status === "done" ? DONE_COLUMN_PAGE : COLUMN_PAGE),
      })),
    [],
  );
  const cardHandlers = useMemo(
    () => ({
      onSelect: select,
      onMove: move,
      onSend: send,
      onDragStart: dragStart,
      onDragEnd: clearDrag,
    }),
    [select, move, send, dragStart, clearDrag],
  );

  if (tasks.length === 0) {
    return <TasksEmpty icon={<KanbanIcon />} {...props.empty} />;
  }

  return (
    <div className="@container/board flex h-full min-h-0 snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain p-3">
      {columns.map((column) => (
        <KanbanColumn
          key={column.status}
          canSend={canSend}
          card={cardHandlers}
          draggingId={draggingId}
          hidden={column.hidden}
          isBusy={isBusy}
          isOver={overStatus === column.status}
          now={context.now}
          onColumnDragLeave={columnDragLeave}
          onColumnDragOver={columnDragOver}
          onColumnDrop={columnDrop}
          onShowMore={showMore}
          page={column.page}
          projectNames={projectNames}
          team={context.team}
          selectedId={selectedId}
          status={column.status}
          tasks={column.tasks}
        />
      ))}
    </div>
  );
}
