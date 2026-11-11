import type { ImageCatalogModel, ImageHardwareFit, ImageSourceStatus } from "@t3tools/contracts";
import { useCallback, useMemo } from "react";

import { useAssetUrls } from "~/assets/assetUrls";
import { toastManager } from "~/components/ui/toast";
import { useEnvironmentQuery } from "~/state/query";
import { serverEnvironment } from "~/state/server";

import { BENCHMARK_PROMPTS, BENCHMARK_SEED } from "./imageTypes";
import { liveCatalog } from "./liveCatalog";
import type { GalleryItem } from "./imageTypes";
import type { GenerateRequest, ImagesApi } from "./useImagesCatalog";
import { useImages } from "./useImages";

const SIZE = 1024;
/** Graphics that share memory with the PC are not a card to run models on. */
const SHARED_GPU = /intel|uhd|iris|radeon\(tm\) graphics/i;

/** Shown for the first moments, before the PC answers. */
const UNKNOWN_PC: ImageHardwareFit = {
  gpuName: "Checking your PC",
  vramBytes: 0,
  ramBytes: 0,
  freeDiskBytes: 0,
};

const CHECKING: ImageSourceStatus = {
  sourceId: "comfyui",
  label: "ComfyUI",
  baseUrl: "http://127.0.0.1:8188",
  online: false,
  busy: false,
  message: "Checking ComfyUI...",
};

