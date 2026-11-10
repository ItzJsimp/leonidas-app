import { TradingStateError, type TradingStateResult } from "@t3tools/contracts";
import { deriveTradingState, liveEvents, parseLedger, parseTrades } from "@t3tools/trading";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import { readWorkspaceFile } from "../taskBoard/aiosWorkspaces.ts";

const MAX_ENTRIES = 50;

/**
 * Reads `trading/ledger.jsonl` and `trading/trades.jsonl` in a Trading workspace folder and derives
 * the full state. A missing file is an empty ledger. A corrupt line is skipped and counted.
 * `aiosRoot` is null when the workspace is unknown.
 */
export const readTradingState = Effect.fn("trading.readState")(function* (aiosRoot: string | null) {
  if (aiosRoot === null) return yield* new TradingStateError({ reason: "workspace_not_found" });
  const workspace = readWorkspaceFile(aiosRoot);
  if (workspace.status !== "ready" || workspace.file.type !== "trading") {
    return yield* new TradingStateError({ reason: "not_a_trading_workspace" });
  }
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const readText = (name: string) => {
    const file = path.join(aiosRoot, "trading", name);
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
  // Newest first for the Edit an entry list. `trade.tagged` has no row there.
  const entries = liveEvents(ledger.events, [])
    .filter((event) => event.kind !== "trade.tagged")
    .toReversed()
    .slice(0, MAX_ENTRIES)
    .map((event) => ({ ...event }));
  return {
    entries,
    state: deriveTradingState({ events: ledger.events, trades: trades.trades }),
    skippedLines: ledger.issues.length + trades.issues.length,
  } satisfies TradingStateResult;
});
