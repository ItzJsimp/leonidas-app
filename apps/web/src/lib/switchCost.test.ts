import type { CacheImpact } from "@t3tools/client-runtime/cache-awareness";
import { describe, expect, it } from "vite-plus/test";

import { estimateSwitchCost, withSwitchCost } from "./switchCost";

const modelImpact: CacheImpact = {
  category: "model",
  confirmed: true,
  message: "A new model cannot use this cache. The next message may cost more.",
};

describe("estimateSwitchCost", () => {
  it("prices the whole context at the new model's input price", () => {
    expect(estimateSwitchCost(84_000, 4)).toEqual({ tokens: 84_000, usd: 0.336 });
  });

  it("gives nothing when the size or the price is unknown", () => {
    expect(estimateSwitchCost(null, 4)).toBeNull();
    expect(estimateSwitchCost(84_000, null)).toBeNull();
    expect(estimateSwitchCost(84_000, 0)).toBeNull();
    expect(estimateSwitchCost(Number.NaN, 4)).toBeNull();
  });

  it("gives nothing for a small context", () => {
    expect(estimateSwitchCost(4_999, 4)).toBeNull();
    expect(estimateSwitchCost(5_000, 4)).not.toBeNull();
  });
});

describe("withSwitchCost", () => {
  it("adds the tokens and the cost to a model switch warning", () => {
    const result = withSwitchCost(modelImpact, { tokens: 84_000, usd: 0.336 });
    expect(result?.message).toBe(
      "A new model cannot use this cache. The next message may cost more. That message re-reads about 84k tokens: about $0.34 at the new model's input price.",
    );
    expect(result).toMatchObject({ category: "model", confirmed: true });
  });

  it("rounds large costs to whole dollars and tiny ones to a floor", () => {
    expect(withSwitchCost(modelImpact, { tokens: 900_000, usd: 27.4 })?.message).toContain("$27 ");
    expect(withSwitchCost(modelImpact, { tokens: 6_000, usd: 0.004 })?.message).toContain(
      "under $0.01",
    );
  });

  it("leaves a warning with no estimate, and option changes, as they are", () => {
    expect(withSwitchCost(modelImpact, null)).toBe(modelImpact);
    expect(withSwitchCost(null, { tokens: 84_000, usd: 0.3 })).toBeNull();
    const options: CacheImpact = { ...modelImpact, category: "configuration" };
    expect(withSwitchCost(options, { tokens: 84_000, usd: 0.3 })).toBe(options);
  });
});
