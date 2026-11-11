import type { ImageItem } from "@t3tools/contracts";

/** Settings recorded with each generated picture. */
export interface GalleryItem extends ImageItem {
  readonly width: number;
  readonly height: number;
  readonly steps: number;
  readonly guidance: number;
  readonly sampler: string;
  readonly negativePrompt: string;
  readonly benchmark: boolean;
}

export const BENCHMARK_PROMPTS: ReadonlyArray<string> = [
  'a shop sign that says "OPEN 24 HOURS" in red neon',
  "close-up portrait of an old fisherman, soft window light",
  "two hands holding a cup of tea, top view",
  "a busy city street in the rain at night, wide shot",
  "a red fox in a snowy forest, children's book style",
  "a glass bottle with a tiny ship inside, product photo on white",
];
export const BENCHMARK_SEED = 1234;
export const ARENA_URL = "https://artificialanalysis.ai/text-to-image/arena";
export const COMFY_INSTALL_URL = "https://www.comfy.org/download";
export const COMFY_START_COMMAND = "python main.py --listen 127.0.0.1 --port 8188";
