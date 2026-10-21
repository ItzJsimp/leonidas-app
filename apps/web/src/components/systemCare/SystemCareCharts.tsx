import type { ReactNode } from "react";
import { AlertTriangleIcon, MinusIcon, PlusIcon } from "lucide-react";

import { cn } from "~/lib/utils";
import { limitScaleMax, sparklinePoints, stepLimit } from "./systemCare.logic";

export type Level = "ok" | "warning" | "critical";

export const LEVEL_TEXT: Record<Level, string> = {
  ok: "text-primary",
  warning: "text-warning",
  critical: "text-destructive",
};
const LEVEL_BG: Record<Level, string> = {
  ok: "bg-primary",
  warning: "bg-warning",
  critical: "bg-destructive",
};

export const worstLevel = (...levels: ReadonlyArray<Level>): Level =>
  levels.includes("critical") ? "critical" : levels.includes("warning") ? "warning" : "ok";

export function Card(props: {
  title?: string;
  hint?: ReactNode;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn("rounded-2xl border bg-card p-5 shadow-xs/5", props.className)}>
      {props.title ? (
        <header className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1">
          <h2 className="text-sm font-semibold tracking-tight">{props.title}</h2>
          {props.hint ? <p className="text-xs text-muted-foreground">{props.hint}</p> : null}
          <div className="ml-auto">{props.action}</div>
        </header>
      ) : null}
      {props.children}
    </section>
  );
}

/** An inline error or warning line inside a card. */
export function ErrorNote(props: {
  children: ReactNode;
  tone?: "critical" | "warning";
  className?: string;
}) {
  return (
    <p
      role="alert"
      className={cn(
        "flex items-start gap-2 rounded-xl px-3 py-2 text-sm",
        props.tone === "warning"
          ? "bg-warning/10 text-warning-foreground"
          : "bg-destructive/10 text-destructive",
        props.className,
      )}
    >
      <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" />
      <span>{props.children}</span>
    </p>
  );
}

/** One labelled reading: muted label, large tabular value, optional detail line. */
export function Stat(props: {
  label: string;
  value: string;
  detail?: string | undefined;
  level?: Level | undefined;
}) {
  return (
    <div className="min-w-0">
      <div className="truncate text-xs text-muted-foreground">{props.label}</div>
      <div
        className={cn(
          "mt-1 truncate text-2xl font-semibold tabular-nums",
          props.level && props.level !== "ok" ? LEVEL_TEXT[props.level] : undefined,
        )}
      >
        {props.value}
      </div>
      {props.detail ? (
        <div className="mt-0.5 truncate text-xs text-muted-foreground">{props.detail}</div>
      ) : null}
    </div>
  );
}

/** A ring that fills to `value` out of 100; the centre carries the big reading. */
export function Gauge(props: { value: number | null; level: Level; children: ReactNode }) {
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const fill = props.value === null ? 0 : Math.min(100, Math.max(0, props.value)) / 100;
  return (
    <div className="relative size-28 shrink-0">
      <svg viewBox="0 0 100 100" className="size-full -rotate-90">
        <circle cx="50" cy="50" r={radius} fill="none" strokeWidth="9" className="stroke-muted" />
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={`${fill * circumference} ${circumference}`}
          className={cn(
            "transition-[stroke-dasharray] duration-700 ease-out motion-reduce:transition-none",
            props.level === "ok"
              ? "stroke-primary"
              : props.level === "warning"
                ? "stroke-warning"
                : "stroke-destructive",
          )}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-center">
        {props.children}
      </div>
    </div>
  );
}

