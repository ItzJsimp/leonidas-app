import { describe, expect, it } from "@effect/vitest";

import { readLimits, updateLimit } from "./aiosLimits.ts";

const input = JSON.stringify({
  thread_review_turns: { label: "Review", value: 30, default: 30, unit: "turns", min: 1, max: 100 },
  thread_handoff_turns: {
    label: "Handoff",
    value: 40,
    default: 40,
    unit: "turns",
    min: 1,
    max: 100,
  },
  thread_hard_turns: { label: "Hard", value: 50, default: 50, unit: "turns", min: 1, max: 100 },
});

describe("AIOS limits", () => {
  it("reads values and preserves other entries when one changes", () => {
    const result = updateLimit(input, "thread_review_turns", 25);
    expect(readLimits(result).map(({ id, value }) => [id, value])).toEqual([
      ["thread_review_turns", 25],
      ["thread_handoff_turns", 40],
      ["thread_hard_turns", 50],
    ]);
  });

  it("rejects invalid input, unknown limits and inconsistent thresholds", () => {
    for (const value of [0, 101, 1.5, NaN]) {
      expect(() => updateLimit(input, "thread_review_turns", value)).toThrow();
    }
    expect(() => updateLimit(input, "missing", 1)).toThrow();
    expect(() => updateLimit(input, "thread_review_turns", 45)).toThrow();
    expect(() => readLimits("not json")).toThrow();
  });
});
