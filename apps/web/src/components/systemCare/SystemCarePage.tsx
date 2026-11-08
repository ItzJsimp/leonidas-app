import type { HardwareHistoryRange } from "@t3tools/contracts";
import { isDiscreteGpu, metricInfo, sampleMetrics } from "@t3tools/shared/hardwareWatch";
import * as DateTime from "effect/DateTime";
import { ClipboardCopyIcon } from "lucide-react";
import { lazy, Suspense, useMemo, useState, type ReactNode } from "react";

import { cn } from "~/lib/utils";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Spinner } from "../ui/spinner";
import { SidebarInset } from "../ui/sidebar";
import {
  Select,
  SelectGroup,
  SelectGroupLabel,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { Switch } from "../ui/switch";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { usePrimaryEnvironmentId } from "~/state/environments";
import { SettingsScopeProvider } from "../settings/SettingsScopeContext";
import { TelemetryExportSettings } from "../settings/TelemetryExportSettings";
import { CoreGrid, PartsCard, PcTabs, QuickWinsCard, ScoreRing, type PcTab } from "./PcInsights";
import { healthScore, quickWins, speedReached, uptimeText } from "./pcInsights.logic";
import {
  BottleneckCard,
  SpeedReachedCard,
  SpeedTestsCard,
  SystemFactsCard,
  TopAppsCard,
} from "./PcStatusCards";
import { chartMax, GaugeCard, LimitRow, readings, SummaryCard } from "./MachineCards";
import { MachineTimeline, type TimelineLane, type TimelineMark } from "./MachineTimeline";
import { AreaChart, Card, worstLevel, type Level } from "./SystemCareCharts";
import {
  HEALTH_LABEL,
  METRIC_GROUPS,
  RANGE_LABEL,
  formatBytes,
  formatValue,
  historyMetrics,
  historySeries,
  isEditableLimit,
  limitLevel,
  metricGroup,
  openAlerts,
  relativeTime,
  seriesStats,
  shortMetricLabel,
} from "./systemCare.logic";
import {
  useSystemCareActions,
  useSystemCareHistory,
  useSystemCareInventory,
  useSystemCareLimits,
  useSystemCareLive,
  useSystemCareStatus,
} from "./useSystemCare";
import { useTraceDiagnostics } from "./useTraceDiagnostics";

const LeonidasAppPanel = lazy(() =>
  import("./LeonidasAppPanel").then((module) => ({ default: module.LeonidasAppPanel })),
);
const LogsPanel = lazy(() =>
  import("./LogsPanel").then((module) => ({ default: module.LogsPanel })),
);

const ignoreScopeChange = () => {};

function PanelLoading() {
  return (
    <div className="flex justify-center py-16">
      <Spinner />
    </div>
  );
}

/** The export form reads its computer from the settings scope, so pin that to this computer. */
function PcTelemetryExport() {
  const environmentId = usePrimaryEnvironmentId();
  const search = useMemo(() => ({ machine: environmentId ?? undefined }), [environmentId]);
  return (
    <SettingsScopeProvider search={search} onChange={ignoreScopeChange}>
      <TelemetryExportSettings />
    </SettingsScopeProvider>
  );
}

/** `embedded` drops the page frame, so the Automations tab can show it as its Machine view. */
export function SystemCarePage({ embedded = false }: { readonly embedded?: boolean } = {}) {
  const [tab, setTab] = useState<PcTab>("overview");
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const live = useSystemCareLive();
  const inventory = useSystemCareInventory();
  const limitsView = useSystemCareLimits();
  const actions = useSystemCareActions();
  const [range, setRange] = useState<HardwareHistoryRange>("24h");
  const [metric, setMetric] = useState<string | null>(null);
  const history = useSystemCareHistory(range);
  const day = useSystemCareHistory("24h");
  const statusQuery = useSystemCareStatus();
  const pcStatus = statusQuery.data ?? null;
  const trace = useTraceDiagnostics();

  const limits = useMemo(
    () => new Map((limitsView.data?.limits ?? []).map((limit) => [limit.metric, limit])),
    [limitsView.data],
  );
  const inv = inventory.data ?? null;
  const sample = live.sample;
  const metrics = useMemo(() => (sample ? sampleMetrics(sample) : {}), [sample]);
  const score = healthScore(sample, limits, live.alerts);
  const now = sample?.at ?? 0;
  const uptime = uptimeText(inv?.os.bootedAt ?? null, now);
  const wins = useMemo(() => quickWins(inv, sample, now, pcStatus), [inv, sample, now, pcStatus]);
  const speed = useMemo(() => {
    const dayPoints = day.data?.points ?? [];
    const peak = (key: string) => seriesStats(historySeries(dayPoints, key, "max")).max;
    return speedReached(inv, pcStatus?.expected ?? null, peak("cpu.clock"), peak("gpu.0.clock"));
  }, [day.data, inv, pcStatus]);
  const tune = () => void actions.preparePrompt("tune");
  const alerts = openAlerts(live.alerts);
  const supported = live.status?.supported ?? true;
  const gpu = sample?.gpus[0];
  const level = (key: string, value: number | null | undefined): Level =>
    limitLevel(value, limits.get(key));
  const memPct = (s: { memory: { usedBytes: number; totalBytes: number } }) =>
    (s.memory.usedBytes / Math.max(1, s.memory.totalBytes)) * 100;

  const points = history.data?.points ?? [];
  const available = useMemo(() => historyMetrics(points), [points]);
  const activeMetric = metric && available.includes(metric) ? metric : (available[0] ?? null);
  const grouped = METRIC_GROUPS.map((group) => ({
    group,
    keys: available.filter((key) => metricGroup(key) === group),
  })).filter((entry) => entry.keys.length > 0);
  const activeInfo = activeMetric ? metricInfo(activeMetric, inv, sample) : null;
  const series = activeMetric ? historySeries(points, activeMetric) : [];
  const stats = seriesStats(series);
  // The averaged series hides short spikes; the real peak lives in each point's max.
  const peak = activeMetric ? seriesStats(historySeries(points, activeMetric, "max")).max : null;
  const activeLimit = activeMetric ? limits.get(activeMetric) : undefined;
  const unit = activeInfo?.unit ?? "";

  const lanes: ReadonlyArray<TimelineLane> = [
    {
      metric: "cpu.load",
      label: "Processor",
      detail: sample
        ? readings(
            formatValue(sample.cpu.clockMhz, "MHz"),
            formatValue(sample.cpu.packageTempC ?? sample.cpu.maxCoreTempC, "°C"),
          )
        : "",
    },
    {
      metric: "gpu.0.load",
      label: "Graphics",
      detail: gpu ? readings(formatValue(gpu.tempC, "°C"), formatValue(gpu.powerW, "W")) : "",
    },
    {
      metric: "memory.load",
      label: "Memory",
      detail: sample
        ? `${formatBytes(sample.memory.usedBytes)} of ${formatBytes(sample.memory.totalBytes, 0)}`
        : "",
    },
    {
      metric: "disk.active",
      label: "Disk activity",
      detail: sample ? `Reading ${formatValue(sample.disk.readBytesPerSec, "B/s")}` : "",
    },
  ].filter((lane) => available.includes(lane.metric));
  const marks = useMemo(
    (): ReadonlyArray<TimelineMark> => [
      ...live.alerts.map((alert) => ({
        at: alert.startedAt,
        kind: "alert" as const,
        label: `${alert.message} (${alert.label})`,
      })),
      ...(pcStatus?.benchmarks ?? []).map((run) => ({
        at: Date.parse(run.at),
        kind: "test" as const,
        label: run.label,
      })),
      ...(trace.data?.latestFailures ?? []).map((failure) => ({
        at: DateTime.toEpochMillis(failure.endedAt),
        kind: "error" as const,
        label: `${failure.name}: ${failure.cause}`,
      })),
    ],
    [live.alerts, pcStatus, trace.data],
  );
  const failures = trace.data?.failureCount ?? null;

  const editable = [...limits.values()].filter(isEditableLimit);
  const limitGroups = METRIC_GROUPS.map((group) => ({
    group,
    rows: editable.filter((limit) => metricGroup(limit.metric) === group),
  })).filter((entry) => entry.rows.length > 0);
  const partBadges = inv
    ? [
        inv.cpu.name,
        ...inv.gpus
          .filter(isDiscreteGpu)
          .slice(0, 1)
          .map((card) => card.name),
        `${formatBytes(inv.memory.totalBytes, 0)} memory`,
        ...(uptime ? [`On for ${uptime}`] : []),
      ]
    : [];

  return (
    <PageFrame embedded={embedded}>
      <div className="scrollbar-gutter-both flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto bg-background">
        <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-4 p-4 sm:p-6">
          <PcTabs value={tab} onChange={setTab} />

          <section className="flex flex-wrap items-center gap-5 rounded-2xl border bg-card p-5">
            <ScoreRing health={score} />
            <div className="min-w-0 flex-1">
              <p className="text-base font-semibold">{score.headline}</p>
              <p className="text-sm text-muted-foreground">
                {score.reasons.length > 0
                  ? score.reasons.slice(0, 2).join(" · ")
                  : sample
                    ? "Every reading is inside its safe range."
                    : HEALTH_LABEL.unknown}
                {alerts.length > 0 ? ` · ${alerts.length} open alerts` : ""}
              </p>
              {partBadges.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {partBadges.map((text) => (
                    <Badge key={text} variant="outline">
                      {text}
                    </Badge>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="flex flex-col items-start gap-1.5 sm:items-end">
              <div className="flex flex-wrap gap-2 sm:justify-end">
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button disabled={actions.busy || !supported} onClick={tune}>
                        {actions.busy ? <Spinner /> : <ClipboardCopyIcon />}
                        Tune my PC
                      </Button>
                    }
                  />
                  <TooltipPopup side="top">
                    Measures speed, researches your parts and asks before each change.
                  </TooltipPopup>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        variant="outline"
                        disabled={actions.busy || !supported}
                        onClick={() => void actions.preparePrompt("checkup")}
                      >
                        Get a checkup
                      </Button>
                    }
                  />
                  <TooltipPopup side="top">
                    Runs a speed test and a health check. It changes nothing.
                  </TooltipPopup>
                </Tooltip>
              </div>
              <p className="text-xs text-muted-foreground sm:text-right">
                Fills a new chat. Nothing is sent until you press send.
              </p>
            </div>
          </section>

          {live.error ? <p className="text-sm text-error-foreground">{live.error}</p> : null}
          {!supported ? (
            <p className="text-sm text-muted-foreground">
              PC Tuning is not available on this computer yet.
            </p>
          ) : null}

          {tab === "overview" ? (
            <div
              role="tabpanel"
              id="pc-panel-overview"
              aria-labelledby="pc-tab-overview"
              className="flex flex-col gap-4"
            >
              <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
                <SummaryCard
                  label="Needs a look"
                  value={String(wins.length)}
                  detail={
                    wins.length > 0 ? wins.map((win) => win.title).join(", ") : "Nothing to fix"
                  }
                />
                <SummaryCard
                  label="Alerts"
                  value={String(alerts.length)}
                  detail={
                    alerts.length > 0
                      ? alerts.map((alert) => alert.label).join(", ")
                      : "All readings inside their limits"
                  }
                />
                <SummaryCard
                  label="Speed reached"
                  value={speed.overall === null ? "-" : `${Math.round(speed.overall)}%`}
                  detail="Of the rated speed of your parts"
                />
                <SummaryCard
                  label="Leonidas errors"
                  value={failures === null ? "-" : String(failures)}
                  detail={
                    trace.data
                      ? `Failures in ${trace.data.recordCount} spans`
                      : trace.canReadDiagnostics
                        ? "Reading traces..."
                        : "Not available here"
                  }
                  error={failures !== null && failures > 0}
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <GaugeCard
                  title="Processor"
                  value={sample?.cpu.loadPct ?? null}
                  level={worstLevel(
                    level("cpu.load", sample?.cpu.loadPct),
                    level("cpu.temp", sample?.cpu.packageTempC ?? sample?.cpu.maxCoreTempC),
                  )}
                  lines={
                    sample
                      ? [
                          formatValue(sample.cpu.packageTempC ?? sample.cpu.maxCoreTempC, "°C"),
                          formatValue(sample.cpu.clockMhz, "MHz"),
                          sample.cpu.powerW !== null ? formatValue(sample.cpu.powerW, "W") : "",
                        ].filter((line) => line !== "" && line !== "-")
                      : ["Waiting for data"]
                  }
                  trend={live.samples.map((s) => s.cpu.loadPct)}
                  extra={<CoreGrid loads={sample?.cpu.coreLoadPct ?? []} />}
                />
                <GaugeCard
                  title="Graphics"
                  value={gpu?.loadPct ?? null}
                  level={worstLevel(
                    level("gpu.0.temp", gpu?.tempC),
                    level("gpu.0.vram", metrics["gpu.0.vram"]),
                  )}
                  lines={
                    gpu
                      ? [
                          formatValue(gpu.tempC, "°C"),
                          `${formatBytes(gpu.vramUsedBytes, 1)} video memory`,
                          gpu.powerW !== null ? formatValue(gpu.powerW, "W") : "",
                          gpu.fanPct !== null ? `Fan ${Math.round(gpu.fanPct)}%` : "",
                          gpu.thermalThrottling ? "Slowing down: too hot" : "",
                        ].filter((line) => line !== "" && line !== "-")
                      : ["No graphics reading"]
                  }
                  trend={live.samples.map((s) => s.gpus[0]?.loadPct ?? null)}
                />
                <GaugeCard
                  title="Memory"
                  value={sample ? memPct(sample) : null}
                  level={level("memory.load", sample ? memPct(sample) : null)}
                  lines={
                    sample
                      ? [
                          `${formatBytes(sample.memory.usedBytes)} in use`,
                          `of ${formatBytes(sample.memory.totalBytes, 0)}`,
                        ]
                      : ["Waiting for data"]
                  }
                  trend={live.samples.map(memPct)}
                />
                <GaugeCard
                  title="Disk activity"
                  value={sample?.disk.activePct ?? null}
                  level="ok"
                  lines={
                    sample
                      ? [
                          `Reading ${formatValue(sample.disk.readBytesPerSec, "B/s")}`,
                          `Writing ${formatValue(sample.disk.writeBytesPerSec, "B/s")}`,
                        ]
                      : ["Waiting for data"]
                  }
                  trend={live.samples.map((s) => s.disk.activePct)}
                />
              </div>

              <MachineTimeline
                range={range}
                onRange={setRange}
                points={points}
                pending={history.isPending}
                lanes={lanes}
                metric={activeMetric}
                onMetric={setMetric}
                marks={marks}
                now={points.at(-1)?.at ?? now}
              >
                {activeMetric ? (
                  <>
                    <div className="mt-4 flex flex-wrap items-end gap-x-8 gap-y-3 border-t pt-4">
                      <div>
                        <div className="text-xs text-muted-foreground">{activeInfo?.label}</div>
                        <div className="text-2xl font-semibold tabular-nums">
                          {formatValue(stats.latest, unit)}
                        </div>
                      </div>
                      {(
                        [
                          ["Lowest", stats.min],
                          ["Average", stats.avg],
                          ["Highest", peak],
                        ] as const
                      ).map(([label, value]) => (
                        <div key={label}>
                          <div className="text-xs text-muted-foreground">{label}</div>
                          <div className="text-sm font-medium tabular-nums">
                            {formatValue(value, unit)}
                          </div>
                        </div>
                      ))}
                      <div className="ml-auto">
                        <Select
                          value={activeMetric}
                          onValueChange={(value) => {
                            if (value) setMetric(value);
                          }}
                        >
                          <SelectTrigger size="sm" aria-label="Reading" className="w-auto min-w-48">
                            <SelectValue>{activeInfo?.label ?? "Reading"}</SelectValue>
                          </SelectTrigger>
                          <SelectPopup>
                            {grouped.map((entry) => (
                              <SelectGroup key={entry.group}>
                                <SelectGroupLabel>{entry.group}</SelectGroupLabel>
                                {entry.keys.map((key) => (
                                  <SelectItem key={key} value={key}>
                                    {shortMetricLabel(key, metricInfo(key, inv, sample).label)}
                                  </SelectItem>
                                ))}
                              </SelectGroup>
                            ))}
                          </SelectPopup>
                        </Select>
                      </div>
                    </div>
                    {lanes.some((lane) => lane.metric === activeMetric) ? null : (
                      <div className="mt-4">
                        <AreaChart
                          values={series}
                          max={chartMax(unit, series)}
                          format={(value) => formatValue(value, unit)}
                          startLabel={`${RANGE_LABEL[range]} ago`}
                          marks={
                            activeLimit
                              ? [
                                  { value: activeLimit.warn, level: "warning" },
                                  { value: activeLimit.critical, level: "critical" },
                                ]
                              : []
                          }
                        />
                      </div>
                    )}
                  </>
                ) : null}
              </MachineTimeline>

              <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
                <QuickWinsCard wins={wins} busy={actions.busy || !supported} onTune={tune} />
                <SpeedReachedCard
                  rows={speed.rows}
                  overall={speed.overall}
                  hasExpected={pcStatus?.expected != null}
                  busy={actions.busy || !supported}
                  onTune={tune}
                />
                <Card
                  title="Alerts"
                  hint="Investigate fills a new chat with a message. Nothing is sent until you press send."
                >
                  {alerts.length === 0 ? (
                    <div className="flex items-center gap-3 rounded-xl bg-muted/50 px-4 py-6 text-sm text-muted-foreground">
                      <span className="size-2.5 rounded-full bg-state" />
                      All clear. Nothing needs your attention.
                    </div>
                  ) : (
                    <ul className="flex flex-col gap-2">
                      {alerts.map((alert) => (
                        <li
                          key={alert.id}
                          className="flex flex-wrap items-center gap-3 rounded-xl border bg-background/60 p-3"
                        >
                          <span
                            className={cn(
                              "h-9 w-1 shrink-0 rounded-full",
                              alert.severity === "critical" ? "bg-error" : "bg-warning",
                            )}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium">{alert.message}</div>
                            <div className="text-xs text-muted-foreground">
                              {alert.label} · started {relativeTime(alert.startedAt, Date.now())}
                              {alert.acknowledged ? " · dismissed" : ""}
                            </div>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={actions.busy}
                            onClick={() => void actions.preparePrompt("investigate", alert.id)}
                          >
                            Investigate
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              void actions.setAcknowledged(alert.id, !alert.acknowledged)
                            }
                          >
                            {alert.acknowledged ? "Unmute" : "Dismiss"}
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              </div>
              <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
                <TopAppsCard apps={pcStatus?.topApps ?? []} measuring={supported} />
                <div className="flex flex-col gap-4">
                  <BottleneckCard findings={pcStatus?.bottlenecks ?? []} />
                  <SpeedTestsCard runs={pcStatus?.benchmarks ?? []} />
                </div>
              </div>
            </div>
          ) : null}
          {tab === "parts" ? (
            <div
              role="tabpanel"
              id="pc-panel-parts"
              aria-labelledby="pc-tab-parts"
              className="flex flex-col gap-4"
            >
              <PartsCard inventory={inv} sample={sample} uptime={uptime} />
              <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
                <Card title="Storage">
                  <ul className="flex flex-col gap-4">
                    {(sample?.volumes ?? []).map((volume) => {
                      const used = (volume.usedBytes / Math.max(1, volume.totalBytes)) * 100;
                      const tone = level(`volume.${volume.mount}.used`, used);
                      return (
                        <li key={volume.mount}>
                          <div className="flex items-baseline justify-between text-sm">
                            <span className="font-medium">{volume.label ?? volume.mount}</span>
                            <span className="text-xs text-muted-foreground tabular-nums">
                              {formatBytes(volume.usedBytes, 0)} of{" "}
                              {formatBytes(volume.totalBytes, 0)}
                            </span>
                          </div>
                          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
                            <div
                              className={cn(
                                "h-full rounded-full",
                                tone === "ok"
                                  ? "bg-state"
                                  : tone === "warning"
                                    ? "bg-warning"
                                    : "bg-error",
                              )}
                              style={{ width: `${Math.min(100, used)}%` }}
                            />
                          </div>
                        </li>
                      );
                    })}
                    {(sample?.volumes.length ?? 0) === 0 ? (
                      <li className="text-sm text-muted-foreground">No drives reported yet.</li>
                    ) : null}
                  </ul>
                  {sample && sample.driveTemps.length > 0 ? (
                    <ul className="mt-4 space-y-1 border-t pt-3 text-xs text-muted-foreground">
                      {sample.driveTemps.map((drive) => (
                        <li key={drive.diskId} className="flex justify-between gap-3">
                          <span className="truncate">{drive.model}</span>
                          <span className="tabular-nums">{formatValue(drive.tempC, "°C")}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </Card>
                <SystemFactsCard status={pcStatus} />
              </div>
              <Card
                title="Deep sensors"
                hint="Adds fan speeds, voltages and every temperature to the readings."
                action={
                  <Switch
                    aria-label="Deep sensors"
                    checked={
                      live.status?.deepSensors === "on" || live.status?.deepSensors === "starting"
                    }
                    onCheckedChange={(enabled) => void actions.setDeepSensors(enabled)}
                  />
                }
              >
                <p className="text-sm text-muted-foreground">
                  {live.status?.deepSensorsMessage ??
                    `Status: ${live.status?.deepSensors ?? "off"}`}
                </p>
              </Card>
              <Card
                title="Alert limits"
                hint="You get an alert when a reading stays past Warn or Critical for a while."
              >
                {limitGroups.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Limits appear once readings arrive.
                  </p>
                ) : (
                  <div className="flex flex-col gap-4">
                    {limitGroups.map((entry) => (
                      <div key={entry.group}>
                        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          {entry.group}
                        </div>
                        <ul className="divide-y">
                          {entry.rows.map((limit) => (
                            <LimitRow
                              key={limit.metric}
                              limit={limit}
                              current={metrics[limit.metric] ?? null}
                              onSave={(warn, critical) =>
                                void limitsView.save(limit.metric, warn, critical)
                              }
                            />
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
              <PcTelemetryExport />
            </div>
          ) : null}
          {tab === "app" ? (
            <div
              role="tabpanel"
              id="pc-panel-app"
              aria-labelledby="pc-tab-app"
              className="flex flex-col gap-4"
            >
              <Suspense fallback={<PanelLoading />}>
                <LeonidasAppPanel environmentId={primaryEnvironmentId} />
                <LogsPanel />
              </Suspense>
            </div>
          ) : null}
        </div>
      </div>
    </PageFrame>
  );
}

function PageFrame(props: { readonly embedded: boolean; readonly children: ReactNode }) {
  return props.embedded ? (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">{props.children}</div>
  ) : (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden overscroll-y-none isolate">
      {props.children}
    </SidebarInset>
  );
}
