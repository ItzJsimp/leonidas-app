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

/** A chat that did no work for this long no longer counts toward its account's load. */
export const ACCOUNT_LOAD_WINDOW_MS = 60 * 60 * 1000;

export interface AccountLoad {
  /** Chats that worked in the last hour on the account: not archived, and no idle subagent. */
  readonly chats: number;
  /** Agents running or waiting on the user, a subset of `chats`. */
  readonly running: number;
}

/**
 * Active chats and running agents per account key, to balance work across accounts.
 * A chat counts while an agent runs in it, or when it did work (a tool call, a message)
 * in the last hour. A subagent thread is no chat the user opened, so it counts only
 * while it runs. Threads from every environment count, so delegated tasks are included.
 */
export function countAccountLoad(input: {
  readonly providers: ReadonlyArray<AccountIdentity>;
  readonly nowMs: number;
  readonly threads: Iterable<{
    readonly modelSelection: { readonly instanceId: ProviderInstanceId };
    readonly runtime: ThreadRuntimeSummary | null;
    readonly archivedAt?: string | null;
    readonly lastActivityAt?: string | null;
    readonly updatedAt?: string;
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
    // A server older than `lastActivityAt` sends no value: fall back to the last update.
    const lastWorkMs = Date.parse(thread.lastActivityAt ?? thread.updatedAt ?? "");
    const stale = !(input.nowMs - lastWorkMs < ACCOUNT_LOAD_WINDOW_MS);
    if (stale && thread.runtime?.status !== "running") continue;
    const instanceId = thread.runtime?.providerInstanceId ?? thread.modelSelection.instanceId;
    const scopedId = scoped(thread.environmentId, instanceId);
    const key = keyByInstance.get(scopedId) ?? `instance:${scopedId}`;
    const current = load.get(key) ?? { chats: 0, running: 0 };
    load.set(key, { chats: current.chats + 1, running: current.running + (running ? 1 : 0) });
  }
  return load;
}
