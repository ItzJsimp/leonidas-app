import { TradingStateError, type TradingAppendResult } from "@t3tools/contracts";
import { appendEvents } from "@t3tools/trading/ledgerFile";
import { parseEvent, type TradingEvent } from "@t3tools/trading";
import * as Effect from "effect/Effect";
import * as Path from "effect/Path";

import { readWorkspaceFile } from "../taskBoard/aiosWorkspaces.ts";

/**
 * Adds 1 to 3 events to `trading/ledger.jsonl` in a Trading workspace folder. Every event is checked
 * first. If one is invalid, nothing is written. `aiosRoot` is null when the workspace is unknown.
 */
export const appendTradingEvents = Effect.fn("trading.appendEvents")(function* (
  aiosRoot: string | null,
  events: ReadonlyArray<Record<string, unknown>>,
) {
  if (aiosRoot === null) return yield* new TradingStateError({ reason: "workspace_not_found" });
  const workspace = readWorkspaceFile(aiosRoot);
  if (workspace.status !== "ready" || workspace.file.type !== "trading") {
    return yield* new TradingStateError({ reason: "not_a_trading_workspace" });
  }
  const checked: TradingEvent[] = [];
  for (const event of events) {
    // shortcut: one author per local ledger, read the trader name from trading/settings.json when the setup wizard writes it
    const parsed = parseEvent({ ...event, author: "Trader" });
    if (typeof parsed === "string") {
      return yield* new TradingStateError({ reason: "invalid_event", detail: parsed });
    }
    checked.push(parsed);
  }
  const path = yield* Path.Path;
  yield* appendEvents(path.join(aiosRoot, "trading", "ledger.jsonl"), checked).pipe(
    Effect.mapError(() => new TradingStateError({ reason: "read_failed" })),
  );
  return { appended: checked.length } satisfies TradingAppendResult;
});
