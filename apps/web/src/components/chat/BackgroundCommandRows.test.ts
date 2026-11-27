import { describe, expect, it } from "vitest";

import { commandTasks } from "./BackgroundCommandRows";

describe("commandTasks", () => {
  it("keeps only command tasks", () => {
    const tasks = [
      { taskId: "a", kind: "command" },
      { taskId: "b", kind: "subagent" },
      { taskId: "c", kind: "command", service: true },
    ] as const;
    expect(commandTasks(tasks).map((task) => task.taskId)).toEqual(["a", "c"]);
  });
});
