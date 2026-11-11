import {
  type ModelCapabilities,
  type ProviderDriverKind,
  type ProviderOptionSelection,
  type ServerProviderModel,
} from "@t3tools/contracts";
import {
  buildExplicitProviderOptionSelectionsFromDescriptors,
  getProviderOptionCurrentValue,
  getProviderOptionDescriptors,
  isClaudeUltrathinkPrompt,
  normalizeModelSlug,
} from "@t3tools/shared/model";
import { getProviderModelCapabilities } from "./providerModels";
import { getTraitsSpeedDisplay } from "./components/chat/traitsSpeed.logic";

export type ComposerProviderStateInput = {
  provider: ProviderDriverKind;
  model: string;
  models: ReadonlyArray<ServerProviderModel>;
  promptInjectionState?: ComposerPromptInjectionState;
  modelOptions: ReadonlyArray<ProviderOptionSelection> | null | undefined;
  planModeEnabled: boolean;
};

export type ComposerPromptInjectionState = "none" | "ultrathink";

export type ComposerProviderState = {
  provider: ProviderDriverKind;
  promptEffort: string | null;
  modelOptionsForDispatch: ReadonlyArray<ProviderOptionSelection> | undefined;
  composerFrameClassName?: string;
  composerSurfaceClassName?: string;
  modelPickerIconClassName?: string;
  /** Set only while fast mode is on, so the model chip can show a bolt. */
  speedIcon?: "fast" | "ultrafast";
};

export function getComposerPromptInjectionState(prompt: string): ComposerPromptInjectionState {
  return isClaudeUltrathinkPrompt(prompt) ? "ultrathink" : "none";
}

/**
 * Cursor ACP can report `fastMode: true` as the provider default. T3 only
 * treats Fast as selected when the user chose it (draft/sticky/settings).
 * Otherwise inject an explicit `false` so new chats stay Normal and the
 * send path can overwrite a prior Fast session — descriptor defaults are
 * otherwise omitted by `buildExplicitProviderOptionSelectionsFromDescriptors`.
 */
export function withImplicitFastModeDefault(
  caps: ModelCapabilities,
  modelOptions: ReadonlyArray<ProviderOptionSelection> | null | undefined,
): ReadonlyArray<ProviderOptionSelection> | undefined {
  const hasExplicitFastMode = modelOptions?.some((selection) => selection.id === "fastMode");
  if (hasExplicitFastMode) {
    return modelOptions ?? undefined;
  }
  const hasFastModeDescriptor = caps.optionDescriptors?.some(
    (descriptor) => descriptor.type === "boolean" && descriptor.id === "fastMode",
  );
  if (!hasFastModeDescriptor) {
    return modelOptions ?? undefined;
  }
  return [...(modelOptions ?? []), { id: "fastMode", value: false }];
}

const EFFORT_DESCRIPTOR_IDS = new Set(["effort", "reasoningEffort", "reasoning"]);

/**
 * Starts a composer on the user's default reasoning effort when they have not picked one for
 * this model. A pick is explicit in `modelOptions` and always wins; a model that does not
 * offer the level keeps its own default.
 */
export function withDefaultReasoningEffort(
  caps: ModelCapabilities,
  modelOptions: ReadonlyArray<ProviderOptionSelection> | undefined,
  defaultEffort: string | null,
): ReadonlyArray<ProviderOptionSelection> | undefined {
  if (defaultEffort === null) return modelOptions;
  const descriptor = caps.optionDescriptors?.find(
    (candidate) => candidate.type === "select" && EFFORT_DESCRIPTOR_IDS.has(candidate.id),
  );
  if (
    !descriptor ||
    descriptor.type !== "select" ||
    modelOptions?.some((selection) => selection.id === descriptor.id) ||
    !descriptor.options.some((option) => option.id === defaultEffort)
  ) {
    return modelOptions;
  }
  return [...(modelOptions ?? []), { id: descriptor.id, value: defaultEffort }];
}

// hooks/useSettings registers this at load. Importing it from here would make the settings
// store, the environment catalog and the draft store a cycle, and the production bundle
// would then evaluate the catalog before the connection runtime exists.
let readDefaultReasoningEffort: () => string | null = () => null;

export function setDefaultReasoningEffortReader(reader: () => string | null): void {
  readDefaultReasoningEffort = reader;
}

export function resolveComposerOptionSelections(
  models: ReadonlyArray<ServerProviderModel>,
  model: string,
  provider: ProviderDriverKind,
  modelOptions: ReadonlyArray<ProviderOptionSelection> | null | undefined,
  planModeEnabled: boolean,
): {
  caps: ModelCapabilities;
  selections: ReadonlyArray<ProviderOptionSelection> | undefined;
} {
  const caps = getProviderModelCapabilities(models, model, provider, planModeEnabled);
  return {
    caps,
    selections: withDefaultReasoningEffort(
      caps,
      withImplicitFastModeDefault(caps, modelOptions),
      readDefaultReasoningEffort(),
    ),
  };
}

export function getComposerProviderState(input: ComposerProviderStateInput): ComposerProviderState {
  const {
    provider,
    model,
    models,
    modelOptions,
    promptInjectionState = "none",
    planModeEnabled,
  } = input;
  if (provider === "opencode") {
    const normalizedModel = normalizeModelSlug(model, provider);
    const modelIsInCatalog = models.some((candidate) => candidate.slug === normalizedModel);
    if (!modelIsInCatalog) {
      const preservedOptions = modelOptions?.filter(
        (option) => planModeEnabled || option.id !== "agent" || option.value !== "plan",
      );
      return {
        provider,
        promptEffort: null,
        modelOptionsForDispatch:
          preservedOptions && preservedOptions.length > 0 ? preservedOptions : undefined,
      };
    }
  }
  const { caps, selections } = resolveComposerOptionSelections(
    models,
    model,
    provider,
    modelOptions,
    planModeEnabled,
  );
  const descriptors = getProviderOptionDescriptors({ caps, selections });
  const primarySelectDescriptor = descriptors.find(
    (descriptor): descriptor is Extract<(typeof descriptors)[number], { type: "select" }> =>
      descriptor.type === "select",
  );
  const primaryValue = getProviderOptionCurrentValue(primarySelectDescriptor ?? null);
  const promptEffort = typeof primaryValue === "string" ? primaryValue : null;
  const ultrathinkActive =
    (primarySelectDescriptor?.promptInjectedValues?.length ?? 0) > 0 &&
    promptInjectionState === "ultrathink";

  const speedIcon = descriptors
    .map((descriptor) => getTraitsSpeedDisplay(provider, descriptor)?.speedIcon)
    .find((icon) => icon != null);

  return {
    provider,
    promptEffort,
    modelOptionsForDispatch: buildExplicitProviderOptionSelectionsFromDescriptors(
      descriptors,
      selections,
    ),
    ...(speedIcon ? { speedIcon } : {}),
    ...(ultrathinkActive
      ? {
          composerFrameClassName: "ultrathink-frame",
          composerSurfaceClassName: "shadow-[0_0_0_1px_rgba(255,255,255,0.07)_inset]",
          modelPickerIconClassName: "ultrathink-chroma",
        }
      : {}),
  };
}
