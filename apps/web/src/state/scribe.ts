import {
  createEnvironmentRpcCommand,
  createEnvironmentRpcQueryAtomFamily,
  createEnvironmentRpcSubscriptionAtomFamily,
} from "@t3tools/client-runtime/state/runtime";
import { WS_METHODS } from "@t3tools/contracts";
import * as Stream from "effect/Stream";

import { INITIAL_SCRIBE_LIVE, reduceScribeLive } from "../components/scribe/scribeLive.logic";
import { connectionAtomRuntime } from "../connection/runtime";

/** The live Scribe snapshot. Events are folded on the client, so a burst never drops one. */
export const scribeLive = createEnvironmentRpcSubscriptionAtomFamily(connectionAtomRuntime, {
  label: "environment-data:scribe:live",
  tag: WS_METHODS.scribeSubscribeEvents,
  transform: (stream) => stream.pipe(Stream.scan(() => INITIAL_SCRIBE_LIVE, reduceScribeLive)),
});

export const scribeHistoryQuery = createEnvironmentRpcQueryAtomFamily(connectionAtomRuntime, {
  label: "environment-data:scribe:history",
  tag: WS_METHODS.scribeListHistory,
  staleTimeMs: 30_000,
  idleTtlMs: 5 * 60_000,
});

/** Goals and insights are computed from history, so a short cache keeps tab switches cheap. */
export const scribeGoalsQuery = createEnvironmentRpcQueryAtomFamily(connectionAtomRuntime, {
  label: "environment-data:scribe:goals",
  tag: WS_METHODS.scribeGetGoals,
  staleTimeMs: 30_000,
  idleTtlMs: 5 * 60_000,
});

export const scribeInsightsQuery = createEnvironmentRpcQueryAtomFamily(connectionAtomRuntime, {
  label: "environment-data:scribe:insights",
  tag: WS_METHODS.scribeGetInsights,
  staleTimeMs: 30_000,
  idleTtlMs: 5 * 60_000,
});

export const scribeStart = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "environment-data:scribe:start",
  tag: WS_METHODS.scribeStart,
});

export const scribeStop = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "environment-data:scribe:stop",
  tag: WS_METHODS.scribeStop,
});

export const scribeRetry = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "environment-data:scribe:retry",
  tag: WS_METHODS.scribeRetry,
});

/** One page of history, read on demand (the Transcripts tab pages by cursor and searches loaded pages). */
export const scribeListHistoryPage = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "environment-data:scribe:history-page",
  tag: WS_METHODS.scribeListHistory,
});

export const scribeDeleteHistory = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "environment-data:scribe:delete-history",
  tag: WS_METHODS.scribeDeleteHistory,
});

/** The word list is edited here, so it is always read fresh when the tab opens. */
export const scribeDictionaryQuery = createEnvironmentRpcQueryAtomFamily(connectionAtomRuntime, {
  label: "environment-data:scribe:dictionary",
  tag: WS_METHODS.scribeGetDictionary,
  staleTimeMs: 0,
  idleTtlMs: 60_000,
});

export const scribeSuggestionsQuery = createEnvironmentRpcQueryAtomFamily(connectionAtomRuntime, {
  label: "environment-data:scribe:suggestions",
  tag: WS_METHODS.scribeListSuggestions,
  staleTimeMs: 0,
  idleTtlMs: 60_000,
});

export const scribePutDictionary = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "environment-data:scribe:put-dictionary",
  tag: WS_METHODS.scribePutDictionary,
});

export const scribeRejectSuggestion = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "environment-data:scribe:reject-suggestion",
  tag: WS_METHODS.scribeRejectSuggestion,
});

/** Settings are edited on the page, so they are always read fresh when the tab opens. */
export const scribeSettingsQuery = createEnvironmentRpcQueryAtomFamily(connectionAtomRuntime, {
  label: "environment-data:scribe:settings",
  tag: WS_METHODS.scribeGetSettings,
  staleTimeMs: 0,
  idleTtlMs: 60_000,
});

export const scribeDevicesQuery = createEnvironmentRpcQueryAtomFamily(connectionAtomRuntime, {
  label: "environment-data:scribe:devices",
  tag: WS_METHODS.scribeListDevices,
  staleTimeMs: 0,
  idleTtlMs: 60_000,
});

export const scribePatchSettings = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "environment-data:scribe:patch-settings",
  tag: WS_METHODS.scribePatchSettings,
});

export const scribeGetGroqKey = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "environment-data:scribe:get-groq-key",
  tag: WS_METHODS.scribeGetGroqKey,
});

export const scribeSetGroqKey = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "environment-data:scribe:set-groq-key",
  tag: WS_METHODS.scribeSetGroqKey,
});

export const scribeClearGroqKey = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "environment-data:scribe:clear-groq-key",
  tag: WS_METHODS.scribeClearGroqKey,
});
