import type { HardwareInventory, HardwareSample } from "@t3tools/contracts";
import {
  ActivityIcon,
  CpuIcon,
  GaugeIcon,
  HardDriveIcon,
  LayoutGridIcon,
  ScrollTextIcon,
  MemoryStickIcon,
  MonitorIcon,
  SparklesIcon,
  WrenchIcon,
} from "lucide-react";
import type { KeyboardEvent, ReactNode } from "react";

import { cn } from "~/lib/utils";
import { Button } from "../ui/button";
import { Card } from "./SystemCareCharts";
import { isDiscreteGpu } from "@t3tools/shared/hardwareWatch";

import {
  PART_EXPLAINER,
  ageText,
  driverDateText,
  type HealthScore,
  type QuickWin,
} from "./pcInsights.logic";
import { formatBytes, formatValue } from "./systemCare.logic";

const scoreTone = (score: number | null) =>
  score === null
    ? "text-muted-foreground stroke-muted-foreground/40"
    : score >= 90
      ? "text-success stroke-success"
      : score >= 70
        ? "text-primary stroke-primary"
        : score >= 50
          ? "text-warning stroke-warning"
          : "text-destructive stroke-destructive";

/** The big health number in the page header. */
export function ScoreRing(props: { health: HealthScore }) {
  const { score } = props.health;
  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  const fill = score === null ? 0 : score / 100;
  return (
    <div className={cn("relative size-24 shrink-0", scoreTone(score))}>
      <svg viewBox="0 0 100 100" className="size-full -rotate-90" aria-hidden="true">
        <circle cx="50" cy="50" r={radius} fill="none" strokeWidth="7" className="stroke-muted" />
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={`${fill * circumference} ${circumference}`}
          className="transition-[stroke-dasharray] duration-700 ease-out motion-reduce:transition-none"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-semibold tabular-nums leading-none">{score ?? "-"}</span>
        <span className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">
          score
        </span>
      </div>
    </div>
  );
}

export const PC_TABS = [
  { id: "overview", label: "Overview", icon: GaugeIcon },
  { id: "parts", label: "Your parts", icon: LayoutGridIcon },
  { id: "history", label: "History", icon: SparklesIcon },
  { id: "app", label: "Leonidas Code", icon: ActivityIcon },
  { id: "logs", label: "Logs and errors", icon: ScrollTextIcon },
  { id: "settings", label: "Settings", icon: WrenchIcon },
] as const;

export type PcTab = (typeof PC_TABS)[number]["id"];

