import {
  EFFORT_SHORT,
  creatorColor,
  formatMetricValue,
  pointsFor,
  rankModels,
  valueAt,
  type EffortMode,
  type WindowMetric,
  type WindowModel,
} from "../../lib/benchmarkWindow";
import { cn } from "~/lib/utils";
import { CreatorMark } from "./BenchmarkDetail";

/** Enough bars to compare, few enough to read. The Table lists every model. */
const MAX_MODELS = 14;

/**
 * Vertical bars coloured by maker, the value inside each bar, the maker's logo and the model name
 * below. With every effort shown, each model becomes a group of bars, lowest effort first. A ring
 * marks a model you can run.
 */
export function BenchmarksBars(props: {
  models: ReadonlyArray<WindowModel>;
  mode: EffortMode;
  metric: WindowMetric;
  runnable: (model: WindowModel) => boolean;
  selectedKey: string | null;
  onSelect: (key: string) => void;
}) {
  const { metric, mode } = props;
  const ranked = rankModels(props.models, mode, metric);
  const shown = [
    ...ranked.slice(0, MAX_MODELS),
    ...ranked.slice(MAX_MODELS).filter(({ model }) => props.runnable(model)),
  ];
  const groups = shown.map(({ model }) => ({
    model,
    points: pointsFor(model, mode, metric.key),
  }));
  const max = Math.max(
    1,
    ...groups.flatMap((group) => group.points.map((p) => valueAt(p, metric.key) ?? 0)),
  );

  return (
    <div
      className="flex gap-3 overflow-x-auto px-2"
      role="group"
      aria-label={`${metric.label} by model`}
    >
      {groups.map(({ model, points }) => (
        <div key={model.key} className="flex min-w-12 flex-1 flex-col gap-2">
          <button
            type="button"
            onClick={() => props.onSelect(model.key)}
            aria-pressed={props.selectedKey === model.key}
            aria-label={`${model.name}, ${points
              .map(
                (p) =>
                  `${EFFORT_SHORT[p.effort] ?? p.effort} ${formatMetricValue(metric, valueAt(p, metric.key) ?? 0)}`,
              )
              .join(", ")}`}
            className={cn(
              "flex h-64 items-end justify-center gap-0.5 rounded-t-md border-b border-border/70 px-0.5 transition-colors hover:bg-accent/40 focus-visible:outline-2 focus-visible:outline-ring",
              props.selectedKey === model.key && "bg-accent/50",
            )}
          >
            {points.map((point, index) => {
              const value = valueAt(point, metric.key) ?? 0;
              return (
                <span
                  key={point.effort}
                  className={cn(
                    "flex w-full max-w-14 items-start justify-center rounded-t-md pt-1.5 text-2xs font-semibold tabular-nums text-white",
                    props.runnable(model) &&
                      "ring-2 ring-foreground/80 ring-offset-1 ring-offset-popover",
                  )}
                  style={{
                    height: `${(value / max) * 100}%`,
                    background: creatorColor(model.creator),
                    opacity: points.length > 1 ? 0.5 + (0.5 * (index + 1)) / points.length : 1,
                  }}
                >
                  {formatMetricValue(metric, value).replace(" t/s", "")}
                </span>
              );
            })}
          </button>
          <div className="flex flex-col items-center gap-1 text-center" aria-hidden="true">
            <CreatorMark creator={model.creator} />
            <span className="text-2xs leading-tight text-foreground">{model.name}</span>
            <span className="text-3xs text-muted-foreground">
              {mode === "all"
                ? `${points.length} efforts`
                : `(${(EFFORT_SHORT[points[0]?.effort ?? ""] ?? points[0]?.effort ?? "").toLowerCase()})`}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
