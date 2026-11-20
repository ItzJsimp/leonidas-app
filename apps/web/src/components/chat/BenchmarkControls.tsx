import type { ReactNode } from "react";

import type { BenchmarkQuota } from "../../lib/modelBenchmarks";
import { cn } from "~/lib/utils";
import { formatRelativeTimeLabel } from "../../timestampFormat";

export function quotaText(quota: BenchmarkQuota): string {
  if (quota.kind === "metered") return "pay as you use";
  if (quota.kind === "unknown") return "usage unknown";
  if (quota.leftPercent > 0) return `${100 - quota.leftPercent}% used`;
  return quota.resetsAt ? `out until ${formatRelativeTimeLabel(quota.resetsAt)}` : "out of usage";
}

export function Segmented<T extends string>(props: {
  label: string;
  value: T;
  options: ReadonlyArray<{ readonly id: T; readonly label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={props.label} className="flex items-center gap-1.5 text-xs">
      <span className="text-muted-foreground">{props.label}</span>
      <div className="inline-flex rounded-md bg-muted p-0.5">
        {props.options.map((option) => (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={option.id === props.value}
            onClick={() => props.onChange(option.id)}
            className={cn(
              "rounded px-2.5 py-1 transition-colors focus-visible:outline-2 focus-visible:outline-ring",
              option.id === props.value
                ? "bg-background font-medium text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function InsightCard(props: { children: ReactNode }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3 rounded-lg border border-border/70 bg-card px-4 py-3">
      {props.children}
    </div>
  );
}
