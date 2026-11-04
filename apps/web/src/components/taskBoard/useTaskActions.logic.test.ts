import type { ProjectId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  claimPatch,
  failureText,
  linkPatch,
  pickLaunchProject,
  planSend,
  queueFor,
  unlinkPatch,
} from "./useTaskActions.logic";

const project = (id: string, workspaceRoot: string) => ({ id: id as ProjectId, workspaceRoot });

describe("pickLaunchProject", () => {
  const projects = [
    project("a", "C:/Work/a"),
    project("b", "D:\\Leonidas AIOS\\"),
    project("c", "/x"),
  ];

  it("prefers the task's project, then the selected one", () => {
    const base = { projects, aiosRoot: "D:/Leonidas AIOS" };
    expect(
      pickLaunchProject({
        ...base,
        taskProjectId: "c" as ProjectId,
        selectedProjectId: "a" as ProjectId,
      })?.id,
    ).toBe("c");
    expect(
      pickLaunchProject({ ...base, taskProjectId: null, selectedProjectId: "a" as ProjectId })?.id,
    ).toBe("a");
  });

  it("skips projects this environment does not have", () => {
    expect(
      pickLaunchProject({
        projects,
        taskProjectId: "missing" as ProjectId,
        selectedProjectId: "a" as ProjectId,
        aiosRoot: null,
      })?.id,
    ).toBe("a");
  });

  it("falls back to the AIOS root project, then the first project", () => {
    const none = { taskProjectId: null, selectedProjectId: null };
    expect(pickLaunchProject({ ...none, projects, aiosRoot: "d:/leonidas aios" })?.id).toBe("b");
    expect(pickLaunchProject({ ...none, projects, aiosRoot: "E:/elsewhere" })?.id).toBe("a");
    expect(pickLaunchProject({ ...none, projects: [], aiosRoot: null })).toBeNull();
  });
});

describe("claimPatch", () => {
  it("starts work unless the task is already in progress or review", () => {
    expect(claimPatch({ status: "todo" }, "Jake")).toEqual({
      claimedBy: "Jake",
      status: "in_progress",
    });
    expect(claimPatch({ status: "review" }, "Jake")).toEqual({ claimedBy: "Jake" });
    expect(claimPatch({ status: "in_progress" }, "Jake")).toEqual({ claimedBy: "Jake" });
  });
});

describe("failureText", () => {
  it("uses the error message or the fallback", () => {
    expect(failureText(new Error("Nope"), "Failed")).toBe("Nope");
    expect(failureText({ message: "  " }, "Failed")).toBe("Failed");
    expect(failureText(null, "Failed")).toBe("Failed");
  });
});

describe("planSend", () => {
  const linked = { claimedAgent: { threadId: "thread-1" } };

  it("opens the linked thread instead of launching another", () => {
    expect(planSend(linked, () => true)).toEqual({ kind: "open", threadId: "thread-1" });
  });

  it("relaunches into the same thread when the link has no thread", () => {
    expect(planSend(linked, () => false)).toEqual({ kind: "launch", threadId: "thread-1" });
    expect(planSend({ claimedAgent: null }, () => false)).toEqual({
      kind: "launch",
      threadId: null,
    });
  });
});

describe("linkPatch and unlinkPatch", () => {
  it("claims and links before the launch, and restores status after a failed launch", () => {
    const task = { status: "todo" as const, claimedBy: null };
    const link = linkPatch(task, {
      member: "Mob",
      threadId: "t1",
      providerInstanceId: "claude",
      model: "m",
    });
    expect(link).toMatchObject({
      claimedBy: "Mob",
      status: "in_progress",
      agent: { threadId: "t1" },
    });
    expect(unlinkPatch(task, "Mob", "boom")).toEqual({
      claimedBy: null,
      status: "todo",
      note: "The AI did not start: boom",
    });
  });

  it("keeps an existing claim by the same member", () => {
    const patch = unlinkPatch({ status: "in_progress", claimedBy: "Mob" }, "Mob", "boom");
    expect(patch).not.toHaveProperty("claimedBy");
  });
});

describe("queueFor", () => {
  it("runs work for one key in order and work for other keys at once", async () => {
    const queues = new Map<string, Promise<unknown>>();
    const log: string[] = [];
    let release = () => {};
    const first = queueFor(queues, "a", async () => {
      log.push("a1 start");
      await new Promise<void>((resolve) => (release = resolve));
      log.push("a1 end");
      return 1;
    });
    const second = queueFor(queues, "a", async () => (log.push("a2"), 2));
    const other = queueFor(queues, "b", async () => (log.push("b"), 3));
    await other;
    expect(log).toEqual(["a1 start", "b"]);
    release();
    expect(await Promise.all([first, second])).toEqual([1, 2]);
    expect(log).toEqual(["a1 start", "b", "a1 end", "a2"]);
    await Promise.resolve();
    expect(queues.size).toBe(0);
  });

  it("still runs the next work when the one before it fails", async () => {
    const queues = new Map<string, Promise<unknown>>();
    const failed = queueFor(queues, "a", async () => {
      throw new Error("save failed");
    });
    const next = queueFor(queues, "a", async () => "ran");
    await expect(failed).rejects.toThrow("save failed");
    expect(await next).toBe("ran");
  });
});
