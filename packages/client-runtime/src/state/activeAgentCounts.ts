import type { ProviderInstanceId, ServerProvider } from "@t3tools/contracts";

import type { ThreadRuntimeSummary } from "./models.ts";

type AccountIdentity = Pick<ServerProvider, "instanceId" | "driver" | "auth" | "continuation"> & {
  /** Instance ids repeat across environments, so scope them when known. */
  readonly environmentId?: string | undefined;
  readonly usageLimits?:
    | Pick<NonNullable<ServerProvider["usageLimits"]>, "credentialFingerprint">
    | undefined;
};

/**
 * Stable key for the underlying account behind a provider instance. Instances
 * sharing a continuation group, a driver+email, or a credential fingerprint are
 * the same account (the same rules failover uses to skip a limited account).
 */
export function resolveAccountKey(entry: AccountIdentity): string {
  const group = entry.continuation?.groupKey;
  if (group) return `group:${group}`;
  const fingerprint = entry.usageLimits?.credentialFingerprint;
  if (fingerprint) return `cred:${fingerprint}`;
  const email = entry.auth?.email?.trim().toLowerCase();
  if (email) return `email:${entry.driver}:${email}`;
  return `instance:${scoped(entry.environmentId, entry.instanceId)}`;
}

const scoped = (environmentId: string | undefined, instanceId: string) =>
  environmentId ? `${environmentId}:${instanceId}` : instanceId;

/** Running or blocked on the user: the agents occupying an account right now. */
function isAgentActive(runtime: ThreadRuntimeSummary | null | undefined): boolean {
  return runtime?.status === "running" || runtime?.status === "waiting";
}

export interface AccountLoad {
  /** Chats the user has open on the account: not archived, and no idle subagent. */
  readonly chats: number;
  /** Agents running or waiting on the user, a subset of `chats`. */
  readonly running: number;
}

/**
 * Open chats and running agents per account key, to balance work across accounts.
 * A subagent thread is no chat the user opened, so it counts only while it runs.
 * Threads from every environment count, so delegated tasks are included.
 */
export function countAccountLoad(input: {
  readonly providers: ReadonlyArray<AccountIdentity>;
  readonly threads: Iterable<{
    readonly modelSelection: { readonly instanceId: ProviderInstanceId };
    readonly runtime: ThreadRuntimeSummary | null;
    readonly archivedAt?: string | null;
    readonly lineage?: { readonly relationshipToParent?: string | null };
    readonly environmentId?: string;
  }>;
}): ReadonlyMap<string, AccountLoad> {
  const keyByInstance = new Map<string, string>();
  for (const provider of input.providers) {
    keyByInstance.set(
      scoped(provider.environmentId, provider.instanceId),
      resolveAccountKey(provider),
    );
  }
  const load = new Map<string, AccountLoad>();
  for (const thread of input.threads) {
    if (thread.archivedAt) continue;
    const running = isAgentActive(thread.runtime);
    if (!running && thread.lineage?.relationshipToParent === "subagent") continue;
    const instanceId = thread.runtime?.providerInstanceId ?? thread.modelSelection.instanceId;
    const scopedId = scoped(thread.environmentId, instanceId);
    const key = keyByInstance.get(scopedId) ?? `instance:${scopedId}`;
    const current = load.get(key) ?? { chats: 0, running: 0 };
    load.set(key, { chats: current.chats + 1, running: current.running + (running ? 1 : 0) });
  }
  return load;
}
