import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as TestClock from "effect/testing/TestClock";
import { HttpClient, HttpClientResponse } from "effect/http";

import {
  canonicalModelKey,
  matchBenchmarks,
  parseArtificialAnalysis,
  parseBenchLm,
  splitAaName,
  splitEffort,
} from "./ModelBenchmarkSources.ts";
import * as ModelBenchmarks from "./ModelBenchmarks.ts";

// Trimmed copies of the live feeds' shapes (BenchLM schema 1.0).
const benchLmFeeds = {
  models: {
    items: [
      {
        canonicalModelKey: "claude-opus-5-5",
        model: "Claude Opus 5.5",
        creator: "Anthropic",
        displayScore: 85.43,
        url: "https://benchlm.ai/models/claude-opus-5-5",
        scores: { displayCategoryScores: { coding: 87.5, math: null } },
        benchmarks: { coding: { sweVerified: 81.2, helperCount: 3 } },
      },
      { canonicalModelKey: "gpt-6-luna", model: "GPT-6 Luna", displayScore: 65.25 },
      { canonicalModelKey: "gpt-6-luna-medium", model: "GPT-6 Luna (medium)", displayScore: 61 },
      { canonicalModelKey: "gpt-6-luna-low", model: "GPT-6 Luna (low)", displayScore: null },
    ],
  },
  pricing: { items: [{ canonicalModelKey: "claude-opus-5-5", inputPrice: 5, outputPrice: 25 }] },
  speed: { items: [{ canonicalModelKey: "claude-opus-5-5", tokensPerSecond: 72, ttft: 1.4 }] },
  benchmarks: {
    items: [{ benchmarkKey: "sweVerified", name: "SWE-bench Verified", category: "coding" }],
  },
};

describe("benchmark sources", () => {
  it("canonicalizes provider ids and splits effort suffixes", () => {
    expect(canonicalModelKey("anthropic/Claude Opus 5.5[1m]")).toBe("claude-opus-5-5");
    expect(canonicalModelKey("gpt-6.1-sol")).toBe("gpt-6-1-sol");
    expect(splitEffort("GPT-6 Luna (Medium)")).toEqual({ base: "GPT-6 Luna", effort: "medium" });
    expect(splitEffort("Claude Opus 5.5")).toEqual({ base: "Claude Opus 5.5" });
  });

  it("joins BenchLM scores, prices and speed, keeping only described benchmarks", () => {
    const parsed = parseBenchLm(benchLmFeeds);
    const opus = parsed.entries.find((entry) => entry.sourceModelKey === "claude-opus-5-5");
    expect(opus?.values).toEqual({
      "benchLm:overall": 85.43,
      "benchLm:category:coding": 87.5,
      "benchLm:benchmark:sweVerified": 81.2,
      "benchLm:price:input": 5,
      "benchLm:price:output": 25,
      "benchLm:speed": 72,
      "benchLm:ttft": 1.4,
    });
    expect(parsed.entries.find((entry) => entry.name.endsWith("(medium)"))?.effort).toBe("medium");
    expect(
      parsed.metrics.find((metric) => metric.key === "benchLm:price:input")?.higherIsBetter,
    ).toBe(false);
  });

  it("matches the measured effort, or falls back to the default run marked unmeasured", () => {
    const { entries } = parseBenchLm(benchLmFeeds);

    const medium = matchBenchmarks({ modelId: "gpt-6-luna", effort: "medium" }, entries);
    expect(
      medium.map((match) => [match.entry.source, match.entry.name, match.effortMeasured]),
    ).toEqual([["benchLm", "GPT-6 Luna (medium)", true]]);

    const low = matchBenchmarks({ modelId: "gpt-6-luna", effort: "low" }, entries);
    expect(low.map((match) => [match.entry.name, match.effortMeasured])).toEqual([
      ["GPT-6 Luna", false],
    ]);

    const high = matchBenchmarks({ modelId: "gpt-6-luna", effort: "high" }, entries);
    expect(
      high.map((match) => [match.entry.source, match.entry.name, match.effortMeasured]),
    ).toEqual([["benchLm", "GPT-6 Luna", false]]);

    expect(matchBenchmarks({ modelId: "claude-opus-5-5-20261001" }, entries)).toHaveLength(1);
    expect(matchBenchmarks({ modelId: "unknown-model" }, entries)).toEqual([]);
  });
});

