import type { TaskBoardCardUpdateInput } from "@t3tools/contracts";

import type { TaskView } from "./taskBoard.logic";

/** The card fields one edit changes, as sent to `taskBoard.cardUpdate`. */
export type CardPatch = Omit<TaskBoardCardUpdateInput, "taskId" | "projectId" | "actor">;

/** One step the user can undo: a label for the toast and the data to revert it. */
export type UndoStep<T> = { readonly id: number; readonly label: string; readonly data: T };

export type UndoHistory<T> = {
  readonly past: ReadonlyArray<UndoStep<T>>;
  readonly future: ReadonlyArray<UndoStep<T>>;
};

export const MAX_UNDO_STEPS = 200;
export const EMPTY_HISTORY: UndoHistory<never> = { past: [], future: [] };

/** Adds a step, keeps the newest `MAX_UNDO_STEPS`, and clears redo. */
export function pushStep<T>(history: UndoHistory<T>, step: UndoStep<T>): UndoHistory<T> {
  return { past: [...history.past, step].slice(-MAX_UNDO_STEPS), future: [] };
}

/** The step to revert (the newest, or the one a toast names), moved to the redo stack. */
export function takeUndo<T>(history: UndoHistory<T>, id?: number) {
  const step =
    (id === undefined ? history.past.at(-1) : history.past.find((s) => s.id === id)) ?? null;
  if (!step) return { history, step };
  const past = history.past.filter((s) => s !== step);
  return { history: { past, future: [...history.future, step] }, step };
}

/** The newest undone step to apply again, moved back to the undo stack. */
export function takeRedo<T>(history: UndoHistory<T>) {
  const step = history.future.at(-1) ?? null;
  if (!step) return { history, step };
  return { history: { past: [...history.past, step], future: history.future.slice(0, -1) }, step };
}

/** The edits of one step. A single edit has one part; a move or a bulk edit has several. */
export type UndoParts<T> = ReadonlyArray<{ readonly id: number; readonly action: T }>;

/**
 * Removes one part whose save failed, so Undo never reverts a change that did not happen. A
 * step with no part left is removed.
 */
export function dropPart<T>(
  history: UndoHistory<UndoParts<T>>,
  partId: number,
): UndoHistory<UndoParts<T>> {
  const keep = (steps: ReadonlyArray<UndoStep<UndoParts<T>>>) =>
    steps.flatMap((step) => {
      const data = step.data.filter((part) => part.id !== partId);
      if (data.length === step.data.length) return [step];
      return data.length > 0 ? [{ ...step, data }] : [];
    });
  return { past: keep(history.past), future: keep(history.future) };
}

// Card fields a patch and a task share by name. Notes and versions are not undoable values.
const UNDOABLE = [
  "title",
  "due",
  "milestone",
  "status",
  "priority",
  "projectSlug",
  "claimedBy",
  "assignee",
  "effort",
  "labels",
] as const;

/** The patch that puts back the task's current value of every field `patch` changes. */
export function inversePatch(task: TaskView, patch: CardPatch): CardPatch {
  const before: Record<string, unknown> = {};
  for (const key of UNDOABLE) {
    if (patch[key] !== undefined) before[key] = task[key] ?? null;
  }
  return before as CardPatch;
}

/**
 * Local edits of one task, shown before the server list confirms them. `inFlight` counts saves
 * not yet answered. `savedAt` is the newest version the server returned for them.
 */
export type PendingEdit = {
  readonly patch: CardPatch;
  readonly inFlight: number;
  readonly savedAt: number;
};

/** Records an edit that starts saving now. Later fields win over earlier ones. */
export function startEdit(
  overlay: ReadonlyMap<string, PendingEdit>,
  taskId: string,
  patch: CardPatch,
): Map<string, PendingEdit> {
  const current = overlay.get(taskId);
  return new Map(overlay).set(taskId, {
    patch: { ...current?.patch, ...patch },
    inFlight: (current?.inFlight ?? 0) + 1,
    savedAt: current?.savedAt ?? 0,
  });
}

/** Ends one save: `savedAt` is the version the server returned, or null when the save failed. */
export function finishEdit(
  overlay: ReadonlyMap<string, PendingEdit>,
  taskId: string,
  savedAt: number | null,
): Map<string, PendingEdit> {
  const next = new Map(overlay);
  const current = overlay.get(taskId);
  if (!current || savedAt === null) {
    next.delete(taskId);
    return next;
  }
  return next.set(taskId, {
    ...current,
    inFlight: Math.max(0, current.inFlight - 1),
    savedAt: Math.max(current.savedAt, savedAt),
  });
}

const GENERAL_SECTION = "general";

/**
 * Applies pending edits so a change shows at once. An edit applies while its save is open and
 * until the server list shows the saved version, so the server copy wins after that.
 */
export function applyOverlay(
  tasks: ReadonlyArray<TaskView>,
  overlay: ReadonlyMap<string, PendingEdit>,
): ReadonlyArray<TaskView> {
  if (overlay.size === 0) return tasks;
  return tasks.map((task) => {
    const edit = overlay.get(task.id);
    if (!edit || (edit.inFlight === 0 && task.updatedAt >= edit.savedAt)) return task;
    const shown: Record<string, unknown> = { ...task };
    for (const key of UNDOABLE) {
      if (edit.patch[key] !== undefined) shown[key] = edit.patch[key];
    }
    if (edit.patch.projectSlug !== undefined) {
      shown.section = edit.patch.projectSlug?.trim() || GENERAL_SECTION;
    }
    return shown as TaskView;
  });
}
