import type {
  ModelSelection,
  ProviderDriverKind,
  ProviderInstanceId,
  ServerProviderUsageWindow,
  UsageLimitSourceSnapshots,
} from "@t3tools/contracts";
import { getProviderReadiness, isProviderTextGenerationCapable } from "@t3tools/contracts";
import type { UnifiedSettings } from "@t3tools/contracts/settings";
import { type AppModelOption, getAppModelOptionsForInstance } from "../../modelSelection";
import { isProviderInstancePickerReady, type ProviderInstanceEntry } from "../../providerInstances";

export interface ProviderFailoverModelChoice {
  readonly slug: string;
  readonly name: string;
  readonly isDefault?: boolean;
}

export interface ProviderFailoverTarget {
  readonly instanceId: ProviderInstanceId;
  readonly driverKind: ProviderDriverKind;
  readonly label: string;
  readonly modelSelection: ModelSelection;
  readonly availableModels: ReadonlyArray<ProviderFailoverModelChoice>;
}

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

function isProviderInstanceRateLimited(
  entry: ProviderInstanceEntry,
  sources?: UsageLimitSourceSnapshots,
  nowMs = Date.now(),
): boolean {
  // 1. Check direct windows on usageLimits
  if (
    entry.snapshot.usageLimits?.windows.some((window) =>
      isProviderUsageWindowExhausted(window, nowMs),
    )
  ) {
    return true;
  }

  // 2. Check message for explicit rate/quota limit mentions
  if (
    entry.snapshot.message &&
    /usage limit|rate limit|quota exceeded|limit reached/i.test(entry.snapshot.message)
  ) {
    return true;
  }

  // 3. Check hub / proxy sources if provided
  if (sources && sources.length > 0) {
    const email = entry.snapshot.auth.email?.trim().toLowerCase();
    const fingerprint = entry.snapshot.usageLimits?.credentialFingerprint;
    for (const source of sources) {
      for (const account of source.accounts) {
        if (account.driver !== entry.driverKind) continue;
        const accountEmail = account.email?.trim().toLowerCase();
        const matchesAccount =
          (email && accountEmail && email === accountEmail) ||
          (fingerprint &&
            account.usageLimits.credentialFingerprint &&
            fingerprint === account.usageLimits.credentialFingerprint);
        if (matchesAccount) {
          if (
            account.usageLimits.windows.some((window) =>
              isProviderUsageWindowExhausted(window, nowMs),
            )
          ) {
            return true;
          }
        }
      }
    }
  }

  return false;
}

function resolveRecommendedFailoverModel(
  driverKind: ProviderDriverKind,
  models: ReadonlyArray<AppModelOption>,
): { readonly modelSlug: string; readonly effort?: "medium" } {
  if (driverKind === "claudeAgent") {
    // Claude: Sonnet 5.5 on Medium effort
    const sonnet =
      models.find((m) => m.slug === "claude-sonnet-5-5") ??
      models.find((m) => /sonnet.*5\.5/i.test(m.slug) || /sonnet.*5\.5/i.test(m.name)) ??
      models.find((m) => /sonnet/i.test(m.slug) || /sonnet/i.test(m.name)) ??
      models.find((m) => m.isDefault) ??
      models[0]!;
    return { modelSlug: sonnet.slug, effort: "medium" };
  }
  if (driverKind === "codex") {
    // ChatGPT: GPT 6.1 Sol on Medium effort
    const sol =
      models.find((m) => m.slug === "gpt-6.1-sol") ??
      models.find((m) => /6\.1.*sol/i.test(m.slug) || /6\.1.*sol/i.test(m.name)) ??
      models.find((m) => /sol/i.test(m.slug) || /sol/i.test(m.name)) ??
      models.find((m) => m.isDefault) ??
      models[0]!;
    return { modelSlug: sol.slug, effort: "medium" };
  }
  if (driverKind === "antigravity") {
    // Antigravity: Gemini 3.8 Flash on Medium effort
    const flash =
      models.find((m) => m.slug === "gemini-3.8-flash") ??
      models.find((m) => m.slug === "gemini-3.8-flash-medium") ??
      models.find((m) => /3\.8.*flash/i.test(m.slug) || /3\.8.*flash/i.test(m.name)) ??
      models.find((m) => /flash/i.test(m.slug) || /flash/i.test(m.name)) ??
      models.find((m) => m.isDefault) ??
      models[0]!;
    return { modelSlug: flash.slug, effort: "medium" };
  }
  const defaultModel = models.find((m) => m.isDefault) ?? models[0]!;
  return { modelSlug: defaultModel.slug };
}

