import { describe, expect, it } from "@effect/vitest";
import type { ScribeHistoryItem } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as TestClock from "effect/testing/TestClock";

import { computeGoals, dailyGoal, levelForXp, xpForLevel } from "./goals.ts";
import { computeInsights } from "./insights.ts";
import {
  HISTORY_CACHE_MS,
  MAX_STATS_ITEMS,
  cachedHistory,
  makeScribeStats,
  readAllHistory,
} from "./scribeStats.ts";
import { parityFixture as fx } from "./scribeStats.fixture.ts";
import { addDays, countWords, makeDayOf } from "./statsDays.ts";

const NOW = Date.parse("2026-10-26T20:00:00Z");

const item = (
  at: string,
  over: Partial<ScribeHistoryItem> & { words?: number } = {},
): ScribeHistoryItem => {
  const text = Array.from({ length: over.words ?? 3 }, () => "word").join(" ");
  return {
    id: at,
    at,
    mode: "hold",
    app: "chrome.exe",
    rawText: text,
    cleanedText: text,
    words: over.words ?? 3,
    metrics: { transcribeMs: 100, polishMs: 50, totalMs: 200 },
    pasted: true,
    ...over,
  };
};

describe("parity with the Python goals.py and load_insights", () => {
  it("matches the Insights numbers for 40 synthetic rows", () => {
    expect(computeInsights(fx.items, fx.now, fx.timeZone)).toEqual(fx.insights);
  });

  it("matches the Goals snapshot", () => {
    expect(computeGoals(fx.items, fx.now, fx.timeZone)).toEqual(fx.goals);
  });

  it("matches the Goals snapshot with a fixed daily goal", () => {
    expect(computeGoals(fx.items, fx.now, fx.timeZone, { dailyWords: 800 })).toEqual(
      fx.goalsFixed800,
    );
  });

  it("matches the level curve for levels 1 to 120", () => {
    expect(fx.levels.map((_, i) => xpForLevel(i + 1))).toEqual(fx.levels);
    expect(fx.levels.every((xp, i) => levelForXp(xp) === i + 1)).toBe(true);
  });

  it("uses the local day, not the UTC day", () => {
    // 4:30 AM UTC on the 27th is 9:30 PM on the 26th in Phoenix.
    const insights = computeInsights(fx.items, fx.now, fx.timeZone);
    expect(insights.weekly.days.at(-1)?.day).toBe("2026-10-26");
    expect(computeInsights(fx.items, fx.now, "UTC").weekly.days.at(-1)?.day).toBe("2026-10-27");
  });
});

describe("computeInsights", () => {
  it("returns zeros for no history", () => {
    const out = computeInsights([], NOW, "UTC");
    expect(out).toMatchObject({ words: 0, transcripts: 0, daysActive: 0, firstDay: null, p50: 0 });
    expect(out.byMode).toEqual([]);
  });

  it("merges one app across name cases and skips rows with no speech timing", () => {
    const out = computeInsights(
      [
        item("2026-10-26T10:00:00Z", { app: "Leonidas Code.exe" }),
        item("2026-10-26T09:00:00Z", {
          app: "leonidas code",
          metrics: { transcribeMs: 0, polishMs: 0, totalMs: 900 },
        }),
      ],
      NOW,
      "UTC",
    );
    expect(out.byApp).toEqual([{ key: "leonidas code", count: 2 }]);
    expect(out).toMatchObject({ latencySamples: 2, sttP50: 100, polishP50: 50 });
  });

  it("does not count rewrite words or latency, but counts the item", () => {
    const out = computeInsights(
      [
        item("2026-10-26T10:00:00Z", { mode: "rewrite", preset: "Clarity", words: 50 }),
        item("2026-10-26T09:00:00Z", { words: 4 }),
      ],
      NOW,
      "UTC",
    );
    expect(out).toMatchObject({ words: 4, transcripts: 2, todayTranscripts: 1, latencySamples: 1 });
  });

  it("ranks apps by count and strips .exe", () => {
    const out = computeInsights(
      [
        item("2026-10-26T10:00:00Z", { app: "code.exe" }),
        item("2026-10-26T09:00:00Z", { app: "chrome.exe" }),
        item("2026-10-26T08:00:00Z", { app: "chrome.exe" }),
      ],
      NOW,
      "UTC",
    );
    expect(out.byApp).toEqual([
      { key: "chrome", count: 2 },
      { key: "code", count: 1 },
    ]);
  });
});

