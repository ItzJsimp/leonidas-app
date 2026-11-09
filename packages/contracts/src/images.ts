import * as Schema from "effect/Schema";

import { NonNegativeInt, PositiveInt, ProjectId, TrimmedNonEmptyString } from "./baseSchemas.ts";

/** Most images one Generate press may queue per model. */
export const IMAGES_MAX_VARIATIONS = 12;
const IMAGES_PROMPT_MAX_LENGTH = 4000;

/** Where an image engine lives. Slice 1 has one source: a ComfyUI server the user runs. */
export const ImageSourceId = Schema.Literals(["comfyui"]);
export type ImageSourceId = typeof ImageSourceId.Type;

/** "check" means the licence is not verified yet. The panel never claims "yes" for it. */
export const ImageCommercialUse = Schema.Literals(["yes", "no", "check"]);
export type ImageCommercialUse = typeof ImageCommercialUse.Type;

export const ImageModel = Schema.Struct({
  id: TrimmedNonEmptyString,
  sourceId: ImageSourceId,
  label: Schema.String,
  /** Disk size of the model files, in words, for example "7.8 GB". */
  sizeLabel: Schema.String,
  /** Typical time for one 1024 px image on a 12 GB card. */
  typicalSeconds: NonNegativeInt,
  licence: Schema.String,
  commercialUse: ImageCommercialUse,
});
export type ImageModel = typeof ImageModel.Type;

export const ImageItemStatus = Schema.Literals([
  "waiting",
  "running",
  "done",
  "error",
  "cancelled",
]);
export type ImageItemStatus = typeof ImageItemStatus.Type;

/** One image in the queue or the grid. */
export const ImageItem = Schema.Struct({
  id: TrimmedNonEmptyString,
  jobId: TrimmedNonEmptyString,
  prompt: Schema.String,
  modelId: Schema.String,
  modelLabel: Schema.String,
  seed: NonNegativeInt,
  status: ImageItemStatus,
  createdAt: NonNegativeInt,
  /** Set while the image runs. The panel counts the elapsed seconds from it. */
  startedAt: Schema.NullOr(NonNegativeInt),
  seconds: Schema.NullOr(Schema.Number),
  /** Path of the PNG, relative to the project folder. Null until the image is done. */
  file: Schema.NullOr(Schema.String),
  kept: Schema.Boolean,
  error: Schema.NullOr(Schema.String),
});
export type ImageItem = typeof ImageItem.Type;

export const ImageSourceStatus = Schema.Struct({
  sourceId: ImageSourceId,
  label: Schema.String,
  baseUrl: Schema.String,
  online: Schema.Boolean,
  /** True when ComfyUI did not answer in time while our own image runs. It is busy, not gone. */
  busy: Schema.Boolean,
  /** Plain words about the problem when the source is offline. */
  message: Schema.NullOr(Schema.String),
});
export type ImageSourceStatus = typeof ImageSourceStatus.Type;

/** The status message before the first connection check answers. */
export const IMAGE_SOURCE_CHECKING = "Checking...";

export const ImagesSetupState = Schema.Struct({
  phase: Schema.Literals([
    "not-installed",
    "downloading",
    "extracting",
    "ready",
    "error",
    "cancelled",
  ]),
  received: NonNegativeInt,
  total: NonNegativeInt,
  engineBytes: Schema.optional(NonNegativeInt),
  folder: Schema.String,
  error: Schema.NullOr(Schema.String),
  installedModelIds: Schema.optional(Schema.Array(Schema.String)),
});
export type ImagesSetupState = typeof ImagesSetupState.Type;

export const ImagesSetupInput = Schema.Struct({
  folder: TrimmedNonEmptyString.check(Schema.isMaxLength(1000)),
  modelId: Schema.optional(Schema.Literals(["flux2klein", "zimage"])),
  existingFolders: Schema.optional(
    Schema.Array(TrimmedNonEmptyString).check(Schema.isMaxLength(8)),
  ),
});
export type ImagesSetupInput = typeof ImagesSetupInput.Type;

export const ImagesState = Schema.Struct({
  setup: Schema.optional(ImagesSetupState),
  source: ImageSourceStatus,
  models: Schema.Array(ImageModel),
  /** Newest first. */
  items: Schema.Array(ImageItem),
  /** Server clock when this state was made. The panel uses it to count elapsed seconds on any clock. */
  now: NonNegativeInt,
  /** Absolute project folder. The panel builds image addresses from it. */
  workspaceRoot: Schema.String,
  /** Folder for new images, relative to the project folder. */
  imagesFolder: Schema.String,
});
export type ImagesState = typeof ImagesState.Type;

export const ImagesSubscribeInput = Schema.Struct({ projectId: ProjectId });
export type ImagesSubscribeInput = typeof ImagesSubscribeInput.Type;

export const ImagesGenerateInput = Schema.Struct({
  projectId: ProjectId,
  prompt: TrimmedNonEmptyString.check(Schema.isMaxLength(IMAGES_PROMPT_MAX_LENGTH)),
  modelIds: Schema.Array(TrimmedNonEmptyString).check(Schema.isMinLength(1), Schema.isMaxLength(8)),
  /** First seed. Seed i is seed + i. Null or missing picks a random seed. */
  seed: Schema.optional(Schema.NullOr(NonNegativeInt)),
  count: PositiveInt.check(Schema.isLessThanOrEqualTo(IMAGES_MAX_VARIATIONS)),
});
export type ImagesGenerateInput = typeof ImagesGenerateInput.Type;

