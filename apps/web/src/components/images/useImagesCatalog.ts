import type {
  ImageCatalogModel,
  ImageHardwareFit,
  ImageSourceStatus,
  ImagesSetupState,
  ImagesSetupInput,
} from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useLocalStorage } from "~/hooks/useLocalStorage";

import { clampToRange, secondsPerImage } from "./catalog.logic";
import {
  BENCHMARK_PROMPTS,
  BENCHMARK_SEED,
  HARDWARE_PROFILES,
  buildCatalog,
  catalogSpecs,
  mockImageUrl,
  sampleGallery,
  type GalleryItem,
  type GpuProfileId,
  type InstallOverride,
} from "./images.mock";

/*
 * The one data seam of the Images page. Today it is a mock that runs in the browser.
 * The real server replaces the body of this hook; the return shape stays the same.
 */

/** Test data switches. Only the dev build shows the menu that changes them. */
const PreviewSettings = Schema.Struct({
  /** True shows made-up pictures and a made-up PC. False reads the real server. */
  sample: Schema.Boolean,
  gpu: Schema.Literals(["6", "12", "24"]),
  online: Schema.Boolean,
  bigCatalog: Schema.Boolean,
  emptyGallery: Schema.Boolean,
});
export type PreviewSettings = typeof PreviewSettings.Type;

const DEFAULT_PREVIEW: PreviewSettings = {
  sample: false,
  gpu: "12",
  online: true,
  bigCatalog: false,
  emptyGallery: false,
};

export interface GenerateRequest {
  readonly maskPng?: string;
  readonly referenceItemId?: string;
  readonly prompt: string;
  readonly modelIds: ReadonlyArray<string>;
  readonly count: number;
  readonly seed: number;
  readonly width: number;
  readonly height: number;
  /** Null means "use the default of each model". */
  readonly steps: number | null;
  readonly guidance: number | null;
  readonly sampler: string | null;
  readonly negativePrompt: string;
}

/** Mock run time: real seconds shrink so a test run finishes in a few seconds. */
const mockDurationMs = (seconds: number) => Math.min(2500, Math.max(500, seconds * 12));

/** What the Images page needs from a data source. The sample hook and the live hook both give it. */
export interface ImagesApi {
  readonly retentionEnabled?: boolean;
  readonly setRetention?: (enabled: boolean) => Promise<boolean>;
  readonly importReference?: (file: File, signal?: AbortSignal) => Promise<string | null>;
  readonly improvePrompt?: (prompt: string) => Promise<string>;
  readonly storageVolumes?: readonly { readonly mount: string; readonly freeBytes: number }[];
  readonly setupState?: ImagesSetupState | undefined;
  readonly setup?: (input: ImagesSetupInput) => Promise<boolean>;
  readonly mode: "sample" | "live";
  /** False until the first answer from the server. */
  readonly ready: boolean;
  /** Server clock minus this device's clock, in ms. */
  readonly clockSkew: number;
  readonly projects: ReadonlyArray<{ readonly id: string; readonly title: string }>;
  readonly projectId: string | null;
  readonly setProjectId: (id: string) => void;
  /** True when size, steps, guidance and the negative prompt change the picture. */
  readonly canAdjust: boolean;
  readonly hardware: ImageHardwareFit;
  readonly catalog: ReadonlyArray<ImageCatalogModel>;
  readonly source: ImageSourceStatus;
  readonly checking: boolean;
  readonly items: ReadonlyArray<GalleryItem>;
  readonly imageUrl: (item: GalleryItem) => string | null;
  readonly generate: (request: GenerateRequest) => unknown;
  readonly runBenchmark: (modelIds: ReadonlyArray<string>) => unknown;
  readonly cancel: (stopRunning: boolean, jobId?: string) => unknown;
  readonly keep: (item: GalleryItem, kept: boolean) => unknown;
  readonly retry: (item: GalleryItem) => unknown;
  /** Null when the server cannot delete a picture yet. */
  readonly remove: ((item: GalleryItem) => unknown) | null;
  readonly install: (model: ImageCatalogModel) => void;
  readonly recheck: () => Promise<boolean>;
  readonly setBaseUrl: (value: string) => Promise<boolean>;
}

