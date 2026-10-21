import type { HardwareHistoryRange, HardwareLimit } from "@t3tools/contracts";
import { isDiscreteGpu, metricInfo, sampleMetrics } from "@t3tools/shared/hardwareWatch";
import { ClipboardCopyIcon } from "lucide-react";
import { lazy, Suspense, useMemo, useState, type ReactNode } from "react";

import { cn } from "~/lib/utils";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Spinner } from "../ui/spinner";
import { SidebarInset } from "../ui/sidebar";
import { Switch } from "../ui/switch";
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
import {
  AreaChart,
  Card,
  Chip,
  Gauge,
  LEVEL_TEXT,
  LimitBar,
  Segmented,
  Stepper,
  Trend,
  worstLevel,
  type Level,
} from "./SystemCareCharts";
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

const RANGE_OPTIONS = (["1h", "24h", "7d", "90d"] as const).map((value) => ({
  value,
  label: value,
}));

/** A friendly top for a chart axis: 100 for percentages, a rounded-up value otherwise. */
function chartMax(unit: string, values: ReadonlyArray<number | null>): number {
  if (unit === "%") return 100;
  const peak = Math.max(1, ...values.filter((value): value is number => value !== null));
  const magnitude = 10 ** Math.floor(Math.log10(peak));
  return Math.ceil((peak * 1.15) / magnitude) * magnitude;
}

function GaugeCard(props: {
  title: string;
  value: number | null;
  level: Level;
  lines: ReadonlyArray<string>;
  trend: ReadonlyArray<number | null>;
  extra?: ReactNode;
}) {
  return (
    <Card>
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {props.title}
      </div>
      <div className="mt-3 flex items-center gap-4">
        <Gauge value={props.value} level={props.level}>
          <span className={cn("text-2xl font-semibold tabular-nums", LEVEL_TEXT[props.level])}>
            {props.value === null ? "-" : `${Math.round(props.value)}%`}
          </span>
        </Gauge>
        <ul className="min-w-0 flex-1 space-y-1 text-sm text-muted-foreground">
          {props.lines.map((line) => (
            <li key={line} className="truncate">
              {line}
            </li>
          ))}
        </ul>
      </div>
      <div className="mt-3">
        <Trend values={props.trend} level={props.level} />
      </div>
      {props.extra ? <div className="mt-3">{props.extra}</div> : null}
    </Card>
  );
}

function LimitRow(props: {
  limit: HardwareLimit;
  current: number | null;
  onSave: (warn: number | null, critical: number | null) => void;
}) {
  const { limit } = props;
  return (
    <li className="grid grid-cols-1 items-center gap-x-4 gap-y-2 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(8rem,14rem)_auto]">
      <div className="min-w-0">
        <div className="truncate text-sm font-medium">{limit.label}</div>
        <div className="text-xs text-muted-foreground">
          {limit.source === "user"
            ? "Your setting"
            : limit.source === "spec"
              ? "From the part's own rating"
              : "Standard setting"}
          {limit.source === "user" ? (
            <button
              type="button"
              className="ml-2 underline underline-offset-2 hover:text-foreground"
              onClick={() => props.onSave(null, null)}
            >
              Reset
            </button>
          ) : null}
        </div>
      </div>
      <LimitBar
        warn={limit.warn}
        critical={limit.critical}
        unit={limit.unit}
        current={props.current}
      />
      <div className="flex items-center gap-2">
        <Stepper
          label="Warn"
          tone="warning"
          unit={limit.unit}
          value={limit.warn}
          onChange={(next) => props.onSave(Math.min(next, limit.critical - 1), limit.critical)}
        />
        <Stepper
          label="Critical"
          tone="critical"
          unit={limit.unit}
          value={limit.critical}
          onChange={(next) => props.onSave(limit.warn, Math.max(next, limit.warn + 1))}
        />
      </div>
    </li>
  );
}

