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

/** Saves the monthly fee cap, then reads the state again so the cap bar updates at once. */
export const tradingSettingsSave = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "environment-data:trading:settings-save",
  tag: WS_METHODS.tradingSettingsSave,
  onSuccess: ({ environmentId, input }, registry) =>
    Effect.sync(() => {
      const scope = workspaceScopeInput(input.workspaceId);
      registry.refresh(tradingStateQuery({ environmentId, input: scope }));
      registry.refresh(tradingCrewQuery({ environmentId, input: scope }));
    }),
});

/** The Crew board from the last sync, read from the local clone. The server syncs every 3 minutes. */
export const tradingCrewQuery = createEnvironmentRpcQueryAtomFamily(connectionAtomRuntime, {
  label: "environment-data:trading:crew",
  tag: WS_METHODS.tradingCrew,
  staleTimeMs: 10_000,
  idleTtlMs: 60_000,
  refreshIntervalMs: 30_000,
});

/** Syncs the Crew now. The Retry action and Sync now call this, then read the board again. */
export const tradingCrewSync = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "environment-data:trading:crew-sync",
  tag: WS_METHODS.tradingCrewSync,
  onSuccess: ({ environmentId, input }, registry) =>
    Effect.sync(() =>
      registry.refresh(
        tradingCrewQuery({ environmentId, input: workspaceScopeInput(input.workspaceId) }),
      ),
    ),
});

/** The end-of-day note of one day. Reads an empty note for a day with no file yet. */
export const tradingDayQuery = createEnvironmentRpcQueryAtomFamily(connectionAtomRuntime, {
  label: "environment-data:trading:day",
  tag: WS_METHODS.tradingDayRead,
  staleTimeMs: 5_000,
  idleTtlMs: 60_000,
});

/** The Library of the linked pack: course, pages, firms, cards and quiz. */
export const tradingLibraryIndexQuery = createEnvironmentRpcQueryAtomFamily(connectionAtomRuntime, {
  label: "environment-data:trading:library-index",
  tag: WS_METHODS.tradingLibraryIndex,
  staleTimeMs: 30_000,
  idleTtlMs: 60_000,
});

/** One search over the Library. Runs only while the trader types a search. */
export const tradingLibrarySearchQuery = createEnvironmentRpcQueryAtomFamily(
  connectionAtomRuntime,
  {
    label: "environment-data:trading:library-search",
    tag: WS_METHODS.tradingLibrarySearch,
    staleTimeMs: 10_000,
    idleTtlMs: 30_000,
  },
);

/** One lesson transcript, knowledge page or firm page. */
export const tradingLibraryPageQuery = createEnvironmentRpcQueryAtomFamily(connectionAtomRuntime, {
  label: "environment-data:trading:library-page",
  tag: WS_METHODS.tradingLibraryPage,
  staleTimeMs: 60_000,
  idleTtlMs: 60_000,
});

/** The saved resources, private and Crew, newest first. */
export const tradingResourceListQuery = createEnvironmentRpcQueryAtomFamily(connectionAtomRuntime, {
  label: "environment-data:trading:resource-list",
  tag: WS_METHODS.tradingResourceList,
  staleTimeMs: 5_000,
  idleTtlMs: 60_000,
});

/** Saves the end-of-day note of one day, then reads that day's note again. */
export const tradingDaySave = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "environment-data:trading:day-save",
  tag: WS_METHODS.tradingDaySave,
  onSuccess: ({ environmentId, input }, registry) =>
    Effect.sync(() =>
      registry.refresh(
        tradingDayQuery({
          environmentId,
          input: { ...workspaceScopeInput(input.workspaceId), day: input.day },
        }),
      ),
    ),
});

/** One saved screenshot as base64, for a thumbnail. Screenshots never change, so they stay cached. */
export const tradingScreenshotQuery = createEnvironmentRpcQueryAtomFamily(connectionAtomRuntime, {
  label: "environment-data:trading:screenshot",
  tag: WS_METHODS.tradingScreenshotRead,
  staleTimeMs: 600_000,
  idleTtlMs: 60_000,
});

/** Saves a pasted image, then reads the state so a tagged trade shows its thumbnail. */
export const tradingScreenshotSave = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "environment-data:trading:screenshot-save",
  tag: WS_METHODS.tradingScreenshotSave,
  onSuccess: ({ environmentId, input }, registry) =>
    Effect.sync(() =>
      registry.refresh(
        tradingStateQuery({ environmentId, input: workspaceScopeInput(input.workspaceId) }),
      ),
    ),
});

/** Adds one manual trade, then reads the state so the Journal and Dashboard update at once. */
export const tradingTradeAdd = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "environment-data:trading:trade-add",
  tag: WS_METHODS.tradingTradeAdd,
  onSuccess: ({ environmentId, input }, registry) =>
    Effect.sync(() =>
      registry.refresh(
        tradingStateQuery({ environmentId, input: workspaceScopeInput(input.workspaceId) }),
      ),
    ),
});

/** The linked pack's risk states, firm limits and first day rule. `none` without a valid pack. */
export const tradingRiskRulesQuery = createEnvironmentRpcQueryAtomFamily(connectionAtomRuntime, {
  label: "environment-data:trading:risk-rules",
  tag: WS_METHODS.tradingRiskRules,
  staleTimeMs: 5_000,
  idleTtlMs: 60_000,
});

/** Saves one resource, then reads the saved list again. */
export const tradingResourceSave = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "environment-data:trading:resource-save",
  tag: WS_METHODS.tradingResourceSave,
  onSuccess: ({ environmentId, input }, registry) =>
    Effect.sync(() =>
      registry.refresh(
        tradingResourceListQuery({ environmentId, input: workspaceScopeInput(input.workspaceId) }),
      ),
    ),
});