export function createTargetForModel(
  target: ProviderFailoverTarget,
  modelSlug: string,
): ProviderFailoverTarget {
  const effort =
    target.driverKind === "claudeAgent" ||
    target.driverKind === "codex" ||
    target.driverKind === "antigravity"
      ? "medium"
      : undefined;
  return {
    ...target,
    modelSelection: {
      instanceId: target.instanceId,
      model: modelSlug,
      ...(effort ? { options: [{ id: "effort", value: effort }] } : {}),
    },
  };
}

export function getProviderFailoverTargets(input: {
  readonly entries: ReadonlyArray<ProviderInstanceEntry>;
  readonly settings: UnifiedSettings;
  readonly current: ModelSelection;
  readonly supportsHandoff: boolean;
  readonly usageLimitSources?: UsageLimitSourceSnapshots | undefined;
  readonly nowMs?: number | undefined;
}): ProviderFailoverTarget[] {
  if (!input.supportsHandoff) return [];
  const nowMs = input.nowMs ?? Date.now();
  const source = input.entries.find((entry) => entry.instanceId === input.current.instanceId);
  return input.entries
    .flatMap((entry) => {
      if (
        entry.instanceId === input.current.instanceId ||
        !isProviderTextGenerationCapable(entry.snapshot) ||
        !entry.installed ||
        !isProviderInstancePickerReady(entry) ||
        getProviderReadiness(entry.snapshot, { nowMs }).color !== "green"
      ) {
        return [];
      }

      // Check if candidate shares the same underlying account as the current instance
      const isSameAccount =
        (source?.continuationGroupKey !== undefined &&
          source.continuationGroupKey === entry.continuationGroupKey) ||
        (source?.snapshot.driver === entry.snapshot.driver &&
          source.snapshot.auth.email &&
          entry.snapshot.auth.email &&
          source.snapshot.auth.email.trim().toLowerCase() ===
            entry.snapshot.auth.email.trim().toLowerCase()) ||
        (source?.snapshot.usageLimits?.credentialFingerprint &&
          entry.snapshot.usageLimits?.credentialFingerprint &&
          source.snapshot.usageLimits.credentialFingerprint ===
            entry.snapshot.usageLimits.credentialFingerprint);
      if (isSameAccount) {
        return [];
      }

      // Check if candidate is already rate-limited
      if (isProviderInstanceRateLimited(entry, input.usageLimitSources, nowMs)) {
        return [];
      }

      const models = getAppModelOptionsForInstance(input.settings, entry).filter(
        (model) => !model.isUnavailable,
      );
      if (models.length === 0) {
        return [];
      }

      const { modelSlug, effort } = resolveRecommendedFailoverModel(entry.driverKind, models);
      const options = effort ? [{ id: "effort", value: effort }] : undefined;

      const availableModels: ProviderFailoverModelChoice[] = models.map((m) => ({
        slug: m.slug,
        name: m.name,
        isDefault: m.slug === modelSlug,
      }));

      return [
        {
          instanceId: entry.instanceId,
          driverKind: entry.driverKind,
          label: entry.displayName,
          modelSelection: {
            instanceId: entry.instanceId,
            model: modelSlug,
            ...(options ? { options } : {}),
          },
          availableModels,
        },
      ];
    })
    .sort((left, right) => {
      const driverOf = (target: ProviderFailoverTarget) =>
        input.entries.find((entry) => entry.instanceId === target.instanceId)?.driverKind;
      return (
        Number(driverOf(left) === source?.driverKind) -
        Number(driverOf(right) === source?.driverKind)
      );
    });
}

/** One client action owns its in-flight request; the server guards the source run. */
export async function continueWithProvider(input: {
  readonly pending: { current: boolean };
  readonly targets: ReadonlyArray<ProviderFailoverTarget>;
  readonly target: ProviderFailoverTarget;
  readonly continueWith: (target: ProviderFailoverTarget) => Promise<void>;
}): Promise<void> {
  if (input.pending.current) return;
  const { target } = input;
  const matched = input.targets.find((candidate) => candidate.instanceId === target.instanceId);
  if (
    !matched ||
    (matched.modelSelection.model !== target.modelSelection.model &&
      !matched.availableModels.some((m) => m.slug === target.modelSelection.model))
  ) {
    throw new Error("This AI account is not available now. Choose another AI account.");
  }
  input.pending.current = true;
  try {
    await input.continueWith(target);
  } finally {
    input.pending.current = false;
  }
}