export const ImagesGenerateResult = Schema.Struct({
  jobId: Schema.String,
  queued: NonNegativeInt,
});
export type ImagesGenerateResult = typeof ImagesGenerateResult.Type;

export const ImagesCancelInput = Schema.Struct({
  /** True also stops the image that runs now. */
  stopRunning: Schema.Boolean,
});
export type ImagesCancelInput = typeof ImagesCancelInput.Type;

export const ImagesKeepInput = Schema.Struct({
  projectId: ProjectId,
  itemId: TrimmedNonEmptyString,
  kept: Schema.Boolean,
});
export type ImagesKeepInput = typeof ImagesKeepInput.Type;

export const ImagesRetryInput = Schema.Struct({
  projectId: ProjectId,
  itemId: TrimmedNonEmptyString,
});
export type ImagesRetryInput = typeof ImagesRetryInput.Type;

export const ImagesSetBaseUrlInput = Schema.Struct({
  baseUrl: TrimmedNonEmptyString.check(Schema.isMaxLength(300)),
});
export type ImagesSetBaseUrlInput = typeof ImagesSetBaseUrlInput.Type;

/*
 * Proposed catalog contract (front end only for now). The web Images page reads these
 * shapes from a mock. The server does not send them yet: see project/images-backend-asks.md.
 */

export const ImageModelInstallState = Schema.Literals([
  "not-installed",
  "installing",
  "ready",
  "broken",
]);
export type ImageModelInstallState = typeof ImageModelInstallState.Type;

/** How a model fits this PC. "runs-slow" means part of the model moves to normal memory. */
export const ImageModelFit = Schema.Literals(["runs-well", "runs-slow", "too-big"]);
export type ImageModelFit = typeof ImageModelFit.Type;

export const ImageNumberRange = Schema.Struct({
  min: Schema.Number,
  max: Schema.Number,
  step: Schema.Number,
});
export type ImageNumberRange = typeof ImageNumberRange.Type;

export const ImageModelDefaults = Schema.Struct({
  steps: PositiveInt,
  guidance: Schema.Number,
  sampler: Schema.String,
  width: PositiveInt,
  height: PositiveInt,
});
export type ImageModelDefaults = typeof ImageModelDefaults.Type;

export const ImageModelFile = Schema.Struct({
  name: Schema.String,
  sizeBytes: NonNegativeInt,
});
export type ImageModelFile = typeof ImageModelFile.Type;

export const ImageCatalogModel = Schema.Struct({
  id: TrimmedNonEmptyString,
  label: Schema.String,
  family: Schema.String,
  sizeBytes: NonNegativeInt,
  files: Schema.Array(ImageModelFile),
  state: ImageModelInstallState,
  /** 0 to 1 while the state is "installing". */
  installProgress: Schema.NullOr(Schema.Number),
  /** Graphics memory the model needs to run fully on the card, in bytes. */
  vramBytes: NonNegativeInt,
  fit: ImageModelFit,
  /** Plain words, for example "Needs about 13 GB. Your card has 12 GB." */
  fitReason: Schema.String,
  /** Average seconds per image from Recipe files on this PC. Null when no image ran yet. */
  measuredSeconds: Schema.NullOr(Schema.Number),
  measuredRuns: NonNegativeInt,
  /** Guess for this PC when no measured value exists. */
  estimatedSeconds: Schema.Number,
  /** Time to load the model before the first image. */
  loadSeconds: Schema.Number,
  licenceName: Schema.String,
  licenceUrl: Schema.NullOr(Schema.String),
  commercialUse: ImageCommercialUse,
  /** Date a person checked the licence on the official model card. Null means not verified. */
  licenceVerifiedOn: Schema.NullOr(Schema.String),
  sourceUrl: Schema.NullOr(Schema.String),
  /** True for models we did not test in Leonidas yet. */
  candidate: Schema.Boolean,
  tags: Schema.Array(Schema.String),
  speedTier: Schema.Literals(["fast", "medium", "slow"]),
  defaults: ImageModelDefaults,
  ranges: Schema.Struct({ steps: ImageNumberRange, guidance: ImageNumberRange }),
  samplers: Schema.Array(Schema.String),
});
export type ImageCatalogModel = typeof ImageCatalogModel.Type;

/** The PC facts that decide fit. Same source as hardwareWatch/localModelCapacity.ts. */
export const ImageHardwareFit = Schema.Struct({
  gpuName: Schema.String,
  vramBytes: NonNegativeInt,
  ramBytes: NonNegativeInt,
  freeDiskBytes: NonNegativeInt,
});
export type ImageHardwareFit = typeof ImageHardwareFit.Type;

/** Settings the new Create view sends. All optional: the model default applies. */
export const ImageGenerateSettings = Schema.Struct({
  width: Schema.optional(PositiveInt),
  height: Schema.optional(PositiveInt),
  steps: Schema.optional(PositiveInt),
  guidance: Schema.optional(Schema.Number),
  negativePrompt: Schema.optional(Schema.String),
  sampler: Schema.optional(Schema.String),
});
export type ImageGenerateSettings = typeof ImageGenerateSettings.Type;

export class ImagesError extends Schema.TaggedError<ImagesError>()("ImagesError", {
  reason: Schema.Literals(["project_not_found", "invalid_input", "not_found", "storage"]),
  detail: Schema.optional(Schema.String),
}) {
  override get message(): string {
    return `Images failed (${this.reason})${this.detail ? `: ${this.detail}` : ""}.`;
  }
}
