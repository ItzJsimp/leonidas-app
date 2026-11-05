import type { TaskBoardTaskPriority, TaskBoardTaskStatus } from "@t3tools/contracts";
import { CheckIcon } from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";

import { cn } from "~/lib/utils";

import { useLatest } from "./TaskRowParts";
import { OptionChip, PriorityMark, StatusPill } from "./TaskTableCells";
import { listOptions, type CellEditor, type CellOption, type CellValue } from "./taskCells.logic";

/** Where the editor opens: the cell box, relative to the table. */
export type CellBox = {
  readonly top: number;
  readonly left: number;
  readonly width: number;
  readonly height: number;
};

export type OpenCellEditor = {
  readonly rowId: string;
  readonly column: string;
  readonly label: string;
  readonly editor: CellEditor;
  readonly box: CellBox;
  /** Room under the cell before the table ends; a list opens upward when it does not fit. */
  readonly roomBelow: number;
  /** The table width; the editor stays inside it. */
  readonly tableWidth: number;
};

const LIST_HEIGHT = 288;
const CLEAR = "\u0000clear";

function OptionLabel({ column, option }: { column: string; option: CellOption }) {
  if (column === "status") return <StatusPill status={option.value as TaskBoardTaskStatus} />;
  if (column === "priority")
    return <PriorityMark priority={option.value as TaskBoardTaskPriority} />;
  if (column === "project" || column === "owner")
    return <span className="truncate text-sm">{option.label}</span>;
  return <OptionChip label={option.label} tone={option.tone} />;
}

/**
 * The one floating cell editor of the Tasks table. Text and dates save on Enter or a click
 * outside; a list saves on each pick. Esc cancels. A scroll closes it like a click outside.
 * `onCommit` returns an error to show, or null when the editor may close.
 */
export function TaskCellEditor({
  open,
  onCommit,
  onClose,
}: {
  readonly open: OpenCellEditor;
  readonly onCommit: (value: CellValue, close: boolean) => string | null;
  readonly onClose: () => void;
}) {
  const { editor, box, column } = open;
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // No scroll on focus: a scroll closes the editor.
  useEffect(() => inputRef.current?.focus({ preventScroll: true }), []);
  const [text, setText] = useState(
    editor.kind === "text" || editor.kind === "date" ? editor.value : "",
  );
  const [picked, setPicked] = useState<ReadonlyArray<string>>(
    editor.kind === "multi" ? editor.value : [],
  );
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const listId = useId();
  const isList = editor.kind === "select" || editor.kind === "multi";

  const options = listOptions(editor, text, CLEAR);

  const commit = (value: CellValue, close = true) => {
    const problem = onCommit(value, close);
    setError(problem);
    return problem === null;
  };
  // A click outside saves valid text and drops invalid text. The ref keeps the newest text.
  const outside = useLatest(() => {
    if (editor.kind === "text" || editor.kind === "date") {
      if (!commit(text)) onClose();
    } else onClose();
  });

  useEffect(() => {
    const onPointer = (event: Event) => {
      if (!rootRef.current?.contains(event.target as Node)) outside.current();
    };
    document.addEventListener("pointerdown", onPointer, true);
    window.addEventListener("scroll", onPointer, true);
    return () => {
      document.removeEventListener("pointerdown", onPointer, true);
      window.removeEventListener("scroll", onPointer, true);
    };
  }, [outside]);

  const pick = (option: CellOption) => {
    if (editor.kind === "multi") {
      const next = picked.includes(option.value)
        ? picked.filter((item) => item !== option.value)
        : [...picked, option.value];
      setPicked(next);
      commit(next, false);
      return;
    }
    commit(option.value === CLEAR ? null : option.value);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    event.stopPropagation();
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (isList && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((current) => (current + step + options.length) % Math.max(1, options.length));
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      if (isList) {
        const option = options[Math.min(active, options.length - 1)];
        if (option) pick(option);
      } else commit(text);
    }
  };

  const width = Math.max(box.width, isList ? 224 : 240);
  const listUp = isList && open.roomBelow < LIST_HEIGHT && box.top > open.roomBelow;
  const selected = (option: CellOption) =>
    editor.kind === "multi"
      ? picked.includes(option.value)
      : editor.kind === "select" &&
        (option.value === CLEAR ? editor.value === null : option.value === editor.value);

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-label={`Edit ${open.label}`}
      className={cn(
        "absolute z-30 flex flex-col rounded-md border border-border bg-popover text-popover-foreground shadow-lg ring-1 ring-foreground/15",
        listUp && "flex-col-reverse",
      )}
      style={{
        left: Math.max(0, Math.min(box.left, open.tableWidth - width)),
        width,
        ...(listUp ? { bottom: `calc(100% - ${box.top + box.height}px)` } : { top: box.top }),
      }}
    >
      <input
        ref={inputRef}
        type={editor.kind === "date" ? "date" : "text"}
        inputMode={editor.kind === "text" && editor.input === "number" ? "decimal" : undefined}
        value={text}
        placeholder={isList ? "Search" : undefined}
        aria-invalid={error !== null}
        aria-label={isList ? `Search ${open.label}` : open.label}
        aria-controls={isList ? listId : undefined}
        aria-activedescendant={isList && options[active] ? `${listId}-${active}` : undefined}
        onFocus={(event) => {
          if (editor.kind === "text") event.currentTarget.select();
        }}
        onChange={(event) => {
          setText(event.target.value);
          setError(null);
          setActive(0);
        }}
        onKeyDown={onKeyDown}
        style={{ minHeight: box.height }}
        className={cn(
          "w-full rounded-md bg-transparent px-2 text-sm outline-none",
          isList && "border-border border-b",
          error && "ring-2 ring-destructive ring-inset",
        )}
      />
      {error ? (
        <p role="alert" className="px-2 py-1.5 text-destructive-foreground text-xs">
          {error}
        </p>
      ) : null}
      {editor.kind === "date" && text ? (
        <button
          type="button"
          onClick={() => commit("")}
          className="cursor-pointer border-border border-t px-2 py-1.5 text-left text-muted-foreground text-xs hover:bg-muted hover:text-foreground"
        >
          Clear date
        </button>
      ) : null}
      {isList ? (
        <div
          id={listId}
          role="listbox"
          aria-label={open.label}
          aria-multiselectable={editor.kind === "multi" || undefined}
          className="overflow-y-auto p-1"
          style={{ maxHeight: LIST_HEIGHT - box.height }}
        >
          {options.length === 0 ? (
            <p className="px-2 py-1.5 text-muted-foreground text-xs">No match</p>
          ) : null}
          {options.map((option, index) => (
            <div
              key={option.value}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={selected(option)}
              onPointerDown={(event) => event.preventDefault()}
              onPointerEnter={() => setActive(index)}
              onClick={() => pick(option)}
              className={cn(
                "flex h-8 cursor-pointer items-center gap-2 rounded-sm px-1.5",
                index === active && "bg-muted",
              )}
            >
              <span className="min-w-0 flex-1">
                {option.value === CLEAR ? (
                  <span className="text-muted-foreground text-sm">{option.label}</span>
                ) : (
                  <OptionLabel column={column} option={option} />
                )}
              </span>
              {selected(option) ? (
                <CheckIcon aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
