import { createFileRoute } from "@tanstack/react-router";

import { PackNotice } from "../components/trading/PackNotice";
import { RiskView } from "../components/trading/RiskView";
import { RailWindow } from "../components/twoState/RailWindow";
import { Spinner } from "../components/ui/spinner";
import { useActiveAiosWorkspace } from "../components/workspace/useActiveAiosWorkspace";
import { useEnvironmentQuery } from "../state/query";
import { tradingRiskRulesQuery, tradingStateQuery } from "../state/trading";

function TradingRisk() {
  const { environmentId, scope, scopeReady } = useActiveAiosWorkspace();
  const ready = environmentId && scopeReady;
  const state = useEnvironmentQuery(
    ready ? tradingStateQuery({ environmentId, input: scope }) : null,
  );
  const rules = useEnvironmentQuery(
    ready ? tradingRiskRulesQuery({ environmentId, input: scope }) : null,
  );
  const data = state.data;
  const rulesLoading = rules.data === undefined && !rules.error;

  if (data === null || data === undefined || rulesLoading || !environmentId) {
    return (
      <RailWindow title="Risk">
        {state.error ? (
          <p role="alert" className="p-6 text-sm text-muted-foreground">
            The Risk tab could not read your accounts. Check that this is a Trading workspace.
          </p>
        ) : (
          <div className="grid flex-1 place-items-center p-6">
            <Spinner size="sm" aria-label="Loading your accounts" />
          </div>
        )}
      </RailWindow>
    );
  }
  const linked = rules.data?.status === "ready" ? rules.data : null;
  return (
    <RailWindow title="Risk">
      <div className="flex flex-col gap-4 p-4">
        <PackNotice environmentId={environmentId} scope={scope} pack={data.pack} />
        <RiskView accounts={data.state.accounts} rules={linked} />
      </div>
    </RailWindow>
  );
}

export const Route = createFileRoute("/_chat/trading/risk")({ component: TradingRisk });
