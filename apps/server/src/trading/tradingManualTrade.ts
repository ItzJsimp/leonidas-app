import { TradingStateError, type TradingTradeAddInput } from "@t3tools/contracts";
import type { Trade } from "@t3tools/trading";
import { appendTrades } from "@t3tools/trading/ledgerFile";
import * as Crypto from "effect/Crypto";
import * as Effect from "effect/Effect";
import * as Path from "effect/Path";

import { readTradingState, requireTradingRoot } from "./readTradingState.ts";
import { requireDay } from "./tradingPaths.ts";

/**
 * Adds one trade the trader typed in. It is one new line in `trades.jsonl`, with the platform
 * `manual`. The trade has no time of day, so its time is midnight of its day.
 */
export const addManualTrade = Effect.fn("trading.addManualTrade")(function* (
  aiosRoot: string | null,
  input: Omit<TradingTradeAddInput, "workspaceId">,
) {
  const root = yield* requireTradingRoot(aiosRoot);
  const day = yield* requireDay(input.day);
  const { state } = yield* readTradingState(root);
  const account = state.accounts.find(
    (item) => item.id === input.accountId && item.closedReason === null,
  );
  if (!account) return yield* new TradingStateError({ reason: "unknown_account" });
  const crypto = yield* Crypto.Crypto;
  const uuid = (yield* crypto.randomUUIDv4().pipe(Effect.orDie)).replaceAll("-", "");
  const trade: Trade = {
    id: `manual-${uuid}`,
    accountId: account.id,
    day,
    at: `${day}T00:00:00`,
    pnl: input.pnl,
    contract: input.contract,
    side: input.side,
    size: input.size,
    points: input.points,
  };
  const path = yield* Path.Path;
  yield* appendTrades(path.join(root, "trading", "trades.jsonl"), [trade]).pipe(
    Effect.catchTags({
      LedgerError: (error) =>
        new TradingStateError({ reason: "invalid_trade", detail: error.reason }),
      PlatformError: () => new TradingStateError({ reason: "read_failed" }),
    }),
  );
  return { id: trade.id };
});
