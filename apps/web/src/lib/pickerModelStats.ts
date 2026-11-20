import type { ModelBenchmarkEntry } from "@t3tools/contracts";
import { benchmarkEffortEntries, matchBenchmarks } from "@t3tools/shared/modelBenchmarkMatch";

const AA_INDEX = "benchLm:benchmark:artificialAnalysis";
const OVERALL = "benchLm:overall";

/** The three numbers a picker row shows, plus the extra the hover card adds. */
export interface PickerModelStats {
  /** Which scale `intelligence` is on; the two scales are never compared. */
  readonly intelligenceSource: "aa" | "overall" | null;
  readonly intelligence: number | null;
  readonly tokensPerSecond: number | null;
  readonly inputPrice: number | null;
  readonly outputPrice: number | null;
  readonly ttftSeconds: number | null;
  /** Coding and agentic indices, cost to run one index task, and the effort these numbers are for. */
  readonly coding: number | null;
  readonly agentic: number | null;
  readonly costPerTask: number | null;
  readonly effort: string | null;
  /** Which source the numbers came from. */
  readonly source: "artificialAnalysis" | "benchLm" | null;
  /** One row per effort the source measured, lowest effort first; empty when it splits none. */
  readonly efforts: ReadonlyArray<PickerEffortStats>;
}

export interface PickerEffortStats {
  readonly effort: string;
  readonly intelligence: number | null;
  readonly coding: number | null;
  readonly agentic: number | null;
  readonly tokensPerSecond: number | null;
  readonly ttftSeconds: number | null;
  readonly inputPrice: number | null;
  readonly outputPrice: number | null;
  readonly costPerTask: number | null;
}

/** Low to high, so the tabs read in order. An effort not listed sorts last. */
export const EFFORT_ORDER = ["minimal", "low", "medium", "high", "xhigh", "ultra", "max"] as const;
/** The tab the panel opens on: medium is the usual provider default, then the next one up. */
const DEFAULT_EFFORT_PREFERENCE = ["medium", "high", "low", "minimal", "xhigh", "ultra", "max"];

export const NO_PICKER_STATS: PickerModelStats = {
  intelligenceSource: null,
  intelligence: null,
  tokensPerSecond: null,
  inputPrice: null,
  outputPrice: null,
  ttftSeconds: null,
  coding: null,
  agentic: null,
  costPerTask: null,
  effort: null,
  source: null,
  efforts: [],
};

const effortRank = (effort: string) => {
  // The run with no reasoning effort (AA "Non-reasoning") is the lowest setting.
  if (effort === "default") return -1;
  const index = EFFORT_ORDER.indexOf(effort as (typeof EFFORT_ORDER)[number]);
  return index < 0 ? EFFORT_ORDER.length : index;
};

function effortStats(entry: ModelBenchmarkEntry): PickerEffortStats {
  const { values } = entry;
  return {
    effort: entry.effort ?? "default",
    intelligence: numberOrNull(values["aa:index"]),
    coding: numberOrNull(values["aa:coding"]),
    agentic: numberOrNull(values["aa:agentic"]),
    tokensPerSecond: numberOrNull(values["aa:speed"]),
    ttftSeconds: numberOrNull(values["aa:ttft"]),
    inputPrice: numberOrNull(values["aa:price:input"]),
    outputPrice: numberOrNull(values["aa:price:output"]),
    costPerTask: numberOrNull(values["aa:cost-per-task"]),
  };
}

/** The effort whose numbers the row shows: the model's usual default, else the best available. */
export function defaultEffortKey(efforts: ReadonlyArray<string>): string | null {
  for (const effort of DEFAULT_EFFORT_PREFERENCE) {
    if (efforts.includes(effort)) return effort;
  }
  return efforts[0] ?? null;
}

export const defaultEffortOf = (efforts: ReadonlyArray<PickerEffortStats>): string | null =>
  defaultEffortKey(efforts.map((item) => item.effort));

const numberOrNull = (value: number | undefined) => value ?? null;

