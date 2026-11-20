import type { ModelBenchmarkEntry } from "@t3tools/contracts";
import { canonicalModelKey } from "@t3tools/shared/modelBenchmarkMatch";

import { EFFORT_ORDER, defaultEffortKey, dollars } from "./pickerModelStats";

export type WindowSource = "artificialAnalysis" | "benchLm";
/** Which effort levels a model shows: its top one, its usual default, or every one measured. */
export type EffortMode = "highest" | "default" | "all";

export interface WindowMetric {
  readonly key: string;
  readonly label: string;
  /** How a value reads: score 52.1, usd $1.56, tps 72 t/s, usdMtok $5. */
  readonly format: "score" | "usd" | "tps" | "usdMtok" | "seconds";
  readonly higherIsBetter: boolean;
}

const score = (key: string, label: string): WindowMetric => ({
  key,
  label,
  format: "score",
  higherIsBetter: true,
});
const SPEED = (key: string): WindowMetric => ({
  key,
  label: "Output speed",
  format: "tps",
  higherIsBetter: true,
});
const PRICE_OUT = (key: string): WindowMetric => ({
  key,
  label: "Output price",
  format: "usdMtok",
  higherIsBetter: false,
});
const COST_PER_TASK: WindowMetric = {
  key: "aa:cost-per-task",
  label: "Cost per task",
  format: "usd",
  higherIsBetter: false,
};

/** The score a chart or bar can show. Each source keeps its own scale. */
export const SCORE_METRICS: Readonly<Record<WindowSource, ReadonlyArray<WindowMetric>>> = {
  artificialAnalysis: [
    score("aa:index", "Intelligence"),
    score("aa:coding", "Coding"),
    score("aa:agentic", "Agentic"),
  ],
  benchLm: [
    score("benchLm:overall", "Overall"),
    score("benchLm:category:coding", "Coding"),
    score("benchLm:category:agentic", "Agentic"),
  ],
};

/** What the chart's x axis compares a score against. */
export const COMPARE_METRICS: Readonly<Record<WindowSource, ReadonlyArray<WindowMetric>>> = {
  artificialAnalysis: [COST_PER_TASK, SPEED("aa:speed"), PRICE_OUT("aa:price:output")],
  benchLm: [SPEED("benchLm:speed"), PRICE_OUT("benchLm:price:output")],
};

export function formatMetricValue(metric: WindowMetric, value: number): string {
  switch (metric.format) {
    case "score":
      return value.toFixed(1);
    case "usd":
      return `$${value.toFixed(2)}`;
    case "tps":
      return `${Math.round(value)} t/s`;
    case "usdMtok":
      return dollars(value);
    case "seconds":
      return `${value.toFixed(1)} s`;
  }
}

export interface EffortPoint {
  /** "default" is the run with no reasoning effort. */
  readonly effort: string;
  readonly entry: ModelBenchmarkEntry;
}

/** One model with every effort the source measured, lowest effort first. */
export interface WindowModel {
  readonly key: string;
  readonly name: string;
  readonly creator: string | undefined;
  readonly points: ReadonlyArray<EffortPoint>;
}

const effortRank = (effort: string) => {
  if (effort === "default") return -1;
  const index = EFFORT_ORDER.indexOf(effort as (typeof EFFORT_ORDER)[number]);
  return index < 0 ? EFFORT_ORDER.length : index;
};

/** Joins one source's entries into models. Several effort rows of one model become one model. */
export function groupModels(
  entries: ReadonlyArray<ModelBenchmarkEntry>,
  source: WindowSource,
): ReadonlyArray<WindowModel> {
  const byKey = new Map<
    string,
    { name: string; creator: string | undefined; points: EffortPoint[] }
  >();
  for (const entry of entries) {
    if (entry.source !== source) continue;
    // AA and BenchLM write the effort as a trailing "(max)"; the model name is what comes before it.
    const name = entry.effort ? entry.name.replace(/\s*\([^)]*\)\s*$/, "") : entry.name;
    const key = canonicalModelKey(name);
    const model = byKey.get(key) ?? { name, creator: entry.creator, points: [] };
    model.points.push({ effort: entry.effort ?? "default", entry });
    byKey.set(key, model);
  }
  return [...byKey].map(([key, model]) => ({
    key,
    name: model.name,
    creator: model.creator,
    points: model.points.toSorted((a, b) => effortRank(a.effort) - effortRank(b.effort)),
  }));
}

export const valueAt = (point: EffortPoint, metricKey: string): number | undefined =>
  point.entry.values[metricKey];

/** The points of one model the chosen effort mode shows, for one metric. */
export function pointsFor(
  model: WindowModel,
  mode: EffortMode,
  metricKey: string,
): ReadonlyArray<EffortPoint> {
  const measured = model.points.filter((point) => valueAt(point, metricKey) !== undefined);
  if (mode === "all") return measured;
  if (mode === "default") {
    const key = defaultEffortKey(measured.map((point) => point.effort));
    return measured.filter((point) => point.effort === key);
  }
  const top = measured.at(-1);
  return top ? [top] : [];
}

export interface RankedModel {
  readonly model: WindowModel;
  /** The point the ranking and the Table row use; for "all" that is the highest effort. */
  readonly point: EffortPoint;
}

