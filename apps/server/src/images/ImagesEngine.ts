// @effect-diagnostics nodeBuiltinImport:off globalDate:off globalDateInEffect:off preferSchemaOverJson:off - Plain async worker; image files and wall-clock times are the product.
/**
 * The Images engine. It owns the queue, runs images one at a time through an Image Source,
 * and saves each result with its Recipe. It has no Effect dependency, so tests drive it directly.
 */
import * as NodeCrypto from "node:crypto";
import * as NodePath from "node:path";

import {
  IMAGE_SOURCE_CHECKING,
  type ImageItem,
  type ImageSourceStatus,
  type ImagesState,
} from "@t3tools/contracts";

import { comfyModelLabel } from "./imageModels.ts";
import { ImageQueue, expandVariations, pickRandomSeed, shouldFreeMemory } from "./imageQueue.ts";
import { ImageCancelledError, type ImageSource } from "./imageSource.ts";
import { readReferenceImage, validateReferenceImage } from "./readReferenceImage.ts";
import { IMAGES_FOLDER, imageBaseName, readStoredImages } from "./recipe.ts";
import {
  cleanupExpiredImages,
  keepStoredImage,
  removeStoredImage,
  saveStoredImage,
} from "./imageStorage.ts";

/** Entries kept in memory. Older finished images stay on disk and return when the project opens. */
const MAX_ENTRIES = 300;
/** Recipes read from disk when a project opens. */
const HYDRATE_LIMIT = 60;

interface Entry {
  maskPng: string | null;
  readonly referenceName: string | null;
  readonly id: string;
  readonly jobId: string;
  readonly workspaceRoot: string;
  readonly prompt: string;
  readonly modelId: string;
  readonly modelLabel: string;
  readonly seed: number;
  width: number;
  height: number;
  readonly createdAt: number;
  status: ImageItem["status"];
  startedAt: number | null;
  seconds: number | null;
  /** File name inside the images folder. */
  name: string | null;
  kept: boolean;
  error: string | null;
  stopRequested: boolean;
  progress: { readonly completed: number; readonly total: number } | null;
}

export interface ImagesEngineOptions {
  readonly source: ImageSource;
  readonly now?: () => number;
  readonly random?: () => number;
  /** Called after any change the panel should show. */
  readonly onChange?: () => void;
}

export class ImagesEngine {
  private readonly requests = new Map<
    string,
    {
      readonly signature: string;
      readonly result: { readonly jobId: string; readonly queued: number };
    }
  >();
  private readonly queue = new ImageQueue<Entry>();
  private readonly hydrated = new Set<string>();
  private models: ImagesState["models"] = [];
  private lastModelId: string | null = null;
  private pumping = false;
  private abort: AbortController | null = null;
  private sourceStatus: ImageSourceStatus;
  private readonly now: () => number;
  private readonly random: () => number;

  private readonly options: ImagesEngineOptions;

  constructor(options: ImagesEngineOptions) {
    this.options = options;
    this.now = options.now ?? Date.now;
    this.random = options.random ?? Math.random;
    this.sourceStatus = {
      sourceId: options.source.id,
      label: options.source.label,
      baseUrl: options.source.address(),
      online: false,
      busy: false,
      message: IMAGE_SOURCE_CHECKING,
    };
  }

  private changed(): void {
    this.options.onChange?.();
  }

  isBusy(): boolean {
    return this.queue.items.some(
      (entry) => entry.status === "waiting" || entry.status === "running",
    );
  }

  private imagesDir(workspaceRoot: string): string {
    return NodePath.join(workspaceRoot, IMAGES_FOLDER);
  }

