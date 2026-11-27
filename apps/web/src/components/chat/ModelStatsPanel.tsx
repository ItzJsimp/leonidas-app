import { useState } from "react";

import { cn } from "~/lib/utils";
import {
  defaultEffortOf,
  formatEffortLabel,
  formatPickerIntelligence,
  formatPickerSpeed,
  type PickerEffortStats,
  type PickerModelStats,
} from "../../lib/pickerModelStats";
import { rovingGroup } from "~/lib/rovingGroup";

const dash = "n/a";
const score = (value: number | null) =>
  value === null ? dash : String(Math.round(value * 10) / 10);
const speed = (value: number | null) => (value === null ? dash : `${Math.round(value)} tokens/s`);
const seconds = (value: number | null) => (value === null ? dash : `${value.toFixed(1)} s`);
const price = (value: number | null) => (value === null ? dash : `$${Number(value.toFixed(2))}`);

function Section(props: { title: string; rows: ReadonlyArray<readonly [string, string]> }) {
  return (
    <div className="grid gap-0.5">
      <div className="text-3xs font-semibold uppercase tracking-wide text-muted-foreground">
        {props.title}
      </div>
      {props.rows.map(([label, value]) => (
        <div key={label} className="flex items-baseline justify-between gap-6">
          <span className="text-muted-foreground">{label}</span>
          <span className={cn("tabular-nums", value === dash && "text-muted-foreground")}>
            {value}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Taps inside the hover card must not select the model row underneath it. */
const stop = (event: { stopPropagation: () => void }) => event.stopPropagation();

/**
 * The hover card for a model's benchmark numbers. With Artificial Analysis data it opens on the
 * default effort and offers a tab per measured effort; otherwise it shows the single BenchLM set.
 */
export function ModelStatsPanel(props: { stats: PickerModelStats }) {
  const { stats } = props;
  const [picked, setPicked] = useState<string | null>(null);
  const efforts = stats.efforts;
  const current: PickerEffortStats | null =
    efforts.find((item) => item.effort === (picked ?? defaultEffortOf(efforts))) ?? null;

  const view = current ?? {
    effort: stats.effort ?? "default",
    intelligence: stats.intelligence,
    coding: stats.coding,
    agentic: stats.agentic,
    tokensPerSecond: stats.tokensPerSecond,
    ttftSeconds: stats.ttftSeconds,
    inputPrice: stats.inputPrice,
    outputPrice: stats.outputPrice,
    costPerTask: stats.costPerTask,
  };
  const fromAa = stats.source === "artificialAnalysis";
  const fallbackIntelligence = formatPickerIntelligence(stats) ?? dash;

  return (
    <div className="grid w-56 gap-2 text-xs" onClick={stop} onPointerDown={stop}>
      {efforts.length > 0 ? (
        <div className="grid gap-1">
          <div
            role="tablist"
            ref={rovingGroup}
            aria-label="Effort level"
            className="flex gap-0.5 rounded-md bg-muted p-0.5"
          >
            {efforts.map((item) => (
              <button
                key={item.effort}
                type="button"
                role="tab"
                aria-selected={item.effort === view.effort}
                className={cn(
                  "min-w-0 flex-1 truncate rounded px-1 py-0.5 text-3xs font-medium text-muted-foreground",
                  item.effort === view.effort && "bg-background text-foreground shadow-xs",
                )}
                onClick={() => setPicked(item.effort)}
              >
                {item.effort === "default" ? "None" : formatEffortLabel(item.effort)}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      <Section
        title="Intelligence"
        rows={[
          [
            fromAa ? "Intelligence Index" : "BenchLM score",
            fromAa ? score(view.intelligence) : fallbackIntelligence,
          ],
          ...(fromAa
            ? ([
                ["Coding Index", score(view.coding)],
                ["Agentic Index", score(view.agentic)],
              ] as const)
            : []),
        ]}
      />
      <Section
        title="Speed"
        rows={[
          ["Output", fromAa ? speed(view.tokensPerSecond) : (formatPickerSpeed(stats) ?? dash)],
          ["First token", seconds(view.ttftSeconds)],
        ]}
      />
      <Section
        title="Price per 1M tokens"
        rows={[
          ["Input", price(view.inputPrice)],
          ["Output", price(view.outputPrice)],
          ...(fromAa ? ([["Cost per task", price(view.costPerTask)]] as const) : []),
        ]}
      />
      <div className="text-3xs text-muted-foreground">
        {fromAa
          ? "Source: Artificial Analysis"
          : "Source: BenchLM. This score is for the max effort run. Add an Artificial Analysis key in Settings, API keys, for each effort."}
      </div>
    </div>
  );
}
