import { useId, useState, type FormEvent, type ReactNode } from "react";

import { Button } from "~/components/ui/button";
import {
  Dialog,
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
  validateFields,
  type ClientEvent,
  type FieldErrors,
  type FieldKind,
} from "./addMenu.logic";

/** Saves events. Returns null when saved, or a plain message when it failed. */
export type AppendFn = (events: ClientEvent[]) => Promise<string | null>;

export type Options = ReadonlyArray<readonly [value: string, label: string]>;

export interface TradingForm<V extends Record<string, string>> {
  readonly values: V;
  readonly set: (key: keyof V & string, value: string) => void;
  readonly errors: FieldErrors;
  /** The message to show under a field. Empty until the first save attempt. */
  readonly errorFor: (key: string) => string | undefined;
  readonly submit: () => void;
  readonly submitting: boolean;
  readonly failure: string | null;
}

/** Holds the field values, checks them, and saves the events a form builds. */
export function useTradingForm<V extends Record<string, string>>(options: {
  readonly initial: V;
  readonly kinds: (values: V) => Record<string, FieldKind>;
  readonly build: (values: V) => ClientEvent[];
  readonly append: AppendFn;
  readonly onSaved: () => void;
}): TradingForm<V> {
  const [values, setValues] = useState(options.initial);
  const [shown, setShown] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const errors = validateFields(options.kinds(values), values);

  const submit = async () => {
    setShown(true);
    if (submitting || Object.keys(errors).length > 0) return;
    setSubmitting(true);
    setFailure(null);
    const message = await options.append(options.build(values));
    setSubmitting(false);
    if (message === null) options.onSaved();
    else setFailure(message);
  };

  return {
    values,
    set: (key, value) => setValues((previous) => ({ ...previous, [key]: value })),
    errors,
    errorFor: (key) => (shown ? errors[key] : undefined),
    submit: () => void submit(),
    submitting,
    failure,
  };
}

interface ControlProps {
  readonly id: string;
  readonly "aria-invalid"?: true;
  readonly "aria-describedby"?: string;
}

/** A visible label, the control and the error under it. The error is linked with `aria-describedby`. */
function Field<V extends Record<string, string>>(props: {
  readonly form: TradingForm<V>;
  readonly name: string;
  readonly label: string;
  readonly children: (control: ControlProps) => ReactNode;
}) {
  const base = useId();
  const id = `${base}-${props.name}`;
  const message = props.form.errorFor(props.name);
  const control: ControlProps = message
    ? { id, "aria-invalid": true, "aria-describedby": `${id}-error` }
    : { id };
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label className="flex flex-col items-stretch" htmlFor={id}>
        {props.label}
        {props.children(control)}
      </Label>
      {message ? (
        <p id={`${id}-error`} className="text-sm text-destructive">
          {message}
        </p>
      ) : null}
    </div>
  );
}

export function TextField<V extends Record<string, string>>(props: {
  readonly form: TradingForm<V>;
  readonly name: keyof V & string;
  readonly label: string;
  readonly kind?: "text" | "amount" | "date";
  readonly maxLength?: number;
  readonly max?: string;
}) {
  const { form, name, kind = "text" } = props;
  return (
    <Field form={form} name={name} label={props.label}>
      {(control) => (
        <Input
          {...control}
          type={kind === "date" ? "date" : "text"}
          inputMode={kind === "amount" ? "decimal" : undefined}
          maxLength={props.maxLength}
          max={props.max}
          value={form.values[name]}
          onChange={(event) => form.set(name, event.target.value)}
        />
      )}
    </Field>
  );
}

export function ChoiceField<V extends Record<string, string>>(props: {
  readonly form: TradingForm<V>;
  readonly name: keyof V & string;
  readonly label: string;
  readonly options: Options;
}) {
  const { form, name, options } = props;
  const items = Object.fromEntries(options);
  return (
    <Field form={form} name={name} label={props.label}>
      {(control) => (
        <Select
          value={form.values[name]}
          items={items}
          disabled={options.length === 0}
          onValueChange={(value) => {
            if (typeof value === "string") form.set(name, value);
          }}
        >
          <SelectTrigger {...control} className="min-w-0">
            <SelectValue placeholder={options.length === 0 ? "None yet" : undefined} />
          </SelectTrigger>
          <SelectPopup>
            {options.map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectPopup>
        </Select>
      )}
    </Field>
  );
}

/** The dialog every form shares: a title, the fields, a failure line, Cancel and one primary Save. */
export function FormDialog<V extends Record<string, string>>(props: {
  readonly title: string;
  readonly form: TradingForm<V>;
  readonly onClose: () => void;
  readonly saveDisabled?: boolean;
  readonly children: ReactNode;
}) {
  const { form } = props;
  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    form.submit();
  };
  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : props.onClose())}>
      <DialogPopup>
        <form className="contents" onSubmit={onSubmit}>
          <DialogHeader>
            <DialogTitle>{props.title}</DialogTitle>
          </DialogHeader>
          <DialogPanel>
            <div className="flex flex-col gap-4">
              {props.children}
              {form.failure ? (
                <p role="alert" className="text-sm text-destructive">
                  {form.failure}
                </p>
              ) : null}
            </div>
          </DialogPanel>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={props.onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={form.submitting || props.saveDisabled === true}>
              {form.submitting ? <Spinner /> : null}
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  );
}

/** Two fields side by side on a wide dialog. */
export function FieldRow(props: { readonly children: ReactNode }) {
  return <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{props.children}</div>;
}