describe("computeGoals", () => {
  it("starts a new user at level 1 with a 500 word goal and three quests", () => {
    const out = computeGoals([], NOW, "UTC");
    expect(out).toMatchObject({ xp: 0, level: 1, rank: "Keyboard Hostage", streak: 0 });
    expect(out.today.goal).toBe(500);
    expect(out.quests).toHaveLength(3);
    expect(out.quests[0]?.id).toBe("deep");
  });

  it("gives agent prompts 1.5x XP and a deep bonus at 100 words", () => {
    const out = computeGoals(
      [item("2026-10-26T10:00:00Z", { app: "claude.exe", words: 120 })],
      NOW,
      "UTC",
    );
    expect(out.today).toMatchObject({ deep: 1, dictations: 1 });
    expect(out.today.xp).toBe(120 * 1.5 + 25);
  });

  it("keeps the streak alive when today has not started", () => {
    const out = computeGoals(
      [item("2026-10-25T10:00:00Z"), item("2026-10-24T10:00:00Z")],
      NOW,
      "UTC",
    );
    expect(out.streak).toBe(2);
  });

  it("adapts the daily goal to 110% of the recent average, rounded up to 50", () => {
    expect(dailyGoal(new Map(), "2026-10-26")).toBe(500);
    expect(dailyGoal(new Map([["2026-10-25", 2000]]), "2026-10-26")).toBe(2200);
    expect(dailyGoal(new Map([["2026-10-25", 2000]]), "2026-10-26", 800)).toBe(800);
  });

  it("gives every user the same quests on the same day", () => {
    const a = computeGoals([], NOW, "UTC").quests.map((q) => q.id);
    const b = computeGoals([], NOW + 1000, "UTC").quests.map((q) => q.id);
    expect(a).toEqual(b);
    expect(new Set(a).size).toBe(3);
  });
});

describe("day helpers", () => {
  it("counts words like Python split()", () => {
    expect(countWords("  a  b\tc\n")).toBe(3);
    expect(countWords("")).toBe(0);
  });

  it("adds days across a month end", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("maps an instant to the zone's day", () => {
    const ms = Date.parse("2026-10-27T04:30:00Z");
    expect(makeDayOf("America/Phoenix")(ms)).toBe("2026-10-26");
    expect(makeDayOf("UTC")(ms)).toBe("2026-10-27");
  });
});

describe("readAllHistory", () => {
  const page = (from: number, size: number, more: boolean) => ({
    items: Array.from({ length: size }, (_, i) =>
      item(`2026-10-26T10:00:${String(i % 60).padStart(2, "0")}Z`, { id: `h${from + i}` }),
    ),
    next: more ? `h${from + size}` : null,
  });

  it.effect("reads every page until the engine has no more", () =>
    Effect.gen(function* () {
      const calls: Array<string | undefined> = [];
      const result = yield* readAllHistory((input) => {
        calls.push(input.before);
        return Effect.succeed(calls.length < 3 ? page(0, 500, true) : page(1000, 20, false));
      });
      expect(calls).toEqual([undefined, "h500", "h500"]);
      expect(result).toMatchObject({ truncated: false });
      expect(result.items).toHaveLength(1020);
    }),
  );

  it.effect("stops at the cap and says so", () =>
    Effect.gen(function* () {
      const result = yield* readAllHistory(() => Effect.succeed(page(0, 500, true)));
      expect(result.items).toHaveLength(MAX_STATS_ITEMS);
      expect(result.truncated).toBe(true);
    }),
  );

  it.effect("falls back to the server zone for a bad zone name", () =>
    Effect.gen(function* () {
      const out = yield* makeScribeStats({
        listHistory: () => Effect.succeed({ items: [], next: null }),
        getSettings: Effect.never,
      }).getInsights({ timeZone: "Not/AZone" });
      expect(out).toMatchObject({ words: 0, truncated: false });
    }),
  );
});

describe("cachedHistory", () => {
  const engineWith = (newest: { id: string }) => {
    const calls: Array<number | undefined> = [];
    const listHistory = (input: { readonly limit?: number | undefined }) => {
      calls.push(input.limit);
      return Effect.succeed({
        items: [item("2026-10-26T10:00:00Z", { id: newest.id })],
        next: null,
      });
    };
    return { calls, listHistory };
  };

  it.effect("reuses the read while the newest row is the same", () =>
    Effect.gen(function* () {
      const engine = engineWith({ id: "a" });
      const history = cachedHistory(engine.listHistory);
      yield* history;
      yield* history;
      expect(engine.calls).toEqual([500, 1]);
    }),
  );

  it.effect("reads again when a new dictation is the newest row", () =>
    Effect.gen(function* () {
      const newest = { id: "a" };
      const engine = engineWith(newest);
      const history = cachedHistory(engine.listHistory);
      yield* history;
      newest.id = "b";
      const read = yield* history;
      expect(engine.calls).toEqual([500, 1, 500]);
      expect(read.items[0]?.id).toBe("b");
    }),
  );

  it.effect("reads again without a probe after the cache time", () =>
    Effect.gen(function* () {
      const engine = engineWith({ id: "a" });
      const history = cachedHistory(engine.listHistory);
      yield* history;
      yield* TestClock.adjust(HISTORY_CACHE_MS);
      yield* history;
      expect(engine.calls).toEqual([500, 500]);
    }),
  );
});
