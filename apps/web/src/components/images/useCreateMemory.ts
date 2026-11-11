import * as Schema from "effect/Schema";
import { useCallback } from "react";

import { useLocalStorage } from "~/hooks/useLocalStorage";

/** What the Create view remembers between visits. */
const CreateMemory = Schema.Struct({
  assetKind: Schema.optional(
    Schema.Literals(["icon", "game", "logo", "product", "poster", "anything"]),
  ),
  promptHelper: Schema.optional(Schema.Boolean),
  helperText: Schema.optional(Schema.String),
  view: Schema.Literals(["create", "models", "gallery"]),
  prompt: Schema.String,
  modelIds: Schema.Array(Schema.String),
  count: Schema.Number,
  seedMode: Schema.Literals(["random", "fixed"]),
  seed: Schema.String,
  seedLocked: Schema.Boolean,
  aspect: Schema.Literals(["square", "portrait", "landscape", "wide"]),
  size: Schema.Literals(["small", "medium", "large"]),
  /** Null means "use the default of each model". */
  steps: Schema.NullOr(Schema.Number),
  guidance: Schema.NullOr(Schema.Number),
  sampler: Schema.NullOr(Schema.String),
  negativePrompt: Schema.String,
});
export type CreateMemory = typeof CreateMemory.Type;
export type ImagesView = CreateMemory["view"];

const DEFAULT_CREATE: CreateMemory = {
  view: "create",
  prompt: "",
  modelIds: ["flux2klein"],
  count: 2,
  seedMode: "random",
  seed: "",
  seedLocked: false,
  aspect: "square",
  size: "medium",
  steps: null,
  guidance: null,
  sampler: null,
  negativePrompt: "",
};

export function useCreateMemory() {
  const [memory, write] = useLocalStorage(
    "leonidas:images:create:v2",
    DEFAULT_CREATE,
    CreateMemory,
  );
  const patch = useCallback(
    (change: Partial<CreateMemory>) => write((current) => ({ ...current, ...change })),
    [write],
  );
  return [memory, patch] as const;
}
