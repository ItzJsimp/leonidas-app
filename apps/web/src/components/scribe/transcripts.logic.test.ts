import type { ScribeHistoryItem } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  DAYS_PER_PAGE,
  ITEMS_PER_DAY,
  dayKey,
  dayLabel,
  daySummary,
  groupByDay,
  mergeTranscripts,
  moreDaysLabel,
  rewriteLabel,
  spokenWords,
  timeLabel,
  visibleDayItems,
} from "./transcripts.logic";

const item = (id: string, at: string, rawText: string, cleanedText: string): ScribeHistoryItem => ({
  id,
  at,
  mode: "hold",
  app: "",
  rawText,
  cleanedText,
  words: cleanedText.split(/\s+/).filter(Boolean).length,
  metrics: { transcribeMs: 1, polishMs: 1, totalMs: 2 },
  pasted: true,
});

// Noon local time, so the local calendar day is the same in every time zone.
const local = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).toISOString();

describe("dayLabel", () => {
  const today = new Date(2026, 8, 25);
  it("says Today and Yesterday", () => {
    expect(dayLabel("2026-09-25", today)).toBe("Today");
    expect(dayLabel("2026-09-24", today)).toBe("Yesterday");
  });
  it("spells older days with an ordinal", () => {
    expect(dayLabel("2026-09-23", today)).toBe("Wednesday, September 23rd, 2026");
    expect(dayLabel("2026-09-11", today)).toBe("Friday, September 11th, 2026");
    expect(dayLabel("2026-09-22", today)).toBe("Tuesday, September 22nd, 2026");
    expect(dayLabel("2026-09-01", today)).toBe("Tuesday, September 1st, 2026");
  });
  it("keeps an unreadable day as it is, or Undated", () => {
    expect(dayLabel("nope", today)).toBe("nope");
    expect(dayLabel("", today)).toBe("Undated");
  });
});

describe("dayKey", () => {
  it("uses the local calendar day", () => {
    expect(dayKey(local(2026, 9, 25, 23))).toBe("2026-09-25");
    expect(dayKey(local(2026, 9, 25, 0))).toBe("2026-09-25");
  });
  it("returns an empty key for an unreadable time", () => {
    expect(dayKey("not a time")).toBe("");
  });
});

describe("spokenWords", () => {
  it("counts the raw words, and the cleaned words when raw is empty", () => {
    expect(spokenWords(item("1", local(2026, 9, 25), "um hello there", "Hello there."))).toBe(3);
    expect(spokenWords(item("2", local(2026, 9, 25), "", "Hello there."))).toBe(2);
  });
  it("ignores the pause mark", () => {
    expect(spokenWords(item("3", local(2026, 9, 25), "one ⏸ two", "One two."))).toBe(2);
  });
});

describe("groupByDay", () => {
  const items = [
    item("a", local(2026, 9, 25, 15), "buy milk today", "Buy milk today."),
    item("b", local(2026, 9, 25, 9), "call jersey", "Call Gersi."),
    item("c", local(2026, 9, 23, 10), "ship the thing", "Ship the thing."),
  ];

  it("groups newest first and totals words per day", () => {
    const groups = groupByDay(items, "", new Set());
    expect(groups.map((g) => [g.day, g.items.length, g.words])).toEqual([
      ["2026-09-25", 2, 5],
      ["2026-09-23", 1, 3],
    ]);
  });

  it("searches the cleaned and the raw text, ignoring case", () => {
    expect(groupByDay(items, "GERSI", new Set()).flatMap((g) => g.items.map((i) => i.id))).toEqual([
      "b",
    ]);
    expect(groupByDay(items, "jersey", new Set()).flatMap((g) => g.items.map((i) => i.id))).toEqual(
      ["b"],
    );
    expect(groupByDay(items, "zzz", new Set())).toEqual([]);
  });

  it("hides items that wait for an undo and drops a day that empties", () => {
    const groups = groupByDay(items, "", new Set(["c"]));
    expect(groups.map((g) => g.day)).toEqual(["2026-09-25"]);
    expect(groupByDay(items, "", new Set(["a", "b", "c"]))).toEqual([]);
  });
});

