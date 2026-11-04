import { useCallback, useEffect, useMemo, useRef } from "react";

import { toastManager } from "~/components/ui/toast";

import {
  EMPTY_HISTORY,
  dropPart,
  pushStep,
  takeRedo,
  takeUndo,
  type UndoHistory,
  type UndoParts,
} from "./taskUndo.logic";

/** Reverts and re-applies one step. Each resolves false when its save failed (it reports why). */
export type UndoAction = {
  readonly undo: () => Promise<boolean>;
  readonly redo: () => Promise<boolean>;
};

export type TaskUndo = {
  /** Adds a step and shows one toast with Undo (`toast: false` skips it). Returns the id for `drop`. */
  readonly record: (label: string, action: UndoAction, options?: { toast?: boolean }) => number;
  /** Removes an edit whose save failed. */
  readonly drop: (id: number) => void;
  /** Runs `edits` and joins every step they record into one step with one toast. */
  readonly group: (label: string, edits: () => void) => void;
  readonly undo: () => void;
  readonly redo: () => void;
};

const UNDO_TOAST_MS = 8_000;
const TEXT_TARGET = "input, textarea, select, [contenteditable]";

type Parts = UndoParts<UndoAction>;

/**
 * One undo history for the whole Tasks tab: edits, reorders and property changes share it.
 * Ctrl+Z undoes and Ctrl+Shift+Z or Ctrl+Y redoes, except in a text field (it keeps its own undo).
 */
export function useTaskUndo(): TaskUndo {
  const history = useRef<UndoHistory<Parts>>(EMPTY_HISTORY);
  const nextId = useRef(1);
  const toastId = useRef<string | null>(null);
  // One undo or redo at a time, so fast key presses apply in order.
  const running = useRef(false);
  // Set while `group` runs: the parts its edits record.
  const collecting = useRef<Array<Parts[number]> | null>(null);

  // One toast at a time: a new edit replaces the last toast instead of stacking another.
  const showToast = useCallback((title: string, onUndo?: () => void) => {
    if (toastId.current) toastManager.close(toastId.current);
    const id = toastManager.add({
      type: "success",
      title,
      timeout: UNDO_TOAST_MS,
      ...(onUndo
        ? {
            actionProps: {
              children: "Undo",
              onClick: () => {
                toastManager.close(id);
                onUndo();
              },
            },
          }
        : {}),
    });
    toastId.current = id;
  }, []);

  const run = useCallback(
    async (direction: "undo" | "redo", id?: number) => {
      if (running.current) return;
      const taken =
        direction === "undo" ? takeUndo(history.current, id) : takeRedo(history.current);
      if (!taken.step) {
        showToast(direction === "undo" ? "Nothing to undo" : "Nothing to redo");
        return;
      }
      const step = taken.step;
      history.current = taken.history;
      running.current = true;
      let applied = 0;
      try {
        const parts = direction === "undo" ? step.data.toReversed() : step.data;
        const results = await Promise.all(parts.map((part) => part.action[direction]()));
        parts.forEach((part, index) => {
          if (results[index]) applied += 1;
          else history.current = dropPart(history.current, part.id);
        });
      } finally {
        running.current = false;
      }
      if (applied > 0) showToast(`${direction === "undo" ? "Undone" : "Redone"}: ${step.label}`);
    },
    [showToast],
  );

  const push = useCallback(
    (label: string, data: Parts, toast: boolean) => {
      const id = nextId.current++;
      history.current = pushStep(history.current, { id, label, data });
      if (toast) showToast(label, () => void run("undo", id));
    },
    [run, showToast],
  );

  const record = useCallback(
    (label: string, action: UndoAction, options?: { toast?: boolean }) => {
      const id = nextId.current++;
      if (collecting.current) collecting.current.push({ id, action });
      else push(label, [{ id, action }], options?.toast !== false);
      return id;
    },
    [push],
  );

  const group = useCallback(
    (label: string, edits: () => void) => {
      const parts: Array<Parts[number]> = [];
      collecting.current = parts;
      try {
        edits();
      } finally {
        collecting.current = null;
      }
      if (parts.length > 0) push(label, parts, true);
    },
    [push],
  );

  const drop = useCallback((id: number) => {
    history.current = dropPart(history.current, id);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.defaultPrevented) return;
      const key = event.key.toLowerCase();
      if (key !== "z" && key !== "y") return;
      if (event.target instanceof Element && event.target.closest(TEXT_TARGET)) return;
      event.preventDefault();
      void run(key === "y" || event.shiftKey ? "redo" : "undo");
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [run]);

  return useMemo(
    () => ({ record, drop, group, undo: () => void run("undo"), redo: () => void run("redo") }),
    [drop, group, record, run],
  );
}
