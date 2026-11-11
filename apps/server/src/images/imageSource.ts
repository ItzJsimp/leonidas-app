/**
 * The Image Source interface. One source is one place that makes images.
 * Slice 1 has one adapter, ComfyUI. A hosted source can implement the same interface later.
 */
import type { ImageModel, ImageSourceId } from "@t3tools/contracts";

import type { WorkflowSettings } from "./comfyWorkflows.ts";

export interface GenerateRequest {
  readonly referenceImage?: Uint8Array;
  readonly maskImage?: Uint8Array;
  readonly modelId: string;
  readonly prompt: string;
  readonly seed: number;
  readonly width?: number;
  readonly height?: number;
}

export interface GenerateHooks {
  readonly onProgress?: (completed: number, total: number) => void;
  /** Aborting must stop the wait and make `generate` throw. */
  readonly signal?: AbortSignal;
}

export interface GeneratedImage {
  readonly bytes: Uint8Array;
  readonly mimeType: "image/png";
  /** Sampler values for the Recipe sidecar. */
  readonly settings: WorkflowSettings;
}

export interface SourceStatus {
  readonly online: boolean;
  /** True when ComfyUI did not answer in time. It may be busy loading a model. */
  readonly timedOut?: boolean;
  /** Plain words about the problem. Null when the source is fine. */
  readonly message: string | null;
}

export interface ImageSource {
  readonly id: ImageSourceId;
  readonly label: string;
  /** The address the source talks to, for the settings area. */
  readonly address: () => string;
  readonly listModels: () => Promise<ReadonlyArray<ImageModel>>;
  /** Makes one image. The queue calls it one at a time. */
  readonly generate: (request: GenerateRequest, hooks?: GenerateHooks) => Promise<GeneratedImage>;
  readonly status: () => Promise<SourceStatus>;
  /** Stops the image that runs now. */
  readonly interrupt: () => Promise<void>;
  /** Unloads models to free graphics memory. The queue calls it when the model changes. */
  readonly freeMemory?: () => Promise<void>;
}

/** Thrown by `generate` when the user stopped the image. */
export class ImageCancelledError extends Error {
  constructor() {
    super("Stopped.");
    this.name = "ImageCancelledError";
  }
}
