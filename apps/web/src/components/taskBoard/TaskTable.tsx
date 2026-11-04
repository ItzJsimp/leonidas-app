import { LegendList, type LegendListRef } from "@legendapp/list/react";
import type { TaskBoardTeamMember } from "@t3tools/contracts";
import { CheckIcon, ChevronRightIcon, PanelRightOpenIcon, TableIcon } from "lucide-react";
import {
  memo,
  useCallback,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from "react";

import { cn } from "~/lib/utils";

import { TasksEmpty, type TasksEmptyContext } from "./TaskEmptyStates";
import { useLatest } from "./TaskRowParts";
import {
  COLUMN_META,
  DueText,
  GatesBar,
  OwnerName,
  PriorityMark,
  StatusPill,
  UpdatedText,
} from "./TaskTableCells";
import type { ColumnLayout, Density, TasksLayout } from "./taskLayout.logic";
import { isOpen, type TaskSectionGroup, type TaskView } from "./taskBoard.logic";
import type { TaskActions, TaskContext } from "./taskBoard.types";
import {
  buildListGroups,
  flattenGroups,
  isGroupExpanded,
  nextTaskId,
  projectNameFor,
  projectNameIndex,
  visibleTaskIds,
  type ListGroup,
  type ListItem,
  type ListNavigationKey,
} from "./taskRows";

const ROW_HEIGHT: Record<Density, number> = { compact: 32, default: 40, comfortable: 52 };
const GROUP_HEIGHT = 44;
// The gutter holds the done box (and the drag grip in a later slice).
const GUTTER = 40;
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
};

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
        "group/row grid w-[var(--task-width)] min-w-full cursor-default border-b border-border/60 outline-none [grid-template-columns:var(--task-cols)] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
        ROW_TINT,
      )}
    >
      <div
        role="gridcell"
        className={cn(
          "flex items-center justify-center",
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
}: {
  readonly group: ListGroup;
  readonly expanded: boolean;
  readonly onToggle: (key: string) => void;
}) {
  return (
    <div
      role="row"
      style={{ height: GROUP_HEIGHT }}
      className="flex w-[var(--task-width)] min-w-full items-end"
    >
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

function HeaderRow({
  columns,
  freezeName,
}: {
  readonly columns: ReadonlyArray<ColumnLayout>;
  readonly freezeName: boolean;
}) {
  return (
    <div
      role="row"
      aria-rowindex={1}
      className="grid h-9 w-[var(--task-width)] min-w-full border-b border-border bg-background [grid-template-columns:var(--task-cols)]"
    >
      <div
        role="columnheader"
        aria-label="Done"
        className={cn(freezeName && "sticky left-0 z-[2] bg-background")}
      />
      {columns.map((column) => {
        const meta = COLUMN_META[column.key];
        return (
          <div
            key={column.key}
            role="columnheader"
            className={cn(
              "flex min-w-0 items-center gap-1.5 px-2 font-medium text-muted-foreground text-xs [&_svg]:size-3.5 [&_svg]:shrink-0",
              column.key === "title" && "border-r border-border/40",
              column.key === "title" && freezeName && "sticky z-[2] bg-background",
            )}
            style={column.key === "title" && freezeName ? { left: GUTTER } : undefined}
          >
            {meta?.icon}
            <span className="truncate">{meta?.label ?? column.key}</span>
          </div>
        );
      })}
      <div role="presentation" />
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

  const groups = useMemo(
    () => buildListGroups({ tasks, sections, groupBy, team: context.team, now: context.now }),
    [tasks, sections, groupBy, context.team, context.now],
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
    if (event.key === "Enter") {
      const task = tasksById.get(currentId);
      if (task) select(task);
      return;
    }
    if (!NAV_KEYS.has(event.key)) return;
    event.preventDefault();
    const nextId = nextTaskId(visibleIds, currentId, event.key as ListNavigationKey);
    if (nextId === null || nextId === currentId) return;
    const focusRow = () =>
      gridRef.current
        ?.querySelector<HTMLElement>(`[data-row-id="${CSS.escape(nextId)}"]`)
        ?.focus({ preventScroll: false });
    const index = items.findIndex((item) => item.kind === "task" && item.key === nextId);
    void Promise.resolve(
      index < 0
        ? undefined
        : virtualRef.current?.scrollToIndex({ index, animated: false, viewPosition: 0.5 }),
    ).then(() => requestAnimationFrame(focusRow));
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
      />
    );

  return (
    <div
      ref={gridRef}
      role="grid"
      aria-label="Tasks"
      aria-rowcount={visibleIds.length + 1}
      onKeyDown={onKeyDown}
      className="h-full min-h-0"
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
        ListHeaderComponent={<HeaderRow columns={columns} freezeName={table.freezeName} />}
        ListHeaderComponentStyle={{ position: "sticky", top: 0, zIndex: 3 }}
      />
    </div>
  );
}
