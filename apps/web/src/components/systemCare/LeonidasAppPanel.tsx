import { ProcessSignalActions } from "../settings/ProcessSignalActions";
import { AuthEnvironmentMaintainScope } from "@t3tools/contracts";
import { RefreshIcon } from "~/components/ui/refresh-icon";
import { ChevronDown, ChevronRight } from "lucide";
import type {
  BackgroundBooleanState,
  EnvironmentId,
  ResourceAttributionEntry,
  ResourceTelemetryAggregate,
  ResourceTelemetryHistoryBucket,
  ResourceTelemetryIoSemantics,
  ResourceTelemetryProcess,
  ResourceTelemetryProcessCategory,
  ResourceTelemetryProcessSummary,
  ResourceTelemetrySourceHealth,
  ResourceTelemetrySourceStatus,
  ServerProcessSignal,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Option from "effect/Option";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";

import {
  useResourceTelemetry,
  useResourceTelemetryHistory,
} from "../../lib/resourceTelemetryState";
import { cn } from "../../lib/utils";
import { formatBytes } from "../../lib/formatBytes";
import { ensureLocalApi } from "../../localApi";
import { serverEnvironment } from "../../state/server";
import { readEnvironmentScope, useEnvironmentScope } from "../../state/session";
import { useAtomCommand } from "../../state/use-atom-command";
import { formatRelativeTime } from "../../timestampFormat";
import { Button } from "../ui/button";
import { MorphIcon } from "~/components/MorphIcon";
import { ScrollArea } from "../ui/scroll-area";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { toastManager } from "../ui/toast";
import {
  resourceHistoryBarHeight,
  resourceHistoryCpuScaleMax,
  shouldShowResourceMonitorRetry,
  visibleResourceTelemetryProcesses,
} from "./leonidasApp.logic";
import { useRelativeTimeTick } from "../settings/settingsLayout";
import { Card, ErrorNote, Segmented, Stat } from "./SystemCareCharts";
import { userErrorToastFields } from "~/lib/userErrorToast";

const HISTORY_WINDOWS = [
  { label: "5m", windowMs: 5 * 60_000, bucketMs: 15_000 },
  { label: "15m", windowMs: 15 * 60_000, bucketMs: 30_000 },
  { label: "30m", windowMs: 30 * 60_000, bucketMs: 60_000 },
  { label: "1h", windowMs: 60 * 60_000, bucketMs: 2 * 60_000 },
] as const;

function formatRate(value: number): string {
  return `${formatBytes(value)}/s`;
}

function formatCpuTime(valueMs: number): string {
  const seconds = valueMs / 1_000;
  if (seconds < 60) return `${seconds.toFixed(seconds >= 10 ? 1 : 2)}s`;
  const minutes = seconds / 60;
  if (minutes < 60) return `${minutes.toFixed(minutes >= 10 ? 1 : 2)}m`;
  return `${(minutes / 60).toFixed(2)}h`;
}

function formatDurationMicros(value: number): string {
  if (value < 1_000) return `${Math.round(value)} µs`;
  if (value < 1_000_000) return `${(value / 1_000).toFixed(2)} ms`;
  return `${(value / 1_000_000).toFixed(2)} s`;
}

function processIdentityKey(process: ResourceTelemetryProcess): string {
  return `${process.identity.pid}:${process.identity.startTimeMs}`;
}

function processSummaryIdentityKey(process: ResourceTelemetryProcessSummary): string {
  return `${process.identity.pid}:${process.identity.startTimeMs}`;
}

function formatProcessName(process: Pick<ResourceTelemetryProcess, "command" | "name">): string {
  if (process.name.trim()) return process.name;
  const firstToken = process.command.trim().split(/\s+/)[0] ?? process.command;
  const normalized = firstToken.replace(/^['"]|['"]$/g, "");
  return normalized.split(/[\\/]/).findLast((segment) => segment.length > 0) ?? normalized;
}

function categoryLabel(category: ResourceTelemetryProcessCategory): string {
  switch (category) {
    case "server":
      return "Server";
    case "server-child":
      return "Backend child";
    case "provider-root":
      return "AI service";
    case "terminal-root":
      return "Terminal";
    case "electron-main":
      return "Electron main";
    case "electron-renderer":
      return "Renderer";
    case "electron-gpu":
      return "GPU";
    case "electron-utility":
      return "Electron utility";
    case "resource-monitor":
      return "Monitor";
    case "unknown-t3":
      return "Leonidas process";
  }
}

function categoryDotClass(category: ResourceTelemetryProcessCategory): string {
  if (category === "resource-monitor") return "bg-warning";
  if (category.startsWith("electron-")) return "bg-info";
  if (category === "server") return "bg-violet-500";
  return "bg-success";
}

function ioSemanticsLabel(semantics: ResourceTelemetryIoSemantics): string {
  switch (semantics) {
    case "storage":
      return "Storage bytes";
    case "logical":
      return "Logical bytes";
    case "all-io":
      return "All I/O bytes";
    case "unavailable":
      return "Unavailable";
  }
}

function booleanStateLabel(
  value: BackgroundBooleanState,
  labels: { readonly true: string; readonly false: string },
): string {
  if (value === "true") return labels.true;
  if (value === "false") return labels.false;
  return "Unknown";
}

function sourceStatusTone(status: ResourceTelemetrySourceStatus): "default" | "warning" | "danger" {
  if (status === "healthy") return "default";
  if (status === "starting" || status === "degraded") return "warning";
  return "danger";
}

function SourceStatusBadge({
  label,
  status,
  presentation,
}: {
  label: string;
  status: ResourceTelemetrySourceStatus;
  presentation?:
    | {
        readonly label: string;
        readonly tone: "neutral";
      }
    | undefined;
}) {
  const tone = presentation?.tone ?? sourceStatusTone(status);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium",
        tone === "neutral" && "border-border/70 bg-muted/45 text-muted-foreground",
        tone === "default" && "border-success/25 bg-success/10 text-success-foreground",
        tone === "warning" && "border-warning/30 bg-warning/10 text-warning-foreground",
        tone === "danger" && "border-destructive/30 bg-destructive/10 text-destructive",
      )}
    >
      <span
        className={cn(
          "size-1.5 rounded-full",
          tone === "neutral" && "bg-muted-foreground/55",
          tone === "default" && "bg-success",
          tone === "warning" && "bg-warning",
          tone === "danger" && "bg-destructive",
        )}
      />
      {label} {presentation?.label ?? status}
    </span>
  );
}