  async importReference(input: {
    readonly workspaceRoot: string;
    readonly file: string;
  }): Promise<{ readonly itemId: string }> {
    const bytes = await readReferenceImage(input.file);
    const header = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const date = new Date(this.now());
    const saved = await saveStoredImage({
      workspaceRoot: input.workspaceRoot,
      bytes,
      base: imageBaseName(date, "reference", 0),
      recipe: {
        source: "imported",
        prompt: "Imported image",
        seed: 0,
        modelId: "reference",
        modelLabel: "Imported image",
        settings: { width: header.getUint32(16), height: header.getUint32(20) },
        createdAt: date.toISOString(),
        seconds: 0,
      },
    });
    this.hydrated.delete(input.workspaceRoot);
    await this.hydrate(input.workspaceRoot);
    this.queue.trim(MAX_ENTRIES);
    return { itemId: `disk-${saved.name}` };
  }

  /** Loads finished images of a project from its Recipe sidecars. Runs once per project folder. */
  async hydrate(workspaceRoot: string): Promise<void> {
    if (this.hydrated.has(workspaceRoot)) return;
    this.hydrated.add(workspaceRoot);
    const stored = await readStoredImages(this.imagesDir(workspaceRoot), HYDRATE_LIMIT);
    const known = new Set(this.queue.items.map((entry) => `${entry.workspaceRoot}|${entry.name}`));
    const older = stored
      .filter((image) => !known.has(`${workspaceRoot}|${image.name}`))
      .map((image): Entry => ({
        id: `disk-${image.name}`,
        referenceName: null,
        maskPng: null,
        jobId: "disk",
        workspaceRoot,
        prompt: image.recipe.prompt,
        modelId: image.recipe.modelId,
        modelLabel: image.recipe.modelLabel,
        seed: image.recipe.seed,
        width: typeof image.recipe.settings.width === "number" ? image.recipe.settings.width : 1024,
        height:
          typeof image.recipe.settings.height === "number" ? image.recipe.settings.height : 1024,
        createdAt: Date.parse(image.recipe.createdAt) || 0,
        status: "done",
        startedAt: null,
        seconds: image.recipe.seconds,
        name: image.name,
        kept: image.kept,
        error: null,
        stopRequested: false,
        progress: null,
      }));
    // Disk images are older than anything made in this session, so they go first.
    this.queue.enqueue(older);
    this.changed();
  }

  /** Project folders represented by the recent image history. */
  workspaceRoots(): string[] {
    return [...new Set(this.queue.items.map((entry) => entry.workspaceRoot))].slice(-128);
  }

  async remove(input: {
    readonly workspaceRoot: string;
    readonly itemId: string;
  }): Promise<boolean> {
    const entry = this.queue.items.find(
      (item) =>
        item.id === input.itemId &&
        item.workspaceRoot === input.workspaceRoot &&
        item.status === "done" &&
        item.name !== null,
    );
    if (!entry?.name) return false;
    await removeStoredImage(input.workspaceRoot, entry.name);
    this.queue.remove(entry);
    this.changed();
    return true;
  }

  async cleanup(workspaceRoot: string, enabled: () => boolean): Promise<number> {
    let dirty = false;
    let lastUpdate = this.now();
    const count = await cleanupExpiredImages({
      workspaceRoot,
      now: this.now(),
      enabled,
      onRemoved: (name) => {
        const entry = this.queue.items.find(
          (item) =>
            item.workspaceRoot === workspaceRoot && item.name === name && item.status === "done",
        );
        if (entry) {
          this.queue.remove(entry);
          dirty = true;
        }
        if (dirty && this.now() - lastUpdate >= 500) {
          this.changed();
          dirty = false;
          lastUpdate = this.now();
        }
      },
    });
    if (dirty) this.changed();
    return count;
  }

  /** Reads the source status. Tells the panel when it changed. */
  async refreshStatus(): Promise<void> {
    const status = await this.options.source.status();
    // A cold ComfyUI is silent while it loads a model. While our own image runs, that is busy, not gone.
    const busy = !status.online && status.timedOut === true && this.queue.running() !== undefined;
    const next: ImageSourceStatus = {
      sourceId: this.options.source.id,
      label: this.options.source.label,
      baseUrl: this.options.source.address(),
      online: status.online,
      busy,
      message: busy ? "ComfyUI is busy. It may be loading a model." : status.message,
    };
    const same =
      next.online === this.sourceStatus.online &&
      next.busy === this.sourceStatus.busy &&
      next.message === this.sourceStatus.message &&
      next.baseUrl === this.sourceStatus.baseUrl;
    this.sourceStatus = next;
    if (!same) this.changed();
  }

