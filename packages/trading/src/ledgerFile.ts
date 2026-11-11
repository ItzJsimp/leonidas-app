import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";

import {
  parseEvent,
  parseLedger,
  parseTrade,
  serializeEvent,
  serializeTrade,
  type Trade,
  type TradingEvent,
} from "./events.ts";

export class LedgerError extends Data.TaggedError("LedgerError")<{ readonly reason: string }> {
  override get message() {
    return `Ledger event rejected: ${this.reason}`;
  }
}

export const readLedger = (path: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    return parseLedger((yield* fs.exists(path)) ? yield* fs.readFileString(path) : "");
  });

/** Appends lines in one write. A torn last line stays a separate line, so it cannot damage the new text. */
const appendText = (path: string, text: string) =>
  Effect.scoped(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const paths = yield* Path.Path;
      yield* fs.makeDirectory(paths.dirname(path), { recursive: true });
      const file = yield* fs.open(path, { flag: "a+" });
      const { size } = yield* file.stat;
      let separator = "";
      if (size > 0n) {
        yield* file.seek(size - 1n, "start");
        const last = yield* file.readAlloc(1);
        if (Option.isSome(last) && last.value[0] !== 0x0a) separator = "\n";
      }
      yield* file.writeAll(new TextEncoder().encode(separator + text));
      yield* file.sync;
    }),
  );

/** Appends validated events in one write and one sync. If any event is invalid, nothing is written. */
export const appendEvents = (path: string, events: readonly TradingEvent[]) =>
  Effect.gen(function* () {
    let lines = "";
    for (const event of events) {
      const checked = parseEvent(event);
      if (typeof checked === "string") return yield* new LedgerError({ reason: checked });
      lines += serializeEvent(checked);
    }
    yield* appendText(path, lines);
  });

/** Appends one validated event. */
export const appendEvent = (path: string, event: TradingEvent) => appendEvents(path, [event]);

/** Appends validated trades to `trades.jsonl` in one write. A bad trade writes nothing. */
export const appendTrades = (path: string, trades: readonly Trade[]) =>
  Effect.gen(function* () {
    const lines: string[] = [];
    for (const trade of trades) {
      const checked = parseTrade(trade);
      if (typeof checked === "string") return yield* new LedgerError({ reason: checked });
      lines.push(serializeTrade(checked));
    }
    if (lines.length > 0) yield* appendText(path, lines.join(""));
  });
