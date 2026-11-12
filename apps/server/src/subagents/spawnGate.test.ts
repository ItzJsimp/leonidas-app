import { describe, expect, it } from "@effect/vitest";

import { decideSpawn, type SpawnGateInput } from "./spawnGate.ts";

const base: SpawnGateInput = {
  model: "claude-haiku-5-5",
  appFreeModels: ["claude-haiku-5-5"],
  aios: null,
  callerDepth: 0,
  callerCanSpawn: false,
  runningChildren: 0,
  todaySpendUsd: 0,
  dailyCapUsd: 2,
};

describe("spawn gate", () => {
  it("decision 2: a free model starts with no card, a frontier model shows the card", () => {
    expect(decideSpawn(base)).toEqual({ kind: "start", capWarning: false });
    expect(decideSpawn({ ...base, model: "claude-opus-5-5" })).toEqual({
      kind: "card",
      capWarning: false,
    });
    expect(decideSpawn({ ...base, forceConfirm: true }).kind).toBe("card");
  });

  it("decision 2: only a top-level chat or an orchestrator may spawn, depth stays 1", () => {
    expect(decideSpawn({ ...base, callerDepth: 1, callerCanSpawn: true }).kind).toBe("start");
    expect(decideSpawn({ ...base, callerDepth: 1 }).kind).toBe("reject");
    expect(decideSpawn({ ...base, callerDepth: 2, callerCanSpawn: true }).kind).toBe("reject");
  });

  it("decision 2: at most 3 children of one parent run at once", () => {
    expect(decideSpawn({ ...base, runningChildren: 2 }).kind).toBe("start");
    expect(decideSpawn({ ...base, runningChildren: 3 })).toMatchObject({
      kind: "reject",
      reason: expect.stringContaining("3 subagents"),
    });
  });

  it("decision 4: warns at 80 percent of the daily cap and rejects at the cap, free tier too", () => {
    expect(decideSpawn({ ...base, todaySpendUsd: 1.59 })).toEqual({
      kind: "start",
      capWarning: false,
    });
    expect(decideSpawn({ ...base, todaySpendUsd: 1.6 })).toEqual({
      kind: "start",
      capWarning: true,
    });
    expect(decideSpawn({ ...base, todaySpendUsd: 2 })).toMatchObject({ kind: "reject" });
  });
});
