import type {
  ImageCatalogModel,
  ImageHardwareFit,
  ImageItem,
  ImageModelFit,
  ImageModelInstallState,
  ImageNumberRange,
} from "@t3tools/contracts";

import { formatSeconds, parseSeedInput } from "./images.logic";

/* Catalog, fit, time, seed and gallery logic for the Images page. Pure functions only. */

const GB = 1024 ** 3;

/** Bytes as short text, for example "7.8 GB" or "512 MB". */
export function formatBytes(bytes: number): string {
  if (bytes >= GB) return `${(bytes / GB).toFixed(bytes >= 10 * GB ? 0 : 1)} GB`;
  return `${String(Math.max(1, Math.round(bytes / 1024 ** 2)))} MB`;
}

/**
 * Fit of a model on a PC. The full model in graphics memory runs well. When the card holds
 * at least half and normal memory holds the rest, it runs slow. Else it is too big.
 */
export function computeFit(
  modelVramBytes: number,
  hardware: Pick<ImageHardwareFit, "vramBytes" | "ramBytes" | "unifiedMemory">,
): { readonly fit: ImageModelFit; readonly reason: string } {
  if (hardware.unifiedMemory)
    return modelVramBytes <= hardware.ramBytes * 1.5
      ? {
          fit: "runs-slow",
          reason:
            "Apple Silicon support is Beta. This model uses shared memory. Performance is not verified.",
        }
      : { fit: "too-big", reason: "This model exceeds the shared memory estimate for this Mac." };
  const need = formatBytes(modelVramBytes);
  const card = formatBytes(hardware.vramBytes);
  if (modelVramBytes <= hardware.vramBytes) {
    return { fit: "runs-well", reason: `Needs about ${need}. Your card has ${card}.` };
  }
  const spill = modelVramBytes - hardware.vramBytes;
  if (hardware.vramBytes * 2 >= modelVramBytes && spill <= hardware.ramBytes / 2) {
    return {
      fit: "runs-slow",
      reason: `Needs about ${need}. Your card has ${card}, so part of it moves to normal memory.`,
    };
  }
  return { fit: "too-big", reason: `Needs about ${need}. Your card has only ${card}.` };
}

export function fitView(fit: ImageModelFit): {
  readonly label: string;
  readonly variant: "success" | "warning" | "error";
} {
  switch (fit) {
    case "runs-well":
      return { label: "Runs well", variant: "success" };
    case "runs-slow":
      return { label: "Runs slow", variant: "warning" };
    case "too-big":
      return { label: "Too big", variant: "error" };
  }
}

type TimeFields = Pick<ImageCatalogModel, "measuredSeconds" | "estimatedSeconds">;

/** Seconds per image for one model: measured when it exists, else the estimate. */
export function secondsPerImage(model: TimeFields): {
  readonly seconds: number;
  readonly measured: boolean;
} {
  return model.measuredSeconds !== null
    ? { seconds: model.measuredSeconds, measured: true }
    : { seconds: model.estimatedSeconds, measured: false };
}

/** Time text for a model, for example "12 s on your PC" or "about 20 s, estimate". */
export function modelTimeLabel(model: TimeFields): string {
  const { seconds, measured } = secondsPerImage(model);
  const rounded = formatSeconds(Math.round(seconds));
  return measured ? `${rounded} on your PC` : `about ${rounded}, estimate`;
}

/** Short time text for a chip, for example "12 s" or "~20 s". The "~" marks an estimate. */
export function modelTimeShort(model: TimeFields): string {
  const { seconds, measured } = secondsPerImage(model);
  return `${measured ? "" : "~"}${formatSeconds(Math.round(seconds))}`;
}

export interface TimeRange {
  readonly low: number;
  readonly high: number;
}

/** Spread of the high end. Measured times are close, estimates are wide. */
const MEASURED_SPREAD = 1.15;
const ESTIMATE_SPREAD = 1.6;

/**
 * Total time for one Generate press. Each model loads once, then makes `count` images.
 * The engine frees memory when the model changes, so load time counts for every model.
 */
export function estimateRunRange(
  models: ReadonlyArray<TimeFields & Pick<ImageCatalogModel, "loadSeconds">>,
  count: number,
): TimeRange {
  let low = 0;
  let high = 0;
  for (const model of models) {
    const { seconds, measured } = secondsPerImage(model);
    const one = model.loadSeconds + seconds * count;
    low += one;
    high += one * (measured ? MEASURED_SPREAD : ESTIMATE_SPREAD);
  }
  return { low: Math.round(low), high: Math.round(high) };
}

