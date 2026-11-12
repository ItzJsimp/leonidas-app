import {
  TradingStateError,
  type TradingPackView,
  type TradingStateResult,
} from "@t3tools/contracts";
import {
  deriveTradingState,
  liveEvents,
  parseLedger,
  parseTrades,
  productKey,
  type ProductRule,
} from "@t3tools/trading";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import { readWorkspaceFile } from "../taskBoard/aiosWorkspaces.ts";
import { readLinkedPack, type LinkedPack } from "./tradingPack.ts";

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
const MAX_ENTRIES = 50;

/** What the client may see of the pack: firm presets and the consent state, not rules or paths. */
function packView(linked: LinkedPack): TradingPackView {
  if (linked.status !== "ready") return linked;
  const { check } = linked;
  return {
    status: "ready",
    folder: linked.folder,
    firms: linked.pack.firms.map((firm) => ({
      id: firm.id,
      name: firm.name,
      products: firm.products.map(({ id, name, size, prices }) => ({ id, name, size, prices })),
    })),
    check: {
      status: check.status,
      module: check.status === "none" ? null : check.module,
      sha256: check.status === "none" || check.status === "missing" ? null : check.sha256,
    },
  };
}

/** The pack's firm rules, keyed like the accounts the Add forms write (firm name, product name). */
function productRules(linked: LinkedPack): ReadonlyMap<string, ProductRule> {
  const rules = new Map<string, ProductRule>();
  if (linked.status !== "ready") return rules;
  for (const firm of linked.pack.firms) {
    for (const product of firm.products) {
      rules.set(productKey(firm.name, product.name), {
        ...(product.maxLoss === null ? {} : { maxLoss: product.maxLoss }),
        ...(product.profitTarget === null ? {} : { profitTarget: product.profitTarget }),
        ...(product.consistencyPercent === null
          ? {}
          : { consistencyPercent: product.consistencyPercent }),
      });
    }
  }
  return rules;
}

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
  const [ledgerText, tradesText, linked] = yield* Effect.all([
    readText("ledger.jsonl"),
    readText("trades.jsonl"),
    readLinkedPack(root),
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
    state: deriveTradingState({
      events: ledger.events,
      trades: trades.trades,
      products: productRules(linked),
    }),
    pack: packView(linked),
    trades: trades.trades
      .map((trade) => ({ trade, time: Date.parse(trade.at) }))
      .toSorted((a, b) => b.time - a.time)
      .slice(0, JOURNAL_TRADES)
      .map(({ trade }) => trade),
    skippedLines: ledger.issues.length + trades.issues.length,
  } satisfies TradingStateResult;
});
