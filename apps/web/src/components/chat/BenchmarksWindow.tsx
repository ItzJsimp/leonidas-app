import type {
  EnvironmentId,
  ModelBenchmarkCatalog,
  ModelRunStats,
  ModelSelection,
} from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { BarChart3Icon, ChartScatterIcon, RefreshCwIcon, TableIcon, XIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { useBenchmarkUi } from "../../benchmarkUiStore";
import { useLocalStorage } from "../../hooks/useLocalStorage";
import {
  COMPARE_METRICS,
  SCORE_METRICS,
  groupModels,
  candidatesOfModel,
  offeredEfforts,
  pointsFor,
  rankModels,
  type EffortMode,
  type WindowModel,
  type WindowSource,
} from "../../lib/benchmarkWindow";
import {
  CATALOG_SEEN_STORAGE_KEY,
  CatalogSeen,
  bestRunnableNow,
  newChallengers,
  runStatsByEntry,
} from "../../lib/benchmarkInsights";
import { availableEntries } from "../../lib/benchmarkExplorer";
import type { BenchmarkCandidate } from "../../lib/modelBenchmarks";
import { canonicalModelKey } from "@t3tools/shared/modelBenchmarkMatch";
import { cn } from "~/lib/utils";
import { useEnvironmentQuery, useEnvironmentQueryRefresh } from "../../state/query";
import { serverEnvironment } from "../../state/server";
import { formatRelativeTimeLabel } from "../../timestampFormat";
import { Button } from "../ui/button";
import { Dialog, DialogClose, DialogPopup, DialogTitle } from "../ui/dialog";
import { Input } from "../ui/input";
import { Switch } from "../ui/switch";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { InsightCard, Segmented, quotaText } from "./BenchmarkControls";
import { BenchmarkDetail, CreatorMark, effortName } from "./BenchmarkDetail";
import { BenchmarksBars } from "./BenchmarksBars";
import { BenchmarksChart } from "./BenchmarksChart";
import { BenchmarksTable } from "./BenchmarksTable";

const CatalogSeenOrNull = Schema.NullOr(CatalogSeen);

type View = "table" | "bars" | "chart";
const VIEWS = [
  { id: "table", label: "Table", Icon: TableIcon },
  { id: "bars", label: "Bars", Icon: BarChart3Icon },
  { id: "chart", label: "Chart", Icon: ChartScatterIcon },
] as const;

const MODES: ReadonlyArray<{ id: EffortMode; label: string }> = [
  { id: "highest", label: "Highest" },
  { id: "default", label: "Default" },
  { id: "all", label: "All" },
];

const SOURCES: ReadonlyArray<{ id: WindowSource; label: string }> = [
  { id: "artificialAnalysis", label: "Artificial Analysis" },
  { id: "benchLm", label: "BenchLM" },
];

/** The benchmarks window: Table, Bars and Chart over one source, with each effort level on its own. */
export function BenchmarksWindowView(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  catalog: ModelBenchmarkCatalog | null | undefined;
  runStats: ModelRunStats | null | undefined;
  onRefresh: () => void;
  candidates: ReadonlyArray<BenchmarkCandidate>;
  onStartChat: ((selection: ModelSelection) => void) | null;
  /** The model to open on, as the provider names it. */
  focusModel: string | null;
  onBlindTest: (() => void) | null;
}) {
  const { catalog, runStats, onRefresh: refresh } = props;
  const openKeyDialog = useBenchmarkUi((state) => state.openKeyDialog);
  const [seen, setSeen] = useLocalStorage(
    CATALOG_SEEN_STORAGE_KEY,
    null as CatalogSeen | null,
    CatalogSeenOrNull,
  );

  const entries = catalog?.entries ?? [];
  const aaStatus = catalog?.sources.find((s) => s.source === "artificialAnalysis");
  const aaConnected = aaStatus !== undefined && aaStatus.state !== "unavailable";
  const [sourcePick, setSourcePick] = useState<WindowSource | null>(null);
  const source: WindowSource = sourcePick ?? (aaConnected ? "artificialAnalysis" : "benchLm");
  const sourceStatus = catalog?.sources.find((s) => s.source === source);

  const [view, setView] = useState<View>("bars");
  const [mode, setMode] = useState<EffortMode>("highest");
  const [metricIndex, setMetricIndex] = useState(0);
  const [compareIndex, setCompareIndex] = useState(0);
  const [search, setSearch] = useState("");
  const [availableOnly, setAvailableOnly] = useState(false);
  const [selKey, setSelKey] = useState<string | null>(
    props.focusModel ? canonicalModelKey(props.focusModel) : null,
  );
  const [effortPick, setEffortPick] = useState<{ key: string; effort: string } | null>(null);

  // First visit: remember today's catalog so later visits can flag what is new.
  useEffect(() => {
    if (seen === null && entries.length > 0) {
      setSeen({ keys: entries.map((e) => e.sourceModelKey), takenAt: new Date().toISOString() });
    }
  }, [seen, entries, setSeen]);

  const scoreMetrics = SCORE_METRICS[source];
  const barMetrics = [
    ...scoreMetrics,
    ...COMPARE_METRICS[source].filter((m) => m.format !== "usdMtok"),
  ];
  const chips = view === "bars" ? barMetrics : scoreMetrics;
  const metric = chips[Math.min(metricIndex, chips.length - 1)]!;
  const score = scoreMetrics[Math.min(metricIndex, scoreMetrics.length - 1)]!;
  const compare =
    COMPARE_METRICS[source][Math.min(compareIndex, COMPARE_METRICS[source].length - 1)]!;

  const sourceEntries = entries.filter((e) => e.source === source);
  const byKey = availableEntries(entries, props.candidates);
  const connected = new Map(
    [...byKey].flatMap(([key, list]) => (list[0] ? [[key, list[0]] as const] : [])),
  );
  const allModels = groupModels(entries, source);
  const runnable = (model: WindowModel) =>
    candidatesOfModel(model, props.candidates).length > 0 ||
    model.points.some((p) => connected.has(p.entry.sourceModelKey));
  const models = allModels.filter(
    (m) =>
      m.name.toLowerCase().includes(search.trim().toLowerCase()) && (!availableOnly || runnable(m)),
  );
  const stats = runStatsByEntry(entries, runStats?.stats ?? []);

  const ranked = rankModels(models, mode, view === "table" ? score : metric);
  const best = bestRunnableNow(sourceEntries, connected, score.key);
  const challengers = newChallengers(
    sourceEntries,
    seen,
    score.key,
    best ? (best.entry.values[score.key] ?? null) : null,
  );
  const challenger = challengers[0];
  const bestModel = best
    ? allModels.find((m) => m.points.some((p) => p.entry === best.entry))
    : null;

  const selected =
    models.find((m) => m.key === selKey) ??
    (bestModel && models.find((m) => m.key === bestModel.key)) ??
    ranked[0]?.model ??
    null;
  const defaultEffort = selected
    ? (pointsFor(selected, mode === "all" ? "highest" : mode, score.key)[0]?.effort ??
      selected.points.at(-1)?.effort ??
      "default")
    : "default";
  const selectedEffort =
    effortPick && selected && effortPick.key === selected.key ? effortPick.effort : defaultEffort;
  const mine = selected ? candidatesOfModel(selected, props.candidates) : [];
  const chatCandidate =
    mine.find((c) => c.query.effort === selectedEffort) ??
    mine.find((c) => c.query.effort === defaultEffort) ??
    mine[0] ??
    null;
  const runsOf = (key: string) => stats.get(key);
  const selectedRuns = selected?.points
    .map((p) => runsOf(p.entry.sourceModelKey))
    .find((s) => s && s.runs > 0);
  const status = [
    chatCandidate ? `Available, ${quotaText(chatCandidate.quota)}` : null,
    selectedRuns
      ? `${selectedRuns.runs} runs${selectedRuns.successRate === null ? "" : `, ${Math.round(selectedRuns.successRate * 100)}% finished`}`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const place = selected
    ? rankModels(models, "highest", score).findIndex((r) => r.model.key === selected.key) + 1
    : 0;

  const offered = (model: WindowModel) => offeredEfforts(model, props.candidates);
  const bestName = bestModel?.name ?? best?.entry.name ?? "";
  const bestEffort = best?.entry.effort;
  const attribution = sourceStatus?.attribution ?? "";

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogPopup className="max-w-6xl" showCloseButton={false}>
        <div className="flex h-[min(48rem,88vh)] min-h-0 flex-col">
          <header className="flex flex-wrap items-center gap-3 border-b border-border/70 px-5 py-3">
            <DialogTitle>Benchmarks</DialogTitle>
            <div
              role="radiogroup"
              aria-label="Source"
              className="inline-flex rounded-md bg-muted p-0.5 text-xs"
            >
              {SOURCES.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  role="radio"
                  aria-checked={option.id === source}
                  onClick={() => {
                    setSourcePick(option.id);
                    setMetricIndex(0);
                    setCompareIndex(0);
                  }}
                  className={cn(
                    "rounded px-2.5 py-1 transition-colors focus-visible:outline-2 focus-visible:outline-ring",
                    option.id === source
                      ? "bg-background font-medium text-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <span className="ms-auto flex items-center gap-1 text-xs text-muted-foreground">
              {sourceStatus?.fetchedAt
                ? `Updated ${formatRelativeTimeLabel(sourceStatus.fetchedAt)}`
                : null}
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      size="icon-xs"
                      variant="ghost-muted"
                      onClick={refresh}
                      aria-label="Refresh benchmarks"
                    />
                  }
                >
                  <RefreshCwIcon className="size-3.5" aria-hidden="true" />
                </TooltipTrigger>
                <TooltipPopup side="bottom">Load the numbers again</TooltipPopup>
              </Tooltip>
              <DialogClose
                render={
                  <Button size="icon-xs" variant="ghost-muted" aria-label="Close benchmarks" />
                }
              >
                <XIcon className="size-4" aria-hidden="true" />
              </DialogClose>
            </span>
          </header>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-border/70 px-5">
            <div role="tablist" aria-label="View" className="flex gap-4">
              {VIEWS.map(({ id, label, Icon }) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={view === id}
                  onClick={() => setView(id)}
                  className={cn(
                    "-mb-px flex items-center gap-1.5 border-b-2 py-2.5 text-sm transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
                    view === id
                      ? "border-primary font-medium text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon className="size-4" aria-hidden="true" />
                  {label}
                </button>
              ))}
            </div>
            <div className="ms-auto flex flex-wrap items-center gap-x-4 gap-y-2 py-1.5">
              {source === "artificialAnalysis" ? (
                <Segmented label="Effort" value={mode} options={MODES} onChange={setMode} />
              ) : null}
              <Input
                size="sm"
                type="search"
                className="w-44"
                aria-label="Search models"
                placeholder="Search models"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              <label className="flex cursor-pointer items-center gap-2 text-xs">
                <Switch size="sm" checked={availableOnly} onCheckedChange={setAvailableOnly} />
                Available to me
              </label>
            </div>
          </div>
          {source === "artificialAnalysis" && !aaConnected ? (
            <div className="grid flex-1 place-items-center p-8">
              <div className="grid max-w-sm justify-items-center gap-3 text-center">
                <h3 className="text-base font-semibold">Show every effort level</h3>
                <p className="text-sm text-muted-foreground">
                  Artificial Analysis scores each effort level on its own. A free key takes about 2
                  minutes. BenchLM shows one score per model.
                </p>
                <div className="flex gap-2">
                  <Button onClick={openKeyDialog}>Connect Artificial Analysis</Button>
                  <Button variant="outline" onClick={() => setSourcePick("benchLm")}>
                    Use BenchLM
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
              <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-y-auto p-5">
                {best || challenger ? (
                  <div className="grid gap-3 md:grid-cols-2">
                    {best ? (
                      <InsightCard>
                        <div className="min-w-0">
                          <div className="text-xs text-muted-foreground">
                            Best you can run now · {score.label}
                          </div>
                          <div className="flex items-center gap-2 font-medium">
                            <CreatorMark creator={best.entry.creator} />
                            <span className="truncate">{bestName}</span>
                          </div>
                          <div className="truncate text-xs text-muted-foreground">
                            {[
                              bestEffort ? `${effortName(bestEffort)} effort` : null,
                              best.entry.values["aa:cost-per-task"] !== undefined
                                ? `$${best.entry.values["aa:cost-per-task"].toFixed(2)} per task`
                                : null,
                              quotaText(best.candidate.quota),
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-3">
                          <b className="text-xl tabular-nums">
                            {(best.entry.values[score.key] ?? 0).toFixed(1)}
                          </b>
                          {props.onStartChat ? (
                            <Button
                              size="sm"
                              onClick={() => props.onStartChat?.(best.candidate.selection)}
                            >
                              New chat
                            </Button>
                          ) : null}
                        </div>
                      </InsightCard>
                    ) : null}
                    {challenger && seen ? (
                      <InsightCard>
                        <div className="min-w-0">
                          <div className="text-xs text-muted-foreground">
                            New since {formatRelativeTimeLabel(seen.takenAt)}
                          </div>
                          <div className="flex items-center gap-2 font-medium">
                            <CreatorMark creator={challenger.creator} />
                            <span className="truncate">{challenger.name}</span>
                          </div>
                          <div className="truncate text-xs text-muted-foreground">
                            {best
                              ? `${((challenger.values[score.key] ?? 0) - (best.entry.values[score.key] ?? 0)).toFixed(1)} ahead of your best`
                              : "Ahead of what you can run"}
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <b className="text-xl tabular-nums">
                            {(challenger.values[score.key] ?? 0).toFixed(1)}
                          </b>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              const target = allModels.find((m) =>
                                m.points.some((p) => p.entry === challenger),
                              );
                              if (target) setSelKey(target.key);
                              setSearch("");
                              setAvailableOnly(false);
                            }}
                          >
                            Show
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost-muted"
                            onClick={() =>
                              setSeen({
                                keys: entries.map((e) => e.sourceModelKey),
                                takenAt: new Date().toISOString(),
                              })
                            }
                          >
                            Dismiss
                          </Button>
                        </div>
                      </InsightCard>
                    ) : null}
                  </div>
                ) : null}
                {view !== "table" ? (
                  <div role="radiogroup" aria-label="Measure" className="flex flex-wrap gap-2">
                    {chips.map((chip, index) => (
                      <button
                        key={chip.key}
                        type="button"
                        role="radio"
                        aria-checked={chip.key === metric.key}
                        onClick={() => setMetricIndex(index)}
                        className={cn(
                          "rounded-full border px-3 py-1 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-ring",
                          chip.key === metric.key
                            ? "border-transparent bg-foreground font-medium text-background"
                            : "border-border/70 text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {chip.label}
                      </button>
                    ))}
                  </div>
                ) : null}
                {ranked.length === 0 ? (
                  <p className="p-8 text-center text-sm text-muted-foreground">
                    No model matches. Clear the search or turn off Available to me.
                  </p>
                ) : view === "table" ? (
                  <div className="-mx-5 overflow-x-auto">
                    <BenchmarksTable
                      source={source}
                      ranked={ranked}
                      score={score}
                      runnable={runnable}
                      offered={offered}
                      runs={(point) => {
                        const s = runsOf(point.entry.sourceModelKey);
                        return s && s.runs > 0
                          ? `${s.runs}${s.successRate === null ? "" : ` · ${Math.round(s.successRate * 100)}%`}`
                          : null;
                      }}
                    />
                  </div>
                ) : view === "bars" ? (
                  <BenchmarksBars
                    models={models}
                    mode={mode}
                    metric={metric}
                    runnable={runnable}
                    selectedKey={selected?.key ?? null}
                    onSelect={setSelKey}
                  />
                ) : (
                  <>
                    <BenchmarksChart
                      source={source}
                      models={models}
                      mode={mode}
                      score={score}
                      compare={compare}
                      runnable={runnable}
                      selected={selected}
                      selectedEffort={selectedEffort}
                      onSelect={(key, effort) => {
                        setSelKey(key);
                        setEffortPick({ key, effort });
                      }}
                    />
                    <div className="flex justify-center">
                      <Segmented
                        label="Compare with"
                        value={String(compareIndex)}
                        options={COMPARE_METRICS[source].map((m, i) => ({
                          id: String(i),
                          label: m.label,
                        }))}
                        onChange={(value) => setCompareIndex(Number(value))}
                      />
                    </div>
                  </>
                )}
              </div>
              {view !== "table" && selected ? (
                <BenchmarkDetail
                  source={source}
                  model={selected}
                  score={score}
                  rank={
                    place > 0 ? { place, of: rankModels(models, "highest", score).length } : null
                  }
                  offered={offered(selected)}
                  effort={selectedEffort}
                  onEffort={(effort) => setEffortPick({ key: selected.key, effort })}
                  chat={
                    chatCandidate
                      ? {
                          selection: chatCandidate.selection,
                          name: selected.name.replace("Claude ", ""),
                        }
                      : null
                  }
                  onStartChat={props.onStartChat}
                  status={status || null}
                />
              ) : null}
            </div>
          )}
          <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-border/70 px-5 py-2.5 text-xs text-muted-foreground">
            <span>
              {sourceStatus ? (
                <>
                  Data:{" "}
                  <a
                    href={sourceStatus.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="underline underline-offset-2"
                  >
                    {attribution}
                  </a>
                  {sourceStatus.state === "stale" ? " · refresh failed, showing older scores" : ""}
                </>
              ) : (
                "Loading the numbers"
              )}
            </span>
            {props.onBlindTest ? (
              <Button size="xs" variant="ghost-muted" onClick={props.onBlindTest}>
                Blind test
              </Button>
            ) : null}
          </footer>
        </div>
      </DialogPopup>
    </Dialog>
  );
}

/** Reads the catalog and the user's own run stats, then draws the window. */
export function BenchmarksWindow(
  props: Omit<Parameters<typeof BenchmarksWindowView>[0], "catalog" | "runStats" | "onRefresh"> & {
    environmentId: EnvironmentId;
  },
) {
  const { environmentId, ...rest } = props;
  const catalogAtom = serverEnvironment.modelBenchmarkCatalog({ environmentId, input: {} });
  const catalog = useEnvironmentQuery(catalogAtom).data;
  const { refresh } = useEnvironmentQueryRefresh(catalogAtom);
  const runStats = useEnvironmentQuery(
    serverEnvironment.modelRunStats({ environmentId, input: {} }),
  ).data;
  return (
    <BenchmarksWindowView {...rest} catalog={catalog} runStats={runStats} onRefresh={refresh} />
  );
}
