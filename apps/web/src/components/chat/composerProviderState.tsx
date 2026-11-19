import {
  type ModelSelection,
  type ProviderDriverKind,
  type ProviderInstanceId,
  type ProviderOptionSelection,
  type ScopedThreadRef,
  type ServerProviderModel,
} from "@t3tools/contracts";
import type { ComponentType, ReactNode } from "react";
import type { DraftId } from "../../composerDraftStore";
import { resolveComposerOptionSelections } from "../../composerProviderState";
import type { ComposerControlSize } from "./ComposerControl";
import { DownshiftNotice, type DownshiftExtras } from "./DownshiftNotice";
import { PickerReasoningColumn } from "./PickerReasoningColumn";
import {
  shouldRenderTraitsControls,
  type TraitsMenuContentProps,
  type TraitsPersistence,
} from "./TraitsPicker";

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

function renderTraitsControl<Extra extends object>(
  Component: ComponentType<TraitsMenuContentProps & TraitsPersistence & Extra>,
  input: TraitsRenderInput,
  extra: Extra,
  mountWithoutControls = false,
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
    (!mountWithoutControls &&
      !shouldRenderTraitsControls({
        provider,
        models,
        model,
        modelOptions: resolvedModelOptions,
        prompt,
        planModeEnabled,
      }))
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
      {...extra}
    />
  );
}

export function renderProviderReasoningColumn(input: TraitsRenderInput): ReactNode {
  return renderTraitsControl(PickerReasoningColumn, input, {});
}

/**
 * Stays mounted when the model has no controls, so a switch to a plain model keeps its way back.
 * A component and not a render call, so the composer passes its prompt handler as a prop.
 */
export function ProviderDownshiftNotice(props: {
  input: TraitsRenderInput;
  extras: DownshiftExtras;
}): ReactNode {
  return renderTraitsControl(DownshiftNotice, props.input, props.extras, true);
}
