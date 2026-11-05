import type {
  TaskBoardHistoryEntry,
  TaskBoardTask,
  TaskBoardWorkspaceProject,
} from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  buildDashboard,
  buildTaskPrompt,
  DEFAULT_FILTERS,
  filterTasks,
  formatDue,
  groupBySection,
  groupByStatus,
  isOpen,
  mergeTasks,
  priorityRank,
  relativeTime,
  taskFlags,
  shareableOpenCount,
  sortTasks,
  splitDoneWhen,
  statusLabel,
  statusTone,
  type TaskView,
} from "./taskBoard.logic";
import { buildFocus, whyFirst } from "./doNext.logic";

const DAY = 86_400_000;
// Local noon so that day boundaries are unambiguous in any time zone.
const NOW = new Date(2026, 9, 11, 12, 0, 0).getTime();
const at = (daysAgo: number, hour = 12) => {
  const base = new Date(NOW);
  return new Date(base.getFullYear(), base.getMonth(), base.getDate() - daysAgo, hour).getTime();
};

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

function entry(
  taskId: string,
  timestamp: number,
  overrides: Partial<TaskBoardHistoryEntry> = {},
): TaskBoardHistoryEntry {
  return {
    id: `${taskId}-${timestamp}`,
    taskId,
    action: "updated",
    actor: "Jake",
    timestamp,
    ...overrides,
  };
}

describe("mergeTasks", () => {
  it("collapses a shared card that mirrors a local card and keeps the local fields", () => {
    const local = [task("a", { title: "Local title", projectSlug: "leonidas-code" })];
    const shared = [
      task("shared-a", {
        title: "Stale shared title",
        sourceId: "a",
        projectSlug: "leonidas-code",
        shared: true,
        sharedBy: "Mob",
      }),
    ];
    const merged = mergeTasks(local, shared);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({
      id: "a",
      title: "Local title",
      origin: "both",
      shared: true,
      sharedBy: "Mob",
      section: "leonidas-code",
    });
  });

  it("keeps shared cards without a local twin and places them by project slug or name", () => {
    const merged = mergeTasks(
      [task("a", { projectSlug: "alpha" })],
      [
        task("b", { sourceId: "b", projectSlug: "beta", sharedBy: "Mob" }),
        task("c", { source: "board", sourceId: null, project: "Leonidas Code" }),
        task("d", { source: "github_issue", sourceId: "42", project: "Team & Co!" }),
      ],
    );
    const byId = Object.fromEntries(merged.map((item) => [item.id, item]));
    expect(byId.a).toMatchObject({ origin: "local", section: "alpha" });
    expect(byId.b).toMatchObject({ origin: "shared", section: "beta", shared: true });
    expect(byId.c).toMatchObject({ origin: "shared", section: "leonidas-code" });
    expect(byId.d).toMatchObject({ origin: "shared", section: "team-co" });
  });

  it("does not collapse board tasks whose source id equals a local card id", () => {
    const merged = mergeTasks([task("a")], [task("x", { source: "board", sourceId: "a" })]);
    expect(merged.map((item) => item.origin)).toEqual(["local", "shared"]);
  });

  it("puts local cards without a project in the general section", () => {
    expect(mergeTasks([task("a")], [])[0]?.section).toBe("general");
  });
});

describe("labels and ordering", () => {
  it("labels and ranks statuses and priorities", () => {
    expect(statusLabel("in_progress")).toBe("In progress");
    expect(statusLabel("review")).toBe("In review");
    expect(statusTone("blocked")).toBe("danger");
    expect(statusTone("parked")).toBe("muted");
    expect(isOpen({ status: "review" })).toBe(true);
    expect(isOpen({ status: "done" })).toBe(false);
    expect(priorityRank("critical")).toBe(0);
    expect(priorityRank("low")).toBeGreaterThan(priorityRank("high"));
  });
});