export function SystemCarePage() {
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

  const editable = [...limits.values()].filter(isEditableLimit);
  const limitGroups = METRIC_GROUPS.map((group) => ({
    group,
    rows: editable.filter((limit) => metricGroup(limit.metric) === group),
  })).filter((entry) => entry.rows.length > 0);

  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden overscroll-y-none isolate">
      <div className="scrollbar-gutter-both flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto bg-background">
        <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-5 p-4 sm:p-6">
          <section className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/12 via-card to-card p-6">
            <div className="pointer-events-none absolute -top-24 -right-16 size-72 rounded-full bg-primary/10 blur-3xl" />
            <div className="relative flex flex-wrap items-center gap-6">
              <ScoreRing health={score} />
              <div className="min-w-0 flex-1">
                <h1 className="text-2xl font-semibold tracking-tight">PC Tuning</h1>
                <p className="text-base font-medium">{score.headline}</p>
                <p className="text-sm text-muted-foreground">
                  {score.reasons.length > 0
                    ? score.reasons.slice(0, 2).join(" · ")
                    : sample
                      ? "Every reading is inside its safe range."
                      : HEALTH_LABEL.unknown}
                  {alerts.length > 0 ? ` · ${alerts.length} open alerts` : ""}
                </p>
                {inv ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {[
                      inv.cpu.name,
                      ...inv.gpus
                        .filter(isDiscreteGpu)
                        .slice(0, 1)
                        .map((card) => card.name),
                      `${formatBytes(inv.memory.totalBytes, 0)} memory`,
                      ...(uptime ? [`On for ${uptime}`] : []),
                    ].map((text) => (
                      <Badge key={text} variant="outline" className="max-w-full truncate">
                        {text}
                      </Badge>
                    ))}
                  </div>
                ) : null}
              </div>
              <div className="flex flex-col items-start gap-1.5 sm:items-end">
                <div className="flex flex-wrap gap-2 sm:justify-end">
                  <Button
                    disabled={actions.busy || !supported}
                    onClick={() => void actions.preparePrompt("tune")}
                  >
                    {actions.busy ? <Spinner /> : <ClipboardCopyIcon />}
                    Tune my PC
                  </Button>
                  <Button
                    variant="outline"
                    disabled={actions.busy || !supported}
                    onClick={() => void actions.preparePrompt("checkup")}
                  >
                    Get a checkup
                  </Button>
                </div>
                <p className="max-w-xs text-xs text-muted-foreground sm:text-right">
                  Tune measures speed, researches your parts and asks before each change. Fills a
                  new chat for you; nothing is sent until you press send.
                </p>
              </div>
            </div>
          </section>

          <PcTabs value={tab} onChange={setTab} />

          {live.error ? <p className="text-sm text-destructive">{live.error}</p> : null}
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

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3">
                <SpeedReachedCard
                  rows={speed.rows}
                  overall={speed.overall}
                  hasExpected={pcStatus?.expected != null}
                  busy={actions.busy || !supported}
                  onTune={tune}
                />
                <BottleneckCard findings={pcStatus?.bottlenecks ?? []} />
                <SpeedTestsCard runs={pcStatus?.benchmarks ?? []} />
                <TopAppsCard apps={pcStatus?.topApps ?? []} measuring={supported} />
                <SystemFactsCard status={pcStatus} />
                <QuickWinsCard
                  wins={wins}
                  busy={actions.busy || !supported}
                  onTune={() => void actions.preparePrompt("tune")}
                />
                <Card
                  title="Alerts"
                  hint="Investigate fills a new chat with a message. Nothing is sent until you press send."
                >
                  {alerts.length === 0 ? (
                    <div className="flex items-center gap-3 rounded-xl bg-muted/50 px-4 py-6 text-sm text-muted-foreground">
                      <span className="size-2.5 rounded-full bg-success" />
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
                              alert.severity === "critical" ? "bg-destructive" : "bg-warning",
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
                                  ? "bg-primary"
                                  : tone === "warning"
                                    ? "bg-warning"
                                    : "bg-destructive",
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
              <div>
                <PartsCard inventory={inv} sample={sample} uptime={uptime} />
              </div>
            </div>
          ) : null}
          {tab === "history" ? (
            <div
              role="tabpanel"
              id="pc-panel-history"
              aria-labelledby="pc-tab-history"
              className="flex flex-col gap-4"
            >
              <div>
                <Card
                  title="History"
                  action={
                    <Segmented
                      label="History range"
                      value={range}
                      options={RANGE_OPTIONS}
                      onChange={setRange}
                    />
                  }
                >
                  {grouped.length > 0 ? (
                    <div className="mb-5 flex flex-col gap-2.5">
                      {grouped.map((entry) => (
                        <div key={entry.group} className="flex flex-wrap items-center gap-2">
                          <span className="w-20 shrink-0 text-xs font-medium text-muted-foreground">
                            {entry.group}
                          </span>
                          {entry.keys.map((key) => (
                            <Chip
                              key={key}
                              active={key === activeMetric}
                              onClick={() => setMetric(key)}
                            >
                              {shortMetricLabel(key, metricInfo(key, inv, sample).label)}
                            </Chip>
                          ))}
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {activeMetric ? (
                    <>
                      <div className="mb-4 flex flex-wrap items-end gap-x-8 gap-y-2">
                        <div>
                          <div className="text-xs text-muted-foreground">{activeInfo?.label}</div>
                          <div className="text-3xl font-semibold tabular-nums">
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
                            <div className="text-lg font-medium tabular-nums">
                              {formatValue(value, unit)}
                            </div>
                          </div>
                        ))}
                      </div>
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
                    </>
                  ) : (
                    <p className="rounded-xl bg-muted/50 px-4 py-8 text-center text-sm text-muted-foreground">
                      {history.isPending
                        ? "Loading history..."
                        : "History fills in as PC Tuning keeps watching."}
                    </p>
                  )}
                </Card>
              </div>
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
              </Suspense>
            </div>
          ) : null}
          {tab === "logs" ? (
            <div
              role="tabpanel"
              id="pc-panel-logs"
              aria-labelledby="pc-tab-logs"
              className="flex flex-col gap-4"
            >
              <Suspense fallback={<PanelLoading />}>
                <LogsPanel />
              </Suspense>
            </div>
          ) : null}
          {tab === "settings" ? (
            <div
              role="tabpanel"
              id="pc-panel-settings"
              aria-labelledby="pc-tab-settings"
              className="flex flex-col gap-4"
            >
              <div className="flex flex-col gap-4">
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
            </div>
          ) : null}
        </div>
      </div>
    </SidebarInset>
  );
}