export function Trend(props: { values: ReadonlyArray<number | null>; level: Level }) {
  const points = sparklinePoints(props.values, { min: 0, max: 100, height: 24 });
  if (!points) return <div className="h-6" />;
  return (
    <svg
      viewBox="0 0 100 24"
      preserveAspectRatio="none"
      className={cn("h-6 w-full", LEVEL_TEXT[props.level])}
      aria-hidden="true"
    >
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/** Segmented control: one choice from a short list. */
export function Segmented<T extends string>(props: {
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={props.label}
      className="inline-flex rounded-lg bg-muted p-0.5 text-xs"
    >
      {props.options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === props.value}
          onClick={() => props.onChange(option.value)}
          className={cn(
            "rounded-md px-2.5 py-1 font-medium transition-colors motion-reduce:transition-none",
            option.value === props.value
              ? "bg-background text-foreground shadow-xs/10"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Chip(props: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={props.active}
      onClick={props.onClick}
      className={cn(
        "rounded-full border px-3 py-1 text-xs font-medium transition-colors motion-reduce:transition-none",
        props.active
          ? "border-primary/40 bg-primary/10 text-primary"
          : "border-transparent bg-muted text-muted-foreground hover:text-foreground",
      )}
    >
      {props.children}
    </button>
  );
}

/** Filled line chart with a baseline, three guide lines and optional dashed limit lines. */
export function AreaChart(props: {
  values: ReadonlyArray<number | null>;
  max: number;
  format: (value: number) => string;
  startLabel: string;
  marks?: ReadonlyArray<{ value: number; level: Level }>;
}) {
  const width = 100;
  const height = 40;
  const line = sparklinePoints(props.values, { min: 0, max: props.max, height });
  const area = line ? `0,${height} ${line} ${width},${height}` : "";
  const y = (value: number) =>
    height - (Math.min(props.max, Math.max(0, value)) / props.max) * height;
  return (
    <div>
      <div className="flex gap-3">
        <div className="flex h-44 w-12 flex-col justify-between text-right text-[11px] tabular-nums text-muted-foreground">
          <span>{props.format(props.max)}</span>
          <span>{props.format(props.max / 2)}</span>
          <span>{props.format(0)}</span>
        </div>
        <div className="relative h-44 min-w-0 flex-1 overflow-hidden rounded-lg bg-muted/40">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            preserveAspectRatio="none"
            className="size-full text-primary"
            role="img"
            aria-label="History chart"
          >
            <defs>
              <linearGradient id="system-care-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="currentColor" stopOpacity="0.28" />
                <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
              </linearGradient>
            </defs>
            {[0.25, 0.5, 0.75].map((fraction) => (
              <line
                key={fraction}
                x1="0"
                x2={width}
                y1={height * fraction}
                y2={height * fraction}
                className="stroke-border"
                strokeWidth="0.5"
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {props.marks?.map((mark) =>
              mark.value <= props.max ? (
                <line
                  key={`${mark.level}-${mark.value}`}
                  x1="0"
                  x2={width}
                  y1={y(mark.value)}
                  y2={y(mark.value)}
                  className={mark.level === "critical" ? "stroke-destructive" : "stroke-warning"}
                  strokeWidth="1"
                  strokeDasharray="3 3"
                  vectorEffect="non-scaling-stroke"
                />
              ) : null,
            )}
            {area ? <polygon points={area} fill="url(#system-care-fill)" /> : null}
            {line ? (
              <polyline
                points={line}
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            ) : null}
          </svg>
          {!line ? (
            <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
              Not enough data yet
            </div>
          ) : null}
        </div>
      </div>
      <div className="mt-1 flex justify-between pl-15 text-[11px] text-muted-foreground">
        <span>{props.startLabel}</span>
        <span>Now</span>
      </div>
    </div>
  );
}

function StepperButton(props: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={props.label}
      onClick={props.onClick}
      className="flex size-6 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-background hover:text-foreground motion-reduce:transition-none"
    >
      {props.children}
    </button>
  );
}

/** Minus / value / plus pill; the value is read-only so nobody types a bad number. */
export function Stepper(props: {
  label: string;
  value: number;
  unit: string;
  tone: "warning" | "critical";
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex items-center gap-1 rounded-full bg-muted p-0.5">
      <StepperButton
        label={`Lower ${props.label}`}
        onClick={() => props.onChange(stepLimit(props.value, -1, props.unit))}
      >
        <MinusIcon className="size-3.5" />
      </StepperButton>
      <div className="min-w-[4.5rem] text-center leading-tight">
        <div
          className={cn(
            "text-[10px] font-medium uppercase tracking-wide",
            props.tone === "warning" ? "text-warning" : "text-destructive",
          )}
        >
          {props.label}
        </div>
        <div className="text-sm font-semibold tabular-nums">
          {props.value}
          {props.unit === "%" ? "%" : " °C"}
        </div>
      </div>
      <StepperButton
        label={`Raise ${props.label}`}
        onClick={() => props.onChange(stepLimit(props.value, 1, props.unit))}
      >
        <PlusIcon className="size-3.5" />
      </StepperButton>
    </div>
  );
}

/** A scale from 0 to the top value with the warn and critical thresholds shaded in. */
export function LimitBar(props: {
  warn: number;
  critical: number;
  unit: string;
  current?: number | null;
}) {
  const top = limitScaleMax({ critical: props.critical, unit: props.unit });
  const warnAt = Math.min(100, (props.warn / top) * 100);
  const criticalAt = Math.min(100, (props.critical / top) * 100);
  const currentAt =
    props.current === null || props.current === undefined
      ? null
      : Math.min(100, Math.max(0, (props.current / top) * 100));
  return (
    <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted">
      <div
        className={cn("absolute inset-y-0 left-0 opacity-30", LEVEL_BG.ok)}
        style={{ width: `${warnAt}%` }}
      />
      <div
        className={cn("absolute inset-y-0 opacity-60", LEVEL_BG.warning)}
        style={{ left: `${warnAt}%`, width: `${Math.max(0, criticalAt - warnAt)}%` }}
      />
      <div
        className={cn("absolute inset-y-0 right-0 opacity-70", LEVEL_BG.critical)}
        style={{ left: `${criticalAt}%` }}
      />
      {currentAt !== null ? (
        <div
          className="absolute -inset-y-0.5 w-0.5 rounded-full bg-foreground"
          style={{ left: `${currentAt}%` }}
        />
      ) : null}
    </div>
  );
}
