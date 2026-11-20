import { memo } from "react";

import type { UsageSeverity } from "../../lib/usageLimitsPopover";

const RING_STROKE: Record<UsageSeverity, string> = {
  normal: "stroke-info",
  warning: "stroke-warning",
  critical: "stroke-destructive",
};

/**
 * Ring on a provider rail tile: the arc is the quota left in the account's tightest window,
 * blue while half or more is left, amber under half, red under 10%. Place inside a `relative`
 * square. Screen readers get the numbers from the tile's label.
 */
export const AccountHeadroomRing = memo(function AccountHeadroomRing(props: {
  readonly leftPercent: number;
  readonly severity: UsageSeverity;
}) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 100 100"
      className="pointer-events-none absolute inset-0 z-20 size-full"
    >
      <rect
        x="1.5"
        y="1.5"
        width="97"
        height="97"
        rx="14"
        pathLength={100}
        fill="none"
        strokeWidth={3}
        strokeLinecap="round"
        strokeDasharray={`${props.leftPercent} 100`}
        className={RING_STROKE[props.severity]}
      />
    </svg>
  );
});