let jobCounter = 0;

/**
 * The mock queue step: when nothing runs, the first waiting image of the oldest run starts.
 * One image runs at a time, like ComfyUI.
 */
function startNext(items: ReadonlyArray<GalleryItem>, now: number): GalleryItem[] {
  if (items.some((item) => item.status === "running")) return [...items];
  let next: GalleryItem | null = null;
  for (const item of items) {
    if (item.status === "waiting" && (next === null || item.createdAt < next.createdAt))
      next = item;
  }
  return items.map((item) =>
    item === next ? { ...item, status: "running", startedAt: now } : item,
  );
}

export function useImagesCatalog() {
  const [preview, writePreview] = useLocalStorage(
    "leonidas:images:preview",
    DEFAULT_PREVIEW,
    PreviewSettings,
  );
  const [overrides, setOverrides] = useState<ReadonlyMap<string, InstallOverride>>(new Map());
  const [items, setItems] = useState<ReadonlyArray<GalleryItem>>(() =>
    preview.emptyGallery ? [] : sampleGallery(Date.now()),
  );
  const [baseUrl, setBaseUrlState] = useState("http://127.0.0.1:8188");
  const [checking, setChecking] = useState(false);

  const hardware: ImageHardwareFit = HARDWARE_PROFILES[preview.gpu as GpuProfileId];
  const catalog = useMemo(
    () => buildCatalog(catalogSpecs(preview.bigCatalog), preview.gpu as GpuProfileId, overrides),
    [overrides, preview.bigCatalog, preview.gpu],
  );
  const catalogRef = useRef(catalog);
  useEffect(() => {
    catalogRef.current = catalog;
  }, [catalog]);

  const source: ImageSourceStatus = {
    sourceId: "comfyui",
    label: "ComfyUI",
    baseUrl,
    online: preview.online,
    busy: false,
    message: preview.online ? null : `ComfyUI does not answer at ${baseUrl}.`,
  };

  const patchPreview = useCallback(
    (patch: Partial<PreviewSettings>) => {
      writePreview((current) => ({ ...current, ...patch }));
      if (patch.emptyGallery !== undefined) {
        setItems(patch.emptyGallery ? [] : sampleGallery(Date.now()));
      }
    },
    [writePreview],
  );

  // The mock engine finishes the running image after a short delay, then starts the next.
  const running = items.find((item) => item.status === "running") ?? null;
  useEffect(() => {
    if (!running) return;
    const model = catalogRef.current.find((entry) => entry.id === running.modelId);
    const seconds = model ? secondsPerImage(model).seconds : 20;
    const timer = window.setTimeout(() => {
      const fails = !model || model.state !== "ready" || model.fit === "too-big";
      setItems((current) =>
        startNext(
          current.map((item) =>
            item.id !== running.id
              ? item
              : fails
                ? {
                    ...item,
                    status: "error",
                    error:
                      model?.fit === "too-big"
                        ? "The model is too big for your graphics card."
                        : "The model files are not in ComfyUI. Install the model first.",
                  }
                : {
                    ...item,
                    status: "done",
                    seconds: Math.round(seconds * (0.9 + (item.seed % 20) / 100)),
                    file: `images/${item.jobId}_${item.modelId}_${String(item.seed)}.png`,
                  },
          ),
          Date.now(),
        ),
      );
    }, mockDurationMs(seconds));
    return () => window.clearTimeout(timer);
  }, [running]);

  const generate = useCallback((request: GenerateRequest, benchmark = false) => {
    jobCounter += 1;
    const jobId = `job-${String(Date.now())}-${String(jobCounter)}`;
    const now = Date.now();
    const fresh: GalleryItem[] = [];
    for (const modelId of request.modelIds) {
      const model = catalogRef.current.find((entry) => entry.id === modelId);
      if (!model) continue;
      for (let index = 0; index < request.count; index += 1) {
        const seed = request.seed + index;
        fresh.push({
          id: `${jobId}-${modelId}-${String(index)}`,
          jobId,
          prompt: request.prompt,
          modelId,
          modelLabel: model.label,
          seed,
          status: "waiting",
          createdAt: now,
          startedAt: null,
          seconds: null,
          file: null,
          kept: false,
          error: null,
          width: request.width,
          height: request.height,
          steps:
            request.steps === null
              ? model.defaults.steps
              : clampToRange(request.steps, model.ranges.steps),
          guidance:
            request.guidance === null
              ? model.defaults.guidance
              : clampToRange(request.guidance, model.ranges.guidance),
          sampler: request.sampler ?? model.defaults.sampler,
          negativePrompt: request.negativePrompt,
          benchmark,
        });
      }
    }
    // Newest run first. Inside a run the items keep the model order.
    setItems((current) => startNext([...fresh, ...current], now));
    return jobId;
  }, []);

  const runBenchmark = useCallback(
    (modelIds: ReadonlyArray<string>) => {
      for (const prompt of BENCHMARK_PROMPTS) {
        generate(
          {
            prompt,
            modelIds,
            count: 1,
            seed: BENCHMARK_SEED,
            width: 1024,
            height: 1024,
            steps: null,
            guidance: null,
            sampler: null,
            negativePrompt: "",
          },
          true,
        );
      }
    },
    [generate],
  );

  const cancel = useCallback((stopRunning: boolean) => {
    setItems((current) =>
      current.map((item) =>
        item.status === "waiting" || (stopRunning && item.status === "running")
          ? { ...item, status: "cancelled" }
          : item,
      ),
    );
  }, []);

  const keep = useCallback((item: GalleryItem, kept: boolean) => {
    setItems((current) =>
      current.map((entry) => (entry.id === item.id ? { ...entry, kept } : entry)),
    );
  }, []);

  const retry = useCallback((item: GalleryItem) => {
    setItems((current) =>
      startNext(
        current.map((entry) =>
          entry.id === item.id
            ? { ...entry, status: "waiting", error: null, startedAt: null }
            : entry,
        ),
        Date.now(),
      ),
    );
  }, []);

  const remove = useCallback((item: GalleryItem) => {
    setItems((current) => current.filter((entry) => entry.id !== item.id));
  }, []);

  const install = useCallback((model: ImageCatalogModel) => {
    let progress = 0;
    const step = () => {
      progress = Math.min(1, progress + 0.2);
      setOverrides((current) => {
        const next = new Map(current);
        next.set(
          model.id,
          progress >= 1 ? { state: "ready", progress: null } : { state: "installing", progress },
        );
        return next;
      });
      if (progress < 1) window.setTimeout(step, 600);
    };
    step();
  }, []);

  const recheck = useCallback(async () => {
    setChecking(true);
    await new Promise((resolve) => window.setTimeout(resolve, 700));
    setChecking(false);
    return preview.online;
  }, [preview.online]);

  const setBaseUrl = useCallback(async (value: string) => {
    setBaseUrlState(value);
    return true;
  }, []);

  const imageUrl = useCallback(
    (item: GalleryItem) => (item.status === "done" ? mockImageUrl(item) : null),
    [],
  );

  return {
    mode: "sample" as const,
    ready: true,
    clockSkew: 0,
    projects: [] as ImagesApi["projects"],
    projectId: null as string | null,
    setProjectId: (_id: string) => undefined,
    canAdjust: true,
    preview,
    patchPreview,
    hardware,
    catalog,
    source,
    checking,
    items,
    imageUrl,
    generate,
    runBenchmark,
    cancel,
    keep,
    retry,
    remove,
    install,
    recheck,
    setBaseUrl,
  };
}

export type ImagesSampleApi = ReturnType<typeof useImagesCatalog>;