describe("filterTasks", () => {
  const tasks = [
    view("a", { title: "Fix login", claimedBy: "Jake", labels: ["auth"], priority: "high" }),
    view("b", { title: "Docs", description: "Write the LOGIN guide", status: "blocked" }),
    view("c", { title: "Shipped", status: "done" }),
    view("d", { title: "Later", status: "parked" }, { origin: "shared" }),
    view("e", { title: "Mob work", claimedBy: "mob" }, { origin: "both" }),
  ];
  const ids = (list: ReadonlyArray<TaskView>) => list.map((item) => item.id);

  it("keeps only stale, or only gateless, open cards when a flag is set", () => {
    const flagged = [
      view("old", { updatedAt: NOW - 30 * DAY, checklist: { done: 0, total: 2 } }),
      view("bare"),
      view("gated", { checklist: { done: 1, total: 2 } }),
    ];
    const at = (flag: "stale" | "noGates") =>
      ids(filterTasks(flagged, { ...DEFAULT_FILTERS, flag, now: NOW }));
    expect(at("stale")).toEqual(["old"]);
    expect(at("noGates")).toEqual(["bare"]);
  });

  it("hides closed tasks by default", () => {
    expect(ids(filterTasks(tasks, DEFAULT_FILTERS))).toEqual(["a", "b", "e"]);
    expect(ids(filterTasks(tasks, { ...DEFAULT_FILTERS, includeClosed: true }))).toEqual([
      "a",
      "b",
      "c",
      "d",
      "e",
    ]);
  });

  it("matches the query against title, description, labels, assignee and id", () => {
    const search = (query: string) => ids(filterTasks(tasks, { ...DEFAULT_FILTERS, query }));
    expect(search("login")).toEqual(["a", "b"]);
    expect(search("AUTH")).toEqual(["a"]);
    expect(search("mob")).toEqual(["e"]);
    expect(search("  b ")).toContain("b");
  });

  it("honours explicit status filters even for closed statuses", () => {
    const statuses = new Set(["done" as const]);
    expect(ids(filterTasks(tasks, { ...DEFAULT_FILTERS, statuses }))).toEqual(["c"]);
  });

  it("filters by priority and shared", () => {
    const priorities = new Set(["high" as const]);
    expect(ids(filterTasks(tasks, { ...DEFAULT_FILTERS, priorities }))).toEqual(["a"]);
    expect(
      ids(filterTasks(tasks, { ...DEFAULT_FILTERS, sharedOnly: true, includeClosed: true })),
    ).toEqual(["d", "e"]);
  });
});

describe("sortTasks", () => {
  const tasks = [
    task("a", { title: "banana", priority: "low", updatedAt: 3, due: "2026-10-20" }),
    task("b", { title: "Apple", priority: "critical", updatedAt: 1 }),
    task("c", { title: "cherry", priority: "critical", updatedAt: 2, due: "2026-10-12" }),
  ];
  const ids = (sort: Parameters<typeof sortTasks>[1]) => sortTasks(tasks, sort).map((t) => t.id);

  it("sorts by each key without mutating the input", () => {
    expect(ids("priority")).toEqual(["c", "b", "a"]);
    expect(ids("updated")).toEqual(["a", "c", "b"]);
    expect(ids("due")).toEqual(["c", "a", "b"]);
    expect(ids("title")).toEqual(["b", "a", "c"]);
    expect(tasks.map((t) => t.id)).toEqual(["a", "b", "c"]);
  });
});

