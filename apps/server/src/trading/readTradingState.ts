import { TradingStateError, type TradingStateResult } from "@t3tools/contracts";
import { deriveTradingState, parseLedger, parseTrades } from "@t3tools/trading";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import { readWorkspaceFile } from "../taskBoard/aiosWorkspaces.ts";

/** The Journal gets this many of the newest trades. */
const JOURNAL_TRADES = 300;

/** The workspace root when it is a Trading workspace. `aiosRoot` is null when the workspace is unknown. */
export const requireTradingRoot = (aiosRoot: string | null) => {
  if (aiosRoot === null)
    return Effect.fail(new TradingStateError({ reason: "workspace_not_found" }));
  const workspace = readWorkspaceFile(aiosRoot);
  return workspace.status === "ready" && workspace.file.type === "trading"
    ? Effect.succeed(aiosRoot)
    : Effect.fail(new TradingStateError({ reason: "not_a_trading_workspace" }));
};

/**
 * Reads `trading/ledger.jsonl` and `trading/trades.jsonl` in a Trading workspace folder and derives
 * the full state. A missing file is an empty ledger. A corrupt line is skipped and counted.
 */
export const readTradingState = Effect.fn("trading.readState")(function* (aiosRoot: string | null) {
  const root = yield* requireTradingRoot(aiosRoot);
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const readText = (name: string) => {
    const file = path.join(root, "trading", name);
    return fs.exists(file).pipe(
      Effect.flatMap((found) => (found ? fs.readFileString(file) : Effect.succeed(""))),
      Effect.mapError(() => new TradingStateError({ reason: "read_failed" })),
    );
  };
  const [ledgerText, tradesText] = yield* Effect.all([
    readText("ledger.jsonl"),
    readText("trades.jsonl"),
  ]);
  const ledger = parseLedger(ledgerText);
  const trades = parseTrades(tradesText);
  return {
    state: deriveTradingState({ events: ledger.events, trades: trades.trades }),
    trades: trades.trades
      .map((trade) => ({ trade, time: Date.parse(trade.at) }))
      .toSorted((a, b) => b.time - a.time)
      .slice(0, JOURNAL_TRADES)
      .map(({ trade }) => trade),
    skippedLines: ledger.issues.length + trades.issues.length,
  } satisfies TradingStateResult;
});
