import type { FocusItem, FocusSection, FocusSnapshot, ProjectId } from "@t3tools/contracts";

export interface Point {
  readonly x: number;
  readonly y: number;
}
export interface Size {
  readonly width: number;
  readonly height: number;
}

export type FocusScope = "project" | "all";

/** Space kept between a floating widget and the window edge. */
const FOCUS_EDGE_GAP = 8;
/** A floating widget dropped this close to its dock goes back to the dock. */
const FOCUS_SNAP_DISTANCE = 24;

/** The area a floating widget may use. `left` and `top` default to 0 (the whole window). */
export interface Bounds extends Size {
  readonly left?: number;
  readonly top?: number;
}

/** Keeps the whole widget inside the bounds; a widget larger than the bounds sticks to the top left. */
export function clampToViewport(position: Point, widget: Size, viewport: Bounds): Point {
  const minX = (viewport.left ?? 0) + FOCUS_EDGE_GAP;
  const minY = (viewport.top ?? 0) + FOCUS_EDGE_GAP;
  const maxX = Math.max(
    minX,
    (viewport.left ?? 0) + viewport.width - widget.width - FOCUS_EDGE_GAP,
  );
  const maxY = Math.max(
    minY,
    (viewport.top ?? 0) + viewport.height - widget.height - FOCUS_EDGE_GAP,
  );
  return {
    x: Math.round(Math.min(Math.max(position.x, minX), maxX)),
    y: Math.round(Math.min(Math.max(position.y, minY), maxY)),
  };
}

/** Smallest size the user can drag the widget to. */
const FOCUS_MIN_SIZE: Size = { width: 260, height: 180 };
/** Width of the widget before the user resizes it. */
export const FOCUS_DEFAULT_WIDTH = 320;

/** The size after a corner drag: never below the minimum, never larger than the chat column. */
export function resizeTo(wanted: Size, available: Size): Size {
  const maxWidth = Math.max(FOCUS_MIN_SIZE.width, available.width - FOCUS_EDGE_GAP * 2);
  const maxHeight = Math.max(FOCUS_MIN_SIZE.height, available.height - FOCUS_EDGE_GAP * 2);
  return {
    width: Math.round(Math.min(Math.max(wanted.width, FOCUS_MIN_SIZE.width), maxWidth)),
    height: Math.round(Math.min(Math.max(wanted.height, FOCUS_MIN_SIZE.height), maxHeight)),
  };
}

/** Where the widget ends after a drag: `null` means docked. */
export function settleDrag(
  position: Point,
  dock: Point | null,
  widget: Size,
  viewport: Bounds,
): Point | null {
  const clamped = clampToViewport(position, widget, viewport);
  if (dock && Math.hypot(clamped.x - dock.x, clamped.y - dock.y) <= FOCUS_SNAP_DISTANCE) {
    return null;
  }
  return clamped;
}

/** Arrow keys move a floating widget; Shift moves it faster. */
export function nudge(position: Point, key: string, shift: boolean): Point | null {
  const step = shift ? 40 : 10;
  switch (key) {
    case "ArrowLeft":
      return { x: position.x - step, y: position.y };
    case "ArrowRight":
      return { x: position.x + step, y: position.y };
    case "ArrowUp":
      return { x: position.x, y: position.y - step };
    case "ArrowDown":
      return { x: position.x, y: position.y + step };
    default:
      return null;
  }
}

export interface FocusRow extends FocusItem {
  /** Section slug, `null` for Global. Used when the line becomes a task card. */
  readonly slug: string | null;
}

/** Project scope shows the project's section plus Global; All shows every section. */
export function visibleRows(
  snapshot: FocusSnapshot | null,
  scope: FocusScope,
  projectId: ProjectId | null,
): FocusRow[] {
  if (!snapshot) return [];
  const wanted = (section: FocusSection) =>
    scope === "all" ||
    section.slug === null ||
    (projectId !== null && section.projectId === projectId);
  const rows = snapshot.sections
    .filter(wanted)
    .flatMap((section) => section.items.map((item) => ({ ...item, slug: section.slug })));
  // Pinned lines first; the sort is stable, so the file order holds inside each group.
  return [...rows.filter((row) => row.pinned), ...rows.filter((row) => !row.pinned)];
}

export function progressOf(rows: ReadonlyArray<FocusRow>): { done: number; total: number } {
  return { done: rows.filter((row) => row.done).length, total: rows.length };
}

export interface NoteAttachment {
  readonly name: string;
  /** `focus-files/<file>`, as the note holds it. */
  readonly path: string;
  readonly image: boolean;
  /** The markdown line, kept so the note can be written back unchanged. */
  readonly line: string;
}

const ATTACHMENT_LINE = /^(!?)\[([^\]]*)\]\((focus-files\/[^)\s]+)\)$/;

/** Splits a note into its words and its attached files (markdown lines that point into `focus-files/`). */
export function splitNoteText(text: string): { body: string; attachments: NoteAttachment[] } {
  const body: string[] = [];
  const attachments: NoteAttachment[] = [];
  for (const line of text.split("\n")) {
    const match = ATTACHMENT_LINE.exec(line.trim());
    if (match?.[3]) {
      attachments.push({
        name: match[2] || match[3],
        path: match[3],
        image: match[1] === "!",
        line: line.trim(),
      });
    } else {
      body.push(line);
    }
  }
  return { body: body.join("\n"), attachments };
}

/** The reverse of `splitNoteText`: the words first, then each attachment line. */
export function joinNoteText(body: string, attachments: ReadonlyArray<NoteAttachment>): string {
  return [body.trim(), ...attachments.map((attachment) => attachment.line)]
    .filter((part) => part !== "")
    .join("\n");
}
