import type {
  EnvironmentId,
  ModelBenchmarkEntry,
  ModelBenchmarkMetric,
  ModelSelection,
} from "@t3tools/contracts";
import { ArrowDownIcon, ArrowUpIcon, ChevronsUpDownIcon } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import * as Schema from "effect/Schema";
import { type ReactNode, useEffect, useMemo, useState } from "react";

import {
  buildPoints,
  availableEntries,
  catalogEfforts,
  defaultXMetric,
  headlineScoreMetrics,
  isLogMetric,
  matchesEffort,
  paretoFrontier,
  scaleValue,
  sortEntries,
  type ExplorerPoint,
  type ExplorerSort,
} from "../../lib/benchmarkExplorer";
import {
  addArenaMatch,
  ARENA_STORAGE_KEY,
  ArenaState,
  bestRunnableNow,
  CATALOG_SEEN_STORAGE_KEY,
  CatalogSeen,
  contestantLabel,
  effortCurves,
  EMPTY_ARENA,
  newChallengers,
  recordArenaVote,
  runStatsByEntry,
} from "../../lib/benchmarkInsights";
import {
  formatBenchmarkValue,
  quotaRank,
  type BenchmarkCandidate,
  type BenchmarkQuota,
} from "../../lib/modelBenchmarks";
import { useLocalStorage } from "../../hooks/useLocalStorage";
import { cn, randomUUID } from "../../lib/utils";
import { useEnvironmentQuery } from "../../state/query";
import { serverEnvironment } from "../../state/server";
import { formatRelativeTimeLabel } from "../../timestampFormat";
import { Button } from "../ui/button";
import { Checkbox } from "../ui/checkbox";
import { Dialog, DialogPanel, DialogPopup, DialogTitle } from "../ui/dialog";
import { Input } from "../ui/input";
import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";
import { Spinner } from "../ui/spinner";
import { Textarea } from "../ui/textarea";

/** Creator dot colors; creators past the palette share the last, neutral one. */
const CREATOR_COLORS = [
  "#d97757",
  "#4a90d9",
  "#3fb27f",
  "#e0a030",
  "#a06ad6",
  "#e0607e",
  "#38b6c4",
] as const;
const OTHER_COLOR = "#8b8b95";
const DEFAULT_TOP_MODELS = 15;

type XKind = "price" | "speed" | "latency";
const X_KINDS: ReadonlyArray<{ readonly id: XKind; readonly label: string }> = [
  { id: "price", label: "Cost" },
  { id: "speed", label: "Speed" },
  { id: "latency", label: "Latency" },
];

const WIDTH = 640;
const HEIGHT = 300;
const PAD = { left: 40, right: 14, top: 12, bottom: 30 };

function niceTicks(min: number, max: number, log: boolean): ReadonlyArray<number> {
  if (log) {
    const ticks: number[] = [];
    for (let power = Math.floor(Math.log10(min)); power <= Math.ceil(Math.log10(max)); power++) {
      ticks.push(10 ** power);
    }
    return ticks;
  }
  return Array.from({ length: 5 }, (_, index) => min + ((max - min) * index) / 4);
}

const tickLabel = (value: number) =>
  value >= 100
    ? value.toFixed(0)
    : value >= 1
      ? value.toFixed(1).replace(/\.0$/, "")
      : String(value);

