import { describe, expect, it } from "@effect/vitest";
import type { TaskBoardTask } from "@t3tools/contracts";

import { planSharedSync } from "./sharedSync.ts";

const task = (id: string, patch: Partial<TaskBoardTask> = {}): TaskBoardTask => ({
  id,
  project: "leonidas-code",
  title: id,
  description: "",
  status: "todo",
  priority: "medium",
  claimedBy: null,
  claimedAt: null,
  claimedAgent: null,
  completedBy: null,
  completedAt: null,
  completionSummary: null,
  createdAt: 1,
  updatedAt: 10,
  labels: [],
  source: "aios_card",
  projectSlug: "leonidas-code",
  sourceId: id,
  sourceFile: `${id}.md`,
  issueUrl: null,
  history: [],
  ...patch,
});

const plan = (local: TaskBoardTask[], board: TaskBoardTask[]) =>
  planSharedSync({ local, board, projectName: "Leonidas", actor: "Jake" });

describe("planSharedSync", () => {
  it("returns null when the board already matches", () => {
    expect(plan([task("a")], [task("a", { shared: true })])).toBeNull();
  });

  it("publishes open team cards and skips closed ones", () => {
    const result = plan([task("a"), task("b", { status: "done" })], []);
    expect(result?.published).toBe(1);
    expect(result?.tasks.map((item) => item.id)).toEqual(["a"]);
    expect(result?.tasks[0]).toMatchObject({ shared: true, sharedBy: "Jake" });
  });

  it("never publishes private text, activity, agent data or paths", () => {
    const result = plan(
      [
        task("a", {
          description: "Private notes from D:/Leonidas AIOS",
          history: [{ id: "h", taskId: "a", action: "progress", actor: "Jake", timestamp: 1 }],
          claimedAgent: { threadId: "thread-1" },
          startFiles: ["D:/Leonidas AIOS/x.md"],
          labels: ["private-ish", "lane:mob"],
        }),
      ],
      [],
    );
    const copy = result?.tasks[0];
    expect(copy).toMatchObject({
      description: "",
      history: [],
      claimedAgent: null,
      sourceFile: null,
    });
    expect(copy?.startFiles).toEqual([]);
    expect(copy).not.toHaveProperty("sourceRoot");
  });

  it("keeps a reviewed copy's text when it refreshes planning fields", () => {
    const result = plan(
      [task("a", { status: "done", description: "raw local text", updatedAt: 20 })],
      [task("a", { description: "Reviewed text", updatedAt: 15 })],
    );
    expect(result?.tasks[0]).toMatchObject({ status: "done", description: "Reviewed text" });
  });

  it("withdraws agent runs and private cards, and keeps collaborators' cards", () => {
    const result = plan(
      [task("run", { kind: "agent_run" }), task("secret", { labels: ["private"] })],
      [task("run"), task("secret"), task("mobs-card")],
    );
    expect(result?.withdrawn).toBe(2);
    expect(result?.tasks.map((item) => item.id)).toEqual(["mobs-card"]);
  });

  it("refreshes an older copy and keeps a collaborator's claim", () => {
    const result = plan(
      [task("a", { status: "done", updatedAt: 20 })],
      [task("a", { claimedBy: "Mob", claimedAt: 15, assignee: "Mob", updatedAt: 15 })],
    );
    expect(result?.refreshed).toBe(1);
    expect(result?.tasks[0]).toMatchObject({ status: "done", claimedBy: "Mob", assignee: "Mob" });
  });

  it("never overwrites a copy that is newer than the card", () => {
    expect(
      plan([task("a", { updatedAt: 10 })], [task("a", { status: "review", updatedAt: 30 })]),
    ).toBeNull();
  });
});
