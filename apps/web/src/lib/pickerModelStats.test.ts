import type { ModelBenchmarkEntry } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  NO_PICKER_STATS,
  effortRowStats,
  formatPickerCost,
  formatPickerIntelligence,
  formatPickerSpeed,
  pickerModelStats,
} from "./pickerModelStats";

const entry = (name: string, values: Record<string, number>): ModelBenchmarkEntry => ({
  source: "benchLm",
  sourceModelKey: name.toLowerCase().replace(/\s+/g, "-"),
  name,
  values,
});

describe("pickerModelStats", () => {
  it("prefers the Artificial Analysis index over BenchLM overall", () => {
    const stats = pickerModelStats(
      [
        entry("GPT-5.6 Sol", {
          "benchLm:benchmark:artificialAnalysis": 58.89,
          "benchLm:overall": 90,
          "benchLm:speed": 120.4,
          "benchLm:price:input": 2,
          "benchLm:price:output": 10,
        }),
      ],
      { modelId: "gpt-5.6-sol" },
    );
    expect(stats.intelligenceSource).toBe("aa");
    expect(formatPickerIntelligence(stats)).toBe("58.9");
    expect(formatPickerSpeed(stats)).toBe("120 t/s");
    expect(formatPickerCost(stats)).toBe("$2 / $10");
  });

  it("falls back to BenchLM overall when the index is missing", () => {
    const stats = pickerModelStats([entry("Claude Opus 5", { "benchLm:overall": 77 })], {
      modelId: "claude-opus-5",
    });
    expect(stats.intelligenceSource).toBe("overall");
    expect(stats.intelligence).toBe(77);
    expect(formatPickerCost(stats)).toBeNull();
  });

  it("returns empty stats for a model no source knows", () => {
    expect(
      pickerModelStats([entry("Other", { "benchLm:overall": 1 })], { modelId: "new-model" }),
    ).toBe(NO_PICKER_STATS);
  });

  it("keeps cents below ten dollars", () => {
    const stats = pickerModelStats(
      [entry("Cheap", { "benchLm:price:input": 0.15, "benchLm:price:output": 0.6 })],
      { modelId: "cheap" },
    );
    expect(formatPickerCost(stats)).toBe("$0.15 / $0.6");
  });

  it("opens on medium effort and lists every measured effort from Artificial Analysis", () => {
    const aa = (effort: string, index: number): ModelBenchmarkEntry => ({
      source: "artificialAnalysis",
      sourceModelKey: `claude-sonnet-5-5-${effort}`,
      name: `Claude Sonnet 5.5 (${effort})`,
      effort,
      values: { "aa:index": index, "aa:speed": 100 + index },
    });
    const stats = pickerModelStats(
      [
        entry("Claude Sonnet 5.5", { "benchLm:benchmark:artificialAnalysis": 56 }),
        aa("max", 56),
        aa("medium", 50),
        aa("low", 40),
      ],
      { modelId: "claude-sonnet-5-5" },
    );
    expect(stats.effort).toBe("medium");
    expect(stats.intelligence).toBe(50);
    expect(stats.source).toBe("artificialAnalysis");
    expect(stats.efforts.map((item) => item.effort)).toEqual(["low", "medium", "max"]);
  });

  it("gives each effort its own row and marks an unmeasured effort as not benchmarked", () => {
    const aa = (effort: string, index: number): ModelBenchmarkEntry => ({
      source: "artificialAnalysis",
      sourceModelKey: `claude-opus-5-5-${effort}`,
      name: `Claude Opus 5.5 (${effort})`,
      effort,
      values: { "aa:index": index, "aa:cost-per-task": index / 10 },
    });
    const stats = pickerModelStats([aa("low", 46), aa("medium", 52.1), aa("max", 59)], {
      modelId: "claude-opus-5-5",
    });
    expect(effortRowStats(stats, "medium")?.intelligence).toBe(52.1);
    expect(effortRowStats(stats, "low")?.costPerTask).toBeCloseTo(4.6);
    // X-High has no AA row: null, never the number of the next effort up.
    expect(effortRowStats(stats, "xhigh")).toBeNull();
  });

  it("shows no per-effort numbers when the source splits no efforts", () => {
    const stats = pickerModelStats([entry("Claude Opus 5", { "benchLm:overall": 77 })], {
      modelId: "claude-opus-5",
    });
    expect(effortRowStats(stats, "high")).toBeUndefined();
    expect(effortRowStats(null, "high")).toBeUndefined();
  });
});
