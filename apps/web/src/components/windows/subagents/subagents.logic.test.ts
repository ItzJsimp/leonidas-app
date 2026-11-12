import { DEFAULT_SUBAGENT_DAILY_CAP_USD, ThreadId, type SubagentRun } from "@t3tools/contracts";
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
  runsStats,
  spendPercent,
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

  it("counts the live runs and what started today", () => {
    const now = Date.parse("2026-10-23T12:00:00.000Z");
    const at = (ms: number) => new Date(now - ms).toISOString();
    const runs = [
      run({ costUsd: 0.1, startedAt: at(60_000) }),
      run({ status: "done", costUsd: 0.1, startedAt: at(120_000) }),
      run({ status: "failed", costUsd: 0.05, startedAt: at(180_000) }),
      run({ status: "waiting", costUsd: null, startedAt: at(240_000) }),
      run({ status: "done", costUsd: 5, startedAt: "2020-01-01T00:00:00.000Z" }),
      run({ status: "done", costUsd: null, startedAt: null }),
    ];
    expect(runsStats(runs, now, 2)).toEqual({
      running: 1,
      waiting: 1,
      runsToday: 4,
      doneToday: 1,
      failedToday: 1,
      spendTodayUsd: 0.25,
      capUsd: 2,
    });
    expect(runsStats([], now, null)).toMatchObject({ running: 0, runsToday: 0, spendTodayUsd: 0 });
  });

  it("shows how much of the cap is spent, and never over 100", () => {
    expect(spendPercent({ spendTodayUsd: 0.3, capUsd: 2 })).toBe(15);
    expect(spendPercent({ spendTodayUsd: 3, capUsd: 2 })).toBe(100);
    expect(spendPercent({ spendTodayUsd: 1, capUsd: null })).toBe(0);
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

describe("daily cap (decision 4)", () => {
  it("decision 4: the default cap is $2 a day and the Runs tiles show spend against it", () => {
    expect(DEFAULT_SUBAGENT_DAILY_CAP_USD).toBe(2);
    const now = Date.parse("2026-10-23T12:00:00.000Z");
    const spent = run({
      status: "done",
      costUsd: 1.6,
      startedAt: new Date(now - 60_000).toISOString(),
    });
    const stats = runsStats([spent], now, DEFAULT_SUBAGENT_DAILY_CAP_USD);
    expect(stats.spendTodayUsd).toBeCloseTo(1.6);
    expect(spendPercent(stats)).toBe(80);
  });
});
