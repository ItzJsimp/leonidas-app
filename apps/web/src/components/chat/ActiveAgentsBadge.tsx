import { memo } from "react";

const MAX_ACTIVE_DOTS = 3;

/**
 * Icon overlay for a provider rail: a solid count pill on the top-right corner and
 * one pulsing dot per running agent (capped, then "+N") under the icon. Renders
 * nothing at zero. Place inside a `relative` wrapper.
 */
export const ActiveAgentsOverlay = memo(function ActiveAgentsOverlay(props: { count: number }) {
  if (props.count <= 0) return null;
  const label = `${props.count} active ${props.count === 1 ? "helper" : "helpers"}`;
  const dots = Math.min(props.count, MAX_ACTIVE_DOTS);
  const extra = props.count - dots;
  return (
    <>
      <span
        className="pointer-events-none absolute -top-1 -right-1 z-40 inline-flex h-4 min-w-4 items-center justify-center rounded-full border border-background bg-success px-1 text-3xs font-bold text-white tabular-nums shadow-sm"
        title={label}
        aria-label={label}
      >
        {props.count}
      </span>
      <span
        aria-hidden
        className="pointer-events-none absolute -bottom-1 left-1/2 z-40 flex -translate-x-1/2 items-center gap-0.5"
      >
        {Array.from({ length: dots }, (_, index) => (
          <span key={index} className="size-1 animate-pulse rounded-full bg-success" />
        ))}
        {extra > 0 ? (
          <span className="text-5xs leading-none font-semibold text-success">+{extra}</span>
        ) : null}
      </span>
    </>
  );
});
