import { createFileRoute } from "@tanstack/react-router";

import { CrewBoard, CrewSetup } from "../components/trading/CrewView";
import { RailWindow } from "../components/twoState/RailWindow";
import { Spinner } from "../components/ui/spinner";
import { useActiveAiosWorkspace } from "../components/workspace/useActiveAiosWorkspace";
import { useEnvironmentQuery } from "../state/query";
import { tradingCrewQuery, tradingStateQuery } from "../state/trading";

function TradingCrew() {
  const { environmentId, scope, scopeReady } = useActiveAiosWorkspace();
  const ready = Boolean(environmentId && scopeReady);
  const crew = useEnvironmentQuery(
    environmentId && ready ? tradingCrewQuery({ environmentId, input: scope }) : null,
  );
  const state = useEnvironmentQuery(
    environmentId && ready ? tradingStateQuery({ environmentId, input: scope }) : null,
  );
  const result = crew.data;
  const settings = state.data?.settings;

  if (result === null || result === undefined || settings === undefined) {
    return (
      <RailWindow title="Crew">
        {crew.error ? (
          <p role="alert" className="p-6 text-sm text-muted-foreground">
            The Crew tab could not read your Crew. Check that this is a Trading workspace.
          </p>
        ) : (
          <div className="grid flex-1 place-items-center p-6">
            <Spinner size="sm" aria-label="Loading your Crew" />
          </div>
        )}
      </RailWindow>
    );
  }
  return (
    <RailWindow title="Crew">
      {result.setup === "on" ? (
        <CrewBoard result={result} share={settings.share} nowMs={Date.now()} />
      ) : (
        <div className="flex flex-col gap-3 p-4">
          <p className="text-sm text-muted-foreground">
            Your Crew board shows each friend's stage, Pass rate and streaks. Join to share yours.
          </p>
          <CrewSetup
            result={result}
            initialName={settings.traderName}
            initialShare={settings.share}
          />
        </div>
      )}
    </RailWindow>
  );
}

export const Route = createFileRoute("/_chat/trading/crew")({ component: TradingCrew });
