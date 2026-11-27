import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import type {
  EnvironmentId,
  FocusFileInput,
  FocusUpdateInput,
  ProjectId,
} from "@t3tools/contracts";
import { FOCUS_ITEM_MAX_LENGTH } from "@t3tools/contracts";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  GripVerticalIcon,
  HouseIcon,
  ListPlusIcon,
  PaperclipIcon,
  PencilIcon,
  PinIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type PointerEvent,
  type ReactElement,
  type ReactNode,
} from "react";

import { useEnvironmentQuery } from "~/state/query";
import { focusLive, focusUpdate, taskBoardCardCreate } from "~/state/taskBoard";
import { useAtomCommand } from "~/state/use-atom-command";
import { observeResize } from "../../lib/observeResize";
import { failureText } from "../taskBoard/useTaskActions.logic";
import { useActiveAiosWorkspace } from "../workspace/useActiveAiosWorkspace";
import { Button } from "../ui/button";
import { Checkbox } from "../ui/checkbox";
import { Textarea } from "../ui/textarea";
import { toastManager } from "../ui/toast";
import { filesOfTransfer, NoteAttachments, PendingFiles, readFocusFiles } from "./FocusAttachments";
import { Spinner } from "../ui/spinner";
import { Toggle, ToggleGroup } from "../ui/toggle-group";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import {
  type Bounds,
  clampToViewport,
  FOCUS_DEFAULT_WIDTH,
  joinNoteText,
  nudge,
  resizeTo,
  splitNoteText,
  progressOf,
  settleDrag,
  visibleRows,
  type FocusRow,
  type Point,
  type Size,
} from "./focusWidget.logic";
import { useFocusWidgetStore } from "./focusWidgetStore";

function Tip(props: { label: string; children: ReactElement }) {
  return (
    <Tooltip>
      <TooltipTrigger render={props.children} />
      <TooltipPopup side="top">{props.label}</TooltipPopup>
    </Tooltip>
  );
}

/** The chat column that holds the widget; the side panel sits outside it, so the widget never covers the panel. */
const boundsOf = (node: HTMLElement | null): Bounds => {
  const box = node?.parentElement?.getBoundingClientRect();
  return box
    ? { left: box.left, top: box.top, width: box.width, height: box.height }
    : { width: window.innerWidth, height: window.innerHeight };
};

/**
 * Floating notepad of what the user has on their mind, read from `<AIOS>/memory/focus.md`.
 * Docked at the top right of its parent; drag the header to float it anywhere in the window.
 */
