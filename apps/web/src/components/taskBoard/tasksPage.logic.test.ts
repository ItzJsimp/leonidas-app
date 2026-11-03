import type { ProjectId, TaskBoardTask, TaskBoardWorkspaceProject } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { mergeTasks, type TaskView } from "./taskBoard.logic";
import {
  activeFilterCount,
  buildRailEntries,
  DEFAULT_TASKS_PREFS,
  landingPrefs,
  openFirst,
  parseTasksPrefs,
  prefsForList,
  placeSharedOnlyIn,
  searchBase,
  sectionShareState,
  tasksInSection,
  toTaskFilters,
  tasksInFocus,
  taskProjectSlug,
} from "./tasksPage.logic";

const PROJECT_ID = "project-1" as ProjectId;

describe("task-only projects", () => {
  it("restores the roadmap view after reloading", () => {
    expect(
      parseTasksPrefs(JSON.stringify({ view: "roadmap", section: "leonidas-code", focus: "all" }))
        .view,
    ).toBe("roadmap");
  });
  it("creates stable keys for names without filesystem paths", () => {
    expect(taskProjectSlug(" Weekly Planning ")).toBe("weekly-planning");
    expect(taskProjectSlug("Café / 家庭")).toBe("café-家庭");
    expect(taskProjectSlug("../Work\\Team")).toBe("work-team");
    expect(taskProjectSlug(" -- ")).toBe("");
    expect(taskProjectSlug("General")).toBe("general-tasks");
  });
});

describe("daily task views", () => {
  const now = new Date(2026, 9, 12, 23, 30).getTime();
  const tasks = mergeTasks(
    [
      task("inbox", { projectSlug: null }),
      task("overdue", { due: "2026-10-11" }),
      task("today", { due: "2026-10-12" }),
      task("future", { due: "2026-10-13" }),
      task("done", { due: "2026-10-12", status: "done" }),
      task("parked", { due: "2026-10-12", status: "parked" }),
      task("invalid", { due: "2026-02-30" }),
    ],
    [],
  );
  it("keeps unassigned tasks in Inbox and excludes closed work", () => {
    expect(tasksInFocus(tasks, "inbox", now).map((item) => item.id)).toEqual(["inbox"]);
  });
  it("includes overdue and today's work in Today", () => {
    expect(tasksInFocus(tasks, "today", now).map((item) => item.id)).toEqual(["overdue", "today"]);
  });
  it("includes today and future dates in Upcoming, excluding invalid dates", () => {
    expect(tasksInFocus(tasks, "upcoming", now).map((item) => item.id)).toEqual([
      "today",
      "future",
    ]);
    expect(tasksInFocus([], "today", now)).toEqual([]);
  });
  it("can show completed daily tasks so they can be reopened", () => {
    expect(tasksInFocus(tasks, "today", now, true).map((item) => item.id)).toEqual([
      "overdue",
      "today",
      "done",
    ]);
  });
});

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
    createdAt: 0,
    updatedAt: 0,
    labels: [],
    source: "aios_card",
    sourceId: id,
    sourceFile: `${id}.md`,
    issueUrl: null,
    history: [],
    projectSlug: "leonidas-code",
    ...overrides,
  };
}

function project(
  slug: string,
  overrides: Partial<TaskBoardWorkspaceProject> = {},
): TaskBoardWorkspaceProject {
  return {
    slug,
    name: slug,
    projectId: null,
    repository: null,
    total: 0,
    open: 0,
    ...overrides,
  };
}

describe("parseTasksPrefs", () => {
  it("falls back to defaults for missing or malformed input", () => {
    expect(parseTasksPrefs(null)).toEqual(DEFAULT_TASKS_PREFS);
    expect(parseTasksPrefs("{not json")).toEqual(DEFAULT_TASKS_PREFS);
    expect(parseTasksPrefs("42")).toEqual(DEFAULT_TASKS_PREFS);
  });

  it("keeps valid values and drops unknown ones", () => {
    const prefs = parseTasksPrefs(
      JSON.stringify({
        view: "board",
        section: "leonidas-code",
        statuses: ["todo", "bogus"],
        priorities: ["bogus"],
        mine: true,
        sort: "nonsense",
        groupBy: "status",
        flag: "stale",
      }),
    );
    expect(prefs.view).toBe("board");
    expect(prefs.section).toBe("leonidas-code");
    expect(prefs.statuses).toEqual(["todo"]);
    expect(prefs.priorities).toBeNull();
    // An old "Mine" toggle becomes the Mine owner lens.
    expect(prefs.owner).toBe("mine");
    expect(prefs.sort).toBe("priority");
    expect(prefs.groupBy).toBe("status");
    expect(prefs.flag).toBe("stale");
    expect(parseTasksPrefs(JSON.stringify({ flag: "bogus" })).flag).toBeNull();
  });
});

