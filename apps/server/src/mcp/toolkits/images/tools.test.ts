import { describe, expect, it } from "@effect/vitest";
import {
  EnvironmentId,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
  type ImagesGenerateInput,
  type ImagesState,
  type Project,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Stream from "effect/Stream";
import { McpSchema, McpServer } from "effect/ai";
import * as ImageService from "#server/images/ImageService.ts";
import * as ProjectService from "#server/project/ProjectService.ts";
import * as McpHttpServer from "../../McpHttpServer.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";
import { liveThreadsLayer } from "../../McpToolAccess.testkit.ts";
import * as ImagesHandlers from "./handlers.ts";
import { ImagesToolkit } from "./tools.ts";

const threadId = ThreadId.make("thread:images");
const project: Project = {
  id: ProjectId.make("project:mcp-test"),
  title: "Images test",
  workspaceRoot: "/images-test",
  defaultModelSelection: null,
  scripts: [],
  createdAt: "2026-11-09T00:00:00Z",
  updatedAt: "2026-11-09T00:00:00Z",
  deletedAt: null,
};
const scope: McpInvocationContext.McpInvocationScope = {
  environmentId: EnvironmentId.make("environment"),
  requestNamespace: `provider:${threadId}`,
  thread: {
    threadId,
    providerSessionId: `provider:${threadId}`,
    providerInstanceId: ProviderInstanceId.make("codex"),
  },
  client: undefined,
  capabilities: new Set(["orchestration"]),
  issuedAt: 0,
};
const client = McpSchema.McpServerClient.of({
  clientId: 1,
  protocolVersion: "2025-06-18",
  clientCapabilities: {},
  clientInfo: { name: "images-test", version: "1" },
  initializePayload: {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "images-test", version: "1" },
  },
  getClient: Effect.die("unused"),
});

function setup(installed = ["flux2klein"]) {
  const submitted: ImagesGenerateInput[] = [];
  const state: ImagesState = {
    source: {
      sourceId: "comfyui",
      label: "Image engine",
      baseUrl: "http://127.0.0.1:8189",
      online: false,
      busy: false,
      message: null,
    },
    setup: {
      phase: "ready",
      folder: "/models",
      total: 0,
      received: 0,
      error: null,
      installedModelIds: installed,
    },
    models: [],
    items: [],
    now: 1,
    workspaceRoot: project.workspaceRoot,
    imagesFolder: "images",
  };
  const server = McpHttpServer.toolkitRegistration(ImagesToolkit, ImagesHandlers.layer).pipe(
    Layer.provideMerge(McpServer.McpServer.layer),
    Layer.provideMerge(liveThreadsLayer),
    Layer.provideMerge(
      Layer.mock(ProjectService.ProjectService)({
        getById: () => Effect.succeed(Option.some(project)),
      }),
    ),
    Layer.provideMerge(
      Layer.mock(ImageService.ImageService)({
        subscribe: () => Stream.make(state),
        generate: (_project, input) =>
          Effect.sync(() => {
            submitted.push(input);
            return { jobId: "job-one", queued: input.count };
          }),
        cancel: () => Effect.succeed({ cancelled: 1 }),
      }),
    ),
  );
  return { server, submitted };
}

const call = (name: string, args: Record<string, unknown> = {}) =>
  McpServer.McpServer.pipe(
    Effect.flatMap((mcp) => mcp.callTool({ name, arguments: args })),
    Effect.map((result) => ({
      isError: result.isError === true,
      json: JSON.parse(
        result.content
          .filter((part) => part.type === "text")
          .map((part) => part.text)
          .join(""),
      ) as Record<string, unknown>,
    })),
    Effect.provideService(McpInvocationContext.McpInvocationContext, scope),
    Effect.provideService(McpSchema.McpServerClient, client),
  );

describe("Images MCP", () => {
  it.effect("does not submit before chat approval", () => {
    const { server, submitted } = setup();
    return Effect.gen(function* () {
      const result = yield* call("leo_images_generate", {
        prompt: "a fox",
        clientRequestId: "not-approved",
      });
      expect(result.isError).toBe(true);
      expect(submitted).toEqual([]);
      expect(JSON.stringify(result.json)).toContain("Ask the user");
    }).pipe(Effect.provide(server));
  });
  it.effect("queues one image with the current project and installed model", () => {
    const { server, submitted } = setup();
    return Effect.gen(function* () {
      const result = yield* call("leo_images_generate", {
        prompt: "a fox app icon",
        width: 768,
        height: 1024,
        clientRequestId: "same-call",
        userApproved: true,
      });
      expect(result.isError).toBe(false);
      expect(result.json).toEqual({ jobId: "job-one", queued: 1 });
      expect(submitted).toMatchObject([
        {
          projectId: project.id,
          modelIds: ["flux2klein"],
          count: 1,
          width: 768,
          height: 1024,
          clientRequestId: expect.stringMatching(/^[a-f0-9]{64}$/),
        },
      ]);
    }).pipe(Effect.provide(server));
  });

  it.effect("reports setup required without submitting an image", () => {
    const { server, submitted } = setup([]);
    return Effect.gen(function* () {
      const result = yield* call("leo_images_generate", {
        prompt: "a fox",
        clientRequestId: "missing-model",
        userApproved: true,
      });
      expect(result.isError).toBe(true);
      expect(submitted).toEqual([]);
    }).pipe(Effect.provide(server));
  });

  it.effect("reads the current project's model readiness", () => {
    const { server } = setup();
    return Effect.gen(function* () {
      const result = yield* call("leo_images_status");
      expect(result.isError).toBe(false);
      expect(result.json).toMatchObject({
        workspaceRoot: project.workspaceRoot,
        setup: { installedModelIds: ["flux2klein"] },
      });
    }).pipe(Effect.provide(server));
  });
});