describe("groupBySection", () => {
  const projects: TaskBoardWorkspaceProject[] = [
    {
      slug: "beta",
      name: "Beta",
      projectId: null,
      repository: "o/beta",
      total: 0,
      open: 0,
    },
    { slug: "alpha", name: "Alpha", projectId: null, repository: null, total: 0, open: 0 },
  ];
  const tasks = [
    view("1", {}, { section: "general" }),
    view("2", { status: "done" }, { section: "alpha" }),
    view("3", {}, { section: "alpha" }),
    view("4", { project: "Mystery Box" }, { section: "mystery" }),
  ];

  it("follows project order, appends unknown slugs and puts general last", () => {
    const groups = groupBySection(tasks, projects);
    expect(groups.map((g) => g.slug)).toEqual(["beta", "alpha", "mystery", "general"]);
    expect(groups[0]).toMatchObject({ name: "Beta", repository: "o/beta", open: 0 });
    expect(groups[1]).toMatchObject({ name: "Alpha", open: 1 });
    expect(groups[1]?.tasks.map((t) => t.id)).toEqual(["2", "3"]);
    expect(groups[2]?.name).toBe("Mystery Box");
    expect(groups[3]).toMatchObject({ name: "No project", open: 1 });
  });

  it("omits empty sections only when asked", () => {
    expect(groupBySection(tasks, projects, { hideEmpty: true }).map((g) => g.slug)).toEqual([
      "alpha",
      "mystery",
      "general",
    ]);
    expect(groupBySection([], projects, { hideEmpty: true })).toEqual([]);
  });
});

describe("groupByStatus", () => {
  it("returns the five kanban columns and drops parked and retired work", () => {
    const columns = groupByStatus([
      view("a", { status: "review" }),
      view("b", { status: "todo" }),
      view("c", { status: "parked" }),
      view("d", { status: "todo" }),
      view("e", { status: "retired" }),
    ]);
    expect(columns.map((c) => c.status)).toEqual([
      "todo",
      "in_progress",
      "review",
      "blocked",
      "done",
    ]);
    expect(columns.map((c) => c.tasks.map((t) => t.id))).toEqual([["b", "d"], [], ["a"], [], []]);
  });
});

