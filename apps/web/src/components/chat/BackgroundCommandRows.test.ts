import { describe, expect, it } from "vite-plus/test";

import { commandTasks, updateWaitCount } from "./BackgroundCommandRows";

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

describe("updateWaitCount", () => {
  const tasks = commandTasks([
    { taskId: "a", kind: "command" },
    { taskId: "c", kind: "command", service: true },
  ]);
  const base = { updateDownloaded: true, autoInstall: true, tasks, holdEnabled: true };

  it("counts task commands, not services", () => {
    expect(updateWaitCount(base)).toBe(1);
  });

  it("is 0 without a downloaded update, automatic install, or the switch", () => {
    expect(updateWaitCount({ ...base, updateDownloaded: false })).toBe(0);
    expect(updateWaitCount({ ...base, autoInstall: false })).toBe(0);
    expect(updateWaitCount({ ...base, holdEnabled: false })).toBe(0);
  });
});
