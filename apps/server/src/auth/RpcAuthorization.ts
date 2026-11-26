import {
  type DeviceListInput,
  authScopeRequiredResponse,
  AuthOrchestrationOperateScope,
  AuthOrchestrationReadScope,
  type AuthEnvironmentScope,
  EnvironmentAuthorizationError,
  RpcScopeAuthorization,
  requiredScopesForRpcCall,
  rpcPolicyOf,
  WsRpcGroup,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

/** The base scope of one method. Payload rules can replace it per call. */
export function requiredScopeForRpcMethod(method: string): AuthEnvironmentScope {
  const rpc = WsRpcGroup.requests.get(method);
  if (rpc === undefined) {
    throw new Error(`RPC method ${method} has no declared authorization scope.`);
  }
  return rpcPolicyOf(rpc).scope;
}

export const rpcAuthorizationError = (requiredScope: AuthEnvironmentScope) =>
  new EnvironmentAuthorizationError({
    message: `The authenticated token is missing required scope: ${requiredScope}.`,
    ...authScopeRequiredResponse(requiredScope),
  });

/**
 * `onAuthorized` runs once after an authorized request succeeds; for a stream
 * RPC, that is when the stream completes. Every RPC passes through here, so it
 * is the one place to observe requests without wrapping each handler.
 */
export const layer = (
  scopes: ReadonlyArray<AuthEnvironmentScope>,
  onAuthorized?: (method: string, payload: unknown) => Effect.Effect<void>,
) =>
  Layer.succeed(RpcScopeAuthorization)((effect, { rpc, payload }) => {
    const requiredScopes = requiredScopesForRpcCall(rpc, payload);
    const requiredScope = requiredScopes.find((scope) => !scopes.includes(scope));
    if (requiredScope !== undefined) return Effect.fail(rpcAuthorizationError(requiredScope));
    return onAuthorized === undefined
      ? effect
      : Effect.tap(effect, () => onAuthorized(rpc._tag, payload));
  });

/** Retrying can install or restart tools even though ordinary listing is readable. */
export const requiredScopeForDeviceList = (input: DeviceListInput): AuthEnvironmentScope =>
  input.retryHostId || input.updateTool
    ? AuthOrchestrationOperateScope
    : AuthOrchestrationReadScope;