describe("buildDashboard", () => {
  const tasks: TaskView[] = [
    view(
      "overdue",
      { priority: "high", due: "2026-10-09", claimedBy: "Jake" },
      { section: "alpha" },
    ),
    view(
      "today",
      { priority: "critical", due: "2026-10-11", status: "in_progress", claimedBy: "jake" },
      { section: "alpha" },
    ),
    view("soon", { priority: "medium", due: "2026-10-18" }, { section: "beta" }),
    view("later", { priority: "low", due: "2026-10-19" }, { section: "beta" }),
    view(
      "blocked",
      { status: "blocked", priority: "critical", updatedAt: NOW - 30 * DAY },
      { section: "beta" },
    ),
    view("review", { status: "review", priority: "high" }, { section: "beta", origin: "both" }),
    view(
      "stale",
      { updatedAt: NOW - 22 * DAY, priority: "low" },
      { section: "general", origin: "shared" },
    ),
    view("fresh", { updatedAt: NOW - 21 * DAY + 60_000 }, { section: "general" }),
    view("done-today", { status: "done", completedAt: at(0, 1) }, { section: "alpha" }),
    view("done-6d", { status: "done", completedAt: NOW - 6 * DAY }, { section: "alpha" }),
    view("done-8d", { status: "done", completedAt: NOW - 8 * DAY }, { section: "alpha" }),
    view("done-old", { status: "done", completedAt: at(14, 12) }, { section: "alpha" }),
    view("parked", { status: "parked" }, { section: "general" }),
  ];
  const dash = buildDashboard(tasks, NOW, "Jake");

  it("counts statuses, assignment and sharing", () => {
    expect(dash).toMatchObject({
      open: 8,
      inProgress: 1,
      review: 1,
      blocked: 1,
      unassigned: 6,
      mine: 2,
      sharedOpen: 2,
    });
  });

  it("counts overdue and due-soon by local calendar day", () => {
    expect(dash.overdue).toBe(1);
    // today and soon (+7 days); later (+8) is outside the window and overdue is excluded.
    expect(dash.dueSoon).toBe(2);
  });

  it("counts completions in the last seven days", () => {
    expect(dash.doneThisWeek).toBe(2);
  });

  it("counts open tasks by priority", () => {
    expect(dash.byPriority).toEqual({ critical: 2, high: 2, medium: 2, low: 2 });
  });

  it("summarises sections in first-seen order", () => {
    expect(dash.bySection).toEqual([
      { slug: "alpha", open: 2, done: 4, inProgress: 1, blocked: 0 },
      { slug: "beta", open: 4, done: 0, inProgress: 0, blocked: 1 },
      { slug: "general", open: 2, done: 0, inProgress: 0, blocked: 0 },
    ]);
  });

  it("buckets completions into the last 14 local days, oldest first", () => {
    expect(dash.completionsPerDay).toHaveLength(14);
    expect(dash.completionsPerDay[13]).toEqual({ day: "2026-10-11", count: 1 });
    expect(dash.completionsPerDay[0]?.day).toBe("2026-09-28");
    // done-old was completed 14 days ago, one day before the window starts.
    const total = dash.completionsPerDay.reduce((sum, day) => sum + day.count, 0);
    expect(total).toBe(3);
    expect(dash.completionsPerDay[7]).toEqual({ day: "2026-10-05", count: 1 });
  });

  it("lists stale open work oldest first and respects the 21 day boundary", () => {
    expect(dash.staleOpen.map((t) => t.id)).toEqual(["blocked", "stale"]);
  });

  it("limits stale work to five", () => {
    const many = Array.from({ length: 8 }, (_, i) =>
      view(`s${i}`, { updatedAt: NOW - (30 + i) * DAY }),
    );
    const result = buildDashboard(many, NOW, "x").staleOpen;
    expect(result).toHaveLength(5);
    expect(result[0]?.id).toBe("s7");
  });

  it("leads Focus with a late card, then the rest of Now and Next", () => {
    const focus = buildFocus(tasks, NOW);
    expect(focus.lead?.id).toBe("overdue");
    expect(focus.rest.map((t) => t.id)).toEqual(["today", "soon", "fresh", "later", "stale"]);
    expect(focus.counts).toEqual({ now: 2, waiting: 2, stale: 2, noGates: 8 });
  });

  it("leads Focus with a late card before a to-do card that is due later", () => {
    const focus = buildFocus(
      [
        view("soon", { due: "2026-10-12", priority: "high" }),
        view("late", { due: "2026-10-05", priority: "low" }),
      ],
      NOW,
    );
    expect(focus.lead?.id).toBe("late");
    expect(focus.rest.map((t) => t.id)).toEqual(["soon"]);
  });

  it("says why the lead card comes first", () => {
    const byId = (id: string) => tasks.find((t) => t.id === id)!;
    expect(whyFirst(byId("today"), NOW)).toBe(
      "In progress, due today, Critical priority, no gates",
    );
    expect(whyFirst(byId("overdue"), NOW)).toBe("2 d late, High priority, no gates");
    expect(whyFirst(view("g", { checklist: { done: 2, total: 5 }, due: "2026-10-14" }), NOW)).toBe(
      "due in 3 d, Medium priority, 2 of 5 gates done",
    );
  });

  it("returns the latest eight history entries with readable text", () => {
    const withHistory = [
      view("h1", {
        history: [
          entry("h1", NOW - 5000, { action: "progress", note: "Wired  the\nrouter", actor: "Mob" }),
          entry("h1", NOW - 9000, { action: "created" }),
        ],
      }),
      view("h2", {
        history: Array.from({ length: 9 }, (_, i) => entry("h2", NOW - i * 1000 - 100)),
      }),
    ];
    const { recentActivity } = buildDashboard(withHistory, NOW, "Jake");
    expect(recentActivity).toHaveLength(8);
    expect(recentActivity.map((item) => item.at)).toEqual(
      [...recentActivity.map((item) => item.at)].sort((a, b) => b - a),
    );
    const progress = recentActivity.find((item) => item.actor === "Mob");
    expect(progress).toMatchObject({ text: "Progress: Wired the router" });
    expect(progress?.task.id).toBe("h1");
  });

  it("handles an empty board", () => {
    const empty = buildDashboard([], NOW, "Jake");
    expect(empty.open).toBe(0);
    expect(empty.completionsPerDay).toHaveLength(14);
    expect(buildFocus([], NOW)).toMatchObject({ lead: null, rest: [] });
  });
});

