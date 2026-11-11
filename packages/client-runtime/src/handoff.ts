import type {
  ModelSelection,
  OrchestrationV2ModelSwitch,
  OrchestrationV2Run,
  OrchestrationV2ThreadProjection,
  OrchestrationV2TurnItem,
  ProviderInstanceId,
  ServerProvider,
  ServerProviderModel,
} from "@t3tools/contracts";
import { getModelSelectionStringOptionValue } from "@t3tools/shared/model";

export type HandoffTimelineRun = Pick<
  OrchestrationV2Run,
  "id" | "ordinal" | "providerInstanceId" | "modelSelection"
>;

export type HandoffEndpoints = ReturnType<typeof resolveHandoffEndpoints>;

export function resolvePendingHandoff(
  projection: OrchestrationV2ThreadProjection | null | undefined,
  selection: ModelSelection | null | undefined,
  providers: ReadonlyArray<ServerProvider>,
): HandoffEndpoints | null {
  // A thread with an empty timeline has nothing to hand off. Any loaded row
  // counts: paging can leave a window of only tool rows.
  if (!projection?.visibleTurnItems.length) return null;
  const from = projection.runs.findLast(
    (run) => run.startedAt !== null && run.status !== "rolled_back",
  )?.modelSelection;
  if (from === undefined || selection == null) return null;
  const source = providers.find((provider) => provider.instanceId === from.instanceId);
  const target = providers.find((provider) => provider.instanceId === selection.instanceId);
  const needsHandoff =
    from.instanceId === selection.instanceId
      ? from.model !== selection.model && target?.requiresNewThreadForModelChange === true
      : source?.continuation?.groupKey === undefined ||
        source.driver !== target?.driver ||
        source.continuation.groupKey !== target.continuation?.groupKey;
  return needsHandoff ? { from: [from], to: selection } : null;
}

export function resolveHandoffEndpoints(
  item: Pick<
    Extract<OrchestrationV2TurnItem, { type: "handoff" }>,
    "runId" | "fromModelSelections" | "fromProviderInstanceIds" | "toModel" | "toProviderInstanceId"
  >,
  runs: ReadonlyArray<HandoffTimelineRun>,
) {
  const handoffRun = item.runId === null ? undefined : runs.find((run) => run.id === item.runId);
  const toModel =
    item.toModel ??
    (handoffRun !== undefined && handoffRun.providerInstanceId === item.toProviderInstanceId
      ? handoffRun.modelSelection.model
      : undefined);
  const fromEndpoints: ReadonlyArray<{
    readonly instanceId: ProviderInstanceId;
    readonly model?: string | undefined;
  }> =
    item.fromModelSelections !== undefined && item.fromModelSelections.length > 0
      ? item.fromModelSelections
      : item.fromProviderInstanceIds.map((instanceId) => ({
          instanceId,
          model: latestRunModelBefore(runs, instanceId, handoffRun?.ordinal),
        }));
  return { from: fromEndpoints, to: { instanceId: item.toProviderInstanceId, model: toModel } };
}

function latestRunModelBefore(
  runs: ReadonlyArray<HandoffTimelineRun>,
  instanceId: ProviderInstanceId,
  beforeOrdinal: number | undefined,
): string | undefined {
  let latest: HandoffTimelineRun | undefined;
  for (const run of runs) {
    if (run.providerInstanceId !== instanceId) continue;
    if (beforeOrdinal !== undefined && run.ordinal >= beforeOrdinal) continue;
    if (latest === undefined || run.ordinal > latest.ordinal) latest = run;
  }
  return latest?.modelSelection.model;
}

export interface ModelSwitchChange {
  readonly modelChanged: boolean;
  /** Effort labels, set only when the effort changed. */
  readonly effort: { readonly from: string; readonly to: string } | null;
}

// The option ids that carry a model's effort or thinking level.
const EFFORT_OPTION_IDS = ["reasoningEffort", "reasoning", "effort", "variant", "thinking"];

/**
 * What a recorded model switch visibly changed, or null when it changed neither the model nor the
 * effort. The composer omits an untouched effort, so an unset effort is not counted as a change.
 */
export function resolveModelSwitchChange(
  { from, to }: OrchestrationV2ModelSwitch,
  providers: ReadonlyArray<ServerProvider>,
): ModelSwitchChange | null {
  const modelsOf = (selection: ModelSelection) =>
    providers.find((provider) => provider.instanceId === selection.instanceId)?.models;
  const fromEffort = resolveEffort(from, modelsOf(from));
  const toEffort = resolveEffort(to, modelsOf(to));
  const modelChanged = from.model !== to.model;
  const effort =
    fromEffort && toEffort && fromEffort.value !== toEffort.value
      ? { from: fromEffort.label, to: toEffort.label }
      : null;
  return modelChanged || effort ? { modelChanged, effort } : null;
}

function resolveEffort(
  selection: ModelSelection,
  models: ReadonlyArray<ServerProviderModel> | undefined,
): { readonly value: string; readonly label: string } | undefined {
  const value = EFFORT_OPTION_IDS.map((id) =>
    getModelSelectionStringOptionValue(selection, id),
  ).find((candidate) => candidate !== undefined);
  if (value === undefined) return undefined;
  const model = models?.find((candidate) => candidate.slug === selection.model);
  const label = model?.capabilities?.optionDescriptors
    ?.flatMap((descriptor) => (descriptor.type === "select" ? descriptor.options : []))
    .find((option) => option.id === value)?.label;
  return { value, label: label ?? value };
}
