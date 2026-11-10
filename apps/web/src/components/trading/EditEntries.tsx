import type { TradingState } from "@t3tools/contracts";
import { useState } from "react";

import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from "~/components/ui/alert-dialog";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "~/components/ui/dialog";
import { Spinner } from "~/components/ui/spinner";

import {
  EDIT_FIELDS,
  buildDelete,
  buildEdit,
  editKinds,
  editPatch,
  editValues,
  entryAmount,
  entryDay,
  entryLabel,
  localDay,
  type Entry,
} from "./addMenu.logic";
import { formatMoney } from "./dashboard.logic";
import { ChoiceField, FormDialog, TextField, useTradingForm, type AppendFn } from "./FormParts";

function EditForm(props: {
  readonly entry: Entry;
  readonly append: AppendFn;
  readonly onSaved: () => void;
  readonly onClose: () => void;
}) {
  const { entry } = props;
  const form = useTradingForm<Record<string, string>>({
    initial: editValues(entry),
    kinds: () => editKinds(entry),
    build: (values) => buildEdit(entry, editPatch(entry, values)),
    append: props.append,
    onSaved: props.onSaved,
  });
  const changed = Object.keys(editPatch(entry, form.values)).length > 0;
  return (
    <FormDialog title="Edit entry" form={form} onClose={props.onClose} saveDisabled={!changed}>
      {(EDIT_FIELDS[String(entry.kind)] ?? []).map((field) =>
        field.kind === "choice" ? (
          <ChoiceField
            key={field.key}
            form={form}
            name={field.key}
            label={field.label}
            options={field.options ?? []}
          />
        ) : (
          <TextField
            key={field.key}
            form={form}
            name={field.key}
            label={field.label}
            kind={field.kind}
          />
        ),
      )}
      <TextField form={form} name="date" label="Date" kind="date" max={localDay()} />
    </FormDialog>
  );
}

function DeleteConfirm(props: {
  readonly entry: Entry | null;
  readonly label: string;
  readonly append: AppendFn;
  readonly onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const { entry } = props;
  const confirm = async () => {
    if (entry === null) return;
    setBusy(true);
    setFailure(null);
    const message = await props.append(buildDelete(entry));
    setBusy(false);
    if (message === null) props.onDone();
    else setFailure(message);
  };
  return (
    <AlertDialog
      open={entry !== null}
      onOpenChange={(open) => {
        if (!open) {
          setFailure(null);
          props.onDone();
        }
      }}
    >
      <AlertDialogPopup>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this entry?</AlertDialogTitle>
          <AlertDialogDescription>{props.label}</AlertDialogDescription>
        </AlertDialogHeader>
        {failure ? (
          <p role="alert" className="px-6 text-sm text-destructive">
            {failure}
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogClose render={<Button variant="outline" />}>Keep it</AlertDialogClose>
          <Button variant="destructive" disabled={busy} onClick={() => void confirm()}>
            {busy ? <Spinner /> : null}
            Delete
          </Button>
        </AlertDialogFooter>
      </AlertDialogPopup>
    </AlertDialog>
  );
}

/** Lists the latest ledger entries with Edit and Delete. Both write a correction event. */
export function EditEntries(props: {
  readonly state: TradingState;
  readonly entries: readonly Entry[];
  readonly append: AppendFn;
  readonly onClose: () => void;
}) {
  const { state, entries, append, onClose } = props;
  const [editing, setEditing] = useState<Entry | null>(null);
  const [deleting, setDeleting] = useState<Entry | null>(null);
  const accountName = (id: string) => {
    const account = state.accounts.find((candidate) => candidate.id === id);
    return account ? `${account.firm} ${account.size} ·${account.last4}` : "";
  };
  const label = (entry: Entry) => entryLabel(entry, accountName);

  if (editing !== null) {
    return (
      <EditForm
        entry={editing}
        append={append}
        onSaved={() => setEditing(null)}
        onClose={() => setEditing(null)}
      />
    );
  }
  return (
    <>
      <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
        <DialogPopup>
          <DialogHeader>
            <DialogTitle>Edit an entry</DialogTitle>
          </DialogHeader>
          <DialogPanel>
            {entries.length === 0 ? (
              <p className="text-sm text-muted-foreground">No entries yet.</p>
            ) : (
              <ul className="divide-y divide-border">
                {entries.map((entry) => {
                  const amount = entryAmount(entry);
                  return (
                    <li key={String(entry.id)} className="flex items-center gap-3 py-2">
                      <span className="min-w-0 flex-1 truncate text-sm">{label(entry)}</span>
                      <span className="shrink-0 text-sm tabular-nums">
                        {amount === null ? "" : formatMoney(amount)}
                      </span>
                      <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                        {entryDay(entry)}
                      </span>
                      <Button
                        size="xs"
                        variant="outline"
                        aria-label={`Edit ${label(entry)}`}
                        onClick={() => setEditing(entry)}
                      >
                        Edit
                      </Button>
                      <Button
                        size="xs"
                        variant="outline"
                        aria-label={`Delete ${label(entry)}`}
                        onClick={() => setDeleting(entry)}
                      >
                        Delete
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </DialogPanel>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Close
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
      <DeleteConfirm
        entry={deleting}
        label={deleting ? label(deleting) : ""}
        append={append}
        onDone={() => setDeleting(null)}
      />
    </>
  );
}