function Scatter({
  points,
  frontier,
  xMetric,
  yMetric,
  colorOf,
  connectedKeys,
  hovered,
  onHover,
  onPick,
  curves,
}: {
  readonly onPick: (key: string) => void;
  readonly points: ReadonlyArray<ExplorerPoint>;
  readonly frontier: ReadonlyArray<ExplorerPoint>;
  readonly xMetric: ModelBenchmarkMetric;
  readonly yMetric: ModelBenchmarkMetric;
  readonly colorOf: (entry: ModelBenchmarkEntry) => string;
  readonly connectedKeys: ReadonlySet<string>;
  readonly hovered: string | null;
  readonly onHover: (key: string | null) => void;
  /** One model's effort variants, lightest first, joined by a thin line. */
  readonly curves: ReadonlyArray<ReadonlyArray<ExplorerPoint>>;
}) {
  const xLog = isLogMetric(xMetric);
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const yMin = Math.min(...ys);
  const yMax = Math.max(...ys);
  const yPad = (yMax - yMin) * 0.08 || 1;
  const x = (value: number) =>
    PAD.left + scaleValue(value, xMin, xMax, xLog) * (WIDTH - PAD.left - PAD.right);
  const y = (value: number) =>
    HEIGHT -
    PAD.bottom -
    scaleValue(value, yMin - yPad, yMax + yPad, false) * (HEIGHT - PAD.top - PAD.bottom);
  const xTicks = niceTicks(xMin, xMax, xLog).filter(
    (tick) => tick >= xMin * 0.999 && tick <= xMax * 1.001,
  );
  const yTicks = niceTicks(yMin, yMax, false);
  const frontierKeys = new Set(frontier.map((point) => point.entry.sourceModelKey));

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="img"
      aria-label={`${yMetric.label} against ${xMetric.label}`}
      className="h-auto w-full text-muted-foreground"
    >
      {yTicks.map((tick) => (
        <g key={`y${tick}`}>
          <line
            x1={PAD.left}
            x2={WIDTH - PAD.right}
            y1={y(tick)}
            y2={y(tick)}
            stroke="currentColor"
            strokeOpacity={0.12}
          />
          <text x={PAD.left - 6} y={y(tick) + 3} textAnchor="end" fontSize={10} fill="currentColor">
            {tickLabel(tick)}
          </text>
        </g>
      ))}
      {xTicks.map((tick) => (
        <text
          key={`x${tick}`}
          x={x(tick)}
          y={HEIGHT - PAD.bottom + 14}
          textAnchor="middle"
          fontSize={10}
          fill="currentColor"
        >
          {tickLabel(tick)}
        </text>
      ))}
      <text
        x={(WIDTH + PAD.left) / 2}
        y={HEIGHT - 3}
        textAnchor="middle"
        fontSize={10}
        fill="currentColor"
      >
        {xMetric.label}
        {xLog ? " (log scale)" : ""}
      </text>
      {frontier.length > 1 ? (
        <polyline
          points={frontier.map((point) => `${x(point.x)},${y(point.y)}`).join(" ")}
          fill="none"
          stroke="currentColor"
          strokeOpacity={0.6}
          strokeDasharray="2 4"
          strokeWidth={1.5}
        />
      ) : null}
      {curves.map((curve) => (
        <polyline
          key={`curve${curve[0]!.entry.sourceModelKey}`}
          points={curve.map((point) => `${x(point.x)},${y(point.y)}`).join(" ")}
          fill="none"
          stroke={colorOf(curve[0]!.entry)}
          strokeOpacity={0.55}
          strokeWidth={1.25}
          pointerEvents="none"
        />
      ))}
      {points.map((point) => {
        const key = point.entry.sourceModelKey;
        const active = hovered === key;
        // Name the dots worth reading at a glance: the frontier, yours and the hovered one.
        const labelled = active || connectedKeys.has(key) || frontierKeys.has(key);
        const right = x(point.x) < WIDTH - 140;
        return (
          <g key={key}>
            {labelled ? (
              <text
                x={x(point.x) + (right ? 8 : -8)}
                y={y(point.y) + 3}
                textAnchor={right ? "start" : "end"}
                fontSize={9}
                fill="currentColor"
                className={active ? "fill-foreground" : undefined}
                pointerEvents="none"
              >
                {point.entry.name}
              </text>
            ) : null}
            <circle
              className="cursor-pointer"
              onClick={() => onPick(key)}
              cx={x(point.x)}
              cy={y(point.y)}
              r={active ? 7 : 5}
              fill={colorOf(point.entry)}
              stroke={connectedKeys.has(key) ? "currentColor" : "none"}
              strokeWidth={2}
              opacity={hovered && !active ? 0.45 : 1}
              onPointerEnter={() => onHover(key)}
              onPointerLeave={() => onHover(null)}
            />
          </g>
        );
      })}
    </svg>
  );
}

/** Plain segmented control; the stock Toggle hovers in the red accent, which reads as an error here. */
function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  readonly label: string;
  readonly value: T;
  readonly options: ReadonlyArray<{ readonly id: T; readonly label: string }>;
  readonly onChange: (next: T) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex shrink-0 rounded-lg bg-muted/60 p-0.5 text-xs"
    >
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          role="radio"
          aria-checked={option.id === value}
          onClick={() => onChange(option.id)}
          className={cn(
            "cursor-pointer rounded-md px-2.5 py-1 whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground",
            option.id === value && "bg-background text-foreground shadow-xs/10",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function ModelPicker({
  entries,
  selected,
  onChange,
  onReset,
  connectedKeys,
}: {
  readonly entries: ReadonlyArray<ModelBenchmarkEntry>;
  readonly selected: ReadonlySet<string>;
  readonly onChange: (next: Set<string>) => void;
  readonly onReset: () => void;
  readonly connectedKeys: ReadonlySet<string>;
}) {
  const [search, setSearch] = useState("");
  const shown = entries.filter((entry) =>
    entry.name.toLowerCase().includes(search.trim().toLowerCase()),
  );
  const preset = (text: string, run: () => void) => (
    <button
      type="button"
      onClick={run}
      className="cursor-pointer rounded-md px-1.5 py-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
    >
      {text}
    </button>
  );
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button size="xs" variant="outline" className="ms-auto">
            {selected.size} models
            <ChevronsUpDownIcon aria-hidden />
          </Button>
        }
      />
      <PopoverPopup align="end" className="w-72">
        <div className="flex flex-col gap-2">
          <Input
            size="sm"
            placeholder="Search models"
            aria-label="Search models"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <div className="flex gap-1 text-2xs">
            {preset("Top + available", onReset)}
            {preset("Available", () => onChange(new Set(connectedKeys)))}
            {preset("All", () => onChange(new Set(entries.map((entry) => entry.sourceModelKey))))}
            {preset("None", () => onChange(new Set()))}
          </div>
          <ul className="flex max-h-64 flex-col overflow-y-auto [scrollbar-width:thin]">
            {shown.map((entry) => {
              const key = entry.sourceModelKey;
              return (
                <li key={key}>
                  <label className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-xs hover:bg-muted">
                    <Checkbox
                      checked={selected.has(key)}
                      onCheckedChange={(checked) => {
                        const next = new Set(selected);
                        if (checked) next.add(key);
                        else next.delete(key);
                        onChange(next);
                      }}
                    />
                    <span className="min-w-0 flex-1 truncate">{entry.name}</span>
                    {connectedKeys.has(key) ? <AvailableBadge /> : null}
                  </label>
                </li>
              );
            })}
          </ul>
        </div>
      </PopoverPopup>
    </Popover>
  );
}

