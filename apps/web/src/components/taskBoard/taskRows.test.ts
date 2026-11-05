import type { TaskBoardTask } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { groupBySection, type TaskView } from "./taskBoard.logic";
import {
  buildListGroups,
  capByRecency,
  COLUMN_PAGE,
  pageColumn,
  planRowMove,
  stepDrop,
  withManualOrder,
  flattenGroups,
  moveTargets,
  nextTaskId,
  projectNameFor,
  statusChangeForDrop,
  visibleTaskIds,
} from "./taskRows";

function view(id: string, overrides: Partial<TaskView> = {}): TaskView {
  const base: TaskBoardTask = {
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
    createdAt: 0,
    updatedAt: 0,
    labels: [],
    source: "aios_card",
    sourceId: id,
    sourceFile: `${id}.md`,
    issueUrl: null,
    history: [],
  };
  return { ...base, origin: "local", section: "leonidas-code", ...overrides };
}

describe("statusChangeForDrop", () => {
  it("ignores a drop on the column the card is already in", () => {
    expect(statusChangeForDrop({ status: "todo" }, "todo")).toBeNull();
  });

  it("returns the target column's status otherwise, including done", () => {
    expect(statusChangeForDrop({ status: "in_progress" }, "done")).toBe("done");
    expect(statusChangeForDrop({ status: "parked" }, "todo")).toBe("todo");
  });
});

describe("moveTargets", () => {
  it("offers every board column except the current one", () => {
    expect(moveTargets("review")).toEqual(["todo", "in_progress", "blocked", "done"]);
    expect(moveTargets("parked")).toHaveLength(5);
  });
});

describe("capByRecency", () => {
  it("keeps the most recently updated cards and counts the rest", () => {
    const tasks = [1, 5, 3, 4, 2].map((updatedAt) => ({ updatedAt }));
    const { visible, hidden } = capByRecency(tasks, 3);
    expect(visible.map((task) => task.updatedAt)).toEqual([5, 4, 3]);
    expect(hidden).toBe(2);
  });

  it("hides nothing under the limit", () => {
    expect(capByRecency([{ updatedAt: 1 }], 25)).toEqual({
      visible: [{ updatedAt: 1 }],
      hidden: 0,
    });
  });
});

describe("pageColumn", () => {
  const many = Array.from({ length: COLUMN_PAGE + 5 }, (_, index) => ({
    id: index,
    updatedAt: index,
  }));

  it("keeps an open column in order and hides the rest until Show more", () => {
    const first = pageColumn("todo", many, 0);
    expect(first.visible.map((task) => task.id).slice(0, 3)).toEqual([0, 1, 2]);
    expect(first.hidden).toBe(5);
    expect(pageColumn("todo", many, COLUMN_PAGE).hidden).toBe(0);
  });

  it("shows the newest done cards first", () => {
    const done = pageColumn("done", many, 0);
    expect(done.visible[0]?.id).toBe(COLUMN_PAGE + 4);
    expect(done.page).toBeLessThan(COLUMN_PAGE);
  });
});

describe("projectNameFor", () => {
  const names = new Map([["leonidas-code", "Leonidas Code"]]);

  it("uses the known project name, falls back to the card's project, and hides general", () => {
    expect(projectNameFor({ section: "leonidas-code", project: "x" }, names)).toBe("Leonidas Code");
    expect(projectNameFor({ section: "other", project: "Other Co" }, names)).toBe("Other Co");
    expect(projectNameFor({ section: "general", project: "General" }, names)).toBeNull();
  });
});