describe("buildTaskPrompt", () => {
  it("passes the release milestone to the delegated agent", () => {
    expect(
      buildTaskPrompt(task("release", { milestone: "0.22.0" }), { aiosRoot: null, member: "Jake" }),
    ).toContain("Release milestone: V0.22.0.");
  });
  it("points agents at native storage even when an AIOS is also connected", () => {
    const prompt = buildTaskPrompt(task("native", { sourceRoot: "D:/Leonidas Data/task-board" }), {
      aiosRoot: "D:/AIOS",
      member: "Jake",
    });
    expect(prompt).toContain("D:/Leonidas Data/task-board/tasks/native.md");
    expect(prompt).not.toContain("D:/AIOS/tasks/native.md");
  });
  const full = task("0042", {
    title: "Ship the board",
    priority: "high",
    description: "Make the board work.\n\n## Done when\n- tests pass\n- UI shows cards",
    verify: "vp test run src/board.test.ts",
    startFiles: ["apps/web/src/board.tsx", "apps/server/src/board.ts"],
    blockedBy: ["0041"],
    sourceFile: "0042-ship-the-board.md",
    checklist: { done: 1, total: 3 },
    due: "2026-10-15",
  });

  it("includes everything the agent needs to start", () => {
    const prompt = buildTaskPrompt(full, { aiosRoot: "D:\\Leonidas AIOS\\", member: "Jake" });
    expect(prompt).toContain("You are picking up task 0042: Ship the board.");
    expect(prompt).toContain("Priority: high");
    expect(prompt).toContain("- tests pass");
    expect(prompt).toContain("vp test run src/board.test.ts");
    expect(prompt).toContain("- apps/web/src/board.tsx");
    expect(prompt).toContain("D:\\Leonidas AIOS/tasks/0042-ship-the-board.md");
    expect(prompt).toContain("- 0041");
    expect(prompt).toContain("1 of 3");
    expect(prompt).toContain("in_progress");
    expect(prompt).toContain("review");
    expect(prompt).toContain("done");
    expect(prompt).toContain("note");
  });

  it("omits optional sections when they are not known", () => {
    const prompt = buildTaskPrompt(task("1", { sourceFile: null }), {
      aiosRoot: null,
      member: "Jake",
    });
    expect(prompt).not.toContain("Task card:");
    expect(prompt).not.toContain("Verify with");
    expect(prompt).not.toContain("Start with these files");
    expect(prompt).not.toContain("Blocked by");
    expect(prompt).not.toContain("Description");
    expect(buildTaskPrompt(task("1"), { aiosRoot: null, member: "Jake" })).not.toContain(
      "Task card:",
    );
  });

  it("truncates long input and stays under the size budget", () => {
    const huge = task("9", {
      description: "x".repeat(10_000),
      verify: "v".repeat(2_000),
      startFiles: Array.from({ length: 30 }, (_, i) => `${"f".repeat(400)}${i}`),
      blockedBy: Array.from({ length: 30 }, (_, i) => `${"b".repeat(400)}${i}`),
    });
    const prompt = buildTaskPrompt(huge, { aiosRoot: "/aios", member: "Jake" });
    expect(prompt.length).toBeLessThanOrEqual(2_600);
    expect(prompt).toContain("Description truncated");
    expect(prompt).toContain("/aios/tasks/9.md");
  });
});

