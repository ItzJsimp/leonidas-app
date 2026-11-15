// @effect-diagnostics globalDate:off - Pure selector over client state; callers may inject nowMs, the default is wall-clock time.
import type { ModelSelection, ServerProvider, ServerProviderUsageWindow } from "@t3tools/contracts";

import { resolveProviderInstanceDisplayName } from "./providerInstanceDisplay.ts";

export interface ProviderFailoverTarget {
  readonly label: string;
  readonly modelSelection: ModelSelection;
}

const FAILOVER_SUPPORTED_DRIVERS: ReadonlySet<string> = new Set([
  "codex",
  "claudeAgent",
  "antigravity",
  "cursor",
]);

export function isProviderUsageWindowExhausted(
  window: ServerProviderUsageWindow,
  nowMs = Date.now(),
): boolean {
  if (Math.round(window.usedPercent) < 100) return false;
  if (window.resetsAt !== undefined) {
    const resetTime = Date.parse(window.resetsAt);
    if (Number.isFinite(resetTime) && resetTime <= nowMs) {
      return false;
    }
  }
  return true;
}

/**
 * The model a failover resumes on. Same choice as web's
 * `resolveRecommendedFailoverModel`; the catalog default is Fable 5.1 on Claude,
 * which a rate-limited chat should not silently move to.
 */
function recommendedFailoverModel(entry: ServerProvider) {
  if (entry.driver === "claudeAgent") {
    return (
      entry.models.find((candidate) => candidate.slug === "claude-sonnet-5-5") ??
      entry.models.find(
        (candidate) => /sonnet.*5\.5/i.test(candidate.slug) || /sonnet.*5\.5/i.test(candidate.name),
      ) ??
      entry.models.find(
        (candidate) => /sonnet/i.test(candidate.slug) || /sonnet/i.test(candidate.name),
      ) ??
      entry.models.find((candidate) => candidate.isDefault) ??
      entry.models[0]
    );
  }
  if (entry.driver === "antigravity") {
    return (
      entry.models.find((candidate) => candidate.slug === "gemini-3.8-flash") ??
      entry.models.find((candidate) => candidate.slug === "gemini-3.8-flash-medium") ??
      entry.models.find(
        (candidate) => /3\.8.*flash/i.test(candidate.slug) || /3\.8.*flash/i.test(candidate.name),
      ) ??
      entry.models.find(
        (candidate) => /flash/i.test(candidate.slug) || /flash/i.test(candidate.name),
      ) ??
      entry.models.find((candidate) => candidate.isDefault) ??
      entry.models[0]
    );
  }
  if (entry.driver === "codex") {
    return (
      entry.models.find((candidate) => candidate.slug === "gpt-6.1-sol") ??
      entry.models.find(
        (candidate) => /6\.1.*sol/i.test(candidate.slug) || /6\.1.*sol/i.test(candidate.name),
      ) ??
      entry.models.find(
        (candidate) => /sol/i.test(candidate.slug) || /sol/i.test(candidate.name),
      ) ??
      entry.models.find((candidate) => candidate.isDefault) ??
      entry.models[0]
    );
  }
  return entry.models.find((candidate) => candidate.isDefault) ?? entry.models[0];
}

/**
 * Subscription providers that can take over a chat stopped by a usage limit,
 * for clients that only hold the streamed provider list (mobile). Web applies
 * the same rules to its settings-aware entries in `providerFailover.ts`.
 *
 * Supported subscription providers qualify: Claude, Codex, Antigravity, and Cursor.
 * API-key providers need an explicit cost choice rather than an incidental failover.
 * Another instance of the limited account, or a provider reporting exhausted quota
 * whose reset time has not passed, is skipped.
 * Other-driver targets sort first because they are the likelier escape.
 */
export function selectProviderFailoverTargets(input: {
  readonly providers: ReadonlyArray<ServerProvider>;
  readonly current: ModelSelection;
  readonly supportsHandoff: boolean;
  readonly nowMs?: number;
}): ProviderFailoverTarget[] {
  if (!input.supportsHandoff) return [];
  const nowMs = input.nowMs ?? Date.now();
  const source = input.providers.find((entry) => entry.instanceId === input.current.instanceId);
  const driverOf = (target: ProviderFailoverTarget) =>
    input.providers.find((entry) => entry.instanceId === target.modelSelection.instanceId)?.driver;

  return input.providers
    .flatMap((entry) => {
      const isSupportedDriver =
        FAILOVER_SUPPORTED_DRIVERS.has(entry.driver) ||
        (entry.auth?.status === "authenticated" && entry.usageLimits !== undefined);

      if (
        entry.instanceId === input.current.instanceId ||
        !isSupportedDriver ||
        !entry.enabled ||
        !entry.installed ||
        entry.availability === "unavailable" ||
        entry.status !== "ready"
      ) {
        return [];
      }

      // Check if candidate shares the same underlying account as the current instance
      const isSameAccount =
        (source?.continuation?.groupKey !== undefined &&
          source.continuation.groupKey === entry.continuation?.groupKey) ||
        (source?.driver === entry.driver &&
          source.auth?.email &&
          entry.auth?.email &&
          source.auth.email.trim().toLowerCase() === entry.auth.email.trim().toLowerCase()) ||
        (source?.usageLimits?.credentialFingerprint &&
          entry.usageLimits?.credentialFingerprint &&
          source.usageLimits.credentialFingerprint === entry.usageLimits.credentialFingerprint);

      if (isSameAccount) {
        return [];
      }

      // Check if candidate is already rate-limited, taking window reset times into account
      if (
        entry.usageLimits?.windows.some((window) => isProviderUsageWindowExhausted(window, nowMs))
      ) {
        return [];
      }

      const model = recommendedFailoverModel(entry);
      if (!model) return [];

      const effort =
        entry.driver === "claudeAgent" || entry.driver === "codex" || entry.driver === "antigravity"
          ? "medium"
          : undefined;

      return [
        {
          label: resolveProviderInstanceDisplayName(entry),
          modelSelection: {
            instanceId: entry.instanceId,
            model: model.slug,
            ...(effort ? { options: [{ id: "effort", value: effort }] } : {}),
          },
        },
      ];
    })
    .sort(
      (left, right) =>
        Number(driverOf(left) === source?.driver) - Number(driverOf(right) === source?.driver),
    );
}