export default function FocusWidget(props: {
  environmentId: EnvironmentId;
  projectId: ProjectId | null;
}) {
  const {
    capture,
    clearCapture,
    position,
    scope,
    size,
    setPosition,
    setScope,
    setSize,
    setVisible,
  } = useFocusWidgetStore();
  // The focus list and new cards belong to the workspace this window shows (ADR-0080).
  const workspace = useActiveAiosWorkspace();
  const query = useEnvironmentQuery(
    workspace.scopeReady
      ? focusLive({ environmentId: props.environmentId, input: workspace.scope })
      : null,
  );
  const runUpdate = useAtomCommand(focusUpdate, { reportFailure: false });
  const runCreate = useAtomCommand(taskBoardCardCreate, { reportFailure: false });
  const rootRef = useRef<HTMLElement | null>(null);
  const dockRef = useRef<HTMLDivElement | null>(null);
  const drag = useRef<{ pointerId: number; offset: Point } | null>(null);
  const [dragPoint, setDragPoint] = useState<Point | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const [pendingFiles, setPendingFiles] = useState<FocusFileInput[]>([]);
  const addRef = useRef<HTMLTextAreaElement | null>(null);
  const addFileInputRef = useRef<HTMLInputElement | null>(null);
  const rowFileInputRef = useRef<HTMLInputElement | null>(null);
  const attachTargetRef = useRef<string | null>(null);
  const hideAfterAddRef = useRef(false);
  const [removed, setRemoved] = useState<{ row: FocusRow; projectId: ProjectId | null } | null>(
    null,
  );

  const snapshot = query.data;
  const rows = visibleRows(snapshot, scope, props.projectId);
  const { done, total } = progressOf(rows);

  // A window resize can leave a floating widget off screen; pull it back once per resize.
  useLayoutEffect(() => {
    if (position === null) return;
    const onResize = () => {
      const node = rootRef.current;
      if (!node) return;
      const next = clampToViewport(
        position,
        node.getBoundingClientRect(),
        boundsOf(rootRef.current),
      );
      if (next.x !== position.x || next.y !== position.y) setPosition(next);
    };
    onResize();
    const parent = rootRef.current?.parentElement;
    const stop = parent ? observeResize(parent, onResize) : () => {};
    window.addEventListener("resize", onResize);
    return () => {
      stop();
      window.removeEventListener("resize", onResize);
    };
  }, [position, setPosition, size]);

  const update = useCallback(
    async (input: FocusUpdateInput, failure: string) => {
      setError(null);
      const result = await runUpdate({
        environmentId: props.environmentId,
        input: { ...input, ...workspace.scope },
      });
      if (result._tag === "Success" || isAtomCommandInterrupted(result)) return true;
      setError(failureText(squashAtomCommandFailure(result), failure));
      return false;
    },
    [props.environmentId, runUpdate, workspace.scope],
  );

  // A quick capture (hotkey, tab, palette) lands here: fill the Add box and put the cursor in it.
  useEffect(() => {
    if (!capture) return;
    hideAfterAddRef.current = capture.hideAfterAdd;
    if (capture.text)
      setDraft((current) => (current ? `${current}\n${capture.text}` : capture.text));
    clearCapture();
    addRef.current?.focus();
  }, [capture, clearCapture]);

  const stagedFiles = async (files: File[]) => {
    if (files.length === 0) return;
    const read = await readFocusFiles(files, pendingFiles.length);
    if (read.files.length > 0) setPendingFiles((current) => [...current, ...read.files]);
    setError(read.error);
  };

  const attachToRow = async (rowId: string, files: File[]) => {
    const read = await readFocusFiles(files);
    setError(read.error);
    if (read.files.length === 0) return;
    const ok = await update(
      { op: "attach", id: rowId, files: read.files },
      "Could not attach the file.",
    );
    if (ok) setNotice(`Attached ${read.files.map((file) => file.name).join(", ")}`);
  };

  const add = async (event?: FormEvent) => {
    event?.preventDefault();
    const text = draft.trim() || pendingFiles[0]?.name || "";
    if (!text || busy) return;
    setBusy(true);
    const ok = await update(
      {
        op: "add",
        projectId: scope === "project" ? props.projectId : null,
        text,
        ...(pendingFiles.length > 0 ? { files: pendingFiles } : {}),
      },
      "Could not add the focus. Try again.",
    );
    setBusy(false);
    if (ok) {
      setDraft("");
      setPendingFiles([]);
      setNotice(`Added ${text}`);
      if (hideAfterAddRef.current) {
        // The notepad was closed before this quick capture, so close it again and say it worked.
        hideAfterAddRef.current = false;
        setVisible(false);
        const toastId = toastManager.add({
          type: "success",
          title: "Added to your notepad",
          timeout: 4000,
          actionProps: {
            children: "Show notepad",
            onClick: () => {
              toastManager.close(toastId);
              setVisible(true);
            },
          },
        });
      }
    }
  };

  const saveEdit = async (row: FocusRow) => {
    const current = editing;
    setEditing(null);
    const parts = splitNoteText(row.text);
    const text = joinNoteText(current?.text ?? "", parts.attachments);
    if (!current || current.id !== row.id || !current.text.trim() || text === row.text) return;
    const ok = await update({ op: "edit", id: row.id, text }, "Could not save the note.");
    if (ok) setNotice(`Saved ${text}`);
  };

  const remove = async (row: FocusRow) => {
    const projectId =
      snapshot?.sections.find((section) => section.slug === row.slug)?.projectId ?? null;
    const ok = await update({ op: "remove", id: row.id }, "Could not remove the item.");
    if (ok) setRemoved({ row, projectId });
  };

  const undoRemove = async () => {
    const last = removed;
    if (!last) return;
    setRemoved(null);
    const ok = await update(
      {
        op: "add",
        projectId: last.projectId,
        text: last.row.text,
        done: last.row.done,
        pinned: last.row.pinned === true,
      },
      "Could not bring the note back.",
    );
    if (ok) setNotice(`Restored ${last.row.text}`);
  };

  const promote = async (row: FocusRow) => {
    if (!snapshot) return;
    setError(null);
    const result = await runCreate({
      environmentId: props.environmentId,
      input: {
        title: splitNoteText(row.text).body.slice(0, 256) || row.text.slice(0, 256),
        projectSlug: row.slug,
        actor: snapshot.member,
        ...workspace.scope,
        ...(row.text.length > 256 ? { description: row.text } : {}),
      },
    });
    if (result._tag === "Success") {
      await update({ op: "remove", id: row.id }, "The card was made, but the line stays.");
      setNotice(`Made a task card: ${row.text}`);
    } else if (!isAtomCommandInterrupted(result)) {
      setError(failureText(squashAtomCommandFailure(result), "Could not make a task card."));
    }
  };

  const resize = useRef<{ pointerId: number; start: Point; from: Size; right: number } | null>(
    null,
  );
  const availableSize = (): Size => {
    const bounds = boundsOf(rootRef.current);
    return { width: bounds.width, height: bounds.height };
  };
  const onResizeDown = (event: PointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    const box = rootRef.current?.getBoundingClientRect();
    if (!box) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    resize.current = {
      pointerId: event.pointerId,
      start: { x: event.clientX, y: event.clientY },
      from: { width: box.width, height: box.height },
      right: box.right,
    };
  };
  // The handle is at the bottom left: dragging left widens the notepad and dragging down makes it
  // taller. A floating notepad keeps its right edge in place.
  const applySize = (wanted: Size, right: number, top: number) => {
    const next = resizeTo(wanted, availableSize());
    setSize(next);
    if (position !== null) setPosition({ x: right - next.width, y: top });
  };
  const onResizeMove = (event: PointerEvent<HTMLElement>) => {
    const active = resize.current;
    if (!active || active.pointerId !== event.pointerId) return;
    applySize(
      {
        width: active.from.width - (event.clientX - active.start.x),
        height: active.from.height + event.clientY - active.start.y,
      },
      active.right,
      rootRef.current?.getBoundingClientRect().top ?? 0,
    );
  };
  const onResizeUp = (event: PointerEvent<HTMLElement>) => {
    if (resize.current?.pointerId === event.pointerId) resize.current = null;
  };
  const onResizeKey = (event: KeyboardEvent<HTMLElement>) => {
    const box = rootRef.current?.getBoundingClientRect();
    if (!box) return;
    if (event.key === "Escape" || event.key === "Home") {
      event.preventDefault();
      setSize(null);
      return;
    }
    const step = event.shiftKey ? 40 : 10;
    const delta: Record<string, Point> = {
      ArrowLeft: { x: step, y: 0 },
      ArrowRight: { x: -step, y: 0 },
      ArrowDown: { x: 0, y: step },
      ArrowUp: { x: 0, y: -step },
    };
    const move = delta[event.key];
    if (!move) return;
    event.preventDefault();
    applySize({ width: box.width + move.x, height: box.height + move.y }, box.right, box.top);
  };

  const dockPoint = (): Point | null => {
    const dock = dockRef.current?.getBoundingClientRect();
    return dock ? { x: dock.left, y: dock.top } : null;
  };

  const onPointerDown = (event: PointerEvent<HTMLElement>) => {
    if (event.button !== 0 || (event.target as HTMLElement).closest("button")) return;
    const box = rootRef.current?.getBoundingClientRect();
    if (!box) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      pointerId: event.pointerId,
      offset: { x: event.clientX - box.left, y: event.clientY - box.top },
    };
    setDragPoint({ x: box.left, y: box.top });
  };
  const onPointerMove = (event: PointerEvent<HTMLElement>) => {
    const active = drag.current;
    const box = rootRef.current?.getBoundingClientRect();
    if (!active || active.pointerId !== event.pointerId || !box) return;
    setDragPoint(
      clampToViewport(
        { x: event.clientX - active.offset.x, y: event.clientY - active.offset.y },
        box,
        boundsOf(rootRef.current),
      ),
    );
  };
  const onPointerUp = (event: PointerEvent<HTMLElement>) => {
    const active = drag.current;
    if (!active || active.pointerId !== event.pointerId) return;
    drag.current = null;
    const box = rootRef.current?.getBoundingClientRect();
    if (dragPoint && box)
      setPosition(settleDrag(dragPoint, dockPoint(), box, boundsOf(rootRef.current)));
    setDragPoint(null);
  };
  const onHandleKey = (event: KeyboardEvent<HTMLElement>) => {
    const box = rootRef.current?.getBoundingClientRect();
    if (!box) return;
    if (event.key === "Home" || event.key === "Escape") {
      event.preventDefault();
      setPosition(null);
      return;
    }
    const next = nudge(position ?? { x: box.left, y: box.top }, event.key, event.shiftKey);
    if (!next) return;
    event.preventDefault();
    setPosition(clampToViewport(next, box, boundsOf(rootRef.current)));
  };

  const floating = dragPoint ?? position;
  let body: ReactNode;
  if (query.isPending && !snapshot) {
    body = (
      <p role="status" className="flex items-center gap-2 px-3 py-3 text-muted-foreground text-xs">
        <Spinner /> Loading your notepad
      </p>
    );
  } else if (!snapshot && query.error) {
    body = (
      <div role="alert" className="flex flex-col gap-2 px-3 py-3 text-xs">
        <p className="text-destructive">Could not read the notepad. {query.error}</p>
        <Button size="xs" variant="outline" onClick={query.refresh}>
          Try again
        </Button>
      </div>
    );
  } else if (rows.length === 0) {
    body = (
      <p className="px-3 py-3 text-muted-foreground text-xs">
        {snapshot?.path === null
          ? "No AIOS folder is connected, so there is no place to keep a notepad."
          : "Nothing here yet. Add a note below. It saves to memory/focus.md."}
      </p>
    );
  } else {
    body = (
      <ul
        className={`flex min-h-0 flex-col overflow-y-auto py-1 ${size ? "flex-1" : "max-h-72"}`}
        aria-label="Focus items"
      >
        {rows.map((row) => {
          const parts = splitNoteText(row.text);
          const label = parts.body || row.text;
          return (
            <li
              key={row.id}
              className="group relative flex items-start gap-2 px-3 py-1 hover:bg-foreground/[0.06] focus-within:bg-foreground/[0.06]"
            >
              <Checkbox
                className="mt-0.5"
                checked={row.done}
                aria-label={row.done ? `Clear tick: ${label}` : `Tick: ${label}`}
                onCheckedChange={(checked) =>
                  void update(
                    { op: "set_done", id: row.id, done: checked === true },
                    "Could not change the item. Try again.",
                  )
                }
              />
              <span className="flex min-w-0 flex-1 flex-col">
                {editing?.id === row.id ? (
                  <Textarea
                    size="sm"
                    autoFocus
                    rows={3}
                    aria-label={`Edit note: ${label}`}
                    maxLength={FOCUS_ITEM_MAX_LENGTH}
                    value={editing.text}
                    onChange={(event) => setEditing({ id: row.id, text: event.target.value })}
                    onBlur={() => void saveEdit(row)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        void saveEdit(row);
                      } else if (event.key === "Escape") setEditing(null);
                    }}
                  />
                ) : (
                  <span
                    className={`min-w-0 whitespace-pre-line break-words text-xs leading-5 ${row.done ? "text-muted-foreground line-through" : ""}`}
                    onDoubleClick={() => setEditing({ id: row.id, text: parts.body })}
                  >
                    {scope === "all" && row.slug !== null ? (
                      <span className="mr-1 text-muted-foreground">{row.slug}:</span>
                    ) : null}
                    <span className="line-clamp-3 group-hover:line-clamp-none group-focus-within:line-clamp-none">
                      {row.pinned ? (
                        <PinIcon
                          aria-label="Pinned"
                          className="mr-1 inline size-3 fill-current align-[-1px] text-muted-foreground"
                        />
                      ) : null}
                      {parts.body}
                    </span>
                  </span>
                )}
                <NoteAttachments
                  environmentId={props.environmentId}
                  attachments={parts.attachments}
                  onRemove={(attachment) =>
                    void update(
                      {
                        op: "edit",
                        id: row.id,
                        text: joinNoteText(
                          parts.body || attachment.name,
                          parts.attachments.filter((other) => other.path !== attachment.path),
                        ),
                      },
                      "Could not remove the file.",
                    )
                  }
                />
              </span>
              {/* Buttons float over the row's top right corner, so they never squeeze the text. */}
              <span
                hidden={editing?.id === row.id}
                // oxlint-disable-next-line t3code/no-hover-only-reveal -- buttons float over the row text and would cover it if always shown
                className="absolute top-0.5 right-1.5 flex gap-0.5 rounded-md border border-border bg-popover px-0.5 opacity-0 shadow-sm group-hover:opacity-100 group-focus-within:opacity-100"
              >
                <Tip label={row.pinned ? "Unpin this line" : "Pin this line to the top"}>
                  <Button
                    size="icon-xs"
                    variant="ghost-muted"
                    aria-label={`${row.pinned ? "Unpin" : "Pin"}: ${label}`}
                    aria-pressed={row.pinned === true}
                    onClick={() =>
                      void update(
                        { op: "pin", id: row.id, pinned: row.pinned !== true },
                        "Could not pin the item.",
                      )
                    }
                  >
                    <PinIcon className={row.pinned ? "fill-current" : undefined} />
                  </Button>
                </Tip>
                <Tip label="Move up">
                  <Button
                    size="icon-xs"
                    variant="ghost-muted"
                    aria-label={`Move up: ${label}`}
                    onClick={() =>
                      void update(
                        { op: "move", id: row.id, direction: "up" },
                        "Could not move the item.",
                      )
                    }
                  >
                    <ArrowUpIcon />
                  </Button>
                </Tip>
                <Tip label="Move down">
                  <Button
                    size="icon-xs"
                    variant="ghost-muted"
                    aria-label={`Move down: ${label}`}
                    onClick={() =>
                      void update(
                        { op: "move", id: row.id, direction: "down" },
                        "Could not move the item.",
                      )
                    }
                  >
                    <ArrowDownIcon />
                  </Button>
                </Tip>
                <Tip label="Edit this line">
                  <Button
                    size="icon-xs"
                    variant="ghost-muted"
                    aria-label={`Edit: ${label}`}
                    onClick={() => setEditing({ id: row.id, text: parts.body })}
                  >
                    <PencilIcon />
                  </Button>
                </Tip>
                <Tip label="Attach a file or image">
                  <Button
                    size="icon-xs"
                    variant="ghost-muted"
                    aria-label={`Attach a file: ${label}`}
                    onClick={() => {
                      attachTargetRef.current = row.id;
                      rowFileInputRef.current?.click();
                    }}
                  >
                    <PaperclipIcon />
                  </Button>
                </Tip>
                <Tip label="Make a task card from this line">
                  <Button
                    size="icon-xs"
                    variant="ghost-muted"
                    aria-label={`Make a task card: ${label}`}
                    onClick={() => void promote(row)}
                  >
                    <ListPlusIcon />
                  </Button>
                </Tip>
                <Tip label="Remove this line">
                  <Button
                    size="icon-xs"
                    variant="ghost-muted"
                    aria-label={`Remove: ${label}`}
                    onClick={() => void remove(row)}
                  >
                    <Trash2Icon />
                  </Button>
                </Tip>
              </span>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <>
      {/* The dock marks where the docked widget sits, so a drop near it can snap home. */}
      <div
        ref={dockRef}
        aria-hidden
        className="pointer-events-none absolute top-4 right-8 size-0"
      />
      <section
        ref={rootRef}
        aria-label="Notepad"
        className={`z-30 flex flex-col overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-lg ${floating ? "fixed" : "absolute top-4 right-8"}`}
        style={{
          width: size?.width ?? FOCUS_DEFAULT_WIDTH,
          ...(size ? { height: size.height } : {}),
          ...(floating ? { left: floating.x, top: floating.y } : {}),
        }}
      >
        <header
          className="flex cursor-grab touch-none items-center gap-1 border-b border-border py-1 pr-1 pl-1.5 select-none active:cursor-grabbing"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onDoubleClick={() => setPosition(null)}
        >
          <Tip label="Drag to move. Arrow keys move it. Home or Escape docks it.">
            <span
              role="button"
              tabIndex={0}
              aria-label="Move the notepad"
              className="flex items-center rounded text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              onKeyDown={onHandleKey}
            >
              <GripVerticalIcon className="size-3.5" />
            </span>
          </Tip>
          <span className="flex-1 truncate font-medium text-2xs uppercase tracking-wide text-muted-foreground">
            Notepad {total > 0 ? `${done}/${total}` : ""}
          </span>
          <ToggleGroup
            aria-label="Which focus items to show"
            value={[scope]}
            onValueChange={(value) => {
              const next = value[0];
              if (next === "project" || next === "all") setScope(next);
            }}
          >
            <Tip label="This project and Global">
              <Toggle value="project" aria-label="Show this project">
                Project
              </Toggle>
            </Tip>
            <Tip label="Every project">
              <Toggle value="all" aria-label="Show all projects">
                All
              </Toggle>
            </Tip>
          </ToggleGroup>
          <Tip label="Dock at the top right">
            <Button
              size="icon-xs"
              variant="ghost-muted"
              aria-label="Dock the notepad"
              disabled={position === null}
              onClick={() => setPosition(null)}
            >
              <HouseIcon />
            </Button>
          </Tip>
          <Tip label="Hide the notepad">
            <Button
              size="icon-xs"
              variant="ghost-muted"
              aria-label="Hide the notepad"
              onClick={() => setVisible(false)}
            >
              <XIcon />
            </Button>
          </Tip>
        </header>
        <div
          className="h-0.5 bg-muted"
          role="progressbar"
          aria-label="Focus progress"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={done}
        >
          <div
            className="h-full bg-primary transition-[width] duration-300 motion-reduce:transition-none"
            style={{ width: total === 0 ? 0 : `${(done / total) * 100}%` }}
          />
        </div>
        {body}
        {error ? (
          <p role="alert" className="px-3 pb-1 text-destructive text-xs">
            {error}
          </p>
        ) : null}
        {removed ? (
          <div className="flex items-center gap-2 border-t border-border px-3 py-1 text-xs">
            <span className="min-w-0 flex-1 truncate text-muted-foreground">Removed a note.</span>
            <Button size="xs" variant="outline" onClick={() => void undoRemove()}>
              Undo
            </Button>
          </div>
        ) : null}
        <input
          ref={rowFileInputRef}
          type="file"
          multiple
          hidden
          aria-hidden
          tabIndex={-1}
          onChange={(event) => {
            const target = attachTargetRef.current;
            const files = Array.from(event.target.files ?? []);
            event.target.value = "";
            if (target && files.length > 0) void attachToRow(target, files);
          }}
        />
        <form
          onSubmit={(event) => void add(event)}
          className="border-t border-border p-2"
          onDragOver={(event) => {
            if (event.dataTransfer.types.includes("Files")) event.preventDefault();
          }}
          onDrop={(event) => {
            const files = filesOfTransfer(event.dataTransfer);
            if (files.length === 0) return;
            event.preventDefault();
            void stagedFiles(files);
          }}
        >
          <PendingFiles
            files={pendingFiles}
            onRemove={(index) =>
              setPendingFiles((current) => current.filter((_, i) => i !== index))
            }
          />
          <div className="flex items-end gap-1">
            <Textarea
              ref={addRef}
              size="sm"
              rows={1}
              className="[&_textarea]:max-h-32 [&_textarea]:min-h-8"
              aria-label="Add a note"
              placeholder="Add a note"
              maxLength={FOCUS_ITEM_MAX_LENGTH}
              value={draft}
              disabled={busy || snapshot?.path === null}
              onChange={(event) => setDraft(event.target.value)}
              onPaste={(event) => {
                const files = filesOfTransfer(event.clipboardData);
                if (files.length === 0) return;
                event.preventDefault();
                void stagedFiles(files);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void add();
                } else if (event.key === "Escape" && hideAfterAddRef.current) {
                  // A quick capture that is cancelled closes the notepad it opened.
                  hideAfterAddRef.current = false;
                  setVisible(false);
                }
              }}
            />
            <input
              ref={addFileInputRef}
              type="file"
              multiple
              hidden
              aria-hidden
              tabIndex={-1}
              onChange={(event) => {
                const files = Array.from(event.target.files ?? []);
                event.target.value = "";
                void stagedFiles(files);
              }}
            />
            <Tip label="Attach a file or image. You can also paste or drop one here.">
              <Button
                type="button"
                size="icon-xs"
                variant="ghost-muted"
                aria-label="Attach a file or image to the new note"
                disabled={busy || snapshot?.path === null}
                onClick={() => addFileInputRef.current?.click()}
              >
                <PaperclipIcon />
              </Button>
            </Tip>
          </div>
        </form>
        <span role="status" className="sr-only">
          {notice}
        </span>
        <span
          role="separator"
          tabIndex={0}
          aria-label="Resize the notepad. Arrow keys resize it. Home or Escape resets the size."
          className="absolute bottom-0 left-0 z-10 size-4 cursor-nesw-resize touch-none rounded-tl-sm text-muted-foreground/60 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring [-webkit-app-region:no-drag]"
          onPointerDown={onResizeDown}
          onPointerMove={onResizeMove}
          onPointerUp={onResizeUp}
          onPointerCancel={onResizeUp}
          onDoubleClick={() => setSize(null)}
          onKeyDown={onResizeKey}
        >
          <svg viewBox="0 0 16 16" className="size-4" aria-hidden>
            <path d="M2 6l8 8M2 10l4 4" stroke="currentColor" strokeWidth="1.5" fill="none" />
          </svg>
        </span>
      </section>
    </>
  );
}
