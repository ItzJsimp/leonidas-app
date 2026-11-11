import {
  CheckIcon,
  ClipboardCopyIcon,
  Columns2Icon,
  ImageOffIcon,
  LockIcon,
  RefreshCwIcon,
  RotateCcwIcon,
  StarIcon,
  Trash2Icon,
  ZoomInIcon,
  ZoomOutIcon,
} from "lucide-react";
import { memo, useCallback, useId, useMemo, useRef, useState } from "react";

import { cn } from "~/lib/utils";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Dialog, DialogPopup, DialogTitle } from "../ui/dialog";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { Sheet, SheetHeader, SheetPopup, SheetTitle } from "../ui/sheet";
import { Spinner } from "../ui/spinner";
import { Switch } from "../ui/switch";
import { toastManager } from "../ui/toast";
import { HelpText } from "./catalogBadges";
import {
  filterGallery,
  groupRuns,
  MAX_COMPARE,
  toggleCompare,
  type RunGroup,
} from "./catalog.logic";
import { ElapsedText } from "./ElapsedText";
import { canRetry, formatSeconds } from "./images.logic";
import type { GalleryItem } from "./imageTypes";

/** Runs shown before "Show older runs". Pictures are full size files, so the first screen stays small. */
const RUNS_PER_PAGE = 6;

export interface GalleryActions {
  readonly imageUrl: (item: GalleryItem) => string | null;
  readonly onKeep: (item: GalleryItem, kept: boolean) => void;
  readonly onRetry: (item: GalleryItem) => void;
  /** Missing when the server cannot delete a picture. */
  readonly onRemove?: ((item: GalleryItem) => void) | undefined;
  readonly onReuse: (item: GalleryItem) => void;
  readonly onLockSeed: (item: GalleryItem) => void;
}

