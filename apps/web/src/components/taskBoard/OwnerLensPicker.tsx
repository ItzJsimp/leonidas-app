import { memo } from "react";

import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";

import type { OwnerLens, OwnerLensOption } from "./owner.logic";

/**
 * Whose work the page shows: everyone, the viewer, each teammate, work nobody owns yet, or agent
 * work. A compact picker in the toolbar, so the lens costs no row of its own.
 */
export const OwnerLensPicker = memo(function OwnerLensPicker(props: {
  readonly options: ReadonlyArray<OwnerLensOption>;
  readonly value: OwnerLens;
  readonly onChange: (lens: OwnerLens) => void;
}) {
  const items = props.options.map((option) => ({
    value: option.lens,
    label: `${option.label} (${option.count})`,
  }));
  return (
    <div className="w-36 shrink-0">
      <Select
        value={props.value}
        items={items}
        onValueChange={(value) => {
          if (value && value !== props.value) props.onChange(value as OwnerLens);
        }}
      >
        <SelectTrigger size="sm" aria-label="Whose tasks">
          <SelectValue />
        </SelectTrigger>
        <SelectPopup>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectPopup>
      </Select>
    </div>
  );
});
