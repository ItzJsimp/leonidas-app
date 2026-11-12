import { createFileRoute } from "@tanstack/react-router";

import { LibraryView } from "../components/trading/LibraryView";
import { RailWindow } from "../components/twoState/RailWindow";
import { Spinner } from "../components/ui/spinner";
import { useActiveAiosWorkspace } from "../components/workspace/useActiveAiosWorkspace";
import { useEnvironmentQuery } from "../state/query";
import { tradingLibraryIndexQuery } from "../state/trading";

function TradingLibrary() {
  const { environmentId, scope, scopeReady } = useActiveAiosWorkspace();
  const query = useEnvironmentQuery(
    environmentId && scopeReady ? tradingLibraryIndexQuery({ environmentId, input: scope }) : null,
  );
  const data = query.data;

  if (data === null || data === undefined || !environmentId) {
    return (
      <RailWindow title="Library">
        {query.error ? (
          <p role="alert" className="p-6 text-sm text-muted-foreground">
            The Library could not read your course. Check that this is a Trading workspace.
          </p>
        ) : (
          <div className="grid flex-1 place-items-center p-6">
            <Spinner size="sm" aria-label="Loading your Library" />
          </div>
        )}
      </RailWindow>
    );
  }
  return <LibraryView environmentId={environmentId} scope={scope} index={data} />;
}

export const Route = createFileRoute("/_chat/trading/library")({ component: TradingLibrary });