/** Sticky tabs. Arrow keys, Home and End move between them. */
export function PcTabs(props: { value: PcTab; onChange: (tab: PcTab) => void }) {
  const select = (index: number) => {
    const tab = PC_TABS[(index + PC_TABS.length) % PC_TABS.length];
    if (!tab) return;
    props.onChange(tab.id);
    document.getElementById(`pc-tab-${tab.id}`)?.focus();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = PC_TABS.findIndex((tab) => tab.id === props.value);
    const next =
      event.key === "ArrowRight"
        ? index + 1
        : event.key === "ArrowLeft"
          ? index - 1
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? PC_TABS.length - 1
              : null;
    if (next === null) return;
    event.preventDefault();
    select(next);
  };
  return (
    <div
      role="tablist"
      aria-label="PC Tuning"
      onKeyDown={onKeyDown}
      className="sticky top-0 z-10 -mx-1 flex gap-1 overflow-x-auto rounded-xl border bg-background/85 p-1 backdrop-blur"
    >
      {PC_TABS.map((tab) => {
        const selected = tab.id === props.value;
        return (
          <button
            key={tab.id}
            id={`pc-tab-${tab.id}`}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={`pc-panel-${tab.id}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => props.onChange(tab.id)}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors motion-reduce:transition-none",
              selected
                ? "bg-muted font-medium text-foreground"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
            )}
          >
            <tab.icon className="size-4" />
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

/** One tile per processor thread, brighter when busier: shows if one app hogs one core. */
export function CoreGrid(props: { loads: ReadonlyArray<number> }) {
  if (props.loads.length === 0) return null;
  return (
    <div>
      <div className="mb-1.5 flex justify-between text-xs text-muted-foreground">
        <span>Each thread</span>
        <span className="tabular-nums">{props.loads.length} threads</span>
      </div>
      <div
        className="grid gap-1"
        style={{
          gridTemplateColumns: `repeat(${Math.min(12, props.loads.length)}, minmax(0, 1fr))`,
        }}
      >
        {props.loads.map((load, index) => (
          <div
            // Threads have a fixed order, so the index is a stable key.
            // oxlint-disable-next-line react/no-array-index-key
            key={index}
            title={`Thread ${index + 1}: ${Math.round(load)}%`}
            className="h-3 rounded-sm bg-primary"
            style={{ opacity: 0.12 + Math.min(100, Math.max(0, load)) / 115 }}
          />
        ))}
      </div>
    </div>
  );
}

function Fact(props: { label: string; value: ReactNode }) {
  if (props.value === null || props.value === undefined || props.value === "") return null;
  return (
    <div className="flex justify-between gap-3 py-1 text-sm">
      <dt className="text-muted-foreground">{props.label}</dt>
      <dd className="min-w-0 truncate text-right tabular-nums">{props.value}</dd>
    </div>
  );
}

function PartTile(props: {
  icon: typeof CpuIcon;
  title: string;
  name: string;
  explainer: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl border bg-background/50 p-4">
      <div className="flex items-start gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <props.icon className="size-4.5" />
        </div>
        <div className="min-w-0">
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {props.title}
          </div>
          <div className="truncate font-medium" title={props.name}>
            {props.name}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">{props.explainer}</p>
        </div>
      </div>
      <dl className="mt-3 divide-y divide-border/60">{props.children}</dl>
    </div>
  );
}

const HEALTH_WORD = {
  healthy: "Healthy",
  warning: "Warning",
  unhealthy: "Failing",
  unknown: "Unknown",
} as const;

/** Every part in plain words, with the details an expert wants one glance away. */
export function PartsCard(props: {
  inventory: HardwareInventory | null;
  sample: HardwareSample | null;
  uptime: string | null;
}) {
  const inv = props.inventory;
  if (!inv) {
    return (
      <Card title="Your parts">
        <p className="text-sm text-muted-foreground">Reading your parts...</p>
      </Card>
    );
  }
  const liveGpu = (index: number) => props.sample?.gpus.find((gpu) => gpu.index === index);
  return (
    <Card title="Your parts" hint="What is inside this computer, and what each part does.">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3">
        <PartTile
          icon={CpuIcon}
          title="Processor"
          name={inv.cpu.name}
          explainer={PART_EXPLAINER.cpu}
        >
          <Fact label="Cores / threads" value={`${inv.cpu.cores ?? "?"} / ${inv.cpu.threads}`} />
          <Fact
            label="Base speed"
            value={inv.cpu.baseClockMhz ? formatValue(inv.cpu.baseClockMhz, "MHz") : null}
          />
          <Fact
            label="Speed now"
            value={props.sample ? formatValue(props.sample.cpu.clockMhz, "MHz") : null}
          />
          <Fact
            label="Power now"
            value={
              props.sample?.cpu.powerW != null ? formatValue(props.sample.cpu.powerW, "W") : null
            }
          />
          <Fact
            label="Cache (L3)"
            value={inv.cpu.l3CacheKb ? `${Math.round(inv.cpu.l3CacheKb / 1024)} MB` : null}
          />
          <Fact label="Socket" value={inv.cpu.socket} />
          <Fact
            label="Virtualization"
            value={
              inv.cpu.virtualizationEnabled === null
                ? null
                : inv.cpu.virtualizationEnabled
                  ? "On"
                  : "Off"
            }
          />
        </PartTile>

        {(inv.gpus.some(isDiscreteGpu) ? inv.gpus.filter(isDiscreteGpu) : inv.gpus).map(
          (gpu, index) => {
            const live = liveGpu(index);
            return (
              <PartTile
                key={gpu.name + index}
                icon={MonitorIcon}
                title="Graphics"
                name={gpu.name}
                explainer={PART_EXPLAINER.gpu}
              >
                <Fact
                  label="Video memory"
                  value={
                    live?.vramTotalBytes
                      ? formatBytes(live.vramTotalBytes, 0)
                      : gpu.vramBytes
                        ? formatBytes(gpu.vramBytes, 0)
                        : null
                  }
                />
                <Fact
                  label="Driver"
                  value={
                    gpu.driverVersion
                      ? `${gpu.driverVersion}${gpu.driverDate ? ` (${driverDateText(gpu.driverDate)})` : ""}`
                      : null
                  }
                />
                <Fact
                  label="Core speed now"
                  value={live?.coreClockMhz != null ? formatValue(live.coreClockMhz, "MHz") : null}
                />
                <Fact
                  label="Power"
                  value={
                    live?.powerW != null
                      ? `${formatValue(live.powerW, "W")}${live.powerLimitW ? ` of ${formatValue(live.powerLimitW, "W")}` : ""}`
                      : null
                  }
                />
                <Fact
                  label="Fan"
                  value={live?.fanPct != null ? `${Math.round(live.fanPct)}%` : null}
                />
                <Fact
                  label="Hot spot"
                  value={live?.hotspotC != null ? formatValue(live.hotspotC, "°C") : null}
                />
                <Fact
                  label="Slowing down"
                  value={
                    live
                      ? live.thermalThrottling
                        ? "Yes, too hot"
                        : live.powerThrottling
                          ? "At power limit"
                          : "No"
                      : null
                  }
                />
              </PartTile>
            );
          },
        )}

        <PartTile
          icon={MemoryStickIcon}
          title="Memory"
          name={`${formatBytes(inv.memory.totalBytes, 0)} total`}
          explainer={PART_EXPLAINER.memory}
        >
          <Fact label="Sticks" value={inv.memory.modules.length || null} />
          {inv.memory.modules.map((module, index) => (
            <Fact
              // oxlint-disable-next-line react/no-array-index-key
              key={`${module.slot}-${index}`}
              label={module.slot ?? `Stick ${index + 1}`}
              value={`${formatBytes(module.capacityBytes, 0)} · ${module.configuredSpeedMts ?? "?"}${module.speedMts && module.speedMts !== module.configuredSpeedMts ? ` of ${module.speedMts}` : ""} MT/s`}
            />
          ))}
          <Fact label="Maker" value={inv.memory.modules[0]?.manufacturer?.trim() || null} />
        </PartTile>

        {inv.disks.map((disk) => (
          <PartTile
            key={disk.id}
            icon={HardDriveIcon}
            title={`Drive ${disk.id}`}
            name={disk.model}
            explainer={PART_EXPLAINER.storage}
          >
            <Fact label="Size" value={formatBytes(disk.sizeBytes, 0)} />
            <Fact
              label="Type"
              value={`${disk.mediaType === "ssd" ? "Solid state (fast)" : disk.mediaType === "hdd" ? "Spinning disk (slow)" : "Unknown"}${disk.busType ? ` · ${disk.busType}` : ""}`}
            />
            <Fact label="Health" value={HEALTH_WORD[disk.health]} />
            <Fact label="Age" value={ageText(disk.powerOnHours)} />
            <Fact
              label="Wear"
              value={disk.wearPct !== null ? `${Math.round(disk.wearPct)}%` : null}
            />
            <Fact
              label="Temperature"
              value={formatValue(
                props.sample?.driveTemps.find((drive) => drive.diskId === disk.id)?.tempC,
                "°C",
              )}
            />
          </PartTile>
        ))}

        <PartTile
          icon={LayoutGridIcon}
          title="Board and system"
          name={
            [inv.board.manufacturer, inv.board.product].filter(Boolean).join(" ") || "Unknown board"
          }
          explainer={PART_EXPLAINER.board}
        >
          <Fact
            label="BIOS"
            value={
              inv.board.biosVersion
                ? `${inv.board.biosVersion}${inv.board.biosDate ? ` (${inv.board.biosDate})` : ""}`
                : null
            }
          />
          <Fact label="Windows" value={`${inv.os.name} ${inv.os.version}`} />
          <Fact label="Computer name" value={inv.os.hostname} />
          <Fact label="On for" value={props.uptime} />
        </PartTile>
      </div>
    </Card>
  );
}

const IMPACT_STYLE = {
  high: "bg-destructive/12 text-destructive",
  medium: "bg-warning/12 text-warning",
  low: "bg-muted text-muted-foreground",
} as const;

/** Gains the readings already prove, each one click from an agent that fixes it. */
export function QuickWinsCard(props: {
  wins: ReadonlyArray<QuickWin>;
  busy: boolean;
  onTune: () => void;
}) {
  return (
    <Card
      title="Quick wins"
      hint="Found in your readings. Tune my PC fixes them with you, one step at a time."
      action={
        props.wins.length > 0 ? (
          <Button size="sm" disabled={props.busy} onClick={props.onTune}>
            Fix these with an agent
          </Button>
        ) : null
      }
    >
      {props.wins.length === 0 ? (
        <div className="flex items-center gap-3 rounded-xl bg-muted/50 px-4 py-6 text-sm text-muted-foreground">
          <span className="size-2.5 rounded-full bg-success" />
          No easy wins found. Run Tune my PC for a full check with a speed test.
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {props.wins.map((win) => (
            <li
              key={win.id}
              className="flex items-start gap-3 rounded-xl border bg-background/60 p-3"
            >
              <span
                className={cn(
                  "mt-0.5 shrink-0 rounded-md px-2 py-0.5 text-[11px] font-medium uppercase",
                  IMPACT_STYLE[win.impact],
                )}
              >
                {win.impact}
              </span>
              <div className="min-w-0">
                <div className="text-sm font-medium">{win.title}</div>
                <p className="text-xs text-muted-foreground">{win.detail}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
