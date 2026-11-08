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
// 5,815 rows read in about 45 ms (9 MB) on 2026-11-07. A 5,000 cap cut off the oldest week.
export const MAX_STATS_ITEMS = 20_000;
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

type HistoryRead = Effect.Success<ReturnType<typeof readAllHistory>>;

/** A full read is reused this long. A newer dictation ends it early. */
export const HISTORY_CACHE_MS = 30_000;

/**
 * One history read shared by Goals and Insights. A one-row probe checks the newest id,
 * so a new dictation always shows and an unchanged history costs one call, not ten.
 * shortcut: a deleted older row can show for up to 30 s, and two calls at the same moment
 * can both do a full read. Upgrade to an engine change counter if either matters.
 */
export const cachedHistory = (listHistory: StatsEngine["listHistory"]) => {
  let cached: { readonly at: number; readonly read: HistoryRead } | null = null;
  return Effect.gen(function* () {
    const now = yield* Clock.currentTimeMillis;
    if (cached !== null && now - cached.at < HISTORY_CACHE_MS) {
      const probe = yield* listHistory({ limit: 1 });
      if (probe.items[0]?.id === cached.read.items[0]?.id) return cached.read;
    }
    const read = yield* readAllHistory(listHistory);
    cached = { at: now, read };
    // Free the rows when the window ends. A later call reads again anyway.
    yield* Effect.forkDetach(
      Effect.sleep(HISTORY_CACHE_MS).pipe(
        Effect.andThen(
          Effect.sync(() => {
            if (cached?.at === now) cached = null;
          }),
        ),
      ),
    );
    return read;
  });
};

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

/** Goals and Insights for one engine. Make it once, so both share the cached history read. */
export const makeScribeStats = (engine: StatsEngine) => {
  const history = cachedHistory(engine.listHistory);

  const getInsights = (input: ScribeStatsInput): Effect.Effect<ScribeInsights, ScribeEngineError> =>
    Effect.gen(function* () {
      const { items, truncated } = yield* history;
      const now = yield* Clock.currentTimeMillis;
      return { ...computeInsights(items, now, validTimeZone(input.timeZone)), truncated };
    });

  /** The fixed daily goal comes from the engine `goals` settings section (`dailyWords`), if set. */
  const getGoals = (input: ScribeStatsInput): Effect.Effect<ScribeGoals, ScribeEngineError> =>
    Effect.gen(function* () {
      const { items, truncated } = yield* history;
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

  return { getInsights, getGoals };
};