/** Real data: pictures, queue and ComfyUI state from the server, and the real PC for the fit check. */
export function useImagesLive(): ImagesApi {
  const images = useImages();
  const { state, environmentId } = images;
  const setupState = state?.setup;
  const appleSilicon = setupState?.platform === "darwin" && setupState.architecture === "arm64";

  const live = useEnvironmentQuery(
    environmentId === null
      ? null
      : serverEnvironment.hardware({ environmentId, input: { live: true } }),
  );
  const sample = live.data?.sample ?? null;
  const hardware = useMemo((): ImageHardwareFit => {
    if (sample === null) return UNKNOWN_PC;
    const withMemory = sample.gpus.filter((entry) => entry.vramTotalBytes !== null);
    const dedicated = withMemory.filter((entry) => !SHARED_GPU.test(entry.name));
    const gpu = (dedicated.length > 0 ? dedicated : withMemory).toSorted(
      (a, b) => (b.vramTotalBytes ?? 0) - (a.vramTotalBytes ?? 0),
    )[0];
    const freeDisk = Math.max(
      0,
      ...sample.volumes.map((volume) => volume.totalBytes - volume.usedBytes),
    );
    return {
      ...(appleSilicon ? { unifiedMemory: true } : {}),
      gpuName: appleSilicon ? "Apple Silicon (Beta)" : (gpu?.name ?? "No dedicated graphics card"),
      vramBytes: Math.round(gpu?.vramTotalBytes ?? 0),
      ramBytes: Math.round(sample.memory.totalBytes),
      freeDiskBytes: Math.round(freeDisk),
    };
  }, [sample, appleSilicon]);

  const serverIds = useMemo(() => new Set(state?.setup?.installedModelIds ?? []), [state]);
  const baseCatalog = useMemo(() => liveCatalog(hardware), [hardware]);
  const defaultsById = useMemo(
    () => new Map(baseCatalog.map((model) => [model.id, model.defaults] as const)),
    [baseCatalog],
  );

  const items = useMemo(
    (): ReadonlyArray<GalleryItem> =>
      (state?.items ?? []).map((item) => {
        const defaults = defaultsById.get(item.modelId);
        return {
          ...item,
          width: item.width ?? SIZE,
          height: item.height ?? SIZE,
          steps: defaults?.steps ?? 0,
          guidance: defaults?.guidance ?? 0,
          sampler: defaults?.sampler ?? "euler",
          negativePrompt: "",
          benchmark: false,
        };
      }),
    [defaultsById, state],
  );

  // Time on this PC comes from the pictures already made here.
  const catalog = useMemo(
    (): ReadonlyArray<ImageCatalogModel> =>
      baseCatalog.map((model) => {
        const times = items
          .filter((item) => item.modelId === model.id && item.status === "done")
          .flatMap((item) => (item.seconds !== null && item.seconds > 0 ? [item.seconds] : []));
        const average =
          times.length === 0 ? null : times.reduce((sum, value) => sum + value, 0) / times.length;
        return {
          ...model,
          state:
            setupState?.modelId === model.id &&
            (setupState.phase === "downloading" || setupState.phase === "extracting")
              ? "installing"
              : serverIds.has(model.id)
                ? "ready"
                : "not-installed",
          installProgress:
            setupState?.modelId === model.id && setupState.total > 0
              ? Math.min(1, setupState.received / setupState.total)
              : null,
          measuredSeconds: average === null ? null : Math.round(average),
          measuredRuns: times.length,
        };
      }),
    [baseCatalog, items, serverIds, setupState],
  );

  const doneItems = useMemo(
    () => (state ? items.filter((item) => item.status === "done" && item.file !== null) : []),
    [items, state],
  );
  const resources = useMemo(
    () =>
      doneItems.map((item) => ({
        _tag: "draft-workspace-file" as const,
        cwd: state?.workspaceRoot ?? "",
        path: item.file ?? "",
      })),
    [doneItems, state],
  );
  const urls = useAssetUrls(environmentId ?? ("" as never), resources);
  const urlById = useMemo(
    () => new Map(doneItems.map((item, index) => [item.id, urls[index] ?? null] as const)),
    [doneItems, urls],
  );
  const imageUrl = useCallback((item: GalleryItem) => urlById.get(item.id) ?? null, [urlById]);

  const { start, setup } = images;
  const generate = useCallback(
    (request: GenerateRequest) =>
      start({
        prompt: request.prompt,
        modelIds: request.modelIds,
        seed: request.seed,
        count: request.count,
        width: request.width,
        height: request.height,
        ...(request.referenceItemId === undefined
          ? {}
          : { referenceItemId: request.referenceItemId }),
        ...(request.maskPng === undefined ? {} : { maskPng: request.maskPng }),
      }),
    [start],
  );
  const runBenchmark = useCallback(
    async (modelIds: ReadonlyArray<string>) => {
      for (const prompt of BENCHMARK_PROMPTS) {
        const started = await start({ prompt, modelIds, seed: BENCHMARK_SEED, count: 1 });
        if (!started) return;
      }
    },
    [start],
  );

  const install = useCallback(
    (model: ImageCatalogModel) => {
      const folder = state?.setup?.folder;
      if (
        !folder ||
        (model.id !== "flux2klein" &&
          model.id !== "zimage" &&
          model.id !== "qwen" &&
          model.id !== "hidream")
      ) {
        toastManager.add({ type: "info", title: "Choose a folder in Create to set up Images." });
        return;
      }
      void setup({ folder, modelId: model.id });
    },
    [setup, state?.setup?.folder],
  );

  // Server time minus this device's time, so elapsed seconds are right on a remote device.
  const clockSkew = useMemo(() => (state ? state.now - Date.now() : 0), [state]);

  const { setBaseUrl, patchMemory } = images;
  const source = state?.source ?? CHECKING;
  const recheck = useCallback(() => setBaseUrl(source.baseUrl), [setBaseUrl, source.baseUrl]);
  const setProjectId = useCallback((id: string) => patchMemory({ projectId: id }), [patchMemory]);

  return {
    retentionEnabled: state?.retentionEnabled ?? false,
    setRetention: images.setRetention,
    storageVolumes:
      sample?.volumes.map((volume) => ({
        mount: volume.mount,
        freeBytes: Math.max(0, volume.totalBytes - volume.usedBytes),
      })) ?? [],
    setupState: state?.setup,
    setup: images.setup,
    importReference: images.importReference,
    improvePrompt: images.improvePrompt,
    mode: "live",
    ready: state !== null,
    clockSkew,
    projects: images.projects.map((project) => ({ id: project.id, title: project.title })),
    projectId: images.projectId,
    setProjectId,
    // Model sampling settings stay fixed. The form can change image dimensions.
    canAdjust: false,
    hardware,
    catalog,
    source,
    checking: false,
    items,
    imageUrl,
    generate,
    runBenchmark,
    cancel: images.cancel,
    keep: images.keep,
    retry: images.retry,
    remove: images.remove,
    install,
    recheck,
    setBaseUrl,
  };
}
