import { TradingStateError } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Path from "effect/Path";

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** A day as `YYYY-MM-DD`. Only a checked day may become part of a path. */
export const requireDay = (day: string) =>
  DAY.test(day)
    ? Effect.succeed(day)
    : Effect.fail(new TradingStateError({ reason: "invalid_day" }));

/** `name` inside `folder`. Fails when the result is not a direct child of `folder`. */
export const childPath = Effect.fn("trading.childPath")(function* (folder: string, name: string) {
  const path = yield* Path.Path;
  const base = path.join(folder);
  const file = path.join(base, name);
  if (path.dirname(file) !== base) {
    return yield* new TradingStateError({ reason: "invalid_name" });
  }
  return file;
});