  /** Queues one Generate press. Returns at once; the worker runs in the background. */
  enqueue(input: {
    readonly workspaceRoot: string;
    readonly prompt: string;
    readonly modelIds: ReadonlyArray<string>;
    readonly seed: number | null | undefined;
    readonly count: number;
    readonly width?: number;
    readonly height?: number;
    readonly clientRequestId?: string;
    readonly referenceItemId?: string;
    readonly maskPng?: string;
  }): { readonly jobId: string; readonly queued: number } {
    const requestKey = input.clientRequestId
      ? `${input.workspaceRoot}\0${input.clientRequestId}`
      : null;
    const signature = JSON.stringify({
      prompt: input.prompt,
      modelIds: input.modelIds,
      seed: input.seed ?? null,
      count: input.count,
      width: input.width ?? 1024,
      height: input.height ?? 1024,
      referenceItemId: input.referenceItemId ?? null,
      mask: input.maskPng
        ? NodeCrypto.createHash("sha256").update(input.maskPng).digest("hex")
        : null,
    });
    const previous = requestKey ? this.requests.get(requestKey) : undefined;
    if (previous) {
      if (previous.signature !== signature)
        throw new Error("This request id was already used for a different image request.");
      return previous.result;
    }
    if (
      this.queue.items.filter((item) => item.status === "waiting" || item.status === "running")
        .length +
        input.modelIds.length * input.count >
      96
    )
      throw new Error("The image queue is full. Wait for an image to finish.");
    if (input.maskPng) {
      const mask = Buffer.from(input.maskPng, "base64");
      if (mask.byteLength > 256 * 1024) throw new Error("Use a brush mask smaller than 256 KB.");
      validateReferenceImage(mask);
      if (!input.referenceItemId || input.modelIds.some((id) => id !== "flux2klein"))
        throw new Error("A brush mask needs a reference image and FLUX.2 klein 4B.");
    }
    const reference = input.referenceItemId
      ? this.queue.items.find(
          (item) =>
            item.id === input.referenceItemId &&
            item.workspaceRoot === input.workspaceRoot &&
            item.status === "done" &&
            item.name !== null,
        )
      : undefined;
    if (input.referenceItemId && !reference)
      throw new Error("The reference image was not found in this project.");
    if (
      reference &&
      input.modelIds.some((id) => id !== "flux2klein" && id !== "birefnet" && id !== "upscale")
    )
      throw new Error("Image edits need FLUX.2 klein 4B.");
    if (!reference && input.modelIds.includes("birefnet"))
      throw new Error("Choose an image before removing its background.");
    if (
      input.modelIds.includes("upscale") &&
      (!reference || reference.width > 2048 || reference.height > 2048)
    )
      throw new Error("Upscale needs a source image no larger than 2048 pixels on each side.");
    const jobId = NodeCrypto.randomUUID();
    const seed = input.seed ?? pickRandomSeed(this.random);
    const createdAt = this.now();
    const entries = expandVariations({ modelIds: input.modelIds, seed, count: input.count }).map(
      (planned, index): Entry => ({
        id: `${jobId}-${String(index)}`,
        referenceName: reference?.name ?? null,
        maskPng: input.maskPng ?? null,
        jobId,
        workspaceRoot: input.workspaceRoot,
        prompt: input.prompt,
        modelId: planned.modelId,
        modelLabel: comfyModelLabel(planned.modelId),
        seed: planned.seed,
        width:
          reference && (planned.modelId === "birefnet" || planned.modelId === "upscale")
            ? reference.width
            : (input.width ?? 1024),
        height:
          reference && (planned.modelId === "birefnet" || planned.modelId === "upscale")
            ? reference.height
            : (input.height ?? 1024),
        createdAt,
        status: "waiting",
        startedAt: null,
        seconds: null,
        name: null,
        kept: false,
        error: null,
        stopRequested: false,
        progress: null,
      }),
    );
    this.queue.enqueue(entries);
    const result = { jobId, queued: entries.length };
    if (requestKey) {
      this.requests.set(requestKey, { signature, result });
      if (this.requests.size > 256) this.requests.delete(this.requests.keys().next().value!);
    }
    this.queue.trim(MAX_ENTRIES);
    this.changed();
    void this.pump();
    return result;
  }

