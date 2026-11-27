import type { ModelSelection } from "@t3tools/contracts";
import { InfoIcon } from "lucide-react";

import {
  DETAIL_METRICS,
  EFFORT_SHORT,
  creatorColor,
  effortTiles,
  formatMetricValue,
  valueAt,
  type WindowMetric,
  type WindowModel,
  type WindowSource,
} from "../../lib/benchmarkWindow";
import { dollars, formatEffortLabel } from "../../lib/pickerModelStats";
import { cn } from "~/lib/utils";
import { Button } from "../ui/button";
import { ClaudeAI, OpenAI } from "../Icons";
import { rovingGroup } from "~/lib/rovingGroup";

/** The maker's logo where the app has one, else a dot in the maker's chart color. */
export function CreatorMark(props: { creator: string | undefined; className?: string }) {
  const name = props.creator?.toLowerCase();
  const className = cn("size-4 shrink-0", props.className);
  if (name === "anthropic") return <ClaudeAI className={className} aria-hidden="true" />;
  if (name === "openai") return <OpenAI className={className} aria-hidden="true" />;
  return (
    <span
      className={cn("my-auto size-2.5 shrink-0 rounded-full", props.className)}
      style={{ background: creatorColor(props.creator) }}
      aria-hidden="true"
    />
  );
}

export const effortName = (effort: string) =>
  effort === "default" ? "No effort" : formatEffortLabel(effort);

/** One model's numbers, effort by effort. A gap says "N/A" and is never filled from another effort. */
export function BenchmarkDetail(props: {
  source: WindowSource;
  model: WindowModel;
  score: WindowMetric;
  /** Position among the ranked models, for the line "#5 of 12". */
  rank: { readonly place: number; readonly of: number } | null;
  offered: ReadonlyArray<string>;
  effort: string;
  onEffort: (effort: string) => void;
  /** A way to start a chat on this model right now; null when the model is not connected. */
  chat: { readonly selection: ModelSelection; readonly name: string } | null;
  onStartChat: ((selection: ModelSelection) => void) | null;
  status: string | null;
}) {
  const { model, score, source } = props;
  const tiles = effortTiles(model, props.offered);
  const active = tiles.find((tile) => tile.effort === props.effort) ?? null;
  const entry = active?.point?.entry ?? null;
  const price = (key: string) => entry?.values[key];
  const priceIn = price(source === "artificialAnalysis" ? "aa:price:input" : "benchLm:price:input");
  const priceOut = price(
    source === "artificialAnalysis" ? "aa:price:output" : "benchLm:price:output",
  );
  const withEffort = tiles.length > 1 || tiles[0]?.effort !== "default";

  return (
    <aside className="flex min-h-0 w-full shrink-0 flex-col gap-4 overflow-y-auto border-t border-border/70 p-5 lg:w-80 lg:border-t-0 lg:border-l">
      <div className="flex items-center gap-3">
        <CreatorMark creator={model.creator} className="size-6" />
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold">{model.name}</h3>
          <p className="truncate text-xs text-muted-foreground">
            {[model.creator, props.status].filter(Boolean).join(" · ")}
          </p>
        </div>
      </div>
      {props.chat && props.onStartChat ? (
        <Button onClick={() => props.onStartChat?.(props.chat!.selection)}>
          New chat with {props.chat.name}
        </Button>
      ) : null}
      {props.rank ? (
        <p className="text-sm text-muted-foreground">
          <b className="font-semibold text-foreground">#{props.rank.place}</b> of {props.rank.of}{" "}
          models for {score.label}, at its highest effort
        </p>
      ) : null}
      {withEffort ? (
        <section className="grid gap-2">
          <div className="flex items-baseline justify-between text-xs text-muted-foreground">
            <span>Effort level</span>
            <span>{score.label}</span>
          </div>
          <div
            role="radiogroup"
            ref={rovingGroup}
            aria-label="Effort level"
            className="flex gap-1.5"
          >
            {tiles.map((tile) => {
              const value = tile.point ? valueAt(tile.point, score.key) : undefined;
              const selected = tile.effort === props.effort;
              return (
                <button
                  key={tile.effort}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => props.onEffort(tile.effort)}
                  className={cn(
                    "flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-lg border px-1 py-2 text-xs transition-colors focus-visible:outline-2 focus-visible:outline-ring",
                    selected
                      ? "border-foreground bg-accent text-foreground"
                      : "border-border/70 text-muted-foreground hover:bg-accent/60",
                  )}
                >
                  <span className="max-w-full truncate">
                    {EFFORT_SHORT[tile.effort] ?? formatEffortLabel(tile.effort)}
                  </span>
                  <span
                    className={cn(
                      "text-sm font-semibold tabular-nums",
                      value === undefined ? "font-normal text-muted-foreground" : "text-foreground",
                    )}
                  >
                    {value === undefined ? "N/A" : formatMetricValue(score, value)}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      ) : null}
      {entry ? (
        <section className="grid gap-2">
          <div className="flex items-baseline justify-between gap-2 text-xs text-muted-foreground">
            <span>{withEffort ? `${effortName(props.effort)} effort` : "Scores"}</span>
            {priceIn !== undefined && priceOut !== undefined ? (
              <span>
                In {dollars(priceIn)} · Out {dollars(priceOut)} per 1M tokens
              </span>
            ) : null}
          </div>
          <dl className="grid grid-cols-2 overflow-hidden rounded-lg border border-border/70 [&>div]:border-border/70 [&>div]:p-3 [&>div:nth-child(even)]:border-l [&>div:nth-child(n+3)]:border-t">
            {DETAIL_METRICS[source].map((metric) => {
              const value = entry.values[metric.key];
              return (
                <div key={metric.key}>
                  <dt className="text-xs text-muted-foreground">{metric.label}</dt>
                  <dd
                    className={cn(
                      "text-base font-semibold tabular-nums",
                      value === undefined && "font-normal text-muted-foreground",
                    )}
                  >
                    {value === undefined ? "N/A" : formatMetricValue(metric, value)}
                  </dd>
                </div>
              );
            })}
          </dl>
        </section>
      ) : (
        <div className="flex gap-2 rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
          <InfoIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <div className="grid gap-1">
            <b className="font-medium text-foreground">Not benchmarked</b>
            <span>
              No source has measured {model.name} at {effortName(props.effort)} effort yet. Leonidas
              shows no number instead of a wrong one.
            </span>
          </div>
        </div>
      )}
    </aside>
  );
}
