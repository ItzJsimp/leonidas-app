import type {
  ScribeEngineError,
  ScribeGoals,
  ScribeHistoryItem,
  ScribeHistoryPage,
  ScribeInsights,
  ScribeListHistoryInput,
  ScribeSettings,
  ScribeStatsInput,
} from "@t3tools/contracts";
import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";

import { computeGoals } from "./goals.ts";
import { computeInsights } from "./insights.ts";

/** Stats stop reading here: 10 engine pages, about 1 s on a local engine. */
export const MAX_STATS_ITEMS = 5_000;
const PAGE_SIZE = 500;

interface StatsEngine {
  readonly listHistory: (
    input: ScribeListHistoryInput,
  ) => Effect.Effect<ScribeHistoryPage, ScribeEngineError>;
  readonly getSettings: Effect.Effect<ScribeSettings, ScribeEngineError>;
}

/** Newest first, up to `MAX_STATS_ITEMS`. `truncated` means older rows were left out. */
export const readAllHistory = (listHistory: StatsEngine["listHistory"]) =>
  Effect.gen(function* () {
    const items: ScribeHistoryItem[] = [];
    let before: string | undefined;
    for (;;) {
      const page = yield* listHistory({ limit: PAGE_SIZE, ...(before ? { before } : {}) });
      items.push(...page.items);
      if (page.next === null || page.items.length === 0) return { items, truncated: false };
      if (items.length >= MAX_STATS_ITEMS) {
        return { items: items.slice(0, MAX_STATS_ITEMS), truncated: true };
      }
      before = page.next;
    }
  });

/** A bad zone name from a client must not fail the call: fall back to the server zone. */
const validTimeZone = (timeZone: string | undefined): string | undefined => {
  if (timeZone === undefined) return undefined;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return timeZone;
  } catch {
    return undefined;
  }
};

export const getInsights = (
  engine: StatsEngine,
  input: ScribeStatsInput,
): Effect.Effect<ScribeInsights, ScribeEngineError> =>
  Effect.gen(function* () {
    const { items, truncated } = yield* readAllHistory(engine.listHistory);
    const now = yield* Clock.currentTimeMillis;
    return { ...computeInsights(items, now, validTimeZone(input.timeZone)), truncated };
  });

/** The fixed daily goal comes from the engine `goals` settings section (`dailyWords`), if set. */
export const getGoals = (
  engine: StatsEngine,
  input: ScribeStatsInput,
): Effect.Effect<ScribeGoals, ScribeEngineError> =>
  Effect.gen(function* () {
    const { items, truncated } = yield* readAllHistory(engine.listHistory);
    const now = yield* Clock.currentTimeMillis;
    const settings = yield* engine.getSettings.pipe(Effect.option);
    const fixed =
      settings._tag === "Some" ? settings.value.sections.goals["dailyWords"] : undefined;
    const dailyWords = typeof fixed === "number" && fixed > 0 ? fixed : undefined;
    return {
      ...computeGoals(items, now, validTimeZone(input.timeZone), { dailyWords }),
      truncated,
    };
  });
