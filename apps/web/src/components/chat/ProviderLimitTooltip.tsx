import type { ServerProvider, ServerProviderUsageWindow } from "@t3tools/contracts";
import { limitsNotice } from "@t3tools/shared/usageLimits";
import { InfoIcon } from "lucide-react";
import { cn } from "~/lib/utils";
import {
  expireElapsedWindow,
  formatResetCountdown,
  groupPlanWindowsByFamily,
  orderPlanWindows,
  percentText,
  planWindowLabel,
  splitFamilyWindowLabel,
} from "../../lib/usageLimitsPopover";
import { UsageBar } from "./PlanUsageLimits";

type Status = "ok" | "pending" | "reached" | "unknown";

const STATUS_DOT: Record<Status, string> = {
  ok: "bg-success",
  pending: "bg-warning",
  reached: "bg-destructive",
  unknown: "bg-muted-foreground/50",
};
const STATUS_TEXT: Record<Status, string> = {
  ok: "Available",
  pending: "Reset pending",
  reached: "Limit reached",
  unknown: "Unknown",
};

const formatAt = (at: number) =>
  new Date(at).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

function WindowUsageItem({
  window: raw,
  label,
  ariaLabel,
  now,
  compactLabel = false,
}: {
  readonly window: ServerProviderUsageWindow;
  readonly label: string;
  readonly ariaLabel?: string;
  readonly now: number;
  readonly compactLabel?: boolean;
}) {
  const window = expireElapsedWindow(raw, now);
  const countdown = formatResetCountdown(window.resetsAt, now, true);
  const resetsAt = window.resetsAt ? Date.parse(window.resetsAt) : Number.NaN;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span
          className={cn(
            "truncate font-medium",
            compactLabel ? "text-2xs text-muted-foreground" : "text-foreground",
          )}
        >
          {label}
        </span>
        <span className="shrink-0 tabular-nums">{percentText(window.usedPercent)}</span>
      </div>
      <UsageBar
        usedPercent={window.usedPercent}
        label={`${ariaLabel ?? label}: ${percentText(window.usedPercent)}`}
        className="h-1"
      />
      {countdown ? (
        <span className="text-2xs tabular-nums text-muted-foreground">
          {countdown === "now" ? "Resets now" : `Resets in ${countdown}`}
          {Number.isFinite(resetsAt) && resetsAt - now >= 86_400_000
            ? ` · ${formatAt(resetsAt)}`
            : ""}
        </span>
      ) : null}
    </div>
  );
}

/** Uses the exact instance snapshot, so another account's quota cannot imply readiness. */
export function ProviderLimitTooltip({
  provider,
  now,
}: {
  readonly provider: ServerProvider;
  readonly now: number;
}) {
  const limits = provider.usageLimits;
  if (!limits) {
    return (
      <span className="text-xs text-muted-foreground">
        The AI service does not show your limit, so we cannot tell how much you have left.
      </span>
    );
  }
  const notice = limitsNotice(limits);
  const windows =
    limits.unavailable?.reason !== "unsupported" ? orderPlanWindows(limits.windows) : [];
  const familyGroups = groupPlanWindowsByFamily(windows);
  const resetPending = windows.some(
    (window) => window.resetsAt && Date.parse(window.resetsAt) <= now,
  );
  const status: Status = notice
    ? "unknown"
    : resetPending
      ? "pending"
      : windows.some((window) => window.usedPercent >= 100)
        ? "reached"
        : "ok";

  return (
    <div className="flex w-64 flex-col gap-2.5">
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0 truncate text-2xs text-muted-foreground">
          {provider.auth.label ?? ""}
        </span>
        <span className="flex shrink-0 items-center gap-1.5 text-2xs font-medium">
          <span aria-hidden className={cn("size-1.5 rounded-full", STATUS_DOT[status])} />
          {STATUS_TEXT[status]}
        </span>
      </div>

      {notice ? (
        <div className="flex items-start gap-1.5 rounded-md bg-warning/10 p-2 text-2xs text-warning-foreground">
          <InfoIcon aria-hidden className="mt-px size-3 shrink-0" />
          <span>{notice}</span>
        </div>
      ) : familyGroups ? (
        <div className="flex flex-col gap-2">
          {familyGroups.map((group, index) => (
            <div
              key={group.family}
              className={cn("flex flex-col gap-1.5", index > 0 && "border-t border-border/50 pt-2")}
            >
              <span className="text-xs font-semibold text-foreground">{group.family}</span>
              {group.windows.map((window) => {
                const period = splitFamilyWindowLabel(window)?.period ?? window.label;
                return (
                  <WindowUsageItem
                    key={window.id}
                    window={window}
                    label={period}
                    ariaLabel={`${group.family} · ${period}`}
                    now={now}
                    compactLabel
                  />
                );
              })}
            </div>
          ))}
        </div>
      ) : (
        windows.map((window) => (
          <WindowUsageItem
            key={window.id}
            window={window}
            label={planWindowLabel(window, windows)}
            now={now}
          />
        ))
      )}

      <span className="border-t border-border/60 pt-1.5 text-2xs text-muted-foreground">
        Checked {formatAt(Date.parse(limits.checkedAt))}
      </span>
    </div>
  );
}
