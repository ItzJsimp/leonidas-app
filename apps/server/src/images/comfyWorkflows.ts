/**
 * ComfyUI API workflows for the curated image models.
 *
 * Each builder is a pure function. It returns the node graph that `POST /prompt` takes.
 * The node ids, file names and sampler settings come from workflows tested on a 12 GB card.
 * Do not change them without a new test run on real hardware.
 *
 * The last node is `PreviewImage`, not `SaveImage`. ComfyUI keeps a preview in its temp folder
 * and the app copies the image into the project, so ComfyUI's output folder does not fill up.
 */

export type ComfyNode = {
  readonly class_type: string;
  readonly inputs: Readonly<Record<string, unknown>>;
};
export type ComfyWorkflow = Readonly<Record<string, ComfyNode>>;

export interface WorkflowInput {
  readonly referenceImageName?: string;
  readonly prompt: string;
  readonly seed: number;
  readonly width: number;
  readonly height: number;
}

/** Sampler values saved in the Recipe sidecar of every image. */
export type WorkflowSettings = Readonly<Record<string, string | number>>;

export const IMAGE_SIZE = 1024;

export const COMFY_MODEL_IDS = [
  "flux2klein",
  "qwen",
  "qwen21",
  "zimage",
  "hidream",
  "birefnet",
  "upscale",
] as const;
export type ComfyModelId = (typeof COMFY_MODEL_IDS)[number];

export const isComfyModelId = (value: string): value is ComfyModelId =>
  (COMFY_MODEL_IDS as ReadonlyArray<string>).includes(value);

/** FLUX.2 klein 4B: 4 steps, fast. */
export function flux2kleinWorkflow({ prompt, seed, width, height }: WorkflowInput): ComfyWorkflow {
  return {
    "1": {
      class_type: "UNETLoader",
      inputs: { unet_name: "flux-2-klein-4b.safetensors", weight_dtype: "default" },
    },
    "2": {
      class_type: "CLIPLoader",
      inputs: { clip_name: "qwen_3_4b_fp4_flux2.safetensors", type: "flux2", device: "default" },
    },
    "3": { class_type: "VAELoader", inputs: { vae_name: "flux2-vae.safetensors" } },
    "5": { class_type: "CLIPTextEncode", inputs: { clip: ["2", 0], text: prompt } },
    "6": { class_type: "ConditioningZeroOut", inputs: { conditioning: ["5", 0] } },
    "7": {
      class_type: "EmptyFlux2LatentImage",
      inputs: { width, height, batch_size: 1 },
    },
    "8": {
      class_type: "CFGGuider",
      inputs: { model: ["1", 0], positive: ["5", 0], negative: ["6", 0], cfg: 1.0 },
    },
    "9": { class_type: "KSamplerSelect", inputs: { sampler_name: "euler" } },
    "10": { class_type: "Flux2Scheduler", inputs: { steps: 4, width, height } },
    "11": { class_type: "RandomNoise", inputs: { noise_seed: seed } },
    "12": {
      class_type: "SamplerCustomAdvanced",
      inputs: {
        noise: ["11", 0],
        guider: ["8", 0],
        sampler: ["9", 0],
        sigmas: ["10", 0],
        latent_image: ["7", 0],
      },
    },
    "13": { class_type: "VAEDecode", inputs: { samples: ["12", 0], vae: ["3", 0] } },
    "14": { class_type: "PreviewImage", inputs: { images: ["13", 0] } },
  };
}

/** Qwen-Image 2512, fp8: 30 steps, about 150 seconds. */
export function qwenWorkflow({ prompt, seed, width, height }: WorkflowInput): ComfyWorkflow {
  return {
    "1": {
      class_type: "UNETLoader",
      inputs: { unet_name: "qwen_image_2512_fp8_e4m3fn.safetensors", weight_dtype: "default" },
    },
    "2": {
      class_type: "CLIPLoader",
      inputs: {
        clip_name: "qwen_2.5_vl_7b_fp8_scaled.safetensors",
        type: "qwen_image",
        device: "default",
      },
    },
    "3": { class_type: "VAELoader", inputs: { vae_name: "qwen_image_vae.safetensors" } },
    "4": { class_type: "ModelSamplingAuraFlow", inputs: { model: ["1", 0], shift: 3.1 } },
    "5": { class_type: "CLIPTextEncode", inputs: { clip: ["2", 0], text: prompt } },
    "6": { class_type: "CLIPTextEncode", inputs: { clip: ["2", 0], text: " " } },
    "7": { class_type: "EmptySD3LatentImage", inputs: { width, height, batch_size: 1 } },
    "8": {
      class_type: "KSampler",
      inputs: {
        model: ["4", 0],
        positive: ["5", 0],
        negative: ["6", 0],
        latent_image: ["7", 0],
        seed,
        steps: 30,
        cfg: 4.0,
        sampler_name: "euler",
        scheduler: "simple",
        denoise: 1.0,
      },
    },
    "9": { class_type: "VAEDecode", inputs: { samples: ["8", 0], vae: ["3", 0] } },
    "10": { class_type: "PreviewImage", inputs: { images: ["9", 0] } },
  };
}

