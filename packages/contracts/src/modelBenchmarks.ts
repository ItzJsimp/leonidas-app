import * as Schema from "effect/Schema";

import { IsoDateTime, TrimmedNonEmptyString } from "./baseSchemas.ts";

/**
 * Public benchmark publishers the server reads. BenchLM republishes results
 * from Artificial Analysis, Vals, LiveBench, Arena and others with credit.
 * Each source keeps its own scale: scores are never blended into one number.
 */
const ModelBenchmarkSourceId = Schema.Literals(["benchLm", "artificialAnalysis"]);
export type ModelBenchmarkSourceId = typeof ModelBenchmarkSourceId.Type;

/**
 * `ready` means the copy is fresh. `stale` means the last refresh failed and the
 * copy is older than an hour; its scores are still the last good ones.
 * `unavailable` means the last fetch failed and no earlier copy exists.
 */
const ModelBenchmarkSourceStatus = Schema.Struct({
  source: ModelBenchmarkSourceId,
  state: Schema.Literals(["ready", "stale", "unavailable"]),
  fetchedAt: Schema.optional(IsoDateTime),
  /** When the latest refresh failed; absent after a refresh succeeds. */
  refreshFailedAt: Schema.optional(IsoDateTime),
  /** Credit line the source requires wherever its numbers are shown. */
  attribution: TrimmedNonEmptyString,
  url: TrimmedNonEmptyString,
});
export type ModelBenchmarkSourceStatus = typeof ModelBenchmarkSourceStatus.Type;

/**
 * One number a source publishes per model. `kind` picks the chart chip (Score,
 * Cost, Speed); `higherIsBetter` decides the ranking direction.
 */
const ModelBenchmarkMetric = Schema.Struct({
  key: TrimmedNonEmptyString,
  source: ModelBenchmarkSourceId,
  label: TrimmedNonEmptyString,
  kind: Schema.Literals(["score", "price", "speed", "latency"]),
  unit: Schema.String,
  higherIsBetter: Schema.Boolean,
  /** Grouping such as "coding" or "reasoning", when the source has one. */
  category: Schema.optional(TrimmedNonEmptyString),
});
export type ModelBenchmarkMetric = typeof ModelBenchmarkMetric.Type;

/** A source's record for one model (and effort, when the source splits by it). */
const ModelBenchmarkEntry = Schema.Struct({
  source: ModelBenchmarkSourceId,
  sourceModelKey: TrimmedNonEmptyString,
  name: TrimmedNonEmptyString,
  creator: Schema.optional(TrimmedNonEmptyString),
  effort: Schema.optional(TrimmedNonEmptyString),
  /** Metric key to value; a metric the source did not measure is absent. */
  values: Schema.Record(Schema.String, Schema.Number),
  url: Schema.optional(TrimmedNonEmptyString),
});
export type ModelBenchmarkEntry = typeof ModelBenchmarkEntry.Type;

/** A model the user can run, as the provider names it. */
const ModelBenchmarkQuery = Schema.Struct({
  modelId: TrimmedNonEmptyString,
  displayName: Schema.optional(TrimmedNonEmptyString),
  effort: Schema.optional(TrimmedNonEmptyString),
});
export type ModelBenchmarkQuery = typeof ModelBenchmarkQuery.Type;

const ModelBenchmarkMatch = Schema.Struct({
  entry: ModelBenchmarkEntry,
  /**
   * False when the query asked for an effort the source never measured and
   * the entry is the model's default run instead.
   */
  effortMeasured: Schema.Boolean,
});
export type ModelBenchmarkMatch = typeof ModelBenchmarkMatch.Type;

/** At most one match per source; no matches means the model is unknown to every source. */
const ModelBenchmarkRow = Schema.Struct({
  query: ModelBenchmarkQuery,
  matches: Schema.Array(ModelBenchmarkMatch),
});
export type ModelBenchmarkRow = typeof ModelBenchmarkRow.Type;

export const ModelBenchmarkReport = Schema.Struct({
  sources: Schema.Array(ModelBenchmarkSourceStatus),
  /** Only metrics at least one row has a value for. */
  metrics: Schema.Array(ModelBenchmarkMetric),
  rows: Schema.Array(ModelBenchmarkRow),
});
export type ModelBenchmarkReport = typeof ModelBenchmarkReport.Type;

/** The models to rank; the RPC and the `leo_model_benchmarks` MCP tool share it. */
export const ModelBenchmarkReportInput = Schema.Struct({
  models: Schema.Array(ModelBenchmarkQuery).check(Schema.isMaxLength(200)),
});
export type ModelBenchmarkReportInput = typeof ModelBenchmarkReportInput.Type;

/** Everything a source publishes, for the explorer that charts models the user has not connected. */
export const ModelBenchmarkCatalog = Schema.Struct({
  sources: Schema.Array(ModelBenchmarkSourceStatus),
  metrics: Schema.Array(ModelBenchmarkMetric),
  entries: Schema.Array(ModelBenchmarkEntry),
});
export type ModelBenchmarkCatalog = typeof ModelBenchmarkCatalog.Type;

/** How one model and effort has actually performed in this user's own chats. */
const ModelRunStat = Schema.Struct({
  model: TrimmedNonEmptyString,
  effort: Schema.optional(TrimmedNonEmptyString),
  runs: Schema.Number,
  completed: Schema.Number,
  /** Failed or interrupted by an error; user cancels are counted separately. */
  failed: Schema.Number,
  cancelled: Schema.Number,
  /** Runs that needed a second attempt (retry or provider failover). */
  retried: Schema.Number,
  /** Median wall time of completed runs, in seconds. */
  medianSeconds: Schema.optional(Schema.Number),
  lastUsedAt: Schema.optional(IsoDateTime),
});
export type ModelRunStat = typeof ModelRunStat.Type;

export const ModelRunStats = Schema.Struct({
  /** Only runs requested on or after this time are counted. */
  since: IsoDateTime,
  stats: Schema.Array(ModelRunStat),
});
export type ModelRunStats = typeof ModelRunStats.Type;
