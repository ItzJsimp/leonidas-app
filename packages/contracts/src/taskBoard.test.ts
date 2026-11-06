import * as Schema from "effect/Schema";
import { describe, expect, it } from "vite-plus/test";
import {
  TaskBoardCardCreateInput,
  TaskBoardCardUpdateInput,
  TaskBoardDueDate,
  TaskBoardMilestoneVersion,
  TaskBoardRoadmap,
} from "./taskBoard.ts";
import {
  OrchestratorMcpBoardTaskCreateInput,
  OrchestratorMcpBoardTaskUpdateInput,
} from "./orchestratorMcp.ts";

const decodeDue = Schema.decodeSync(TaskBoardDueDate);
const decodeCreate = Schema.decodeSync(TaskBoardCardCreateInput);
const decodeUpdate = Schema.decodeSync(TaskBoardCardUpdateInput);
const decodeAgentCreate = Schema.decodeSync(OrchestratorMcpBoardTaskCreateInput);
const decodeAgentUpdate = Schema.decodeSync(OrchestratorMcpBoardTaskUpdateInput);
const decodeMilestone = Schema.decodeSync(TaskBoardMilestoneVersion);
const decodeRoadmap = Schema.decodeSync(TaskBoardRoadmap);

describe("task due dates", () => {
  it.each(["2026-10-12", "2028-02-29", "2000-02-29"])("accepts %s", (due) => {
    expect(decodeDue(due)).toBe(due);
  });
  it.each([
    "2026-02-29",
    "2100-02-29",
    "2026-02-30",
    "2026-13-01",
    "2026-00-01",
    "2026-10-00",
    "tomorrow",
    "2026-10-12T00:00:00Z",
    "",
  ])("rejects %s", (due) => {
    expect(() => decodeDue(due)).toThrow();
  });
  it("preserves optional and cleared dates across user and agent inputs", () => {
    expect(decodeCreate({ title: "Plan", actor: "Jake", due: "2026-10-12" }).due).toBe(
      "2026-10-12",
    );
    expect(decodeUpdate({ taskId: "task-plan", actor: "Jake", due: null }).due).toBeNull();
    expect(decodeAgentCreate({ title: "Plan", due: "2026-10-12" }).due).toBe("2026-10-12");
    expect(decodeAgentUpdate({ taskId: "task-plan", due: null }).due).toBeNull();
    expect(decodeCreate({ title: "Plan", actor: "Jake" }).due).toBeUndefined();
  });
});

describe("task milestone versions", () => {
  it.each(["0.22.0", "1.0.0", "12.34.56"])("accepts %s", (version) => {
    expect(decodeMilestone(version)).toBe(version);
  });
  it.each(["1.0", "v1.0.0", "1.0.0-beta.1", "01.0.0", "1.0.0+build", "1.0.0 "])(
    "rejects %s",
    (version) => expect(() => decodeMilestone(version)).toThrow(),
  );
  it("accepts roadmap milestones and nullable task milestone inputs", () => {
    expect(
      decodeRoadmap({
        projectSlug: "leonidas-code",
        name: "Leonidas",
        currentVersion: "0.22.0",
        targetVersion: "1.0.0",
        releaseDefinition: "Public launch",
        milestones: [
          { version: "0.23.0", title: "Roadmap", goal: "Define the next work", tasks: [] },
        ],
      }).milestones[0]?.version,
    ).toBe("0.23.0");
    expect(decodeCreate({ title: "Plan", actor: "Jake", milestone: "0.22.0" }).milestone).toBe(
      "0.22.0",
    );
    expect(
      decodeUpdate({ taskId: "task-plan", actor: "Jake", milestone: null }).milestone,
    ).toBeNull();
    expect(decodeAgentCreate({ title: "Plan", milestone: "0.22.0" }).milestone).toBe("0.22.0");
    expect(decodeAgentUpdate({ taskId: "task-plan", milestone: null }).milestone).toBeNull();
  });
});
