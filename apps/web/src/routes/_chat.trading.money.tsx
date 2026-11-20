import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { AddForms } from "../components/trading/AddForms";
import { AddMenu } from "../components/trading/AddMenu";
import type { FormKind } from "../components/trading/addMenu.logic";
import { isEmptyLedger } from "../components/trading/dashboard.logic";
import { MoneyView } from "../components/trading/MoneyView";
import { TradingEmpty } from "../components/trading/TradingEmpty";
import { useTradingAppend } from "../components/trading/useTradingAppend";
import { RailWindow } from "../components/twoState/RailWindow";
import { Spinner } from "../components/ui/spinner";
import { useActiveAiosWorkspace } from "../components/workspace/useActiveAiosWorkspace";
import { useEnvironmentQuery } from "../state/query";
import { tradingStateQuery } from "../state/trading";

function TradingMoney() {
  const { environmentId, scope, scopeReady } = useActiveAiosWorkspace();
  const query = useEnvironmentQuery(
    environmentId && scopeReady ? tradingStateQuery({ environmentId, input: scope }) : null,
  );
  const data = query.data;
  const append = useTradingAppend();
  const [form, setForm] = useState<FormKind | null>(null);

  if (data === null || data === undefined) {
    return (
      <RailWindow title="Money">
        {query.error ? (
          <p role="alert" className="p-6 text-sm text-muted-foreground">
            The Money tab could not read your ledger. Check that this is a Trading workspace.
          </p>
        ) : (
          <div className="grid flex-1 place-items-center p-6">
            <Spinner size="sm" aria-label="Loading your ledger" />
          </div>
        )}
      </RailWindow>
    );
  }
  const forms = (
    <AddForms
      form={form}
      state={data.state}
      pack={data.pack}
      entries={data.entries}
      append={append}
      onClose={() => setForm(null)}
    />
  );
  const add = <AddMenu onSelect={setForm} />;
  if (isEmptyLedger(data.state)) {
    return (
      <>
        <TradingEmpty
          title="Money"
          line="Firm fees, Payouts and Total cost show here once you add an account."
          action={{ label: "Add account", onClick: () => setForm("account") }}
          actions={add}
        />
        {forms}
      </>
    );
  }
  return (
    <>
      <RailWindow title="Money" actions={add}>
        <MoneyView
          state={data.state}
          settings={data.settings}
          settingsUnreadable={data.settingsUnreadable}
          onEditEntries={() => setForm("edit")}
        />
      </RailWindow>
      {forms}
    </>
  );
}

export const Route = createFileRoute("/_chat/trading/money")({ component: TradingMoney });
