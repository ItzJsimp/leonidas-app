import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { restrictToHorizontalAxis } from "@dnd-kit/modifiers";
import {
  horizontalListSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  ChevronDownIcon,
  EyeOffIcon,
  MoveHorizontalIcon,
  WrapTextIcon,
} from "lucide-react";
import type { KeyboardEvent, PointerEvent } from "react";

import {
  Menu,
  MenuCheckboxItem,
  MenuItem,
  MenuPopup,
  MenuSeparator,
  MenuTrigger,
} from "~/components/ui/menu";
import { cn } from "~/lib/utils";

import { COLUMN_META } from "./TaskTableCells";
import {
  COLUMN_MAX,
  COLUMN_MIN,
  moveColumn,
  resizeColumn,
  setColumnHidden,
  toggleWrap,
  type ColumnLayout,
  type TasksLayout,
} from "./taskLayout.logic";

/** Applies a layout change and adds an undo step (`toast: false` for quiet tweaks like widths). */
export type LayoutChange = (
  label: string,
  change: (layout: TasksLayout) => TasksLayout,
  options?: { readonly toast?: boolean },
) => void;

export const columnLabel = (key: string) => COLUMN_META[key]?.label ?? key.replace(/^prop:/, "");

// Arrow keys on a focused resize handle step the width by this much.
const KEY_STEP = 16;

type HeaderProps = {
  readonly columns: ReadonlyArray<ColumnLayout>;
  readonly allColumns: ReadonlyArray<ColumnLayout>;
  readonly freezeName: boolean;
  readonly wrap: ReadonlySet<string>;
  readonly gutter: number;
  readonly onLayoutChange: LayoutChange;
  readonly onResizeStart: (key: string, event: PointerEvent<HTMLElement>) => void;
  readonly onFit: (key: string) => void;
};

/** Where `key` lands in the full column list when it takes the place of `overKey`. */
function targetIndex(all: ReadonlyArray<ColumnLayout>, key: string, overKey: string): number {
  const keys = all.map((column) => column.key);
  const rest = keys.filter((item) => item !== key);
  return rest.indexOf(overKey) + (keys.indexOf(key) < keys.indexOf(overKey) ? 1 : 0);
}

