import { describe, expect, it } from "@effect/vitest";

import { estimateSpawnCostUsd, formatRoughCost } from "./spawnCost.ts";

describe("spawn cost", () => {
  it("decision 4: start tokens times the input price, shown as about $X", () => {
    const usd = estimateSpawnCostUsd({
      startTokens: 10_000,
      rate: { inputCostPerToken: 0.000003 },
    });
    expect(usd).toBeCloseTo(0.03);
    expect(formatRoughCost(usd)).toBe("about $0.03");
  });

  it("decision 4: an unknown model and a tiny cost never show $0.00", () => {
    expect(estimateSpawnCostUsd({ startTokens: 10_000, rate: null })).toBeNull();
    expect(formatRoughCost(null)).toBe("cost unknown");
    expect(formatRoughCost(0.001)).toBe("under $0.01");
  });
});
