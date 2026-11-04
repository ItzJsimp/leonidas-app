import { CheckIcon } from "lucide-react";
import { memo } from "react";
import { cn } from "~/lib/utils";
import {
  getDescriptorStringValue,
  useTraitsSelection,
  type TraitsMenuContentProps,
  type TraitsPersistence,
} from "./TraitsPicker";

/**
 * The model picker's right column: the effort levels of the selected model.
 * It reads and writes the same options as the traits menu, so both stay in step.
 */
export const PickerReasoningColumn = memo(function PickerReasoningColumn(
  props: TraitsMenuContentProps & TraitsPersistence,
) {
  const { models, model } = props;
  const {
    modelSelection,
    primarySelectDescriptor,
    ultrathinkPromptControlled,
    ultrathinkInBodyText,
    hasAnyControls,
    modelIsUnavailable,
    handleSelectChange,
  } = useTraitsSelection(props);
  const descriptor = primarySelectDescriptor;
  if (!hasAnyControls || modelIsUnavailable || !descriptor || descriptor.options.length < 2) {
    return null;
  }

  const currentValue = ultrathinkPromptControlled
    ? "ultrathink"
    : getDescriptorStringValue(descriptor, modelSelection, props.reportedModelSelection);
  const modelName = models.find((entry) => entry.slug === model)?.name ?? model;

  return (
    <div
      className="hidden w-44 shrink-0 flex-col border-l border-border/70 bg-muted/40 sm:flex"
      data-picker-reasoning-column="true"
    >
      <div className="flex items-baseline justify-between gap-2 border-b border-border/70 px-3 py-2 text-xs text-muted-foreground">
        <span className="font-medium">{descriptor.label}</span>
        <span className="min-w-0 truncate">{modelName}</span>
      </div>
      <div role="radiogroup" aria-label={descriptor.label} className="flex flex-col gap-0.5 p-1.5">
        {descriptor.options.map((option) => {
          const selected = option.id === currentValue;
          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={ultrathinkInBodyText}
              title={option.description ?? undefined}
              onClick={() => handleSelectChange(descriptor, option.id)}
              className={cn(
                "flex min-h-8 w-full items-center justify-between gap-2 rounded-md px-2 text-left text-sm",
                "hover:bg-accent focus-visible:bg-accent focus-visible:outline-none disabled:opacity-50",
                selected && "bg-accent/60",
              )}
            >
              <span className="min-w-0 truncate">{option.label}</span>
              {selected ? (
                <CheckIcon className="size-3.5 shrink-0" aria-hidden="true" />
              ) : option.isDefault ? (
                <span className="shrink-0 text-xs text-muted-foreground/70">Default</span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
});
