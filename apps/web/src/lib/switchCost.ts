import type { CacheImpact } from "@t3tools/client-runtime/cache-awareness";

import { formatTokenCount } from "./usageLimitsPopover";

/** Below this size a re-read costs too little to mention. */
const MIN_CONTEXT_TOKENS = 5_000;

export interface SwitchCost {
  readonly tokens: number;
  readonly usd: number;
}

/**
 * What the next message costs when a switch drops the cache: the whole context is read again
 * at the new model's full input price. Null when the size or the price is unknown, or the
 * context is small.
 */
export function estimateSwitchCost(
  contextTokens: number | null | undefined,
  inputPricePerMillion: number | null | undefined,
): SwitchCost | null {
  if (
    contextTokens == null ||
    inputPricePerMillion == null ||
    !Number.isFinite(contextTokens) ||
    !Number.isFinite(inputPricePerMillion) ||
    contextTokens < MIN_CONTEXT_TOKENS ||
    inputPricePerMillion <= 0
  ) {
    return null;
  }
  return { tokens: contextTokens, usd: (contextTokens / 1_000_000) * inputPricePerMillion };
}

function formatUsd(usd: number): string {
  if (usd < 0.01) return "under $0.01";
  return usd < 10 ? `$${usd.toFixed(2)}` : `$${Math.round(usd)}`;
}

/** Adds the estimate to a model or connection switch warning. Other warnings stay as they are. */
export function withSwitchCost(
  impact: CacheImpact | null,
  cost: SwitchCost | null,
): CacheImpact | null {
  if (!impact || !cost || (impact.category !== "model" && impact.category !== "account")) {
    return impact;
  }
  return {
    ...impact,
    message: `${impact.message} That message re-reads about ${formatTokenCount(cost.tokens)} tokens: about ${formatUsd(cost.usd)} at the new model's input price.`,
  };
}
