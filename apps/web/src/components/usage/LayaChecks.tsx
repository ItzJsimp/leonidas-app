import type { LayaUsage } from "@t3tools/contracts";
import { Link } from "@tanstack/react-router";
import { CheckIcon, ShieldCheckIcon } from "lucide-react";
import { useEffect, useRef } from "react";

import { usePrimaryEnvironmentId } from "~/state/environments";
import { useEnvironmentQuery } from "~/state/query";
import { layaUsageQuery } from "~/state/taskBoard";
import { formatDayAwareTimestamp } from "~/timestampFormat";

import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { Skeleton } from "../ui/skeleton";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

const JOB_LABELS: Record<string, string> = {
  bash_gate: "Command checks",
  screen: "Web page checks",
};
const ENGINE_LABELS: Record<LayaUsage["engineStatus"], string> = {
  ready: "Ready",
  "missing-model": "Model missing",
  "missing-pack": "Not installed",
  "missing-runtime": "Python setup needed",
  error: "Check failed",
  paused: "Paused for Game Mode",
};
// The dot beside a status that is not Ready. The label carries the meaning, the color only adds to it.
const ENGINE_DOT: Record<LayaUsage["engineStatus"], string> = {
  ready: "",
  "missing-model": "bg-warning",
  "missing-pack": "bg-warning",
  "missing-runtime": "bg-warning",
  error: "bg-error",
  paused: "bg-muted-foreground",
};
const JEV_LABELS: Record<LayaUsage["jevState"], string> = {
  off: "Off",
  ready: "Key present",
  paused: "Paused",
};

const count = (value: number) => value.toLocaleString();
const checks = (value: number) => (value === 1 ? "check" : "checks");
const weekday = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: "short" });

const PANEL = "rounded-lg border border-border/60";

function StatusChip(props: { readonly engineStatus: LayaUsage["engineStatus"] }) {
  const label = ENGINE_LABELS[props.engineStatus];
  if (props.engineStatus === "ready") {
    return (
      <span className="ms-auto inline-flex h-6 items-center gap-1.5 rounded-md bg-state ps-2 pe-2.5 text-xs font-medium text-state-foreground">
        <CheckIcon aria-hidden className="size-3" />
        {label}
      </span>
    );
  }
  return (
    <span className="ms-auto inline-flex h-6 items-center gap-1.5 rounded-md border border-input bg-secondary ps-2 pe-2.5 text-xs font-medium text-secondary-foreground">
      <span aria-hidden className={cn("size-1.5 rounded-full", ENGINE_DOT[props.engineStatus])} />
      {label}
    </span>
  );
}

function Chip(props: { readonly dot: string; readonly value: number; readonly text: string }) {
  return (
    <span className="inline-flex h-6 items-center gap-1.5 rounded-md bg-surface-raised px-2 text-xs whitespace-nowrap">
      <span aria-hidden className={cn("size-1.5 rounded-full", props.dot)} />
      <span className="font-medium tabular-nums">{count(props.value)}</span> {props.text}
    </span>
  );
}

function Fact(props: {
  readonly label: string;
  readonly value: string;
  readonly mono?: boolean;
  readonly hint?: string;
}) {
  return (
    <div className="flex gap-1.5">
      {props.hint ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <dt
                tabIndex={0}
                className="cursor-help underline decoration-dotted underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              />
            }
          >
            {props.label}
          </TooltipTrigger>
          <TooltipPopup side="top">{props.hint}</TooltipPopup>
        </Tooltip>
      ) : (
        <dt>{props.label}</dt>
      )}
      <dd className={cn("font-medium text-foreground tabular-nums", props.mono && "font-mono")}>
        {props.value}
      </dd>
    </div>
  );
}

/** One column per day. Gray, with today a step brighter: blue stays for state. */
function DayBars(props: { readonly days: ReadonlyArray<{ date: string; count: number }> }) {
  const max = Math.max(1, ...props.days.map((day) => day.count));
  return (
    <div
      role="img"
      aria-label={`Checks per day, last ${props.days.length} days: ${props.days.map((day) => day.count).join(", ")}`}
      className="grid items-end gap-2"
      style={{ gridTemplateColumns: `repeat(${props.days.length}, minmax(0, 1fr))` }}
    >
      {props.days.map((day, index) => (
        <div key={day.date} className="flex flex-col items-center justify-end gap-1.5">
          <div
            className={cn(
              "w-7 rounded-sm",
              index === props.days.length - 1 ? "bg-muted-foreground" : "bg-muted-foreground/70",
            )}
            style={{ height: `${Math.max(4, Math.round((day.count / max) * 40))}px` }}
          />
          <span className="text-2xs text-muted-foreground">{weekday(day.date)}</span>
        </div>
      ))}
    </div>
  );
}

function Notice(props: { readonly gameMode: boolean }) {
  return (
    <div className={cn(PANEL, "flex flex-wrap items-center gap-3 px-4 py-3 text-sm")}>
      <span className="text-muted-foreground">
        {props.gameMode
          ? "Local model checks are paused. Rules still run."
          : "Rules still run. Open Settings to check Laya setup."}
      </span>
      {props.gameMode ? null : (
        <Button className="ms-auto" variant="outline" render={<Link to="/settings/general" />}>
          Open Settings
        </Button>
      )}
    </div>
  );
}

