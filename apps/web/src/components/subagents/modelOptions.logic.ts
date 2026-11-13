import type { ProviderDriverKind } from "@t3tools/contracts";

import { formatProviderDriverKindLabel } from "~/providerModels";

/** The part of a provider snapshot that the model list reads. */
export interface ModelListProvider {
  readonly driver: ProviderDriverKind;
  readonly displayName?: string | undefined;
  readonly enabled: boolean;
  readonly installed: boolean;
  readonly availability?: "available" | "unavailable" | undefined;
  readonly connectionIssue?:
    | "cli_missing"
    | "cli_too_old"
    | "signed_out"
    | "token_expired"
    | "quota_reached"
    | "network_blocked"
    | undefined;
  readonly models: ReadonlyArray<{
    readonly slug: string;
    readonly name: string;
    readonly isLegacy?: boolean | undefined;
  }>;
}

export interface ModelChoice {
  readonly slug: string;
  readonly label: string;
}

export interface ModelGroup {
  readonly provider: string;
  readonly models: ReadonlyArray<ModelChoice>;
}

/** Issues that mean the account cannot start a run now. A reached quota still counts as connected. */
const BLOCKING_ISSUES: ReadonlySet<string> = new Set([
  "cli_missing",
  "cli_too_old",
  "signed_out",
  "token_expired",
]);

/**
 * The models that the connected accounts offer, one group per account. An account that is off,
 * missing, unavailable or signed out is left out. A model that two accounts offer shows once.
 */
export function connectedModelGroups(
  providers: ReadonlyArray<ModelListProvider>,
): ReadonlyArray<ModelGroup> {
  const seen = new Set<string>();
  const groups: ModelGroup[] = [];
  for (const provider of providers) {
    if (!provider.enabled || !provider.installed) continue;
    if (provider.availability === "unavailable") continue;
    if (provider.connectionIssue !== undefined && BLOCKING_ISSUES.has(provider.connectionIssue)) {
      continue;
    }
    const models: ModelChoice[] = [];
    for (const model of provider.models) {
      if (model.isLegacy === true || seen.has(model.slug)) continue;
      seen.add(model.slug);
      models.push({ slug: model.slug, label: model.name });
    }
    if (models.length === 0) continue;
    groups.push({
      provider: provider.displayName ?? formatProviderDriverKindLabel(provider.driver),
      models,
    });
  }
  return groups;
}

/** The current model when no connected account offers it, or null. An empty value is "not set". */
export function unconnectedModel(
  groups: ReadonlyArray<ModelGroup>,
  current: string,
): string | null {
  const slug = current.trim();
  if (slug === "") return null;
  return groups.some((group) => group.models.some((model) => model.slug === slug)) ? null : slug;
}
