import type { ModelSelection, ServerProvider } from "@t3tools/contracts";
import {
  getModelSelectionBooleanOptionValue,
  getModelSelectionStringOptionValue,
  inferAntigravityEffortFromSlug,
} from "@t3tools/shared/model";

import { normalizeProviderAccentColor } from "../../providerInstances";
import { getDisplayModelName } from "./providerIconUtils";

export const EFFORT_OPTION_IDS = ["reasoningEffort", "effort", "reasoning", "variant"] as const;

export interface RunIdentity {
  readonly provider: ServerProvider | undefined;
  readonly modelLabel: string;
  /** Effort/reasoning level exactly as the picker labels it, when the run recorded one. */
  readonly effortLabel: string | undefined;
  readonly fastMode: boolean;
  /** The configured account (provider instance) name, for example "Jake". */
  readonly accountLabel: string | undefined;
  readonly accentColor: string | undefined;
}

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/**
 * What a run was executed with, resolved from the run's recorded selection and
 * the environment's provider snapshots. Falls back to the raw model slug and
 * option value when the instance or model has since been removed.
 */
export function resolveRunIdentity(
  run: {
    readonly providerInstanceId: string;
    readonly modelSelection: ModelSelection;
  },
  providers: ReadonlyArray<ServerProvider>,
): RunIdentity {
  const provider = providers.find((candidate) => candidate.instanceId === run.providerInstanceId);
  const slug = run.modelSelection.model;
  const model = provider?.models.find(
    (candidate) => candidate.slug === slug || candidate.aliases?.includes(slug),
  );
  const modelLabel = model ? getDisplayModelName(model, { preferShortName: true }) : slug;

  const effortId = EFFORT_OPTION_IDS.find(
    (id) => getModelSelectionStringOptionValue(run.modelSelection, id) !== undefined,
  );
  const effortValue =
    (effortId ? getModelSelectionStringOptionValue(run.modelSelection, effortId) : undefined) ??
    (provider?.driver === "antigravity" || slug.startsWith("gemini-")
      ? inferAntigravityEffortFromSlug(slug)
      : undefined);
  const descriptor = model?.capabilities?.optionDescriptors?.find(
    (candidate) => candidate.id === (effortId ?? "effort"),
  );
  const effortLabel =
    effortValue === undefined
      ? undefined
      : ((descriptor?.type === "select"
          ? descriptor.options.find((option) => option.id === effortValue)?.label
          : undefined) ?? titleCase(effortValue));

  return {
    provider,
    modelLabel,
    effortLabel,
    fastMode: getModelSelectionBooleanOptionValue(run.modelSelection, "fastMode") === true,
    accountLabel: provider?.displayName,
    accentColor: normalizeProviderAccentColor(provider?.accentColor),
  };
}
