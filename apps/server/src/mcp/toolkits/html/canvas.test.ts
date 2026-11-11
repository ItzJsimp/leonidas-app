import * as McpProviderSessions from "@t3tools/provider-core/server/McpProviderSessions";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import { EnvironmentId, ProviderInstanceId, ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { McpSchema, McpServer } from "effect/ai";
import { FetchHttpClient } from "effect/http";
import * as ServerConfig from "../../../config.ts";
import * as PreviewBrowser from "../../../preview/PreviewBrowser.ts";
import * as McpHttpServer from "../../McpHttpServer.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";
import * as McpToolAccessTestkit from "../../McpToolAccess.testkit.ts";

const scope: McpInvocationContext.McpInvocationScope = {
  environmentId: EnvironmentId.make("canvas:environment"),
  requestNamespace: "canvas:test",
  thread: {
    threadId: ThreadId.make("canvas:thread"),
    providerSessionId: "canvas:session",
    providerInstanceId: ProviderInstanceId.make("codex"),
  },
  client: undefined,
  issuedAt: 0,
  capabilities: new Set(["orchestration"]),
};
const client = McpSchema.McpServerClient.of({
  clientId: 1,
  protocolVersion: "2025-06-18",
  clientCapabilities: {},
  clientInfo: { name: "canvas:test", version: "1" },
  initializePayload: {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "canvas:test", version: "1" },
  },
  getClient: Effect.die("unused"),
});

it.effect("builds canvas HTML through production MCP and enforces skill loading and bounds", () =>
  Effect.gen(function* () {
    const server = yield* McpServer.McpServer;
    const call = (arguments_: Record<string, unknown>) =>
      server
        .callTool({ name: "leo_canvas", arguments: arguments_ })
        .pipe(
          Effect.provideService(McpInvocationContext.McpInvocationContext, scope),
          Effect.provideService(McpSchema.McpServerClient, client),
        );
    const input = {
      skillLoaded: true,
      title: "Release gates",
      sections: [
        {
          title: "Plan",
          summary: "Build and verify",
          metrics: [{ label: "Tests", value: "28" }],
          flow: ["Build", "Verify"],
        },
      ],
    };
    const result = yield* call(input);
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      title: "Release gates",
      html: expect.stringContaining('role="tablist"'),
    });
    const badSkill = yield* call({ ...input, skillLoaded: false }).pipe(Effect.flip);
    expect(badSkill._tag).toBe("InvalidParams");
    const oversized = yield* call({
      ...input,
      sections: Array.from({ length: 7 }, () => input.sections[0]),
    }).pipe(Effect.flip);
    expect(oversized._tag).toBe("InvalidParams");
    const badTable = yield* call({
      ...input,
      sections: [{ title: "Table", summary: "", columns: ["One"], rows: [["One", "Two"]] }],
    }).pipe(Effect.flip);
    expect(badTable._tag).toBe("InvalidParams");
  }).pipe(
    Effect.provide(
      McpHttpServer.layerHtmlToolkit.pipe(
        Layer.provideMerge(McpServer.McpServer.layer),
        Layer.provide(PreviewBrowser.layer),
        Layer.provide(ServerConfig.layerTest(process.cwd(), { prefix: "t3-canvas-tool-" })),
        Layer.provide(NodeServices.layer),
        Layer.provide(FetchHttpClient.layer),
        Layer.provide(McpToolAccessTestkit.liveThreadsLayer),
        Layer.provide(McpProviderSessions.layer),
      ),
    ),
  ),
);