const makeHarness = () => {
  const calls: string[] = [];
  let failing = false;
  const http = HttpClient.make((request) => {
    calls.push(request.url);
    if (failing)
      return Effect.succeed(
        HttpClientResponse.fromWeb(request, new Response(null, { status: 503 })),
      );
    const file = request.url.split("/").pop()?.replace(".json", "") as keyof typeof benchLmFeeds;
    return Effect.succeed(HttpClientResponse.fromWeb(request, Response.json(benchLmFeeds[file])));
  });
  const layer = ModelBenchmarks.layer.pipe(
    Layer.provide(Layer.succeed(HttpClient.HttpClient, http)),
  );
  return { calls, layer, fail: () => (failing = true), recover: () => (failing = false) };
};

describe("ModelBenchmarks", () => {
  it.effect("reports only the metrics the requested models have", () => {
    const harness = makeHarness();
    return Effect.gen(function* () {
      const service = yield* ModelBenchmarks.ModelBenchmarks;
      const report = yield* service.report([{ modelId: "gpt-6-luna" }]);
      expect(report.sources.map((source) => source.state)).toEqual(["ready"]);
      expect(report.metrics.map((metric) => metric.key)).toEqual(["benchLm:overall"]);
    }).pipe(Effect.provide(harness.layer));
  });

  it.effect("fetches once an hour and keeps the last good copy when a refresh fails", () => {
    const harness = makeHarness();
    return Effect.gen(function* () {
      const service = yield* ModelBenchmarks.ModelBenchmarks;
      yield* service.report([{ modelId: "claude-opus-5-5" }]);
      expect(harness.calls).toHaveLength(4);

      yield* service.report([{ modelId: "claude-opus-5-5" }]);
      expect(harness.calls).toHaveLength(4);

      harness.fail();
      yield* TestClock.adjust("61 minutes");
      const report = yield* service.report([{ modelId: "claude-opus-5-5" }]);
      expect(harness.calls.length).toBeGreaterThan(4);
      expect(report.sources[0]?.state).toBe("stale");
      expect(report.sources[0]?.refreshFailedAt).toBeDefined();
      expect(report.sources[0]?.fetchedAt).toBeDefined();
      expect(report.rows[0]?.matches).toHaveLength(1);
    }).pipe(Effect.provide(harness.layer));
  });

  it.effect("waits five minutes between downloads after a failed refresh, then recovers", () => {
    const harness = makeHarness();
    return Effect.gen(function* () {
      const service = yield* ModelBenchmarks.ModelBenchmarks;
      yield* service.report([{ modelId: "claude-opus-5-5" }]);
      harness.fail();
      yield* TestClock.adjust("61 minutes");
      yield* service.report([{ modelId: "claude-opus-5-5" }]);
      const afterFailure = harness.calls.length;

      yield* TestClock.adjust("4 minutes");
      const waiting = yield* service.report([{ modelId: "claude-opus-5-5" }]);
      expect(harness.calls).toHaveLength(afterFailure);
      expect(waiting.sources[0]?.state).toBe("stale");

      yield* TestClock.adjust("2 minutes");
      yield* service.report([{ modelId: "claude-opus-5-5" }]);
      expect(harness.calls.length).toBeGreaterThan(afterFailure);

      harness.recover();
      yield* TestClock.adjust("6 minutes");
      const recovered = yield* service.report([{ modelId: "claude-opus-5-5" }]);
      expect(recovered.sources[0]?.state).toBe("ready");
      expect(recovered.sources[0]?.refreshFailedAt).toBeUndefined();
    }).pipe(Effect.provide(harness.layer));
  });

  it.effect("shares one failed download between concurrent callers", () => {
    const harness = makeHarness();
    harness.fail();
    return Effect.gen(function* () {
      const service = yield* ModelBenchmarks.ModelBenchmarks;
      const reports = yield* Effect.forEach(
        [1, 2, 3],
        () => service.report([{ modelId: "claude-opus-5-5" }]),
        { concurrency: "unbounded" },
      );
      expect(reports.map((report) => report.sources[0]?.state)).toEqual([
        "unavailable",
        "unavailable",
        "unavailable",
      ]);
      expect(harness.calls.length).toBeLessThanOrEqual(4);
    }).pipe(Effect.provide(harness.layer));
  });

  it.effect("reports the source unavailable when the first fetch fails", () => {
    const harness = makeHarness();
    harness.fail();
    return Effect.gen(function* () {
      const service = yield* ModelBenchmarks.ModelBenchmarks;
      const report = yield* service.report([{ modelId: "claude-opus-5-5" }]);
      expect(report.sources[0]?.state).toBe("unavailable");
      expect(report.rows[0]?.matches).toEqual([]);
    }).pipe(Effect.provide(harness.layer));
  });
});

