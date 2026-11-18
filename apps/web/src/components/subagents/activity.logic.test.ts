import { describe, expect, it } from "vite-plus/test";

import { doneToday, runTitle, startOfDay, upcomingTasks } from "./activity.logic";

const NOW = new Date(2026, 10, 18, 15, 0, 0).getTime();
const at = (hour: number, day = 18) => new Date(2026, 10, day, hour, 0, 0).toISOString();

describe("runTitle", () => {
  it("prefers the agent name and falls back to the summary", () => {
    expect(runTitle({ agentName: "Reviewer", summary: "Check the diff" })).toBe("Reviewer");
    expect(runTitle({ agentName: null, summary: "Check the diff" })).toBe("Check the diff");
  });
});

describe("startOfDay", () => {
  it("is local midnight", () => {
    expect(new Date(startOfDay(NOW)).getHours()).toBe(0);
    expect(new Date(startOfDay(NOW)).getDate()).toBe(18);
  });
});

describe("doneToday", () => {
  it("keeps runs that ended today, newest first, and drops older or unfinished ones", () => {
    const runs = [
      { id: "early", endedAt: at(8) },
      { id: "yesterday", endedAt: at(23, 17) },
      { id: "live", endedAt: null },
      { id: "late", endedAt: at(14) },
    ];
    expect(doneToday(runs, NOW).map((run) => run.id)).toEqual(["late", "early"]);
  });
});

describe("upcomingTasks", () => {
  it("lists only schedules that are on and have a next run, soonest first, up to the limit", () => {
    const tasks = [
      { id: "later", enabled: true, nextRunAt: at(20) },
      { id: "off", enabled: false, nextRunAt: at(16) },
      { id: "none", enabled: true, nextRunAt: null },
      { id: "soon", enabled: true, nextRunAt: at(17) },
      { id: "latest", enabled: true, nextRunAt: at(22) },
    ];
    expect(upcomingTasks(tasks, 2).map((task) => task.id)).toEqual(["soon", "later"]);
  });
});