function AvailableBadge() {
  return (
    <span className="shrink-0 rounded-full bg-success/12 px-1.5 text-2xs font-medium text-success">
      Available
    </span>
  );
}

const shortLabel = (metric: ModelBenchmarkMetric) =>
  metric.label.replace(/^BenchLM overall$/, "Overall");

const CatalogSeenOrNull = Schema.NullOr(CatalogSeen);

/** Starts one blind-test chat per selection with the same prompt; resolves to their thread ids. */
export type StartBenchmarkArena = (
  prompt: string,
  selections: ReadonlyArray<ModelSelection>,
  labels: ReadonlyArray<string>,
) => Promise<ReadonlyArray<string>>;

interface Column {
  readonly key: string;
  readonly label: string;
  readonly value: (entry: ModelBenchmarkEntry) => number | undefined;
  readonly format: (entry: ModelBenchmarkEntry) => ReactNode;
  readonly higherIsBetter: boolean;
  /** The column the chips select; drawn in full contrast. */
  readonly focus?: boolean;
}

const formatSeconds = (seconds: number) =>
  seconds < 60 ? `${Math.round(seconds)}s` : `${(seconds / 60).toFixed(1).replace(/\.0$/, "")}m`;

function quotaText(quota: BenchmarkQuota): string {
  if (quota.kind === "metered") return "Pay as you use";
  if (quota.kind === "unknown") return "Unknown";
  if (quota.leftPercent > 0) return `${100 - quota.leftPercent}% used`;
  return quota.resetsAt ? `Out until ${formatRelativeTimeLabel(quota.resetsAt)}` : "Out";
}

