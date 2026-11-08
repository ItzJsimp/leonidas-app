import { describe, expect, it } from "@effect/vitest";
import * as DateTime from "effect/DateTime";

import { compareTurns, turnPerf, type TurnPerfProjection } from "./turnPerfReport.ts";

const at = (seconds: number) => DateTime.makeUnsafe(Date.UTC(2026, 10, 8, 12, 0, seconds));
const run = (ordinal: number, start: number, end: number | null, status = "completed") => ({
  id: `run-${ordinal}`,
  ordinal,
  status,
  modelSelection: { model: "m" },
  requestedAt: at(start - 1),
  startedAt: at(start),
  completedAt: end === null ? null : at(end),
});
const tool = (runId: string, start: number, end: number) => ({
  runId,
  kind: "tool_call",
  startedAt: at(start),
  completedAt: at(end),
});
const projection = {
  runs: [run(1, 0, 10), run(2, 100, 108), run(3, 200, null, "running")],
  attempts: [
    { runId: "run-1", providerTurnId: "t1" },
    { runId: "run-2", providerTurnId: "t2" },
  ],
  nodes: [tool("run-1", 1, 4), tool("run-1", 5, 7), tool("run-2", 101, 103)],
  providerTurns: [
    { id: "t1", turnTokenUsage: { inputTokens: 1000, outputTokens: 200 } },
    { id: "t2", tokenUsage: { usedTokens: 5, inputTokens: 700, outputTokens: 150 } },
  ],
} as unknown as TurnPerfProjection;

describe("turnPerf", () => {
  it("reports turn time, tool time and tokens for each run, newest first", () => {
    const runs = turnPerf(projection, 5);
    expect(runs.map((entry) => entry.ordinal)).toEqual([3, 2, 1]);
    expect(runs[2]).toMatchObject({
      totalMs: 10_000,
      waitMs: 1_000,
      toolMs: 5_000,
      toolCalls: 2,
      inputTokens: 1000,
      outputTokens: 200,
    });
    expect(runs[0]).toMatchObject({ totalMs: null, inputTokens: null });
  });

  it("limits the number of runs", () => {
    expect(turnPerf(projection, 1)).toHaveLength(1);
  });
});

describe("compareTurns", () => {
  it("returns the later finished run minus the earlier one", () => {
    expect(compareTurns(turnPerf(projection, 5))).toEqual({
      fromOrdinal: 1,
      toOrdinal: 2,
      totalMs: -2_000,
      toolMs: -3_000,
      inputTokens: -300,
      outputTokens: -50,
    });
  });

  it("returns null with fewer than two finished runs", () => {
    expect(compareTurns(turnPerf(projection, 5).slice(0, 2))).toBeNull();
  });
});
