import type { TradingAccountView } from "@t3tools/contracts";
import type { TradePlan } from "@t3tools/trading";
import { Link } from "@tanstack/react-router";
import { useId } from "react";

import { Button } from "~/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader } from "~/components/ui/empty";

import { formatMoney } from "./dashboard.logic";
import { BankrollCalculator, EvCalculator, Panel, PositionSizeCalculator } from "./RiskCalculators";
import { planFor, stageLabel, type ReadyRules } from "./risk.logic";

function PlanCard({
  account,
  plan,
}: {
  readonly account: TradingAccountView;
  readonly plan: TradePlan | null;
}) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="min-w-0 rounded-xl border border-border bg-card p-4">
      <h2 id={id} className="flex flex-wrap items-center gap-2 text-sm font-medium">
        <span className="min-w-0 truncate">
          {account.firm} {account.product}
        </span>
        <span className="rounded border border-input px-1.5 py-0.5 text-xs font-normal text-muted-foreground">
          {stageLabel(account)}
        </span>
      </h2>
      {plan === null ? (
        <p className="mt-3 text-sm text-muted-foreground">
          The pack has no risk state for this account.
        </p>
      ) : (
        <>
          <dl className="mt-3 grid gap-3 text-sm tabular-nums sm:grid-cols-3">
            <div>
              <dt className="text-xs text-muted-foreground">Stop</dt>
              <dd>
                {plan.stopPoints} points, {formatMoney(plan.stopDollars)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Target</dt>
              <dd>
                {plan.targetPoints} points, {formatMoney(plan.targetDollars)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Contracts</dt>
              <dd>
                {plan.contracts} NQ, {plan.mnq.contracts} MNQ
              </dd>
            </div>
          </dl>
          {plan.warnings.map((warning) => (
            <p key={warning.code} role="alert" className="mt-3 text-sm">
              Warning: {warning.text}
            </p>
          ))}
        </>
      )}
    </section>
  );
}

/** The Risk tab. Without a valid pack it teaches how to link one and offers only the size calculator. */
export function RiskView({
  accounts,
  rules,
}: {
  readonly accounts: readonly TradingAccountView[];
  readonly rules: ReadyRules | null;
}) {
  if (rules === null) {
    return (
      <>
        <Panel title="Risk needs a pack">
          <p className="text-sm text-muted-foreground">
            A pack holds your firm rules and the next trade plan for each account. Link a pack
            folder in workspace settings, then come back here. Until then, use the position size
            calculator below.
          </p>
          <div className="mt-3">
            <Button variant="outline" render={<Link to="/settings/general" />}>
              Open workspace settings
            </Button>
          </div>
        </Panel>
        <PositionSizeCalculator />
      </>
    );
  }
  const open = accounts.filter((account) => account.closedReason === null);
  return (
    <>
      {open.length === 0 ? (
        <Empty size="compact">
          <EmptyHeader>
            <EmptyDescription>
              Add an account to see its next trade plan: stop, target and contracts.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button render={<Link to="/trading/accounts" />}>Add an account</Button>
          </EmptyContent>
        </Empty>
      ) : (
        open.map((account) => (
          <PlanCard key={account.id} account={account} plan={planFor(account, rules)} />
        ))
      )}
      <EvCalculator />
      <BankrollCalculator />
      <PositionSizeCalculator />
    </>
  );
}
