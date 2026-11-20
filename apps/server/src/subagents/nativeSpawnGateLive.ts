/** The live native spawn gate: it reads settings, run history and prices, then asks the card. */
import type {
  OrchestratorMcpFailure,
  ServerSettingsError,
  SubagentRunsError,
} from "@t3tools/contracts";
import * as Clock from "effect/Clock";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import * as ServerSettings from "../serverSettings.ts";
import * as UsageService from "../usage/UsageService.ts";
import { confirmDelegatedSpawn } from "./confirmPersonaSpawn.ts";
import {
  NativeSpawnGate,
  type NativeSpawnRequest,
  type NativeSpawnVerdict,
} from "./nativeSpawnGate.ts";
import * as SubagentRuns from "./SubagentRuns.ts";

export const make = Effect.gen(function* () {
  const serverSettings = yield* ServerSettings.ServerSettingsService;
  const subagentRuns = yield* SubagentRuns.SubagentRuns;
  const usageService = yield* UsageService.UsageService;

  const check = Effect.fn("NativeSpawnGate.check")(function* (
    request: NativeSpawnRequest,
  ): Effect.fn.Return<
    NativeSpawnVerdict,
    ServerSettingsError | SubagentRunsError | OrchestratorMcpFailure
  > {
    const settings = yield* serverSettings.getSettings;
    const dayStart = DateTime.startOf(
      DateTime.makeZonedUnsafe(yield* Clock.currentTimeMillis, {
        timeZone: DateTime.zoneMakeLocal(),
      }),
      "day",
    );
    const facts = yield* subagentRuns.spawnContext(
      {
        threadId: request.threadId,
        account: request.instanceId,
        sinceIso: DateTime.formatIso(DateTime.toUtc(dayStart)),
      },
      usageService.rateFor,
    );
    const rate =
      usageService.rateFor === undefined ? null : yield* usageService.rateFor(request.model);
    yield* confirmDelegatedSpawn({
      parent: { thread: { id: request.threadId, title: request.threadTitle } },
      cwd: request.cwd,
      task: request.task,
      model: request.model,
      account: request.account,
      reason: request.reason,
      appFreeModels: settings.subagentFreeTierModels,
      // One card for one tool call: the same id joins a retry of the same call.
      approvalId: `spawn:${request.threadId}:native:${request.toolUseId}`,
      label: request.label,
      untilAnswered: true,
      gate: {
        // A native subagent is one level below the chat that runs it.
        callerDepth: facts.depth + (request.callerIsSubagent ? 1 : 0),
        callerCanSpawn: facts.callerCanSpawn && !request.callerIsSubagent,
        runningChildren: facts.runningChildren,
        todaySpendUsd: facts.spendUsd,
        dailyCapUsd: settings.subagentDailyCapUsd,
        rate,
      },
    });
    return { allow: true };
  });

  return NativeSpawnGate.of({
    check: (request) =>
      check(request).pipe(
        Effect.catch((error) =>
          Effect.succeed<NativeSpawnVerdict>({
            allow: false,
            message: `No subagent started. ${error.message}`,
          }),
        ),
      ),
  });
});

export const layer = Layer.effect(NativeSpawnGate, make);
