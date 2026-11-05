import type { ProviderOptionDescriptor } from "@t3tools/contracts";
import { CheckIcon } from "lucide-react";
import { memo, type ReactNode } from "react";
import { cn } from "~/lib/utils";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import {
  getDescriptorStringValue,
  replaceDescriptorCurrentValue,
  useTraitsSelection,
  type TraitsMenuContentProps,
  type TraitsPersistence,
} from "./TraitsPicker";

type Choice = { id: string; label: string; selected: boolean; isDefault?: boolean; hint?: string };

function ChoiceGroup(props: {
  label: string;
  hint?: ReactNode;
  choices: ReadonlyArray<Choice>;
  disabled?: boolean;
  onPick: (id: string) => void;
}) {
  return (
    <div className="flex flex-col">
      <div className="flex items-baseline justify-between gap-2 px-3 pt-2 pb-1 text-xs text-muted-foreground">
        <span className="font-medium">{props.label}</span>
        {props.hint ? <span className="min-w-0 truncate">{props.hint}</span> : null}
      </div>
      <div
        role="radiogroup"
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
                "flex min-h-8 items-center justify-between gap-2 rounded-md px-2 text-left text-sm sm:w-full",
                "hover:bg-accent focus-visible:bg-accent focus-visible:outline-none disabled:opacity-50",
                choice.selected && "bg-accent/60",
              )}
            >
              <span className="min-w-0 truncate">{choice.label}</span>
              {choice.selected ? (
                <CheckIcon className="size-3.5 shrink-0" aria-hidden="true" />
              ) : choice.isDefault ? (
                <span className="shrink-0 text-xs text-muted-foreground/70">Default</span>
              ) : null}
            </button>
          );
          return choice.hint ? (
            <Tooltip key={choice.id}>
              <TooltipTrigger render={button} />
              <TooltipPopup side="left">{choice.hint}</TooltipPopup>
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
  props: TraitsMenuContentProps & TraitsPersistence,
) {
  const { models, model } = props;
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
  } = useTraitsSelection(props);
  if (!hasAnyControls || modelIsUnavailable) return null;

  const modelName = models.find((entry) => entry.slug === model)?.name ?? model;
  // Ultrathink is typed in the prompt, so the column does not list it as a level.
  const pickable = (descriptor: (typeof selectDescriptors)[number]) =>
    descriptor.options.filter((option) => !descriptor.promptInjectedValues?.includes(option.id));
  const selects = selectDescriptors.filter((descriptor) => pickable(descriptor).length > 1);
  if (selects.length === 0 && booleanDescriptors.length === 0) return null;

  return (
    <div
      className="flex max-h-72 w-full shrink-0 flex-col overflow-y-auto border-t border-border/70 bg-muted/40 sm:max-h-none sm:w-44 sm:border-t-0 sm:border-l"
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
            label={descriptor.label}
            hint={isPrimary ? modelName : undefined}
            disabled={isPrimary && ultrathinkInBodyText}
            choices={pickable(descriptor).map((option) => ({
              id: option.id,
              label: option.label,
              selected: option.id === current,
              ...(option.isDefault ? { isDefault: true } : {}),
              ...(option.description ? { hint: option.description } : {}),
            }))}
            onPick={(id) => handleSelectChange(descriptor, id)}
          />
        );
      })}
      {booleanDescriptors.map((descriptor) => (
        <ChoiceGroup
          key={descriptor.id}
          label={descriptor.label}
          choices={[
            { id: "on", label: "On", selected: descriptor.currentValue === true },
            { id: "off", label: "Off", selected: descriptor.currentValue !== true },
          ]}
          onPick={(id) =>
            updateDescriptors(
              replaceDescriptorCurrentValue(
                descriptors as ReadonlyArray<ProviderOptionDescriptor>,
                descriptor.id,
                id === "on",
              ),
            )
          }
        />
      ))}
    </div>
  );
});
