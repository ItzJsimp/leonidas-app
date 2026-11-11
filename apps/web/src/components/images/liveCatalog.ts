import type { ImageCatalogModel, ImageHardwareFit } from "@t3tools/contracts";
import { IMAGE_MODEL_ASSETS, modelDownloadBytes } from "@t3tools/shared/imageAssets";

import { computeFit } from "./catalog.logic";

const GB = 1024 ** 3;
const MODELS = [
  {
    id: "hidream",
    label: "HiDream O1 Dev",
    family: "HiDream",
    vram: 10,
    seconds: 30,
    steps: 28,
    source: "https://huggingface.co/HiDream-ai/HiDream-O1-Image-Dev",
  },
  {
    id: "qwen",
    label: "Qwen-Image 2512",
    family: "Qwen-Image",
    vram: 20,
    seconds: 50,
    steps: 30,
    source: "https://huggingface.co/Qwen/Qwen-Image-2512",
  },
  {
    id: "flux2klein",
    label: "FLUX.2 klein 4B",
    family: "FLUX.2",
    vram: 10,
    seconds: 15,
    steps: 4,
    source: "https://huggingface.co/black-forest-labs/FLUX.2-klein-4B",
  },
  {
    id: "zimage",
    label: "Z-Image Turbo",
    family: "Z-Image",
    vram: 12,
    seconds: 12,
    steps: 9,
    source: "https://huggingface.co/Tongyi-MAI/Z-Image-Turbo",
  },
] as const;

/** Model files come from the same pinned manifest that setup verifies. */
export function liveCatalog(hardware: ImageHardwareFit): ImageCatalogModel[] {
  return MODELS.map((model) => {
    const { fit, reason } = computeFit(model.vram * GB, hardware);
    return {
      id: model.id,
      label: model.label,
      family: model.family,
      sizeBytes: modelDownloadBytes(model.id),
      files: (IMAGE_MODEL_ASSETS[model.id] ?? []).map((asset) => ({
        name: asset.path,
        sizeBytes: asset.size,
      })),
      state: "not-installed",
      installProgress: null,
      vramBytes: model.vram * GB,
      fit,
      fitReason: reason,
      measuredSeconds: null,
      measuredRuns: 0,
      estimatedSeconds: model.seconds * (fit === "runs-well" ? 1 : 3),
      loadSeconds: 15,
      licenceName: "Check the model licence",
      licenceUrl: model.source,
      commercialUse: "check",
      licenceVerifiedOn: null,
      sourceUrl: model.source,
      candidate: false,
      tags: model.id === "qwen" ? ["Detailed", "Text in images"] : ["Fast", "General use"],
      speedTier: model.id === "qwen" ? "slow" : model.id === "hidream" ? "medium" : "fast",
      defaults: {
        steps: model.steps,
        guidance: model.id === "qwen" ? 4 : 1,
        sampler: model.id === "hidream" ? "lcm" : "euler",
        width: 1024,
        height: 1024,
      },
      ranges: {
        steps: { min: model.steps, max: model.steps, step: 1 },
        guidance: { min: model.id === "qwen" ? 4 : 1, max: model.id === "qwen" ? 4 : 1, step: 1 },
      },
      samplers: [model.id === "hidream" ? "lcm" : "euler"],
    };
  });
}
