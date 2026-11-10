import { createFileRoute } from "@tanstack/react-router";

import { RailWindow } from "../components/twoState/RailWindow";
import { DashboardView } from "../components/trading/DashboardView";
import { isEmptyLedger } from "../components/trading/dashboard.logic";
import { TradingEmpty } from "../components/trading/TradingEmpty";
import { useActiveAiosWorkspace } from "../components/workspace/useActiveAiosWorkspace";
import { Spinner } from "../components/ui/spinner";
import { useEnvironmentQuery } from "../state/query";
import { tradingStateQuery } from "../state/trading";

function TradingDashboard() {
  const { environmentId, scope, scopeReady } = useActiveAiosWorkspace();
  const query = useEnvironmentQuery(
    environmentId && scopeReady ? tradingStateQuery({ environmentId, input: scope }) : null,
  );
  const data = query.data;

  if (data === null || data === undefined) {
    return (
      <RailWindow title="Dashboard">
        {query.error ? (
          <p role="alert" className="p-6 text-sm text-muted-foreground">
            The Dashboard could not read your ledger. Check that this is a Trading workspace.
          </p>
        ) : (
          <div className="grid flex-1 place-items-center p-6">
            <Spinner size="sm" aria-label="Loading your ledger" />
          </div>
        )}
      </RailWindow>
    );
  }
  if (isEmptyLedger(data.state)) {
    return (
      <TradingEmpty
        title="Dashboard"
        line="Your Evaluations, Payouts and Total cost show here once you add an account."
        action={{ label: "Add account", to: "/trading/accounts" }}
      />
    );
  }
  return (
    <RailWindow title="Dashboard">
      <DashboardView state={data.state} />
    </RailWindow>
  );
}

export const Route = createFileRoute("/_chat/trading/dashboard")({ component: TradingDashboard });
