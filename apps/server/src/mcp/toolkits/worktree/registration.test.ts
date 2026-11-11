import * as SavedItems from "../../../savedItems/SavedItemService.ts";
import * as SavedItemExecution from "../../../savedItems/SavedItemExecution.ts";
import * as Orchestrator from "#server/orchestration-v2/Orchestrator.ts";
import * as ProjectionStore from "#server/orchestration-v2/ProjectionStore.ts";
import * as LocalVmService from "#server/localVm/LocalVmService.ts";
import * as DeviceService from "#server/device/DeviceService.ts";
import * as ServerConfig from "#server/config.ts";
import { expect, it } from "@effect/vitest";
import { NodeHttpServer } from "@effect/platform-node";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { ProviderInstanceId, ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import { HttpBody, HttpClient, HttpRouter } from "effect/http";

import * as ServerEnvironment from "#server/environment/ServerEnvironment.ts";
import * as GitWorkflowService from "#server/git/GitWorkflowService.ts";
import * as ProviderAdapterRegistry from "#server/orchestration-v2/ProviderAdapterRegistry.ts";
import * as ThreadManagementService from "#server/orchestration-v2/ThreadManagementService.ts";
import * as ProjectService from "#server/project/ProjectService.ts";
import * as ProjectSetupScriptRunner from "#server/project/ProjectSetupScriptRunner.ts";
import * as ProviderRegistry from "#server/provider/ProviderRegistry.ts";
import * as ScheduledTaskService from "#server/scheduledTasks/ScheduledTaskService.ts";
import * as SecretRequests from "#server/secrets/SecretRequests.ts";
import * as TaskBoardService from "#server/taskBoard/TaskBoardService.ts";
import * as ModelBenchmarks from "#server/benchmarks/ModelBenchmarks.ts";
import * as ServerSettings from "#server/serverSettings.ts";
import { spawnGateServices } from "#server/mcp/spawnGate.test-fixtures.ts";
import * as VcsStatusBroadcaster from "#server/vcs/VcsStatusBroadcaster.ts";
import * as ServerSecretStore from "#server/auth/ServerSecretStore.ts";
import * as ManagedProjectFolders from "#server/project/ManagedProjectFolders.ts";
import * as ThreadLaunchService from "#server/orchestration-v2/ThreadLaunchService.ts";
import * as ThreadSearch from "#server/orchestration-v2/ThreadSearch.ts";
import * as PreviewManager from "#server/preview/Manager.ts";
import * as SourceControlRepositoryService from "#server/sourceControl/SourceControlRepositoryService.ts";
import * as GitVcsDriver from "#server/vcs/GitVcsDriver.ts";
import * as McpHttpServer from "../../McpHttpServer.ts";
import * as McpSessionRegistry from "../../McpSessionRegistry.ts";
import * as PreviewAutomationBroker from "../../PreviewAutomationBroker.ts";
import * as PreviewBrowser from "#server/preview/PreviewBrowser.ts";
import * as Calendar from "#server/calendar/Calendar.ts";
import * as HardwareWatch from "#server/hardwareWatch/HardwareWatch.ts";
import * as LocalModelsService from "#server/localModels/LocalModelsService.ts";
import * as ScribeEngine from "#server/scribe/ScribeEngine.ts";
import * as ReviewService from "#server/review/ReviewService.ts";

const layerStubServices = Layer.mergeAll(
  Layer.mock(SavedItems.SavedItemService)({}),
  Layer.mock(SavedItemExecution.SavedItemExecution)({}),
  Layer.mock(Orchestrator.OrchestratorV2)({}),
  Layer.mock(ProjectionStore.ProjectionStoreV2)({}),
  Layer.mock(DeviceService.DeviceService)({}),
  Layer.mock(LocalVmService.LocalVmService)({
    screenshot: ({ threadId }) => {
      expect(threadId).toBe("thread-scratch");
      return Effect.succeed({
        session: { threadId, vmId: "test-vm", paused: true },
        screenshot: { mimeType: "image/png", width: 1, height: 1, data: "iVBORw0KGgo=" },
      });
    },
  }),
  Layer.mock(ThreadManagementService.ThreadManagementService)({}),
  Layer.mock(ProviderRegistry.ProviderRegistry)({}),
  Layer.mock(ProviderAdapterRegistry.ProviderAdapterRegistryV2)({}),
  Layer.mock(ScheduledTaskService.ScheduledTaskService)({}),
  Layer.mock(SecretRequests.SecretRequests)({}),
  Layer.mock(ProjectService.ProjectService)({}),
  Layer.mock(TaskBoardService.TaskBoardService)({}),
  Layer.mock(ModelBenchmarks.ModelBenchmarks)({}),
  Layer.mock(HardwareWatch.HardwareWatch)({}),
  Layer.mock(Calendar.Calendar)({}),
  Layer.mock(LocalModelsService.LocalModelsService)({}),
  Layer.mock(ScribeEngine.ScribeEngine)({}),
  Layer.mock(ReviewService.ReviewService)({}),
  ServerSettings.layerTest({}),
  spawnGateServices,
  Layer.mock(GitWorkflowService.GitWorkflowService)({}),
  Layer.mock(ProjectSetupScriptRunner.ProjectSetupScriptRunner)({}),
  Layer.mock(VcsStatusBroadcaster.VcsStatusBroadcaster)({}),
  Layer.mock(GitVcsDriver.GitVcsDriver)({}),
  Layer.mock(ManagedProjectFolders.ManagedProjectFolders)({ namedProjectsRoot: "/unused" }),
  Layer.mock(PreviewManager.PreviewManager)({}),
  Layer.mock(ServerSecretStore.ServerSecretStore)({}),
  Layer.mock(SourceControlRepositoryService.SourceControlRepositoryService)({}),
  Layer.mock(ThreadLaunchService.ThreadLaunchService)({}),
  Layer.mock(ThreadSearch.ThreadSearch)({}),
);

const ToolsListPayload = Schema.fromJsonString(
  Schema.Struct({
    result: Schema.Struct({
      tools: Schema.Array(
        Schema.Struct({
          name: Schema.String,
          inputSchema: Schema.Struct({ type: Schema.optional(Schema.String) }),
          annotations: Schema.optional(
            Schema.Struct({
              readOnlyHint: Schema.optional(Schema.Boolean),
              destructiveHint: Schema.optional(Schema.Boolean),
              openWorldHint: Schema.optional(Schema.Boolean),
            }),
          ),
        }),
      ),
    }),
  }),
);
const decodeToolsListPayload = Schema.decodeUnknownEffect(ToolsListPayload);
const decodeImagePayload = Schema.decodeUnknownEffect(
  Schema.fromJsonString(
    Schema.Struct({
      result: Schema.Struct({
        isError: Schema.Boolean,
        content: Schema.Array(
          Schema.Struct({
            type: Schema.String,
            data: Schema.optional(Schema.String),
            mimeType: Schema.optional(Schema.String),
            text: Schema.optional(Schema.String),
          }),
        ),
      }),
    }),
  ),
);

it.effect("production mcp layer lists worktree tools over http", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const layerRoutes = McpHttpServer.layer.pipe(Layer.provide(McpSessionRegistry.layer));
      yield* HttpRouter.serve(layerRoutes, {
        disableListenLog: true,
        disableLogger: true,
      }).pipe(
        Layer.provide(
          Layer.mock(ServerEnvironment.ServerEnvironment)({
            getEnvironmentId: Effect.succeed("environment-scratch" as never),
          }),
        ),
        Layer.provide(PreviewAutomationBroker.layer),
        Layer.provide(PreviewBrowser.layer),
        Layer.provide(layerStubServices),
        Layer.build,
      );

      const registry = McpSessionRegistry.issueActiveMcpCredential({
        threadId: ThreadId.make("thread-scratch"),
        providerInstanceId: ProviderInstanceId.make("claudeAgent"),
      });
      const credential = yield* registry;
      expect(credential).toBeDefined();

      const httpClient = yield* HttpClient.HttpClient;
      const auth = credential!.config.authorizationHeader;
      const initResponse = yield* httpClient.post("/mcp", {
        headers: {
          accept: "application/json, text/event-stream",
          authorization: auth,
        },
        body: HttpBody.text(
          `{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"scratch","version":"1.0.0"}}}`,
          "application/json",
        ),
      });
      expect(initResponse.status).toBe(200);
      const sessionId = initResponse.headers["mcp-session-id"];

      const listResponse = yield* httpClient.post("/mcp", {
        headers: {
          accept: "application/json, text/event-stream",
          authorization: auth,
          "mcp-protocol-version": "2025-06-18",
          ...(sessionId ? { "mcp-session-id": sessionId } : {}),
        },
        body: HttpBody.text(
          `{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}`,
          "application/json",
        ),
      });
      const bodyText = yield* listResponse.text;
      const payload = yield* decodeToolsListPayload(bodyText.match(/\{.*\}/s)![0]);
      const tools = payload.result.tools;
      const toolNames = tools.map((tool) => tool.name);
      expect(toolNames).toContain("leo_worktree_handoff");
      expect(toolNames).toContain("leo_worktree_status");
      expect(toolNames).toContain("leo_local_vm_list");
      expect(toolNames).toContain("leo_local_vm_input");
      expect(toolNames).toContain("leo_local_vm_screenshot");
      expect(toolNames).not.toContain("local_vm_connect");
      expect(toolNames).not.toContain("local_vm_pause");
      // The worktree registration merges alongside the other toolkits rather
      // than replacing them.
      expect(toolNames).toContain("leo_preview_status");
      expect(toolNames).toContain("leo_delegate_task");

      // The handoff tool mutates thread state, reaches the network (origin
      // fetch), and runs project setup scripts, so its MCP hints must not
      // promise a read-only, closed-world, non-destructive tool.
      const handoff = tools.find((tool) => tool.name === "leo_worktree_handoff");
      expect(handoff?.annotations?.readOnlyHint).toBe(false);
      expect(handoff?.annotations?.destructiveHint).toBe(true);
      expect(handoff?.annotations?.openWorldHint).toBe(true);
      const status = tools.find((tool) => tool.name === "leo_worktree_status");
      expect(status?.annotations?.readOnlyHint).toBe(true);
      expect(status?.annotations?.destructiveHint).toBe(false);

      // MCP requires every tool input schema to be a top-level object schema.
      // A non-object schema (e.g. the anyOf produced by an empty
      // Schema.Struct({})) makes clients reject the entire server.
      for (const tool of tools) {
        expect(tool.inputSchema.type, `inputSchema.type of ${tool.name}`).toBe("object");
      }

      const imageResponse = yield* httpClient.post("/mcp", {
        headers: {
          accept: "application/json, text/event-stream",
          authorization: auth,
          "mcp-protocol-version": "2025-06-18",
          ...(sessionId ? { "mcp-session-id": sessionId } : {}),
        },
        body: HttpBody.text(
          '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"leo_local_vm_screenshot","arguments":{}}}',
          "application/json",
        ),
      });
      const imageText = yield* imageResponse.text;
      const image = yield* decodeImagePayload(imageText.match(/\{.*\}/s)![0]);
      expect(image.result.isError).toBe(false);
      expect(image.result.content.find((item) => item.type === "image")).toEqual({
        type: "image",
        mimeType: "image/png",
        data: "iVBORw0KGgo=",
      });
      expect(image.result.content.find((item) => item.type === "text")?.text).not.toContain(
        "iVBORw0KGgo=",
      );
    }),
  ).pipe(
    Effect.provide(
      Layer.mergeAll(
        NodeHttpServer.layerTest,
        ServerConfig.layerTest(process.cwd(), { prefix: "t3-worktree-mcp-" }).pipe(
          Layer.provide(NodeServices.layer),
        ),
        NodeServices.layer,
      ),
    ),
  ),
);
