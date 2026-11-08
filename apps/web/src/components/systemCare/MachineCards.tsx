import type { HardwareLimit } from "@t3tools/contracts";
import type { ReactNode } from "react";

import { cn } from "~/lib/utils";
import { Card, Gauge, LEVEL_TEXT, LimitBar, Stepper, Trend, type Level } from "./SystemCareCharts";

/** A friendly top for a chart axis: 100 for percentages, a rounded-up value otherwise. */
export function chartMax(unit: string, values: ReadonlyArray<number | null>): number {
  if (unit === "%") return 100;
  const peak = Math.max(1, ...values.filter((value): value is number => value !== null));
  const magnitude = 10 ** Math.floor(Math.log10(peak));
  return Math.ceil((peak * 1.15) / magnitude) * magnitude;
}

/** Joins readings with a dot and skips the ones with no value. */
export const readings = (...values: ReadonlyArray<string>) =>
  values.filter((value) => value !== "-").join(" · ");

export function SummaryCard(props: {
  label: string;
  value: string;
  detail: string;
  error?: boolean;
}) {
  return (
    <Card className="p-4">
      <div className="text-xs text-muted-foreground">{props.label}</div>
      <div
        className={cn(
          "mt-1 text-2xl font-semibold tabular-nums",
          props.error && "text-error-foreground",
        )}
      >
        {props.value}
      </div>
      <div className="mt-0.5 truncate text-xs text-muted-foreground">{props.detail}</div>
    </Card>
  );
}

export function GaugeCard(props: {
  title: string;
  value: number | null;
  level: Level;
  lines: ReadonlyArray<string>;
  trend: ReadonlyArray<number | null>;
  extra?: ReactNode;
}) {
  return (
    <Card>
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {props.title}
      </div>
      <div className="mt-3 flex items-center gap-4">
        <Gauge value={props.value} level={props.level}>
          <span
            className={cn(
              "text-2xl font-semibold tabular-nums",
              props.level !== "ok" && LEVEL_TEXT[props.level],
            )}
          >
            {props.value === null ? "-" : `${Math.round(props.value)}%`}
          </span>
        </Gauge>
        <ul className="min-w-0 flex-1 space-y-1 text-sm text-muted-foreground">
          {props.lines.map((line) => (
            <li key={line} className="truncate">
              {line}
            </li>
          ))}
        </ul>
      </div>
      <div className="mt-3">
        <Trend values={props.trend} level={props.level} />
      </div>
      {props.extra ? <div className="mt-3">{props.extra}</div> : null}
    </Card>
  );
}

export function LimitRow(props: {
  limit: HardwareLimit;
  current: number | null;
  onSave: (warn: number | null, critical: number | null) => void;
}) {
  const { limit } = props;
  return (
    <li className="grid grid-cols-1 items-center gap-x-4 gap-y-2 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(8rem,14rem)_auto]">
      <div className="min-w-0">
        <div className="truncate text-sm font-medium">{limit.label}</div>
        <div className="text-xs text-muted-foreground">
          {limit.source === "user"
            ? "Your setting"
            : limit.source === "spec"
              ? "From the part's own rating"
              : "Standard setting"}
          {limit.source === "user" ? (
            <button
              type="button"
              className="ml-2 underline underline-offset-2 hover:text-foreground"
              onClick={() => props.onSave(null, null)}
            >
              Reset
            </button>
          ) : null}
        </div>
      </div>
      <LimitBar
        warn={limit.warn}
        critical={limit.critical}
        unit={limit.unit}
        current={props.current}
      />
      <div className="flex items-center gap-2">
        <Stepper
          label="Warn"
          tone="warning"
          unit={limit.unit}
          value={limit.warn}
          onChange={(next) => props.onSave(Math.min(next, limit.critical - 1), limit.critical)}
        />
        <Stepper
          label="Critical"
          tone="critical"
          unit={limit.unit}
          value={limit.critical}
          onChange={(next) => props.onSave(limit.warn, Math.max(next, limit.warn + 1))}
        />
      </div>
    </li>
  );
}
