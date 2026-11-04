import { LegendList, type LegendListRef } from "@legendapp/list/react";
import type { TaskBoardTeamMember } from "@t3tools/contracts";
import {
  CheckIcon,
  ChevronRightIcon,
  GripVerticalIcon,
  PanelRightOpenIcon,
  TableIcon,
} from "lucide-react";
import {
  memo,
  useCallback,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { cn } from "~/lib/utils";

import { TasksEmpty, type TasksEmptyContext } from "./TaskEmptyStates";
import { useLatest } from "./TaskRowParts";
import {
  DueText,
  GatesBar,
  OwnerName,
  PriorityMark,
  StatusPill,
  UpdatedText,
} from "./TaskTableCells";
import { TaskTableHeader, type LayoutChange } from "./TaskTableHeader";
import {
  clampWidth,
  resizeColumn,
  type ColumnLayout,
  type Density,
  type TasksLayout,
} from "./taskLayout.logic";
import { isOpen, type TaskSectionGroup, type TaskView } from "./taskBoard.logic";
import type { TaskActions, TaskContext } from "./taskBoard.types";
import {
  buildListGroups,
  flattenGroups,
  isGroupExpanded,
  nextTaskId,
  planRowMove,
  projectNameFor,
  projectNameIndex,
  stepDrop,
  GROUP_DROP_PREFIX,
  visibleTaskIds,
  withManualOrder,
  type ListGroup,
  type ListItem,
  type ListNavigationKey,
  type RowDrop,
  type RowMovePlan,
} from "./taskRows";
import { useRowDrag } from "./useRowDrag";

const ROW_HEIGHT: Record<Density, number> = { compact: 32, default: 40, comfortable: 52 };
const GROUP_HEIGHT = 44;
// The gutter holds the drag grip and the done box.
const GUTTER = 48;
const GRIP_SIZE = 20;
const NAV_KEYS: ReadonlySet<string> = new Set(["ArrowDown", "ArrowUp", "Home", "End"]);

// The row tints on hover and when selected. Sticky cells are opaque, so they repeat the tint on
// a layer behind their content.
const ROW_TINT = "hover:bg-muted/45 data-[selected=true]:bg-accent/70";
const STICKY_SURFACE =
  "bg-background before:absolute before:inset-0 before:-z-10 group-hover/row:before:bg-muted/45 group-data-[selected=true]/row:before:bg-accent/70";

/** The grid template and total width of the shown columns, set once on the table as variables. */
export function columnTemplate(columns: ReadonlyArray<ColumnLayout>) {
  const shown = columns.filter((column) => !column.hidden);
  const width = GUTTER + shown.reduce((sum, column) => sum + column.width, 0);
  return {
    template: `${GUTTER}px ${shown.map((column) => `${column.width}px`).join(" ")} minmax(0, 1fr)`,
    width,
  };
}

type RowProps = {
  readonly task: TaskView;
  readonly index: number;
  readonly columns: ReadonlyArray<ColumnLayout>;
  readonly wrap: ReadonlySet<string>;
  readonly freezeName: boolean;
  readonly height: number;
  readonly selected: boolean;
  readonly tabbable: boolean;
  readonly now: number;
  readonly projectName: string | null;
  readonly team: ReadonlyArray<TaskBoardTeamMember>;
  readonly onSelect: (task: TaskView) => void;
  readonly onToggleDone: (task: TaskView) => void;
  readonly dragging: boolean;
  readonly dropEdge: RowDrop["edge"] | null;
};

function DropLine({ edge }: { readonly edge: RowDrop["edge"] }) {
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-x-0 z-[3] h-0.5 rounded-full bg-primary",
        edge === "before" ? "-top-px" : "-bottom-px",
      )}
    />
  );
}

function Cell({ task, column, props }: { task: TaskView; column: ColumnLayout; props: RowProps }) {
  switch (column.key) {
    case "status":
      return <StatusPill status={task.status} />;
    case "priority":
      return <PriorityMark priority={task.priority} />;
    case "project":
      return props.projectName ? (
        <span className="truncate text-xs">{props.projectName}</span>
      ) : null;
    case "due":
      return <DueText due={task.due} now={props.now} />;
    case "gates":
      return <GatesBar checklist={task.checklist} />;
    case "owner":
      return <OwnerName task={task} team={props.team} />;
    case "updated":
      return <UpdatedText at={task.updatedAt} now={props.now} />;
    default:
      return null;
  }
}

