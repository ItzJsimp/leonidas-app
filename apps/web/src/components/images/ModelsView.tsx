import type { ImageCatalogModel, ImageHardwareFit } from "@t3tools/contracts";
import {
  CheckIcon,
  DownloadIcon,
  ExternalLinkIcon,
  GaugeIcon,
  InfoIcon,
  PlusIcon,
} from "lucide-react";
import { useId, useMemo, useState } from "react";

import { cn } from "~/lib/utils";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { Sheet, SheetDescription, SheetHeader, SheetPopup, SheetTitle } from "../ui/sheet";
import { Toggle, ToggleGroup } from "../ui/toggle-group";
import { FitBadge, HelpText, LicenceBadge, StateBadge, Unverified } from "./catalogBadges";
import {
  estimateRunRange,
  filterCatalog,
  formatBytes,
  formatRange,
  installCheck,
  modelTimeLabel,
  sortCatalog,
  type CatalogFilter,
  type CatalogSort,
} from "./catalog.logic";
import { formatSeconds, toggleModel } from "./images.logic";
import { ARENA_URL, BENCHMARK_PROMPTS, type GalleryItem } from "./imageTypes";

const FILTERS: ReadonlyArray<{ id: CatalogFilter; label: string }> = [
  { id: "installed", label: "Installed" },
  { id: "fits", label: "Fits my PC" },
  { id: "commercial", label: "Sale use OK" },
  { id: "fast", label: "Fast" },
];

const SORTS: ReadonlyArray<{ id: CatalogSort; label: string }> = [
  { id: "recommended", label: "Best for my PC" },
  { id: "fastest", label: "Fastest" },
  { id: "smallest", label: "Smallest" },
  { id: "name", label: "Name" },
];

const ROW_GRID =
  "lg:grid lg:grid-cols-[minmax(13rem,1.6fr)_8rem_minmax(9rem,1fr)_minmax(8rem,0.9fr)_auto] lg:items-center lg:gap-4";

