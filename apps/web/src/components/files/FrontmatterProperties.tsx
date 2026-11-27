import { useState } from "react";

import { Select, SelectItem, SelectPopup, SelectTrigger } from "~/components/ui/select";
import { Switch } from "~/components/ui/switch";
import { cn } from "~/lib/utils";

import {
  orderProperties,
  propertyLabel,
  propertyOptions,
  type FrontmatterProperty,
  type PropertyTone,
} from "./frontmatter.logic";

const VISIBLE_ROWS = 8;

const TONE_CLASS: Record<PropertyTone, string> = {
  state: "bg-state",
  success: "bg-success",
  warning: "bg-warning",
  error: "bg-error",
};

const CHIP =
  "inline-flex min-w-0 items-center gap-1.5 rounded-md border border-border bg-secondary px-2 py-0.5 text-xs";
const FIELD =
  "min-w-0 rounded-md border border-transparent bg-transparent px-1.5 py-0.5 text-sm outline-none hover:bg-foreground/[0.04] focus-visible:border-ring";

interface RowProps {
  readonly property: FrontmatterProperty;
  readonly fileType: string | undefined;
  readonly onChange: ((key: string, value: string) => void) | undefined;
}

function Dot({ tone }: { readonly tone: PropertyTone | undefined }) {
  if (!tone) return null;
  return <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", TONE_CLASS[tone])} />;
}

function PropertyValue({ property, fileType, onChange }: RowProps) {
  const { key, kind, value, items } = property;
  const label = propertyLabel(key);

  if (kind === "list" && items.length > 0) {
    return (
      <span className="flex min-w-0 flex-wrap gap-1 px-1.5">
        {items.map((item, index) => (
          // eslint-disable-next-line react/no-array-index-key -- items can repeat and never reorder.
          <span key={`${index}:${item}`} className={cn(CHIP, "break-all")}>
            {item}
          </span>
        ))}
      </span>
    );
  }

  const options = propertyOptions(property, fileType);
  if (options) {
    const chip = (
      <>
        <Dot tone={options.tones?.[value]} />
        <span className="truncate">{value || "Empty"}</span>
      </>
    );
    if (!onChange) return <span className={cn(CHIP, "mx-1.5 justify-self-start")}>{chip}</span>;
    return (
      <Select value={value} onValueChange={(next) => next !== null && onChange(key, String(next))}>
        <SelectTrigger
          size="xs"
          variant="ghost"
          aria-label={`${label}: ${value || "Empty"}`}
          className="max-w-full justify-self-start"
          // The chip is the control, as in the approved design, so no chevron.
          icon={<span />}
        >
          <span className={cn(CHIP, "max-w-full")}>{chip}</span>
        </SelectTrigger>
        <SelectPopup alignItemWithTrigger={false} matchTriggerWidth={false}>
          {options.values.map((option) => (
            <SelectItem key={option} value={option}>
              <span className="flex items-center gap-1.5">
                <Dot tone={options.tones?.[option]} />
                {option}
              </span>
            </SelectItem>
          ))}
        </SelectPopup>
      </Select>
    );
  }

  const editable = onChange && kind !== "readonly" && kind !== "list";
  if (!editable) {
    return (
      <span className={cn("min-w-0 break-words px-1.5", !value && "text-muted-foreground")}>
        {value || "Empty"}
      </span>
    );
  }

  if (kind === "boolean") {
    return (
      <Switch
        size="sm"
        aria-label={label}
        className="mx-1.5 justify-self-start"
        checked={value.toLowerCase() === "true"}
        onCheckedChange={(checked) => onChange(key, String(checked))}
      />
    );
  }

  return (
    <input
      // A new value from disk or from a save replaces the draft.
      key={value}
      type={kind === "date" ? "date" : "text"}
      aria-label={label}
      placeholder="Empty"
      defaultValue={value}
      className={cn(FIELD, "w-full")}
      onBlur={(event) => {
        const next = event.currentTarget.value;
        // A cleared date field means the entry is incomplete, not that the date is gone.
        if (next !== value && (kind !== "date" || next !== "")) onChange(key, next);
      }}
      onKeyDown={(event) => {
        if (event.nativeEvent.isComposing) return;
        if (event.key === "Escape") event.currentTarget.value = value;
        if (event.key === "Enter" || event.key === "Escape") {
          event.preventDefault();
          event.currentTarget.blur();
        }
      }}
    />
  );
}

/** A file's front matter as one row per property. Without `onChange` every row is read-only. */
export function FrontmatterProperties({
  properties,
  onChange,
}: {
  readonly properties: ReadonlyArray<FrontmatterProperty>;
  readonly onChange?: ((key: string, value: string) => void) | undefined;
}) {
  const [expanded, setExpanded] = useState(false);
  const ordered = orderProperties(properties);
  const shown = expanded ? ordered : ordered.slice(0, VISIBLE_ROWS);
  const hidden = ordered.length - VISIBLE_ROWS;
  const fileType = properties.find((property) => property.key === "type")?.value;

  return (
    <section aria-label="File properties" className="border-b border-border pb-3 text-sm">
      <dl>
        {shown.map((property) => (
          <div
            key={property.key}
            className="grid min-h-8 grid-cols-[clamp(5.5rem,35%,8rem)_minmax(0,1fr)] items-center gap-x-2"
          >
            <dt className="truncate text-muted-foreground">{propertyLabel(property.key)}</dt>
            <dd className="grid min-w-0 py-0.5">
              <PropertyValue property={property} fileType={fileType} onChange={onChange} />
            </dd>
          </div>
        ))}
      </dl>
      {hidden > 0 ? (
        <button
          type="button"
          aria-expanded={expanded}
          className="min-h-8 cursor-pointer rounded-md text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          onClick={() => setExpanded((current) => !current)}
        >
          {expanded ? "Show fewer" : `${hidden} more ${hidden === 1 ? "property" : "properties"}`}
        </button>
      ) : null}
    </section>
  );
}