function timeAgo(createdAt: number): string {
  const minutes = Math.round((Date.now() - createdAt) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${String(minutes)} min ago`;
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `${String(hours)} h ago` : `${String(Math.round(hours / 24))} days ago`;
}

export function GalleryView(
  props: GalleryActions & {
    readonly items: ReadonlyArray<GalleryItem>;
    /** True in the Create view: no filter row, shorter empty text. */
    readonly compact?: boolean;
  },
) {
  const ids = useId();
  const [modelId, setModelId] = useState<string | null>(null);
  const [keptOnly, setKeptOnly] = useState(false);
  const [pages, setPages] = useState(1);
  const [compareIds, setCompareIds] = useState<ReadonlyArray<string>>([]);
  const [comparing, setComparing] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  const models = useMemo(() => {
    const seen = new Map<string, string>();
    for (const item of props.items) seen.set(item.modelId, item.modelLabel);
    return [...seen.entries()];
  }, [props.items]);
  const runs = useMemo(
    () => groupRuns(filterGallery(props.items, modelId, keptOnly)),
    [keptOnly, modelId, props.items],
  );
  const shown = runs.slice(0, pages * RUNS_PER_PAGE);
  const byId = useMemo(() => new Map(props.items.map((item) => [item.id, item])), [props.items]);
  const compareItems = compareIds.flatMap((id) => {
    const item = byId.get(id);
    return item && item.status === "done" ? [item] : [];
  });
  const detail = detailId ? (byId.get(detailId) ?? null) : null;

  const toggle = useCallback(
    (item: GalleryItem) => setCompareIds((current) => toggleCompare(current, item.id)),
    [],
  );
  const open = useCallback((item: GalleryItem) => setDetailId(item.id), []);

  if (props.items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed px-6 py-16 text-center">
        <p className="text-sm font-medium">No pictures yet</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          {props.compact
            ? "Write a prompt, choose models and press Generate. The pictures of each model appear here side by side."
            : "Pictures from each run appear here, grouped by prompt. Go to Create, write a prompt and press Generate."}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className={cn("flex flex-wrap items-center gap-3", props.compact && "hidden")}>
        <label htmlFor={`${ids}-model`} className="sr-only">
          Model
        </label>
        <Select value={modelId ?? ""} onValueChange={(value) => setModelId(value ? value : null)}>
          <SelectTrigger id={`${ids}-model`} className="w-52" aria-label="Show model">
            <SelectValue>
              {modelId ? (models.find(([id]) => id === modelId)?.[1] ?? modelId) : "All models"}
            </SelectValue>
          </SelectTrigger>
          <SelectPopup alignItemWithTrigger={false}>
            <SelectItem value="">All models</SelectItem>
            {models.map(([id, label]) => (
              <SelectItem key={id} value={id}>
                {label}
              </SelectItem>
            ))}
          </SelectPopup>
        </Select>
        <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm sm:min-h-8">
          <Switch checked={keptOnly} onCheckedChange={setKeptOnly} />
          Kept only
        </label>
        <span className="text-xs text-muted-foreground sm:ms-auto">
          Choose 2 to {MAX_COMPARE} pictures to compare them side by side.
        </span>
      </div>

      {shown.length === 0 ? (
        <p className="rounded-2xl border border-dashed px-6 py-10 text-center text-sm text-muted-foreground">
          No picture matches these filters.
        </p>
      ) : (
        shown.map((run) => (
          <RunCard
            key={run.jobId}
            run={run}
            compareIds={compareIds}
            actions={props}
            onToggleCompare={toggle}
            onOpen={open}
          />
        ))
      )}
      {runs.length > shown.length ? (
        <Button
          variant="outline"
          className="self-center"
          onClick={() => setPages((value) => value + 1)}
        >
          Show older runs ({runs.length - shown.length})
        </Button>
      ) : null}

      {compareIds.length > 0 ? (
        <div className="sticky bottom-0 z-10 flex flex-wrap items-center gap-3 rounded-2xl border bg-popover/95 p-3 shadow-lg/5 backdrop-blur">
          <span className="flex-1 text-sm">
            <strong className="tabular-nums">{compareItems.length}</strong> of {MAX_COMPARE} chosen
            to compare
          </span>
          <Button variant="outline" size="sm" onClick={() => setCompareIds([])}>
            Clear
          </Button>
          <Button size="sm" disabled={compareItems.length < 2} onClick={() => setComparing(true)}>
            <Columns2Icon />
            Compare
          </Button>
        </div>
      ) : null}

      {comparing ? (
        <CompareDialog
          items={compareItems}
          imageUrl={props.imageUrl}
          onClose={() => setComparing(false)}
        />
      ) : null}
      <ImageDetailSheet item={detail} actions={props} onClose={() => setDetailId(null)} />
    </div>
  );
}

const RunCard = memo(function RunCard(props: {
  readonly run: RunGroup<GalleryItem>;
  readonly compareIds: ReadonlyArray<string>;
  readonly actions: GalleryActions;
  readonly onToggleCompare: (item: GalleryItem) => void;
  readonly onOpen: (item: GalleryItem) => void;
}) {
  const { run } = props;
  const count = run.byModel.reduce((sum, entry) => sum + entry.items.length, 0);
  return (
    <section
      aria-label={`Run: ${run.first.prompt}`}
      className="flex flex-col gap-3 rounded-2xl border bg-card p-4 shadow-xs/5"
    >
      <header className="flex flex-wrap items-start gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-2 text-sm font-medium">{run.first.prompt}</h3>
          <p className="text-xs text-muted-foreground tabular-nums">
            {run.byModel.length} {run.byModel.length === 1 ? "model" : "models"} · {count}{" "}
            {count === 1 ? "picture" : "pictures"} · {run.first.width} × {run.first.height} ·{" "}
            {timeAgo(run.createdAt)}
            {run.first.benchmark ? " · Benchmark" : ""}
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => props.actions.onReuse(run.first)}>
          <RotateCcwIcon />
          Reuse settings
        </Button>
      </header>
      <div className="flex flex-col gap-4">
        {run.byModel.map((entry) => (
          <div key={entry.modelId} className="flex min-w-0 flex-col gap-2">
            <h4 className="truncate text-sm font-semibold">{entry.items[0]?.modelLabel}</h4>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-[repeat(auto-fill,minmax(12rem,14rem))]">
              {entry.items.map((item) =>
                item.status === "done" ? (
                  <Tile
                    key={item.id}
                    item={item}
                    url={props.actions.imageUrl(item)}
                    chosen={props.compareIds.includes(item.id)}
                    onToggleCompare={props.onToggleCompare}
                    onOpen={props.onOpen}
                  />
                ) : (
                  <StatusRow key={item.id} item={item} onRetry={props.actions.onRetry} />
                ),
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
});

function Tile(props: {
  readonly item: GalleryItem;
  readonly url: string | null;
  readonly chosen: boolean;
  readonly onToggleCompare: (item: GalleryItem) => void;
  readonly onOpen: (item: GalleryItem) => void;
}) {
  const { item } = props;
  return (
    <figure className="flex flex-col gap-1">
      <div
        className={cn(
          "relative overflow-hidden rounded-lg bg-muted ring-offset-2 ring-offset-card",
          props.chosen && "ring-2 ring-primary",
        )}
        style={{ aspectRatio: `${String(item.width)} / ${String(item.height)}` }}
      >
        {props.url ? (
          <button
            type="button"
            onClick={() => props.onOpen(item)}
            aria-label={`Open picture, ${item.modelLabel}, seed ${String(item.seed)}`}
            className="block size-full cursor-zoom-in outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
          >
            <img
              src={props.url}
              alt=""
              loading="lazy"
              decoding="async"
              width={item.width}
              height={item.height}
              className="size-full object-cover"
            />
          </button>
        ) : null}
        <button
          type="button"
          aria-pressed={props.chosen}
          aria-label={`${props.chosen ? "Remove from" : "Add to"} compare: ${item.modelLabel}, seed ${String(item.seed)}`}
          onClick={() => props.onToggleCompare(item)}
          className={cn(
            "absolute start-1.5 top-1.5 flex size-8 items-center justify-center rounded-md border bg-background/90 text-foreground shadow-sm outline-hidden backdrop-blur focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset pointer-coarse:size-11",
            props.chosen && "border-primary bg-primary text-primary-foreground",
          )}
        >
          {props.chosen ? <CheckIcon className="size-4" /> : <Columns2Icon className="size-4" />}
        </button>
        {item.kept ? (
          <Badge variant="secondary" className="absolute end-1.5 top-1.5">
            <StarIcon /> Kept
          </Badge>
        ) : null}
      </div>
      <figcaption className="text-xs text-muted-foreground tabular-nums">
        {item.seconds !== null ? formatSeconds(item.seconds) : ""} · Seed {item.seed}
      </figcaption>
    </figure>
  );
}

/** A compact row for an image that is not a finished picture. */
function StatusRow(props: {
  readonly item: GalleryItem;
  readonly onRetry: (item: GalleryItem) => void;
}) {
  const { item } = props;
  return (
    <div
      className={cn(
        "flex min-h-11 items-start gap-2 rounded-lg border px-2.5 py-2 text-xs",
        item.status === "error" && "border-destructive/30 bg-destructive/6",
        item.status === "waiting" && "border-dashed",
      )}
      role={item.status === "error" ? "alert" : undefined}
    >
      <span className="mt-0.5 shrink-0">
        {item.status === "running" ? (
          <Spinner className="size-3.5" />
        ) : item.status === "error" ? (
          <ImageOffIcon className="size-3.5 text-destructive-foreground" />
        ) : null}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-medium">
          {item.status === "waiting"
            ? "Waiting"
            : item.status === "running"
              ? "Running"
              : item.status === "cancelled"
                ? "Stopped"
                : "Failed"}{" "}
          <span className="font-normal text-muted-foreground tabular-nums">
            · Seed {item.seed}
            {item.status === "running" && item.startedAt !== null ? (
              <>
                {" · "}
                <ElapsedText startedAt={item.startedAt} clockSkew={0} />
              </>
            ) : null}
          </span>
        </span>
        {item.error ? (
          <span className="mt-0.5 block text-destructive-foreground">{item.error}</span>
        ) : null}
      </span>
      {canRetry(item) ? (
        <Button
          size="compact"
          variant="outline"
          className="pointer-coarse:min-h-10"
          onClick={() => props.onRetry(item)}
        >
          <RefreshCwIcon />
          Try again
        </Button>
      ) : null}
    </div>
  );
}

const ZOOMS = [1, 1.5, 2, 3, 4];

/** 2 to 4 pictures side by side. Zoom and scroll move all panes together. */
function CompareDialog(props: {
  readonly items: ReadonlyArray<GalleryItem>;
  readonly imageUrl: (item: GalleryItem) => string | null;
  readonly onClose: () => void;
}) {
  const [zoomIndex, setZoomIndex] = useState(0);
  const zoom = ZOOMS[zoomIndex] ?? 1;
  const panes = useRef<Array<HTMLDivElement | null>>([]);
  const syncing = useRef(false);
  const sync = (from: number) => {
    if (syncing.current) return;
    const source = panes.current[from];
    if (!source) return;
    syncing.current = true;
    const x = source.scrollLeft / Math.max(1, source.scrollWidth - source.clientWidth);
    const y = source.scrollTop / Math.max(1, source.scrollHeight - source.clientHeight);
    panes.current.forEach((pane, index) => {
      if (!pane || index === from) return;
      pane.scrollLeft = x * (pane.scrollWidth - pane.clientWidth);
      pane.scrollTop = y * (pane.scrollHeight - pane.clientHeight);
    });
    requestAnimationFrame(() => {
      syncing.current = false;
    });
  };
  return (
    <Dialog open onOpenChange={(open) => !open && props.onClose()}>
      <DialogPopup className="h-[92dvh] w-[96vw] max-w-[96vw]">
        <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
          <div className="flex flex-wrap items-center gap-2 pe-10">
            <DialogTitle className="flex-1">Compare {props.items.length} pictures</DialogTitle>
            <Button
              size="icon"
              variant="outline"
              aria-label="Zoom out"
              disabled={zoomIndex === 0}
              onClick={() => setZoomIndex((value) => Math.max(0, value - 1))}
            >
              <ZoomOutIcon />
            </Button>
            <span className="w-12 text-center text-sm tabular-nums" aria-live="polite">
              {Math.round(zoom * 100)}%
            </span>
            <Button
              size="icon"
              variant="outline"
              aria-label="Zoom in"
              disabled={zoomIndex === ZOOMS.length - 1}
              onClick={() => setZoomIndex((value) => Math.min(ZOOMS.length - 1, value + 1))}
            >
              <ZoomInIcon />
            </Button>
          </div>
          <HelpText>
            Zoom and scroll move every picture together, so you see the same part.
          </HelpText>
          <div
            className={cn(
              "grid min-h-0 flex-1 gap-2",
              props.items.length === 2 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-2",
              props.items.length > 2 && "grid-rows-2 lg:grid-cols-4 lg:grid-rows-1",
            )}
          >
            {props.items.map((item, index) => (
              <figure key={item.id} className="flex min-h-0 min-w-0 flex-col gap-1">
                <div
                  ref={(node) => {
                    panes.current[index] = node;
                  }}
                  onScroll={() => sync(index)}
                  className="min-h-0 flex-1 overflow-auto rounded-lg bg-muted"
                >
                  <img
                    src={props.imageUrl(item) ?? ""}
                    alt={`${item.modelLabel}, seed ${String(item.seed)}`}
                    style={{ width: `${String(zoom * 100)}%` }}
                    className="block h-auto max-w-none"
                  />
                </div>
                <figcaption className="truncate text-xs tabular-nums">
                  <span className="font-medium">{item.modelLabel}</span>
                  <span className="text-muted-foreground">
                    {" "}
                    · Seed {item.seed}
                    {item.seconds !== null ? ` · ${formatSeconds(item.seconds)}` : ""}
                  </span>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </DialogPopup>
    </Dialog>
  );
}

function recipeText(item: GalleryItem): string {
  return JSON.stringify(
    {
      prompt: item.prompt,
      negativePrompt: item.negativePrompt,
      model: item.modelLabel,
      seed: item.seed,
      width: item.width,
      height: item.height,
      steps: item.steps,
      guidance: item.guidance,
      sampler: item.sampler,
      seconds: item.seconds,
    },
    null,
    2,
  );
}

function ImageDetailSheet(props: {
  readonly item: GalleryItem | null;
  readonly actions: GalleryActions;
  readonly onClose: () => void;
}) {
  const { item, actions } = props;
  const url = item ? actions.imageUrl(item) : null;
  const rows: ReadonlyArray<readonly [string, string]> = item
    ? [
        ["Model", item.modelLabel],
        ["Seed", String(item.seed)],
        ["Size", `${String(item.width)} × ${String(item.height)} pixels`],
        ["Steps", String(item.steps)],
        ["Guidance", String(item.guidance)],
        ["Sampler", item.sampler],
        ["Things to avoid", item.negativePrompt === "" ? "None" : item.negativePrompt],
        ["Time", item.seconds !== null ? formatSeconds(item.seconds) : "Not done"],
        ["File", item.file ?? "None"],
      ]
    : [];
  return (
    <Sheet open={item !== null} onOpenChange={(open) => !open && props.onClose()}>
      <SheetPopup side="right" className="max-w-xl">
        {item ? (
          <>
            <SheetHeader>
              <SheetTitle>Picture and recipe</SheetTitle>
            </SheetHeader>
            <div className="flex min-h-0 flex-col gap-4 overflow-y-auto px-6 pb-6">
              {url ? (
                <img
                  src={url}
                  alt={item.prompt}
                  className="w-full rounded-lg bg-muted"
                  style={{ aspectRatio: `${String(item.width)} / ${String(item.height)}` }}
                />
              ) : null}
              <div className="grid grid-cols-2 gap-2">
                <Button
                  onClick={() => {
                    actions.onReuse(item);
                    props.onClose();
                  }}
                >
                  <RotateCcwIcon />
                  Reuse all settings
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    actions.onLockSeed(item);
                    props.onClose();
                  }}
                >
                  <LockIcon />
                  Lock this seed
                </Button>
                <Button
                  variant={item.kept ? "secondary" : "outline"}
                  aria-pressed={item.kept}
                  onClick={() => actions.onKeep(item, !item.kept)}
                >
                  {item.kept ? <CheckIcon /> : <StarIcon />}
                  {item.kept ? "Kept" : "Keep"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    void navigator.clipboard
                      .writeText(recipeText(item))
                      .then(() => toastManager.add({ type: "success", title: "Recipe copied" }))
                      .catch(() => toastManager.add({ type: "error", title: "Could not copy" }));
                  }}
                >
                  <ClipboardCopyIcon />
                  Copy recipe
                </Button>
                {actions.onRemove ? (
                  <Button
                    variant="destructive-outline"
                    onClick={() => {
                      actions.onRemove?.(item);
                      props.onClose();
                    }}
                  >
                    <Trash2Icon />
                    Delete
                  </Button>
                ) : null}
              </div>
              <HelpText>
                Reuse all settings puts the prompt, model, seed and settings back in Create. Lock
                this seed keeps your prompt and models, and fixes the seed.
              </HelpText>
              <section>
                <h3 className="mb-1 text-sm font-semibold">Prompt</h3>
                <p className="text-sm">{item.prompt}</p>
              </section>
              <dl className="text-sm">
                {rows.map(([label, value]) => (
                  <div key={label} className="grid grid-cols-[8rem_1fr] gap-2 border-t py-1.5">
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className="min-w-0 break-words tabular-nums">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </>
        ) : null}
      </SheetPopup>
    </Sheet>
  );
}
