import type { TradingPackView, TradingState } from "@t3tools/contracts";

import {
  FORM_TITLES,
  accountKinds,
  accountLabel,
  attemptAccounts,
  attemptKinds,
  buildAddAccount,
  buildLogCost,
  buildLogFee,
  buildLogPayout,
  buildRecordResult,
  buildStartAttempt,
  costKinds,
  feeAccounts,
  feeKinds,
  localDay,
  payoutAccounts,
  resultAccounts,
  resultKinds,
  type AccountValues,
  type AttemptValues,
  type Entry,
  type FormKind,
  type MoneyValues,
  type ResultValues,
} from "./addMenu.logic";
import { EditEntries } from "./EditEntries";
import {
  ChoiceField,
  FieldRow,
  FormDialog,
  TextField,
  useTradingForm,
  type AppendFn,
  type Options,
} from "./FormParts";
import {
  accountFee,
  evaluationFee,
  findProduct,
  presetFirms,
  sizeLabel,
  type PresetFirm,
} from "./packPresets";

type Account = TradingState["accounts"][number];

interface FormProps {
  readonly state: TradingState;
  /** Firm presets from the linked pack. Empty: every field is typed by hand. */
  readonly firms: readonly PresetFirm[];
  readonly append: AppendFn;
  readonly onClose: () => void;
}

const accountOptions = (accounts: readonly Account[]): Options =>
  accounts.map((account) => [account.id, accountLabel(account)] as const);

const VIA_OPTIONS: Options = [
  ["purchase", "Purchase"],
  ["reset", "Reset"],
];
const STAGE_OPTIONS: Options = [
  ["sim", "Sim"],
  ["evaluation", "Evaluation"],
  ["funded", "Funded"],
];

function AccountForm({ firms, append, onClose }: FormProps) {
  const form = useTradingForm<AccountValues & Record<string, string>>({
    initial: {
      firm: "",
      product: "",
      size: "",
      platform: "TopstepX",
      last4: "",
      stage: "evaluation",
      fee: "",
      date: localDay(),
    },
    kinds: accountKinds,
    build: buildAddAccount,
    append,
    onSaved: onClose,
  });
  return (
    <FormDialog title={FORM_TITLES.account} form={form} onClose={onClose}>
      <FieldRow>
        {firms.length > 0 ? (
          <>
            <ChoiceField
              form={form}
              name="firm"
              label="Firm"
              options={firms.map((firm) => [firm.name, firm.name] as const)}
              onPick={() => form.set("product", "")}
            />
            <ChoiceField
              form={form}
              name="product"
              label="Product"
              options={(firms.find((firm) => firm.name === form.values.firm)?.products ?? []).map(
                (product) => [product.name, product.name] as const,
              )}
              onPick={(name) => {
                const product = findProduct(firms, form.values.firm, name);
                if (!product) return;
                form.set("size", sizeLabel(product.size));
                form.set("fee", evaluationFee(product));
              }}
            />
          </>
        ) : (
          <>
            <TextField form={form} name="firm" label="Firm" />
            <TextField form={form} name="product" label="Product" />
          </>
        )}
        <TextField form={form} name="size" label="Size" />
        <TextField form={form} name="platform" label="Platform" />
        <TextField form={form} name="last4" label="Last 4 digits" maxLength={4} />
        <ChoiceField form={form} name="stage" label="Stage" options={STAGE_OPTIONS} />
        {form.values.stage === "evaluation" ? (
          <TextField form={form} name="fee" label="Evaluation fee" kind="amount" />
        ) : null}
        <TextField form={form} name="date" label="Date" kind="date" max={localDay()} />
      </FieldRow>
    </FormDialog>
  );
}

function AttemptForm({ state, firms, append, onClose }: FormProps) {
  const accounts = attemptAccounts(state);
  const byId = (id: string) => accounts.find((account) => account.id === id);
  const form = useTradingForm<AttemptValues & Record<string, string>>({
    initial: {
      accountId: accounts[0]?.id ?? "",
      via: "purchase",
      fee: accountFee(firms, accounts[0], "purchase"),
      date: localDay(),
    },
    kinds: () => attemptKinds,
    build: buildStartAttempt,
    append,
    onSaved: onClose,
  });
  return (
    <FormDialog title={FORM_TITLES.attempt} form={form} onClose={onClose}>
      <ChoiceField
        form={form}
        name="accountId"
        label="Account"
        options={accountOptions(accounts)}
        onPick={(id) =>
          form.set(
            "fee",
            accountFee(firms, byId(id), form.values.via === "reset" ? "reset" : "purchase"),
          )
        }
      />
      <FieldRow>
        <ChoiceField
          form={form}
          name="via"
          label="Purchase or Reset"
          options={VIA_OPTIONS}
          onPick={(via) =>
            form.set(
              "fee",
              accountFee(
                firms,
                byId(form.values.accountId),
                via === "reset" ? "reset" : "purchase",
              ),
            )
          }
        />
        <TextField form={form} name="fee" label="Fee" kind="amount" />
      </FieldRow>
      <TextField form={form} name="date" label="Date" kind="date" max={localDay()} />
    </FormDialog>
  );
}