/** Qwen-Image 2.1, bf16: 25 steps. Non-commercial licence. */
export function qwen21Workflow({ prompt, seed, width, height }: WorkflowInput): ComfyWorkflow {
  return {
    "1": {
      class_type: "UNETLoader",
      inputs: { unet_name: "qwen_image_2.1_bf16.safetensors", weight_dtype: "default" },
    },
    "2": {
      class_type: "CLIPLoader",
      inputs: { clip_name: "qwen3vl_8b_bf16.safetensors", type: "qwen_image", device: "default" },
    },
    "3": { class_type: "VAELoader", inputs: { vae_name: "qwen_image_2.1_vae_bf16.safetensors" } },
    "4": {
      class_type: "QwenImage21Cache",
      inputs: { model: ["1", 0], device: "auto", dtype: "default" },
    },
    "5": {
      class_type: "TextEncodeQwenImage21",
      inputs: { clip: ["2", 0], prompt, negative_prompt: "", resolution: 1024 },
    },
    "7": { class_type: "EmptyLatentImage", inputs: { width, height, batch_size: 1 } },
    "8": {
      class_type: "KSampler",
      inputs: {
        model: ["4", 0],
        positive: ["5", 0],
        negative: ["5", 1],
        latent_image: ["7", 0],
        seed,
        steps: 25,
        cfg: 1.0,
        sampler_name: "euler",
        scheduler: "simple",
        denoise: 1.0,
      },
    },
    "9": { class_type: "VAEDecode", inputs: { samples: ["8", 0], vae: ["3", 0] } },
    "10": { class_type: "PreviewImage", inputs: { images: ["9", 0] } },
  };
}

/** Z-Image Turbo, bf16: 8 steps, cfg 1, empty negative prompt. */
export function zimageWorkflow({ prompt, seed, width, height }: WorkflowInput): ComfyWorkflow {
  return {
    "1": {
      class_type: "UNETLoader",
      inputs: { unet_name: "z_image_turbo_bf16.safetensors", weight_dtype: "default" },
    },
    "2": {
      class_type: "CLIPLoader",
      inputs: {
        clip_name: "qwen_3_4b_fp8_mixed.safetensors",
        type: "lumina2",
        device: "default",
      },
    },
    "3": { class_type: "VAELoader", inputs: { vae_name: "ae.safetensors" } },
    "4": { class_type: "ModelSamplingAuraFlow", inputs: { model: ["1", 0], shift: 3.0 } },
    "5": { class_type: "CLIPTextEncode", inputs: { clip: ["2", 0], text: prompt } },
    "6": { class_type: "ConditioningZeroOut", inputs: { conditioning: ["5", 0] } },
    "7": { class_type: "EmptySD3LatentImage", inputs: { width, height, batch_size: 1 } },
    "8": {
      class_type: "KSampler",
      inputs: {
        model: ["4", 0],
        positive: ["5", 0],
        negative: ["6", 0],
        latent_image: ["7", 0],
        seed,
        steps: 8,
        cfg: 1.0,
        sampler_name: "res_multistep",
        scheduler: "simple",
        denoise: 1.0,
      },
    },
    "9": { class_type: "VAEDecode", inputs: { samples: ["8", 0], vae: ["3", 0] } },
    "10": { class_type: "PreviewImage", inputs: { images: ["9", 0] } },
  };
}

