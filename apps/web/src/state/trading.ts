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

/** TopstepX exports in Downloads that are not imported yet. Polls while a Trading tab is open. */
export const tradingImportsQuery = createEnvironmentRpcQueryAtomFamily(connectionAtomRuntime, {
  label: "environment-data:trading:imports",
  tag: WS_METHODS.tradingImports,
  staleTimeMs: 2_000,
  idleTtlMs: 10_000,
  refreshIntervalMs: 3_000,
});

/** Imports one export into one account, then reads the state and the import list again. */
export const tradingImport = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "environment-data:trading:import",
  tag: WS_METHODS.tradingImport,
  onSuccess: ({ environmentId, input }, registry) =>
    Effect.sync(() => {
      const scope = workspaceScopeInput(input.workspaceId);
      registry.refresh(tradingStateQuery({ environmentId, input: scope }));
      registry.refresh(tradingImportsQuery({ environmentId, input: scope }));
    }),
});

/** Saves the trader's answer for the pack's check module, then reads the state again. */
export const tradingPackConsent = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "environment-data:trading:pack-consent",
  tag: WS_METHODS.tradingPackConsent,
  onSuccess: ({ environmentId, input }, registry) =>
    Effect.sync(() =>
      registry.refresh(
        tradingStateQuery({ environmentId, input: workspaceScopeInput(input.workspaceId) }),
      ),
    ),
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
