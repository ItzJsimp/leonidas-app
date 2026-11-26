import { describe, expect, it } from "@effect/vitest";
import { CLIENT_GUARDED_RPC_SCOPES } from "./clientRpcPermissions.ts";
import { WsRpcGroup } from "./rpc.ts";
import { requiredScopesForRpcCall, rpcPolicyOf } from "./rpcPolicy.ts";

describe("rpcPolicy", () => {
  it("declares a scope and a category on every RPC", () => {
    for (const rpc of WsRpcGroup.requests.values()) {
      const policy = rpcPolicyOf(rpc);
      expect(policy.scope, rpc._tag).toBeTruthy();
      expect(policy.category, rpc._tag).toBeTruthy();
    }
  });

  it("keeps each client guard equal to its server scope", () => {
    for (const [tag, scope] of Object.entries(CLIENT_GUARDED_RPC_SCOPES)) {
      const rpc = WsRpcGroup.requests.get(tag);
      expect(rpc, tag).toBeDefined();
      expect(rpcPolicyOf(rpc!).scope, tag).toBe(scope);
    }
  });

  it("uses the base scope when a method has no payload rule", () => {
    const rpc = WsRpcGroup.requests.get("savedItems.list")!;
    expect(requiredScopesForRpcCall(rpc, {})).toEqual([rpcPolicyOf(rpc).scope]);
  });

  it("throws for an RPC declared without a policy", () => {
    expect(() => rpcPolicyOf({ _tag: "x.y", annotations: WsRpcGroup.annotations })).toThrow(
      "RPC method x.y has no declared policy.",
    );
  });
});
