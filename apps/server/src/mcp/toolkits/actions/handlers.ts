import { OrchestratorMcpFailure } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as LocalModelsService from "#server/localModels/LocalModelsService.ts";
import * as ScribeEngine from "#server/scribe/ScribeEngine.ts";
import { addReplacement } from "#server/scribe/scribeSummary.ts";
import * as McpToolAccess from "../../McpToolAccess.ts";
import { ActionToolkit } from "./tools.ts";

const failure = (code: "invalid_request" | "orchestration_error", message: string) =>
  new OrchestratorMcpFailure({ code, message });

export const layer = McpToolAccess.toLayer(ActionToolkit, {
  leo_scribe_dictionary_add: McpToolAccess.writes(({ heard, meant }) =>
    Effect.gen(function* () {
      const engine = yield* ScribeEngine.ScribeEngine;
      const unavailable = (error: { readonly message: string }) =>
        failure("orchestration_error", `Scribe is not available: ${error.message}`);
      const dictionary = yield* engine.getDictionary.pipe(Effect.mapError(unavailable));
      const result = addReplacement(dictionary, heard, meant);
      if (result.status === "invalid") return yield* failure("invalid_request", result.message);
      if (result.status === "exists") return { added: false, correct: result.correct };
      // shortcut: read then write, so two adds at the same moment can lose one. Use an engine append call if that matters.
      yield* engine.putDictionary(result.dictionary).pipe(Effect.mapError(unavailable));
      yield* Effect.logInfo("leo_scribe_dictionary_add", {
        heard: heard.trim(),
        meant: meant.trim(),
      });
      return { added: true, correct: meant.trim() };
    }),
  ),
  leo_local_models_run: McpToolAccess.writes(({ model, prompt }) =>
    Effect.gen(function* () {
      const models = yield* LocalModelsService.LocalModelsService;
      return yield* models
        .answer({ model, prompt })
        .pipe(
          Effect.mapError((error) =>
            error.reason === "not_found"
              ? failure(
                  "invalid_request",
                  `${model} is not installed. Use leo_local_models_advice for an installed model.`,
                )
              : failure("orchestration_error", `Local model failed: ${error.reason}`),
          ),
        );
    }),
  ),
});