const TableRow = memo(function TableRow(props: RowProps) {
  const { task, columns, wrap, freezeName, selected, tabbable, index } = props;
  const done = task.status === "done";
  const wrapTitle = wrap.has("title");
  return (
    <div
      role="row"
      aria-rowindex={index + 2}
      aria-selected={selected}
      data-row-id={task.id}
      data-selected={selected}
      tabIndex={tabbable ? 0 : -1}
      style={{ height: props.height }}
      onClick={() => props.onSelect(task)}
      className={cn(
        "group/row relative grid w-[var(--task-width)] min-w-full cursor-default border-b border-border/60 outline-none transition-opacity duration-150 [grid-template-columns:var(--task-cols)] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
        ROW_TINT,
        props.dragging && "opacity-40",
      )}
    >
      {props.dropEdge ? <DropLine edge={props.dropEdge} /> : null}
      <div
        role="gridcell"
        className={cn(
          // The left of the gutter holds the table's one drag grip, shown on the hovered row.
          "flex items-center pl-7",
          freezeName && ["sticky left-0 z-[1]", STICKY_SURFACE],
        )}
      >
        <button
          type="button"
          role="checkbox"
          aria-checked={done}
          aria-label={done ? `Reopen ${task.title}` : `Mark ${task.title} done`}
          onClick={(event) => {
            event.stopPropagation();
            props.onToggleDone(task);
          }}
          className={cn(
            "grid size-4 cursor-pointer place-items-center rounded-sm border outline-none transition-[background-color,border-color,transform] duration-150 ease-out focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset active:scale-90",
            done
              ? "border-success bg-success text-white"
              : "border-muted-foreground/45 hover:border-foreground",
          )}
        >
          {done ? <CheckIcon aria-hidden className="size-3" strokeWidth={3} /> : null}
        </button>
      </div>
      {columns.map((column) =>
        column.key === "title" ? (
          <div
            key="title"
            role="gridcell"
            data-col="title"
            className={cn(
              "flex min-w-0 items-center gap-2 border-r border-border/40 px-2",
              freezeName && ["sticky z-[1]", STICKY_SURFACE],
            )}
            style={freezeName ? { left: GUTTER } : undefined}
          >
            <span
              className={cn(
                "min-w-0 flex-1 text-sm",
                wrapTitle ? "line-clamp-2 break-words leading-snug" : "truncate",
                done ? "text-muted-foreground line-through" : "font-medium text-foreground",
              )}
            >
              {task.title}
            </span>
            <button
              type="button"
              aria-label={`Open ${task.title}`}
              tabIndex={-1}
              onClick={(event) => {
                event.stopPropagation();
                props.onSelect(task);
              }}
              className="hidden h-6 shrink-0 cursor-pointer items-center gap-1 rounded-md border border-border bg-background px-1.5 text-muted-foreground text-xs hover:text-foreground group-hover/row:inline-flex"
            >
              <PanelRightOpenIcon aria-hidden className="size-3.5" />
              Open
            </button>
          </div>
        ) : (
          <div
            key={column.key}
            role="gridcell"
            data-col={column.key}
            className={cn(
              "flex min-w-0 items-center px-2",
              wrap.has(column.key) ? "whitespace-normal" : "overflow-hidden whitespace-nowrap",
            )}
          >
            <Cell task={task} column={column} props={props} />
          </div>
        ),
      )}
      <div role="presentation" />
    </div>
  );
});

function GroupRow({
  group,
  expanded,
  onToggle,
  dropTarget,
}: {
  readonly group: ListGroup;
  readonly expanded: boolean;
  readonly onToggle: (key: string) => void;
  readonly dropTarget: boolean;
}) {
  return (
    <div
      role="row"
      data-group-key={group.key}
      style={{ height: GROUP_HEIGHT }}
      className={cn(
        "relative flex w-[var(--task-width)] min-w-full items-end",
        dropTarget && "bg-accent/50",
      )}
    >
      {dropTarget ? <DropLine edge="after" /> : null}
      <div role="gridcell" className="sticky left-0 flex items-center gap-2 pb-1.5 pl-2">
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => onToggle(group.key)}
          className="inline-flex h-7 cursor-pointer items-center gap-2 rounded-md px-1.5 font-medium text-sm outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
        >
          <ChevronRightIcon
            aria-hidden
            className={cn(
              "size-4 text-muted-foreground transition-transform duration-150 ease-out motion-reduce:transition-none",
              expanded && "rotate-90",
            )}
          />
          {group.label}
          <span className="font-normal text-muted-foreground tabular-nums">{group.count}</span>
        </button>
        {group.hint ? (
          <span className="truncate text-muted-foreground text-xs">{group.hint}</span>
        ) : null}
      </div>
    </div>
  );
}