function HeaderCell(
  props: HeaderProps & {
    readonly column: ColumnLayout;
    readonly prevKey: string | null;
    readonly nextKey: string | null;
  },
) {
  const { column, freezeName, gutter, onLayoutChange, prevKey, nextKey } = props;
  const frozen = freezeName && column.key === "title";
  const label = columnLabel(column.key);
  const sortable = useSortable({ id: column.key, disabled: frozen });
  const move = (overKey: string) =>
    onLayoutChange(`Moved column: ${label}`, (layout) =>
      moveColumn(layout, column.key, targetIndex(layout.table.columns, column.key, overKey)),
    );

  const onHandleKey = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const step = event.key === "ArrowLeft" ? -KEY_STEP : KEY_STEP;
    onLayoutChange(
      `Resized column: ${label}`,
      (layout) => resizeColumn(layout, column.key, column.width + step),
      { toast: false },
    );
  };

  return (
    <div
      ref={sortable.setNodeRef}
      role="columnheader"
      data-col={column.key}
      style={{
        transform: CSS.Translate.toString(sortable.transform),
        transition: sortable.transition,
        ...(frozen ? { left: gutter } : {}),
      }}
      className={cn(
        "group/head relative flex min-w-0 items-center",
        frozen && "sticky z-[2] border-r border-border/40 bg-background",
        sortable.isDragging && "z-[4] rounded-md bg-muted shadow-lg",
      )}
    >
      <div
        {...sortable.attributes}
        {...sortable.listeners}
        aria-roledescription={frozen ? undefined : "movable column"}
        aria-label={frozen ? label : `${label}. Press Space to move the column.`}
        className={cn(
          "flex h-full min-w-0 flex-1 items-center gap-1.5 pl-2 font-medium text-muted-foreground text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset [&_svg]:size-3.5 [&_svg]:shrink-0",
          !frozen && "cursor-grab active:cursor-grabbing",
        )}
      >
        {COLUMN_META[column.key]?.icon}
        <span className="truncate">{label}</span>
      </div>
      <Menu>
        <MenuTrigger
          render={
            <button
              type="button"
              aria-label={`${label} column options`}
              className="mr-1 grid size-6 shrink-0 cursor-pointer place-items-center rounded-md text-muted-foreground opacity-0 outline-none transition-opacity duration-150 hover:bg-muted hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset group-hover/head:opacity-100 data-[popup-open]:opacity-100"
            />
          }
        >
          <ChevronDownIcon aria-hidden className="size-3.5" />
        </MenuTrigger>
        <MenuPopup align="start" className="min-w-48">
          <MenuItem onClick={() => props.onFit(column.key)}>
            <MoveHorizontalIcon aria-hidden />
            Fit width to content
          </MenuItem>
          <MenuCheckboxItem
            checked={props.wrap.has(column.key)}
            onCheckedChange={() =>
              onLayoutChange(`Wrap text: ${label}`, (layout) => toggleWrap(layout, column.key), {
                toast: false,
              })
            }
          >
            <WrapTextIcon aria-hidden />
            Wrap text
          </MenuCheckboxItem>
          {frozen ? null : (
            <>
              <MenuItem disabled={prevKey === null} onClick={() => prevKey && move(prevKey)}>
                <ArrowLeftIcon aria-hidden />
                Move left
              </MenuItem>
              <MenuItem disabled={nextKey === null} onClick={() => nextKey && move(nextKey)}>
                <ArrowRightIcon aria-hidden />
                Move right
              </MenuItem>
              <MenuSeparator />
              <MenuItem
                onClick={() =>
                  onLayoutChange(`Hidden column: ${label}`, (layout) =>
                    setColumnHidden(layout, column.key, true),
                  )
                }
              >
                <EyeOffIcon aria-hidden />
                Hide column
              </MenuItem>
            </>
          )}
        </MenuPopup>
      </Menu>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={`Resize ${label}`}
        aria-valuenow={column.width}
        aria-valuemin={COLUMN_MIN}
        aria-valuemax={COLUMN_MAX}
        tabIndex={0}
        onPointerDown={(event) => props.onResizeStart(column.key, event)}
        onDoubleClick={() => props.onFit(column.key)}
        onKeyDown={onHandleKey}
        className="absolute top-0 right-0 z-[3] h-full w-2.5 translate-x-1/2 cursor-col-resize touch-none outline-none after:absolute after:inset-y-2 after:left-1/2 after:w-0.5 after:-translate-x-1/2 after:rounded-full after:transition-colors after:duration-150 hover:after:bg-primary/70 focus-visible:after:bg-primary"
      />
    </div>
  );
}

/**
 * The column header row: drag a header to move its column, drag its right edge to resize
 * (double-click fits the content), and open its menu to wrap, move or hide it. Keyboard: Space
 * picks a header up and arrows move it; arrows on a focused edge resize.
 */
export function TaskTableHeader(props: HeaderProps) {
  const { columns, freezeName, onLayoutChange } = props;
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const keys = columns.map((column) => column.key);
  const movable = keys.filter((key) => !(freezeName && key === "title"));

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const key = String(active.id);
    const overKey = String(over.id);
    onLayoutChange(`Moved column: ${columnLabel(key)}`, (layout) =>
      moveColumn(layout, key, targetIndex(layout.table.columns, key, overKey)),
    );
  };

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
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToHorizontalAxis]}
        onDragEnd={onDragEnd}
      >
        <SortableContext items={movable} strategy={horizontalListSortingStrategy}>
          {columns.map((column, index) => {
            const prev = keys[index - 1];
            return (
              <HeaderCell
                key={column.key}
                {...props}
                column={column}
                prevKey={prev && !(freezeName && prev === "title") ? prev : null}
                nextKey={keys[index + 1] ?? null}
              />
            );
          })}
        </SortableContext>
      </DndContext>
      <div role="presentation" />
    </div>
  );
}
