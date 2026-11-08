import type { ScribeGoals, ScribeInsights } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  countRows,
  dayBars,
  formatSeconds,
  hasNoStats,
  levelModel,
  needsRefresh,
  nextUnlocks,
  percentOf,
  unlockedCount,
  weekChange,
  weekHeadline,
  weekdayLabel,
} from "./stats.logic";

const insights = (weekly: Partial<ScribeInsights["weekly"]>, rest: Partial<ScribeInsights> = {}) =>
  ({
    words: 100,
    transcripts: 3,
    weekly: {
      words: 21_105,
      prevWords: 17_880,
      transcripts: 214,
      prevTranscripts: 196,
      p50: 1400,
      prevP50: 1600,
      topApp: "Claude",
      days: [],
      ...weekly,
    },
    ...rest,
  }) as ScribeInsights;

describe("week headline", () => {
  it("names the words, the change and the top app", () => {
    expect(weekHeadline(insights({}))).toBe(
      "This week you spoke 21,105 words, 18% more than last week, mostly in Claude.",
    );
  });

  it("drops the change when last week is empty and the app when there is none", () => {
    expect(weekHeadline(insights({ prevWords: 0, topApp: "" }))).toBe(
      "This week you spoke 21,105 words.",
    );
  });

  it("says so when nothing was dictated this week", () => {
    expect(weekHeadline(insights({ words: 0 }))).toBe("You have not dictated this week yet.");
  });

  it("reads a drop and a flat week", () => {
    expect(weekChange(80, 100)).toBe("20% fewer than last week");
    expect(weekChange(100, 100)).toBe("the same as last week");
    expect(weekChange(5, 0)).toBeNull();
  });
});

describe("speed", () => {
  it("shows seconds with one decimal", () => {
    expect(formatSeconds(1423)).toBe("1.4 s");
  });
});

describe("empty data", () => {
  it("is empty only with no words and no transcripts", () => {
    expect(hasNoStats(insights({}, { words: 0, transcripts: 0 }))).toBe(true);
    expect(hasNoStats(insights({}, { words: 0, transcripts: 2 }))).toBe(false);
  });
});

describe("day bars", () => {
  it("scales to the busiest day and marks it", () => {
    const bars = dayBars([
      { day: "2026-10-26", words: 3410 },
      { day: "2026-10-27", words: 4120 },
      { day: "2026-10-28", words: 0 },
    ]);
    expect(bars.map((b) => b.label)).toEqual(["Mon", "Tue", "Wed"]);
    expect(bars.map((b) => b.percent)).toEqual([83, 100, 0]);
    expect(bars.map((b) => b.busiest)).toEqual([false, true, false]);
  });

  it("keeps a tiny day visible and handles an all-zero week", () => {
    expect(
      dayBars([
        { day: "2026-10-26", words: 1 },
        { day: "2026-10-27", words: 9999 },
      ])[0]?.percent,
    ).toBe(4);
    expect(dayBars([{ day: "2026-10-26", words: 0 }])[0]).toMatchObject({
      percent: 0,
      busiest: false,
    });
  });

  it("keeps an unreadable day as text", () => {
    expect(weekdayLabel("nope")).toBe("nope");
  });
});

describe("lists", () => {
  it("limits rows and scales to the longest", () => {
    const rows = countRows(
      [
        { key: "Claude", count: 100 },
        { key: "Chrome", count: 50 },
        { key: "Tiny", count: 1 },
      ],
      2,
    );
    expect(rows).toEqual([
      { key: "Claude", count: 100, percent: 100 },
      { key: "Chrome", count: 50, percent: 50 },
    ]);
  });

  it("caps a percent at 100 and guards a zero need", () => {
    expect(percentOf(412, 100)).toBe(100);
    expect(percentOf(5, 0)).toBe(0);
    expect(percentOf(412, 750)).toBe(55);
  });
});

const goals = (over: Partial<ScribeGoals> = {}): ScribeGoals =>
  ({
    xp: 98_420,
    levelFloor: 96_075,
    levelCeil: 102_255,
    levelFrac: 0.379,
    nextRank: { level: 40, name: "Voice Architect" },
    achievements: [
      { id: "a", name: "A", how: "", glyph: "mic", key: "k", have: 5, need: 1, unlocked: true },
      {
        id: "b",
        name: "B",
        how: "",
        glyph: "mic",
        key: "k",
        have: 412,
        need: 750,
        unlocked: false,
      },
      { id: "c", name: "C", how: "", glyph: "mic", key: "k", have: 19, need: 30, unlocked: false },
    ],
    ...over,
  }) as ScribeGoals;

describe("level and achievements", () => {
  it("reports the xp to the next level and the next rank", () => {
    expect(levelModel(goals())).toEqual({
      toNext: 3835,
      percent: 38,
      nextRank: "Voice Architect at level 40",
    });
  });

  it("has no next rank at the top", () => {
    expect(levelModel(goals({ nextRank: null })).nextRank).toBeNull();
  });

  it("counts unlocked ones and finds the nearest locked one", () => {
    expect(unlockedCount(goals().achievements)).toBe(1);
    expect(nextUnlocks(goals().achievements, 3)[0]?.id).toBe("c");
    expect(nextUnlocks(goals().achievements.slice(0, 1), 3)).toEqual([]);
  });
});

describe("needsRefresh", () => {
  it("records the first look without a refetch, then refetches once per new dictation", () => {
    const shown = new Map<string, string | undefined>();
    expect(needsRefresh(shown, "goals", "a")).toBe(false);
    expect(needsRefresh(shown, "goals", "a")).toBe(false);
    expect(needsRefresh(shown, "goals", "b")).toBe(true);
    expect(needsRefresh(shown, "goals", "b")).toBe(false);
  });

  it("keeps each tab apart", () => {
    const shown = new Map<string, string | undefined>([["goals", "a"]]);
    expect(needsRefresh(shown, "insights", "b")).toBe(false);
    expect(needsRefresh(shown, "goals", "b")).toBe(true);
  });
});