function LastSampleLabel({ sampledAt }: { sampledAt: DateTime.Utc | null }) {
  useRelativeTimeTick();
  if (!sampledAt) {
    return <span className="text-xs text-muted-foreground">Waiting for a reading</span>;
  }
  const relative = formatRelativeTime(DateTime.formatIso(sampledAt));
  if (!relative) {
    return <span className="text-xs text-muted-foreground">Waiting for a reading</span>;
  }
  return (
    <span className="text-xs text-muted-foreground">
      Updated <span className="tabular-nums">{relative.value}</span>
      {relative.suffix ? ` ${relative.suffix}` : ""}
    </span>
  );
}

function AggregateCard({
  label,
  dotClass,
  aggregate,
}: {
  label: string;
  dotClass: string;
  aggregate: ResourceTelemetryAggregate;
}) {
  return (
    <div className="rounded-xl bg-muted/50 p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2 text-sm font-medium">
          <span className={cn("size-2 shrink-0 rounded-full", dotClass)} />
          <span className="truncate">{label}</span>
        </span>
        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
          {aggregate.processCount} {aggregate.processCount === 1 ? "process" : "processes"}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-4 gap-3">
        <MetricPair label="CPU" value={`${aggregate.currentCpuPercent.toFixed(1)}%`} />
        <MetricPair label="Memory" value={formatBytes(aggregate.currentRssBytes)} />
        <MetricPair label="Read" value={formatRate(aggregate.ioReadBytesPerSecond)} />
        <MetricPair label="Write" value={formatRate(aggregate.ioWriteBytesPerSecond)} />
      </div>
    </div>
  );
}

function MetricPair({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="truncate text-sm font-medium tabular-nums">{value}</div>
    </div>
  );
}

function HealthSource({ label, health }: { label: string; health: ResourceTelemetrySourceHealth }) {
  const expectedInBrowser =
    health.status === "unavailable" &&
    Option.exists(health.lastError, (error) => error.includes("'web' mode"));
  return (
    <div className="flex items-start justify-between gap-4 border-t py-3 first:border-t-0 first:pt-0">
      <div className="min-w-0">
        <div className="text-sm font-medium text-foreground">{label}</div>
        <div className="mt-0.5 text-xs text-muted-foreground">
          {expectedInBrowser
            ? "Available only in the Leonidas Code desktop app."
            : Option.match(health.lastError, {
                onNone: () => "No reported errors",
                onSome: (error) => error,
              })}
        </div>
      </div>
      <SourceStatusBadge
        label=""
        status={health.status}
        presentation={
          expectedInBrowser
            ? {
                label: "Desktop only",
                tone: "neutral",
              }
            : undefined
        }
      />
    </div>
  );
}

