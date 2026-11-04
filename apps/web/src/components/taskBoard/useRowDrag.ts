import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";

import { useLatest } from "./TaskRowParts";
import { GROUP_DROP_PREFIX, type RowDrop } from "./taskRows";

// A press on the grip becomes a drag only after the pointer moves this far.
const DRAG_START_PX = 4;
// Near the top or bottom edge, the list scrolls by up to MAX_SCROLL_PX each frame.
const EDGE_PX = 56;
const MAX_SCROLL_PX = 20;

export type RowDragState = { readonly id: string; readonly drop: RowDrop | null };

type RowDragInput = {
  readonly gridRef: RefObject<HTMLElement | null>;
  /** The lifted copy of the row. It follows the pointer by a transform, with no React render. */
  readonly ghostRef: RefObject<HTMLElement | null>;
  readonly scroller: () => HTMLElement | null;
  /** True when a drop at `drop` changes something that the grouping can save. */
  readonly canDrop: (id: string, drop: RowDrop) => boolean;
  readonly onDrop: (id: string, drop: RowDrop) => void;
};

/**
 * Row drag from the grip. The pointer picks the row under it (rows are virtual, so no row
 * registers as a drop zone), the list scrolls at its edges, and Esc cancels. React renders only
 * when the drop place changes.
 */
export function useRowDrag(input: RowDragInput) {
  const [drag, setDrag] = useState<RowDragState | null>(null);
  const latest = useLatest(input);
  const cancel = useRef<(() => void) | null>(null);
  useEffect(() => () => cancel.current?.(), []);

  const start = useCallback(
    (id: string, event: ReactPointerEvent<HTMLElement>) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      const row = latest.current.gridRef.current?.querySelector(
        `[data-row-id="${CSS.escape(id)}"]`,
      );
      const grab = event.clientY - (row?.getBoundingClientRect().top ?? event.clientY);
      const origin = { x: event.clientX, y: event.clientY };
      const pointer = { ...origin };
      let dragging = false;
      let frame = 0;
      let drop: RowDrop | null = null;

      const dropAt = (): RowDrop | null => {
        const hit = document
          .elementFromPoint(pointer.x, pointer.y)
          ?.closest<HTMLElement>("[data-row-id], [data-group-key]");
        if (!hit || !latest.current.gridRef.current?.contains(hit)) return null;
        let next: RowDrop;
        if (hit.dataset.groupKey !== undefined) {
          next = { overId: `${GROUP_DROP_PREFIX}${hit.dataset.groupKey}`, edge: "after" };
        } else {
          const rect = hit.getBoundingClientRect();
          const edge = pointer.y < rect.top + rect.height / 2 ? "before" : "after";
          next = { overId: hit.dataset.rowId ?? "", edge };
        }
        return latest.current.canDrop(id, next) ? next : null;
      };

      const tick = () => {
        frame = 0;
        const { gridRef, ghostRef, scroller } = latest.current;
        const grid = gridRef.current;
        if (grid && ghostRef.current) {
          const top = pointer.y - grid.getBoundingClientRect().top - grab;
          ghostRef.current.style.transform = `translate3d(0, ${top}px, 0)`;
        }
        const list = scroller();
        let speed = 0;
        if (list) {
          const rect = list.getBoundingClientRect();
          const depth = Math.max(
            rect.top + EDGE_PX - pointer.y,
            pointer.y - (rect.bottom - EDGE_PX),
          );
          if (depth > 0) {
            const direction = pointer.y < rect.top + rect.height / 2 ? -1 : 1;
            speed = direction * Math.ceil((MAX_SCROLL_PX * Math.min(depth, EDGE_PX)) / EDGE_PX);
            list.scrollTop += speed;
          }
        }
        const next = dropAt();
        if (next?.overId !== drop?.overId || next?.edge !== drop?.edge) {
          drop = next;
          setDrag({ id, drop });
        }
        // The list keeps scrolling while the pointer rests at its edge.
        if (speed !== 0) frame = requestAnimationFrame(tick);
      };

      const onMove = (move: PointerEvent) => {
        pointer.x = move.clientX;
        pointer.y = move.clientY;
        if (!dragging) {
          if (Math.hypot(pointer.x - origin.x, pointer.y - origin.y) < DRAG_START_PX) return;
          dragging = true;
          setDrag({ id, drop: null });
        }
        if (!frame) frame = requestAnimationFrame(tick);
      };
      const finish = (commit: boolean) => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onCancel);
        window.removeEventListener("keydown", onKey, true);
        if (frame) cancelAnimationFrame(frame);
        cancel.current = null;
        if (!dragging) return;
        setDrag(null);
        if (commit && drop) latest.current.onDrop(id, drop);
      };
      const onUp = () => finish(true);
      const onCancel = () => finish(false);
      const onKey = (key: KeyboardEvent) => {
        if (key.key !== "Escape" || !dragging) return;
        key.preventDefault();
        key.stopPropagation();
        finish(false);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onCancel);
      window.addEventListener("keydown", onKey, true);
      cancel.current = onCancel;
    },
    [latest],
  );

  return { drag, start };
}
