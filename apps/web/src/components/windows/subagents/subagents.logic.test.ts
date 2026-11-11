import { ThreadId, type SubagentRun } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  elapsedLabel,
  formatSpan,
  matchRuns,
  modelLine,
  parentChats,
  resultPlaceholder,
  subagentsTab,
  subagentsTabs,
} from "./subagents.logic";

const run = (over: Partial<SubagentRun> = {}): SubagentRun => ({
  id: "r1",
  kind: "delegated",
  parent: { id: ThreadId.make("p1"), title: "Main chat" },
  childThreadId: null,
  provider: "claude",
  account: "claude",
  model: "haiku",
  parentRunId: null,
  costUsd: null,
  status: "running",
  rawStatus: "running",
  startedAt: "2026-10-23T10:00:00.000Z",
  endedAt: null,
  durationMs: null,
  summary: "Check the tests",
  task: "Run all tests",
  result: null,
  truncated: false,
  canStop: true,
  ...over,
});

describe("subagents.logic", () => {
  it("formats spans and counts a live run from its start", () => {
    expect(formatSpan(45_000)).toBe("45 s");
    expect(formatSpan(125_000)).toBe("2 min 5 s");
    expect(formatSpan(3_780_000)).toBe("1 h 3 min");
    expect(elapsedLabel(run(), Date.parse("2026-10-23T10:02:05.000Z"))).toBe("2 min 5 s");
    expect(elapsedLabel(run({ startedAt: null }), 0)).toBe("Starting");
    expect(elapsedLabel(run({ status: "done", durationMs: 30_000 }), 0)).toBe("30 s");
  });

  it("reads the tab and shows the live count on the Running tab", () => {
    expect(subagentsTab("history")).toBe("history");
    expect(subagentsTab(undefined)).toBe("running");
    expect(subagentsTabs(3)[0]?.label).toBe("Running 3");
    expect(subagentsTabs(null)[0]?.label).toBe("Running");
  });

  it("lists each parent chat once and filters live runs by a word", () => {
    const a = run();
    const b = run({
      id: "r2",
      parent: { id: ThreadId.make("p2"), title: "Another" },
      summary: "Fix lint",
    });
    expect(parentChats([a, a, b]).map((p) => p.title)).toEqual(["Another", "Main chat"]);
    expect(matchRuns([a, b], "lint").map((r) => r.id)).toEqual(["r2"]);
    expect(matchRuns([a, b], " ").length).toBe(2);
    expect(modelLine(run({ model: null }))).toBe("claude");
    expect(modelLine(a)).toBe("haiku on claude");
  });

  it("explains a missing result by status", () => {
    expect(resultPlaceholder(run())).toContain("Still working");
    expect(resultPlaceholder(run({ status: "cancelled", rawStatus: "interrupted" }))).toContain(
      "restart",
    );
  });
});
