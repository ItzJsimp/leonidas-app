import type { ScheduledTaskSchedule } from "@t3tools/contracts";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import { Link } from "@tanstack/react-router";
import {
  ArrowLeftIcon,
  FileCodeIcon,
  PencilIcon,
  PlayIcon,
  SearchIcon,
  ZapIcon,
} from "lucide-react";
import {
  type CSSProperties,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
  useEffect,
  useMemo,
  useState,
} from "react";

import { requestConfirmDialog } from "../../confirmDialog";
import { cn } from "../../lib/utils";
import { usePrimaryEnvironmentId } from "../../state/environments";
import { serverEnvironment } from "../../state/server";
import { RESIZABLE_WIDTH_PROPERTY, useResizableWidth } from "../../hooks/useResizableWidth";
import { useAtomCommand } from "../../state/use-atom-command";
import { useOpenAiosFile } from "../aiosFile/useOpenAiosFile";
import { useNowMs } from "../commandCenter/useHomeReads";
import { RightPanelResizeHandle } from "../preview/RightPanelResizeHandle";
import { SystemCarePage } from "../systemCare/SystemCarePage";
import { WindowHeader } from "../twoState/WindowHeader";
import { Button } from "../ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "../ui/empty";
import { Input } from "../ui/input";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { Popover, PopoverClose, PopoverPopup, PopoverTrigger } from "../ui/popover";
import { Switch } from "../ui/switch";
import { toastManager } from "../ui/toast";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import {
  type AutomationRow,
  filterRows,
  type GroupId,
  groupMarks,
  GROUPS,
  type Lane,
  type Mark,
  type MarkGroup,
  NOW_X,
  scheduleWords,
  type ShowFilter,
  statusOf,
  summarize,
  timeLabel,
  timeline,
  timelineTicks,
} from "./automations.logic";
import {
  automationsRunNow,
  automationsSetEnabled,
  automationsSetSchedule,
  useAutomations,
} from "./state";

export type AutomationsView = "automations" | "machine";

const VIEWS = [
  { id: "automations", label: "Automations" },
  { id: "machine", label: "Machine" },
] as const;

const TONE = {
  warn: "bg-warning text-background",
  error: "bg-error text-primary-foreground",
  ok: "bg-surface-raised text-foreground",
  off: "bg-input text-foreground",
  state: "bg-state text-state-foreground",
  none: "border border-input text-muted-foreground",
} as const;

function Tip(props: { readonly tip: ReactNode; readonly children: ReactElement }) {
  return (
    <Tooltip>
      <TooltipTrigger render={props.children} />
      <TooltipPopup>{props.tip}</TooltipPopup>
    </Tooltip>
  );
}

function StatusChip({ row }: { readonly row: AutomationRow }) {
  const status = statusOf(row);
  return (
    <span
      className={cn(
        "inline-flex h-5.5 shrink-0 items-center rounded-full px-2 text-2xs font-medium whitespace-nowrap",
        TONE[status.tone],
      )}
    >
      {status.label}
    </span>
  );
}

