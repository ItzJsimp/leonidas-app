import type { TaskBoardTask } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { lastNote, pickLinkedCard } from "./linkedTask.logic";

const card = (overrides: Partial<TaskBoardTask> & { id: string }): TaskBoardTask =>
  ({
    status: "in_progress",
    updatedAt: 1_000,
    threadIds: [],
    claimedAgent: null,
    history: [],
    ...overrides,
  }) as unknown as TaskBoardTask;

describe("pickLinkedCard", () => {
  it("picks the newest open card that links the chat", () => {
    const tasks = [
      card({ id: "old", threadIds: ["t1"], updatedAt: 1_000 }),
      card({ id: "new", threadIds: ["t1"], updatedAt: 5_000, status: "review" }),
      card({ id: "done", threadIds: ["t1"], updatedAt: 9_000, status: "done" }),
      card({ id: "other", threadIds: ["t2"], updatedAt: 9_000 }),
    ];
    expect(pickLinkedCard(tasks, "t1")?.id).toBe("new");
  });

  it("prefers a real card to the card made from the request", () => {
    const tasks = [
      card({ id: "request", threadIds: ["t1"], updatedAt: 9_000, kind: "agent_run" }),
      card({ id: "real", threadIds: ["t1"], updatedAt: 1_000, status: "done" }),
    ];
    expect(pickLinkedCard(tasks, "t1")?.id).toBe("real");
    expect(pickLinkedCard([tasks[0]!], "t1")?.id).toBe("request");
  });

  it("falls back to the newest closed card, reads the old claim field, and finds nothing for a new chat", () => {
    const tasks = [
      card({ id: "done", threadIds: ["t1"], status: "done", updatedAt: 2_000 }),
      card({ id: "claimed", claimedAgent: { threadId: "t3" } as TaskBoardTask["claimedAgent"] }),
    ];
    expect(pickLinkedCard(tasks, "t1")?.id).toBe("done");
    expect(pickLinkedCard(tasks, "t3")?.id).toBe("claimed");
    expect(pickLinkedCard(tasks, "t9")).toBeNull();
  });
});

describe("lastNote", () => {
  it("returns the newest activity note, or null", () => {
    const history = [
      { note: "started" },
      { note: "14 tests pass, typecheck clean" },
      { note: null },
    ] as unknown as TaskBoardTask["history"];
    expect(lastNote(card({ id: "a", history }))).toBe("14 tests pass, typecheck clean");
    expect(lastNote(card({ id: "b" }))).toBeNull();
    const swept = [
      {
        note: "status → Awaiting Review - Run completed. Moved to review. [run run:thread:t1:ordinal:1]",
      },
    ] as unknown as TaskBoardTask["history"];
    expect(lastNote(card({ id: "c", history: swept }))).toBe("Run completed. Moved to review.");
    const statusOnly = [
      { note: "status → Awaiting Review" },
    ] as unknown as TaskBoardTask["history"];
    expect(lastNote(card({ id: "d", history: statusOnly }))).toBeNull();
  });
});
