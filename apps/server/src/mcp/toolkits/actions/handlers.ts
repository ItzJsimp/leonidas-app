import { OrchestratorMcpFailure } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as GitWorkflowService from "#server/git/GitWorkflowService.ts";
import { gitActionRefusal } from "#server/git/gitActionGuard.ts";
import { linkCreatedPullRequest } from "#server/git/linkCreatedPullRequest.ts";
import * as LocalModelsService from "#server/localModels/LocalModelsService.ts";
import { isRepositoryPath } from "#server/review/reviewDiffLimits.ts";
import * as ScribeEngine from "#server/scribe/ScribeEngine.ts";
import { addReplacement } from "#server/scribe/scribeSummary.ts";
import * as McpToolAccess from "../../McpToolAccess.ts";
import { assertFullAccess, newCommandId, readThread } from "../../threadAccess.ts";
import { ActionToolkit } from "./tools.ts";

const failure = (
  code: "invalid_request" | "orchestration_error" | "capability_denied",
  message: string,
) => new OrchestratorMcpFailure({ code, message });

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
  leo_git_stacked_action: McpToolAccess.actsAsCaller(({ action, commitMessage, filePaths }) =>
    Effect.gen(function* () {
      const bad = filePaths?.find((path) => !isRepositoryPath(path));
      if (bad !== undefined)
        return yield* failure("invalid_request", `Path must stay inside the repository: ${bad}`);
      // No threadId input: the target is always the caller's own thread.
      const { projection, ...context } = yield* readThread(undefined);
      yield* assertFullAccess(context, "This tool needs a full-access thread in default mode.");
      const { thread } = projection;
      const git = yield* GitWorkflowService.GitWorkflowService;
      const cwd = thread.worktreePath;
      const status =
        cwd === null
          ? null
          : yield* git
              .localStatus({ cwd })
              .pipe(
                Effect.mapError((error) =>
                  failure("orchestration_error", `Git status failed: ${error.message}`),
                ),
              );
      const refusal = gitActionRefusal({
        worktreePath: cwd,
        threadBranch: thread.branch,
        isRepo: status?.isRepo ?? false,
        currentBranch: status?.refName ?? null,
        isDefaultBranch: status?.isDefaultRef ?? false,
      });
      if (refusal !== null || cwd === null)
        return yield* failure("capability_denied", refusal ?? "No worktree.");
      yield* Effect.logInfo("leo_git_stacked_action", { threadId: thread.id, action });
      const result = yield* git
        .runStackedAction({
          actionId: yield* newCommandId(),
          cwd,
          action,
          threadId: thread.id,
          ...(commitMessage === undefined ? {} : { commitMessage }),
          ...(filePaths === undefined ? {} : { filePaths }),
        })
        .pipe(
          Effect.mapError((error) =>
            failure("orchestration_error", `Git action failed: ${error.message}`),
          ),
        );
      const linkCommandId = yield* newCommandId();
      yield* linkCreatedPullRequest({
        threadId: thread.id,
        result,
        commandId: Effect.succeed(linkCommandId),
      });
      return result;
    }),
  ),
});
