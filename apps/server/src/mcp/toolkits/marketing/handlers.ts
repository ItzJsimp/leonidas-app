import { type MarketingActor, OrchestratorMcpFailure } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import { approvalKey } from "#server/marketing/approvalKey.ts";
import * as MarketingFiles from "#server/marketing/marketingFiles.ts";
import { syncMetrics } from "#server/marketing/connectors.ts";
import * as ProjectService from "#server/project/ProjectService.ts";
import * as TaskBoardService from "#server/taskBoard/TaskBoardService.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";
import * as McpToolAccess from "../../McpToolAccess.ts";
import { MarketingToolkit } from "./tools.ts";

const failure = (code: "invalid_request" | "orchestration_error", message: string) =>
  new OrchestratorMcpFailure({ code, message });

/** The workspace (AIOS) folder that holds `marketing/`, found the same way as `event_emit`. */
export const workspaceRoot = Effect.gen(function* () {
  const projects = yield* ProjectService.ProjectService;
  const taskBoard = yield* TaskBoardService.TaskBoardService;
  const snapshot = yield* projects.snapshot.pipe(
    Effect.mapError((error) =>
      failure("orchestration_error", `Unable to read projects: ${error.message}`),
    ),
  );
  const root = yield* taskBoard.aiosRoot(snapshot.projects);
  if (root === null) return yield* failure("invalid_request", "No AIOS is connected.");
  return root;
});

const caller = Effect.map(McpInvocationContext.McpInvocationContext, (scope): MarketingActor => ({
  kind: "agent",
  name: scope.thread ? `thread ${scope.thread.threadId}` : (scope.client?.label ?? "agent"),
}));

/** Runs file work on the root; a MarketingError becomes a message the agent can act on. */
const onRoot = <A>(work: (root: string) => A) =>
  Effect.flatMap(workspaceRoot, (root) =>
    Effect.try({
      try: () => work(root),
      catch: (error) =>
        error instanceof MarketingFiles.MarketingError
          ? failure("invalid_request", error.message)
          : failure("orchestration_error", `Marketing files failed: ${String(error)}`),
    }),
  );

const signingKey = approvalKey.pipe(
  Effect.mapError(() => failure("orchestration_error", "Could not read the approval key.")),
);

const handlers = {
  marketing_brands: McpToolAccess.reads(() =>
    onRoot((root) => {
      const { records, bad } = MarketingFiles.readBrands(root);
      return { brands: records, bad };
    }),
  ),
  marketing_posts: McpToolAccess.reads((input) =>
    Effect.flatMap(signingKey, (key) =>
      onRoot((root) => {
        const { records, bad } = MarketingFiles.readPosts(root);
        const tickets = MarketingFiles.readTickets(root).records;
        const posts = records
          .filter(
            (post) =>
              (!input.brand || post.brand === input.brand) &&
              (!input.channel || post.channel === input.channel) &&
              (!input.status || post.status === input.status),
          )
          .map((post) => {
            const check = MarketingFiles.approvalOf(key, post, "publish", tickets);
            const approval = check.ok
              ? ("approved" as const)
              : check.reason === "no_ticket" || check.reason === "no_post"
                ? ("none" as const)
                : check.reason;
            return { post, approval };
          });
        return { posts, bad };
      }),
    ),
  ),
  marketing_metrics: McpToolAccess.reads((input) =>
    onRoot((root) => {
      const { records, bad } = MarketingFiles.readMetrics(root);
      const snapshots = records
        .filter(
          (s) =>
            (!input.brand || s.brand === input.brand) &&
            (!input.channel || s.channel === input.channel),
        )
        .slice(-(input.limit ?? 100));
      return { snapshots, bad };
    }),
  ),
  marketing_metrics_sync: McpToolAccess.writes(() => onRoot((root) => syncMetrics(root))),
  marketing_draft_save: McpToolAccess.writes((input) =>
    Effect.flatMap(caller, (author) =>
      onRoot((root) => MarketingFiles.saveDraft(root, input, author)),
    ),
  ),
  marketing_approval_request: McpToolAccess.writes((input) =>
    Effect.flatMap(caller, (requestedBy) =>
      onRoot((root) => MarketingFiles.requestApproval(root, input, requestedBy)),
    ),
  ),
} satisfies McpToolAccess.Handlers<typeof MarketingToolkit.tools>;

export const layer = McpToolAccess.toLayer(MarketingToolkit, handlers);