/** Over this many seconds, Generate asks to confirm. */
const CONFIRM_RUN_SECONDS = 600;

export function needsConfirm(range: TimeRange): boolean {
  return range.high > CONFIRM_RUN_SECONDS;
}

const minutes = (seconds: number) => Math.max(1, Math.round(seconds / 60));

/** Short range text, for example "about 1 to 2 min" or "about 40 s to 1 min". */
export function formatRange(range: TimeRange): string {
  const toText = (seconds: number) =>
    seconds < 60 ? `${String(seconds)} s` : `${String(minutes(seconds))} min`;
  const low = toText(range.low);
  const high = toText(range.high);
  if (low === high) return `about ${low}`;
  if (range.low >= 60) return `about ${String(minutes(range.low))} to ${high}`;
  return `about ${low} to ${high}`;
}

export type SeedMode = "random" | "fixed";

const MAX_SEED = 4_294_967_295;

export function randomSeed(random: () => number = Math.random): number {
  return Math.floor(random() * MAX_SEED);
}

/** Seed for one press. Random mode picks a new seed each time. Fixed mode uses the number. */
export function resolveSeed(
  mode: SeedMode,
  fixedText: string,
  random: () => number = Math.random,
): number | "invalid" {
  if (mode === "random") return randomSeed(random);
  const parsed = parseSeedInput(fixedText);
  if (parsed === null || parsed === "invalid" || parsed > MAX_SEED) return "invalid";
  return parsed;
}

export type AspectId = "square" | "portrait" | "landscape" | "wide";
export type SizeId = "small" | "medium" | "large";

export const ASPECTS: ReadonlyArray<{
  readonly id: AspectId;
  readonly label: string;
  readonly w: number;
  readonly h: number;
}> = [
  { id: "square", label: "Square", w: 1, h: 1 },
  { id: "portrait", label: "Portrait", w: 3, h: 4 },
  { id: "landscape", label: "Landscape", w: 4, h: 3 },
  { id: "wide", label: "Wide", w: 16, h: 9 },
];

export const SIZES: ReadonlyArray<{
  readonly id: SizeId;
  readonly label: string;
  readonly longEdge: number;
}> = [
  { id: "small", label: "Small", longEdge: 768 },
  { id: "medium", label: "Medium", longEdge: 1024 },
  { id: "large", label: "Large", longEdge: 1344 },
];

/** Width and height in pixels. Both are multiples of 64, as image models expect. */
export function dimensionsFor(aspect: AspectId, size: SizeId): { width: number; height: number } {
  const ratio = ASPECTS.find((entry) => entry.id === aspect) ?? { w: 1, h: 1 };
  const edge = SIZES.find((entry) => entry.id === size)?.longEdge ?? 1024;
  const round = (value: number) => Math.max(64, Math.round(value / 64) * 64);
  return ratio.w >= ratio.h
    ? { width: round(edge), height: round((edge * ratio.h) / ratio.w) }
    : { width: round((edge * ratio.w) / ratio.h), height: round(edge) };
}

export function clampToRange(value: number, range: ImageNumberRange): number {
  if (!Number.isFinite(value)) return range.min;
  const stepped = Math.round((value - range.min) / range.step) * range.step + range.min;
  return Math.min(range.max, Math.max(range.min, Number(stepped.toFixed(4))));
}

export type CatalogFilter = "installed" | "fits" | "commercial" | "fast";
export type CatalogSort = "recommended" | "fastest" | "smallest" | "name";

const FIT_ORDER: Record<ImageModelFit, number> = { "runs-well": 0, "runs-slow": 1, "too-big": 2 };
const STATE_ORDER: Record<ImageModelInstallState, number> = {
  ready: 0,
  installing: 1,
  "not-installed": 2,
  broken: 3,
};

export function filterCatalog(
  models: ReadonlyArray<ImageCatalogModel>,
  query: string,
  filters: ReadonlySet<CatalogFilter>,
): ImageCatalogModel[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return models.filter((model) => {
    if (filters.has("installed") && model.state !== "ready") return false;
    if (filters.has("fits") && model.fit === "too-big") return false;
    if (filters.has("commercial") && model.commercialUse !== "yes") return false;
    if (filters.has("fast") && model.speedTier !== "fast") return false;
    const text = `${model.label} ${model.family} ${model.tags.join(" ")}`.toLowerCase();
    return words.every((word) => text.includes(word));
  });
}

