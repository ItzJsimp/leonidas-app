import { cn } from "~/lib/utils";

import { Tip } from "../twoState/Tip";
import type { DoneDay, SegmentTone } from "./commandCenter.logic";

const TONE_CLASS: Record<SegmentTone, string> = {
  foreground: "bg-foreground",
  muted: "bg-muted-foreground/70",
  info: "bg-info",
  warning: "bg-warning",
};

export const toneClass = (tone: SegmentTone) => TONE_CLASS[tone];

/** A 4 px rounded bar. It turns green only at 100 percent. */
export function ProgressBar({
  percent,
  label,
}: {
  readonly percent: number;
  readonly label: string;
}) {
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      className="h-1 w-full overflow-hidden rounded-full bg-muted-foreground/70"
    >
      <div
        className={cn("h-full rounded-full", percent >= 100 ? "bg-success" : "bg-state")}
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

/** One bar split by status. A 2 px gap of the card color separates the segments. */
export function SegmentBar({
  segments,
  label,
}: {
  readonly segments: ReadonlyArray<{
    readonly label: string;
    readonly value: number;
    readonly percent: number;
    readonly tone: SegmentTone;
  }>;
  readonly label: string;
}) {
  return (
    <div role="img" aria-label={label} className="flex h-1 w-full gap-0.5 overflow-hidden">
      {segments.map((segment) => (
        <Tip key={segment.label} text={`${segment.label}: ${segment.value}`}>
          <span
            className={cn("h-full rounded-full", TONE_CLASS[segment.tone])}
            style={{ width: `${segment.percent}%` }}
          />
        </Tip>
      ))}
    </div>
  );
}

const RING_RADIUS = 20;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

/** The one-value progress ring, 4 px stroke. The text in the middle says the same thing. */
export function Ring({
  percent,
  children,
  label,
}: {
  readonly percent: number;
  readonly children: string;
  readonly label: string;
}) {
  return (
    <div role="img" aria-label={label} className="relative size-12 shrink-0">
      <svg viewBox="0 0 48 48" className="size-full -rotate-90" aria-hidden>
        <circle
          cx="24"
          cy="24"
          r={RING_RADIUS}
          fill="none"
          strokeWidth="4"
          className="stroke-muted-foreground/70"
        />
        <circle
          cx="24"
          cy="24"
          r={RING_RADIUS}
          fill="none"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={RING_LENGTH}
          strokeDashoffset={RING_LENGTH * (1 - percent / 100)}
          className="stroke-state"
        />
      </svg>
      <span className="absolute inset-0 grid place-items-center text-xs font-semibold tabular-nums">
        {children}
      </span>
    </div>
  );
}

const BAR_AREA = 96;
const TASKS_DONE = ["task done", "tasks done"] as const;

/** 14 bars, one per day. Today is the foreground color, the rest are muted. A dashed line marks the average. */
export function DoneBars({
  days,
  average,
  unit = TASKS_DONE,
  height = BAR_AREA,
}: {
  readonly days: ReadonlyArray<DoneDay>;
  readonly average: number;
  /** What one bar counts, singular then plural. */
  readonly unit?: readonly [string, string];
  readonly height?: number;
}) {
  const max = Math.max(1, average, ...days.map((day) => day.count));
  return (
    <div>
      <div role="list" className="relative flex items-end gap-1" style={{ height }}>
        {days.map((day) => (
          <Tip
            key={day.key}
            text={`${day.full}: ${day.count} ${day.count === 1 ? unit[0] : unit[1]}`}
          >
            <div
              role="listitem"
              aria-label={`${day.full}: ${day.count} ${day.count === 1 ? unit[0] : unit[1]}`}
              className="flex h-full min-w-0 flex-1 items-end"
            >
              <div
                className={cn(
                  "w-full rounded-t-sm",
                  day.today ? "bg-foreground" : "bg-muted-foreground/70",
                )}
                style={{ height: Math.max(day.count > 0 ? 3 : 1, (day.count / max) * height) }}
              />
            </div>
          </Tip>
        ))}
        {average > 0 ? (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 border-t border-dashed border-muted-foreground/70"
            style={{ bottom: (average / max) * height }}
          />
        ) : null}
      </div>
      <div aria-hidden className="mt-1 flex gap-1 text-2xs text-muted-foreground tabular-nums">
        {days.map((day) => (
          <span
            key={day.key}
            className={cn(
              "min-w-0 flex-1 text-center",
              day.today && "font-semibold text-foreground",
            )}
          >
            {day.label}
          </span>
        ))}
      </div>
    </div>
  );
}
