import type { TradingSettings, TradingState } from "@t3tools/contracts";
import { useState, type FormEvent } from "react";

import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { cn } from "~/lib/utils";

import { Card, NetReturnChart } from "./DashboardView";
import { formatMoney, formatSigned } from "./dashboard.logic";
import {
  ALL_TIME,
  costRows,
  feeCapView,
  fundedCostView,
  monthChoices,
  parseCapInput,
  selectedSummary,
} from "./money.logic";
import { useTradingSettingsSave } from "./useTradingSettingsSave";

/** The Cap form. Its key is the saved cap, so a new cap resets the draft. */
function CapForm({ cap }: { readonly cap: number | null }) {
  const save = useTradingSettingsSave();
  const [draft, setDraft] = useState(cap === null ? "" : String(cap));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = parseCapInput(draft);
    if (!parsed.ok) {
      setError(parsed.message);
      return;
    }
    setBusy(true);
    setError(await save(parsed.value));
    setBusy(false);
  }

  return (
    <form onSubmit={onSubmit} noValidate className="mt-3 flex flex-col gap-1.5">
      <Label htmlFor="money-fee-cap">Monthly fee cap in dollars</Label>
      <div className="flex gap-2">
        <Input
          id="money-fee-cap"
          inputMode="decimal"
          value={draft}
          onChange={(event) => setDraft(event.currentTarget.value)}
          placeholder="No cap"
          aria-invalid={error !== null}
          aria-describedby="money-fee-cap-hint money-fee-cap-error"
          className="w-32"
        />
        <Button type="submit" size="sm" disabled={busy}>
          Set cap
        </Button>
      </div>
      <p id="money-fee-cap-hint" className="text-xs text-muted-foreground">
        Leave empty to remove the cap. The cap only warns. It never blocks an entry.
      </p>
      {error ? (
        <p id="money-fee-cap-error" role="alert" className="text-xs text-error-foreground">
          {error}
        </p>
      ) : null}
    </form>
  );
}

function FeeCapCard({
  timeline,
  settings,
  unreadable,
}: {
  readonly timeline: TradingState["moneyTimeline"];
  readonly settings: TradingSettings;
  readonly unreadable: boolean;
}) {
  const cap = settings.monthlyFeeCap;
  const view = feeCapView(timeline, new Date(), cap);
  const width = Math.min(view.percent ?? 0, 100);
  return (
    <Card title="Monthly fee cap" aside="This month">
      {view.text === null ? (
        <p className="text-xs text-muted-foreground">
          No cap set. A cap shows how much of this month's Firm fees you have used.
        </p>
      ) : (
        <>
          <p
            className={cn(
              "mb-2 text-sm tabular-nums",
              view.level === "warn" && "text-warning-foreground",
              view.level === "over" && "text-error-foreground",
            )}
          >
            {view.text}
          </p>
          <div
            role="progressbar"
            aria-label="Monthly fee cap used"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={width}
            className="h-1.5 w-full overflow-hidden rounded-full bg-muted-foreground/70"
          >
            <div
              className={cn(
                "h-full rounded-full",
                view.level === "ok" && "bg-state",
                view.level === "warn" && "bg-warning",
                view.level === "over" && "bg-error",
              )}
              style={{ width: `${width}%` }}
            />
          </div>
        </>
      )}
      {unreadable ? (
        <p role="status" className="mt-3 text-xs text-warning-foreground">
          Your trading settings file cannot be read, so no cap shows. Fix the file to set one.
        </p>
      ) : null}
      <CapForm key={cap ?? "none"} cap={cap} />
    </Card>
  );
}

/** The Money tab. Every number comes from `deriveTradingState` through the month totals in money.logic. */
export function MoneyView({
  state,
  settings,
  settingsUnreadable,
  onEditEntries,
}: {
  readonly state: TradingState;
  readonly settings: TradingSettings;
  readonly settingsUnreadable: boolean;
  readonly onEditEntries: () => void;
}) {
  const choices = monthChoices(state);
  const [picked, setPicked] = useState(ALL_TIME);
  const selection = choices.some((choice) => choice.value === picked) ? picked : ALL_TIME;
  const label = choices.find((choice) => choice.value === selection)?.label ?? "All time";
  const summary = selectedSummary(state.moneyTimeline, selection);
  const funded = fundedCostView(state);
  const numbers = [
    { id: "firm-fees", label: "Firm fees", value: formatMoney(summary.firmFees) },
    { id: "total-cost", label: "Total cost", value: formatMoney(summary.totalCost) },
    { id: "payouts", label: "Payouts", value: formatMoney(summary.payouts) },
    { id: "net-return", label: "Net return", value: formatSigned(summary.netReturn) },
  ];
  const costs = costRows(summary);

  return (
    <div className="flex flex-col gap-3 p-4">
      <Select
        items={choices}
        value={selection}
        onValueChange={(value) => {
          if (value) setPicked(value);
        }}
      >
        <SelectTrigger aria-label="Month" className="w-48">
          <SelectValue />
        </SelectTrigger>
        <SelectPopup align="start">
          {choices.map((choice) => (
            <SelectItem key={choice.value} value={choice.value}>
              {choice.label}
            </SelectItem>
          ))}
        </SelectPopup>
      </Select>
      <section
        aria-label={`Totals for ${label}`}
        className="grid grid-cols-2 rounded-xl border border-border bg-card sm:grid-cols-4"
      >
        {numbers.map((number) => (
          <div
            key={number.id}
            className="flex min-w-0 flex-col gap-0.5 border-l border-border px-4 py-2.5 first:border-l-0 max-sm:odd:border-l-0 max-sm:nth-[n+3]:border-t"
          >
            <span className="text-2xs font-medium text-muted-foreground">{number.label}</span>
            <span className="truncate text-xl font-semibold tracking-tight tabular-nums">
              {number.value}
            </span>
          </div>
        ))}
      </section>
      <div className="grid gap-3 lg:grid-cols-2">
        <Card title="Cost categories" aside={label}>
          {costs.length === 0 ? (
            <p className="text-xs text-muted-foreground">No costs in this period.</p>
          ) : (
            <ul className="divide-y divide-border">
              {costs.map((row) => (
                <li
                  key={row.category}
                  className="flex justify-between gap-2 py-2 first:pt-0 text-sm"
                >
                  <span>{row.label}</span>
                  <span className="tabular-nums">{row.amount}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <FeeCapCard
          timeline={state.moneyTimeline}
          settings={settings}
          unreadable={settingsUnreadable}
        />
      </div>
      <NetReturnChart state={state} defaultRange="All" markers />
      <div className="grid gap-3 lg:grid-cols-2">
        <Card title="Average cost of a Funded account">
          <p className="text-xl font-semibold tracking-tight tabular-nums">{funded.value}</p>
          <p className="mt-1 text-xs text-muted-foreground">{funded.note}</p>
        </Card>
        <Card title="Entries">
          <p className="mb-3 text-xs text-muted-foreground">
            Fix a wrong amount or remove an entry. Each change adds a correction, so the history
            stays.
          </p>
          <Button size="sm" variant="outline" onClick={onEditEntries}>
            Edit entries
          </Button>
        </Card>
      </div>
    </div>
  );
}
