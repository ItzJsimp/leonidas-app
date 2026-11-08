import type { ScribeDictionary } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  HINT_CHARS,
  VOCABULARY_CAP,
  acceptSuggestion,
  dictionaryErrorMessage,
  addReplacement,
  addVocabulary,
  filterVocabulary,
  groupFixes,
  hintUsage,
  removeSpellings,
  removeWords,
  restoreSpellings,
  restoreWords,
  viewFixes,
  suggestionWhy,
} from "./dictionary.logic";

const dict: ScribeDictionary = {
  replacements: [{ wrong: "btw", correct: "by the way" }],
  vocabulary: ["Gersi"],
};

describe("addReplacement", () => {
  it("adds a trimmed rule at the end", () => {
    const result = addReplacement(dict, "  cooper netties ", " Kubernetes ");
    expect(result).toEqual({
      ok: true,
      dictionary: {
        replacements: [
          { wrong: "btw", correct: "by the way" },
          { wrong: "cooper netties", correct: "Kubernetes" },
        ],
        vocabulary: ["Gersi"],
      },
    });
  });

  it("asks for both boxes", () => {
    expect(addReplacement(dict, "x", "  ")).toEqual({
      ok: false,
      message: "Fill in both boxes: the wrong word and the right spelling.",
    });
    expect(addReplacement(dict, "", "y").ok).toBe(false);
  });

  it("replaces the spelling of a rule that already has that wrong word, ignoring case", () => {
    const result = addReplacement(dict, "BTW", "by the way,");
    expect(result.ok && result.dictionary.replacements).toEqual([
      { wrong: "btw", correct: "by the way," },
    ]);
  });
});

describe("vocabulary", () => {
  it("adds a trimmed word and refuses a duplicate in any case", () => {
    const added = addVocabulary(dict, "  Leonidas ");
    expect(added.ok && added.dictionary.vocabulary).toEqual(["Gersi", "Leonidas"]);
    expect(addVocabulary(dict, "gersi")).toEqual({
      ok: false,
      message: "“gersi” is already in your word list.",
    });
    expect(addVocabulary(dict, "   ")).toEqual({ ok: false, message: "Type a word first." });
  });

  it("stops at the engine cap of 800 words", () => {
    const full = { ...dict, vocabulary: Array.from({ length: VOCABULARY_CAP }, (_, i) => `w${i}`) };
    expect(addVocabulary(full, "one more")).toEqual({
      ok: false,
      message: "Your word list is full (800 words). Remove one to add another.",
    });
  });
});

describe("filters and suggestions", () => {
  it("filters words on the word, ignoring case", () => {
    expect(filterVocabulary(dict.vocabulary, "ger")).toEqual(["Gersi"]);
  });

  it("accepts a suggestion as a word fix", () => {
    const result = acceptSuggestion(dict, { wrong: "jersey", correct: "Gersi", count: 3 });
    expect(result.ok && result.dictionary.replacements.at(-1)).toEqual({
      wrong: "jersey",
      correct: "Gersi",
    });
  });

  it("says why a suggestion appeared", () => {
    expect(suggestionWhy(3)).toBe("Fixed 3 times in your dictations");
  });
});

describe("dictionaryErrorMessage", () => {
  it("names a rejected list, a failed save and an offline engine", () => {
    expect(dictionaryErrorMessage("bad_request")).toContain("did not accept");
    expect(dictionaryErrorMessage("store_error")).toContain("could not save");
    expect(dictionaryErrorMessage("offline")).toBe(
      "Scribe engine is not running. Start it from the tray, or install it.",
    );
    expect(dictionaryErrorMessage(null)).toBe("Scribe could not do that. Try again.");
  });
});

describe("grouped word fixes", () => {
  const dictionary: ScribeDictionary = {
    replacements: [
      { wrong: "Cloud", correct: "Claude" },
      { wrong: "Clawd", correct: "Claude" },
      { wrong: "Clawde", correct: "Claude" },
      { wrong: "Clawed", correct: "Claude" },
      { wrong: "Claw", correct: "Claude" },
      { wrong: "AOS", correct: "AIOS" },
      { wrong: "Google Cloud", correct: "Google Cloud" },
    ],
    vocabulary: ["Leonidas", "leonidas", "Groq"],
  };

  it("groups 7 rules into 3 words and marks a same-word rule", () => {
    const groups = groupFixes(dictionary.replacements);
    expect(groups.map((g) => [g.correct, g.spellings.length, g.sameWord])).toEqual([
      ["Claude", 5, false],
      ["AIOS", 1, false],
      ["Google Cloud", 1, true],
    ]);
  });

  it("filters by spelling, keeps words with 5 or more spellings and sorts", () => {
    const groups = groupFixes(dictionary.replacements);
    expect(viewFixes(groups, "clawd", "all", "spellings").map((g) => g.correct)).toEqual([
      "Claude",
    ]);
    expect(viewFixes(groups, "", "many", "spellings").map((g) => g.correct)).toEqual(["Claude"]);
    expect(viewFixes(groups, "", "all", "name").map((g) => g.correct)).toEqual([
      "AIOS",
      "Claude",
      "Google Cloud",
    ]);
  });

  it("removes spellings in bulk and puts them back", () => {
    const removed = removeSpellings(dictionary, ["Cloud", "Claw"]);
    expect(removed.replacements).toHaveLength(5);
    const back = restoreSpellings(removed, [
      { wrong: "Cloud", correct: "Claude" },
      { wrong: "Claw", correct: "Claude" },
    ]);
    expect(back.replacements).toHaveLength(7);
    expect(restoreWords(removeWords(dictionary, ["Groq"]), ["Groq"]).vocabulary).toContain("Groq");
  });

  it("measures the speech hint like the engine", () => {
    expect(hintUsage(dictionary.vocabulary)).toEqual({ used: 16, skipped: 0 });
    const long = Array.from({ length: 100 }, (_, i) => `Word${String(i).padStart(4, "0")}`);
    const usage = hintUsage(long);
    expect(usage.used).toBeLessThanOrEqual(HINT_CHARS);
    expect(usage.skipped).toBe(100 - Math.floor(HINT_CHARS / 10));
  });
});
