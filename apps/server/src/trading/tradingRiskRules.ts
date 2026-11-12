import type { TradingRiskRulesResult } from "@t3tools/contracts";
import { productKey } from "@t3tools/trading";
import * as Effect from "effect/Effect";

import { requireTradingRoot } from "./readTradingState.ts";
import { readLinkedPack, type LinkedPack } from "./tradingPack.ts";

/** What the Risk tab may see: risk states, the first day rule and firm limits. No pack paths. */
function riskRulesView(linked: LinkedPack): TradingRiskRulesResult {
  if (linked.status !== "ready") return { status: "none" };
  const { pack } = linked;
  const limits: Record<string, { dailyLoss: number | null; maxLoss: number | null }> = {};
  for (const firm of pack.firms) {
    for (const product of firm.products) {
      limits[productKey(firm.name, product.name)] = {
        dailyLoss: product.dailyLoss,
        maxLoss: product.maxLoss,
      };
    }
  }
  return {
    status: "ready",
    riskStates: pack.riskStates.map(
      ({ id, market, contracts, stopPoints, targetPoints, stopDollars, targetDollars }) => ({
        id,
        market,
        contracts,
        stopPoints,
        targetPoints,
        stopDollars,
        targetDollars,
      }),
    ),
    firstDay: pack.firstDay ?? null,
    limits,
  };
}

/** The linked pack's risk rules. A missing or invalid pack reads as `none`, never an error. */
export const readTradingRiskRules = Effect.fn("trading.readRiskRules")(function* (
  aiosRoot: string | null,
) {
  const root = yield* requireTradingRoot(aiosRoot);
  return riskRulesView(yield* readLinkedPack(root));
});
