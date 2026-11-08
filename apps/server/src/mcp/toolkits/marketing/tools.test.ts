// @effect-diagnostics nodeBuiltinImport:off - the tool kit reads real marketing files in a temp folder.
import { afterEach, describe, expect, it } from "@effect/vitest";
import { EnvironmentId, ProviderInstanceId, ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { McpSchema, McpServer, Tool } from "effect/ai";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { checkApproval } from "#server/marketing/marketingFiles.ts";
import * as ServerSecretStore from "#server/auth/ServerSecretStore.ts";
import * as ProjectService from "#server/project/ProjectService.ts";
import * as TaskBoardService from "#server/taskBoard/TaskBoardService.ts";
import * as McpHttpServer from "../../McpHttpServer.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";
import { liveThreadsLayer } from "../../McpToolAccess.testkit.ts";
import * as MarketingHandlers from "./handlers.ts";
import { MarketingToolkit } from "./tools.ts";

const roots: Array<string> = [];
afterEach(() => {
  for (const root of roots.splice(0)) NodeFS.rmSync(root, { recursive: true, force: true });
});

/** A made-up workspace: one brand, an X connection, and one saved analytics day. */
function workspace(): string {
  const root = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "marketing-mcp-"));
  roots.push(root);
  const m = NodePath.join(root, "marketing");
  NodeFS.mkdirSync(NodePath.join(m, "brands"), { recursive: true });
  NodeFS.writeFileSync(
    NodePath.join(m, "brands", "acme-games.md"),
    "---\nslug: acme-games\nname: Acme Games\nchannels: [x]\n---\n## Voice do\n- Short lines.\n",
  );
  NodeFS.writeFileSync(
    NodePath.join(m, "connections.json"),
    JSON.stringify({ v: 1, x: { mode: "draft", brand: "acme-games", analyticsDir: "x" } }),
  );
  NodeFS.mkdirSync(NodePath.join(root, "x"));
  NodeFS.writeFileSync(
    NodePath.join(root, "x", "2026-10-21.json"),
    JSON.stringify({
      data: [{ id: "999", public_metrics: { impression_count: 77, like_count: 5 } }],
    }),
  );
  return root;
}

const threadId = ThreadId.make("thread:marketing");
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

const KEY = new Uint8Array(32).fill(7);

const server = (root: string) =>
  McpHttpServer.toolkitRegistration(MarketingToolkit, MarketingHandlers.layer).pipe(
    Layer.provideMerge(McpServer.McpServer.layer),
    Layer.provideMerge(liveThreadsLayer),
    Layer.provideMerge(
      Layer.mock(ServerSecretStore.ServerSecretStore)({
        getOrCreateRandom: () => Effect.succeed(KEY),
      }),
    ),
    Layer.provideMerge(
      Layer.mock(ProjectService.ProjectService)({
        snapshot: Effect.succeed({ projects: [] } as never),
      }),
    ),
    Layer.provideMerge(
      Layer.mock(TaskBoardService.TaskBoardService)({ aiosRoot: () => Effect.succeed(root) }),
    ),
  );

/** Calls one tool as an agent would and returns its JSON answer. */
const call = (name: string, args: Record<string, unknown> = {}) =>
  McpServer.McpServer.pipe(
    Effect.flatMap((mcp) => mcp.callTool({ name, arguments: args })),
    Effect.map(({ content, isError }) => ({
      isError: isError === true,
      json: JSON.parse(content.map((part) => (part.type === "text" ? part.text : "")).join("")),
    })),
    Effect.provideService(McpInvocationContext.McpInvocationContext, scope),
    Effect.provideService(McpSchema.McpServerClient, mcpClient),
  );

describe("marketing tool kit", () => {
  it("holds read and draft tools only", () => {
    const names = Object.keys(MarketingToolkit.tools).toSorted();
    expect(names).toEqual([
      "leo_marketing_approval_request",
      "leo_marketing_brands",
      "leo_marketing_draft_save",
      "leo_marketing_metrics",
      "leo_marketing_metrics_sync",
      "leo_marketing_posts",
    ]);
    expect(names.filter((name) => /publish|send|spend|approve$|post_now/.test(name))).toEqual([]);
    for (const name of [
      "leo_marketing_brands",
      "leo_marketing_posts",
      "leo_marketing_metrics",
    ] as const) {
      expect(Tool.getJsonSchema(MarketingToolkit.tools[name])).toBeDefined();
    }
  });

  it.effect("lets an agent read metrics and draft a post, and the draft cannot publish", () => {
    const root = workspace();
    return Effect.gen(function* () {
      const brands = yield* call("leo_marketing_brands");
      expect(brands.json.brands.map((b: { slug: string }) => b.slug)).toEqual(["acme-games"]);

      expect((yield* call("leo_marketing_metrics_sync")).json).toEqual({ added: 1, errors: [] });
      const metrics = yield* call("leo_marketing_metrics", { channel: "x" });
      expect(metrics.json.snapshots).toMatchObject([{ externalId: "999", impressions: 77 }]);

      const saved = yield* call("leo_marketing_draft_save", {
        brand: "acme-games",
        channel: "x",
        text: "77 people saw our last post. Here is the next one.",
      });
      expect(saved.json).toMatchObject({ status: "draft", author: { kind: "agent" } });
      const postId: string = saved.json.id;

      expect(checkApproval(root, KEY, postId, "publish")).toEqual({
        ok: false,
        reason: "no_ticket",
      });
      const ticket = yield* call("leo_marketing_approval_request", {
        postId,
        act: "publish",
        costEstimateUsd: 0.015,
      });
      expect(ticket.json).toMatchObject({ status: "pending", postId });
      expect(checkApproval(root, KEY, postId, "publish")).toEqual({ ok: false, reason: "pending" });

      const posts = yield* call("leo_marketing_posts", { brand: "acme-games" });
      expect(posts.json.posts).toMatchObject([{ post: { id: postId }, approval: "pending" }]);
    }).pipe(Effect.provide(server(root)));
  });

  it.effect("tells the agent to read the brands when the brand is unknown", () => {
    const root = workspace();
    return Effect.gen(function* () {
      const result = yield* call("leo_marketing_draft_save", {
        brand: "other",
        channel: "x",
        text: "Hi",
      });
      expect(result.isError).toBe(true);
      expect(result.json.message).toMatch(/Read the brands first/);
    }).pipe(Effect.provide(server(root)));
  });
});
