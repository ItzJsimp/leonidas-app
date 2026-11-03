import type { TaskBoardTask } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { compareDoNext, groupByState, NEXT_COUNT } from "./doNext.logic";
import type { TaskView } from "./taskBoard.logic";

const DAY = 86_400_000;
// Local noon so that day boundaries are unambiguous in any time zone.
const NOW = new Date(2026, 9, 11, 12, 0, 0).getTime();

function task(id: string, overrides: Partial<TaskBoardTask> = {}): TaskBoardTask {
  return {
    id,
    project: "Leonidas Code",
    title: `Task ${id}`,
    description: "",
    status: "todo",
    priority: "medium",
    claimedBy: null,
    claimedAt: null,
    claimedAgent: null,
    completedBy: null,
    completedAt: null,
    completionSummary: null,
    createdAt: NOW - 30 * DAY,
    updatedAt: NOW - DAY,
    labels: [],
    source: "aios_card",
    sourceId: id,
    sourceFile: `${id}.md`,
    issueUrl: null,
    history: [],
    ...overrides,
  };
}

function view(
  id: string,
  overrides: Partial<TaskBoardTask> = {},
  extra: Partial<Pick<TaskView, "origin" | "section">> = {},
): TaskView {
  const base = task(id, overrides);
  return { ...base, origin: "local", section: base.projectSlug ?? "general", ...extra };
}

describe("compareDoNext", () => {
  const rank = (cards: TaskBoardTask[]) =>
    cards.toSorted((a, b) => compareDoNext(a, b, NOW)).map((card) => card.id);

  it("puts work due within 7 days, or late, before higher priority work", () => {
    expect(
      rank([
        task("critical", { priority: "critical" }),
        task("week", { priority: "low", due: "2026-10-18" }),
        task("late", { priority: "low", due: "2026-10-01", updatedAt: NOW - 2 * DAY }),
        task("eight", { priority: "low", due: "2026-10-19" }),
      ]),
    ).toEqual(["week", "late", "critical", "eight"]);
  });

  it("breaks ties by priority, then closest to done, then most recently touched", () => {
    expect(
      rank([
        task("old", { updatedAt: NOW - 9 * DAY }),
        task("half", { checklist: { done: 1, total: 2 } }),
        task("high", { priority: "high" }),
        task("new", { updatedAt: NOW - DAY / 2 }),
      ]),
    ).toEqual(["high", "half", "new", "old"]);
  });
});

describe("groupByState", () => {
  const todos = Array.from({ length: NEXT_COUNT + 2 }, (_, i) =>
    view(`t${i}`, { updatedAt: NOW - (i + 1) * DAY }),
  );
  const groups = groupByState(
    [
      view("work", { status: "in_progress", priority: "low" }),
      view("late", { due: "2026-10-09" }),
      view("review", { status: "review" }),
      view("blocked", { status: "blocked", priority: "low" }),
      ...todos.toReversed(),
      view("done", { status: "done" }),
      view("parked", { status: "parked" }),
    ],
    NOW,
  );
  const ids = (cards: ReadonlyArray<TaskView>) => cards.map((card) => card.id);

  it("puts in-progress and late work in Now, late first", () => {
    expect(ids(groups.now)).toEqual(["late", "work"]);
  });

  it("keeps the top to-do cards in Next and the rest in Later, in do-next order", () => {
    expect(ids(groups.next)).toEqual(ids(todos.slice(0, NEXT_COUNT)));
    expect(ids(groups.later)).toEqual(ids(todos.slice(NEXT_COUNT)));
  });

  it("puts review and blocked work in Waiting, blocked first", () => {
    expect(ids(groups.waiting)).toEqual(["blocked", "review"]);
  });

  it("keeps closed cards apart in their incoming order", () => {
    expect(ids(groups.closed)).toEqual(["done", "parked"]);
  });
});
