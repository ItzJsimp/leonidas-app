import type { ScribeDictionary, ScribeGoals, ScribeInsights } from "@t3tools/contracts";
import { describe, expect, it } from "@effect/vitest";

import { addReplacement, MAX_TERM_CHARS, scribeSummary } from "./scribeSummary.ts";

const dictionary: ScribeDictionary = {
  replacements: [{ wrong: "Lite LLM", correct: "LiteLLM" }],
  vocabulary: ["Leonidas"],
};

describe("addReplacement", () => {
  it("adds one pair and keeps the rest of the dictionary", () => {
    const result = addReplacement(dictionary, " Mem zero ", "mem0");
    expect(result.status).toBe("added");
    if (result.status === "added") {
      expect(result.dictionary.replacements).toContainEqual({ wrong: "Mem zero", correct: "mem0" });
      expect(result.dictionary.replacements).toHaveLength(2);
      expect(result.dictionary.vocabulary).toEqual(["Leonidas"]);
    }
  });

  it("never overwrites a heard phrase that is already mapped, whatever its case", () => {
    expect(addReplacement(dictionary, "lite llm", "Other")).toEqual({
      status: "exists",
      correct: "LiteLLM",
    });
  });

  it("refuses empty, same, over-long and control-character text", () => {
    const cases: ReadonlyArray<readonly [string, string]> = [
      ["", "x"],
      ["x", " "],
      ["Same", "same"],
      ["a".repeat(MAX_TERM_CHARS + 1), "x"],
      ["a\nb", "x"],
    ];
    for (const [heard, meant] of cases)
      expect(addReplacement(dictionary, heard, meant).status).toBe("invalid");
  });
});

describe("scribeSummary", () => {
  it("keeps numbers only", () => {
    const insights = {
      words: 10,
      transcripts: 2,
      daysActive: 1,
      todayWords: 5,
      todayTranscripts: 1,
      streakDays: 3,
      weekAvgWords: 4,
      weekly: { words: 9, prevWords: 8, topApp: "code" },
      p50: 100,
      p90: 200,
      byMode: [],
      byApp: [],
      truncated: false,
      rawText: "secret words",
    } as unknown as ScribeInsights;
    const goals = {
      level: 2,
      rank: "Scout",
      xp: 50,
      today: { words: 5, goal: 100, dictations: 1 },
      streak: 3,
      bestStreak: 4,
      questsDone: 1,
    } as unknown as ScribeGoals;
    const out = scribeSummary(insights, goals);
    expect(out.goals.level).toBe(2);
    expect(out.insights.p50Ms).toBe(100);
    expect(JSON.stringify(out)).not.toContain("secret words");
  });
});