describe("toTaskFilters", () => {
  it("never hides closed work on the board", () => {
    expect(toTaskFilters({ ...DEFAULT_TASKS_PREFS, view: "board" }, "", 0).includeClosed).toBe(
      true,
    );
    expect(toTaskFilters({ ...DEFAULT_TASKS_PREFS, view: "list" }, "", 0).includeClosed).toBe(
      false,
    );
  });

  it("counts only the filters that narrow the list", () => {
    expect(activeFilterCount(DEFAULT_TASKS_PREFS, "  ")).toBe(0);
    expect(
      activeFilterCount({ ...DEFAULT_TASKS_PREFS, sharedOnly: true, statuses: ["todo"] }, "x"),
    ).toBe(3);
    expect(activeFilterCount({ ...DEFAULT_TASKS_PREFS, flag: "noGates" }, "")).toBe(1);
  });

  it("passes the flag and the time through", () => {
    expect(toTaskFilters({ ...DEFAULT_TASKS_PREFS, flag: "stale" }, "", 5)).toMatchObject({
      flag: "stale",
      now: 5,
    });
  });
});

describe("buildRailEntries", () => {
  const projects = [
    project("leonidas-code", { projectId: PROJECT_ID, repository: "a/b" }),
    project("empty-aios-only"),
    project("linked-but-empty", { projectId: "project-2" as ProjectId }),
  ];

  it("lists projects with tasks or a Leonidas project, and No project only when used", () => {
    const tasks = mergeTasks([task("a"), task("b", { status: "done" })], []);
    const entries = buildRailEntries(tasks, projects);
    expect(entries.map((entry) => entry.slug)).toEqual(["leonidas-code", "linked-but-empty"]);
    expect(entries[0]).toMatchObject({ open: 1, total: 2 });

    const withLoose = mergeTasks([task("c", { projectSlug: null, project: "General" })], []);
    expect(buildRailEntries(withLoose, projects).at(-1)?.slug).toBe("general");
  });
});

describe("sectionShareState", () => {
  const entry = (overrides: Partial<ReturnType<typeof buildRailEntries>[number]> = {}) => ({
    slug: "leonidas-code",
    name: "Leonidas Code",
    projectId: PROJECT_ID,
    repository: "a/b",
    open: 0,
    total: 0,
    ...overrides,
  });

  it("offers sharing for unshared open cards, then notes they are shared", () => {
    const local = mergeTasks([task("a"), task("b")], []);
    expect(sectionShareState(entry(), local)).toEqual({ kind: "share", count: 2 });
    const shared = mergeTasks([task("a")], [task("a", { shared: true })]);
    expect(sectionShareState(entry(), shared)).toEqual({ kind: "shared" });
  });

  it("explains why sharing is unavailable", () => {
    const tasks: TaskView[] = [];
    expect(sectionShareState(entry({ repository: null }), tasks).kind).toBe("unavailable");
    expect(sectionShareState(entry({ projectId: null }), tasks).kind).toBe("unavailable");
    expect(sectionShareState(entry({ slug: "general" }), tasks).kind).toBe("hidden");
    expect(sectionShareState(null, tasks).kind).toBe("hidden");
  });
});

describe("section helpers", () => {
  it("scopes tasks and places shared-only cards in the fetched project's section", () => {
    const merged = mergeTasks(
      [task("a")],
      [task("z", { source: "board", sourceId: null, projectSlug: null, project: "Other Name" })],
    );
    expect(tasksInSection(merged, null)).toHaveLength(2);
    const placed = placeSharedOnlyIn(merged, "leonidas-code");
    expect(tasksInSection(placed, "leonidas-code").map((item) => item.id)).toEqual(["a", "z"]);
  });
});

describe("landing and search", () => {
  it("opens on every open task in the Table view and keeps saved filters", () => {
    const saved = {
      ...DEFAULT_TASKS_PREFS,
      view: "board",
      focus: "inbox",
      section: "x",
      sort: "due",
    } as const;
    expect(landingPrefs(saved)).toMatchObject({
      view: "list",
      focus: "all",
      section: null,
      sort: "due",
    });
  });

  it("searches every card, closed ones included, open matches first", () => {
    const all = mergeTasks([task("a", { status: "done" }), task("b"), task("c")], []);
    const scoped = all.slice(2);
    expect(searchBase(all, scoped, "  ")).toBe(scoped);
    expect(searchBase(all, scoped, "task")).toBe(all);
    expect(toTaskFilters(DEFAULT_TASKS_PREFS, "task", 0).includeClosed).toBe(true);
    expect(openFirst(all).map((item) => item.id)).toEqual(["b", "c", "a"]);
  });
});

describe("prefsForList", () => {
  it("opens the grouped Table with only the tile's own filter", () => {
    expect(prefsForList("waiting")).toMatchObject({
      view: "list",
      groupBy: "state",
      statuses: ["review", "blocked"],
      flag: null,
    });
    expect(prefsForList("stale")).toMatchObject({ statuses: null, flag: "stale" });
    expect(prefsForList("now")).toMatchObject({ statuses: null, flag: null, priorities: null });
  });
});
