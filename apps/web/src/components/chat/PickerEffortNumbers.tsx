import { InfoIcon } from "lucide-react";

import { dollars, formatCostPerTask, type PickerEffortStats } from "../../lib/pickerModelStats";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

const NONE = "-";

/** Shown on an effort row when the source has no run at this effort. Measured rows show nothing. */
export function EffortNumbers(props: { stats: PickerEffortStats | null }) {
  if (props.stats !== null) return null;
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span className="inline-flex w-fit items-center gap-1 rounded border border-dashed border-border px-1.5 py-0.5 text-3xs text-muted-foreground" />
        }
      >
        <InfoIcon className="size-3 shrink-0" aria-hidden="true" />
        Not benchmarked
      </TooltipTrigger>
      <TooltipPopup side="left">
        No source has measured this effort yet. Leonidas shows no number instead of a wrong one.
      </TooltipPopup>
    </Tooltip>
  );
}

/** The hover card for one effort: score, speed, cost per task, and the price (the same for every effort). */
export function EffortNumbersCard(props: { label: string; stats: PickerEffortStats }) {
  const { label, stats } = props;
  const rows: ReadonlyArray<readonly [string, string]> = [
    ["Score", stats.intelligence === null ? NONE : stats.intelligence.toFixed(1)],
    ["Speed", stats.tokensPerSecond === null ? NONE : `${Math.round(stats.tokensPerSecond)} t/s`],
    ["Cost per task", stats.costPerTask === null ? NONE : formatCostPerTask(stats.costPerTask)],
  ];
  const price =
    stats.inputPrice === null || stats.outputPrice === null
      ? null
      : `${dollars(stats.inputPrice)} in · ${dollars(stats.outputPrice)} out per 1M`;
  return (
    <div className="grid gap-1 text-xs tabular-nums">
      <span className="font-medium">{label}</span>
      {rows.map(([name, value]) => (
        <span key={name} className="flex justify-between gap-4 text-muted-foreground">
          {name}
          <span className="text-foreground">{value}</span>
        </span>
      ))}
      {price === null ? null : <span className="text-muted-foreground">{price}</span>}
    </div>
  );
}
