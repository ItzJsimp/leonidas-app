import type { ServerProvider } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Semaphore from "effect/Semaphore";

/** One automatic attempt per outage. A verified recovery permits a later attempt. */
export const makeClaudeAutomaticRepair = Effect.fn("makeClaudeAutomaticRepair")(function* <E>(
  start: Effect.Effect<unknown, E>,
) {
  const gate = yield* Semaphore.make(1);
  let attempted = false;
  return (
    providers: ReadonlyArray<ServerProvider>,
    entries: Readonly<Record<string, { readonly config?: unknown }>>,
  ) =>
    gate.withPermit(
      Effect.gen(function* () {
        const eligible = providers.filter((provider) => {
          if (!entries[provider.instanceId]) return false;
          const config = entries[provider.instanceId]?.config;
          const binary =
            config && typeof config === "object" && "binaryPath" in config
              ? config.binaryPath
              : "claude";
          return (
            provider.driver === "claudeAgent" &&
            provider.enabled &&
            (binary === undefined ||
              binary === "" ||
              binary === "claude" ||
              binary === "claude.exe")
          );
        });
        const missing = eligible.some(
          (provider) =>
            !provider.installed &&
            provider.status === "error" &&
            provider.message?.includes("was not found on PATH"),
        );
        if (!missing) {
          if (eligible.length && eligible.every((provider) => provider.installed))
            attempted = false;
          return;
        }
        if (attempted) return;
        attempted = true;
        yield* start;
      }),
    );
});
