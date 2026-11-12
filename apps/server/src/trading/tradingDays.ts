import { TradingStateError } from "@t3tools/contracts";
import { writeFileStringAtomically } from "@t3tools/shared/atomicWrite";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import { requireTradingRoot } from "./readTradingState.ts";
import { childPath, requireDay } from "./tradingPaths.ts";

/** A note is plain Markdown. Longer text is refused, not cut. */
const MAX_NOTE_CHARACTERS = 20_000;

const readFailed = () => new TradingStateError({ reason: "read_failed" });

/** `trading/days/<day>.md`, checked to stay in `trading/days/`. */
const dayFile = Effect.fn("trading.dayFile")(function* (root: string, day: string) {
  const path = yield* Path.Path;
  const folder = path.join(root, "trading", "days");
  return yield* childPath(folder, `${day}.md`);
});

/** The end-of-day note of one day. A day with no note file reads as an empty note. */
export const readDayNote = Effect.fn("trading.readDayNote")(function* (
  aiosRoot: string | null,
  input: { readonly day: string },
) {
  const root = yield* requireTradingRoot(aiosRoot);
  const day = yield* requireDay(input.day);
  const fs = yield* FileSystem.FileSystem;
  const file = yield* dayFile(root, day);
  const note = yield* fs.exists(file).pipe(
    Effect.flatMap((found) => (found ? fs.readFileString(file) : Effect.succeed(""))),
    Effect.mapError(readFailed),
  );
  return { day, note };
});

/** Saves the note of one day in one atomic write. Replaces the note the file held before. */
export const saveDayNote = Effect.fn("trading.saveDayNote")(function* (
  aiosRoot: string | null,
  input: { readonly day: string; readonly note: string },
) {
  const root = yield* requireTradingRoot(aiosRoot);
  const day = yield* requireDay(input.day);
  if ([...input.note].length > MAX_NOTE_CHARACTERS) {
    return yield* new TradingStateError({ reason: "note_too_long" });
  }
  const file = yield* dayFile(root, day);
  yield* writeFileStringAtomically({ filePath: file, contents: input.note }).pipe(
    Effect.mapError(readFailed),
  );
});