function DetailRow({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: ReactNode;
  valueClassName?: string | undefined;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-t py-2.5 first:border-t-0 first:pt-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={cn("min-w-0 truncate text-right text-sm tabular-nums", valueClassName)}>
        {value}
      </span>
    </div>
  );
}

function ResourceHistoryChart({
  buckets,
}: {
  buckets: ReadonlyArray<ResourceTelemetryHistoryBucket>;
}) {
  const maxCpu = resourceHistoryCpuScaleMax(buckets);
  const maxIo = Math.max(1, ...buckets.map((bucket) => bucket.ioReadBytes + bucket.ioWriteBytes));

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-1.5 w-3 rounded-full bg-foreground/70" /> Processor (average)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-1.5 w-3 rounded-full bg-info/70" /> Disk reads
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-1.5 w-3 rounded-full bg-warning/80" /> Disk writes
        </span>
      </div>
      <div className="flex h-40 items-end gap-1 overflow-hidden rounded-xl bg-muted/50 px-2 pt-3 pb-2">
        {buckets.map((bucket) => {
          const cpuHeight = resourceHistoryBarHeight({
            value: bucket.avgCpuPercent,
            max: maxCpu,
            minimumVisiblePercent: 2,
          });
          const readHeight = resourceHistoryBarHeight({
            value: bucket.ioReadBytes,
            max: maxIo,
            minimumVisiblePercent: 1,
          });
          const writeHeight = resourceHistoryBarHeight({
            value: bucket.ioWriteBytes,
            max: maxIo,
            minimumVisiblePercent: 1,
          });
          return (
            <Tooltip key={DateTime.formatIso(bucket.startedAt)}>
              <TooltipTrigger
                render={
                  <div className="grid h-full min-w-1 flex-1 grid-cols-3 items-end gap-px">
                    <span
                      className="block rounded-t-sm bg-foreground/65"
                      style={{ height: `${cpuHeight}%` }}
                    />
                    <span
                      className="block rounded-t-sm bg-info/70"
                      style={{ height: `${readHeight}%` }}
                    />
                    <span
                      className="block rounded-t-sm bg-warning/80"
                      style={{ height: `${writeHeight}%` }}
                    />
                  </div>
                }
              />
              <TooltipPopup side="top" className="text-left">
                <div className="space-y-0.5">
                  <div>CPU avg {bucket.avgCpuPercent.toFixed(1)}%</div>
                  <div>CPU peak {bucket.maxCpuPercent.toFixed(1)}%</div>
                  <div>Read {formatBytes(bucket.ioReadBytes)}</div>
                  <div>Write {formatBytes(bucket.ioWriteBytes)}</div>
                </div>
              </TooltipPopup>
            </Tooltip>
          );
        })}
      </div>
    </div>
  );
}

function ProcessTreeName({
  process,
  collapsed,
  onToggle,
}: {
  process: ResourceTelemetryProcess;
  collapsed: boolean;
  onToggle: (process: ResourceTelemetryProcess) => void;
}) {
  const name = formatProcessName(process);
  const hasChildren = process.childPids.length > 0;
  return (
    <div
      className="grid min-w-0 grid-cols-[1.25rem_0.375rem_minmax(0,1fr)] items-center gap-2"
      style={{ paddingLeft: `${Math.min(process.depth, 7) * 10}px` }}
    >
      {hasChildren ? (
        <Button
          size="icon-micro"
          variant="ghost-muted"
          onClick={() => onToggle(process)}
          aria-label={collapsed ? `Expand ${name}` : `Collapse ${name}`}
        >
          <MorphIcon className="size-3.5" icon={collapsed ? ChevronRight : ChevronDown} />
        </Button>
      ) : (
        <span className="size-5" aria-hidden />
      )}
      <span className={cn("size-1.5 rounded-full", categoryDotClass(process.category))} />
      <Tooltip>
        <TooltipTrigger
          render={<span className="min-w-0 truncate font-medium text-foreground">{name}</span>}
        />
        <TooltipPopup side="top" variant="code">
          {process.command || process.name}
        </TooltipPopup>
      </Tooltip>
    </div>
  );
}

function canSignalProcess(process: ResourceTelemetryProcess): boolean {
  return (
    process.category === "server-child" ||
    process.category === "provider-root" ||
    process.category === "terminal-root"
  );
}