describe("buildListGroups", () => {
  const tasks = [
    view("a", { status: "todo" }),
    view("b", { status: "done" }),
    view("c", { status: "parked" }),
    view("d", { status: "in_progress", section: "scribe", project: "Scribe" }),
  ];

  it("groups by status with parked collapsed at the end and empty columns dropped", () => {
    const groups = buildListGroups({ tasks, sections: [], groupBy: "status" });
    expect(groups.map((group) => group.key)).toEqual([
      "status:todo",
      "status:in_progress",
      "status:done",
      "status:parked",
    ]);
    expect(groups.find((group) => group.key === "status:parked")?.defaultOpen).toBe(false);
  });

  it("groups by project section and skips empty sections", () => {
    const sections = groupBySection(tasks, [
      {
        slug: "leonidas-code",
        name: "Leonidas Code",
        projectId: null,
        repository: null,
        total: 0,
        open: 0,
      },
      { slug: "empty", name: "Empty", projectId: null, repository: null, total: 0, open: 0 },
    ]);
    const groups = buildListGroups({ tasks, sections, groupBy: "project" });
    expect(groups.map((group) => group.label)).toEqual(["Leonidas Code", "Scribe"]);
    expect(groups[0]?.openCount).toBe(1);
  });

  it("flattens groups into header and task rows, keeping only the header of a collapsed group", () => {
    const groups = buildListGroups({ tasks, sections: [], groupBy: "status" });
    const items = flattenGroups(groups, { "status:todo": false });
    expect(items.map((item) => item.key)).toEqual([
      "group:status:todo",
      "group:status:in_progress",
      "d",
      "group:status:done",
      "b",
      "group:status:parked",
    ]);
    const flat = flattenGroups(buildListGroups({ tasks, sections: [], groupBy: "none" }), {});
    expect(flat.every((item) => item.kind === "task")).toBe(true);
  });

  it("groups by state: Now, Next, Closed, each with a hint, and folds Later", () => {
    const groups = buildListGroups({ tasks, sections: [], groupBy: "state", now: 0 });
    expect(groups.map((group) => [group.label, group.count])).toEqual([
      ["Now", 1],
      ["Next", 1],
      ["Closed", 2],
    ]);
    expect(groups.every((group) => group.hint)).toBe(true);
    const nine = Array.from({ length: 9 }, (_, i) => view(`t${i}`));
    const later = buildListGroups({ tasks: nine, sections: [], groupBy: "state", now: 0 }).find(
      (group) => group.label === "Later",
    );
    expect(later?.defaultOpen).toBe(false);
  });

  it("returns one headerless group for a flat list and none when empty", () => {
    expect(buildListGroups({ tasks, sections: [], groupBy: "none" })[0]?.label).toBeNull();
    expect(buildListGroups({ tasks: [], sections: [], groupBy: "none" })).toEqual([]);
  });

  it("leaves collapsed groups out of keyboard navigation", () => {
    const groups = buildListGroups({ tasks, sections: [], groupBy: "status" });
    expect(visibleTaskIds(groups, {})).toEqual(["a", "d", "b"]);
    expect(visibleTaskIds(groups, { "status:parked": true, "status:todo": false })).toEqual([
      "d",
      "b",
      "c",
    ]);
  });

  it("groups by priority, most urgent first, empty groups dropped", () => {
    const tasks = [
      view("a", { priority: "low" }),
      view("b", { priority: "critical" }),
      view("c", { priority: "low" }),
    ];
    const groups = buildListGroups({ tasks, sections: [], groupBy: "priority" });
    expect(groups.map((group) => [group.key, group.label, group.count])).toEqual([
      ["priority:critical", "Critical", 1],
      ["priority:low", "Low", 2],
    ]);
  });

  it("groups by due week: past due, this week to Sunday, next week, later, no date", () => {
    const thursday = new Date(2026, 10, 5, 12).getTime();
    const tasks = [
      view("none"),
      view("later", { due: "2026-11-16" }),
      view("next", { due: "2026-11-09" }),
      view("sunday", { due: "2026-11-08" }),
      view("today", { due: "2026-11-05" }),
      view("late", { due: "2026-11-01" }),
    ];
    const groups = buildListGroups({ tasks, sections: [], groupBy: "due", now: thursday });
    expect(groups.map((group) => [group.label, group.tasks.map((task) => task.id)])).toEqual([
      ["Past due", ["late"]],
      ["This week", ["sunday", "today"]],
      ["Next week", ["next"]],
      ["Later", ["later"]],
      ["No due date", ["none"]],
    ]);
  });

  it("starts a new week on Monday when today is Sunday", () => {
    const sunday = new Date(2026, 10, 8, 12).getTime();
    const tasks = [view("sunday", { due: "2026-11-08" }), view("monday", { due: "2026-11-09" })];
    const groups = buildListGroups({ tasks, sections: [], groupBy: "due", now: sunday });
    expect(groups.map((group) => group.label)).toEqual(["This week", "Next week"]);
  });
});

