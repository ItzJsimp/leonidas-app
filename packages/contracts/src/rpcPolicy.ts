import * as Context from "effect/Context";
import * as Schema from "effect/Schema";
import * as Rpc from "effect/rpc/Rpc";
import { AssetCreateUrlInput } from "./assets.ts";
import {
  AuthEnvironmentMaintainScope,
  AuthDiagnosticsReadScope,
  AuthFilesystemReadScope,
  AuthOrchestrationOperateScope,
  AuthOrchestrationReadScope,
  AuthProvidersManageScope,
  AuthSourceControlWriteScope,
  type AuthEnvironmentScope,
} from "./auth.ts";
import { GitPreparePullRequestThreadInput, GitRunStackedActionInput } from "./git.ts";
import { ProjectMutation } from "./project.ts";
import { ProviderInstanceMutation } from "./providerInstance.ts";
import {
  ServerSettingsPatch,
  requiredScopesForProjectMutation,
  requiredScopesForServerSettingsPatch,
} from "./settings.ts";

/**
 * What the server requires to run one RPC method, and how its metrics are labeled.
 * `scope` is the base scope. `scopesFor`, when set, replaces it with scopes read from the payload.
 * `category` is the `rpc.aggregate` trace label. Dashboards group by it, so keep old values.
 */
export interface RpcPolicyValue {
  readonly scope: AuthEnvironmentScope;
  readonly scopesFor?: (payload: unknown) => ReadonlyArray<AuthEnvironmentScope>;
  readonly category: string;
}

export class RpcPolicy extends Context.Service<RpcPolicy, RpcPolicyValue>()(
  "@t3tools/contracts/rpcPolicy",
) {}

/** `Rpc.make` plus the method's policy. Every WebSocket RPC is declared through it. */
export const defineWsRpc = <
  const Tag extends string,
  Payload extends Schema.Top | Schema.Struct.Fields = Schema.Void,
  Success extends Schema.Top = Schema.Void,
  Error extends Schema.Top = Schema.Never,
  const Stream extends boolean = false,
>(
  tag: Tag,
  options: RpcPolicyValue & {
    readonly payload?: Payload;
    readonly success?: Success;
    readonly error?: Error;
    readonly stream?: Stream;
  },
) => {
  const { scope, scopesFor, category, ...rpcOptions } = options;
  return Rpc.make<Tag, Payload, Success, Error, Stream>(tag, rpcOptions).annotate(RpcPolicy, {
    scope,
    category,
    ...(scopesFor === undefined ? {} : { scopesFor }),
  });
};

/** The parts of a declared RPC that its policy lookup reads. */
type DeclaredRpc = { readonly _tag: string; readonly annotations: Context.Context<never> };

/** The policy of one declared RPC. Throws when the method was not declared with `defineWsRpc`. */
export const rpcPolicyOf = (rpc: DeclaredRpc): RpcPolicyValue => {
  const policy = Context.getOption(rpc.annotations, RpcPolicy);
  if (policy._tag === "None") {
    throw new Error(`RPC method ${rpc._tag} has no declared policy.`);
  }
  return policy.value;
};

/** All scopes one call needs, after payload rules. */
export const requiredScopesForRpcCall = (
  rpc: DeclaredRpc,
  payload: unknown,
): ReadonlyArray<AuthEnvironmentScope> => {
  const policy = rpcPolicyOf(rpc);
  return policy.scopesFor === undefined ? [policy.scope] : policy.scopesFor(payload);
};

// Payload rules. They live here, not in rpc.ts, so clientRpcPermissions.ts can share them
// without an import cycle.

export const resourceTelemetryRetryScopes = () => [
  AuthEnvironmentMaintainScope,
  AuthDiagnosticsReadScope,
];

const decodeAssetCreateUrl = Schema.decodeUnknownSync(AssetCreateUrlInput);
export const assetCreateUrlScopes = (payload: unknown) => {
  const { resource } = decodeAssetCreateUrl(payload);
  return [
    resource._tag === "workspace-file" ||
    resource._tag === "media-file" ||
    resource._tag === "draft-workspace-file"
      ? AuthFilesystemReadScope
      : AuthOrchestrationReadScope,
  ];
};

const decodeSettingsUpdate = Schema.decodeUnknownSync(
  Schema.Struct({
    patch: ServerSettingsPatch,
    providerInstanceMutation: Schema.optionalKey(ProviderInstanceMutation),
  }),
);
export const settingsUpdateScopes = (payload: unknown) => {
  const input = decodeSettingsUpdate(payload);
  const scopes = requiredScopesForServerSettingsPatch(input.patch);
  if (input.providerInstanceMutation === undefined) return scopes;
  // An atomic provider mutation carries an empty patch unless it also changes settings.
  return Object.values(input.patch).every((value) => value === undefined)
    ? [AuthProvidersManageScope]
    : [...new Set([...scopes, AuthProvidersManageScope])];
};

const decodeProjectMutation = Schema.decodeUnknownSync(ProjectMutation);
export const projectMutationScopes = (payload: unknown) =>
  requiredScopesForProjectMutation(decodeProjectMutation(payload));

const decodePrepareThread = Schema.decodeUnknownSync(GitPreparePullRequestThreadInput);
/** A worktree for an existing thread also changes that thread. Undefined: no extra rule. */
export const preparePullRequestThreadScopes = (
  payload: unknown,
): ReadonlyArray<AuthEnvironmentScope> | undefined => {
  if (payload === undefined) return undefined;
  const input = decodePrepareThread(payload);
  return input.mode === "worktree" && input.threadId !== undefined
    ? [AuthSourceControlWriteScope, AuthOrchestrationOperateScope]
    : undefined;
};

const decodeStackedAction = Schema.decodeUnknownSync(GitRunStackedActionInput);
/** Opening a pull request from a thread writes to source control. Undefined: no extra rule. */
export const stackedActionScopes = (
  payload: unknown,
): ReadonlyArray<AuthEnvironmentScope> | undefined => {
  if (payload === undefined) return undefined;
  const input = decodeStackedAction(payload);
  return input.threadId !== undefined &&
    (input.action === "create_pr" || input.action === "commit_push_pr")
    ? [AuthSourceControlWriteScope, AuthOrchestrationReadScope]
    : undefined;
};
