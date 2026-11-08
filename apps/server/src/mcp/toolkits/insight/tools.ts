import { OrchestratorMcpFailure, ReleaseStatus } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { Tool, Toolkit } from "effect/ai";
import * as ProjectService from "#server/project/ProjectService.ts";
import * as ProviderRegistry from "#server/provider/ProviderRegistry.ts";
import * as Settings from "#server/serverSettings.ts";
import * as TaskBoardService from "#server/taskBoard/TaskBoardService.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";

const shared = { failure: OrchestratorMcpFailure, failureMode: "return" as const };
const MemorySearchTool = Tool.make("leo_aios_memory_search", {
  ...shared,
  dependencies: [
    McpInvocationContext.McpInvocationContext,
    ProjectService.ProjectService,
    TaskBoardService.TaskBoardService,
  ],
  description:
    "Search this AIOS memory index. Ranked hits with file path, line and snippet. Open one with `leo_aios_memory_read`.",
  parameters: Schema.Struct({
    query: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(500)),
    limit: Schema.optional(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 20 }))),
  }),
  success: Schema.Struct({
    indexBuilt: Schema.Boolean,
    hits: Schema.Array(
      Schema.Struct({
        path: Schema.String,
        name: Schema.String,
        description: Schema.String,
        snippet: Schema.String,
        score: Schema.Number,
        line: Schema.optional(Schema.Number),
      }),
    ),
  }),
})
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true);

const MemoryReadTool = Tool.make("leo_aios_memory_read", {
  ...shared,
  dependencies: [
    McpInvocationContext.McpInvocationContext,
    ProjectService.ProjectService,
    TaskBoardService.TaskBoardService,
  ],
  description:
    "Read one indexed AIOS memory entry by the exact `path` from `leo_aios_memory_search`. Long text is cut and flagged.",
  parameters: Schema.Struct({ path: Schema.String.check(Schema.isMinLength(1)) }),
  success: Schema.Struct({
    path: Schema.String,
    name: Schema.String,
    description: Schema.String,
    content: Schema.String,
    truncated: Schema.Boolean,
  }),
})
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true);

const UsageStatusTool = Tool.make("leo_usage_status", {
  ...shared,
  dependencies: [
    McpInvocationContext.McpInvocationContext,
    ProviderRegistry.ProviderRegistry,
    Settings.ServerSettingsService,
  ],
  description:
    "Read used and remaining usage for each connected account. Check it before `leo_delegate_task`. `at_limit` and `near_limit` accounts should not take new work.",
  success: Schema.Struct({
    nearLimitPercent: Schema.Number,
    accounts: Schema.Array(
      Schema.Struct({
        providerInstanceId: Schema.String,
        account: Schema.String,
        driver: Schema.String,
        state: Schema.Literals(["ok", "near_limit", "at_limit", "no_data"]),
        highestUsedPercent: Schema.NullOr(Schema.Number),
        windows: Schema.Array(
          Schema.Struct({
            label: Schema.String,
            usedPercent: Schema.Number,
            remainingPercent: Schema.Number,
            resetsAt: Schema.optional(Schema.String),
          }),
        ),
      }),
    ),
  }),
})
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true);

const ReleaseStatusTool = Tool.make("leo_release_status", {
  ...shared,
  dependencies: [McpInvocationContext.McpInvocationContext],
  description:
    "Read the newest Leonidas Code release runs, newest first. The first run is the latest release. The repo is fixed.",
  success: ReleaseStatus,
})
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true);

export const InsightToolkit = Toolkit.make(
  MemorySearchTool,
  MemoryReadTool,
  UsageStatusTool,
  ReleaseStatusTool,
);
