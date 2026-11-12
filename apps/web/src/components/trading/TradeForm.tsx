import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import type {
  EnvironmentId,
  TradingAccountView,
  TradingStateInput,
  TradingTradeAddInput,
} from "@t3tools/contracts";
import { useState } from "react";

import { useAtomCommand } from "~/state/use-atom-command";
import { tradingTradeAdd } from "~/state/trading";

import { accountLabel, validateFields, type FieldKind } from "./addMenu.logic";
import { ChoiceField, FieldRow, FormDialog, TextField, type TradingForm } from "./FormParts";
import { errorReason, journalErrorText } from "./journal.logic";

export type TradeFields = Omit<TradingTradeAddInput, "workspaceId">;

interface TradeValues {
  readonly account: string;
  readonly day: string;
  readonly contract: string;
  readonly side: string;
  readonly size: string;
  readonly points: string;
  readonly dollars: string;
  readonly [key: string]: string;
}

const KINDS: Readonly<Record<string, FieldKind>> = {
  account: "text",
  day: "date",
  contract: "text",
  size: "amount",
  points: "signed",
  dollars: "signed",
};

const SIDES: ReadonlyArray<readonly [string, string]> = [
  ["long", "Long"],
  ["short", "Short"],
];

const toFields = (values: TradeValues): TradeFields => ({
  accountId: values.account,
  day: values.day,
  contract: values.contract.trim(),
  side: values.side === "short" ? "short" : "long",
  size: Number(values.size),
  points: Number(values.points),
  pnl: Number(values.dollars),
});

/** The form for one trade typed in by hand. The parent saves it and says what failed. */
export function TradeFormView({
  accounts,
  defaultDay,
  onSave,
  onClose,
}: {
  readonly accounts: readonly TradingAccountView[];
  readonly defaultDay: string;
  readonly onSave: (fields: TradeFields) => Promise<string | null>;
  readonly onClose: () => void;
}) {
  const [values, setValues] = useState<TradeValues>({
    account: accounts[0]?.id ?? "",
    day: defaultDay,
    contract: "",
    side: "long",
    size: "1",
    points: "",
    dollars: "",
  });
  const [shown, setShown] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const errors = validateFields(KINDS, values);

  const submit = async () => {
    setShown(true);
    if (saving || Object.keys(errors).length > 0 || accounts.length === 0) return;
    setSaving(true);
    setFailure(null);
    const message = await onSave(toFields(values));
    setSaving(false);
    if (message === null) onClose();
    else setFailure(message);
  };

  const form: TradingForm<TradeValues> = {
    values,
    set: (key, value) => setValues((previous) => ({ ...previous, [key]: value })),
    errors,
    errorFor: (key) => (shown ? errors[key] : undefined),
    submit: () => void submit(),
    submitting: saving,
    failure,
  };

  return (
    <FormDialog
      title="Add trade"
      form={form}
      onClose={onClose}
      saveDisabled={accounts.length === 0}
    >
      {accounts.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Add an account first. A trade needs an open account.
        </p>
      ) : (
        <>
          <ChoiceField
            form={form}
            name="account"
            label="Account"
            options={accounts.map((account) => [account.id, accountLabel(account)] as const)}
          />
          <FieldRow>
            <TextField form={form} name="day" label="Day" kind="date" />
            <TextField form={form} name="contract" label="Contract" maxLength={20} />
          </FieldRow>
          <FieldRow>
            <ChoiceField form={form} name="side" label="Side" options={SIDES} />
            <TextField form={form} name="size" label="Size (contracts)" kind="amount" />
          </FieldRow>
          <FieldRow>
            <TextField form={form} name="points" label="Points" kind="signed" />
            <TextField form={form} name="dollars" label="Dollars, net of fees" kind="signed" />
          </FieldRow>
        </>
      )}
    </FormDialog>
  );
}

/** Saves a typed trade to the active Trading workspace, then closes when it is saved. */
export function AddTradeDialog({
  environmentId,
  scope,
  accounts,
  defaultDay,
  onClose,
}: {
  readonly environmentId: EnvironmentId;
  readonly scope: TradingStateInput;
  readonly accounts: readonly TradingAccountView[];
  readonly defaultDay: string;
  readonly onClose: () => void;
}) {
  const run = useAtomCommand(tradingTradeAdd, { reportFailure: false });
  const onSave = async (fields: TradeFields) => {
    const result = await run({ environmentId, input: { ...scope, ...fields } });
    if (result._tag === "Success") return null;
    if (isAtomCommandInterrupted(result)) return journalErrorText(undefined);
    return journalErrorText(errorReason(squashAtomCommandFailure(result)));
  };
  return (
    <TradeFormView accounts={accounts} defaultDay={defaultDay} onSave={onSave} onClose={onClose} />
  );
}