function ProcessActions({
  process,
  canMaintainEnvironment,
  signalingKeys,
  onSignal,
}: {
  process: ResourceTelemetryProcess;
  canMaintainEnvironment: boolean;
  signalingKeys: ReadonlySet<string>;
  onSignal: (process: ResourceTelemetryProcess, signal: ServerProcessSignal) => void;
}) {
  if (!canSignalProcess(process)) {
    return <span className="text-3xs text-muted-foreground/35">—</span>;
  }
  const isSignaling = signalingKeys.has(processIdentityKey(process));
  return (
    <ProcessSignalActions
      disabled={!canMaintainEnvironment || isSignaling}
      onSignal={(signal) => onSignal(process, signal)}
    />
  );
}

function ProcessTable({
  processes,
  canMaintainEnvironment,
  signalingKeys,
  onSignal,
}: {
  processes: ReadonlyArray<ResourceTelemetryProcess>;
  canMaintainEnvironment: boolean;
  signalingKeys: ReadonlySet<string>;
  onSignal: (process: ResourceTelemetryProcess, signal: ServerProcessSignal) => void;
}) {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());
  const visible = useMemo(
    () => visibleResourceTelemetryProcesses(processes, collapsed),
    [collapsed, processes],
  );
  const toggle = useCallback((process: ResourceTelemetryProcess) => {
    const identityKey = processIdentityKey(process);
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(identityKey)) {
        next.delete(identityKey);
      } else {
        next.add(identityKey);
      }
      return next;
    });
  }, []);

  return (
    <div className="border-t border-border/60">
      <ScrollArea
        chainVerticalScroll
        scrollFade
        hideScrollbars
        className="max-h-[min(68vh,48rem)] w-full max-w-full"
      >
        <table className="w-full min-w-[1320px] table-fixed text-left text-xs">
          <colgroup>
            <col className="w-[20%]" />
            <col className="w-[10%]" />
            <col className="w-[7%]" />
            <col className="w-[8%]" />
            <col className="w-[9%]" />
            <col className="w-[9%]" />
            <col className="w-[9%]" />
            <col className="w-[10%]" />
            <col className="w-[8%]" />
            <col className="w-[6%]" />
            <col className="w-[4%]" />
          </colgroup>
          <thead className="sticky top-0 z-10 border-b border-border/60 bg-card text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium sm:pl-5">Process</th>
              <th className="px-3 py-2 font-medium">Category</th>
              <th className="px-3 py-2 text-right font-medium">CPU</th>
              <th className="px-3 py-2 text-right font-medium">CPU Time</th>
              <th className="px-3 py-2 text-right font-medium">Memory</th>
              <th className="px-3 py-2 text-right font-medium">Read/s</th>
              <th className="px-3 py-2 text-right font-medium">Write/s</th>
              <th className="px-3 py-2 text-right font-medium">Read Total</th>
              <th className="px-3 py-2 text-right font-medium">Write Total</th>
              <th className="px-3 py-2 text-right font-medium">PID</th>
              <th className="px-2 py-2 text-right font-medium sm:pr-4">Kill</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {visible.length === 0 ? (
              <tr>
                <td colSpan={11} className="px-4 py-5 text-xs text-muted-foreground sm:px-5">
                  Waiting for the process monitor to start.
                </td>
              </tr>
            ) : null}
            {visible.map((process) => (
              <tr key={processIdentityKey(process)} className="hover:bg-muted/20">
                <td className="px-4 py-2 sm:pl-5">
                  <ProcessTreeName
                    process={process}
                    collapsed={collapsed.has(processIdentityKey(process))}
                    onToggle={toggle}
                  />
                </td>
                <td className="truncate px-3 py-2 text-2xs text-muted-foreground">
                  {categoryLabel(process.category)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {process.cpuPercent.toFixed(1)}%
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {formatCpuTime(process.cpuTimeMs)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {formatBytes(process.residentBytes)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-info-foreground">
                  {formatRate(process.ioReadBytesPerSecond)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-warning-foreground">
                  {formatRate(process.ioWriteBytesPerSecond)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                  {formatBytes(process.ioReadBytes)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                  <Tooltip>
                    <TooltipTrigger render={<span>{formatBytes(process.ioWriteBytes)}</span>} />
                    <TooltipPopup side="top">{ioSemanticsLabel(process.ioSemantics)}</TooltipPopup>
                  </Tooltip>
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                  {process.identity.pid}
                </td>
                <td className="px-2 py-2 text-right sm:pr-4">
                  <ProcessActions
                    process={process}
                    canMaintainEnvironment={canMaintainEnvironment}
                    signalingKeys={signalingKeys}
                    onSignal={onSignal}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollArea>
    </div>
  );
}

function HistoryProcessTable({
  processes,
}: {
  processes: ReadonlyArray<ResourceTelemetryProcessSummary>;
}) {
  return (
    <div className="border-t border-border/60">
      <ScrollArea
        chainVerticalScroll
        scrollFade
        hideScrollbars
        className="max-h-[28rem] w-full max-w-full"
      >
        <table className="w-full min-w-[1020px] table-fixed text-left text-xs">
          <colgroup>
            <col className="w-[24%]" />
            <col className="w-[11%]" />
            <col className="w-[10%]" />
            <col className="w-[10%]" />
            <col className="w-[11%]" />
            <col className="w-[11%]" />
            <col className="w-[11%]" />
            <col className="w-[7%]" />
            <col className="w-[5%]" />
          </colgroup>
          <thead className="sticky top-0 z-10 border-b border-border/60 bg-card text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium sm:pl-5">Process</th>
              <th className="px-3 py-2 font-medium">Category</th>
              <th className="px-3 py-2 text-right font-medium">CPU Time</th>
              <th className="px-3 py-2 text-right font-medium">Peak CPU</th>
              <th className="px-3 py-2 text-right font-medium">Peak Mem</th>
              <th className="px-3 py-2 text-right font-medium">Read</th>
              <th className="px-3 py-2 text-right font-medium">Write</th>
              <th className="px-3 py-2 text-right font-medium">Samples</th>
              <th className="px-3 py-2 text-right font-medium sm:pr-5">PID</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {processes.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-5 text-xs text-muted-foreground sm:px-5">
                  No process samples in this time window. Choose a longer time window.
                </td>
              </tr>
            ) : null}
            {processes.map((process) => (
              <tr key={processSummaryIdentityKey(process)} className="hover:bg-muted/20">
                <td className="px-4 py-2 sm:pl-5">
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <span className="block truncate font-medium text-foreground">
                          {process.name || process.command}
                        </span>
                      }
                    />
                    <TooltipPopup side="top" variant="code">
                      {process.command || process.name}
                    </TooltipPopup>
                  </Tooltip>
                </td>
                <td className="truncate px-3 py-2 text-2xs text-muted-foreground">
                  {categoryLabel(process.category)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {formatCpuTime(process.cpuTimeMs)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {process.maxCpuPercent.toFixed(1)}%
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {formatBytes(process.peakRssBytes)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-info-foreground">
                  {formatBytes(process.ioReadBytes)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-warning-foreground">
                  {formatBytes(process.ioWriteBytes)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                  {process.sampleCount}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-muted-foreground sm:pr-5">
                  {process.identity.pid}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollArea>
    </div>
  );
}

function AttributionTable({ entries }: { entries: ReadonlyArray<ResourceAttributionEntry> }) {
  return (
    <div className="overflow-x-auto border-t border-border/60">
      <table className="w-full min-w-[720px] table-fixed text-left text-xs">
        <colgroup>
          <col className="w-[22%]" />
          <col className="w-[28%]" />
          <col className="w-[14%]" />
          <col className="w-[14%]" />
          <col className="w-[10%]" />
          <col className="w-[12%]" />
        </colgroup>
        <thead className="border-b border-border/60 text-xs text-muted-foreground">
          <tr>
            <th className="px-4 py-2 font-medium sm:pl-5">Component</th>
            <th className="px-3 py-2 font-medium">Operation</th>
            <th className="px-3 py-2 text-right font-medium">Logical Read</th>
            <th className="px-3 py-2 text-right font-medium">Logical Write</th>
            <th className="px-3 py-2 text-right font-medium">Count</th>
            <th className="px-3 py-2 text-right font-medium sm:pr-5">Time</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/50">
          {entries.length === 0 ? (
            <tr>
              <td colSpan={6} className="px-4 py-5 text-xs text-muted-foreground sm:px-5">
                No read or write activity recorded yet. Use Leonidas Code for a while, then check
                again.
              </td>
            </tr>
          ) : null}
          {entries.map((entry) => (
            <tr key={`${entry.component}:${entry.operation}`} className="hover:bg-muted/20">
              <td className="truncate px-4 py-2 font-medium text-foreground sm:pl-5">
                {entry.component}
              </td>
              <td className="truncate px-3 py-2 text-muted-foreground">{entry.operation}</td>
              <td className="px-3 py-2 text-right tabular-nums text-info-foreground">
                {formatBytes(entry.logicalReadBytes)}
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-warning-foreground">
                {formatBytes(entry.logicalWriteBytes)}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">{entry.count}</td>
              <td className="px-3 py-2 text-right tabular-nums text-muted-foreground sm:pr-5">
                {(entry.durationMs / 1_000).toFixed(2)}s
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function LeonidasAppPanel({ environmentId }: { environmentId: EnvironmentId | null }) {
  const [windowMs, setWindowMs] = useState(15 * 60_000);
  const selectedWindow =
    HISTORY_WINDOWS.find((option) => option.windowMs === windowMs) ?? HISTORY_WINDOWS[1];
  const canMaintainEnvironment = useEnvironmentScope(environmentId, AuthEnvironmentMaintainScope);
  const telemetry = useResourceTelemetry(environmentId);
  const retryTelemetry = telemetry.retry;
  const history = useResourceTelemetryHistory(
    {
      windowMs: selectedWindow.windowMs,
      bucketMs: selectedWindow.bucketMs,
    },
    environmentId,
  );
  const signalServerProcess = useAtomCommand(serverEnvironment.signalProcess, {
    reportFailure: false,
  });
  const [signalingKeys, setSignalingKeys] = useState<ReadonlySet<string>>(() => new Set());
  const signalingKeysRef = useRef<ReadonlySet<string>>(new Set());
  const environmentIdRef = useRef(environmentId);
  useEffect(() => {
    environmentIdRef.current = environmentId;
    return () => {
      environmentIdRef.current = null;
    };
  }, [environmentId]);
  const [isRetrying, setIsRetrying] = useState(false);
  const snapshot = telemetry.data;
  const allT3 = snapshot?.groups.allT3;

  const signalProcess = useCallback(
    async (process: ResourceTelemetryProcess, signal: ServerProcessSignal) => {
      const targetEnvironmentId = environmentIdRef.current;
      if (
        targetEnvironmentId === null ||
        !readEnvironmentScope(targetEnvironmentId, AuthEnvironmentMaintainScope)
      )
        return;
      const identityKey = processIdentityKey(process);
      if (signalingKeysRef.current.has(identityKey)) return;
      const nextSignalingKeys = new Set(signalingKeysRef.current).add(identityKey);
      signalingKeysRef.current = nextSignalingKeys;
      setSignalingKeys(nextSignalingKeys);
      const clearSignaling = () => {
        const next = new Set(signalingKeysRef.current);
        next.delete(identityKey);
        signalingKeysRef.current = next;
        setSignalingKeys(next);
      };

      if (signal === "SIGKILL") {
        let confirmed = false;
        try {
          confirmed = await ensureLocalApi().dialogs.confirm(
            `Force process ${process.identity.pid} to stop (SIGKILL)? The process cannot refuse or save its work.`,
            { variant: "destructive" },
          );
        } catch (error) {
          clearSignaling();
          toastManager.add({
            type: "error",
            title: "Could not confirm signal",
            ...userErrorToastFields(error),
          });
          return;
        }
        if (!confirmed) {
          clearSignaling();
          return;
        }
      }
      if (
        environmentIdRef.current !== targetEnvironmentId ||
        !readEnvironmentScope(targetEnvironmentId, AuthEnvironmentMaintainScope)
      ) {
        clearSignaling();
        return;
      }
      void signalServerProcess({
        environmentId: targetEnvironmentId,
        input: {
          pid: process.identity.pid,
          startTimeMs: process.identity.startTimeMs,
          signal,
        },
      })
        .then((result) => {
          if (result._tag === "Failure") {
            if (isAtomCommandInterrupted(result)) return;
            throw squashAtomCommandFailure(result);
          }
          if (result.value.signaled) return;
          toastManager.add({
            type: "error",
            title: `Could not send ${signal}`,
            description: Option.getOrElse(
              result.value.message,
              () => `Could not send ${signal} to process ${process.identity.pid}. Try again.`,
            ),
          });
        })
        .catch((error: unknown) => {
          toastManager.add({
            type: "error",
            title: `Could not send ${signal}`,
            ...userErrorToastFields(error),
          });
        })
        .finally(() => {
          clearSignaling();
        });
    },
    [signalServerProcess],
  );

  const retryCollector = useCallback(() => {
    const environmentId = environmentIdRef.current;
    if (
      environmentId === null ||
      !readEnvironmentScope(environmentId, AuthEnvironmentMaintainScope)
    )
      return;
    setIsRetrying(true);
    void retryTelemetry()
      .catch((error: unknown) => {
        toastManager.add({
          type: "error",
          title: "Could not restart resource monitor",
          ...userErrorToastFields(error),
        });
      })
      .finally(() => {
        setIsRetrying(false);
      });
  }, [retryTelemetry]);

  const speedLimit = snapshot ? Option.getOrNull(snapshot.speedLimitPercent) : null;
  const collectorNeedsRetry = shouldShowResourceMonitorRetry({
    nativeStatus: snapshot?.health.native.status ?? null,
    error: telemetry.error,
  });
  const hasHostPowerSignal =
    snapshot !== null &&
    (snapshot.power.onBattery !== "unknown" ||
      snapshot.power.lowPowerMode !== "unknown" ||
      snapshot.power.idle !== "unknown" ||
      snapshot.power.locked !== "unknown" ||
      snapshot.power.thermalState !== "unknown");

  return (
    <div className="flex flex-col gap-4">
      <Card
        title="Leonidas Code footprint"
        hint="The app, its AI services, terminals and this monitor, live."
        action={
          <div className="flex items-center gap-2">
            {snapshot ? (
              <SourceStatusBadge label="Monitor" status={snapshot.health.native.status} />
            ) : null}
            <LastSampleLabel sampledAt={snapshot?.readAt ?? null} />
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    size="icon-xs"
                    variant="ghost-muted"
                    disabled={telemetry.isPending}
                    onClick={telemetry.refresh}
                    aria-label="Refresh footprint"
                  >
                    <RefreshIcon refreshing={telemetry.isPending} />
                  </Button>
                }
              />
              <TooltipPopup side="top">Refresh footprint</TooltipPopup>
            </Tooltip>
          </div>
        }
      >
        <div className="grid grid-cols-2 gap-x-6 gap-y-5 md:grid-cols-3 2xl:grid-cols-6">
          <Stat
            label="Processor"
            value={allT3 ? `${allT3.currentCpuPercent.toFixed(1)}%` : "-"}
            detail={allT3 ? `${formatCpuTime(allT3.cpuTimeMs)} used so far` : undefined}
          />
          <Stat
            label="Memory"
            value={allT3 ? formatBytes(allT3.currentRssBytes) : "-"}
            detail={allT3 ? `Peak ${formatBytes(allT3.peakRssBytes)}` : undefined}
          />
          <Stat
            label="Processes"
            value={allT3 ? String(allT3.processCount) : "-"}
            detail={
              allT3 ? `${allT3.processStarts} started · ${allT3.processExits} ended` : undefined
            }
          />
          <Stat
            label="Reading"
            value={allT3 ? formatRate(allT3.ioReadBytesPerSecond) : "-"}
            detail={allT3 ? `${formatBytes(allT3.ioReadBytes)} in total` : undefined}
          />
          <Stat
            label="Writing"
            value={allT3 ? formatRate(allT3.ioWriteBytesPerSecond) : "-"}
            detail={allT3 ? `${formatBytes(allT3.ioWriteBytes)} in total` : undefined}
            level={
              allT3 && allT3.ioWriteBytesPerSecond >= 10 * 1_024 * 1_024
                ? "critical"
                : allT3 && allT3.ioWriteBytesPerSecond >= 1_024 * 1_024
                  ? "warning"
                  : undefined
            }
          />
          <Stat
            label="Processor speed limit"
            value={snapshot ? (speedLimit === null ? "Unknown" : `${speedLimit.toFixed(0)}%`) : "-"}
            detail={snapshot ? `Heat state: ${snapshot.power.thermalState}` : undefined}
            level={speedLimit !== null && speedLimit < 80 ? "warning" : undefined}
          />
        </div>
        {telemetry.error ? <ErrorNote className="mt-4">{telemetry.error}</ErrorNote> : null}
        {snapshot ? (
          <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-3">
            <AggregateCard
              label="Background service and AI"
              dotClass="bg-success"
              aggregate={snapshot.groups.backend}
            />
            <AggregateCard
              label="Desktop app"
              dotClass="bg-info"
              aggregate={snapshot.groups.electron}
            />
            <AggregateCard
              label="Monitor"
              dotClass="bg-warning"
              aggregate={snapshot.groups.monitor}
            />
          </div>
        ) : null}
      </Card>

      <Card
        title="Running processes"
        hint="Every process Leonidas Code started, as a tree."
        className="overflow-hidden"
      >
        <div className="-mx-5 -mb-5 max-h-128 overflow-y-auto">
          <ProcessTable
            processes={snapshot?.processes ?? []}
            canMaintainEnvironment={canMaintainEnvironment}
            signalingKeys={signalingKeys}
            onSignal={signalProcess}
          />
        </div>
      </Card>

      <Card
        title="Timeline"
        hint="Processor and disk use by Leonidas Code."
        className="overflow-hidden"
        action={
          <div className="flex items-center gap-1.5">
            <Segmented
              label="Timeline period"
              value={String(windowMs)}
              options={HISTORY_WINDOWS.map((option) => ({
                value: String(option.windowMs),
                label: option.label,
              }))}
              onChange={(value) => setWindowMs(Number(value))}
            />
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    size="icon-xs"
                    variant="ghost-muted"
                    disabled={history.isPending}
                    onClick={history.refresh}
                    aria-label="Refresh timeline"
                  >
                    <RefreshIcon refreshing={history.isPending} />
                  </Button>
                }
              />
              <TooltipPopup side="top">Refresh timeline</TooltipPopup>
            </Tooltip>
          </div>
        }
      >
        {history.error ? <ErrorNote className="mb-4">{history.error}</ErrorNote> : null}
        <ResourceHistoryChart buckets={history.data?.buckets ?? []} />
        <div className="-mx-5 -mb-5 mt-5">
          <HistoryProcessTable processes={history.data?.topProcesses ?? []} />
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Computer state">
          {hasHostPowerSignal && snapshot ? (
            <div>
              <DetailRow
                label="Power source"
                value={booleanStateLabel(snapshot.power.onBattery, {
                  true: "Battery",
                  false: "Plugged in",
                })}
              />
              <DetailRow
                label="Low power mode"
                value={booleanStateLabel(snapshot.power.lowPowerMode, {
                  true: "On",
                  false: "Off",
                })}
              />
              <DetailRow
                label="Activity"
                value={`${booleanStateLabel(snapshot.power.idle, {
                  true: "Idle",
                  false: "Active",
                })}${
                  snapshot.power.idleSeconds === null
                    ? ""
                    : ` · ${Math.round(snapshot.power.idleSeconds)}s`
                }`}
              />
              <DetailRow
                label="Session"
                value={
                  snapshot.power.suspended
                    ? "Suspended"
                    : booleanStateLabel(snapshot.power.locked, {
                        true: "Locked",
                        false: "Unlocked",
                      })
                }
              />
              <DetailRow
                label="Heat"
                value={snapshot.power.thermalState}
                valueClassName={
                  snapshot.power.thermalState === "serious" ||
                  snapshot.power.thermalState === "critical"
                    ? "text-destructive"
                    : undefined
                }
              />
            </div>
          ) : (
            <p className="rounded-xl bg-muted/50 px-4 py-6 text-sm text-muted-foreground">
              The desktop app reports power, idle, lock and heat state. Process data still works in
              this browser.
            </p>
          )}
        </Card>

        <Card
          title="Monitor health"
          action={
            collectorNeedsRetry ? (
              <Button size="xs" variant="outline" disabled={isRetrying} onClick={retryCollector}>
                <RefreshIcon size="xs" refreshing={isRetrying} />
                Restart monitor
              </Button>
            ) : null
          }
        >
          {snapshot ? (
            <div>
              <HealthSource label="Process monitor" health={snapshot.health.native} />
              <HealthSource label="Desktop app" health={snapshot.health.desktop} />
              <DetailRow
                label="Time per reading"
                value={formatDurationMicros(snapshot.health.collectionDurationMicros)}
              />
              <DetailRow
                label="Processes kept"
                value={`${snapshot.health.retainedProcessCount} of ${snapshot.health.scannedProcessCount}`}
              />
              <DetailRow
                label="Not readable"
                value={String(snapshot.health.inaccessibleProcessCount)}
                valueClassName={
                  snapshot.health.inaccessibleProcessCount > 0 ? "text-warning" : undefined
                }
              />
              <DetailRow
                label="Helper"
                value={Option.match(snapshot.health.sidecarVersion, {
                  onNone: () => "Unavailable",
                  onSome: (version) =>
                    `${version}${Option.match(snapshot.health.sidecarPid, {
                      onNone: () => "",
                      onSome: (pid) => ` · PID ${pid}`,
                    })}`,
                })}
              />
              <DetailRow label="Restarts" value={String(snapshot.health.restartCount)} />
            </div>
          ) : (
            <p className="rounded-xl bg-muted/50 px-4 py-6 text-sm text-muted-foreground">
              Waiting for the monitor.
            </p>
          )}
        </Card>
      </div>

      <Card
        title="App reads and writes"
        hint="Which Leonidas Code actions read or write data. Compare with the process list to find a spike."
        className="overflow-hidden"
      >
        <div className="-mx-5 -mb-5">
          <AttributionTable entries={snapshot?.attribution.entries ?? []} />
        </div>
      </Card>
    </div>
  );
}
