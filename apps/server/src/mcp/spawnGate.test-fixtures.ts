import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import * as SubagentRuns from "../subagents/SubagentRuns.ts";
import * as UsageService from "../usage/UsageService.ts";

/**
 * The two services the spawn gate reads (ADR-0098): a top-level chat with no live children, no
 * spend today and no price table. Suites that build the orchestrator layer provide these.
 */
export const spawnGateServices = Layer.mergeAll(
  Layer.mock(SubagentRuns.SubagentRuns)({
    spawnContext: () => Effect.succeed({ depth: 0, runningChildren: 0, spendUsd: 0 }),
  }),
  Layer.mock(UsageService.UsageService)({ rateFor: () => Effect.succeed(null) }),
);