function ResultForm({ state, firms, append, onClose }: FormProps) {
  const accounts = resultAccounts(state);
  const byId = (id: string) => accounts.find((account) => account.id === id);
  const form = useTradingForm<ResultValues & Record<string, string>>({
    initial: {
      accountId: accounts[0]?.id ?? "",
      result: "passed",
      activationFee: accountFee(firms, accounts[0], "activation"),
      next: "reset",
      resetFee: accountFee(firms, accounts[0], "reset"),
      closeReason: "drawdown",
      date: localDay(),
    },
    kinds: resultKinds,
    build: buildRecordResult,
    append,
    onSaved: onClose,
  });
  const { result, next } = form.values;
  return (
    <FormDialog title={FORM_TITLES.result} form={form} onClose={onClose}>
      <ChoiceField
        form={form}
        name="accountId"
        label="Account"
        options={accountOptions(accounts)}
        onPick={(id) => {
          form.set("activationFee", accountFee(firms, byId(id), "activation"));
          form.set("resetFee", accountFee(firms, byId(id), "reset"));
        }}
      />
      <FieldRow>
        <ChoiceField
          form={form}
          name="result"
          label="Result"
          options={[
            ["passed", "Passed"],
            ["failed", "Failed"],
          ]}
        />
        <TextField form={form} name="date" label="Date" kind="date" max={localDay()} />
      </FieldRow>
      {result === "passed" ? (
        <TextField form={form} name="activationFee" label="Activation fee" kind="amount" />
      ) : (
        <FieldRow>
          <ChoiceField
            form={form}
            name="next"
            label="Next step"
            options={[
              ["reset", "Reset"],
              ["close", "Close"],
            ]}
          />
          {next === "reset" ? (
            <TextField form={form} name="resetFee" label="Reset fee" kind="amount" />
          ) : (
            <ChoiceField
              form={form}
              name="closeReason"
              label="Reason"
              options={[
                ["drawdown", "Drawdown"],
                ["rule", "Rule break"],
              ]}
            />
          )}
        </FieldRow>
      )}
    </FormDialog>
  );
}

type MoneyForm = "fee" | "payout" | "cost";

const MONEY_FORMS = {
  fee: { kinds: feeKinds, build: buildLogFee, pick: feeAccounts },
  payout: { kinds: feeKinds, build: buildLogPayout, pick: payoutAccounts },
  cost: { kinds: costKinds, build: buildLogCost, pick: () => [] },
} as const;

/** Log fee, Log Payout and Log other cost share one shape: an Account or Category, Amount, Date. */
function MoneyFormDialog({ kind, state, append, onClose }: FormProps & { kind: MoneyForm }) {
  const spec = MONEY_FORMS[kind];
  const accounts = spec.pick(state);
  const form = useTradingForm<MoneyValues & Record<string, string>>({
    initial: {
      accountId: accounts[0]?.id ?? "",
      category: "mentorship",
      amount: "",
      date: localDay(),
    },
    kinds: () => spec.kinds,
    build: spec.build,
    append,
    onSaved: onClose,
  });
  return (
    <FormDialog title={FORM_TITLES[kind]} form={form} onClose={onClose}>
      {kind === "cost" ? (
        <ChoiceField
          form={form}
          name="category"
          label="Category"
          options={[
            ["mentorship", "Mentorship"],
            ["data", "Market data"],
            ["tools", "Tools"],
            ["other", "Other"],
          ]}
        />
      ) : (
        <ChoiceField
          form={form}
          name="accountId"
          label="Account"
          options={accountOptions(accounts)}
        />
      )}
      <FieldRow>
        <TextField form={form} name="amount" label="Amount" kind="amount" />
        <TextField form={form} name="date" label="Date" kind="date" max={localDay()} />
      </FieldRow>
      {kind === "fee" ? (
        <p className="text-sm text-muted-foreground">
          For a Reset or an Activation fee, use Start Attempt or Record pass.
        </p>
      ) : null}
    </FormDialog>
  );
}

/** The dialog for the chosen menu item. Nothing renders when no form is chosen. */
export function AddForms(props: {
  readonly form: FormKind | null;
  readonly state: TradingState;
  readonly pack?: TradingPackView;
  readonly entries: readonly Entry[];
  readonly append: AppendFn;
  readonly onClose: () => void;
}) {
  const { form, state, entries, append, onClose } = props;
  const shared = { state, firms: presetFirms(props.pack), append, onClose };
  switch (form) {
    case "account":
      return <AccountForm {...shared} />;
    case "attempt":
      return <AttemptForm {...shared} />;
    case "result":
      return <ResultForm {...shared} />;
    case "fee":
    case "payout":
    case "cost":
      return <MoneyFormDialog kind={form} {...shared} />;
    case "edit":
      return <EditEntries {...shared} entries={entries} />;
    default:
      return null;
  }
}