describe("rewrites", () => {
  const rewrite = (id: string, preset?: string): ScribeHistoryItem =>
    ({
      ...item(id, local(2026, 9, 25, 10), "the old words here", "New words."),
      mode: "rewrite",
      ...(preset === undefined ? {} : { preset }),
    }) as ScribeHistoryItem;

  it("labels a rewrite with its preset and leaves a dictation alone", () => {
    expect(rewriteLabel(rewrite("r1", "Shorter"))).toBe("Rewrite: Shorter");
    expect(rewriteLabel(rewrite("r2"))).toBe("Rewrite");
    expect(rewriteLabel(rewrite("r3", "  "))).toBe("Rewrite");
    expect(rewriteLabel(item("d", local(2026, 9, 25), "a", "A."))).toBeNull();
  });

  it("counts a rewrite apart and adds no spoken words for it", () => {
    const [group] = groupByDay(
      [rewrite("r1", "Clarity"), item("d", local(2026, 9, 25, 9), "hello there", "Hello there.")],
      "",
      new Set(),
    );
    expect(spokenWords(rewrite("r1"))).toBe(0);
    expect(group).toMatchObject({ words: 2, rewrites: 1 });
    expect(daySummary(group!)).toBe("1 dictation · 1 rewrite · 2 words");
    expect(daySummary({ day: "", items: [rewrite("r1")], words: 0, rewrites: 1 })).toBe(
      "1 rewrite · 0 words",
    );
    expect(daySummary({ day: "", items: [], words: 1, rewrites: 0 })).toBe("0 dictations · 1 word");
  });
});

describe("visibleDayItems and moreDaysLabel", () => {
  const many = Array.from({ length: 12 }, (_, index) =>
    item(`i${index}`, local(2026, 9, 25, 8 + (index % 12)), "x y", "X y."),
  );
  const [group] = groupByDay(many, "", new Set());

  it("shows ten per day until the day is opened", () => {
    expect(ITEMS_PER_DAY).toBe(10);
    expect(visibleDayItems(group!, false)).toHaveLength(10);
    expect(visibleDayItems(group!, true)).toHaveLength(12);
  });

  it("names how many older days remain", () => {
    expect(DAYS_PER_PAGE).toBe(5);
    expect(moreDaysLabel(12, 5)).toBe("Show 5 older days of 7");
    expect(moreDaysLabel(7, 5)).toBe("Show 2 older days of 2");
    expect(moreDaysLabel(6, 5)).toBe("Show 1 older day of 1");
    expect(moreDaysLabel(5, 5)).toBeNull();
  });
});

describe("mergeTranscripts", () => {
  const a = item("a", local(2026, 9, 25, 15), "a", "A.");
  const b = item("b", local(2026, 9, 25, 14), "b", "B.");
  const c = item("c", local(2026, 9, 24, 14), "c", "C.");

  it("puts live saves first, keeps loaded order and drops duplicates", () => {
    expect(mergeTranscripts([a, b], [b, c], new Set()).map((i) => i.id)).toEqual(["a", "b", "c"]);
  });

  it("drops deleted ids even when a live save still holds them", () => {
    expect(mergeTranscripts([a], [b, c], new Set(["a", "c"])).map((i) => i.id)).toEqual(["b"]);
  });
});

describe("timeLabel", () => {
  it("uses a 12-hour clock with AM or PM", () => {
    expect(timeLabel(local(2026, 9, 25, 19))).toBe("7:00 PM");
    expect(timeLabel(new Date(2026, 8, 25, 0, 5).toISOString())).toBe("12:05 AM");
    expect(timeLabel(new Date(2026, 8, 25, 12, 30).toISOString())).toBe("12:30 PM");
  });
  it("is empty for an unreadable time", () => {
    expect(timeLabel("nope")).toBe("");
  });
});