/** Models with a number for the metric, best first. */
export function rankModels(
  models: ReadonlyArray<WindowModel>,
  mode: EffortMode,
  metric: WindowMetric,
): ReadonlyArray<RankedModel> {
  const sign = metric.higherIsBetter ? 1 : -1;
  return models
    .flatMap((model) => {
      const point = pointsFor(model, mode === "all" ? "highest" : mode, metric.key)[0];
      return point ? [{ model, point }] : [];
    })
    .toSorted(
      (a, b) => sign * ((valueAt(b.point, metric.key) ?? 0) - (valueAt(a.point, metric.key) ?? 0)),
    );
}

/**
 * The points no other point beats on both axes: the dotted Pareto line. A better x is lower for cost
 * and price and higher for speed.
 */
export function paretoFront<T extends { readonly x: number; readonly y: number }>(
  points: ReadonlyArray<T>,
  xHigherIsBetter: boolean,
): ReadonlyArray<T> {
  const sorted = points.toSorted((a, b) => (xHigherIsBetter ? b.x - a.x : a.x - b.x) || b.y - a.y);
  const front: T[] = [];
  let best = -Infinity;
  for (const point of sorted) {
    if (point.y > best) {
      front.push(point);
      best = point.y;
    }
  }
  return front;
}

export interface EffortTile {
  readonly effort: string;
  /** `null`: the source has no run at this effort. The tile says "N/A". */
  readonly point: EffortPoint | null;
}

/** One tile per effort the model offers or the source measured. Never fills a gap from another effort. */
export function effortTiles(
  model: WindowModel,
  offered: ReadonlyArray<string>,
): ReadonlyArray<EffortTile> {
  const efforts = [...new Set([...model.points.map((point) => point.effort), ...offered])];
  return efforts
    .toSorted((a, b) => effortRank(a) - effortRank(b))
    .map((effort) => ({
      effort,
      point: model.points.find((point) => point.effort === effort) ?? null,
    }));
}

/** What the Table shows next to the score. Cost per task exists only in Artificial Analysis. */
export const TABLE_METRICS: Readonly<Record<WindowSource, ReadonlyArray<WindowMetric>>> = {
  artificialAnalysis: [
    COST_PER_TASK,
    { ...SPEED("aa:speed"), label: "Speed" },
    { key: "aa:price:input", label: "In /1M", format: "usdMtok", higherIsBetter: false },
    { ...PRICE_OUT("aa:price:output"), label: "Out /1M" },
  ],
  benchLm: [
    { ...SPEED("benchLm:speed"), label: "Speed" },
    { key: "benchLm:price:input", label: "In /1M", format: "usdMtok", higherIsBetter: false },
    { ...PRICE_OUT("benchLm:price:output"), label: "Out /1M" },
  ],
};

/** The color of a creator's dots and bars. Creators with no color of their own share a neutral gray. */
export function creatorColor(creator: string | undefined): string {
  switch (creator?.toLowerCase()) {
    case "anthropic":
      return "var(--color-chart-anthropic)";
    case "openai":
      return "var(--color-chart-openai)";
    case "google":
      return "var(--color-chart-google)";
    default:
      return "var(--color-muted-foreground)";
  }
}

/** Short effort names for chart tags and bar captions. */
export const EFFORT_SHORT: Readonly<Record<string, string>> = {
  default: "None",
  minimal: "Min",
  low: "Low",
  medium: "Med",
  high: "High",
  xhigh: "X-High",
  ultra: "Ultra",
  max: "Max",
};

interface CandidateLike {
  readonly query: {
    readonly modelId: string;
    readonly displayName?: string | undefined;
    readonly effort?: string | undefined;
  };
}

/**
 * The runnable choices that are this model, matched by name. A source may have no row for an effort the
 * provider offers (an X-High run nobody measured), so rows alone cannot say what the user can run.
 */
export function candidatesOfModel<T extends CandidateLike>(
  model: WindowModel,
  candidates: ReadonlyArray<T>,
): ReadonlyArray<T> {
  return candidates.filter(
    (candidate) =>
      canonicalModelKey(candidate.query.displayName ?? candidate.query.modelId) === model.key ||
      canonicalModelKey(candidate.query.modelId) === model.key,
  );
}

/** The effort levels this model's provider offers. */
export function offeredEfforts(
  model: WindowModel,
  candidates: ReadonlyArray<CandidateLike>,
): ReadonlyArray<string> {
  return [
    ...new Set(
      candidatesOfModel(model, candidates).flatMap((candidate) =>
        candidate.query.effort ? [candidate.query.effort] : [],
      ),
    ),
  ];
}

/** The numbers of the detail panel: one effort of one model. */
export const DETAIL_METRICS: Readonly<Record<WindowSource, ReadonlyArray<WindowMetric>>> = {
  artificialAnalysis: [
    ...SCORE_METRICS.artificialAnalysis,
    COST_PER_TASK,
    { key: "aa:first-answer", label: "First answer", format: "seconds", higherIsBetter: false },
    SPEED("aa:speed"),
  ],
  benchLm: [...SCORE_METRICS.benchLm, SPEED("benchLm:speed")],
};
