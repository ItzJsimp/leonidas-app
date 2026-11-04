import {
  type ModelSelection,
  type ProviderDriverKind,
  type ProviderInstanceId,
  type ProviderOptionSelection,
  type ScopedThreadRef,
  type ServerProviderModel,
} from "@t3tools/contracts";
import type { ReactNode } from "react";
import type { DraftId } from "../../composerDraftStore";
import { resolveComposerOptionSelections } from "../../composerProviderState";
import type { ComposerControlSize } from "./ComposerControl";
import { PickerReasoningColumn } from "./PickerReasoningColumn";
import { shouldRenderTraitsControls, TraitsMenuContent, TraitsPicker } from "./TraitsPicker";

type TraitsRenderInput = {
  provider: ProviderDriverKind;
  instanceId?: ProviderInstanceId;
  threadRef?: ScopedThreadRef;
  draftId?: DraftId;
  model: string;
  models: ReadonlyArray<ServerProviderModel>;
  modelOptions: ReadonlyArray<ProviderOptionSelection> | undefined;
  reportedModelSelection?: ModelSelection | null | undefined;
  prompt: string;
  onPromptChange: (prompt: string) => void;
  planModeEnabled: boolean;
  size?: ComposerControlSize;
  hidden?: boolean;
  triggerClassName?: string;
  isComposerOwned?: boolean;
};

function renderTraitsControl(
  Component: typeof TraitsMenuContent | typeof TraitsPicker | typeof PickerReasoningColumn,
  input: TraitsRenderInput,
): ReactNode {
  const {
    provider,
    instanceId,
    threadRef,
    draftId,
    model,
    models,
    modelOptions,
    reportedModelSelection,
    prompt,
    onPromptChange,
    planModeEnabled,
    size,
    hidden,
    triggerClassName,
    isComposerOwned,
  } = input;
  const hasTarget = threadRef !== undefined || draftId !== undefined;
  const { selections: resolvedModelOptions } = resolveComposerOptionSelections(
    models,
    model,
    provider,
    modelOptions,
    planModeEnabled,
  );
  if (
    !hasTarget ||
    !shouldRenderTraitsControls({
      provider,
      models,
      model,
      modelOptions: resolvedModelOptions,
      prompt,
      planModeEnabled,
    })
  ) {
    return null;
  }
  return (
    <Component
      provider={provider}
      {...(instanceId ? { instanceId } : {})}
      models={models}
      {...(threadRef ? { threadRef } : {})}
      {...(draftId ? { draftId } : {})}
      model={model}
      modelOptions={resolvedModelOptions}
      reportedModelSelection={reportedModelSelection}
      prompt={prompt}
      onPromptChange={onPromptChange}
      planModeEnabled={planModeEnabled}
      {...(size !== undefined ? { size } : {})}
      {...(hidden !== undefined ? { hidden } : {})}
      {...(triggerClassName !== undefined ? { triggerClassName } : {})}
      {...(isComposerOwned ? { isComposerOwned } : {})}
    />
  );
}

export function renderProviderTraitsMenuContent(input: TraitsRenderInput): ReactNode {
  return renderTraitsControl(TraitsMenuContent, input);
}

export function renderProviderReasoningColumn(input: TraitsRenderInput): ReactNode {
  return renderTraitsControl(PickerReasoningColumn, input);
}

export function renderProviderTraitsPicker(input: TraitsRenderInput): ReactNode {
  return renderTraitsControl(TraitsPicker, input);
}