export function AutomationsPage(props: {
  readonly view: AutomationsView;
  readonly selectedId: string | undefined;
  readonly onView: (view: AutomationsView) => void;
  readonly onSelect: (id: string | undefined) => void;
}) {
  const data = useAutomations();
  // Ticks each minute, so the now line and Next up stay true while the tab is open.
  const now = useNowMs();
  const summary = useMemo(() => summarize(data.rows, now), [data.rows, now]);
  const status =
    summary.needs.length > 0
      ? `${summary.needs.length} ${summary.needs.length === 1 ? "needs" : "need"} a look`
      : "Nothing needs you";
  return (
    <div className="isolate flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <WindowHeader
        title="Automations"
        actions={
          <span
            aria-live="polite"
            className="inline-flex items-center gap-2 text-xs text-muted-foreground"
          >
            <span
              aria-hidden
              className={cn(
                "size-2 rounded-full",
                summary.needs.length > 0 ? "bg-warning" : "bg-state",
              )}
            />
            {status}
            {data.registerBuiltAt
              ? ` · register built ${timeLabel(Date.parse(data.registerBuiltAt), now)}`
              : ""}
          </span>
        }
        tabs={VIEWS}
        active={props.view}
        onSelect={(id) => props.onView(id === "machine" ? "machine" : "automations")}
        idBase="automations"
      />
      <div
        role="tabpanel"
        id="automations-panel"
        aria-labelledby={`automations-tab-${props.view}`}
        className="flex min-h-0 flex-1 flex-col overflow-hidden"
      >
        {props.view === "machine" ? (
          <SystemCarePage embedded />
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto bg-background scrollbar-gutter-both">
            <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-4 p-4 sm:p-6">
              {data.error && data.rows.length === 0 ? (
                <Empty>
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <ZapIcon />
                    </EmptyMedia>
                    <EmptyTitle>Could not load automations</EmptyTitle>
                    <EmptyDescription>{data.error}</EmptyDescription>
                  </EmptyHeader>
                  <Button variant="outline" onClick={data.refresh}>
                    Try again
                  </Button>
                </Empty>
              ) : (
                <>
                  <SummaryCards summary={summary} now={now} onSelect={props.onSelect} />
                  <Timeline rows={data.rows} now={now} onSelect={props.onSelect} />
                  <Browse
                    rows={data.rows}
                    loading={data.loading}
                    now={now}
                    onChanged={data.refresh}
                    {...props}
                  />
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryCards(props: {
  readonly summary: ReturnType<typeof summarize>;
  readonly now: number;
  readonly onSelect: (id: string) => void;
}) {
  const { needs, stopped, next, alwaysOn } = props.summary;
  const names = (rows: ReadonlyArray<AutomationRow>) =>
    rows.length === 0
      ? "None"
      : rows
          .slice(0, 3)
          .map((row) => row.name)
          .join(", ");
  const minutes = next?.nextRunAt
    ? Math.max(0, Math.round((Date.parse(next.nextRunAt) - props.now) / 60_000))
    : 0;
  const cards = [
    { label: "Needs you", value: String(needs.length), line: names(needs), id: needs[0]?.id },
    {
      label: "Next up",
      value: next?.nextRunAt ? timeLabel(Date.parse(next.nextRunAt), props.now) : "None",
      line: next
        ? `${next.name}, ${minutes < 1 ? "now" : `in ${minutes < 60 ? `${minutes} minutes` : `${Math.round(minutes / 60)} hours`}`}`
        : "Nothing scheduled",
      id: next?.id,
    },
    {
      label: "Always on",
      value: String(alwaysOn),
      line: "Background processes running now",
      id: undefined,
    },
    { label: "Stopped", value: String(stopped.length), line: names(stopped), id: stopped[0]?.id },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {cards.map((card) => (
        <Tip
          key={card.label}
          tip={card.id ? `Open ${card.line.split(",")[0]}` : `${card.label}: ${card.line}`}
        >
          <button
            type="button"
            disabled={card.id === undefined}
            onClick={() => card.id && props.onSelect(card.id)}
            className="rounded-xl border border-border bg-card px-4 py-3.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset enabled:hover:bg-surface-raised disabled:cursor-default"
          >
            <div className="text-xs text-muted-foreground">{card.label}</div>
            <div className="mt-1 text-xl font-semibold tabular-nums">{card.value}</div>
            <div className="truncate text-xs text-muted-foreground">{card.line}</div>
          </button>
        </Tip>
      ))}
    </div>
  );
}

/** One color and one shape per kind, so the kind still reads without color. */
const LANE_STYLE: Record<
  Lane,
  { readonly fill: string; readonly ring: string; readonly shape: string; readonly label: string }
> = {
  app: { fill: "bg-series-1", ring: "text-series-1", shape: "rounded-full", label: "App watcher" },
  agents: {
    fill: "bg-series-2",
    ring: "text-series-2",
    shape: "rotate-45 rounded-[1px]",
    label: "Agent schedule",
  },
  windows: {
    fill: "bg-muted-foreground",
    ring: "text-muted-foreground",
    shape: "rounded-[2px]",
    label: "Windows task",
  },
};

function Dot(props: { readonly lane: Lane; readonly past?: boolean }) {
  const style = LANE_STYLE[props.lane];
  return (
    <span
      aria-hidden
      className={cn(
        "block size-2.5",
        style.shape,
        props.past ? cn("border-2 border-current bg-transparent", style.ring) : style.fill,
      )}
    />
  );
}

function clock(at: number) {
  return new Date(at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function untilText(at: number, now: number) {
  const minutes = Math.round((at - now) / 60_000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `in ${minutes} min`;
  return `in ${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

function TimelineMark(props: {
  readonly lane: Lane;
  readonly group: MarkGroup;
  readonly now: number;
  readonly byId: ReadonlyMap<string, AutomationRow>;
  readonly onSelect: (id: string) => void;
}) {
  const { group, lane } = props;
  const when = (mark: Mark) =>
    mark.past
      ? `Ran at ${clock(mark.at)}`
      : `Runs at ${clock(mark.at)}, ${untilText(mark.at, props.now)}`;
  const first = group.items[0]!;
  const many = group.items.length > 1;
  const label = many
    ? `${group.items.length} ${lane === "windows" ? "Windows task" : LANE_STYLE[lane].label.toLowerCase()} runs around ${clock(group.at)}. Pick one.`
    : `${first.name}: ${when(first)}. Open it.`;
  const card = (
    <div className="flex max-w-72 flex-col gap-1 py-0.5">
      {group.items.slice(0, 6).map((mark) => {
        const row = props.byId.get(mark.id);
        return (
          <div key={`${mark.id}-${mark.at}`} className="flex flex-col">
            <div className="flex items-center gap-1.5 font-medium">
              <Dot lane={lane} past={mark.past} />
              {mark.name}
            </div>
            <div>{when(mark)}</div>
            {row && !many ? (
              <div className="text-muted-foreground">
                {LANE_STYLE[lane].label} · {row.scheduleText} · {statusOf(row).label}
              </div>
            ) : null}
          </div>
        );
      })}
      {group.items.length > 6 ? (
        <div className="text-muted-foreground">and {group.items.length - 6} more</div>
      ) : null}
      <div className="text-muted-foreground">
        {many ? "Select to pick one." : "Select to open it below."}
      </div>
    </div>
  );
  const dot = (
    <button
      type="button"
      aria-label={label}
      onClick={many ? undefined : () => props.onSelect(first.id)}
      style={{ left: `${(group.x * 100).toFixed(2)}%` }}
      className="absolute top-1/2 grid size-5 -translate-1/2 place-items-center rounded-md outline-none hover:bg-surface-raised focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
    >
      <Dot lane={lane} past={group.past} />
      {many ? (
        <span className="absolute -top-1.5 -right-1.5 min-w-3.5 rounded-full bg-foreground px-0.5 text-center text-4xs leading-3.5 font-semibold text-background tabular-nums">
          {group.items.length}
        </span>
      ) : null}
    </button>
  );
  if (!many) return <Tip tip={card}>{dot}</Tip>;
  return (
    <Popover>
      <Tip tip={card}>
        <PopoverTrigger render={dot} />
      </Tip>
      <PopoverPopup align="center" className="w-72" aria-label={`Runs around ${clock(group.at)}`}>
        <div className="flex flex-col">
          {group.items.map((mark) => (
            <PopoverClose
              key={`${mark.id}-${mark.at}`}
              render={
                <button
                  type="button"
                  onClick={() => props.onSelect(mark.id)}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none hover:bg-surface-raised focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                />
              }
            >
              <Dot lane={lane} past={mark.past} />
              <span className="min-w-0 flex-1 truncate">{mark.name}</span>
              <span className="text-xs text-muted-foreground tabular-nums">{clock(mark.at)}</span>
            </PopoverClose>
          ))}
        </div>
      </PopoverPopup>
    </Popover>
  );
}

function Timeline(props: {
  readonly rows: ReadonlyArray<AutomationRow>;
  readonly now: number;
  readonly onSelect: (id: string) => void;
}) {
  const lanes = useMemo(() => timeline(props.rows, props.now), [props.rows, props.now]);
  const ticks = useMemo(() => timelineTicks(props.now), [props.now]);
  const byId = useMemo(() => new Map(props.rows.map((row) => [row.id, row])), [props.rows]);
  const counts = (group: GroupId) => props.rows.filter((row) => row.group === group).length;
  const nextAgent = props.rows
    .filter((row) => row.group === "agents" && row.enabled !== false && row.nextRunAt)
    .toSorted((a, b) => Date.parse(a.nextRunAt!) - Date.parse(b.nextRunAt!))[0];
  const nowLeft = `${(NOW_X * 100).toFixed(2)}%`;
  return (
    <section
      aria-label="Timeline"
      className="rounded-xl border border-border bg-card px-4 pt-3.5 pb-3"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h2 className="text-sm font-semibold">Last 2 hours and next 22 hours</h2>
        <ul
          aria-label="Legend"
          className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground"
        >
          {(["app", "agents", "windows"] as const).map((lane) => (
            <li key={lane} className="flex items-center gap-1.5">
              <Dot lane={lane} />
              {LANE_STYLE[lane].label}
            </li>
          ))}
          <li className="flex items-center gap-1.5">
            <Dot lane="app" past />
            Already ran
          </li>
        </ul>
      </div>
      <div className="overflow-x-auto pt-3">
        <div className="relative min-w-[640px]">
          <div
            aria-hidden
            className="pointer-events-none absolute -top-3 bottom-5 z-10 grid w-full grid-cols-[150px_1fr]"
          >
            <span />
            <div className="relative">
              <div
                style={{ left: nowLeft }}
                className="absolute top-3 bottom-0 w-px bg-foreground"
              />
              <div
                style={{ left: nowLeft }}
                className="absolute top-0 -translate-x-1/2 rounded-full bg-foreground px-1.5 text-2xs leading-4 font-medium whitespace-nowrap text-background tabular-nums"
              >
                Now {clock(props.now)}
              </div>
            </div>
          </div>
          {(["app", "windows", "agents"] as const).map((lane) => (
            <div key={lane} className="grid h-10 grid-cols-[150px_1fr] items-center">
              <div className="text-sm font-medium">
                {GROUPS.find((group) => group.id === lane)?.label}{" "}
                <span className="font-normal text-muted-foreground tabular-nums">
                  {counts(lane)}
                </span>
              </div>
              <div className="relative h-10 border-t border-border">
                {groupMarks(lanes[lane]).map((group) => (
                  <TimelineMark
                    key={`${group.items[0]!.id}-${group.at}`}
                    lane={lane}
                    group={group}
                    now={props.now}
                    byId={byId}
                    onSelect={props.onSelect}
                  />
                ))}
              </div>
            </div>
          ))}
          <div className="grid grid-cols-[150px_1fr]">
            <span />
            <div className="relative h-4">
              {ticks.map((tick) => (
                <span
                  key={tick.at}
                  style={{ left: `${(tick.x * 100).toFixed(2)}%` }}
                  className="absolute -translate-x-1/2 text-2xs whitespace-nowrap text-muted-foreground tabular-nums"
                >
                  {clock(tick.at)}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
      {lanes.agents.length === 0 && nextAgent ? (
        <p className="mt-2 text-xs text-muted-foreground">
          No agent schedule runs in this window. Next: {nextAgent.name},{" "}
          {timeLabel(Date.parse(nextAgent.nextRunAt!), props.now)}.
        </p>
      ) : null}
    </section>
  );
}

function Browse(props: {
  readonly rows: ReadonlyArray<AutomationRow>;
  readonly loading: boolean;
  readonly now: number;
  readonly selectedId: string | undefined;
  readonly onSelect: (id: string | undefined) => void;
  readonly onChanged: () => void;
}) {
  const [query, setQuery] = useState("");
  const [show, setShow] = useState<ShowFilter>("all");
  const [group, setGroup] = useState<GroupId | "all">("all");
  // Long names are cut at the default width, so the list can be dragged wider (saved between visits).
  const listWidth = useResizableWidth({
    storageKey: "leonidas.automations.listWidth",
    defaultWidth: 380,
    minWidth: 300,
    maxWidth: 760,
    edge: "right",
  });
  // A dot or card picked above scrolls its detail into view.
  useEffect(() => {
    if (!props.selectedId) return;
    document.getElementById("automation-detail")?.scrollIntoView({
      block: "nearest",
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    });
  }, [props.selectedId]);
  const visible = useMemo(
    () => filterRows(props.rows, { query, show, group }),
    [props.rows, query, show, group],
  );
  const selected =
    props.rows.find((row) => row.id === props.selectedId) ??
    (props.selectedId ? undefined : visible[0]);
  const counts = {
    all: props.rows.length,
    needs: filterRows(props.rows, { query: "", show: "needs", group: "all" }).length,
    stopped: filterRows(props.rows, { query: "", show: "stopped", group: "all" }).length,
  };
  const move = (event: KeyboardEvent) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const index = visible.findIndex((row) => row.id === selected?.id);
    const next =
      visible[
        Math.min(visible.length - 1, Math.max(0, index + (event.key === "ArrowDown" ? 1 : -1)))
      ];
    if (next) props.onSelect(next.id);
  };
  return (
    <section aria-label="All automations" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="relative min-w-[200px] flex-1">
          <SearchIcon
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            aria-label="Search automations"
            placeholder="Search automations"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <div
          role="radiogroup"
          aria-label="Show"
          className="inline-flex rounded-lg border border-border bg-card p-0.5"
        >
          {(
            [
              ["all", "All"],
              ["needs", "Needs you"],
              ["stopped", "Stopped"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={show === id}
              onClick={() => setShow(id)}
              className={cn(
                "inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                show === id
                  ? "bg-surface-raised text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {label} <span className="text-muted-foreground tabular-nums">{counts[id]}</span>
            </button>
          ))}
        </div>
        <Select
          value={group}
          onValueChange={(value) => setGroup((value ?? "all") as GroupId | "all")}
        >
          <SelectTrigger size="sm" aria-label="Kind" className="w-auto min-w-[140px]">
            <SelectValue>
              {group === "all" ? "All kinds" : GROUPS.find((entry) => entry.id === group)?.label}
            </SelectValue>
          </SelectTrigger>
          <SelectPopup>
            <SelectItem value="all">All kinds</SelectItem>
            {GROUPS.map((entry) => (
              <SelectItem key={entry.id} value={entry.id}>
                {entry.label}
              </SelectItem>
            ))}
          </SelectPopup>
        </Select>
      </div>
      <div className="flex border-t border-border pt-3">
        <div
          style={{ [RESIZABLE_WIDTH_PROPERTY]: `${listWidth.width}px` } as CSSProperties}
          className={cn(
            "relative w-full shrink-0 lg:block lg:w-[min(var(--resizable-width),calc(100%-24rem))] lg:border-r lg:border-border lg:pr-4",
            props.selectedId ? "hidden" : "block",
          )}
        >
          <div
            role="listbox"
            aria-label="Automations"
            tabIndex={0}
            onKeyDown={move}
            className="outline-none"
          >
            {props.loading ? (
              <div className="flex flex-col gap-2" aria-busy>
                {[0, 1, 2, 3, 4].map((index) => (
                  <div key={index} className="h-12 animate-skeleton rounded-lg bg-muted" />
                ))}
              </div>
            ) : visible.length === 0 ? (
              <p className="px-2 py-6 text-sm text-muted-foreground">
                Nothing matches. Clear the search or pick All.
              </p>
            ) : (
              GROUPS.map((entry) => {
                const rows = visible.filter((row) => row.group === entry.id);
                if (rows.length === 0) return null;
                return (
                  <div key={entry.id} role="group" aria-label={entry.label}>
                    <div className="flex justify-between px-0.5 pt-3 pb-1.5 text-2xs font-semibold tracking-wide text-muted-foreground uppercase">
                      <span>{entry.label}</span>
                      <span className="tabular-nums">{rows.length}</span>
                    </div>
                    {rows.map((row) => (
                      <button
                        key={row.id}
                        type="button"
                        role="option"
                        aria-selected={row.id === selected?.id}
                        onClick={() => props.onSelect(row.id)}
                        className={cn(
                          "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                          row.id === selected?.id
                            ? "bg-sidebar-row-active"
                            : "hover:bg-sidebar-row-hover",
                        )}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{row.name}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {row.scheduleText}
                          </span>
                        </span>
                        <StatusChip row={row} />
                      </button>
                    ))}
                  </div>
                );
              })
            )}
          </div>
          <RightPanelResizeHandle
            handlers={listWidth.handlers}
            className="-right-1 left-auto hidden lg:block"
          />
        </div>
        <div
          className={cn("min-w-0 flex-1 lg:block lg:pl-6", props.selectedId ? "block" : "hidden")}
        >
          {selected ? (
            <Detail
              row={selected}
              now={props.now}
              onChanged={props.onChanged}
              onBack={() => props.onSelect(undefined)}
            />
          ) : (
            <p className="py-6 text-sm text-muted-foreground">
              Pick an automation to see when it runs and change it.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

const COST: Record<AutomationRow["kind"], string> = {
  watcher: "Free, 0 model calls",
  digest: "Free models only",
  agent_schedule: "Your model plan",
  windows_task: "Free script",
  daemon: "Free process",
  git_hook: "Free script",
  engine_hook: "Free script",
};

function Detail(props: {
  readonly row: AutomationRow;
  readonly now: number;
  readonly onBack: () => void;
  readonly onChanged: () => void;
}) {
  const { row } = props;
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  // The switch moves at once; the next list refresh confirms it.
  const [pending, setPending] = useState<{
    readonly id: string;
    readonly from: boolean | null;
    readonly to: boolean;
  } | null>(null);
  // Holds only while the row still shows the old value, so a refresh clears it with no effect.
  const enabled =
    pending && pending.id === row.id && pending.from === row.enabled ? pending.to : row.enabled;
  const { open } = useOpenAiosFile();
  const setEnabled = useAtomCommand(automationsSetEnabled, { label: "automation start or stop" });
  const runNow = useAtomCommand(automationsRunNow, { label: "automation run now" });
  const setSchedule = useAtomCommand(automationsSetSchedule, { label: "automation schedule" });
  const toggleAgent = useAtomCommand(serverEnvironment.setScheduledTaskEnabled, {
    label: "scheduled task enabled",
  });
  const runAgent = useAtomCommand(serverEnvironment.runScheduledTaskNow, {
    label: "scheduled task run now",
  });
  const environmentId = usePrimaryEnvironmentId();
  const isAgent = row.kind === "agent_schedule";
  const canToggle =
    row.enabled !== null &&
    (row.kind === "watcher" || row.kind === "digest" || isAgent || row.kind === "windows_task");
  const canEditTime =
    row.kind === "watcher" || row.kind === "digest" || row.kind === "windows_task";

  const act = async (
    label: string,
    run: () => Promise<{ readonly _tag: string }>,
    done?: string,
  ) => {
    if (busy) return;
    setBusy(true);
    const result = await run();
    setBusy(false);
    if (result._tag === "Failure") {
      setPending(null);
      if (!isAtomCommandInterrupted(result as never)) {
        toastManager.add({
          type: "error",
          title: `Could not ${label}`,
          description: String(squashAtomCommandFailure(result as never)),
        });
      }
      return;
    }
    props.onChanged();
    if (done) toastManager.add({ type: "success", title: done });
  };

  const toggle = (next: boolean) => {
    setPending({ id: row.id, from: row.enabled, to: next });
    return act(next ? "start it" : "stop it", () =>
      isAgent
        ? toggleAgent({
            environmentId: environmentId!,
            input: { id: row.scheduledTaskId as never, enabled: next },
          })
        : setEnabled({ environmentId: environmentId!, input: { id: row.id, enabled: next } }),
    ).then(() => undefined);
  };

  const run = async () => {
    if (isAgent) {
      const ok = await requestConfirmDialog(
        `Run ${row.name} now? It starts an agent chat on ${row.model ?? "your model"} and uses your plan.`,
      );
      if (!ok) return;
      return act(
        "run it",
        () =>
          runAgent({ environmentId: environmentId!, input: { id: row.scheduledTaskId as never } }),
        `${row.name} started`,
      );
    }
    return act(
      "run it",
      () => runNow({ environmentId: environmentId!, input: { id: row.id } }),
      `${row.name} ran`,
    );
  };

  const facts = [
    ["Runs in", row.runsIn],
    ["Schedule", row.scheduleText],
    ["Last run", row.lastRunAt ? timeLabel(Date.parse(row.lastRunAt), props.now) : "Never"],
    [
      "Next run",
      row.nextRunAt
        ? timeLabel(Date.parse(row.nextRunAt), props.now)
        : row.enabled === false
          ? "Stopped"
          : "None",
    ],
    ["Cost", COST[row.kind]],
  ] as const;

  return (
    <article
      id="automation-detail"
      aria-label={row.name}
      className="flex scroll-mt-4 flex-col gap-4"
    >
      <Button variant="ghost" size="sm" className="self-start lg:hidden" onClick={props.onBack}>
        <ArrowLeftIcon /> All automations
      </Button>
      <header className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="text-base font-semibold break-words">{row.name}</h2>
            <StatusChip row={row} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{row.line}</p>
          <p className="mt-1.5 text-xs break-all">
            <span className="text-muted-foreground">What it runs: </span>
            {row.what}
          </p>
        </div>
        {canToggle ? (
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            {enabled ? "On" : "Off"}
            <Switch
              checked={enabled === true}
              disabled={busy || !environmentId}
              aria-label={`${enabled ? "Stop" : "Start"} ${row.name}`}
              onCheckedChange={(checked) => void toggle(checked)}
            />
          </label>
        ) : null}
      </header>
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-3 xl:grid-cols-5 [&>div]:bg-card">
        {facts.map(([label, value]) => (
          <div key={label} className="px-3 py-2.5">
            <dt className="text-2xs text-muted-foreground">{label}</dt>
            <dd className="mt-0.5 text-sm font-medium">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="flex flex-wrap gap-2">
        {row.canRunNow ? (
          <Tip
            tip={
              isAgent
                ? "Starts the agent chat now. It uses your model plan."
                : "Runs it once now. It uses no model."
            }
          >
            <Button size="sm" disabled={busy || !environmentId} onClick={() => void run()}>
              <PlayIcon /> Run now
            </Button>
          </Tip>
        ) : null}
        {isAgent && row.scheduledTaskId ? (
          <Tip tip="Change the prompt, the model and when it runs.">
            <Button
              size="sm"
              variant="outline"
              render={
                <Link
                  to="/settings/scheduled-tasks"
                  search={{
                    environmentId: row.environmentId as never,
                    taskId: row.scheduledTaskId as never,
                  }}
                />
              }
            >
              <PencilIcon /> Edit prompt and schedule
            </Button>
          </Tip>
        ) : null}
        {canEditTime ? (
          <Tip
            tip={
              row.kind === "windows_task"
                ? "Change the start time in Windows Task Scheduler."
                : "Change when it runs."
            }
          >
            <Button
              size="sm"
              variant="outline"
              aria-expanded={editing}
              onClick={() => setEditing((value) => !value)}
            >
              <PencilIcon /> {row.kind === "windows_task" ? "Change time" : "Edit schedule"}
            </Button>
          </Tip>
        ) : null}
        {row.file ? (
          <Tip tip="Opens the script in your editor.">
            <Button size="sm" variant="outline" onClick={() => void open(row.file!)}>
              <FileCodeIcon /> Open script
            </Button>
          </Tip>
        ) : null}
        {row.group === "app" ? (
          <Tip tip="What it sent: one notification per new problem.">
            <Button size="sm" variant="outline" render={<Link to="/inbox" />}>
              Open in Notifications
            </Button>
          </Tip>
        ) : null}
      </div>
      {editing ? (
        <ScheduleEditor
          row={row}
          busy={busy}
          onCancel={() => setEditing(false)}
          onSave={(schedule) =>
            void act(
              "change the schedule",
              () => setSchedule({ environmentId: environmentId!, input: { id: row.id, schedule } }),
              "Schedule saved",
            ).then(() => setEditing(false))
          }
        />
      ) : null}
      {row.kind === "windows_task" ? (
        <p className="text-xs text-muted-foreground">
          Stop turns the Windows task off. The register then marks it as not compliant until you
          start it again.
        </p>
      ) : null}
      {row.kind === "daemon" ? (
        <p className="text-xs text-muted-foreground">
          The AIOS daemon watchdog starts and stops background processes. Open the watchdog task to
          change it.
        </p>
      ) : null}
      {isAgent && row.prompt ? (
        <section aria-label="Prompt">
          <div className="flex justify-between pb-1.5 text-2xs font-semibold tracking-wide text-muted-foreground uppercase">
            <span>Prompt</span>
            {row.model ? <span>Model: {row.model}</span> : null}
          </div>
          <p className="rounded-xl border border-border bg-card p-3 text-sm leading-relaxed whitespace-pre-wrap">
            {row.prompt}
          </p>
        </section>
      ) : null}
      {row.lastSummary && !isAgent ? (
        <section aria-label="Last result">
          <div className="pb-1.5 text-2xs font-semibold tracking-wide text-muted-foreground uppercase">
            Last result
          </div>
          <p className="border-b border-border px-3 py-2 text-sm break-words">{row.lastSummary}</p>
        </section>
      ) : null}
    </article>
  );
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function ScheduleEditor(props: {
  readonly row: AutomationRow;
  readonly busy: boolean;
  readonly onSave: (schedule: ScheduledTaskSchedule) => void;
  readonly onCancel: () => void;
}) {
  const current = props.row.schedule;
  const timeOnly = props.row.kind === "windows_task";
  const [mode, setMode] = useState<"interval" | "time">(
    timeOnly || current?.type === "fixed_time" ? "time" : "interval",
  );
  const [hours, setHours] = useState(
    current?.type === "interval" ? String(current.everyMs / 3_600_000) : "1",
  );
  const [time, setTime] = useState(current?.type === "fixed_time" ? current.timeOfDay : "08:00");
  const [days, setDays] = useState<ReadonlySet<number>>(
    new Set(current?.type === "fixed_time" ? (current.weekdays ?? []) : []),
  );
  const hoursValue = Number(hours);
  const valid = mode === "time" ? /^\d{2}:\d{2}$/.test(time) : hoursValue >= 1 && hoursValue <= 168;
  const schedule: ScheduledTaskSchedule =
    mode === "interval"
      ? { type: "interval", everyMs: Math.round(hoursValue * 3_600_000) }
      : {
          type: "fixed_time",
          timeOfDay: time,
          ...(days.size > 0 && !timeOnly ? { weekdays: [...days].toSorted() } : {}),
        };
  return (
    <form
      aria-label="Edit schedule"
      className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (valid) props.onSave(schedule);
      }}
    >
      {timeOnly ? null : (
        <div
          role="radiogroup"
          aria-label="Runs"
          className="inline-flex self-start rounded-lg border border-border p-0.5"
        >
          {(
            [
              ["interval", "Every few hours"],
              ["time", "At a time"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={mode === id}
              onClick={() => setMode(id)}
              className={cn(
                "h-7 rounded-md px-2.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                mode === id ? "bg-surface-raised text-foreground" : "text-muted-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {mode === "interval" ? (
        <label className="flex items-center gap-2 text-sm">
          Every
          <Input
            type="number"
            min={1}
            max={168}
            value={hours}
            onChange={(event) => setHours(event.target.value)}
            className="w-20"
            aria-label="Hours between runs"
          />
          hours
        </label>
      ) : (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <label className="flex items-center gap-2">
            At
            <Input
              type="time"
              value={time}
              onChange={(event) => setTime(event.target.value)}
              className="w-32"
              aria-label="Start time"
            />
          </label>
          {timeOnly ? null : (
            <div role="group" aria-label="Days (none means every day)" className="flex gap-1">
              {WEEKDAYS.map((day, index) => (
                <button
                  key={day}
                  type="button"
                  aria-pressed={days.has(index)}
                  onClick={() =>
                    setDays((set) => {
                      const next = new Set(set);
                      if (next.has(index)) next.delete(index);
                      else next.add(index);
                      return next;
                    })
                  }
                  className={cn(
                    "h-7 rounded-md px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                    days.has(index)
                      ? "bg-state text-state-foreground"
                      : "bg-secondary text-muted-foreground",
                  )}
                >
                  {day}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={!valid || props.busy}>
          Save
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={props.onCancel}>
          Cancel
        </Button>
        <span className="text-xs text-muted-foreground">
          {valid ? `Runs ${scheduleWords(schedule).toLowerCase()}.` : "Pick 1 to 168 hours."}
        </span>
      </div>
    </form>
  );
}