  /** Queues a failed or stopped image again with the same prompt, model and seed. */
  retry(input: { readonly workspaceRoot: string; readonly itemId: string }): number | null {
    const failed = this.queue.items.find(
      (candidate) =>
        candidate.id === input.itemId &&
        candidate.workspaceRoot === input.workspaceRoot &&
        (candidate.status === "error" || candidate.status === "cancelled"),
    );
    if (!failed) return null;
    const fresh: Entry = {
      ...failed,
      id: `${failed.jobId}-retry-${NodeCrypto.randomUUID().slice(0, 8)}`,
      status: "waiting",
      startedAt: null,
      seconds: null,
      name: null,
      kept: false,
      error: null,
      stopRequested: false,
      progress: null,
    };
    // The new card takes the place of the failed one. Its time stays, so it keeps its spot in the grid.
    this.queue.remove(failed);
    this.queue.enqueue([fresh]);
    this.changed();
    void this.pump();
    return 1;
  }

  /** Cancels every waiting image. With `stopRunning` it also stops the image that runs now. */
  async cancel(input: {
    readonly stopRunning: boolean;
    readonly jobId?: string | undefined;
  }): Promise<number> {
    const cancelled = this.queue.cancelWaiting(
      (entry) => input.jobId === undefined || entry.jobId === input.jobId,
    );
    for (const entry of cancelled) entry.error = "Cancelled.";
    let count = cancelled.length;
    const running = this.queue.running();
    if (
      input.stopRunning &&
      running &&
      (input.jobId === undefined || running.jobId === input.jobId)
    ) {
      running.stopRequested = true;
      count += 1;
      this.abort?.abort();
      await this.options.source.interrupt().catch(() => undefined);
    }
    this.changed();
    return count;
  }

  /** Keeps or un-keeps a finished image. Returns the new state. */
  async keep(input: {
    readonly workspaceRoot: string;
    readonly itemId: string;
    readonly kept: boolean;
  }): Promise<boolean | null> {
    const entry = this.queue.items.find(
      (candidate) =>
        candidate.id === input.itemId &&
        candidate.workspaceRoot === input.workspaceRoot &&
        candidate.status === "done" &&
        candidate.name !== null,
    );
    if (!entry || entry.name === null) return null;
    await keepStoredImage(entry.workspaceRoot, entry.name, input.kept);
    entry.kept = input.kept;
    this.changed();
    return entry.kept;
  }

  /** The state of one project. Newest first. */
  snapshot(workspaceRoot: string): ImagesState {
    const items = this.queue.items
      // A waiting image that was cancelled never ran. Leave it out.
      .filter(
        (entry) =>
          entry.workspaceRoot === workspaceRoot &&
          !(entry.status === "cancelled" && entry.startedAt === null),
      )
      .map((entry): ImageItem => ({
        id: entry.id,
        jobId: entry.jobId,
        prompt: entry.prompt,
        modelId: entry.modelId,
        modelLabel: entry.modelLabel,
        seed: entry.seed,
        width: entry.width,
        height: entry.height,
        status: entry.status,
        createdAt: entry.createdAt,
        startedAt: entry.startedAt,
        seconds: entry.seconds,
        file: entry.name === null ? null : `${IMAGES_FOLDER}/${entry.name}.png`,
        kept: entry.kept,
        error: entry.error,
        ...(entry.progress
          ? { completedSteps: entry.progress.completed, totalSteps: entry.progress.total }
          : {}),
      }))
      // Newest press first. The sort is stable, so one press keeps its run order.
      .toSorted((a, b) => b.createdAt - a.createdAt);
    return {
      source: this.sourceStatus,
      models: this.models,
      items,
      now: this.now(),
      workspaceRoot,
      imagesFolder: IMAGES_FOLDER,
    };
  }

