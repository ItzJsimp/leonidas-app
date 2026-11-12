import type { Market } from "@t3tools/trading";
import { useId, useState, type ReactNode } from "react";

import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { cn } from "~/lib/utils";

import { formatMoney } from "./dashboard.logic";
import {
  bankrollOdds,
  evaluationEv,
  percentText,
  sizeFor,
  sizeText,
  type BankrollForm,
  type EvForm,
  type SizeForm,
} from "./risk.logic";

export function Panel({
  title,
  children,
}: {
  readonly title: string;
  readonly children: ReactNode;
}) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="min-w-0 rounded-xl border border-border bg-card p-4">
      <h2 id={id} className="mb-3 text-sm font-medium">
        {title}
      </h2>
      {children}
    </section>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
}) {
  const id = useId();
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        inputMode="decimal"
        autoComplete="off"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

/** Keeps one form object in state and gives each field its setter. */
function useForm<F extends Record<keyof F, string>>(initial: F) {
  const [form, setForm] = useState(initial);
  const field = (key: keyof F & string) => ({
    value: form[key],
    onChange: (value: string) => setForm((prev) => ({ ...prev, [key]: value })),
  });
  return { form, field };
}

const RESULT = "mt-3 text-sm tabular-nums";

export function EvCalculator() {
  const { form, field } = useForm<EvForm>({
    fee: "",
    passRate: "",
    activation: "",
    payoutChance: "",
    payoutSize: "",
  });
  const result = evaluationEv(form);
  return (
    <Panel title="Expected value">
      <div className="grid gap-3 sm:grid-cols-2">
        <NumberField label="Evaluation fee ($)" {...field("fee")} />
        <NumberField label="Pass rate (%)" {...field("passRate")} />
        <NumberField label="Activation fee ($, if any)" {...field("activation")} />
        <NumberField label="Payout chance (%)" {...field("payoutChance")} />
        <NumberField label="Average Payout ($)" {...field("payoutSize")} />
      </div>
      <p aria-live="polite" className={RESULT}>
        {result
          ? `Average cost of a Funded account: ${formatMoney(result.averageCost)}. Expected value: ${formatMoney(result.value)}.`
          : "Fill in the boxes with numbers. The Pass rate must be above 0."}
      </p>
    </Panel>
  );
}

export function BankrollCalculator() {
  const { form, field } = useForm<BankrollForm>({ bankroll: "", fee: "", passRate: "" });
  const odds = bankrollOdds(form);
  return (
    <Panel title="Bankroll">
      <div className="grid gap-3 sm:grid-cols-3">
        <NumberField label="Bankroll ($)" {...field("bankroll")} />
        <NumberField label="Evaluation fee ($)" {...field("fee")} />
        <NumberField label="Pass rate (%)" {...field("passRate")} />
      </div>
      <div aria-live="polite" className={RESULT}>
        {odds ? (
          <>
            <p>You can pay for {odds.attempts} Evaluations.</p>
            <ul className="mt-1.5 flex flex-col gap-0.5 text-muted-foreground">
              <li>Exactly 0 passes: {percentText(odds.exactly[0])}</li>
              <li>Exactly 1 pass: {percentText(odds.exactly[1])}</li>
              <li>Exactly 2 passes: {percentText(odds.exactly[2])}</li>
            </ul>
          </>
        ) : (
          <p>Fill in the boxes with numbers. The fee must be above 0.</p>
        )}
      </div>
    </Panel>
  );
}

const MARKETS: readonly Market[] = ["NQ", "MNQ"];

export function PositionSizeCalculator() {
  const [market, setMarket] = useState<Market>("NQ");
  const { form, field } = useForm<SizeForm>({ contracts: "", points: "", dollars: "" });
  const result = sizeFor(market, form);
  return (
    <Panel title="Position size">
      <span
        role="group"
        aria-label="Market"
        className="mb-3 inline-flex overflow-hidden rounded-md border border-input text-xs font-medium"
      >
        {MARKETS.map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={value === market}
            onClick={() => setMarket(value)}
            className={cn(
              "px-2.5 py-1 text-muted-foreground",
              value === market && "bg-card text-foreground",
            )}
          >
            {value}
          </button>
        ))}
      </span>
      <div className="grid gap-3 sm:grid-cols-3">
        <NumberField label="Contracts" {...field("contracts")} />
        <NumberField label="Points" {...field("points")} />
        <NumberField label="Dollars at risk ($)" {...field("dollars")} />
      </div>
      <p aria-live="polite" className={RESULT}>
        {sizeText(result, market)}
      </p>
    </Panel>
  );
}