/** Stats for one model from the matched benchmark entry; the AA index wins over BenchLM overall. */
export function pickerModelStats(
  entries:
    | ReadonlyArray<ModelBenchmarkEntry>
    | ReadonlyMap<string, ReadonlyArray<ModelBenchmarkEntry>>,
  query: { readonly modelId: string; readonly displayName?: string },
): PickerModelStats {
  // Artificial Analysis measures each effort on its own; its numbers win when a key is saved.
  const efforts = benchmarkEffortEntries(query, entries, "artificialAnalysis")
    .map(effortStats)
    .toSorted((a, b) => effortRank(a.effort) - effortRank(b.effort));
  const chosen = efforts.find((item) => item.effort === defaultEffortOf(efforts));
  if (chosen) {
    return {
      intelligenceSource: chosen.intelligence !== null ? "aa" : null,
      intelligence: chosen.intelligence,
      tokensPerSecond: chosen.tokensPerSecond,
      inputPrice: chosen.inputPrice,
      outputPrice: chosen.outputPrice,
      ttftSeconds: chosen.ttftSeconds,
      coding: chosen.coding,
      agentic: chosen.agentic,
      costPerTask: chosen.costPerTask,
      effort: chosen.effort === "default" ? null : chosen.effort,
      source: "artificialAnalysis",
      efforts: efforts.length > 1 || efforts[0]?.effort !== "default" ? efforts : [],
    };
  }
  const entry = matchBenchmarks(query, entries).find(
    (match) => match.entry.source === "benchLm",
  )?.entry;
  if (!entry) return NO_PICKER_STATS;
  const aa = entry.values[AA_INDEX];
  const overall = entry.values[OVERALL];
  return {
    intelligenceSource: aa !== undefined ? "aa" : overall !== undefined ? "overall" : null,
    intelligence: aa ?? numberOrNull(overall),
    tokensPerSecond: numberOrNull(entry.values["benchLm:speed"]),
    inputPrice: numberOrNull(entry.values["benchLm:price:input"]),
    outputPrice: numberOrNull(entry.values["benchLm:price:output"]),
    ttftSeconds: numberOrNull(entry.values["benchLm:ttft"]),
    coding: null,
    agentic: null,
    costPerTask: null,
    effort: null,
    source: "benchLm",
    efforts: [],
  };
}

export const hasPickerStats = (stats: PickerModelStats) =>
  stats.intelligence !== null ||
  stats.tokensPerSecond !== null ||
  stats.inputPrice !== null ||
  stats.outputPrice !== null;

/** A price per million tokens: "$5", "$0.25". */
export const dollars = (value: number) =>
  `$${value >= 10 ? Math.round(value) : Number(value.toFixed(2))}`;

/** The cost of one benchmark task keeps both decimals: "$0.80", "$10.04". */
export const formatCostPerTask = (value: number) => `$${value.toFixed(2)}`;

/** "$2 / $10" per million tokens; null when the source has no price. */
export function formatPickerCost(stats: PickerModelStats): string | null {
  if (stats.inputPrice === null || stats.outputPrice === null) return null;
  return `${dollars(stats.inputPrice)} / ${dollars(stats.outputPrice)}`;
}

/**
 * The numbers for one effort option of the picker. `undefined` means the source splits no efforts,
 * so the row shows no numbers. `null` means the source measured other efforts but not this one:
 * the row says "Not benchmarked" and never borrows a number from another effort.
 */
export function effortRowStats(
  stats: PickerModelStats | null | undefined,
  optionId: string,
): PickerEffortStats | null | undefined {
  if (!stats || stats.source !== "artificialAnalysis" || stats.efforts.length === 0) {
    return undefined;
  }
  // AA lists the run with no reasoning as "default"; the provider calls that option "none".
  const key = optionId === "none" ? "default" : optionId;
  return stats.efforts.find((item) => item.effort === key) ?? null;
}

export const formatPickerSpeed = (stats: PickerModelStats): string | null =>
  stats.tokensPerSecond === null ? null : `${Math.round(stats.tokensPerSecond)} t/s`;

export const formatPickerIntelligence = (stats: PickerModelStats): string | null =>
  stats.intelligence === null ? null : String(Math.round(stats.intelligence * 10) / 10);

export const formatEffortLabel = (effort: string) =>
  effort === "xhigh" ? "X-High" : effort.charAt(0).toUpperCase() + effort.slice(1);
