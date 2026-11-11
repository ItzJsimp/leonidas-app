import { ThreadId, type SubagentRun } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  AGENT_TABS,
  costLabel,
  elapsedLabel,
  formatSpan,
  matchRuns,
  modelLine,
  parentChats,
  resultPlaceholder,
  runsSummaryLabel,
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

  it("has the three Agents tabs, with Team first", () => {
    expect(AGENT_TABS.map((tab) => tab.id)).toEqual(["team", "runs", "starters"]);
    expect(AGENT_TABS.map((tab) => tab.label)).toEqual(["Team", "Runs", "Starters"]);
  });

  it("labels a cost, and says when it is tiny or unknown", () => {
    expect(costLabel(0.03)).toBe("$0.03");
    expect(costLabel(0.001)).toBe("under $0.01");
    expect(costLabel(0)).toBe("$0.00");
    expect(costLabel(null)).toBe("Cost unknown");
  });

  it("sums the cost of today's runs and counts the live ones", () => {
    const now = Date.parse("2026-10-23T12:00:00.000Z");
    const today = (iso: string) => run({ startedAt: iso, costUsd: 0.1, status: "done" });
    const runs = [
      run({ costUsd: 0.1, startedAt: new Date(now - 60_000).toISOString() }),
      today(new Date(now - 120_000).toISOString()),
      run({ status: "done", costUsd: 5, startedAt: "2020-01-01T00:00:00.000Z" }),
      run({ status: "done", costUsd: null, startedAt: null }),
    ];
    expect(runsSummaryLabel(runs, now, 2)).toBe("1 running · $0.20 of $2.00 today");
    expect(runsSummaryLabel(runs, now, null)).toBe("1 running · $0.20 today");
    expect(runsSummaryLabel([], now, null)).toBe("0 running · $0.00 today");
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