export function sortCatalog(
  models: ReadonlyArray<ImageCatalogModel>,
  sort: CatalogSort,
): ImageCatalogModel[] {
  const byName = (a: ImageCatalogModel, b: ImageCatalogModel) => a.label.localeCompare(b.label);
  switch (sort) {
    case "fastest":
      return models.toSorted(
        (a, b) => secondsPerImage(a).seconds - secondsPerImage(b).seconds || byName(a, b),
      );
    case "smallest":
      return models.toSorted((a, b) => a.sizeBytes - b.sizeBytes || byName(a, b));
    case "name":
      return models.toSorted(byName);
    case "recommended":
      return models.toSorted(
        (a, b) =>
          STATE_ORDER[a.state] - STATE_ORDER[b.state] ||
          FIT_ORDER[a.fit] - FIT_ORDER[b.fit] ||
          Number(a.candidate) - Number(b.candidate) ||
          byName(a, b),
      );
  }
}

/**
 * Licence badge for the catalog. Only a licence a person verified gets a colour.
 * Any other value shows "Check licence" in a neutral badge, so the warning does not become noise.
 */
export function licenceView(
  model: Pick<ImageCatalogModel, "commercialUse" | "licenceName" | "licenceVerifiedOn">,
): {
  readonly label: string;
  readonly variant: "success" | "error" | "outline";
  readonly verified: boolean;
} {
  const verified = model.licenceVerifiedOn !== null;
  if (!verified || model.commercialUse === "check") {
    return { label: "Check licence", variant: "outline", verified };
  }
  return model.commercialUse === "yes"
    ? { label: `${model.licenceName}, sale use OK`, variant: "success", verified }
    : { label: `${model.licenceName}, no sale use`, variant: "error", verified };
}

/** Can the model install now? Gives the reason in plain words. */
export function installCheck(
  model: Pick<ImageCatalogModel, "sizeBytes" | "state">,
  freeDiskBytes: number,
): { readonly ok: boolean; readonly text: string } {
  if (model.state === "ready") return { ok: false, text: "Installed." };
  if (model.state === "installing") return { ok: false, text: "Installing now." };
  const need = formatBytes(model.sizeBytes);
  const free = formatBytes(freeDiskBytes);
  if (model.sizeBytes > freeDiskBytes) {
    return { ok: false, text: `Needs ${need}. Only ${free} is free on the disk.` };
  }
  return { ok: true, text: `Needs ${need}. ${free} is free on the disk.` };
}

type GroupFields = Pick<ImageItem, "jobId" | "createdAt" | "modelId">;

export interface RunGroup<T extends GroupFields> {
  readonly jobId: string;
  readonly createdAt: number;
  readonly first: T;
  /** Items per model, in the order the models first appear. */
  readonly byModel: ReadonlyArray<{ readonly modelId: string; readonly items: ReadonlyArray<T> }>;
}

/** Groups gallery items by run (jobId), newest run first. */
export function groupRuns<T extends GroupFields>(items: ReadonlyArray<T>): RunGroup<T>[] {
  const runs = new Map<string, { createdAt: number; first: T; models: Map<string, T[]> }>();
  for (const item of items) {
    let run = runs.get(item.jobId);
    if (!run) {
      run = { createdAt: item.createdAt, first: item, models: new Map() };
      runs.set(item.jobId, run);
    }
    run.createdAt = Math.min(run.createdAt, item.createdAt);
    const list = run.models.get(item.modelId);
    if (list) list.push(item);
    else run.models.set(item.modelId, [item]);
  }
  return [...runs.entries()]
    .map(([jobId, run]) => ({
      jobId,
      createdAt: run.createdAt,
      first: run.first,
      byModel: [...run.models.entries()].map(([modelId, list]) => ({ modelId, items: list })),
    }))
    .toSorted((a, b) => b.createdAt - a.createdAt);
}

export function filterGallery<T extends Pick<ImageItem, "modelId" | "kept">>(
  items: ReadonlyArray<T>,
  modelId: string | null,
  keptOnly: boolean,
): T[] {
  return items.filter(
    (item) => (modelId === null || item.modelId === modelId) && (!keptOnly || item.kept),
  );
}

export const MAX_COMPARE = 4;

/** Adds or removes one image from the compare set. The set holds at most 4: the oldest drops. */
export function toggleCompare(chosen: ReadonlyArray<string>, id: string): string[] {
  if (chosen.includes(id)) return chosen.filter((value) => value !== id);
  if (chosen.length >= MAX_COMPARE) return [...chosen.slice(1), id];
  return [...chosen, id];
}