function ArenaPanel({
  environmentId,
  entries,
  connected,
  arena,
  setArena,
  onStartArena,
  defaults,
}: {
  readonly environmentId: EnvironmentId;
  readonly entries: ReadonlyArray<ModelBenchmarkEntry>;
  readonly connected: ReadonlyMap<string, BenchmarkCandidate>;
  readonly arena: ArenaState;
  readonly setArena: (update: (state: ArenaState) => ArenaState) => void;
  readonly onStartArena: StartBenchmarkArena | null;
  readonly defaults: ReadonlyArray<string>;
}) {
  const navigate = useNavigate();
  const runnable = useMemo(
    () =>
      entries
        .filter((entry) => connected.has(entry.sourceModelKey))
        .toSorted((a, b) => a.name.localeCompare(b.name)),
    [entries, connected],
  );
  const [chosen, setChosen] = useState<ReadonlyArray<string>>(() => defaults.slice(0, 2));
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const byKey = new Map(entries.map((entry) => [entry.sourceModelKey, entry]));

  const start = async () => {
    if (!onStartArena || chosen.length < 2 || prompt.trim().length === 0) return;
    setBusy(true);
    setError(null);
    // Shuffle so the label never hints at which model is which.
    const order = chosen.toSorted(() => Math.random() - 0.5);
    const labels = order.map((_, index) => contestantLabel(index));
    try {
      const threadIds = await onStartArena(
        prompt.trim(),
        order.map((key) => connected.get(key)!.selection),
        labels,
      );
      setArena((state) =>
        addArenaMatch(state, {
          id: randomUUID(),
          prompt: prompt.trim(),
          createdAt: new Date().toISOString(),
          contestants: order.map((key, index) => ({
            label: labels[index]!,
            entryKey: key,
            name: byKey.get(key)?.name ?? key,
            threadId: threadIds[index]!,
          })),
        }),
      );
      setPrompt("");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not start the blind test. Try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  const ratings = Object.entries(arena.ratings).toSorted(([, a], [, b]) => b.elo - a.elo);

  return (
    <div className="flex flex-col gap-3 text-xs">
      <div className="flex flex-col gap-2 rounded-xl border border-border/60 p-3">
        <p className="text-muted-foreground">
          Send one message to 2 to 4 of your models. Each gets its own chat in plan mode, named A,
          B, C so you judge the answer, not the name. Vote here and your own rating changes.
        </p>
        <div className="flex flex-wrap gap-1">
          {runnable.map((entry) => {
            const key = entry.sourceModelKey;
            const on = chosen.includes(key);
            return (
              <button
                key={key}
                type="button"
                aria-pressed={on}
                disabled={!on && chosen.length >= 4}
                onClick={() =>
                  setChosen((current) =>
                    on ? current.filter((item) => item !== key) : [...current, key],
                  )
                }
                className={cn(
                  "cursor-pointer rounded-full border px-2.5 py-0.5 text-2xs transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                  on
                    ? "border-foreground bg-foreground text-background"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                {entry.name}
              </button>
            );
          })}
        </div>
        <Textarea
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder="A real task you care about, e.g. a bug report or a design question"
          aria-label="Message for the blind test"
          rows={3}
        />
        <div className="flex items-center gap-2">
          <Button
            size="xs"
            disabled={!onStartArena || busy || chosen.length < 2 || prompt.trim().length === 0}
            onClick={() => void start()}
          >
            {busy ? <Spinner className="size-3" /> : null}
            Start blind test ({chosen.length})
          </Button>
          {!onStartArena ? (
            <span className="text-2xs text-muted-foreground">Open a project to run tests.</span>
          ) : null}
          {error ? <span className="text-2xs text-destructive">{error}</span> : null}
        </div>
      </div>

      {arena.matches.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {arena.matches.slice(0, 8).map((match) => (
            <li key={match.id} className="rounded-xl border border-border/60 p-2.5">
              <p className="line-clamp-2 text-foreground">{match.prompt}</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                {match.contestants.map((contestant) => (
                  <Button
                    key={contestant.label}
                    size="xs"
                    variant="outline"
                    onClick={() =>
                      void navigate({
                        to: "/$environmentId/$threadId",
                        params: { environmentId, threadId: contestant.threadId },
                      })
                    }
                  >
                    Open {contestant.label}
                    {match.winner !== undefined ? ` · ${contestant.name}` : ""}
                  </Button>
                ))}
                <span className="ms-auto text-2xs text-muted-foreground">
                  {match.winner === undefined ? "Best answer:" : "Winner:"}
                </span>
                {match.winner === undefined ? (
                  <>
                    {match.contestants.map((contestant) => (
                      <Button
                        key={contestant.label}
                        size="xs"
                        variant="secondary"
                        onClick={() =>
                          setArena((state) => recordArenaVote(state, match.id, contestant.label))
                        }
                      >
                        {contestant.label}
                      </Button>
                    ))}
                    <Button
                      size="xs"
                      variant="secondary"
                      onClick={() => setArena((state) => recordArenaVote(state, match.id, "tie"))}
                    >
                      Call it a tie
                    </Button>
                  </>
                ) : (
                  <span className="font-medium text-foreground">
                    {match.winner === "tie"
                      ? "Tie"
                      : match.contestants.find((item) => item.label === match.winner)?.name}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {ratings.length > 0 ? (
        <div className="rounded-xl border border-border/60 p-2.5">
          <p className="mb-1 font-medium text-foreground">Your rating</p>
          <ol className="flex flex-col gap-0.5">
            {ratings.map(([key, rating], index) => (
              <li key={key} className="flex items-center gap-2 tabular-nums">
                <span className="w-4 text-muted-foreground">{index + 1}</span>
                <span className="min-w-0 flex-1 truncate">{byKey.get(key)?.name ?? key}</span>
                <span className="text-foreground">{Math.round(rating.elo)}</span>
                <span className="w-16 text-right text-muted-foreground">
                  {rating.games} {rating.games === 1 ? "vote" : "votes"}
                </span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </div>
  );
}

function ExplorerBody({
  environmentId,
  candidates,
  onStartChat,
  onStartArena,
  onClose,
}: {
  readonly environmentId: EnvironmentId;
  readonly candidates: ReadonlyArray<BenchmarkCandidate>;
  readonly onStartChat: ((selection: ModelSelection) => void) | null;
  readonly onStartArena: StartBenchmarkArena | null;
  readonly onClose: () => void;
}) {
  const catalogQuery = useEnvironmentQuery(
    serverEnvironment.modelBenchmarkCatalog({ environmentId, input: {} }),
  );
  const runStatsQuery = useEnvironmentQuery(
    serverEnvironment.modelRunStats({ environmentId, input: {} }),
  );
  const catalog = catalogQuery.data;

  // The benchmarks window replaced the chart and the table. Only the blind test is left here.
  const [view] = useState<"chart" | "table" | "arena">("arena");
  const [xKind, setXKind] = useState<XKind>("price");
  const [yKey, setYKey] = useState<string | null>(null);
  const [hoveredRaw, setHovered] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);
  const hovered = hoveredRaw ?? pinned;
  const [picked, setPicked] = useState<Set<string> | null>(null);
  const [effort, setEffort] = useState("all");
  const [sort, setSort] = useState<ExplorerSort>({ key: "y", direction: "desc" });
  const [arena, writeArena] = useLocalStorage(ARENA_STORAGE_KEY, EMPTY_ARENA, ArenaState);
  const setArena = (update: (state: ArenaState) => ArenaState) => writeArena(update);
  const [seen, setSeen] = useLocalStorage(
    CATALOG_SEEN_STORAGE_KEY,
    null as CatalogSeen | null,
    CatalogSeenOrNull,
  );

  /** Source model key to the candidate a "New chat" starts; matched locally, so no provider is cut off. */
  const connected = useMemo(() => {
    const byKey = new Map<string, BenchmarkCandidate>();
    for (const [key, list] of availableEntries(catalog?.entries ?? [], candidates)) {
      if (list[0]) byKey.set(key, list[0]);
    }
    return byKey;
  }, [catalog, candidates]);
  const connectedKeys = useMemo(() => new Set(connected.keys()), [connected]);
  const runStats = useMemo(
    () => runStatsByEntry(catalog?.entries ?? [], runStatsQuery.data?.stats ?? []),
    [catalog, runStatsQuery.data],
  );

  const metrics = useMemo(() => catalog?.metrics ?? [], [catalog]);
  const headline = useMemo(() => headlineScoreMetrics(metrics), [metrics]);
  const sideMetrics = useMemo(
    () =>
      X_KINDS.flatMap((kind) => {
        const metric = defaultXMetric(metrics, kind.id);
        return metric ? [metric] : [];
      }),
    [metrics],
  );
  const xMetric = sideMetrics.find((metric) => metric.kind === xKind);
  const yMetric = headline.find((metric) => metric.key === yKey) ?? headline[0];

  const creators = useMemo(
    () =>
      [
        ...new Set(
          (catalog?.entries ?? []).flatMap((entry) => (entry.creator ? [entry.creator] : [])),
        ),
      ].toSorted(),
    [catalog],
  );
  const colorOf = (entry: ModelBenchmarkEntry) => {
    const index = entry.creator ? creators.indexOf(entry.creator) : -1;
    return index >= 0 && index < CREATOR_COLORS.length ? CREATOR_COLORS[index]! : OTHER_COLOR;
  };

  const allEntries = useMemo(() => catalog?.entries ?? [], [catalog]);
  const efforts = useMemo(() => catalogEfforts(allEntries), [allEntries]);
  const entries = useMemo(
    () => allEntries.filter((entry) => matchesEffort(entry, effort)),
    [allEntries, effort],
  );

  const best = yMetric ? bestRunnableNow(allEntries, connected, yMetric.key) : null;
  const challengers = useMemo(
    () =>
      yMetric
        ? newChallengers(
            allEntries,
            seen,
            yMetric.key,
            best ? (best.entry.values[yMetric.key] ?? null) : null,
          ).slice(0, 3)
        : [],
    [allEntries, seen, yMetric, best],
  );
  const markSeen = () =>
    setSeen({
      keys: allEntries.map((entry) => entry.sourceModelKey),
      takenAt: new Date().toISOString(),
    });
  // First visit: remember today's catalog so later visits can flag what is new.
  useEffect(() => {
    if (seen === null && allEntries.length > 0) {
      setSeen({
        keys: allEntries.map((entry) => entry.sourceModelKey),
        takenAt: new Date().toISOString(),
      });
    }
  }, [seen, allEntries, setSeen]);

  // Default view: the models you can run plus the strongest few, like AA's curated chart.
  const selected = useMemo(() => {
    if (picked) return picked;
    const top = yMetric
      ? sortEntries(entries, { key: yMetric.key, direction: "desc" }).slice(0, DEFAULT_TOP_MODELS)
      : [];
    return new Set([...top.map((entry) => entry.sourceModelKey), ...connectedKeys]);
  }, [picked, entries, yMetric, connectedKeys]);

  const visible = useMemo(
    () => entries.filter((entry) => selected.has(entry.sourceModelKey)),
    [entries, selected],
  );
  const points = useMemo(
    () => (xMetric && yMetric ? buildPoints(visible, xMetric, yMetric) : []),
    [visible, xMetric, yMetric],
  );
  const frontier = useMemo(
    () => (xMetric && yMetric ? paretoFrontier(points, xMetric, yMetric) : []),
    [points, xMetric, yMetric],
  );
  const curves = useMemo(() => effortCurves(points), [points]);

  const metricColumn = (metric: ModelBenchmarkMetric): Column => ({
    key: metric.key,
    label: shortLabel(metric),
    value: (entry) => entry.values[metric.key],
    format: (entry) => {
      const value = entry.values[metric.key];
      return value === undefined ? "–" : formatBenchmarkValue(value, metric);
    },
    higherIsBetter: metric.higherIsBetter,
    ...(metric.key === yMetric?.key ? { focus: true } : {}),
  });
  const quotaColumn: Column = {
    key: "quota",
    label: "Usage left now",
    value: (entry) => {
      const candidate = connected.get(entry.sourceModelKey);
      return candidate ? quotaRank(candidate.quota) : undefined;
    },
    format: (entry) => {
      const candidate = connected.get(entry.sourceModelKey);
      return candidate ? quotaText(candidate.quota) : "–";
    },
    higherIsBetter: true,
  };
  const yoursColumns: ReadonlyArray<Column> = [
    {
      key: "runs",
      label: "Your runs",
      value: (entry) => runStats.get(entry.sourceModelKey)?.runs,
      format: (entry) => runStats.get(entry.sourceModelKey)?.runs ?? "–",
      higherIsBetter: true,
    },
    {
      key: "success",
      label: "Finished",
      value: (entry) => runStats.get(entry.sourceModelKey)?.successRate ?? undefined,
      format: (entry) => {
        const rate = runStats.get(entry.sourceModelKey)?.successRate;
        return rate === null || rate === undefined ? "–" : `${Math.round(rate * 100)}%`;
      },
      higherIsBetter: true,
    },
    {
      key: "median",
      label: "Typical time",
      value: (entry) => runStats.get(entry.sourceModelKey)?.medianSeconds ?? undefined,
      format: (entry) => {
        const seconds = runStats.get(entry.sourceModelKey)?.medianSeconds;
        return seconds === null || seconds === undefined ? "–" : formatSeconds(seconds);
      },
      higherIsBetter: false,
    },
    {
      key: "elo",
      label: "Your rating",
      value: (entry) => arena.ratings[entry.sourceModelKey]?.elo,
      format: (entry) => {
        const rating = arena.ratings[entry.sourceModelKey];
        return rating ? Math.round(rating.elo) : "–";
      },
      higherIsBetter: true,
    },
  ];
  const hasRuns = runStats.size > 0;
  const hasRatings = Object.keys(arena.ratings).length > 0;
  const columns: ReadonlyArray<Column> =
    !xMetric || !yMetric
      ? []
      : view === "chart"
        ? [
            metricColumn(yMetric),
            metricColumn(xMetric),
            quotaColumn,
            ...(hasRuns ? [yoursColumns[0]!, yoursColumns[1]!] : []),
          ]
        : [
            ...headline.map(metricColumn),
            ...sideMetrics.map(metricColumn),
            quotaColumn,
            ...yoursColumns.filter((column) => (column.key === "elo" ? hasRatings : hasRuns)),
          ];

  const sortKey = sort.key === "y" ? yMetric?.key : sort.key === "x" ? xMetric?.key : sort.key;
  const sortColumn = columns.find((column) => column.key === sortKey);
  const rows = useMemo(() => {
    if (sortKey === "name" || sortKey === "effort") {
      return sortEntries(visible, { key: sortKey, direction: sort.direction });
    }
    if (!sortColumn) return visible;
    const direction = sort.direction === "asc" ? 1 : -1;
    return visible.toSorted((a, b) => {
      const left = sortColumn.value(a);
      const right = sortColumn.value(b);
      if (left === undefined && right === undefined) return a.name.localeCompare(b.name);
      if (left === undefined) return 1;
      if (right === undefined) return -1;
      return direction * (left - right) || a.name.localeCompare(b.name);
    });
  }, [visible, sortKey, sortColumn, sort.direction]);
  const bests = useMemo(() => {
    const result = new Map<string, number>();
    for (const column of columns) {
      for (const entry of visible) {
        const value = column.value(entry);
        if (value === undefined || column.key === "quota") continue;
        const current = result.get(column.key);
        if (current === undefined || (column.higherIsBetter ? value > current : value < current)) {
          result.set(column.key, value);
        }
      }
    }
    return result;
  }, [columns, visible]);

  if (!catalog) {
    return (
      <p className="flex items-center gap-2 py-10 text-xs text-muted-foreground">
        {catalogQuery.isPending ? (
          <>
            <Spinner className="size-3.5" /> Loading benchmarks
          </>
        ) : (
          (catalogQuery.error ?? "Benchmarks are not available now. Try again later.")
        )}
      </p>
    );
  }
  if (!xMetric || !yMetric) {
    return (
      <p className="py-10 text-xs text-muted-foreground">No benchmark data for this view yet.</p>
    );
  }

  const source = catalog.sources[0];
  const hoveredEntry = hovered
    ? visible.find((entry) => entry.sourceModelKey === hovered)
    : undefined;
  const sortBy = (key: string, higherIsBetter: boolean) => {
    if (sortKey === key) {
      setSort({ key, direction: sort.direction === "desc" ? "asc" : "desc" });
      return;
    }
    setSort({ key, direction: higherIsBetter ? "desc" : "asc" });
  };
  const sortIcon = (key: string) =>
    sortKey !== key ? null : sort.direction === "desc" ? (
      <ArrowDownIcon aria-hidden className="size-3" />
    ) : (
      <ArrowUpIcon aria-hidden className="size-3" />
    );
  const startChat = (candidate: BenchmarkCandidate) => {
    onStartChat?.(candidate.selection);
    onClose();
  };
  const chatButton = (entry: ModelBenchmarkEntry) => {
    const candidate = connected.get(entry.sourceModelKey);
    return candidate && onStartChat ? (
      <Button
        size="xs"
        variant="outline"
        aria-label={`New chat with ${entry.name}`}
        onClick={() => startChat(candidate)}
      >
        New chat
      </Button>
    ) : null;
  };
  const headerButton = (key: string, label: string, higherIsBetter: boolean, focus?: boolean) => (
    <button
      type="button"
      className={cn(
        "inline-flex cursor-pointer items-center gap-0.5 hover:text-foreground",
        focus && "text-foreground",
      )}
      onClick={() => sortBy(key, higherIsBetter)}
    >
      {label}
      {sortIcon(key)}
    </button>
  );

  return (
    <div className="flex flex-col gap-3">
      {best ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-success/30 bg-success/8 px-3 py-2 text-xs">
          <span className="text-muted-foreground">
            Best you can run now for {shortLabel(yMetric)}
          </span>
          <span className="font-medium text-foreground">{best.entry.name}</span>
          <span className="tabular-nums text-muted-foreground">
            {formatBenchmarkValue(best.entry.values[yMetric.key] ?? 0, yMetric)} ·{" "}
            {quotaText(best.candidate.quota)}
          </span>
          {onStartChat ? (
            <Button
              size="xs"
              variant="outline"
              className="ms-auto"
              onClick={() => startChat(best.candidate)}
            >
              New chat
            </Button>
          ) : null}
        </div>
      ) : null}
      {challengers.length > 0 && seen ? (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-border/60 px-3 py-2 text-xs">
          <span className="text-muted-foreground">
            New since {formatRelativeTimeLabel(seen.takenAt)}, ahead of your best on{" "}
            {shortLabel(yMetric)}:
          </span>
          {challengers.map((entry) => (
            <span key={entry.sourceModelKey} className="font-medium text-foreground">
              {entry.name} ({formatBenchmarkValue(entry.values[yMetric.key] ?? 0, yMetric)})
            </span>
          ))}
          <span className="ms-auto flex gap-1">
            <Button
              size="xs"
              variant="outline"
              onClick={() =>
                setPicked(
                  new Set([...selected, ...challengers.map((entry) => entry.sourceModelKey)]),
                )
              }
            >
              Show
            </Button>
            <Button size="xs" variant="ghost" onClick={markSeen}>
              Dismiss
            </Button>
          </span>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {view === "chart" ? (
          <>
            <span className="text-2xs text-muted-foreground">Score vs</span>
            <Segmented
              label="Compare score against"
              value={xKind}
              options={X_KINDS}
              onChange={setXKind}
            />
          </>
        ) : null}
        {view !== "arena" ? (
          <ModelPicker
            entries={entries}
            selected={selected}
            onChange={setPicked}
            onReset={() => setPicked(null)}
            connectedKeys={connectedKeys}
          />
        ) : null}
      </div>

      {view === "arena" ? (
        <ArenaPanel
          environmentId={environmentId}
          entries={allEntries}
          connected={connected}
          arena={arena}
          setArena={setArena}
          onStartArena={onStartArena}
          defaults={sortEntries(
            allEntries.filter((entry) => connectedKeys.has(entry.sourceModelKey)),
            { key: yMetric.key, direction: "desc" },
          ).map((entry) => entry.sourceModelKey)}
        />
      ) : (
        <>
          {efforts.length > 0 ? (
            <div className="-mt-1 flex items-center gap-2">
              <span className="text-2xs text-muted-foreground">Effort</span>
              <Segmented
                label="Effort"
                value={effort}
                options={[
                  { id: "all", label: "All" },
                  { id: "default", label: "Default" },
                  ...efforts.map((id) => ({
                    id,
                    label: id === "xhigh" ? "XHigh" : id[0]!.toUpperCase() + id.slice(1),
                  })),
                ]}
                onChange={(next) => {
                  setEffort(next);
                  setPicked(null);
                }}
              />
            </div>
          ) : null}
          <div className="-mt-1 flex flex-wrap gap-1" role="radiogroup" aria-label="Score">
            {headline.map((metric) => (
              <button
                key={metric.key}
                type="button"
                role="radio"
                aria-checked={metric.key === yMetric.key}
                onClick={() => {
                  setYKey(metric.key);
                  setSort({ key: "y", direction: "desc" });
                }}
                className={cn(
                  "cursor-pointer rounded-full border px-2.5 py-0.5 text-2xs transition-colors",
                  metric.key === yMetric.key
                    ? "border-foreground bg-foreground text-background"
                    : "border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground",
                )}
              >
                {shortLabel(metric)}
              </button>
            ))}
          </div>

          {view === "chart" ? (
            <>
              <div className="relative rounded-xl border border-border/60 bg-muted/10 p-2">
                {points.length > 0 ? (
                  <Scatter
                    points={points}
                    frontier={frontier}
                    curves={curves}
                    xMetric={xMetric}
                    yMetric={yMetric}
                    colorOf={colorOf}
                    connectedKeys={connectedKeys}
                    hovered={hovered}
                    onHover={setHovered}
                    onPick={(key) => setPinned((current) => (current === key ? null : key))}
                  />
                ) : (
                  <p className="py-16 text-center text-xs text-muted-foreground">
                    None of the selected models have both numbers.
                  </p>
                )}
                {hoveredEntry ? (
                  <div className="absolute top-2 right-2 flex items-center gap-2 rounded-lg border bg-popover px-2.5 py-1.5 text-2xs shadow-md">
                    <div>
                      <div className="font-medium text-foreground">{hoveredEntry.name}</div>
                      <div className="text-muted-foreground">
                        {shortLabel(yMetric)}:{" "}
                        {formatBenchmarkValue(hoveredEntry.values[yMetric.key] ?? 0, yMetric)}
                        {" · "}
                        {xMetric.label}:{" "}
                        {formatBenchmarkValue(hoveredEntry.values[xMetric.key] ?? 0, xMetric)}
                      </div>
                      {runStats.get(hoveredEntry.sourceModelKey) ? (
                        <div className="text-muted-foreground">
                          You: {runStats.get(hoveredEntry.sourceModelKey)!.runs} runs
                        </div>
                      ) : null}
                    </div>
                    {pinned === hoveredEntry.sourceModelKey ? chatButton(hoveredEntry) : null}
                  </div>
                ) : null}
              </div>
              <p className="-mt-1 text-2xs text-muted-foreground">
                Up and to the {xMetric.higherIsBetter ? "right" : "left"} is better. Dotted line:
                the best score at each {xMetric.label.toLowerCase()}. Solid lines join one model's
                effort levels. Ringed dots are available to you; click a dot to pin it.
              </p>
            </>
          ) : null}

          <div
            className={cn(
              "overflow-auto rounded-xl border border-border/60 [scrollbar-width:thin]",
              view === "chart" ? "max-h-64" : "max-h-[60vh]",
            )}
          >
            <table className="w-full text-xs">
              <thead className="sticky top-0 z-10 bg-background text-2xs text-muted-foreground">
                <tr>
                  <th className="sticky left-0 z-10 bg-background px-2 py-1 text-left font-medium">
                    {headerButton("name", "Model", false)}
                  </th>
                  <th className="px-2 py-1 text-left font-medium">
                    {headerButton("effort", "Effort", false)}
                  </th>
                  {columns.map((column) => (
                    <th
                      key={column.key}
                      className="px-2 py-1 text-right font-medium whitespace-nowrap"
                    >
                      {headerButton(column.key, column.label, column.higherIsBetter, column.focus)}
                    </th>
                  ))}
                  <th className="w-0" />
                </tr>
              </thead>
              <tbody>
                {rows.map((entry) => {
                  const key = entry.sourceModelKey;
                  return (
                    <tr
                      key={key}
                      onPointerEnter={() => setHovered(key)}
                      onPointerLeave={() => setHovered(null)}
                      className={cn("border-t border-border/40", hovered === key && "bg-muted/60")}
                    >
                      <td className="sticky left-0 max-w-56 bg-background px-2 py-1">
                        <span className="flex items-center gap-1.5">
                          <span
                            aria-hidden
                            className="size-2 shrink-0 rounded-full"
                            style={{ background: colorOf(entry) }}
                          />
                          <span className="truncate">{entry.name}</span>
                          {connected.has(key) ? <AvailableBadge /> : null}
                        </span>
                      </td>
                      <td className="px-2 py-1 text-muted-foreground capitalize">
                        {entry.effort ?? "Default"}
                      </td>
                      {columns.map((column) => {
                        const value = column.value(entry);
                        const isBest =
                          view === "table" &&
                          value !== undefined &&
                          bests.get(column.key) === value;
                        return (
                          <td
                            key={column.key}
                            className={cn(
                              "px-2 py-1 text-right tabular-nums whitespace-nowrap",
                              isBest
                                ? "font-semibold text-success"
                                : column.focus
                                  ? "text-foreground"
                                  : "text-muted-foreground",
                            )}
                          >
                            {column.format(entry)}
                          </td>
                        );
                      })}
                      <td className="px-2 py-1 text-right">{chatButton(entry)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {view === "table" ? (
            <p className="-mt-1 text-2xs text-muted-foreground">
              Green marks the leader in each column. "Your runs", "Finished" and "Typical time" come
              from your own chats in the last 90 days.
            </p>
          ) : null}
        </>
      )}

      {source ? (
        <a
          href={source.url}
          target="_blank"
          rel="noreferrer"
          className="self-end text-2xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          {source.attribution}
          {source.fetchedAt ? ` · updated ${formatRelativeTimeLabel(source.fetchedAt)}` : ""}
          {source.state === "stale" ? " · refresh failed, showing older scores" : ""}
        </a>
      ) : null}
    </div>
  );
}

/** The blind test: run one prompt on several models and vote for the best reply. */
export function BlindTestDialog({
  open,
  onOpenChange,
  environmentId,
  candidates,
  onStartChat,
  onStartArena,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly environmentId: EnvironmentId;
  readonly candidates: ReadonlyArray<BenchmarkCandidate>;
  readonly onStartChat: ((selection: ModelSelection) => void) | null;
  readonly onStartArena: StartBenchmarkArena | null;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="max-w-5xl">
        <DialogPanel>
          <DialogTitle className="mb-3">Blind test</DialogTitle>
          <ExplorerBody
            environmentId={environmentId}
            candidates={candidates}
            onStartChat={onStartChat}
            onStartArena={onStartArena}
            onClose={() => onOpenChange(false)}
          />
        </DialogPanel>
      </DialogPopup>
    </Dialog>
  );
}
