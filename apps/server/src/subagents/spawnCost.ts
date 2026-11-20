/** The rough cost on the spawn card: start tokens times the model's input price (ADR-0082). */
import type { ModelRate } from "../usage/usagePricing.ts";

/** Null when the price table does not know the model. */
export function estimateSpawnCostUsd(input: {
  readonly startTokens: number;
  readonly rate: Pick<ModelRate, "inputCostPerToken"> | null;
}): number | null {
  return input.rate === null ? null : input.startTokens * input.rate.inputCostPerToken;
}

/** "about $0.02". Under one cent it reads "under $0.01" so the card never shows $0.00. */
export function formatRoughCost(usd: number | null): string {
  if (usd === null) return "cost unknown";
  return usd < 0.005 ? "under $0.01" : `about $${usd.toFixed(2)}`;
}
