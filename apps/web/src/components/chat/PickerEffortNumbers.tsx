import { InfoIcon } from "lucide-react";

import { cn } from "~/lib/utils";
import { dollars, formatCostPerTask, type PickerEffortStats } from "../../lib/pickerModelStats";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

/** One grid for the header and every row, so the numbers form clean columns. */
const COLUMNS = "grid grid-cols-[2.5rem_3.5rem_2.25rem_2.5rem_minmax(0,1fr)] gap-x-1";

const HEADERS = [
  ["Score", "Artificial Analysis Intelligence Index"],
  ["Speed", "Output speed in tokens per second"],
  ["In /1M", "Input price per 1 million tokens"],
  ["Out /1M", "Output price per 1 million tokens"],
  ["Cost", "Cost to run one Artificial Analysis task"],
] as const;

const NONE = "-";

/** Column names above the effort rows. */
export function EffortNumbersHeader() {
  return (
    <div className={cn(COLUMNS, "px-3.5 pb-0.5 text-3xs text-muted-foreground")}>
      {HEADERS.map(([label, hint]) => (
        <Tooltip key={label}>
          <TooltipTrigger render={<span className="truncate" />}>{label}</TooltipTrigger>
          <TooltipPopup side="top">{hint}</TooltipPopup>
        </Tooltip>
      ))}
    </div>
  );
}

/** Shown in place of numbers when the source has no run at this effort. */
function NotBenchmarked() {
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

/** The five numbers for one effort, with a thin score bar. `null` means this effort was not measured. */
export function EffortNumbers(props: { stats: PickerEffortStats | null; selected: boolean }) {
  const { stats, selected } = props;
  if (stats === null) return <NotBenchmarked />;
  const score = stats.intelligence;
  const cells = [
    score === null ? NONE : score.toFixed(1),
    stats.tokensPerSecond === null ? NONE : `${Math.round(stats.tokensPerSecond)} t/s`,
    stats.inputPrice === null ? NONE : dollars(stats.inputPrice),
    stats.outputPrice === null ? NONE : dollars(stats.outputPrice),
    stats.costPerTask === null ? NONE : formatCostPerTask(stats.costPerTask),
  ];
  return (
    <div className="grid gap-0.5">
      <div className={cn(COLUMNS, "text-xs tabular-nums text-muted-foreground")}>
        {cells.map((cell, index) => (
          <span
            key={HEADERS[index]![0]}
            className={cn(index === 0 && "font-medium text-foreground")}
          >
            {cell}
          </span>
        ))}
      </div>
      {score === null ? null : (
        <span className="h-0.5 w-10 overflow-hidden rounded-full bg-muted-foreground/25">
          <span
            className={cn(
              "block h-full rounded-full",
              selected ? "bg-state" : "bg-muted-foreground/60",
            )}
            style={{ width: `${Math.min(100, Math.max(0, score))}%` }}
          />
        </span>
      )}
    </div>
  );
}
