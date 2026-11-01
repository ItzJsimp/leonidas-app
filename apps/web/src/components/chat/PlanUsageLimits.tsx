import type { ReactNode } from "react";

import { type UsageSeverity, usageSeverity, usedPercentLabel } from "../../lib/usageLimitsPopover";
import { cn } from "../../lib/utils";

/** Bar fill by severity: blue while half or more is left, amber under 50% left, red under 10%. */
const SEVERITY_FILL: Record<UsageSeverity, string> = {
  normal: "bg-info",
  warning: "bg-warning",
  critical: "bg-destructive",
};
const SEVERITY_STROKE: Record<UsageSeverity, string> = {
  normal: "stroke-info",
  warning: "stroke-warning",
  critical: "stroke-destructive",
};

/**
 * A quota bar coloured by severity. It drains: the fill is what is left, so a nearly spent
 * window is a small sliver. `fill="used"` fills with consumption instead (the context window).
 * Optional `elapsedMarkerPercent` draws a subtle vertical tick on the bar track (like Reference 1).
 */
export function UsageBar({
  usedPercent,
  label,
  className,
  fill = "left",
  elapsedMarkerPercent = null,
}: {
  readonly usedPercent: number;
  readonly label: string;
  readonly className?: string;
  readonly fill?: "left" | "used";
  readonly elapsedMarkerPercent?: number | null | undefined;
}) {
  const used = usedPercentLabel(usedPercent);
  const shown = fill === "left" ? 100 - used : used;
  const marker =
    elapsedMarkerPercent !== null &&
    elapsedMarkerPercent !== undefined &&
    Number.isFinite(elapsedMarkerPercent)
      ? Math.max(2, Math.min(98, Math.round(elapsedMarkerPercent)))
      : null;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={shown}
      className={cn("relative h-1.5 w-full overflow-hidden rounded-full bg-muted", className)}
    >
      {shown > 0 ? (
        <div
          className={cn("h-full min-w-1 rounded-full", SEVERITY_FILL[usageSeverity(used)])}
          style={{ width: `${shown}%` }}
        />
      ) : null}
      {marker !== null ? (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 w-px -translate-x-1/2 bg-foreground/35"
          style={{ left: `${marker}%` }}
        />
      ) : null}
    </div>
  );
}

/** A circular quota gauge (drains like `UsageBar`); children sit in its centre. A static SVG. */
export function UsageRing({
  percent,
  size,
  strokeWidth,
  severity,
  className,
  children,
  fill: fillMode = "left",
}: {
  readonly fill?: "left" | "used";
  readonly percent: number | null;
  readonly size: number;
  readonly strokeWidth: number;
  readonly severity: UsageSeverity;
  readonly className?: string;
  readonly children?: ReactNode;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const used = percent === null ? null : Math.max(0, Math.min(100, percent));
  const fill = used === null ? 0 : fillMode === "left" ? 100 - used : used;
  const circle = {
    cx: size / 2,
    cy: size / 2,
    r: radius,
    fill: "none",
    strokeWidth,
  } as const;
  return (
    <span
      className={cn("relative inline-grid shrink-0 place-items-center", className)}
      style={{ width: size, height: size }}
    >
      <svg
        aria-hidden
        width={size}
        height={size}
        className="absolute inset-0 mx-0! size-full -rotate-90"
      >
        <circle {...circle} className="stroke-muted" />
        {fill > 0 ? (
          <circle
            {...circle}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - fill / 100)}
            className={SEVERITY_STROKE[severity]}
          />
        ) : null}
      </svg>
      {children}
    </span>
  );
}
