import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { AccountsView } from "../components/trading/AccountsView";
import { AddForms } from "../components/trading/AddForms";
import { AddMenu } from "../components/trading/AddMenu";
import type { FormKind } from "../components/trading/addMenu.logic";
import { RailWindow } from "../components/twoState/RailWindow";
import { Spinner } from "../components/ui/spinner";
import { TradingEmpty } from "../components/trading/TradingEmpty";
import { useTradingAppend } from "../components/trading/useTradingAppend";
import { useActiveAiosWorkspace } from "../components/workspace/useActiveAiosWorkspace";
import { useEnvironmentQuery } from "../state/query";
import { tradingStateQuery } from "../state/trading";

function TradingAccounts() {
  const { environmentId, scope, scopeReady } = useActiveAiosWorkspace();
  const query = useEnvironmentQuery(
    environmentId && scopeReady ? tradingStateQuery({ environmentId, input: scope }) : null,
  );
  const data = query.data;
  const append = useTradingAppend();
  const [form, setForm] = useState<FormKind | null>(null);

  if (data === null || data === undefined) {
    return (
      <RailWindow title="Accounts">
        {query.error ? (
          <p role="alert" className="p-6 text-sm text-muted-foreground">
            The Accounts tab could not read your ledger. Check that this is a Trading workspace.
          </p>
        ) : (
          <div className="grid flex-1 place-items-center p-6">
            <Spinner size="sm" aria-label="Loading your accounts" />
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
  if (data.state.accounts.length === 0) {
    return (
      <>
        <TradingEmpty
          title="Accounts"
          line="Each Evaluation and Funded account shows here, with its Attempts."
          action={{ label: "Add account", onClick: () => setForm("account") }}
          actions={add}
        />
        {forms}
      </>
    );
  }
  return (
    <>
      <RailWindow title="Accounts" actions={add}>
        <AccountsView state={data.state} />
      </RailWindow>
      {forms}
    </>
  );
}

export const Route = createFileRoute("/_chat/trading/accounts")({ component: TradingAccounts });