function Details(props: { readonly data: LayaUsage }) {
  const { data } = props;
  return (
    <>
      {data.engineStatus === "ready" ? null : <Notice gameMode={data.gameMode} />}
      {data.total === 0 || data.days.length === 0 ? (
        <p className={cn(PANEL, "px-4 py-3 text-sm text-muted-foreground")}>
          No checks have run yet.
        </p>
      ) : (
        <>
          <div
            className={cn(
              PANEL,
              "grid items-center gap-x-6 gap-y-3 p-4 md:grid-cols-[11rem_minmax(0,1fr)]",
            )}
          >
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium text-foreground">All checks</span>
              <span className="flex items-baseline gap-2">
                <span className="text-3xl font-semibold text-foreground tabular-nums">
                  {count(data.total)}
                </span>
                <span className="text-sm text-muted-foreground">{checks(data.total)}</span>
              </span>
            </div>
            <DayBars days={data.days} />
          </div>
          <ul className={cn(PANEL, "flex flex-col divide-y divide-border/60")}>
            {data.jobs.map((job) => (
              <li
                key={job.job}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 text-sm"
              >
                <span className="font-medium text-foreground">
                  {JOB_LABELS[job.job] ?? job.job}
                </span>
                <span className="text-muted-foreground tabular-nums">
                  {count(job.count)} {checks(job.count)}
                </span>
                <span className="ms-auto flex flex-wrap gap-1.5">
                  {job.blocked > 0 ? (
                    <Chip dot="bg-error" value={job.blocked} text="blocked" />
                  ) : null}
                  {job.asked > 0 ? (
                    <Chip dot="bg-warning" value={job.asked} text="asked you" />
                  ) : null}
                  {job.flagged > 0 ? (
                    <Chip
                      dot="bg-warning"
                      value={job.flagged}
                      text={job.flagged === 1 ? "warning" : "warnings"}
                    />
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
      <dl className="flex flex-wrap gap-x-6 gap-y-1 px-1 text-xs text-muted-foreground">
        <Fact label="Model" value={data.modelHash ?? "Not found"} mono />
        <Fact
          label="Last probe"
          value={data.probeMs === null ? "Not measured" : `${data.probeMs} ms`}
        />
        <Fact
          label="Jev backup"
          value={JEV_LABELS[data.jevState]}
          hint="Whether the backup checker (Jev) can answer when rules and the local model are unsure."
        />
        <Fact label="Game Mode" value={data.gameMode ? "On" : "Off"} />
        <Fact
          label="Answered by"
          hint="How many checks each layer settled: fixed rules, the local model, then the Jev backup."
          value={`Rules ${count(data.tiers.rules)} · Model ${count(data.tiers.model)} · Jev backup ${count(data.tiers.jev)}`}
        />
      </dl>
    </>
  );
}

/**
 * A Laya group for the Limits view, built like the AI service groups above it. Counts only, no command text.
 * `refreshedAt` is the page's last limits refresh time; each change reloads the Laya numbers too.
 */
export function LayaChecksSection(props: { readonly refreshedAt?: number }) {
  const environmentId = usePrimaryEnvironmentId();
  const { data, error, dataUpdatedAt, refresh } = useEnvironmentQuery(
    environmentId ? layaUsageQuery({ environmentId, input: {} }) : null,
  );
  const lastRefreshedAt = useRef(props.refreshedAt);
  useEffect(() => {
    if (lastRefreshedAt.current === props.refreshedAt) return;
    lastRefreshedAt.current = props.refreshedAt;
    refresh();
  }, [props.refreshedAt, refresh]);
  const checkedAt = dataUpdatedAt > 0 ? new Date(dataUpdatedAt).toISOString() : null;
  return (
    <section aria-label="Laya safety checks" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="flex items-center gap-2 text-sm font-medium text-foreground">
          <ShieldCheckIcon aria-hidden className="size-4 text-muted-foreground" />
          Laya
        </h2>
        {data !== null && checkedAt !== null ? (
          <span className="text-xs text-muted-foreground">
            Checked{" "}
            <time dateTime={checkedAt}>{formatDayAwareTimestamp(checkedAt, "12-hour")}</time>
            {data.days.length > 0 ? ` · last ${data.days.length} days` : ""}
          </span>
        ) : null}
        {data === null ? null : <StatusChip engineStatus={data.engineStatus} />}
      </div>
      {data === null ? (
        error ? (
          <p role="status" className={cn(PANEL, "px-4 py-3 text-sm text-muted-foreground")}>
            Laya numbers are not available now. Try again later.
          </p>
        ) : (
          <div role="status" aria-label="Loading Laya checks">
            <Skeleton className="h-[90px]" />
          </div>
        )
      ) : (
        <Details data={data} />
      )}
    </section>
  );
}