export function hidreamWorkflow({ prompt, seed, width, height }: WorkflowInput): ComfyWorkflow {
  return {
    "1": {
      class_type: "CheckpointLoaderSimple",
      inputs: { ckpt_name: "hidream_o1_image_dev_fp8_scaled.safetensors" },
    },
    "2": { class_type: "ModelNoiseScale", inputs: { model: ["1", 0], noise_scale: 7.6 } },
    "3": { class_type: "CLIPTextEncode", inputs: { clip: ["1", 1], text: prompt } },
    "4": { class_type: "CLIPTextEncode", inputs: { clip: ["1", 1], text: "" } },
    "5": { class_type: "EmptyHiDreamO1LatentImage", inputs: { width, height, batch_size: 1 } },
    "6": { class_type: "SamplerLCM", inputs: { s_noise: 1, s_noise_end: 1, noise_clip_std: 2.5 } },
    "7": {
      class_type: "BasicScheduler",
      inputs: { model: ["2", 0], scheduler: "normal", steps: 28, denoise: 1 },
    },
    "8": {
      class_type: "SamplerCustom",
      inputs: {
        model: ["2", 0],
        add_noise: true,
        noise_seed: seed,
        cfg: 1,
        positive: ["3", 0],
        negative: ["4", 0],
        sampler: ["6", 0],
        sigmas: ["7", 0],
        latent_image: ["5", 0],
      },
    },
    "9": { class_type: "VAEDecode", inputs: { samples: ["8", 0], vae: ["1", 2] } },
    "10": { class_type: "PreviewImage", inputs: { images: ["9", 0] } },
  };
}

export function backgroundWorkflow({ referenceImageName }: WorkflowInput): ComfyWorkflow {
  if (!referenceImageName) throw new Error("Choose an image before removing its background.");
  return {
    "1": { class_type: "LoadImage", inputs: { image: referenceImageName } },
    "2": {
      class_type: "LoadBackgroundRemovalModel",
      inputs: { bg_removal_name: "birefnet.safetensors" },
    },
    "3": {
      class_type: "RemoveBackground",
      inputs: { image: ["1", 0], bg_removal_model: ["2", 0] },
    },
    "4": { class_type: "InvertMask", inputs: { mask: ["3", 0] } },
    "5": { class_type: "JoinImageWithAlpha", inputs: { image: ["1", 0], alpha: ["4", 0] } },
    "6": { class_type: "PreviewImage", inputs: { images: ["5", 0] } },
  };
}

export function upscaleWorkflow({ referenceImageName }: WorkflowInput): ComfyWorkflow {
  if (!referenceImageName) throw new Error("Choose an image before enlarging it.");
  return {
    "1": { class_type: "LoadImage", inputs: { image: referenceImageName } },
    "2": { class_type: "JoinImageWithAlpha", inputs: { image: ["1", 0], alpha: ["1", 1] } },
    "3": {
      class_type: "ImageScaleBy",
      inputs: { image: ["2", 0], upscale_method: "lanczos", scale_by: 2 },
    },
    "4": { class_type: "PreviewImage", inputs: { images: ["3", 0] } },
  };
}

export const COMFY_WORKFLOWS: Readonly<
  Record<ComfyModelId, (input: WorkflowInput) => ComfyWorkflow>
> = {
  flux2klein: flux2kleinWorkflow,
  qwen: qwenWorkflow,
  qwen21: qwen21Workflow,
  zimage: zimageWorkflow,
  hidream: hidreamWorkflow,
  birefnet: backgroundWorkflow,
  upscale: upscaleWorkflow,
};

/** What a Recipe records about the sampler. It matches the numbers in the builders above. */
export const COMFY_WORKFLOW_SETTINGS: Readonly<Record<ComfyModelId, WorkflowSettings>> = {
  hidream: {
    width: IMAGE_SIZE,
    height: IMAGE_SIZE,
    steps: 28,
    cfg: 1,
    sampler: "lcm",
    scheduler: "normal",
    noise_scale: 7.6,
  },
  birefnet: { width: IMAGE_SIZE, height: IMAGE_SIZE, operation: "remove-background" },
  upscale: { width: IMAGE_SIZE, height: IMAGE_SIZE, operation: "upscale-2x" },
  flux2klein: { width: IMAGE_SIZE, height: IMAGE_SIZE, steps: 4, cfg: 1.0, sampler: "euler" },
  qwen: {
    width: IMAGE_SIZE,
    height: IMAGE_SIZE,
    steps: 30,
    cfg: 4.0,
    sampler: "euler",
    scheduler: "simple",
    shift: 3.1,
  },
  qwen21: {
    width: IMAGE_SIZE,
    height: IMAGE_SIZE,
    steps: 25,
    cfg: 1.0,
    sampler: "euler",
    scheduler: "simple",
  },
  zimage: {
    width: IMAGE_SIZE,
    height: IMAGE_SIZE,
    steps: 8,
    cfg: 1.0,
    sampler: "res_multistep",
    scheduler: "simple",
    shift: 3.0,
  },
};
