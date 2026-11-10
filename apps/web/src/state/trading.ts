import { createEnvironmentRpcQueryAtomFamily } from "@t3tools/client-runtime/state/runtime";
import { WS_METHODS } from "@t3tools/contracts";

import { connectionAtomRuntime } from "../connection/runtime";

/** The derived Trading state (accounts, Attempts, money, streaks) of one Trading workspace. */
export const tradingStateQuery = createEnvironmentRpcQueryAtomFamily(connectionAtomRuntime, {
  label: "environment-data:trading:state",
  tag: WS_METHODS.tradingState,
  staleTimeMs: 5_000,
  idleTtlMs: 60_000,
});
