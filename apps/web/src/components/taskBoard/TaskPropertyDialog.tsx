import type {
  TaskSchemaProperty,
  TaskSchemaPropertyEdit,
  TaskSchemaPropertyType,
} from "@t3tools/contracts";
import { useId, useState, type FormEvent } from "react";

import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Spinner } from "~/components/ui/spinner";

import {
  newPropertyKey,
  OPTION_TYPES,
  parseOptions,
  PROPERTY_TYPES,
  retype,
  withOptions,
} from "./taskProps.logic";
import type { SchemaChange } from "./useTaskSchemaEdit";

/** `property` null adds a new property; otherwise the dialog renames it or edits its options. */
export type PropertyDialogTarget = { readonly property: TaskSchemaProperty | null };

const TYPE_ITEMS = Object.fromEntries(PROPERTY_TYPES);

function PropertyForm(props: {
  readonly property: TaskSchemaProperty | null;
  readonly schema: ReadonlyArray<TaskSchemaProperty>;
  readonly onSchemaChange: SchemaChange;
  readonly onCreated: (key: string) => void;
  readonly onClose: () => void;
}) {
  const { property, schema } = props;
  const id = useId();
  const [name, setName] = useState(property?.label ?? property?.key ?? "");
  const [type, setType] = useState<TaskSchemaPropertyType>(property?.type ?? "text");
  const [options, setOptions] = useState((property?.options ?? []).join(", "));
  const [saving, setSaving] = useState(false);
  const label = name.trim();
  const hasOptions = OPTION_TYPES.has(type);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!label || saving) return;
    const list = parseOptions(options);
    const base: TaskSchemaProperty = property
      ? { ...property, ...retype(property, type) }
      : { key: "", builtIn: false, type };
    const { key: _key, builtIn: _builtIn, ...plain } = base;
    const edit: TaskSchemaPropertyEdit = {
      ...(hasOptions ? withOptions(base, list) : plain),
      label,
    };
    const key = property?.key ?? newPropertyKey(label, new Set(schema.map((item) => item.key)));
    setSaving(true);
    const ok = await props.onSchemaChange(
      property ? `Property changed: ${label}` : `Added property: ${label}`,
      key,
      edit,
    );
    setSaving(false);
    if (!ok) return;
    if (!property) props.onCreated(key);
    props.onClose();
  };

  return (
    <form className="contents" onSubmit={onSubmit}>
      <DialogHeader>
        <DialogTitle>{property ? "Edit property" : "New property"}</DialogTitle>
        <DialogDescription>
          {property
            ? "A new name changes only how the column reads. Cards keep their values."
            : "Every task card can hold a value for it. The column shows in the table."}
        </DialogDescription>
      </DialogHeader>
      <DialogPanel>
        <div className="flex flex-col gap-4">
          <Label className="flex flex-col items-stretch" htmlFor={`${id}-name`}>
            Name
            <Input
              id={`${id}-name`}
              autoFocus
              maxLength={80}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </Label>
          <Label className="flex flex-col items-stretch" htmlFor={`${id}-type`}>
            Type
            <Select
              value={type}
              items={TYPE_ITEMS}
              onValueChange={(value) => {
                if (typeof value === "string" && value in TYPE_ITEMS) {
                  setType(value as TaskSchemaPropertyType);
                }
              }}
            >
              <SelectTrigger id={`${id}-type`}>
                <SelectValue />
              </SelectTrigger>
              <SelectPopup>
                {PROPERTY_TYPES.map(([value, text]) => (
                  <SelectItem key={value} value={value}>
                    {text}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          </Label>
          {hasOptions ? (
            <Label className="flex flex-col items-stretch" htmlFor={`${id}-options`}>
              Options
              <Input
                id={`${id}-options`}
                placeholder="Draft, Ready, Shipped"
                value={options}
                onChange={(event) => setOptions(event.target.value)}
              />
              <span className="font-normal text-muted-foreground text-xs">
                Separate options with commas. Pick colors from the column menu.
              </span>
            </Label>
          ) : null}
        </div>
      </DialogPanel>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={props.onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={!label || saving}>
          {saving ? <Spinner /> : null}
          {property ? "Save" : "Add property"}
        </Button>
      </DialogFooter>
    </form>
  );
}

/** Adds a task property, or renames one and changes its type or options. */
export function TaskPropertyDialog(props: {
  readonly target: PropertyDialogTarget | null;
  readonly schema: ReadonlyArray<TaskSchemaProperty>;
  readonly onSchemaChange: SchemaChange;
  readonly onCreated: (key: string) => void;
  readonly onClose: () => void;
}) {
  const { target } = props;
  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && props.onClose()}>
      <DialogPopup className="max-w-md">
        {target ? (
          <PropertyForm
            key={target.property?.key ?? "new"}
            property={target.property}
            schema={props.schema}
            onSchemaChange={props.onSchemaChange}
            onCreated={props.onCreated}
            onClose={props.onClose}
          />
        ) : null}
      </DialogPopup>
    </Dialog>
  );
}
