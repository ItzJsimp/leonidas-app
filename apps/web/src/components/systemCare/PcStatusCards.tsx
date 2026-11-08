import type { HardwarePcStatus } from "@t3tools/contracts";
import { BatteryIcon, NetworkIcon, PowerIcon, RefreshCwIcon, RocketIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "~/lib/utils";
import { Button } from "../ui/button";
import { Card } from "./SystemCareCharts";
import { BOTTLENECK_ADVICE, beforeAfter, type SpeedRow } from "./pcInsights.logic";
import { formatBytes, formatValue } from "./systemCare.logic";

const pctTone = (pct: number | null) =>
  pct === null
    ? "bg-muted-foreground/30"
    : pct >= 95
      ? "bg-success"
      : pct >= 85
        ? "bg-state"
        : pct >= 70
          ? "bg-warning"
          : "bg-error";

const speedText = (value: number | null, unit: SpeedRow["unit"]) =>
  value === null ? "-" : unit === "MHz" ? formatValue(value, "MHz") : `${Math.round(value)} MT/s`;

/** Expected vs. actual: how close each part runs to the speed its maker rates it for. */
export function SpeedReachedCard(props: {
  rows: ReadonlyArray<SpeedRow>;
  overall: number | null;
  hasExpected: boolean;
  busy: boolean;
  onTune: () => void;
}) {
  return (
    <Card title="Speed reached" hint="How close your parts run to the speed they are rated for.">
      <div className="mb-4 flex items-end gap-3">
        <span className="text-4xl font-semibold tabular-nums">
          {props.overall === null ? "-" : `${props.overall}%`}
        </span>
        <span className="pb-1 text-sm text-muted-foreground">
          {props.overall === null
            ? "of top speed"
            : props.rows.some((row) => row.pct === null)
              ? `of top speed for the ${props.rows.filter((row) => row.pct !== null).length === 1 ? "part" : "parts"} checked so far.`
              : props.overall >= 95
                ? "of top speed. Nothing is holding it back."
                : "of top speed. Tuning can unlock the rest."}
        </span>
      </div>
      <ul className="flex flex-col gap-3">
        {props.rows.map((row) => (
          <li key={row.part}>
            <div className="flex justify-between gap-3 text-sm">
              <span>{row.part}</span>
              <span className="tabular-nums text-muted-foreground">
                {row.rated === null
                  ? "needs a Tune run"
                  : `${speedText(row.actual, row.unit)} of ${speedText(row.rated, row.unit)}`}
              </span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  "h-full rounded-full transition-[width] duration-700",
                  pctTone(row.pct),
                )}
                style={{ width: `${row.pct ?? 0}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
      {!props.hasExpected ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-muted/50 px-3 py-2.5 text-xs text-muted-foreground">
          <span>Run Tune my PC once. It looks up the rated speeds of your exact parts.</span>
          <Button size="sm" variant="outline" disabled={props.busy} onClick={props.onTune}>
            <RocketIcon />
            Unlock
          </Button>
        </div>
      ) : null}
    </Card>
  );
}

/** The bottleneck detective: per app, which part fills up first. */
export function BottleneckCard(props: { findings: HardwarePcStatus["bottlenecks"] }) {
  return (
    <Card title="What slows you down" hint="Learned from the apps you use, over the last 7 days.">
      {props.findings.length === 0 ? (
        <p className="rounded-xl bg-muted/50 px-4 py-6 text-sm text-muted-foreground">
          Nothing has run out yet. Use your computer as normal: this fills in after a few busy
          minutes in an app.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {props.findings.map((finding) => (
            <li key={finding.app} className="rounded-xl border bg-background/60 p-3">
              <div className="text-sm">
                When <span className="font-medium">{finding.app}</span> is busy,{" "}
                <span className="font-medium text-foreground">{finding.resource}</span> fills up
                first.
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                {finding.fullMinutes} of {finding.activeMinutes} busy minutes.{" "}
                {BOTTLENECK_ADVICE[finding.resource] ?? ""}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

const SCORES = [
  ["Processor, one core", "cpuSingleScore"],
  ["Processor, all cores", "cpuMultiScore"],
  ["Memory speed (GB/s)", "memoryCopyGBs"],
  ["Disk write (MB/s)", "diskWriteMBs"],
] as const;

/** Speed tests from benchmark.ps1, with the latest before and after pair. */
export function SpeedTestsCard(props: { runs: HardwarePcStatus["benchmarks"] }) {
  const pair = beforeAfter(props.runs);
  const recent = props.runs.slice(-12);
  const top = Math.max(1, ...recent.map((run) => run.cpuMultiScore ?? 0));
  return (
    <Card title="Speed tests" hint="Tune runs a speed test before and after each change.">
      {props.runs.length === 0 ? (
        <p className="rounded-xl bg-muted/50 px-4 py-6 text-sm text-muted-foreground">
          No speed tests yet. Tune my PC or Get a checkup runs the first one.
        </p>
      ) : (
        <>
          <div className="flex h-24 items-end gap-1.5" aria-label="All-core score per run">
            {recent.map((run) => (
              <div
                key={run.at}
                title={`${run.label}: ${run.cpuMultiScore ?? "-"} (${new Date(run.at).toLocaleString()})`}
                className={cn(
                  "flex-1 rounded-t-md",
                  run.label === "after"
                    ? "bg-success"
                    : run.label === "before"
                      ? "bg-muted-foreground/40"
                      : "bg-state/60",
                )}
                style={{ height: `${Math.max(4, ((run.cpuMultiScore ?? 0) / top) * 100)}%` }}
              />
            ))}
          </div>
          <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
            <span>All-core score, oldest to newest</span>
            <span>grey before · green after</span>
          </div>
          <table className="mt-4 w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr>
                <th className="py-1 text-left font-normal">Test</th>
                <th className="py-1 text-right font-normal">{pair ? "Before" : "Latest"}</th>
                {pair ? <th className="py-1 text-right font-normal">After</th> : null}
                {pair ? <th className="py-1 text-right font-normal">Change</th> : null}
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {SCORES.map(([label, key]) => {
                const before = pair ? pair.before[key] : (props.runs.at(-1)?.[key] ?? null);
                const after = pair ? pair.after[key] : null;
                const change = before && after !== null ? ((after - before) / before) * 100 : null;
                return (
                  <tr key={key} className="border-t border-border/60">
                    <td className="py-1.5">{label}</td>
                    <td className="py-1.5 text-right">{before ?? "-"}</td>
                    {pair ? <td className="py-1.5 text-right">{after ?? "-"}</td> : null}
                    {pair ? (
                      <td
                        className={cn(
                          "py-1.5 text-right",
                          change === null || Math.abs(change) < 5
                            ? "text-muted-foreground"
                            : change > 0
                              ? "text-success"
                              : "text-error-foreground",
                        )}
                      >
                        {change === null ? "-" : `${change > 0 ? "+" : ""}${change.toFixed(0)}%`}
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}
    </Card>
  );
}

/** The apps using the computer right now. */
export function TopAppsCard(props: { apps: HardwarePcStatus["topApps"]; measuring: boolean }) {
  const top = Math.max(1, ...props.apps.map((app) => app.cpuPct));
  return (
    <Card title="Busiest apps" hint="Share of the whole processor over the last minute.">
      {props.apps.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {props.measuring ? "Measuring for one minute..." : "Not available on this computer."}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {props.apps.map((app) => (
            <li
              key={app.name}
              className="grid grid-cols-[minmax(0,1fr)_5rem_4.5rem] items-center gap-3 text-sm"
            >
              <div className="min-w-0">
                <div className="truncate" title={app.name}>
                  {app.name}
                  {app.processes > 1 ? (
                    <span className="ml-1.5 text-xs text-muted-foreground">×{app.processes}</span>
                  ) : null}
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-state"
                    style={{ width: `${(app.cpuPct / top) * 100}%` }}
                  />
                </div>
              </div>
              <span className="text-right tabular-nums">{app.cpuPct.toFixed(1)}%</span>
              <span className="text-right text-xs tabular-nums text-muted-foreground">
                {formatBytes(app.memoryBytes, 1)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function FactRow(props: {
  icon: typeof PowerIcon;
  label: string;
  children: ReactNode;
  tone?: "warn" | undefined;
}) {
  return (
    <div className="flex items-start gap-3 py-2">
      <props.icon
        className={cn(
          "mt-0.5 size-4 shrink-0",
          props.tone === "warn" ? "text-warning" : "text-muted-foreground",
        )}
      />
      <div className="min-w-0 flex-1">
        <div className="text-xs text-muted-foreground">{props.label}</div>
        <div className="text-sm">{props.children}</div>
      </div>
    </div>
  );
}

const rate = (bytesPerSec: number | null) =>
  bytesPerSec === null ? "-" : `${formatBytes(bytesPerSec, 1)}/s`;

/** Power plan, startup apps, Windows Update, battery and network in one place. */
export function SystemFactsCard(props: { status: HardwarePcStatus | null }) {
  const status = props.status;
  const ready = status !== null && (status.powerPlan !== null || status.startupApps.length > 0);
  return (
    <Card title="Windows and network">
      {!ready ? (
        <p className="text-sm text-muted-foreground">Reading Windows settings...</p>
      ) : (
        <div className="divide-y divide-border/60">
          <FactRow
            icon={PowerIcon}
            label="Power plan"
            tone={/saver|eco/i.test(status.powerPlan ?? "") ? "warn" : undefined}
          >
            {status.powerPlan ?? "Unknown"}
          </FactRow>
          <FactRow
            icon={RocketIcon}
            label="Apps that start with Windows"
            tone={status.startupApps.length > 12 ? "warn" : undefined}
          >
            <details>
              <summary className="cursor-pointer select-none">
                {status.startupApps.length} apps
              </summary>
              <p className="mt-1 text-xs text-muted-foreground">{status.startupApps.join(", ")}</p>
            </details>
          </FactRow>
          <FactRow
            icon={RefreshCwIcon}
            label="Windows Update"
            tone={status.updates.rebootPending ? "warn" : undefined}
          >
            {status.updates.rebootPending ? "Restart needed to finish an update. " : "Up to date. "}
            {status.updates.lastInstalledOn ? (
              <span className="text-muted-foreground">
                Last update {status.updates.lastInstalledOn}.
              </span>
            ) : null}
          </FactRow>
          {status.battery ? (
            <FactRow icon={BatteryIcon} label="Battery">
              {status.battery.chargePct}%{" "}
              {status.battery.charging ? "(plugged in)" : "(on battery)"}
            </FactRow>
          ) : null}
          {status.network.map((adapter) => (
            <FactRow key={adapter.name} icon={NetworkIcon} label={adapter.name}>
              <span className="tabular-nums">
                ↓ {rate(adapter.receiveBytesPerSec)} · ↑ {rate(adapter.sendBytesPerSec)}
              </span>
              {adapter.linkMbps ? (
                <span className="text-muted-foreground">
                  {" "}
                  · link{" "}
                  {adapter.linkMbps >= 1000
                    ? `${adapter.linkMbps / 1000} Gb/s`
                    : `${adapter.linkMbps} Mb/s`}
                </span>
              ) : null}
            </FactRow>
          ))}
        </div>
      )}
    </Card>
  );
}
