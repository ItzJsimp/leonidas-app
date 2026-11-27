import type { ProviderOptionDescriptor } from "@t3tools/contracts";
import { CheckIcon, ChevronRightIcon } from "lucide-react";
import { memo, type ReactNode } from "react";
import { cn } from "~/lib/utils";
import {
  effortRowStats,
  type PickerEffortStats,
  type PickerModelStats,
} from "../../lib/pickerModelStats";
import { Switch } from "../ui/switch";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { EffortNumbers, EffortNumbersCard } from "./PickerEffortNumbers";
import {
  getDescriptorStringValue,
  replaceDescriptorCurrentValue,
  useTraitsSelection,
  type TraitsMenuContentProps,
  type TraitsPersistence,
} from "./TraitsPicker";
import { rovingGroup } from "~/lib/rovingGroup";

/** What the picker adds on top of the traits: this model's benchmark numbers and the two ways out. */
export interface PickerColumnExtras {
  /** Benchmark numbers for the selected model; null while the catalog loads. */
  stats?: PickerModelStats | null;
  /** Opens the benchmarks window on this model. */
  onOpenBenchmarks?: () => void;
  /** Opens the Artificial Analysis key dialog. Only set while no key is saved. */
  onConnectKey?: () => void;
}

type Choice = {
  id: string;
  label: string;
  selected: boolean;
  isDefault?: boolean;
  /** `undefined`: show no numbers. `null`: show "Not benchmarked". */
  numbers?: PickerEffortStats | null;
  hint?: string;
  note?: string;
};

// A short plain note beside each effort level; the model's default level says "Default" instead.
const EFFORT_NOTES: Record<string, string> = {
  none: "No thinking",
  minimal: "Bare minimum",
  low: "Fastest",
  medium: "Balanced",
  high: "Deeper",
  xhigh: "Harder problems",
  max: "Most thorough",
  ultra: "Long tasks",
  ultracode: "Long tasks",
};

function ChoiceGroup(props: {
  label: string;
  hint?: ReactNode;
  choices: ReadonlyArray<Choice>;
  disabled?: boolean;
  onPick: (id: string) => void;
}) {
  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 px-3 pt-2 pb-1 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{props.label}</span>
        {props.hint ? (
          <>
            <span className="h-3 w-px shrink-0 bg-border" aria-hidden="true" />
            <span className="min-w-0 truncate">{props.hint}</span>
          </>
        ) : null}
      </div>
      <div
        role="radiogroup"
        ref={rovingGroup}
        aria-label={props.label}
        className="flex flex-row flex-wrap gap-0.5 px-1.5 pb-1.5 sm:flex-col"
      >
        {props.choices.map((choice) => {
          const button = (
            <button
              key={choice.id}
              type="button"
              role="radio"
              aria-checked={choice.selected}
              disabled={props.disabled}
              onClick={() => props.onPick(choice.id)}
              className={cn(
                "flex min-h-8 flex-col justify-center gap-1 rounded-md px-2 py-1 text-left text-sm sm:w-full",
                "hover:bg-accent focus-visible:bg-accent focus-visible:outline-none disabled:opacity-50",
                choice.selected && "bg-accent/60",
              )}
            >
              <span className="flex w-full items-center justify-between gap-2">
                <span className="min-w-0 truncate">{choice.label}</span>
                <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground/70">
                  {choice.isDefault ? "Default" : choice.note}
                  {choice.selected ? (
                    <CheckIcon className="size-3.5 shrink-0 text-foreground" aria-hidden="true" />
                  ) : null}
                </span>
              </span>
              {choice.numbers === null ? <EffortNumbers stats={null} /> : null}
            </button>
          );
          const card = choice.numbers ? (
            <EffortNumbersCard label={choice.label} stats={choice.numbers} />
          ) : (
            choice.hint
          );
          return card ? (
            <Tooltip key={choice.id}>
              <TooltipTrigger render={button} />
              <TooltipPopup side="left">{card}</TooltipPopup>
            </Tooltip>
          ) : (
            button
          );
        })}
      </div>
    </div>
  );
}

/**
 * The model picker's right column: every trait of the selected model, with the effort levels first.
 * It reads and writes the same options the old traits menu did.
 */
