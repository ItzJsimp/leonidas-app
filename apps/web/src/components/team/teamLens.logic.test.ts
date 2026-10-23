import type { TaskBoardTask, TaskBoardTeamMember, WorkspaceOrg } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  agentWork,
  lensCounts,
  lensHome,
  lensLabel,
  lensTasks,
  topLensTask,
  type LensTask,
} from "./teamLens.logic";

type Member = WorkspaceOrg["members"][number];

const member = (slug: string, department: string, roles: Record<string, string>, extra = {}) =>
  ({
    slug,
    name: slug.toUpperCase(),
    kind: "person",
    status: "active",
    department,
    github: "",
    owner: "",
    roles,
    ...extra,
  }) as Member;

const org = {
  name: "Acme",
  departments: [
    { slug: "sales", name: "Sales", areas: ["deals"], leads: ["pia"] },
    { slug: "general", name: "General", areas: ["home"], leads: [] },
  ],
  areas: [
    {
      slug: "home",
      name: "Home",
      repo: "",
      department: "general",
      sensitivity: "shared",
      status: "active",
    },
    {
      slug: "deals",
      name: "Deals",
      repo: "",
      department: "sales",
      sensitivity: "private",
      status: "active",
    },
  ],
  members: [
    member("pia", "sales", { deals: "Admin", home: "Member" }),
    member("bot", "sales", { deals: "Member" }, { kind: "agent", owner: "pia" }),
    member("sam", "general", { home: "Viewer" }),
  ],
} as unknown as WorkspaceOrg;

const team: TaskBoardTeamMember[] = org.members.map((m) => ({
  name: m.name,
  aliases: [m.slug],
  slug: m.slug,
  kind: m.kind,
}));

const task = (id: string, extra: Partial<LensTask> = {}): LensTask => ({
  id,
  title: `Task ${id}`,
  status: "todo",
  priority: "medium",
  assignee: null,
  claimedBy: null,
  claimedAgent: null,
  kind: "task",
  updatedAt: 1,
  ...extra,
});

const tasks = [
  task("a", { assignee: "pia", priority: "high" }),
  task("b", { assignee: "bot", status: "in_progress", claimedAgent: { threadId: "t1" } }),
  task("c", { assignee: "sam", status: "blocked" }),
  task("d"),
  task("e", { assignee: "pia", status: "done" }),
  task("f", { assignee: "bot", kind: "agent_run", status: "in_progress" }),
];

const ids = (list: ReadonlyArray<LensTask>) => list.map((t) => t.id).sort();

describe("lensTasks", () => {
  it("keeps open tasks of the Member and of the agent the Member owns", () => {
    expect(ids(lensTasks(org, { kind: "member", slug: "pia" }, tasks, team))).toEqual(["a", "b"]);
  });

  it("keeps only the agent's own task for the agent lens", () => {
    expect(ids(lensTasks(org, { kind: "member", slug: "bot" }, tasks, team))).toEqual(["b"]);
  });

  it("keeps tasks of every Member with a Role in the Area", () => {
    expect(ids(lensTasks(org, { kind: "area", slug: "deals" }, tasks, team))).toEqual(["a", "b"]);
    expect(ids(lensTasks(org, { kind: "area", slug: "home" }, tasks, team))).toEqual(["a", "c"]);
  });

  it("keeps tasks of every Member in the Department", () => {
    expect(ids(lensTasks(org, { kind: "department", slug: "general" }, tasks, team))).toEqual([
      "a",
      "c",
    ]);
  });

  it("never keeps an unowned task, a done task or an agent run record", () => {
    for (const slug of ["pia", "bot", "sam"]) {
      const list = lensTasks(org, { kind: "member", slug }, tasks, team);
      expect(ids(list)).not.toContain("d");
      expect(ids(list)).not.toContain("e");
      expect(ids(list)).not.toContain("f");
    }
  });
});

describe("lensCounts and topLensTask", () => {
  it("counts by status", () => {
    expect(lensCounts(tasks.filter((t) => ["a", "b", "c"].includes(t.id)))).toEqual({
      todo: 1,
      inProgress: 1,
      review: 0,
      blocked: 1,
    });
  });

  it("picks the highest priority task, then the newest", () => {
    const list = [
      task("x", { priority: "medium", updatedAt: 9 }),
      task("y", { priority: "critical", updatedAt: 1 }),
      task("z", { priority: "critical", updatedAt: 5 }),
    ];
    expect(topLensTask(list)?.id).toBe("z");
    expect(topLensTask([])).toBeNull();
  });
});

describe("lensHome", () => {
  it("counts only the lens tasks and focuses the top one", () => {
    const list = tasks.filter((t) => ["a", "b", "c"].includes(t.id));
    const home = lensHome("PIA", list);
    expect(home.counts).toEqual({ todo: 1, inProgress: 1, review: 0, blocked: 1 });
    expect(home.move).toEqual({ title: "Task a", reason: "Top high task for PIA." });
  });

  it("says so when the lens has no open task", () => {
    const home = lensHome("SAM", []);
    expect(home.counts).toEqual({ todo: 0, inProgress: 0, review: 0, blocked: 0 });
    expect(home.move.title).toBe("No open tasks for SAM");
  });
});

describe("agentWork", () => {
  const bot = org.members[1]!;

  it("is working when the agent holds a task in progress, and returns that task", () => {
    const work = agentWork(bot, tasks, team);
    expect(work.state).toBe("working");
    expect(work.task?.id).toBe("b");
  });

  it("is waiting when its only open task is blocked", () => {
    const work = agentWork(bot, [task("q", { assignee: "bot", status: "blocked" })], team);
    expect(work.state).toBe("waiting");
  });

  it("is idle with no open task", () => {
    expect(agentWork(bot, [task("q", { assignee: "sam" })], team)).toEqual({
      state: "idle",
      task: null,
    });
  });

  it("prefers a task that links a chat when two are in progress", () => {
    const work = agentWork(
      bot,
      [
        task("m", { assignee: "bot", status: "in_progress" }),
        task("n", { assignee: "bot", status: "review", claimedAgent: { threadId: "t9" } }),
      ],
      team,
    );
    expect(work.task?.id).toBe("n");
  });
});

describe("lensLabel", () => {
  it("names the Member, Area or Department", () => {
    expect(lensLabel(org, { kind: "member", slug: "pia" })).toBe("PIA");
    expect(lensLabel(org, { kind: "area", slug: "deals" })).toBe("Deals");
    expect(lensLabel(org, { kind: "department", slug: "sales" })).toBe("Sales");
    expect(lensLabel(org, { kind: "area", slug: "gone" })).toBe("gone");
  });
});

// Keeps the helper type honest against the real task shape.
const _shape: Pick<TaskBoardTask, keyof LensTask> = {} as LensTask;
void _shape;
