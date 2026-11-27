import { expect, it } from "@effect/vitest";
import { vi } from "vite-plus/test";
import { EnvironmentId, ProviderInstanceId, ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { McpSchema, McpServer, Toolkit } from "effect/ai";

import * as McpHttpServer from "../../McpHttpServer.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";
import * as McpToolAccess from "../../McpToolAccess.ts";
import { releaseStatusHandler } from "./handlers.ts";
import { InsightToolkit } from "./tools.ts";

// The real reader runs `gh` against GitHub; the test counts calls instead.
const reads = vi.hoisted(() => ({ count: 0 }));
vi.mock("../../../releaseStatus/releaseStatus.ts", () => ({
  readReleaseStatus: () => {
    reads.count += 1;
    return Promise.resolve({ runs: [], error: null });
  },
}));

const ReleaseToolkit = Toolkit.make(InsightToolkit.tools.leo_release_status);
const server = McpHttpServer.toolkitRegistration(
  ReleaseToolkit,
  McpToolAccess.toLayer(ReleaseToolkit, { leo_release_status: releaseStatusHandler }),
).pipe(Layer.provideMerge(McpServer.McpServer.layer));

const mcpClient = McpSchema.McpServerClient.of({
  clientId: 1,
  protocolVersion: "2025-06-18",
  clientCapabilities: {},
  clientInfo: { name: "mcp-test", version: "1" },
  initializePayload: {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "mcp-test", version: "1" },
  },
  getClient: Effect.die("unused"),
});

const base = {
  environmentId: EnvironmentId.make("environment"),
  capabilities: new Set(["orchestration"] as const),
  issuedAt: 0,
};
const outsideClient: McpInvocationContext.McpInvocationScope = {
  ...base,
  requestNamespace: "client:session",
  thread: undefined,
  client: { sessionId: "session", label: "Claude Code", access: "read-only" },
};
const threadAgent: McpInvocationContext.McpInvocationScope = {
  ...base,
  requestNamespace: "provider:thread:home",
  thread: {
    threadId: ThreadId.make("thread:home"),
    providerSessionId: "provider:thread:home",
    providerInstanceId: ProviderInstanceId.make("claude"),
  },
  client: undefined,
};

const callReleaseStatus = (scope: McpInvocationContext.McpInvocationScope) =>
  McpServer.McpServer.pipe(
    Effect.flatMap((mcp) => mcp.callTool({ name: "leo_release_status", arguments: {} })),
    Effect.map(({ content }) =>
      content.map((part) => (part.type === "text" ? part.text : "")).join(""),
    ),
    Effect.provideService(McpInvocationContext.McpInvocationContext, scope),
    Effect.provideService(McpSchema.McpServerClient, mcpClient),
  );

it.layer(server)("leo_release_status", (it) => {
  it.effect("refuses an outside MCP client, as release:read is administrative only", () =>
    Effect.gen(function* () {
      reads.count = 0;
      const text = yield* callReleaseStatus(outsideClient);
      expect(text).toContain("outside a thread");
      expect(reads.count).toBe(0);
    }),
  );

  it.effect("answers an agent inside a Leonidas thread", () =>
    Effect.gen(function* () {
      reads.count = 0;
      const text = yield* callReleaseStatus(threadAgent);
      expect(JSON.parse(text)).toEqual({ runs: [], error: null });
      expect(reads.count).toBe(1);
    }),
  );
});