export function ModelsView(props: {
  readonly catalog: ReadonlyArray<ImageCatalogModel>;
  readonly hardware: ImageHardwareFit;
  readonly items: ReadonlyArray<GalleryItem>;
  readonly selectedIds: ReadonlyArray<string>;
  readonly online: boolean;
  readonly onSelect: (ids: string[]) => void;
  readonly onInstall: (model: ImageCatalogModel) => void;
  readonly onBenchmark: (ids: ReadonlyArray<string>) => void;
  readonly onDone: () => void;
}) {
  const ids = useId();
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<ReadonlyArray<CatalogFilter>>([]);
  const [sort, setSort] = useState<CatalogSort>("recommended");
  const [detailId, setDetailId] = useState<string | null>(null);
  const shown = useMemo(
    () => sortCatalog(filterCatalog(props.catalog, query, new Set(filters)), sort),
    [filters, props.catalog, query, sort],
  );
  const detail = props.catalog.find((model) => model.id === detailId) ?? null;
  const benchModels = props.catalog.filter(
    (model) => model.state === "ready" && model.fit !== "too-big",
  );
  const benchRange = estimateRunRange(benchModels, BENCHMARK_PROMPTS.length);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Your PC: {props.hardware.gpuName}, {formatBytes(props.hardware.ramBytes)} memory,{" "}
        {formatBytes(props.hardware.freeDiskBytes)} free on the disk. Fit and time use these
        numbers.
      </p>

      {/* Toolbar */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="lg:w-72">
          <Input
            type="search"
            aria-label="Search models"
            placeholder="Search models"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <ToggleGroup
          multiple
          variant="outline"
          aria-label="Filters"
          className="flex-wrap *:pointer-coarse:min-h-11"
          value={[...filters]}
          onValueChange={(next) => setFilters(next as CatalogFilter[])}
        >
          {FILTERS.map((filter) => (
            <Toggle key={filter.id} value={filter.id}>
              {filter.label}
            </Toggle>
          ))}
        </ToggleGroup>
        <div className="flex items-center gap-2 lg:ms-auto">
          <label htmlFor={`${ids}-sort`} className="text-sm text-muted-foreground">
            Sort
          </label>
          <Select value={sort} onValueChange={(value) => value && setSort(value as CatalogSort)}>
            <SelectTrigger id={`${ids}-sort`} className="w-44">
              <SelectValue>{SORTS.find((entry) => entry.id === sort)?.label}</SelectValue>
            </SelectTrigger>
            <SelectPopup alignItemWithTrigger={false}>
              {SORTS.map((entry) => (
                <SelectItem key={entry.id} value={entry.id}>
                  {entry.label}
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
        </div>
      </div>

      {/* Catalog */}
      <p className="text-sm text-muted-foreground" aria-live="polite">
        Showing {shown.length} of {props.catalog.length} models
      </p>
      <div className="max-h-[68vh] overflow-y-auto overscroll-contain rounded-2xl border bg-card shadow-xs/5">
        <div
          className={cn(
            ROW_GRID,
            "sticky top-0 z-10 hidden border-b bg-muted px-4 py-2 text-xs font-medium text-muted-foreground",
          )}
          aria-hidden
        >
          <span>Model</span>
          <span>State</span>
          <span>On your PC</span>
          <span>Licence</span>
          <span className="w-56 text-end">Actions</span>
        </div>
        {shown.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">
            No model matches. Remove a filter or change the search.
          </p>
        ) : (
          <ul aria-label="Models">
            {shown.map((model) => (
              <ModelRow
                key={model.id}
                model={model}
                freeDiskBytes={props.hardware.freeDiskBytes}
                selected={props.selectedIds.includes(model.id)}
                onToggle={() => props.onSelect(toggleModel(props.selectedIds, model.id))}
                onInstall={() => props.onInstall(model)}
                onDetails={() => setDetailId(model.id)}
              />
            ))}
          </ul>
        )}
      </div>
      <HelpText>
        Times marked "on your PC" come from pictures you made. "Estimate" means no picture ran yet.
        Models marked "Not tested" are candidates: Leonidas did not test them yet.
      </HelpText>

      {/* Benchmarks */}
      <section
        aria-labelledby={`${ids}-bench`}
        className="flex flex-col gap-3 rounded-2xl border bg-card p-4 shadow-xs/5 sm:p-5"
      >
        <h2 id={`${ids}-bench`} className="flex items-center gap-2 text-sm font-semibold">
          <GaugeIcon className="size-4" aria-hidden />
          Compare models on your PC
        </h2>
        <p className="text-sm text-muted-foreground">
          Make the same {BENCHMARK_PROMPTS.length} test prompts with each ready model. The prompts
          test text, faces, hands, a busy scene, a style and a product photo. You then see the
          answers side by side in Gallery.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            disabled={!props.online || benchModels.length === 0}
            onClick={() => props.onBenchmark(benchModels.map((model) => model.id))}
          >
            Run benchmark prompts
          </Button>
          <span className="text-xs text-muted-foreground">
            {benchModels.length === 0
              ? "No ready model fits your PC."
              : `${String(benchModels.length * BENCHMARK_PROMPTS.length)} images, ${formatRange(benchRange)}.`}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          Public quality rankings:{" "}
          <a
            href={ARENA_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 underline underline-offset-2"
          >
            image arena
            <ExternalLinkIcon className="size-3" aria-hidden />
          </a>
          . Leonidas did not check these rankings. Sources do not agree.
        </p>
      </section>

      {/* Selection footer */}
      <div className="sticky bottom-0 z-10 -mx-1 flex items-center gap-3 rounded-2xl border bg-popover/95 p-3 shadow-lg/5 backdrop-blur">
        <span className="flex-1 text-sm">
          <strong className="tabular-nums">{props.selectedIds.length}</strong> models chosen for
          Create
        </span>
        <Button onClick={props.onDone}>Go to Create</Button>
      </div>

      <ModelDetailSheet
        model={detail}
        items={props.items}
        freeDiskBytes={props.hardware.freeDiskBytes}
        onInstall={props.onInstall}
        onClose={() => setDetailId(null)}
      />
    </div>
  );
}

function ModelRow(props: {
  readonly model: ImageCatalogModel;
  readonly freeDiskBytes: number;
  readonly selected: boolean;
  readonly onToggle: () => void;
  readonly onInstall: () => void;
  readonly onDetails: () => void;
}) {
  const { model } = props;
  const install = installCheck(model, props.freeDiskBytes);
  return (
    <li
      className={cn(
        ROW_GRID,
        "flex flex-col gap-3 border-b px-4 py-3 last:border-b-0",
        props.selected && "bg-accent/30",
      )}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{model.label}</span>
          {model.candidate ? <Badge variant="outline">Not tested</Badge> : null}
        </div>
        <div className="text-xs text-muted-foreground">
          {model.family} · {formatBytes(model.sizeBytes)} on disk
        </div>
        {model.tags.length > 0 ? (
          <div className="mt-1 flex flex-wrap gap-1">
            {model.tags.map((tag) => (
              <Badge key={tag} variant="secondary" size="sm">
                {tag}
              </Badge>
            ))}
          </div>
        ) : null}
      </div>
      <div className="flex flex-col items-start gap-1">
        <StateBadge model={model} />
        {model.state === "installing" ? (
          <div
            role="progressbar"
            aria-label={`Install progress, ${model.label}`}
            aria-valuenow={Math.round((model.installProgress ?? 0) * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
            className="h-1.5 w-full max-w-32 overflow-hidden rounded-full bg-muted"
          >
            <div
              className="h-full bg-info transition-[width] motion-reduce:transition-none"
              style={{ width: `${String(Math.round((model.installProgress ?? 0) * 100))}%` }}
            />
          </div>
        ) : null}
      </div>
      <div className="flex flex-col items-start gap-1">
        <FitBadge model={model} />
        <span className="text-xs text-muted-foreground tabular-nums">{modelTimeLabel(model)}</span>
      </div>
      <div className="flex flex-col items-start gap-1">
        <LicenceBadge model={model} />
        {model.licenceVerifiedOn === null ? <Unverified /> : null}
      </div>
      <div className="flex flex-wrap items-center gap-2 lg:w-56 lg:justify-end">
        {model.state === "ready" ? (
          <Button size="sm" variant="outline" onClick={props.onInstall}>
            Verify files
          </Button>
        ) : null}
        {model.state === "not-installed" || model.state === "broken" ? (
          <Button
            size="sm"
            variant="outline"
            disabled={!install.ok}
            title={install.text}
            onClick={props.onInstall}
          >
            <DownloadIcon />
            {model.state === "broken" ? "Repair" : "Install"}
          </Button>
        ) : null}
        <Button
          size="sm"
          variant={props.selected ? "secondary" : "outline"}
          aria-pressed={props.selected}
          aria-label={`${props.selected ? "Chosen" : "Choose"}: ${model.label}`}
          onClick={props.onToggle}
        >
          {props.selected ? <CheckIcon /> : <PlusIcon />}
          {props.selected ? "Chosen" : "Choose"}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={props.onDetails}
          aria-label={`View details: ${model.label}`}
        >
          <InfoIcon />
          View details
        </Button>
      </div>
      {model.state === "not-installed" ? (
        <p className="text-xs text-muted-foreground lg:col-span-5">{install.text}</p>
      ) : null}
    </li>
  );
}

function DetailRow(props: { readonly label: string; readonly children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[8rem_1fr] gap-2 py-1.5 text-sm">
      <dt className="text-muted-foreground">{props.label}</dt>
      <dd className="min-w-0">{props.children}</dd>
    </div>
  );
}

function ModelDetailSheet(props: {
  readonly model: ImageCatalogModel | null;
  readonly items: ReadonlyArray<GalleryItem>;
  readonly freeDiskBytes: number;
  readonly onInstall: (model: ImageCatalogModel) => void;
  readonly onClose: () => void;
}) {
  const { model } = props;
  const runs = useMemo(
    () =>
      model
        ? props.items.filter(
            (item) => item.modelId === model.id && item.status === "done" && item.seconds !== null,
          )
        : [],
    [model, props.items],
  );
  const average =
    runs.length > 0 ? runs.reduce((sum, item) => sum + (item.seconds ?? 0), 0) / runs.length : null;
  const install = model ? installCheck(model, props.freeDiskBytes) : null;
  return (
    <Sheet open={model !== null} onOpenChange={(open) => !open && props.onClose()}>
      <SheetPopup side="right" className="max-w-lg">
        {model ? (
          <>
            <SheetHeader>
              <SheetTitle>{model.label}</SheetTitle>
              <SheetDescription>
                {model.family}. {model.fitReason}
              </SheetDescription>
            </SheetHeader>
            <div className="flex min-h-0 flex-col gap-5 overflow-y-auto px-6 pb-6">
              <div className="flex flex-wrap gap-2">
                <StateBadge model={model} />
                <FitBadge model={model} />
                <LicenceBadge model={model} />
              </div>
              {install && (model.state === "not-installed" || model.state === "broken") ? (
                <div className="flex flex-col gap-1.5">
                  <Button
                    className="self-start"
                    disabled={!install.ok}
                    onClick={() => props.onInstall(model)}
                  >
                    <DownloadIcon />
                    Install
                  </Button>
                  <HelpText>{install.text}</HelpText>
                </div>
              ) : null}
              {model.state === "ready" ? (
                <Button
                  className="self-start"
                  variant="outline"
                  onClick={() => props.onInstall(model)}
                >
                  Verify files
                </Button>
              ) : null}
              <section>
                <h3 className="mb-1 text-sm font-semibold">Speed</h3>
                <dl>
                  <DetailRow label="One picture">{modelTimeLabel(model)}</DetailRow>
                  <DetailRow label="Load time">about {formatSeconds(model.loadSeconds)}</DetailRow>
                  <DetailRow label="Past runs here">
                    {runs.length === 0
                      ? "None yet"
                      : `${String(runs.length)} pictures, average ${formatSeconds(Math.round(average ?? 0))}`}
                  </DetailRow>
                </dl>
              </section>
              <section>
                <h3 className="mb-1 text-sm font-semibold">Default settings</h3>
                <dl className="tabular-nums">
                  <DetailRow label="Steps">
                    {model.defaults.steps} (allowed {model.ranges.steps.min} to{" "}
                    {model.ranges.steps.max})
                  </DetailRow>
                  <DetailRow label="Guidance">
                    {model.defaults.guidance} (allowed {model.ranges.guidance.min} to{" "}
                    {model.ranges.guidance.max})
                  </DetailRow>
                  <DetailRow label="Sampler">{model.defaults.sampler}</DetailRow>
                  <DetailRow label="Size">
                    {model.defaults.width} × {model.defaults.height} pixels
                  </DetailRow>
                </dl>
              </section>
              <section>
                <h3 className="mb-1 text-sm font-semibold">Files</h3>
                <ul className="flex flex-col gap-1 text-sm">
                  {model.files.map((file) => (
                    <li key={file.name} className="flex justify-between gap-3">
                      <span className="min-w-0 truncate font-mono text-xs">{file.name}</span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">
                        {formatBytes(file.sizeBytes)}
                      </span>
                    </li>
                  ))}
                </ul>
                <HelpText className="mt-1">
                  File names are sample data until the server sends them.
                </HelpText>
              </section>
              <section>
                <h3 className="mb-1 text-sm font-semibold">Licence</h3>
                <dl>
                  <DetailRow label="Licence">{model.licenceName}</DetailRow>
                  <DetailRow label="Checked on">
                    {model.licenceVerifiedOn ?? <Unverified />}
                  </DetailRow>
                  <DetailRow label="Source">
                    {(model.licenceUrl ?? model.sourceUrl) ? (
                      <a
                        href={model.licenceUrl ?? model.sourceUrl ?? ""}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 break-all underline underline-offset-2"
                      >
                        Model page
                        <ExternalLinkIcon className="size-3 shrink-0" aria-hidden />
                      </a>
                    ) : (
                      "No link yet"
                    )}
                  </DetailRow>
                </dl>
                <HelpText className="mt-1">
                  Read the licence on the official model page before you sell pictures.
                </HelpText>
              </section>
            </div>
          </>
        ) : null}
      </SheetPopup>
    </Sheet>
  );
}