/**
 * The Tasks database table: property columns from the saved layout, a frozen Name column, group
 * rows and virtual rows (only rows near the view are mounted, so 450 cards scroll at 60 fps).
 */
export function TaskTableView(props: {
  readonly tasks: ReadonlyArray<TaskView>;
  readonly sections: ReadonlyArray<TaskSectionGroup>;
  readonly groupBy: "state" | "owner" | "project" | "status" | "none";
  readonly layout: TasksLayout;
  readonly context: TaskContext;
  readonly actions: TaskActions;
  readonly selectedId: string | null;
  readonly onSelect: (task: TaskView) => void;
  readonly empty: TasksEmptyContext;
  readonly onLayoutChange: LayoutChange;
  /** Saves a row move (and the status or project change of a drop in another group). */
  readonly onMoveRow: ((task: TaskView, plan: RowMovePlan) => void) | undefined;
}) {
  const { tasks, sections, groupBy, layout, context, actions, selectedId } = props;
  const { table } = layout;
  const actionsRef = useLatest(actions);
  const onSelectRef = useLatest(props.onSelect);
  const gridRef = useRef<HTMLDivElement>(null);
  const virtualRef = useRef<LegendListRef | null>(null);
  const [overrides, setOverrides] = useState<Readonly<Record<string, boolean>>>({});

  const columns = useMemo(() => table.columns.filter((column) => !column.hidden), [table.columns]);
  const { template, width } = useMemo(() => columnTemplate(table.columns), [table.columns]);
  const wrap = useMemo(() => new Set(table.wrap), [table.wrap]);
  const rowHeight = table.rowHeight ?? ROW_HEIGHT[table.density];

  const builtGroups = useMemo(
    () => buildListGroups({ tasks, sections, groupBy, team: context.team, now: context.now }),
    [tasks, sections, groupBy, context.team, context.now],
  );
  const groups = useMemo(
    () => withManualOrder(builtGroups, layout.ranks),
    [builtGroups, layout.ranks],
  );
  const projectNames = useMemo(() => projectNameIndex(context.projects), [context.projects]);
  const items = useMemo(() => flattenGroups(groups, overrides), [groups, overrides]);
  const visibleIds = useMemo(() => visibleTaskIds(groups, overrides), [groups, overrides]);
  const tasksById = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks]);
  const tabbableId =
    selectedId !== null && visibleIds.includes(selectedId) ? selectedId : (visibleIds[0] ?? null);

  const select = useCallback((task: TaskView) => onSelectRef.current(task), [onSelectRef]);
  const toggleDone = useCallback(
    (task: TaskView) => actionsRef.current.setStatus(task, isOpen(task) ? "done" : "todo"),
    [actionsRef],
  );
  const guideRef = useRef<HTMLDivElement>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const { onMoveRow } = props;
  const moveRow = (id: string, drop: RowDrop) => {
    const plan = planRowMove(groups, groupBy, id, drop);
    const task = tasksById.get(id);
    if (plan && task && onMoveRow) onMoveRow(task, plan);
    return plan !== null;
  };
  const rowDrag = useRowDrag({
    gridRef,
    ghostRef,
    scroller: () => virtualRef.current?.getScrollableNode() ?? null,
    canDrop: (id, drop) => planRowMove(groups, groupBy, id, drop) !== null,
    onDrop: moveRow,
  });
  const { drag } = rowDrag;
  // One grip for the whole table moves to the hovered row, so a row mounts no extra button.
  // (A grip in every row dropped about 20 of 100 scroll frames.)
  const gripRef = useRef<HTMLButtonElement>(null);
  const hideGrip = () => gripRef.current?.removeAttribute("data-row");
  const showGrip = (event: ReactPointerEvent<HTMLDivElement>) => {
    const grip = gripRef.current;
    const grid = gridRef.current;
    if (!grip || !grid || drag || !(event.target instanceof Element)) return;
    if (grip.contains(event.target)) return;
    const row = event.target.closest<HTMLElement>("[data-row-id]");
    const id = row?.dataset.rowId;
    if (!row || !id) return void hideGrip();
    if (grip.dataset.row === id) return;
    const top = row.getBoundingClientRect().top - grid.getBoundingClientRect().top;
    grip.style.transform = `translateY(${top + (row.offsetHeight - GRIP_SIZE) / 2}px)`;
    grip.dataset.row = id;
    grip.setAttribute("aria-label", `Drag to move ${tasksById.get(id)?.title ?? "the task"}`);
  };
  // Resize: a guide line follows the pointer (one style write per frame, no React render).
  const startResize = (key: string, event: ReactPointerEvent<HTMLElement>) => {
    const grid = gridRef.current;
    const guide = guideRef.current;
    const column = table.columns.find((item) => item.key === key);
    if (!grid || !guide || !column || event.button !== 0) return;
    event.preventDefault();
    const handle = event.currentTarget;
    // Window listeners keep the drag alive when the pointer leaves the thin handle.
    const startX = event.clientX;
    const edge =
      handle.getBoundingClientRect().left +
      handle.offsetWidth / 2 -
      grid.getBoundingClientRect().left;
    let width = column.width;
    let frame = 0;
    // Only the guide line moves while dragging; the columns change once, on release.
    const paint = () => {
      frame = 0;
      guide.style.left = `${edge + width - column.width}px`;
    };
    guide.hidden = false;
    paint();
    const onMove = (move: PointerEvent) => {
      width = clampWidth(key, column.width + move.clientX - startX);
      if (!frame) frame = requestAnimationFrame(paint);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      if (frame) cancelAnimationFrame(frame);
      guide.hidden = true;
      if (width !== column.width) {
        props.onLayoutChange("Resized column", (layout) => resizeColumn(layout, key, width), {
          toast: false,
        });
      }
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };
  // Fit reads the widest mounted cell once; rows outside the view are not measured.
  const fitColumn = (key: string) => {
    const cells = gridRef.current?.querySelectorAll<HTMLElement>(`[data-col="${CSS.escape(key)}"]`);
    let widest = 0;
    for (const cell of cells ?? []) {
      const parts = [...cell.children] as HTMLElement[];
      const content =
        parts.reduce((sum, part) => sum + part.scrollWidth, 0) + 6 * Math.max(0, parts.length - 1);
      widest = Math.max(widest, content + 20);
    }
    if (widest > 0) {
      props.onLayoutChange("Fit column width", (layout) => resizeColumn(layout, key, widest), {
        toast: false,
      });
    }
  };
  const toggleGroup = useCallback(
    (key: string) => {
      const group = groups.find((candidate) => candidate.key === key);
      if (group)
        setOverrides((current) => ({ ...current, [key]: !isGroupExpanded(group, current) }));
    },
    [groups],
  );

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!(event.target instanceof HTMLElement)) return;
    const currentId = event.target.closest("[data-row-id]")?.getAttribute("data-row-id");
    if (currentId === undefined || currentId === null) return;
    const focusRow = (id: string) =>
      gridRef.current
        ?.querySelector<HTMLElement>(`[data-row-id="${CSS.escape(id)}"]`)
        ?.focus({ preventScroll: false });
    if (event.altKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
      event.preventDefault();
      const drop = stepDrop(groups, currentId, event.key === "ArrowUp" ? "up" : "down");
      // The row renders in its new place first, then it gets the focus back.
      if (drop && moveRow(currentId, drop)) requestAnimationFrame(() => focusRow(currentId));
      return;
    }
    if (event.key === "Enter") {
      const task = tasksById.get(currentId);
      if (task) select(task);
      return;
    }
    if (!NAV_KEYS.has(event.key)) return;
    event.preventDefault();
    const nextId = nextTaskId(visibleIds, currentId, event.key as ListNavigationKey);
    if (nextId === null || nextId === currentId) return;
    const index = items.findIndex((item) => item.kind === "task" && item.key === nextId);
    void Promise.resolve(
      index < 0
        ? undefined
        : virtualRef.current?.scrollToIndex({ index, animated: false, viewPosition: 0.5 }),
    ).then(() => requestAnimationFrame(() => focusRow(nextId)));
  };

  if (groups.length === 0) return <TasksEmpty icon={<TableIcon />} {...props.empty} />;

  let taskIndex = 0;
  const rowIndex = new Map<string, number>();
  for (const item of items) if (item.kind === "task") rowIndex.set(item.key, taskIndex++);

  const renderItem = ({ item }: { item: ListItem }) =>
    item.kind === "header" ? (
      <GroupRow
        expanded={isGroupExpanded(item.group, overrides)}
        group={item.group}
        onToggle={toggleGroup}
        dropTarget={drag?.drop?.overId === `${GROUP_DROP_PREFIX}${item.group.key}`}
      />
    ) : (
      <TableRow
        task={item.task}
        index={rowIndex.get(item.key) ?? 0}
        columns={columns}
        wrap={wrap}
        freezeName={table.freezeName}
        height={rowHeight}
        selected={selectedId === item.task.id}
        tabbable={tabbableId === item.task.id}
        now={context.now}
        projectName={groupBy === "project" ? null : projectNameFor(item.task, projectNames)}
        team={context.team}
        onSelect={select}
        onToggleDone={toggleDone}
        dragging={drag?.id === item.task.id}
        dropEdge={drag?.drop?.overId === item.task.id ? drag.drop.edge : null}
      />
    );

  return (
    <div
      ref={gridRef}
      role="grid"
      aria-label="Tasks"
      aria-rowcount={visibleIds.length + 1}
      onKeyDown={onKeyDown}
      onPointerMove={onMoveRow ? showGrip : undefined}
      onPointerLeave={hideGrip}
      onScrollCapture={hideGrip}
      className={cn("relative h-full min-h-0", drag && "select-none [&_*]:cursor-grabbing!")}
      style={{ "--task-cols": template, "--task-width": `${width}px` } as CSSProperties}
    >
      <LegendList<ListItem>
        ref={virtualRef}
        className="h-full overflow-auto"
        data={items}
        drawDistance={600}
        estimatedItemSize={rowHeight}
        getFixedItemSize={(item) => (item.kind === "header" ? GROUP_HEIGHT : rowHeight)}
        extraData={renderItem}
        getItemType={(item) => item.kind}
        keyExtractor={(item) => item.key}
        renderItem={renderItem}
        ListHeaderComponent={
          <TaskTableHeader
            columns={columns}
            allColumns={table.columns}
            freezeName={table.freezeName}
            wrap={wrap}
            gutter={GUTTER}
            onLayoutChange={props.onLayoutChange}
            onResizeStart={startResize}
            onFit={fitColumn}
          />
        }
        ListHeaderComponentStyle={{ position: "sticky", top: 0, zIndex: 3 }}
      />
      <div
        ref={ghostRef}
        hidden={!drag}
        aria-hidden
        style={{ height: rowHeight, left: GUTTER / 2 }}
        className="pointer-events-none absolute top-0 z-20 flex w-[min(32rem,calc(100%-2rem))] items-center gap-2 rounded-md border border-border bg-popover px-2 text-popover-foreground text-sm shadow-lg ring-1 ring-primary/20"
      >
        <GripVerticalIcon aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate font-medium">
          {drag ? (tasksById.get(drag.id)?.title ?? "") : ""}
        </span>
      </div>
      {onMoveRow ? (
        <button
          ref={gripRef}
          type="button"
          tabIndex={-1}
          aria-label="Drag to move the task"
          onPointerDown={(event) => {
            const id = event.currentTarget.dataset.row;
            hideGrip();
            if (id) rowDrag.start(id, event);
          }}
          style={{ width: GRIP_SIZE, height: GRIP_SIZE }}
          className="absolute top-0 left-1 z-[4] hidden cursor-grab touch-none place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground data-[row]:grid"
        >
          <GripVerticalIcon aria-hidden className="size-3.5" />
        </button>
      ) : null}
      <div
        ref={guideRef}
        hidden
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 z-10 w-0.5 -translate-x-1/2 bg-primary"
      />
    </div>
  );
}
