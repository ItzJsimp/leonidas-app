import {
  createEnvironmentRpcCommand,
  createEnvironmentRpcQueryAtomFamily,
} from "@t3tools/client-runtime/state/runtime";
import { WS_METHODS } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import { connectionAtomRuntime } from "../connection/runtime";

/** Game Mode on this machine. The server refuses it without `game-mode:control`. */
export const gameModeStatusQuery = createEnvironmentRpcQueryAtomFamily(connectionAtomRuntime, {
  label: "environment-data:game-mode:status",
  tag: WS_METHODS.gameModeStatus,
  staleTimeMs: 5_000,
  idleTtlMs: 5 * 60_000,
});

/** Sets the mode or the virtual display, then reads the status again. */
export const gameModeRun = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "environment-data:game-mode:run",
  tag: WS_METHODS.gameModeRun,
  onSuccess: ({ environmentId }, registry) =>
    Effect.sync(() => registry.refresh(gameModeStatusQuery({ environmentId, input: {} }))),
});
