import { createFileRoute } from "@tanstack/react-router";

import { ImportPrompt } from "../components/trading/ImportPrompt";
import { ExportGuide, JournalView } from "../components/trading/JournalView";
import { RailWindow } from "../components/twoState/RailWindow";
import { Button } from "../components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader } from "../components/ui/empty";
import { Spinner } from "../components/ui/spinner";
import { useActiveAiosWorkspace } from "../components/workspace/useActiveAiosWorkspace";
import { useEnvironmentQuery } from "../state/query";
import { tradingStateQuery } from "../state/trading";

function TradingJournal() {
  const { environmentId, scope, scopeReady } = useActiveAiosWorkspace();
  const query = useEnvironmentQuery(
    environmentId && scopeReady ? tradingStateQuery({ environmentId, input: scope }) : null,
  );
  const data = query.data;

  if (data === null || data === undefined || !environmentId) {
    return (
      <RailWindow title="Journal">
        {query.error ? (
          <p role="alert" className="p-6 text-sm text-muted-foreground">
            The Journal could not read your trades. Check that this is a Trading workspace.
          </p>
        ) : (
          <div className="grid flex-1 place-items-center p-6">
            <Spinner size="sm" aria-label="Loading your trades" />
          </div>
        )}
      </RailWindow>
    );
  }
  return (
    <RailWindow title="Journal">
      <div className="flex flex-col gap-4 p-4">
        <ImportPrompt environmentId={environmentId} scope={scope} accounts={data.state.accounts} />
        {data.trades.length === 0 ? (
          <Empty size="compact">
            <EmptyHeader>
              <EmptyDescription>
                Export your trades from TopstepX. They show here with no other step.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <ExportGuide className="text-start" />
              <Button
                variant="outline"
                render={<a href="https://topstepx.com" target="_blank" rel="noreferrer" />}
              >
                Open TopstepX
              </Button>
            </EmptyContent>
          </Empty>
        ) : (
          <JournalView trades={data.trades} accounts={data.state.accounts} />
        )}
      </div>
    </RailWindow>
  );
}

export const Route = createFileRoute("/_chat/trading/journal")({ component: TradingJournal });