  async loadModels(): Promise<void> {
    this.models = await this.options.source.listModels();
    this.changed();
  }

  /** Runs waiting images one by one until the queue is empty. */
  private async pump(): Promise<void> {
    if (this.pumping) return;
    this.pumping = true;
    try {
      for (;;) {
        const entry = this.queue.claimNext();
        if (!entry) break;
        await this.runEntry(entry);
        this.queue.trim(MAX_ENTRIES);
        this.changed();
      }
    } finally {
      this.pumping = false;
    }
  }

  private async runEntry(entry: Entry): Promise<void> {
    const { source } = this.options;
    entry.startedAt = this.now();
    this.changed();
    this.abort = new AbortController();
    let lastProgress = 0;
    try {
      if (shouldFreeMemory(this.lastModelId, entry.modelId)) {
        await source.freeMemory?.();
      }
      this.lastModelId = entry.modelId;
      const referenceImage = entry.referenceName
        ? await readReferenceImage(
            NodePath.join(this.imagesDir(entry.workspaceRoot), `${entry.referenceName}.png`),
          )
        : undefined;
      const maskImage = entry.maskPng ? Buffer.from(entry.maskPng, "base64") : undefined;
      if (referenceImage && maskImage) {
        const reference = validateReferenceImage(referenceImage);
        const mask = validateReferenceImage(maskImage);
        if (reference.width !== mask.width || reference.height !== mask.height)
          throw new Error(
            "The brush mask does not match the selected image. Paint the area again.",
          );
      }
      if (entry.stopRequested || this.abort.signal.aborted) throw new ImageCancelledError();
      const result = await source.generate(
        {
          modelId: entry.modelId,
          prompt: entry.prompt,
          seed: entry.seed,
          width: entry.width,
          height: entry.height,
          ...(referenceImage ? { referenceImage } : {}),
          ...(maskImage ? { maskImage } : {}),
        },
        {
          signal: this.abort.signal,
          onProgress: (completed, total) => {
            if (entry.status !== "running" || entry.stopRequested) return;
            entry.progress = { completed, total };
            if (this.now() - lastProgress >= 500 || completed === total) {
              lastProgress = this.now();
              this.changed();
            }
          },
        },
      );
      const finishedAt = this.now();
      if (typeof result.settings.width === "number") entry.width = result.settings.width;
      if (typeof result.settings.height === "number") entry.height = result.settings.height;
      const seconds = Math.round((finishedAt - (entry.startedAt ?? finishedAt)) / 100) / 10;
      const saved = await saveStoredImage({
        workspaceRoot: entry.workspaceRoot,
        bytes: result.bytes,
        base: imageBaseName(new Date(finishedAt), entry.modelId, entry.seed),
        recipe: {
          source: source.id,
          prompt: entry.prompt,
          seed: entry.seed,
          modelId: entry.modelId,
          modelLabel: entry.modelLabel,
          settings: {
            ...result.settings,
            ...(entry.maskPng ? { maskPng: entry.maskPng } : {}),
            ...(entry.referenceName ? { referenceImage: `${entry.referenceName}.png` } : {}),
          },
          createdAt: new Date(finishedAt).toISOString(),
          seconds,
        },
      });
      entry.name = saved.name;
      entry.maskPng = null;
      entry.seconds = seconds;
      entry.status = "done";
    } catch (cause) {
      if (cause instanceof ImageCancelledError || entry.stopRequested) {
        entry.status = "cancelled";
        entry.error = "Stopped.";
      } else {
        entry.status = "error";
        entry.error = cause instanceof Error ? cause.message : "The image failed.";
      }
      entry.seconds = Math.round((this.now() - (entry.startedAt ?? this.now())) / 100) / 10;
    } finally {
      this.abort = null;
    }
  }
}
