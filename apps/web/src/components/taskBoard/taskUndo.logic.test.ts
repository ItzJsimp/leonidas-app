import { describe, expect, it } from "vite-plus/test";

import type { TaskView } from "./taskBoard.logic";
import {
  EMPTY_HISTORY,
  MAX_UNDO_STEPS,
  applyOverlay,
  dropPart,
  finishEdit,
  inversePatch,
  pushStep,
  startEdit,
  takeRedo,
  takeUndo,
  type UndoHistory,
  type UndoParts,
} from "./taskUndo.logic";

const task = (id: string, extra: Partial<TaskView> = {}) =>
  ({
    id,
    title: `Task ${id}`,
    status: "todo",
    priority: "medium",
    due: null,
    projectSlug: "app",
    section: "app",
    assignee: null,
    labels: [],
    updatedAt: 10,
    ...extra,
  }) as unknown as TaskView;

const step = (id: number) => ({ id, label: `step ${id}`, data: id });

describe("undo history", () => {
  it("undoes and redoes in order, and a new step clears redo", () => {
    let history = pushStep(pushStep(EMPTY_HISTORY, step(1)), step(2));
    const undone = takeUndo(history);
    expect(undone.step?.id).toBe(2);
    history = undone.history;
    const redone = takeRedo(history);
    expect(redone.step?.id).toBe(2);
    history = pushStep(takeUndo(redone.history).history, step(3));
    expect(takeRedo(history).step).toBeNull();
    expect(history.past.map((s) => s.id)).toEqual([1, 3]);
  });

  it("keeps the newest steps up to the cap and returns null when empty", () => {
    let history: UndoHistory<number> = EMPTY_HISTORY;
    for (let i = 0; i < MAX_UNDO_STEPS + 5; i++) history = pushStep(history, step(i));
    expect(history.past).toHaveLength(MAX_UNDO_STEPS);
    expect(history.past[0]?.id).toBe(5);
    expect(takeUndo(EMPTY_HISTORY).step).toBeNull();
    expect(takeRedo(EMPTY_HISTORY).step).toBeNull();
  });

  it("undoes the step a toast names, even when a newer step exists", () => {
    const history = pushStep(pushStep(EMPTY_HISTORY, step(1)), step(2));
    const taken = takeUndo(history, 1);
    expect(taken.step?.id).toBe(1);
    expect(taken.history.past.map((s) => s.id)).toEqual([2]);
    expect(takeUndo(history, 99).step).toBeNull();
  });

  it("drops one part of a grouped step and the step when no part is left", () => {
    const parts = (...ids: number[]) => ids.map((id) => ({ id, action: `edit ${id}` }));
    let history: UndoHistory<UndoParts<string>> = pushStep(
      pushStep(EMPTY_HISTORY, { id: 1, label: "one", data: parts(1) }),
      {
        id: 9,
        label: "move",
        data: parts(7, 8),
      },
    );
    history = dropPart(history, 7);
    expect(history.past.map((s) => s.data.map((part) => part.id))).toEqual([[1], [8]]);
    history = dropPart(takeUndo(history).history, 8);
    expect(history).toEqual({ past: [{ id: 1, label: "one", data: parts(1) }], future: [] });
  });
});

describe("inversePatch", () => {
  it("returns the current value of each edited field and ignores notes and versions", () => {
    const current = task("a", { status: "in_progress", due: "2026-11-01", assignee: "Mob" });
    expect(
      inversePatch(current, {
        status: "done",
        due: null,
        assignee: "Jake",
        note: "x",
        expectedUpdatedAt: 4,
      }),
    ).toEqual({ status: "in_progress", due: "2026-11-01", assignee: "Mob" });
    expect(inversePatch(task("b", { projectSlug: null }), { projectSlug: "app" })).toEqual({
      projectSlug: null,
    });
  });
});

describe("pending edits", () => {
  it("shows an edit at once and moves a project change to its section", () => {
    const tasks = [task("a"), task("b")];
    const overlay = startEdit(new Map(), "a", { status: "done", projectSlug: null });
    const shown = applyOverlay(tasks, overlay);
    expect(shown[0]).toMatchObject({ status: "done", projectSlug: null, section: "general" });
    expect(shown[1]).toBe(tasks[1]);
  });

  it("keeps two quick edits until the list shows the newest saved version", () => {
    let overlay = startEdit(new Map(), "a", { status: "done" });
    overlay = startEdit(overlay, "a", { priority: "high" });
    overlay = finishEdit(overlay, "a", 11);
    // The list now has version 11 from the first save; the second save is still open.
    expect(applyOverlay([task("a", { updatedAt: 11 })], overlay)[0]).toMatchObject({
      status: "done",
      priority: "high",
    });
    overlay = finishEdit(overlay, "a", 12);
    expect(applyOverlay([task("a", { updatedAt: 11 })], overlay)[0]?.priority).toBe("high");
    const server = [task("a", { updatedAt: 12, priority: "low" })];
    expect(applyOverlay(server, overlay)[0]?.priority).toBe("low");
  });

  it("drops the edit when the save fails, and keeps the list when nothing is pending", () => {
    const tasks = [task("a")];
    const failed = finishEdit(startEdit(new Map(), "a", { status: "done" }), "a", null);
    expect(failed.size).toBe(0);
    expect(applyOverlay(tasks, failed)).toBe(tasks);
  });
});

describe("property values", () => {
  it("reverts, shows and merges property edits", () => {
    const t = task("a", { props: { points: "3", mood: "Busy" } } as Partial<TaskView>);
    expect(inversePatch(t, { props: { points: "5", focus: "Home" } })).toEqual({
      props: { points: "3", focus: null },
    });
    let overlay = startEdit(new Map(), "a", { props: { points: null } });
    overlay = startEdit(overlay, "a", { props: { focus: "Home" } });
    const [shown] = applyOverlay([t], overlay);
    expect(shown?.props).toEqual({ mood: "Busy", focus: "Home" });
  });
});
