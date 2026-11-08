import { GitRunStackedActionResult, OrchestratorMcpFailure } from "@t3tools/contracts";
import * as Crypto from "effect/Crypto";
import * as Schema from "effect/Schema";
import { Tool, Toolkit } from "effect/ai";
import * as GitWorkflowService from "#server/git/GitWorkflowService.ts";
import * as LocalModelsService from "#server/localModels/LocalModelsService.ts";
import * as Orchestrator from "#server/orchestration-v2/Orchestrator.ts";
import * as ThreadManagementService from "#server/orchestration-v2/ThreadManagementService.ts";
import * as ProjectService from "#server/project/ProjectService.ts";
import * as ScribeEngine from "#server/scribe/ScribeEngine.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";

const shared = { failure: OrchestratorMcpFailure, failureMode: "return" as const };

const ScribeDictionaryAddTool = Tool.make("leo_scribe_dictionary_add", {
  ...shared,
  dependencies: [
    McpInvocationContext.McpInvocationContext,
    ThreadManagementService.ThreadManagementService,
    ScribeEngine.ScribeEngine,
  ],
  description:
    "Add one heard-to-meant pair to the Scribe voice dictionary, such as heard `Lite LLM`, meant `LiteLLM`. A heard phrase that is already mapped is never overwritten. Each call is logged.",
  parameters: Schema.Struct({
    heard: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(80)),
    meant: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(80)),
  }),
  success: Schema.Struct({ added: Schema.Boolean, correct: Schema.String }),
})
  .annotate(Tool.Readonly, false)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true);

const LocalModelsRunTool = Tool.make("leo_local_models_run", {
  ...shared,
  dependencies: [
    McpInvocationContext.McpInvocationContext,
    ThreadManagementService.ThreadManagementService,
    LocalModelsService.LocalModelsService,
  ],
  description:
    "Run one prompt (up to 4000 chars) on one INSTALLED local model. Returns text, tokens per second and seconds. It never downloads or deletes a model. Pick one with `leo_local_models_advice`.",
  parameters: Schema.Struct({
    model: Schema.String.check(Schema.isMinLength(1)),
    prompt: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(4000)),
  }),
  success: Schema.Struct({
    text: Schema.String,
    tokensPerSecond: Schema.NullOr(Schema.Number),
    seconds: Schema.Number,
  }),
})
  .annotate(Tool.Readonly, false)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, false);

const GitStackedActionTool = Tool.make("leo_git_stacked_action", {
  ...shared,
  dependencies: [
    McpInvocationContext.McpInvocationContext,
    ThreadManagementService.ThreadManagementService,
    GitWorkflowService.GitWorkflowService,
    Orchestrator.OrchestratorV2,
    ProjectService.ProjectService,
    Crypto.Crypto,
  ],
  description:
    "Commit, push or open a pull request for THIS thread's own worktree and branch, then link the PR to the thread. Never forces. Refuses a default branch or any other branch. Landing on main stays with the merge queue.",
  parameters: Schema.Struct({
    action: Schema.Literals(["commit", "push", "create_pr", "commit_push", "commit_push_pr"]),
    commitMessage: Schema.optional(
      Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(10_000)),
    ),
    filePaths: Schema.optional(Schema.Array(Schema.String.check(Schema.isMinLength(1)))),
  }),
  success: GitRunStackedActionResult,
})
  .annotate(Tool.Readonly, false)
  .annotate(Tool.Destructive, true)
  .annotate(Tool.Idempotent, false)
  .annotate(Tool.OpenWorld, true);

export const ActionToolkit = Toolkit.make(
  ScribeDictionaryAddTool,
  LocalModelsRunTool,
  GitStackedActionTool,
);
