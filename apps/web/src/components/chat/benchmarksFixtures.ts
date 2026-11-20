import type { ModelBenchmarkEntry, ProviderInstanceId } from "@t3tools/contracts";
import { createModelSelection } from "@t3tools/shared/model";

import type { BenchmarkCandidate } from "../../lib/modelBenchmarks";

/** name, maker, effort, index, coding, agentic, tokens/s, cost per task, first answer s, in, out */
type Row = readonly [
  string,
  string,
  string,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

const ROWS: ReadonlyArray<Row> = [
  ["Claude Fable 5.2", "Anthropic", "max", 65, 63.1, 64.2, 48, 26.54, 262.5, 10, 40],
  ["GPT-6.2 Astra", "OpenAI", "max", 62, 60.2, 61, 95, 4, 204.5, 10, 40],
  ["Gemini 4 Neon", "Google", "xhigh", 61, 58, 59.1, 120, 6.44, 56.5, 2.5, 10],
  ["Gemini 4 Carbon", "Google", "high", 60, 57.4, 58, 110, 7.76, 74.5, 2.5, 10],
  ["Claude Opus 5.5", "Anthropic", "low", 46, 44, 45, 88, 0.8, 44.3, 5, 20],
  ["Claude Opus 5.5", "Anthropic", "medium", 52.1, 54.1, 56.1, 72, 1.56, 79.6, 5, 20],
  ["Claude Opus 5.5", "Anthropic", "high", 54.9, 55.9, 57.4, 64, 3.46, 151.4, 5, 20],
  ["Claude Opus 5.5", "Anthropic", "max", 59, 58, 60.2, 55, 10.04, 368.9, 5, 20],
  ["GPT-6.2 Sol", "OpenAI", "max", 57, 55.2, 56, 100, 1.01, 83.9, 3, 10],
  ["Claude Sonnet 5.5", "Anthropic", "max", 55, 53, 54.8, 70, 10.02, 275.2, 3, 10],
  ["Gemini 4 Hydrogen", "Google", "medium", 54, 52, 53, 140, 2.8, 50, 0.4, 1.6],
  ["Gemini 4 Argon", "Google", "high", 50.5, 49, 49.5, 130, 1.9, 60, 0.5, 2],
  ["GPT-6.1 Terra", "OpenAI", "high", 52, 50.3, 51, 110, 0.95, 70, 2, 8],
  ["Claude Haiku 5.5", "Anthropic", "default", 28.1, 26, 27, 160, 0.05, 2.1, 0.25, 1],
  ["GPT-6 Luna", "OpenAI", "default", 22, 20, 21, 200, 0.02, 1.2, 0.1, 0.4],
];

const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-");

export const FIXTURE_ENTRIES: ReadonlyArray<ModelBenchmarkEntry> = ROWS.map(
  ([name, creator, effort, index, coding, agentic, speed, cost, answer, priceIn, priceOut]) => ({
    source: "artificialAnalysis" as const,
    sourceModelKey: `${slug(name)}-${effort}`,
    name: effort === "default" ? name : `${name} (${effort})`,
    creator,
    ...(effort === "default" ? {} : { effort }),
    values: {
      "aa:index": index,
      "aa:coding": coding,
      "aa:agentic": agentic,
      "aa:speed": speed,
      "aa:cost-per-task": cost,
      "aa:first-answer": answer,
      "aa:price:input": priceIn,
      "aa:price:output": priceOut,
    },
  }),
);

const instance = "claudeAgent" as ProviderInstanceId;
const candidate = (
  modelId: string,
  modelName: string,
  effort: string | undefined,
  leftPercent: number,
): BenchmarkCandidate => ({
  quota: { kind: "subscription", leftPercent },
  key: `${modelId}:${effort ?? ""}`,
  providerName: "Claude",
  modelName,
  effortLabel: effort ?? null,
  query: { modelId, displayName: modelName, ...(effort ? { effort } : {}) },
  selection: createModelSelection(
    instance,
    modelId,
    effort ? [{ id: "effort", value: effort }] : null,
  ),
});

/** What the user can run: Opus at five efforts (X-High has no benchmark), Sonnet and Haiku. */
export const FIXTURE_CANDIDATES: ReadonlyArray<BenchmarkCandidate> = [
  ...["low", "medium", "high", "xhigh", "max"].map((effort) =>
    candidate("claude-opus-5-5", "Claude Opus 5.5", effort, 88),
  ),
  candidate("claude-sonnet-5-5", "Claude Sonnet 5.5", "max", 88),
  candidate("claude-haiku-5-5", "Claude Haiku 5.5", undefined, 88),
];
