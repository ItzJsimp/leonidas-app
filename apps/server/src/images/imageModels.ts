/**
 * The curated model list. Sizes add up the model, text encoder and VAE files.
 * Seconds come from runs on a 12 GB card.
 *
 * Licence rule: "yes" needs a verified licence. Until then use "check".
 * Qwen-Image 2.1 is non-commercial, so it is "no".
 */
import type { ImageModel } from "@t3tools/contracts";

import type { ComfyModelId } from "./comfyWorkflows.ts";

export const COMFY_MODELS: ReadonlyArray<ImageModel & { readonly id: ComfyModelId }> = [
  {
    id: "upscale",
    sourceId: "comfyui",
    label: "Upscale 2x",
    sizeLabel: "No download",
    typicalSeconds: 1,
    licence: "Built-in image resizing",
    commercialUse: "yes",
  },
  {
    id: "hidream",
    sourceId: "comfyui",
    label: "HiDream O1 Dev",
    sizeLabel: "8.1 GB",
    typicalSeconds: 30,
    licence: "Check the model licence before commercial use.",
    commercialUse: "check",
  },
  {
    id: "birefnet",
    sourceId: "comfyui",
    label: "Background removal",
    sizeLabel: "444 MB",
    typicalSeconds: 5,
    licence: "MIT",
    commercialUse: "yes",
  },
  {
    id: "flux2klein",
    sourceId: "comfyui",
    label: "FLUX.2 klein 4B",
    sizeLabel: "12 GB",
    typicalSeconds: 15,
    licence: "Licence not checked yet. Read it before you sell the images.",
    commercialUse: "check",
  },
  {
    id: "qwen",
    sourceId: "comfyui",
    label: "Qwen-Image 2512",
    sizeLabel: "30 GB",
    typicalSeconds: 150,
    licence: "Licence not checked yet. Read it before you sell the images.",
    commercialUse: "check",
  },
  {
    id: "qwen21",
    sourceId: "comfyui",
    label: "Qwen-Image 2.1",
    sizeLabel: "32 GB",
    typicalSeconds: 165,
    licence: "Non-commercial licence. Do not sell these images.",
    commercialUse: "no",
  },
  {
    id: "zimage",
    sourceId: "comfyui",
    label: "Z-Image Turbo",
    sizeLabel: "17 GB",
    typicalSeconds: 30,
    licence: "Licence not checked yet. Read it before you sell the images.",
    commercialUse: "check",
  },
];

export const comfyModelLabel = (modelId: string): string =>
  COMFY_MODELS.find((model) => model.id === modelId)?.label ?? modelId;
