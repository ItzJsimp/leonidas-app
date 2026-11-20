import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { NativeSpawnGate } from "./nativeSpawnGate.ts";

/**
 * A native spawn gate that allows every spawn. For suites that build a Claude driver or the
 * full orchestrator layer and do not test the gate (ADR-0098); the gate has its own tests.
 */
export const nativeSpawnGateAllowAll = Layer.succeed(
  NativeSpawnGate,
  NativeSpawnGate.of({ check: () => Effect.succeed({ allow: true }) }),
);
