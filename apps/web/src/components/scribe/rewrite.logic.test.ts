import { describe, expect, it } from "vite-plus/test";

import {
  DEFAULT_REWRITE_PRESETS,
  MAX_REWRITE_PRESETS,
  cleanPresets,
  hasPresetErrors,
  movePreset,
  readRewritePresets,
  samePresets,
  validatePresets,
} from "./rewrite.logic";

describe("DEFAULT_REWRITE_PRESETS", () => {
  it("matches the engine defaults, in picker order, with no personal text", () => {
    expect(DEFAULT_REWRITE_PRESETS.map((preset) => preset.name)).toEqual([
      "Clarity",
      "Shorter",
      "Friendly",
      "AI message",
      "Add detail",
      "Note to AI",
    ]);
    for (const preset of DEFAULT_REWRITE_PRESETS) {
      expect(preset.instruction.trim().length).toBeGreaterThan(40);
      expect(preset.instruction).not.toMatch(/AIOS|Em-Dash|em dash|—/);
    }
    expect(hasPresetErrors(validatePresets(DEFAULT_REWRITE_PRESETS))).toBe(false);
  });
});

describe("readRewritePresets", () => {
  it("falls back to the built-in presets when the list is missing, empty or unreadable", () => {
    for (const presets of [{}, { rewrite: [] }, { rewrite: "x" }, { rewrite: [{ name: 1 }] }]) {
      expect(readRewritePresets(presets)).toEqual({
        list: DEFAULT_REWRITE_PRESETS,
        builtIn: true,
      });
    }
  });

  it("reads a saved list, drops bad rows and extra keys, and keeps at most 9", () => {
    const rows = Array.from({ length: 11 }, (_, i) => ({
      name: `P${i}`,
      instruction: "Do it.",
      extra: true,
    }));
    const read = readRewritePresets({ rewrite: [null, ...rows] });
    expect(read.builtIn).toBe(false);
    expect(read.list).toHaveLength(MAX_REWRITE_PRESETS);
    expect(read.list[0]).toEqual({ name: "P0", instruction: "Do it." });
  });
});

describe("validatePresets", () => {
  it("needs a unique name and an instruction", () => {
    const errors = validatePresets([
      { name: "Short", instruction: "Cut it." },
      { name: " short ", instruction: "Again." },
      { name: "  ", instruction: "" },
      { name: "Fine", instruction: "Ok." },
    ]);
    expect(errors[0]?.name).toBe("Another preset has this name.");
    expect(errors[1]?.name).toBe("Another preset has this name.");
    expect(errors[2]).toEqual({
      name: "Give the preset a name.",
      instruction: "Write what the rewrite must do.",
    });
    expect(errors[3]).toEqual({});
    expect(hasPresetErrors(errors)).toBe(true);
    expect(hasPresetErrors([{}, {}])).toBe(false);
  });
});

describe("movePreset", () => {
  it("swaps with the neighbour and leaves the edges alone", () => {
    expect(movePreset(["a", "b", "c"], 1, -1)).toEqual(["b", "a", "c"]);
    expect(movePreset(["a", "b", "c"], 1, 1)).toEqual(["a", "c", "b"]);
    expect(movePreset(["a", "b"], 0, -1)).toEqual(["a", "b"]);
    expect(movePreset(["a", "b"], 1, 1)).toEqual(["a", "b"]);
  });
});

describe("cleanPresets and samePresets", () => {
  it("trims for the engine and ignores whitespace-only edits", () => {
    const a = [{ name: " A ", instruction: " Do. ", id: "x" } as never];
    expect(cleanPresets(a)).toEqual([{ name: "A", instruction: "Do." }]);
    expect(samePresets(a, [{ name: "A", instruction: "Do." }])).toBe(true);
    expect(samePresets(a, [{ name: "B", instruction: "Do." }])).toBe(false);
  });
});
