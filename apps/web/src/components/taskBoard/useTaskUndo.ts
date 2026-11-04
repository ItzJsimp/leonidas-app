import { useCallback, useEffect, useMemo, useRef } from "react";

import { toastManager } from "~/components/ui/toast";

import {
  EMPTY_HISTORY,
  dropStep,
  pushStep,
  takeRedo,
  takeUndo,
  type UndoHistory,
} from "./taskUndo.logic";

/** Reverts and re-applies one step. Each resolves false when its save failed (it reports why). */
export type UndoAction = {
  readonly undo: () => Promise<boolean>;
  readonly redo: () => Promise<boolean>;
};

export type TaskUndo = {
  /** Adds a step and shows one toast with Undo (`toast: false` skips it). Returns the id for `drop`. */
  readonly record: (label: string, action: UndoAction, options?: { toast?: boolean }) => number;
  /** Removes a step whose save failed. */
  readonly drop: (id: number) => void;
  readonly undo: () => void;
  readonly redo: () => void;
};

const UNDO_TOAST_MS = 8_000;
const TEXT_TARGET = "input, textarea, select, [contenteditable]";

/**
 * One undo history for the whole Tasks tab: edits, reorders and property changes share it.
 * Ctrl+Z undoes and Ctrl+Shift+Z or Ctrl+Y redoes, except in a text field (it keeps its own undo).
 */
export function useTaskUndo(): TaskUndo {
  const history = useRef<UndoHistory<UndoAction>>(EMPTY_HISTORY);
  const nextId = useRef(1);
  const toastId = useRef<string | null>(null);
  // One undo or redo at a time, so fast key presses apply in order.
  const running = useRef(false);

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
      try {
        if (!(await step.data[direction]())) {
          history.current = dropStep(history.current, step.id);
          return;
        }
      } finally {
        running.current = false;
      }
      showToast(`${direction === "undo" ? "Undone" : "Redone"}: ${step.label}`);
    },
    [showToast],
  );

  const record = useCallback(
    (label: string, action: UndoAction, options?: { toast?: boolean }) => {
      const id = nextId.current++;
      history.current = pushStep(history.current, { id, label, data: action });
      if (options?.toast !== false) showToast(label, () => void run("undo", id));
      return id;
    },
    [run, showToast],
  );

  const drop = useCallback((id: number) => {
    history.current = dropStep(history.current, id);
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
    () => ({ record, drop, undo: () => void run("undo"), redo: () => void run("redo") }),
    [drop, record, run],
  );
}
