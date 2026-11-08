import { OrchestratorMcpFailure } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Clock from "effect/Clock";
import { readMemory, searchMemory } from "#server/aiosMemory/aiosMemory.ts";
import * as ProviderRegistry from "#server/provider/ProviderRegistry.ts";
import { readReleaseStatus } from "#server/releaseStatus/releaseStatus.ts";
import * as Settings from "#server/serverSettings.ts";
import { usageStatus } from "#server/usage/usageStatus.ts";
import * as McpToolAccess from "../../McpToolAccess.ts";
import { workspaceRoot } from "../marketing/handlers.ts";
import { InsightToolkit } from "./tools.ts";

const failed = (message: string) =>
  new OrchestratorMcpFailure({ code: "orchestration_error", message });

export const layer = McpToolAccess.toLayer(InsightToolkit, {
  leo_aios_memory_search: McpToolAccess.reads(({ query, limit }) =>
    Effect.gen(function* () {
      const root = yield* workspaceRoot;
      const hits = yield* Effect.try({
        try: () => searchMemory(root, query, limit ?? 5),
        catch: (error) => failed(`Memory search failed: ${String(error)}`),
      });
      return { indexBuilt: hits !== null, hits: hits ?? [] };
    }),
  ),
  leo_aios_memory_read: McpToolAccess.reads(({ path }) =>
    Effect.gen(function* () {
      const root = yield* workspaceRoot;
      const entry = yield* Effect.try({
        try: () => readMemory(root, path),
        catch: (error) => failed(`Memory read failed: ${String(error)}`),
      });
      if (entry === "not_built")
        return yield* new OrchestratorMcpFailure({
          code: "invalid_request",
          message:
            "This AIOS has no memory index yet. Build it with scripts/Build-LeonidasMemoryIndex.py.",
        });
      if (entry === null)
        return yield* new OrchestratorMcpFailure({
          code: "invalid_request",
          message: `No indexed memory at ${path}. Use the exact path from leo_aios_memory_search.`,
        });
      return entry;
    }),
  ),
  leo_usage_status: McpToolAccess.reads(() =>
    Effect.gen(function* () {
      const registry = yield* ProviderRegistry.ProviderRegistry;
      const settings = yield* Settings.ServerSettingsService;
      const providers = yield* registry.getProviders;
      const { subagentQuotaBlockPercent } = yield* settings.getSettings.pipe(
        Effect.mapError((error) => failed(`Settings unavailable: ${error.message}`)),
      );
      const nowMs = yield* Clock.currentTimeMillis;
      return {
        nearLimitPercent: subagentQuotaBlockPercent,
        accounts: usageStatus(providers, nowMs, subagentQuotaBlockPercent),
      };
    }),
  ),
  leo_release_status: McpToolAccess.reads(() => Effect.promise(() => readReleaseStatus())),
});
