import {
  createEnvironmentRpcCommand,
  createEnvironmentRpcQueryAtomFamily,
} from "@t3tools/client-runtime/state/runtime";
import { WS_METHODS } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import { workspaceScopeInput } from "../components/workspace/aiosWorkspace.logic";
import { connectionAtomRuntime } from "../connection/runtime";

/** The derived Trading state (accounts, Attempts, money, streaks) of one Trading workspace. */
export const tradingStateQuery = createEnvironmentRpcQueryAtomFamily(connectionAtomRuntime, {
  label: "environment-data:trading:state",
  tag: WS_METHODS.tradingState,
  staleTimeMs: 5_000,
  idleTtlMs: 60_000,
});

/** Adds 1 to 3 events to the ledger, then refreshes the state so the Dashboard updates at once. */
export const tradingAppend = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "environment-data:trading:append",
  tag: WS_METHODS.tradingAppend,
  onSuccess: ({ environmentId, input }, registry) =>
    Effect.sync(() =>
      registry.refresh(
        tradingStateQuery({ environmentId, input: workspaceScopeInput(input.workspaceId) }),
      ),
    ),
});
