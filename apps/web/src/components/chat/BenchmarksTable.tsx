import { ChevronRightIcon, InfoIcon } from "lucide-react";
import { useState } from "react";

import {
  TABLE_METRICS,
  effortTiles,
  formatMetricValue,
  valueAt,
  type EffortPoint,
  type RankedModel,
  type WindowMetric,
  type WindowModel,
  type WindowSource,
} from "../../lib/benchmarkWindow";
import { cn } from "~/lib/utils";
import { CreatorMark, effortName } from "./BenchmarkDetail";

const NONE = "-";

function ScoreBar(props: { value: number }) {
  return (
    <span className="h-1 w-full overflow-hidden rounded-full bg-muted-foreground/20" aria-hidden>
      <span
        className="block h-full rounded-full bg-state"
        style={{ width: `${Math.min(100, Math.max(0, props.value))}%` }}
      />
    </span>
  );
}

/**
 * Every model, best first, with the numbers of its highest effort. A row opens to show each effort
 * on its own line; an effort the model offers but no source measured says "Not benchmarked".
 */
export function BenchmarksTable(props: {
  source: WindowSource;
  ranked: ReadonlyArray<RankedModel>;
  score: WindowMetric;
  runnable: (model: WindowModel) => boolean;
  offered: (model: WindowModel) => ReadonlyArray<string>;
  /** "17 · 63%" for the model's own runs, or null. */
  runs: (point: EffortPoint) => string | null;
}) {
  const { source, score } = props;
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const columns = TABLE_METRICS[source];
  const template = `1rem 1.5rem minmax(11rem,1.7fr) 7.5rem minmax(6.5rem,1fr) repeat(${columns.length},minmax(3.25rem,0.55fr)) 5rem`;
  const toggle = (key: string) =>
    setOpen((current) => {
      const next = new Set(current);
      if (!next.delete(key)) next.add(key);
      return next;
    });

  const numberCells = (point: EffortPoint) =>
    columns.map((metric) => {
      const value = valueAt(point, metric.key);
      return (
        <span key={metric.key} className="text-right tabular-nums text-muted-foreground">
          {value === undefined ? NONE : formatMetricValue(metric, value)}
        </span>
      );
    });

  return (
    <div role="table" aria-label="Model benchmarks" className="min-w-[44rem] text-sm">
      <div
        role="row"
        className="sticky top-0 z-10 grid items-center gap-x-3 border-b border-border/70 bg-popover px-4 py-2 text-xs text-muted-foreground"
        style={{ gridTemplateColumns: template }}
      >
        <span />
        <span role="columnheader">#</span>
        <span role="columnheader">Model</span>
        <span role="columnheader">Effort</span>
        <span role="columnheader">{score.label}</span>
        {columns.map((metric) => (
          <span key={metric.key} role="columnheader" className="text-right">
            {metric.label}
          </span>
        ))}
        <span role="columnheader" className="text-right">
          Your runs
        </span>
      </div>
      {props.ranked.map(({ model, point }, index) => {
        const expandable = model.points.length > 1;
        const expanded = open.has(model.key);
        const value = valueAt(point, score.key) ?? 0;
        const runs = props.runs(point);
        return (
          <div key={model.key} role="rowgroup">
            <button
              type="button"
              role="row"
              aria-expanded={expandable ? expanded : undefined}
              disabled={!expandable}
              onClick={() => toggle(model.key)}
              className="grid min-h-11 w-full items-center gap-x-3 border-b border-border/40 px-4 py-2 text-left transition-colors enabled:hover:bg-accent/50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
              style={{ gridTemplateColumns: template }}
            >
              <ChevronRightIcon
                className={cn(
                  "size-3.5 text-muted-foreground transition-transform",
                  expanded && "rotate-90",
                  !expandable && "invisible",
                )}
                aria-hidden="true"
              />
              <span className="text-xs tabular-nums text-muted-foreground">{index + 1}</span>
              <span className="flex min-w-0 items-center gap-2 font-medium">
                <CreatorMark creator={model.creator} />
                <span className="truncate">{model.name}</span>
                {props.runnable(model) ? (
                  <span
                    className="size-1.5 shrink-0 rounded-full bg-state"
                    role="img"
                    aria-label="You can run this model"
                  />
                ) : null}
              </span>
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="rounded border border-border px-1.5 py-px font-medium text-foreground">
                  {effortName(point.effort)}
                </span>
                {expandable ? <span>{model.points.length} efforts</span> : null}
              </span>
              <span className="grid gap-1">
                <b className="font-semibold tabular-nums">{value.toFixed(1)}</b>
                <ScoreBar value={value} />
              </span>
              {numberCells(point)}
              <span className="text-right tabular-nums text-muted-foreground">{runs ?? NONE}</span>
            </button>
            {expanded
              ? effortTiles(model, props.offered(model)).map((tile) => (
                  <div
                    key={tile.effort}
                    role="row"
                    className="grid min-h-9 items-center gap-x-3 border-b border-border/40 bg-muted/30 px-4 py-1.5 text-muted-foreground"
                    style={{ gridTemplateColumns: template }}
                  >
                    <span />
                    <span />
                    <span className="flex min-w-0 items-center gap-2">
                      <CreatorMark creator={model.creator} />
                      <span className="truncate">{model.name}</span>
                    </span>
                    <span>
                      <span className="rounded border border-border px-1.5 py-px text-xs font-medium text-foreground">
                        {effortName(tile.effort)}
                      </span>
                    </span>
                    {tile.point ? (
                      <>
                        <span className="grid gap-1">
                          <b className="font-semibold tabular-nums text-foreground">
                            {(valueAt(tile.point, score.key) ?? 0).toFixed(1)}
                          </b>
                          <ScoreBar value={valueAt(tile.point, score.key) ?? 0} />
                        </span>
                        {numberCells(tile.point)}
                        <span className="text-right">{NONE}</span>
                      </>
                    ) : (
                      <span
                        className="inline-flex w-fit items-center gap-1 rounded border border-dashed border-border px-2 py-0.5 text-xs"
                        style={{ gridColumn: `5 / span ${columns.length + 2}` }}
                      >
                        <InfoIcon className="size-3" aria-hidden="true" />
                        Not benchmarked
                      </span>
                    )}
                  </div>
                ))
              : null}
          </div>
        );
      })}
    </div>
  );
}
