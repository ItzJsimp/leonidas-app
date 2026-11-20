import type { ModelBenchmarkEntry } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  COMPARE_METRICS,
  SCORE_METRICS,
  candidatesOfModel,
  effortTiles,
  offeredEfforts,
  formatMetricValue,
  groupModels,
  paretoFront,
  pointsFor,
  rankModels,
} from "./benchmarkWindow";

const aa = (name: string, effort: string | undefined, index: number, cost: number) =>
  ({
    source: "artificialAnalysis",
    sourceModelKey: `${name}-${effort ?? "none"}`.toLowerCase().replace(/\s+/g, "-"),
    name: effort ? `${name} (${effort})` : name,
    creator: "Anthropic",
    ...(effort ? { effort } : {}),
    values: { "aa:index": index, "aa:cost-per-task": cost },
  }) satisfies ModelBenchmarkEntry;

const entries = [
  aa("Claude Opus 5.5", "max", 59, 10.04),
  aa("Claude Opus 5.5", "low", 46, 0.8),
  aa("Claude Opus 5.5", "medium", 52.1, 1.56),
  aa("Claude Haiku 5.5", undefined, 28.1, 0.05),
];
const intelligence = SCORE_METRICS.artificialAnalysis[0]!;

describe("groupModels", () => {
  it("joins the effort rows of one model and lists them lowest first", () => {
    const models = groupModels(entries, "artificialAnalysis");
    const opus = models.find((model) => model.name === "Claude Opus 5.5");
    expect(models).toHaveLength(2);
    expect(opus?.points.map((point) => point.effort)).toEqual(["low", "medium", "max"]);
  });

  it("ignores entries from the other source", () => {
    expect(groupModels(entries, "benchLm")).toEqual([]);
  });
});

describe("pointsFor and rankModels", () => {
  const models = groupModels(entries, "artificialAnalysis");
  const opus = models.find((model) => model.name === "Claude Opus 5.5")!;

  it("picks the top effort, the usual default or every effort", () => {
    expect(pointsFor(opus, "highest", "aa:index").map((point) => point.effort)).toEqual(["max"]);
    expect(pointsFor(opus, "default", "aa:index").map((point) => point.effort)).toEqual(["medium"]);
    expect(pointsFor(opus, "all", "aa:index")).toHaveLength(3);
  });

  it("ranks by the metric and skips models with no number", () => {
    const ranked = rankModels(models, "highest", intelligence);
    expect(ranked.map((row) => row.model.name)).toEqual(["Claude Opus 5.5", "Claude Haiku 5.5"]);
    expect(rankModels(models, "highest", SCORE_METRICS.artificialAnalysis[1]!)).toEqual([]);
  });

  it("ranks cost the other way round", () => {
    const cost = COMPARE_METRICS.artificialAnalysis[0]!;
    expect(rankModels(models, "highest", cost)[0]?.model.name).toBe("Claude Haiku 5.5");
  });
});

describe("paretoFront", () => {
  it("keeps the points no cheaper point beats", () => {
    const points = [
      { id: "a", x: 1, y: 40 },
      { id: "b", x: 2, y: 35 },
      { id: "c", x: 5, y: 60 },
    ];
    expect(paretoFront(points, false).map((point) => point.id)).toEqual(["a", "c"]);
  });
});

describe("effortTiles", () => {
  it("shows an offered effort with no run as an empty tile, never another effort's number", () => {
    const opus = groupModels(entries, "artificialAnalysis").find((m) => m.name.includes("Opus"))!;
    const tiles = effortTiles(opus, ["low", "medium", "high", "xhigh", "max"]);
    expect(tiles.map((tile) => tile.effort)).toEqual(["low", "medium", "high", "xhigh", "max"]);
    expect(tiles.find((tile) => tile.effort === "high")?.point).toBeNull();
    expect(tiles.find((tile) => tile.effort === "xhigh")?.point).toBeNull();
    expect(tiles.find((tile) => tile.effort === "medium")?.point?.entry.values["aa:index"]).toBe(
      52.1,
    );
  });
});

describe("formatMetricValue", () => {
  it("formats each kind of number", () => {
    expect(formatMetricValue(intelligence, 52.14)).toBe("52.1");
    expect(formatMetricValue(COMPARE_METRICS.artificialAnalysis[0]!, 1.5)).toBe("$1.50");
    expect(formatMetricValue(COMPARE_METRICS.artificialAnalysis[1]!, 71.6)).toBe("72 t/s");
    expect(formatMetricValue(COMPARE_METRICS.artificialAnalysis[2]!, 5)).toBe("$5");
  });
});

describe("offeredEfforts", () => {
  it("lists an effort the provider offers even when the source has no row for it", () => {
    const opus = groupModels(entries, "artificialAnalysis").find((m) => m.name.includes("Opus"))!;
    const candidate = (modelId: string, displayName: string, effort: string) => ({
      query: { modelId, displayName, effort },
    });
    const candidates = [
      candidate("claude-opus-5-5", "Claude Opus 5.5", "medium"),
      candidate("claude-opus-5-5", "Claude Opus 5.5", "xhigh"),
      candidate("claude-haiku-5-5", "Claude Haiku 5.5", "low"),
    ];
    expect(candidatesOfModel(opus, candidates)).toHaveLength(2);
    expect(offeredEfforts(opus, candidates)).toEqual(["medium", "xhigh"]);
  });
});
