import {
  MarketingApprovalTicket,
  MarketingBadRecord,
  MarketingBrand,
  MarketingBrandSlug,
  MarketingChannel,
  MarketingMetricSnapshot,
  MarketingPost,
  MarketingPostId,
  MarketingPublicAct,
  OrchestratorMcpFailure,
} from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { Tool, Toolkit } from "effect/ai";

import * as ThreadManagementService from "#server/orchestration-v2/ThreadManagementService.ts";
import * as ServerSecretStore from "#server/auth/ServerSecretStore.ts";
import * as ProjectService from "#server/project/ProjectService.ts";
import * as TaskBoardService from "#server/taskBoard/TaskBoardService.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";

/**
 * The marketing tool kit (ADR-0091 in the AIOS). Agents read and draft. No tool here publishes,
 * sends or spends: those paths check a person's approval ticket first.
 */

const dependencies = [
  McpInvocationContext.McpInvocationContext,
  ThreadManagementService.ThreadManagementService,
  // The workspace root comes from the task board's AIOS, like event_emit.
  ProjectService.ProjectService,
  TaskBoardService.TaskBoardService,
  // Reads the approval key, so the approved state an agent sees is the signed one.
  ServerSecretStore.ServerSecretStore,
];

const PostWithApproval = Schema.Struct({
  post: MarketingPost,
  approval: Schema.Literals(["none", "pending", "approved", "rejected", "content_changed"]),
});

const MarketingBrandsTool = Tool.make("leo_marketing_brands", {
  description:
    "List the brand profiles of this workspace: customer, voice do, voice don't, banned words and spend cap. Read the brand before you write a draft for it.",
  parameters: Tool.EmptyParams,
  success: Schema.Struct({
    brands: Schema.Array(MarketingBrand),
    bad: Schema.Array(MarketingBadRecord),
  }),
  failure: OrchestratorMcpFailure,
  failureMode: "return",
  dependencies,
})
  .annotate(Tool.Title, "List brand profiles")
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true)
  .annotate(Tool.OpenWorld, false);

const MarketingPostsTool = Tool.make("leo_marketing_posts", {
  description:
    "List marketing posts (drafts and posted items) with the approval state of each. Filter by brand, channel or status.",
  parameters: Schema.Struct({
    brand: Schema.optional(MarketingBrandSlug),
    channel: Schema.optional(MarketingChannel),
    status: Schema.optional(Schema.Literals(["draft", "posted"])),
  }),
  success: Schema.Struct({
    posts: Schema.Array(PostWithApproval),
    bad: Schema.Array(MarketingBadRecord),
  }),
  failure: OrchestratorMcpFailure,
  failureMode: "return",
  dependencies,
})
  .annotate(Tool.Title, "List marketing posts")
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true)
  .annotate(Tool.OpenWorld, false);

const MarketingMetricsTool = Tool.make("leo_marketing_metrics", {
  description:
    "Read the saved metric snapshots (impressions, likes, replies, reposts) for posts. Call marketing_metrics_sync first to import the newest data.",
  parameters: Schema.Struct({
    brand: Schema.optional(MarketingBrandSlug),
    channel: Schema.optional(MarketingChannel),
    limit: Schema.optional(
      Schema.Number.check(Schema.isGreaterThanOrEqualTo(1), Schema.isLessThanOrEqualTo(500)),
    ),
  }),
  success: Schema.Struct({
    snapshots: Schema.Array(MarketingMetricSnapshot),
    bad: Schema.Array(MarketingBadRecord),
  }),
  failure: OrchestratorMcpFailure,
  failureMode: "return",
  dependencies,
})
  .annotate(Tool.Title, "Read marketing metrics")
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true)
  .annotate(Tool.OpenWorld, false);

const MarketingMetricsSyncTool = Tool.make("leo_marketing_metrics_sync", {
  description:
    "Import new metrics from the connected sources into the workspace files. It makes no paid calls. Bad records are skipped and listed in errors.",
  parameters: Tool.EmptyParams,
  success: Schema.Struct({ added: Schema.Number, errors: Schema.Array(MarketingBadRecord) }),
  failure: OrchestratorMcpFailure,
  failureMode: "return",
  dependencies,
})
  .annotate(Tool.Title, "Import marketing metrics")
  .annotate(Tool.Readonly, false)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true)
  .annotate(Tool.OpenWorld, false);

const MarketingDraftSaveTool = Tool.make("leo_marketing_draft_save", {
  description:
    "Create a draft post, or edit a draft when you pass its id. Write the text in the brand's voice. An edit voids any approval the draft already has.",
  parameters: Schema.Struct({
    id: Schema.optional(MarketingPostId),
    brand: MarketingBrandSlug,
    channel: MarketingChannel,
    text: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(10_000)),
    scheduledFor: Schema.optional(
      Schema.String.annotate({ description: "ISO 8601 time with an offset." }),
    ),
  }),
  success: MarketingPost,
  failure: OrchestratorMcpFailure,
  failureMode: "return",
  dependencies,
})
  .annotate(Tool.Title, "Save a marketing draft")
  .annotate(Tool.Readonly, false)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.OpenWorld, false);

const MarketingApprovalRequestTool = Tool.make("leo_marketing_approval_request", {
  description:
    "Ask a person to approve one public act (publish, send or spend) for one draft. Give an honest cost estimate in USD, 0 when free. Only a person can approve; the ticket waits in the approval queue.",
  parameters: Schema.Struct({
    postId: MarketingPostId,
    act: MarketingPublicAct,
    costEstimateUsd: Schema.Number.check(Schema.isGreaterThanOrEqualTo(0)),
  }),
  success: MarketingApprovalTicket,
  failure: OrchestratorMcpFailure,
  failureMode: "return",
  dependencies,
})
  .annotate(Tool.Title, "Ask for marketing approval")
  .annotate(Tool.Readonly, false)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.OpenWorld, false);

export const MarketingToolkit = Toolkit.make(
  MarketingBrandsTool,
  MarketingPostsTool,
  MarketingMetricsTool,
  MarketingMetricsSyncTool,
  MarketingDraftSaveTool,
  MarketingApprovalRequestTool,
);
