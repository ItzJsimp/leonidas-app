// @effect-diagnostics nodeBuiltinImport:off - tests write real marketing files in a temp folder.
import {
  AuthFilesystemWriteScope,
  AuthMcpClientAccess,
  clientRpcRequiredScopes,
  WS_METHODS,
} from "@t3tools/contracts";
import { afterEach, describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { mcpClientScopes } from "../auth/EnvironmentAuth.ts";
import { requiredScopeForRpcMethod } from "../auth/RpcAuthorization.ts";
import * as ServerSecretStore from "../auth/ServerSecretStore.ts";
import { MarketingToolkit } from "../mcp/toolkits/marketing/tools.ts";
import { checkApproval, requestApproval, saveDraft } from "./marketingFiles.ts";
import * as MarketingRpc from "./marketingRpc.ts";

const KEY = new Uint8Array(32).fill(7);
const agent = { kind: "agent", name: "test agent" } as const;
const roots: Array<string> = [];

const keyLayer = Layer.mock(ServerSecretStore.ServerSecretStore)({
  getOrCreateRandom: () => Effect.succeed(KEY),
});

function makeWorkspace(): string {
  const root = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "marketing-rpc-"));
  roots.push(root);
  NodeFS.mkdirSync(NodePath.join(root, "marketing", "brands"), { recursive: true });
  NodeFS.writeFileSync(
    NodePath.join(root, "marketing", "brands", "acme-games.md"),
    "---\nslug: acme-games\nname: Acme Games\nspend_cap_usd: 0\nchannels: [x]\n---\n# Acme Games\n",
  );
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) NodeFS.rmSync(root, { recursive: true, force: true });
});

describe("marketing RPCs", () => {
  it.effect("list shows the queue, and decide signs a batch the gate then accepts", () =>
    Effect.gen(function* () {
      const root = makeWorkspace();
      const posts = ["One.", "Two."].map((text) =>
        saveDraft(root, { brand: "acme-games", channel: "x", text }, agent),
      );
      const tickets = posts.map((post) =>
        requestApproval(root, { postId: post.id, act: "publish", costEstimateUsd: 0 }, agent),
      );
      const rootOf = Effect.succeed(root);

      const before = yield* MarketingRpc.list(rootOf);
      expect(before.brands).toEqual([{ slug: "acme-games", name: "Acme Games", spendCapUsd: 0 }]);
      expect(before.queue.map((item) => item.ticket.id)).toEqual(tickets.map((t) => t.id));
      expect(before.posts.map((item) => item.approval)).toEqual(["pending", "pending"]);

      const out = yield* MarketingRpc.decide(
        rootOf,
        { decisions: tickets.map((t) => ({ ticketId: t.id, decision: "approve" as const })) },
        "Owner",
      );
      expect(out.results.every((result) => result.ok)).toBe(true);

      const after = yield* MarketingRpc.list(rootOf);
      expect(after.queue).toEqual([]);
      expect(after.posts.map((item) => item.approval)).toEqual(["approved", "approved"]);
      expect(checkApproval(root, KEY, posts[0]!.id, "publish")).toMatchObject({ ok: true });
    }).pipe(Effect.provide(keyLayer)),
  );

  it.effect("caps the queue at one decide call and the posts at 500, with true totals", () =>
    Effect.gen(function* () {
      const root = makeWorkspace();
      for (let i = 0; i < 205; i++) {
        const post = saveDraft(
          root,
          { brand: "acme-games", channel: "x", text: `Draft ${i}` },
          agent,
        );
        requestApproval(root, { postId: post.id, act: "publish", costEstimateUsd: 0 }, agent);
      }
      const out = yield* MarketingRpc.list(Effect.succeed(root));
      expect(out.queue).toHaveLength(200);
      expect(out.queueTotal).toBe(205);
      expect(out.posts).toHaveLength(205);
      expect(out.postsTotal).toBe(205);
      // The oldest tickets come first, so deciding them makes the next ones appear.
      const decided = yield* MarketingRpc.decide(
        Effect.succeed(root),
        {
          decisions: out.queue.map((item) => ({
            ticketId: item.ticket.id,
            decision: "reject" as const,
          })),
        },
        "Owner",
      );
      expect(decided.results.every((result) => result.ok)).toBe(true);
      const next = yield* MarketingRpc.list(Effect.succeed(root));
      expect(next.queue).toHaveLength(5);
      expect(next.queueTotal).toBe(5);
    }).pipe(Effect.provide(keyLayer)),
  );

  it.effect("a missing workspace is a clear error", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(MarketingRpc.list(Effect.succeed(null)));
      expect(error.message).toBe("No workspace is open.");
    }).pipe(Effect.provide(keyLayer)),
  );
});

describe("who can approve", () => {
  it("needs filesystem:write, which no agent access level holds", () => {
    expect(requiredScopeForRpcMethod(WS_METHODS.marketingDecide)).toBe(AuthFilesystemWriteScope);
    expect(clientRpcRequiredScopes(WS_METHODS.marketingDecide, undefined)).toEqual([
      AuthFilesystemWriteScope,
    ]);
    for (const access of AuthMcpClientAccess.literals) {
      expect(mcpClientScopes(access)).not.toContain(AuthFilesystemWriteScope);
    }
  });

  it("gives agents no tool that decides a ticket", () => {
    const names = Object.keys(MarketingToolkit.tools);
    expect(names.filter((name) => /decide|approve$|reject/.test(name))).toEqual([]);
    expect(names).toContain("leo_marketing_approval_request");
  });
});