export const PickerReasoningColumn = memo(function PickerReasoningColumn(
  props: TraitsMenuContentProps & TraitsPersistence & PickerColumnExtras,
) {
  const { stats, onOpenBenchmarks, onConnectKey, ...traitsProps } = props;
  const { models, model } = traitsProps;
  const {
    modelSelection,
    descriptors,
    selectDescriptors,
    booleanDescriptors,
    primarySelectDescriptor,
    ultrathinkPromptControlled,
    ultrathinkInBodyText,
    hasAnyControls,
    modelIsUnavailable,
    updateDescriptors,
    handleSelectChange,
  } = useTraitsSelection(traitsProps);
  if (!hasAnyControls || modelIsUnavailable) return null;

  const modelName = models.find((entry) => entry.slug === model)?.name ?? model;
  // Ultrathink is typed in the prompt, so the column does not list it as a level.
  const pickable = (descriptor: (typeof selectDescriptors)[number]) =>
    descriptor.options.filter((option) => !descriptor.promptInjectedValues?.includes(option.id));
  const selects = selectDescriptors.filter((descriptor) => pickable(descriptor).length > 1);
  if (selects.length === 0 && booleanDescriptors.length === 0) return null;
  const primaryOptions = selects.find(
    (descriptor) => descriptor.id === primarySelectDescriptor?.id,
  );
  const hasNumbers =
    primaryOptions !== undefined &&
    pickable(primaryOptions).some((option) => effortRowStats(stats, option.id) !== undefined);

  return (
    <div
      className={cn(
        "flex max-h-72 w-full shrink-0 flex-col overflow-y-auto border-t border-border/70 bg-muted/40 sm:max-h-none sm:border-t-0 sm:border-l",
        hasNumbers ? "sm:w-76" : "sm:w-54",
      )}
      data-picker-reasoning-column="true"
    >
      {selects.map((descriptor) => {
        const isPrimary = descriptor.id === primarySelectDescriptor?.id;
        const current =
          isPrimary && ultrathinkPromptControlled
            ? "ultrathink"
            : getDescriptorStringValue(descriptor, modelSelection, props.reportedModelSelection);
        return (
          <ChoiceGroup
            key={descriptor.id}
            label={isPrimary ? "Effort" : descriptor.label}
            hint={isPrimary ? modelName : undefined}
            disabled={isPrimary && ultrathinkInBodyText}
            choices={pickable(descriptor).map((option) => ({
              id: option.id,
              label: option.label,
              selected: option.id === current,
              ...(option.isDefault ? { isDefault: true } : {}),
              ...(option.description ? { hint: option.description } : {}),
              ...(isPrimary && EFFORT_NOTES[option.id] ? { note: EFFORT_NOTES[option.id] } : {}),
              ...(isPrimary && effortRowStats(stats, option.id) !== undefined
                ? { numbers: effortRowStats(stats, option.id) ?? null }
                : {}),
            }))}
            onPick={(id) => handleSelectChange(descriptor, id)}
          />
        );
      })}
      {hasNumbers && onOpenBenchmarks ? (
        <button
          type="button"
          onClick={onOpenBenchmarks}
          className="mx-1.5 flex min-h-8 items-center justify-between gap-2 rounded-md px-2 text-left text-xs text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:bg-accent focus-visible:outline-none"
        >
          <span className="min-w-0 truncate">All metrics for {modelName}</span>
          <ChevronRightIcon className="size-3.5 shrink-0" aria-hidden="true" />
        </button>
      ) : null}
      {!hasNumbers && onConnectKey ? (
        <button
          type="button"
          onClick={onConnectKey}
          className="mx-1.5 mb-1.5 flex min-h-8 items-center justify-between gap-2 rounded-md px-2 text-left text-xs text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:bg-accent focus-visible:outline-none"
        >
          <span className="min-w-0">
            Connect Artificial Analysis to see numbers for each effort
          </span>
          <ChevronRightIcon className="size-3.5 shrink-0" aria-hidden="true" />
        </button>
      ) : null}
      {booleanDescriptors.map((descriptor) => (
        <label
          key={descriptor.id}
          className="mx-1.5 flex min-h-9 cursor-pointer items-center justify-between gap-2 border-t border-border/70 px-2 text-sm"
        >
          {descriptor.label}
          <Switch
            size="sm"
            checked={descriptor.currentValue === true}
            onCheckedChange={(on) =>
              updateDescriptors(
                replaceDescriptorCurrentValue(
                  descriptors as ReadonlyArray<ProviderOptionDescriptor>,
                  descriptor.id,
                  on,
                ),
              )
            }
          />
        </label>
      ))}
    </div>
  );
});
