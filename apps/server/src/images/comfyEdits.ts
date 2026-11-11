import { flux2kleinWorkflow, type WorkflowInput, type ComfyWorkflow } from "./comfyWorkflows.ts";

/** Reference conditioning uses the same verified model files as image creation. */
export function flux2kleinEdit(
  input: WorkflowInput & { readonly image: string; readonly mask?: string },
): ComfyWorkflow {
  return {
    ...flux2kleinWorkflow(input),
    "4": { class_type: "LoadImage", inputs: { image: input.image } },
    "18": {
      class_type: "ImageScaleToTotalPixels",
      inputs: { image: ["4", 0], upscale_method: "lanczos", megapixels: 1, resolution_steps: 64 },
    },
    "15": { class_type: "VAEEncode", inputs: { pixels: ["18", 0], vae: ["3", 0] } },
    "16": { class_type: "ReferenceLatent", inputs: { conditioning: ["5", 0], latent: ["15", 0] } },
    "17": { class_type: "ReferenceLatent", inputs: { conditioning: ["6", 0], latent: ["15", 0] } },
    "8": {
      class_type: "CFGGuider",
      inputs: { model: ["1", 0], positive: ["16", 0], negative: ["17", 0], cfg: 1 },
    },
    ...(input.mask
      ? {
          "19": { class_type: "LoadImage", inputs: { image: input.mask } },
          "20": { class_type: "ImageToMask", inputs: { image: ["19", 0], channel: "red" } },
          "21": {
            class_type: "ImageCompositeMasked",
            inputs: {
              destination: ["4", 0],
              source: ["13", 0],
              x: 0,
              y: 0,
              resize_source: true,
              mask: ["20", 0],
            },
          },
          "22": { class_type: "InvertMask", inputs: { mask: ["20", 0] } },
          "23": {
            class_type: "MaskComposite",
            inputs: { destination: ["4", 1], source: ["22", 0], x: 0, y: 0, operation: "multiply" },
          },
          "24": {
            class_type: "JoinImageWithAlpha",
            inputs: { image: ["21", 0], alpha: ["23", 0] },
          },
          "14": { class_type: "PreviewImage", inputs: { images: ["24", 0] } },
        }
      : {}),
  };
}
