import {
  NodeId,
  PlanId,
  RunId,
  ThreadId,
  TurnItemId,
  MessageId,
  type OrchestrationV2PlanArtifact,
  type OrchestrationV2TurnItem,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import { describe, expect, it } from "vite-plus/test";
import { deriveAgentActivity } from "./agentActivity";

const now = DateTime.makeUnsafe("2026-01-01T00:00:00Z");
const later = DateTime.makeUnsafe("2026-01-01T00:01:00Z");
const base = {
  id: TurnItemId.make("item"),
  threadId: ThreadId.make("thread"),
  runId: RunId.make("run"),
  nodeId: NodeId.make("root"),
  providerThreadId: null,
  providerTurnId: null,
  nativeItemRef: null,
  parentItemId: null,
  ordinal: 1,
  status: "running" as const,
  title: null,
  startedAt: now,
  completedAt: null,
  updatedAt: now,
};
function plan(count: number): Extract<OrchestrationV2PlanArtifact, { kind: "todo_list" }> {
  return {
    id: PlanId.make("plan"),
    threadId: base.threadId,
    runId: base.runId,
    nodeId: base.nodeId,
    kind: "todo_list",
    status: "active",
    explanation: "Published plan explanation",
    steps: Array.from({ length: count }, (_, i) => ({
      id: String(i),
      text: `New step ${i}`,
      status: i === 0 ? "running" : "pending",
    })),
  };
}
const derive = (items: OrchestrationV2TurnItem[], nextPlan = plan(6)) =>
  deriveAgentActivity({
    runId: base.runId,
    items,
    plan: nextPlan,
  });

describe("agent activity", () => {
  it("replaces six steps with five in one projection without retaining completed steps", () => {
    const oldPlan = {
      ...plan(6),
      steps: plan(6).steps.map((step, index) =>
        index === 0 ? { ...step, status: "completed" as const } : step,
      ),
    };
    expect(derive([], oldPlan).completedSteps).toBe(1);
    const next = derive([], plan(5));
    expect(next.totalSteps).toBe(5);
    expect(next.completedSteps).toBe(0);
    expect(next.steps).toEqual(
      plan(5).steps.map((step) => ({
        step: step.text,
        status: step.status === "running" ? "inProgress" : step.status,
      })),
    );
  });
  it("hides the obsolete plan during steering, then accepts the replacement", () => {
    const todo: OrchestrationV2TurnItem = {
      ...base,
      type: "todo_list",
      planId: PlanId.make("plan"),
      steps: plan(6).steps,
    };
    const steer: OrchestrationV2TurnItem = {
      ...base,
      id: TurnItemId.make("steer"),
      ordinal: 2,
      updatedAt: later,
      type: "user_message",
      messageId: MessageId.make("steer"),
      text: "Change direction",
      inputIntent: "steer",
      attachments: [],
      createdBy: "user",
      creationSource: "web",
    };
    expect(derive([todo, steer]).steps).toEqual([]);
    expect(derive([todo, steer]).step).toBe("Updating plan");
    const replacement = {
      ...todo,
      steps: plan(5).steps,
      updatedAt: DateTime.makeUnsafe("2026-01-01T00:02:00Z"),
    };
    expect(derive([replacement, steer], plan(5)).totalSteps).toBe(5);
  });
  it("reads tools from every node of the run, not only the root, and skips other runs", () => {
    const activity = derive([
      {
        ...base,
        type: "reasoning",
        text: "**Checking the app**\n\nlooking at src",
        streaming: false,
      },
      {
        ...base,
        nodeId: NodeId.make("provider-tool"),
        type: "dynamic_tool",
        toolName: "Read",
        input: { file_path: "src/app.ts", justification: "Check the current implementation" },
      },
      { ...base, runId: RunId.make("old"), type: "file_change", fileName: "old.txt" },
    ]);
    expect(activity.files).toEqual(["src/app.ts"]);
    expect(activity.notes).toEqual(["Read: Check the current implementation"]);
    expect(activity.thought).toBe("Checking the app");
    expect(activity.project.map((file) => file.name)).toEqual(["app.ts"]);
  });
  it("names the subagent a running delegate call starts", () => {
    const activity = derive([
      {
        ...base,
        id: TurnItemId.make("delegate"),
        type: "dynamic_tool",
        toolName: "mcp__leonidas__leo_delegate_task",
        input: { subagent: "explorer", task: "find the config" },
      } as OrchestrationV2TurnItem,
    ]);
    expect(activity.now).toMatchObject({ kind: "agent", target: "@explorer", running: true });
  });
  it("orders touched files by most recent use so a re-read file becomes the newest", () => {
    const read = (id: string, path: string) =>
      ({
        ...base,
        id: TurnItemId.make(id),
        status: "completed",
        type: "dynamic_tool",
        toolName: "Read",
        input: { file_path: path },
      }) as OrchestrationV2TurnItem;
    const activity = derive([read("a", "src/a.ts"), read("b", "src/b.ts"), read("c", "src/a.ts")]);
    expect(activity.files).toEqual(["src/b.ts", "src/a.ts"]);
  });
  it("names the start phase before the agent sends anything", () => {
    const phased = (startPhase: "checkpoint" | "preparing" | "starting") =>
      deriveAgentActivity({ runId: base.runId, items: [], plan: null, startPhase }).now.text;
    expect(phased("checkpoint")).toBe("Saving a save point for the last reply");
    expect(phased("preparing")).toBe("Getting the project ready");
    expect(phased("starting")).toBe("Starting the AI");
    expect(deriveAgentActivity({ runId: base.runId, items: [], plan: null }).now.text).toBe(
      "Getting started",
    );
  });
  it("does not report workspace preparation as the current tool", () => {
    const activity = derive([
      {
        ...base,
        status: "completed",
        type: "command_execution",
        title: "Workspace ready",
        input: "Preparing workspace",
      },
    ]);
    expect(activity.events).toEqual([]);
    expect(activity.now.text).toBe("Getting started");
  });
  it("names what is running now and tracks skills and AIOS files", () => {
    const tool = (
      id: string,
      toolName: string,
      input: unknown,
      status: "completed" | "running" = "completed",
    ) =>
      ({
        ...base,
        id: TurnItemId.make(id),
        status,
        type: "dynamic_tool",
        toolName,
        input,
      }) as OrchestrationV2TurnItem;
    const activity = derive([
      tool("a", "Read", { file_path: "D:/Leonidas AIOS/memory/core.md" }),
      tool("b", "Read", { file_path: "D:/Leonidas AIOS/.agents/skills/design-build/SKILL.md" }),
      tool("c", "Skill", { skill: "impeccable" }),
      tool("d", "mem0.search", { query: "taste" }),
      tool("e", "Edit", { file_path: "D:/Leonidas AIOS/tasks/x.md" }),
      tool("f", "Grep", { pattern: "usage limits" }, "running"),
    ]);
    expect(activity.now).toMatchObject({
      text: "Searching usage limits",
      label: "Searching",
      target: "usage limits",
      kind: "search",
      running: true,
      itemId: "f",
      since: "2026-01-01T00:00:00.000Z",
    });
    expect(activity.skills.map((skill) => skill.name)).toEqual(["design-build", "impeccable"]);
    expect(activity.aios.map((file) => [file.folder, file.access])).toEqual([
      ["memory", "read"],
      ["tasks", "write"],
    ]);
    expect(activity.tools.map((entry) => entry.name)).toEqual(["Memory"]);
  });
  it("shows remaining steps and finishing without inventing an ETA", () => {
    const last = plan(1);
    const activity = derive([], last);
    expect(activity.remaining).toBe(1);
    expect(activity.finishing).toBe(true);
    expect(activity.currentStep).toBe(1);
  });
  it("shows the newest running command, cleaned, with the raw command and a count of the rest", () => {
    const shell: OrchestrationV2TurnItem = {
      ...base,
      id: TurnItemId.make("shell"),
      type: "command_execution",
      input: String.raw`pwsh -NoProfile -Command "rtk proxy .\node_modules\.bin\vp.cmd test run a.test.ts"`,
    } as OrchestrationV2TurnItem;
    const app: OrchestrationV2TurnItem = {
      ...base,
      id: TurnItemId.make("app"),
      type: "dynamic_tool",
      toolName: "Grep",
      input: { pattern: "cache" },
    } as OrchestrationV2TurnItem;
    expect(derive([app, shell]).now).toMatchObject({
      label: "Running",
      target: "vp test run a.test.ts",
      itemId: "shell",
      full: shell.type === "command_execution" ? shell.input : null,
      alsoRunning: 1,
    });
  });

  it("names the thought while the agent thinks, and a failed last action once nothing runs", () => {
    const thinking: OrchestrationV2TurnItem = {
      ...base,
      id: TurnItemId.make("think"),
      ordinal: 2,
      type: "reasoning",
      text: "**Planning the fix**",
      streaming: true,
    } as OrchestrationV2TurnItem;
    const failed: OrchestrationV2TurnItem = {
      ...base,
      id: TurnItemId.make("shell"),
      status: "failed",
      type: "command_execution",
      input: "npm test",
    } as OrchestrationV2TurnItem;
    expect(derive([failed, thinking]).now).toMatchObject({
      kind: "think",
      label: "Thinking",
      target: "Planning the fix",
      running: true,
    });
    expect(derive([failed]).now).toMatchObject({
      label: "Ran",
      target: "npm test",
      failed: true,
      running: false,
    });
  });
});