describe("Artificial Analysis source", () => {
  it("reads the effort out of AA names", () => {
    expect(splitAaName("Claude Sonnet 5.5 (Max, Default Fallback)")).toEqual({
      base: "Claude Sonnet 5.5",
      effort: "max",
    });
    expect(splitAaName("GPT-6.1 Sol (Medium)")).toEqual({ base: "GPT-6.1 Sol", effort: "medium" });
    expect(splitAaName("Some Model (Non-reasoning)")).toEqual({ base: "Some Model" });
  });

  it("turns each effort row into an entry with its own numbers", () => {
    const parsed = parseArtificialAnalysis([
      {
        data: [
          {
            name: "Claude Sonnet 5.5 (Medium)",
            slug: "claude-sonnet-5-5-medium",
            model_creator: { name: "Anthropic" },
            evaluations: {
              artificial_analysis_intelligence_index: 52,
              artificial_analysis_coding_index: 49.5,
            },
            performance: {
              median_output_tokens_per_second: 150,
              median_time_to_first_token_seconds: 1.2,
              median_time_to_first_answer_token: 9,
            },
            pricing: { price_1m_input_tokens: 3, price_1m_output_tokens: 15 },
            artificial_analysis_intelligence_index_cost: { cost_per_task: { total_cost: 2.1 } },
          },
          { name: "Empty (High)", slug: "empty-high" },
        ],
      },
    ]);
    expect(parsed.entries).toHaveLength(1);
    expect(parsed.entries[0]).toMatchObject({
      source: "artificialAnalysis",
      name: "Claude Sonnet 5.5 (medium)",
      effort: "medium",
      values: {
        "aa:index": 52,
        "aa:coding": 49.5,
        "aa:speed": 150,
        "aa:ttft": 1.2,
        "aa:first-answer": 9,
        "aa:price:input": 3,
        "aa:price:output": 15,
        "aa:cost-per-task": 2.1,
      },
    });
  });

  it("reads speed and latency from performance_v3 when the old block is null", () => {
    const parsed = parseArtificialAnalysis([
      {
        data: [
          {
            name: "Some Model (High)",
            slug: "some-model-high",
            evaluations: { artificial_analysis_intelligence_index: 40 },
            performance: { median_output_tokens_per_second: null },
            performance_v3: {
              mean_output_tokens_per_second: 62.4,
              mean_time_to_first_token_seconds: 3.5,
              mean_time_to_first_answer_token_seconds: 79.1,
            },
          },
        ],
      },
    ]);
    expect(parsed.entries[0]?.values).toMatchObject({
      "aa:speed": 62.4,
      "aa:ttft": 3.5,
      "aa:first-answer": 79.1,
    });
  });
});