describe("time helpers", () => {
  it("formats relative times", () => {
    expect(relativeTime(NOW - 10_000, NOW)).toBe("just now");
    expect(relativeTime(NOW + 10_000, NOW)).toBe("just now");
    // Units are spelled out enough that minutes never read as months.
    expect(relativeTime(NOW - 5 * 60_000, NOW)).toBe("5 min ago");
    expect(relativeTime(NOW - 3 * 3_600_000, NOW)).toBe("3 h ago");
    expect(relativeTime(NOW - 2 * DAY, NOW)).toBe("2 d ago");
    expect(relativeTime(NOW - 21 * DAY, NOW)).toBe("3 wk ago");
    expect(relativeTime(new Date(2026, 5, 1, 12).getTime(), NOW)).toBe("Jun 1");
    expect(relativeTime(new Date(2025, 5, 1, 12).getTime(), NOW)).toBe("Jun 1, 2025");
  });

  it("formats due dates by local day", () => {
    expect(formatDue("2026-10-08", NOW)).toBe("Overdue 3d");
    expect(formatDue("2026-10-11", NOW)).toBe("Due today");
    expect(formatDue("2026-10-15", NOW)).toBe("Due in 4d");
    expect(formatDue(null, NOW)).toBeNull();
    expect(formatDue(undefined, NOW)).toBeNull();
    expect(formatDue("soon", NOW)).toBeNull();
    // Just after midnight is still the same local day as late evening.
    expect(formatDue("2026-10-11", new Date(2026, 9, 11, 0, 5).getTime())).toBe("Due today");
    expect(formatDue("2026-10-11", new Date(2026, 9, 11, 23, 55).getTime())).toBe("Due today");
  });
});

describe("shareableOpenCount", () => {
  it("counts open local cards in the section that are not published yet", () => {
    const tasks = [
      view("a", {}, { section: "alpha" }),
      view("b", { status: "review" }, { section: "alpha" }),
      view("c", { status: "done" }, { section: "alpha" }),
      view("d", {}, { section: "alpha", origin: "both" }),
      view("e", { shared: true }, { section: "alpha" }),
      view("f", {}, { section: "beta" }),
    ];
    expect(shareableOpenCount(tasks, "alpha")).toBe(2);
    expect(shareableOpenCount(tasks, "nope")).toBe(0);
  });
});

describe("taskFlags", () => {
  it("flags open cards with no change for 21 days and open cards with no gates", () => {
    const old = NOW - 22 * DAY;
    expect(
      taskFlags({ status: "todo", updatedAt: old, checklist: { done: 0, total: 2 } }, NOW),
    ).toEqual({ stale: true, noGates: false });
    expect(taskFlags({ status: "todo", updatedAt: NOW - 20 * DAY }, NOW)).toEqual({
      stale: false,
      noGates: true,
    });
    expect(
      taskFlags({ status: "todo", updatedAt: NOW, checklist: { done: 0, total: 0 } }, NOW).noGates,
    ).toBe(true);
    // Closed cards carry no flags.
    expect(taskFlags({ status: "done", updatedAt: old }, NOW)).toEqual({
      stale: false,
      noGates: false,
    });
  });
});

describe("splitDoneWhen", () => {
  it("moves the Done when list out of the body", () => {
    const body = "## Why\n\nSo it works.\n\n## Done when\n\n- [ ] One\n- [x] Two\n";
    expect(splitDoneWhen(body)).toEqual({
      gates: "- [ ] One\n- [x] Two",
      rest: "## Why\n\nSo it works.",
    });
  });

  it("stops at the next heading of the same or a higher level", () => {
    const body = "### Done When:\n- [ ] A\n#### Note\nkept with gates\n## Verify\nrun it";
    expect(splitDoneWhen(body)).toEqual({
      gates: "- [ ] A\n#### Note\nkept with gates",
      rest: "## Verify\nrun it",
    });
  });

  it("keeps the body when there is no Done when section", () => {
    expect(splitDoneWhen("## Why\nx")).toEqual({ gates: null, rest: "## Why\nx" });
  });
});
