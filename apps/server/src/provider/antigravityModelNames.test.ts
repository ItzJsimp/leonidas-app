import { describe, expect, it } from "@effect/vitest";

import { antigravityModelNameFromLabel } from "./antigravityModelNames.ts";

describe("antigravityModelNameFromLabel", () => {
  it("keeps the effort tier in the name and prices the untiered model", () => {
    expect(antigravityModelNameFromLabel("Gemini 3.8 Flash (High)")).toEqual({
      model: "gemini-3.8-flash-high",
      rateModel: "gemini-3.8-flash",
    });
    expect(antigravityModelNameFromLabel("gemini-3.1-pro-low")).toEqual({
      model: "gemini-3.1-pro-low",
      rateModel: "gemini-3.1-pro",
    });
    expect(antigravityModelNameFromLabel("Gemini 4 Argon (High)")).toEqual({
      model: "gemini-4-argon-high",
      rateModel: "gemini-4-argon",
    });
    expect(antigravityModelNameFromLabel("Gemini 4 Hydrogen (Extra High)")).toEqual({
      model: "gemini-4-hydrogen-xhigh",
      rateModel: "gemini-4-hydrogen",
    });
  });

  it("folds variant tags that are not effort tiers into the base model", () => {
    expect(antigravityModelNameFromLabel("Gemini 2.5 Flash Thinking")).toEqual({
      model: "gemini-2.5-flash",
    });
    expect(antigravityModelNameFromLabel("Claude Opus 4.6 (Thinking)")).toEqual({
      model: "claude-opus-4-6",
    });
    expect(antigravityModelNameFromLabel("Gemini 3 Pro")).toEqual({ model: "gemini-3-pro" });
  });
});