describe("nextTaskId", () => {
  const ids = ["a", "b", "c"];

  it("moves and clamps at the ends", () => {
    expect(nextTaskId(ids, "a", "ArrowDown")).toBe("b");
    expect(nextTaskId(ids, "c", "ArrowDown")).toBe("c");
    expect(nextTaskId(ids, "a", "ArrowUp")).toBe("a");
    expect(nextTaskId(ids, "b", "End")).toBe("c");
    expect(nextTaskId(ids, "b", "Home")).toBe("a");
  });

  it("starts from the matching end when nothing is selected", () => {
    expect(nextTaskId(ids, null, "ArrowDown")).toBe("a");
    expect(nextTaskId(ids, "gone", "ArrowUp")).toBe("c");
    expect(nextTaskId([], null, "ArrowDown")).toBeNull();
  });
});

describe("row moves", () => {
  const tasks = [
    view("a"),
    view("b"),
    view("c", { status: "in_progress" }),
    view("d", { section: "home", projectSlug: "home" }),
  ];
  const sections = groupBySection(tasks, [], { hideEmpty: true });
  const byStatus = buildListGroups({ tasks, sections, groupBy: "status" });
  const byProject = buildListGroups({ tasks, sections, groupBy: "project" });
  const byState = buildListGroups({ tasks, sections, groupBy: "state", now: 0 });

  it("moves a row inside its group with no card change", () => {
    expect(planRowMove(byStatus, "status", "a", { overId: "d", edge: "after" })).toEqual({
      groupKey: "status:todo",
      orderedIds: ["a", "b", "d"],
      index: 2,
      patch: null,
    });
  });

  it("changes status or project when a row drops in another group", () => {
    expect(planRowMove(byStatus, "status", "a", { overId: "c", edge: "before" })).toMatchObject({
      orderedIds: ["c"],
      index: 0,
      patch: { status: "in_progress" },
    });
    const header = { overId: "group:section:leonidas-code", edge: "after" } as const;
    expect(planRowMove(byProject, "project", "d", header)).toMatchObject({
      index: 0,
      patch: { projectSlug: "leonidas-code" },
    });
  });

  it("refuses a drop that changes nothing or that the grouping cannot save", () => {
    expect(planRowMove(byStatus, "status", "a", { overId: "b", edge: "before" })).toBeNull();
    expect(planRowMove(byStatus, "status", "a", { overId: "a", edge: "after" })).toBeNull();
    expect(byState.map((group) => group.key)).toEqual(["state:now", "state:next"]);
    expect(planRowMove(byState, "state", "c", { overId: "a", edge: "before" })).toBeNull();
  });

  it("steps a row up or down inside its group and stops at the group edge", () => {
    expect(stepDrop(byStatus, "b", "up")).toEqual({ overId: "a", edge: "before" });
    expect(stepDrop(byStatus, "b", "down")).toEqual({ overId: "d", edge: "after" });
    expect(stepDrop(byStatus, "a", "up")).toBeNull();
    expect(stepDrop(byStatus, "c", "down")).toBeNull();
  });

  it("puts ranked rows first in each group and keeps the rest in order", () => {
    const [todo] = withManualOrder(byStatus, { d: 1, b: 2 });
    expect(todo!.tasks.map((task) => task.id)).toEqual(["d", "b", "a"]);
    expect(withManualOrder(byStatus, {})).toBe(byStatus);
  });
});
