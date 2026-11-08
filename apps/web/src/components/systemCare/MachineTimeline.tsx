import type { HardwareHistoryPoint, HardwareHistoryRange } from "@t3tools/contracts";
import type { ReactNode } from "react";

import { cn } from "~/lib/utils";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { Card, Segmented } from "./SystemCareCharts";
import { historySeries, RANGE_LABEL, sparklinePoints } from "./systemCare.logic";

export type TimelineMark = {
  readonly at: number;
  readonly kind: "alert" | "error" | "test";
  readonly label: string;
};
export type TimelineLane = {
  readonly metric: string;
  readonly label: string;
  readonly detail: string;
};

const RANGE_MS: Record<HardwareHistoryRange, number> = {
  "1h": 3_600_000,
  "24h": 86_400_000,
  "7d": 604_800_000,
  "90d": 7_776_000_000,
};
const RANGE_OPTIONS = (["1h", "24h", "7d", "90d"] as const).map((value) => ({
  value,
  label: value,
}));

const MARK_STYLE: Record<TimelineMark["kind"], string> = {
  alert: "rounded-full bg-warning",
  error: "rounded-[2px] bg-error",
  test: "rounded-full bg-foreground",
};
const MARK_NAME: Record<TimelineMark["kind"], string> = {
  alert: "Alert",
  error: "Leonidas error",
  test: "Speed test",
};

/** Where `at` falls in the window, 0 to 100, or null when it is outside. */
export function markPosition(at: number, now: number, range: HardwareHistoryRange): number | null {
  const start = now - RANGE_MS[range];
  if (!Number.isFinite(at) || at < start || at > now) return null;
  return ((at - start) / RANGE_MS[range]) * 100;
}

function LaneChart(props: { values: ReadonlyArray<number | null> }) {
  const line = sparklinePoints(props.values, { min: 0, max: 100, height: 40 });
  if (!line) return <div className="h-full rounded bg-muted/40" />;
  return (
    <svg
      viewBox="0 0 100 40"
      preserveAspectRatio="none"
      className="size-full text-state"
      aria-hidden="true"
    >
      <polygon points={`0,40 ${line} 100,40`} fill="currentColor" fillOpacity="0.14" />
      <polyline
        points={line}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/** One row per main reading over the chosen window, with alerts, errors and speed tests marked. */
export function MachineTimeline(props: {
  range: HardwareHistoryRange;
  onRange: (range: HardwareHistoryRange) => void;
  points: ReadonlyArray<HardwareHistoryPoint>;
  pending: boolean;
  lanes: ReadonlyArray<TimelineLane>;
  metric: string | null;
  onMetric: (metric: string) => void;
  marks: ReadonlyArray<TimelineMark>;
  now: number;
  children?: ReactNode;
}) {
  const marks = props.marks.flatMap((mark) => {
    const left = markPosition(mark.at, props.now, props.range);
    return left === null ? [] : [{ ...mark, left }];
  });
  const hasHistory = props.points.length >= 2;
  return (
    <Card
      title={`Last ${RANGE_LABEL[props.range]}`}
      hint={
        <span className="flex flex-wrap gap-3">
          {(["alert", "error", "test"] as const).map((kind) => (
            <span key={kind} className="flex items-center gap-1.5">
              <span className={cn("size-2", MARK_STYLE[kind])} />
              {MARK_NAME[kind]}
            </span>
          ))}
        </span>
      }
      action={
        <Segmented
          label="Time window"
          value={props.range}
          options={RANGE_OPTIONS}
          onChange={props.onRange}
        />
      }
    >
      {hasHistory ? (
        <div className="flex flex-col">
          {props.lanes.map((lane) => {
            const selected = lane.metric === props.metric;
            return (
              <button
                key={lane.metric}
                type="button"
                aria-pressed={selected}
                onClick={() => props.onMetric(lane.metric)}
                className={cn(
                  "-mx-2 flex h-14 items-center gap-4 rounded-lg border-t px-2 text-left transition-colors first:border-t-0 hover:bg-muted/40 motion-reduce:transition-none",
                  selected && "bg-muted/50",
                )}
              >
                <span className="w-28 shrink-0 sm:w-36">
                  <span className="block truncate text-sm font-medium">{lane.label}</span>
                  <span className="block truncate text-xs text-muted-foreground tabular-nums">
                    {lane.detail}
                  </span>
                </span>
                <span className="h-10 min-w-0 flex-1">
                  <LaneChart values={historySeries(props.points, lane.metric)} />
                </span>
              </button>
            );
          })}
          <div className="flex items-center gap-4 border-t pt-2">
            <span className="w-28 shrink-0 text-xs text-muted-foreground sm:w-36">Events</span>
            <ul className="relative h-4 min-w-0 flex-1" aria-label="Events in this window">
              {marks.length === 0 ? (
                <li className="text-xs text-muted-foreground">None in this window</li>
              ) : (
                marks.map((mark) => (
                  <li
                    key={`${mark.kind}-${mark.at}-${mark.label}`}
                    style={{ left: `${mark.left}%` }}
                    className="absolute top-0.5 -translate-x-1/2"
                  >
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <button
                            type="button"
                            aria-label={`${MARK_NAME[mark.kind]}: ${mark.label}`}
                            className={cn("block size-2.5", MARK_STYLE[mark.kind])}
                          />
                        }
                      />
                      <TooltipPopup side="top">
                        {MARK_NAME[mark.kind]}: {mark.label}
                      </TooltipPopup>
                    </Tooltip>
                  </li>
                ))
              )}
            </ul>
          </div>
          <div className="flex gap-4 text-2xs text-muted-foreground">
            <span className="w-28 shrink-0 sm:w-36" />
            <span className="flex flex-1 justify-between">
              <span>{RANGE_LABEL[props.range]} ago</span>
              <span>Now</span>
            </span>
          </div>
        </div>
      ) : (
        <p className="rounded-xl bg-muted/50 px-4 py-8 text-center text-sm text-muted-foreground">
          {props.pending ? "Loading history..." : "History fills in as PC Tuning keeps watching."}
        </p>
      )}
      {props.children}
    </Card>
  );
}
