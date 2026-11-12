/** The live creator draft: it reads settings, accounts, run history and prices, then calls the model. */
import { SubagentEditError, TextGenerationError } from "@t3tools/contracts";
import * as Clock from "effect/Clock";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";

import * as ProviderRegistry from "../provider/ProviderRegistry.ts";
import * as ServerSettings from "../serverSettings.ts";
import * as TextGeneration from "../textGeneration/TextGeneration.ts";
import * as UsageService from "../usage/UsageService.ts";
import * as SubagentRuns from "./SubagentRuns.ts";
import { makeDraft } from "./subagentDraft.ts";
import type { AiosModelTiers } from "./spawnTiers.ts";

/** A thread id no chat has, so the spend read counts no parent. */
const CREATOR_THREAD = "subagent-creator";

export const make = (options: {
  readonly cwd: string;
  readonly aiosTiers: Effect.Effect<AiosModelTiers | null>;
}) =>
  Effect.gen(function* () {
    const registry = yield* ProviderRegistry.ProviderRegistry;
    const serverSettings = yield* ServerSettings.ServerSettingsService;
    const subagentRuns = yield* SubagentRuns.SubagentRuns;
    const usageService = yield* UsageService.UsageService;
    const textGeneration = yield* TextGeneration.TextGeneration;
    const settings = serverSettings.getSettings.pipe(Effect.orDie);

    return makeDraft({
      cwd: options.cwd,
      providers: registry.getProviders,
      preferredInstanceId: settings.pipe(
        Effect.map((value) => value.textGenerationModelSelection.instanceId),
      ),
      appFreeModels: settings.pipe(Effect.map((value) => value.subagentFreeTierModels)),
      dailyCapUsd: settings.pipe(Effect.map((value) => value.subagentDailyCapUsd)),
      aiosTiers: options.aiosTiers,
      spendToday: (account) =>
        Effect.gen(function* () {
          const dayStart = DateTime.startOf(
            DateTime.makeZonedUnsafe(yield* Clock.currentTimeMillis, {
              timeZone: DateTime.zoneMakeLocal(),
            }),
            "day",
          );
          const facts = yield* subagentRuns.spawnContext(
            {
              threadId: CREATOR_THREAD,
              account,
              sinceIso: DateTime.formatIso(DateTime.toUtc(dayStart)),
            },
            usageService.rateFor,
          );
          return facts.spendUsd;
        }).pipe(
          Effect.mapError(
            () => new SubagentEditError({ message: "Unable to read today's subagent spend." }),
          ),
        ),
      rate: (model) =>
        usageService.rateFor === undefined ? Effect.succeed(null) : usageService.rateFor(model),
      generate: (input) =>
        textGeneration.draftAgent
          ? textGeneration.draftAgent(input)
          : Effect.fail(
              new TextGenerationError({
                operation: "draftAgent",
                detail: "This build cannot draft an agent.",
              }),
            ),
    });
  });
