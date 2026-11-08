// @effect-diagnostics nodeBuiltinImport:off - reads the real packed lists and zips them with the shipped gzip format.
import * as NodeFS from "node:fs";
import * as NodeZlib from "node:zlib";
import { describe, expect, it } from "vite-plus/test";

import { fineKey, flagReason, groupFixes, needsLook, viewFixes } from "./dictionary.logic";
import { decodeFrontCoded, normalWordKind, type NormalWordLists } from "./normalWords.logic";

const folder = new URL("./normal-words/", import.meta.url);
const load = (file: string) =>
  decodeFrontCoded(
    NodeZlib.gunzipSync(NodeFS.readFileSync(new URL(file, folder))).toString("utf8"),
  );
const lists: NormalWordLists = {
  words: load("common-words.txt.gz"),
  names: load("first-names.txt.gz"),
};

describe("decodeFrontCoded", () => {
  it("rebuilds each word from the letters it shares with the line before", () => {
    expect([...decodeFrontCoded("0apple\n4y\n2t\n0zoo\n")]).toEqual([
      "apple",
      "apply",
      "apt",
      "zoo",
    ]);
  });
});

describe("normalWordKind", () => {
  const tiny: NormalWordLists = { words: new Set(["cloud"]), names: new Set(["leia"]) };

  it("tells a word from a name, ignoring case and spaces around it", () => {
    expect(normalWordKind(" Cloud ", tiny)).toBe("word");
    expect(normalWordKind("LEIA", tiny)).toBe("name");
  });

  it("never flags phrases, digits, symbols or short spellings", () => {
    expect(normalWordKind("Google Cloud", tiny)).toBeNull();
    expect(normalWordKind("cloud9", tiny)).toBeNull();
    expect(normalWordKind("clo", tiny)).toBeNull();
    expect(normalWordKind("", tiny)).toBeNull();
  });
});

describe("the packed lists", () => {
  it("stay under 100 KB together", () => {
    const bytes = ["common-words.txt.gz", "first-names.txt.gz"]
      .map((file) => NodeFS.statSync(new URL(file, folder)).size)
      .reduce((sum, size) => sum + size, 0);
    expect(bytes).toBeLessThan(100 * 1024);
  });

  it("flag the normal words and names a person has fixes for", () => {
    const flagged = ["Cloud", "Claw", "Clawed", "Dupe", "Shake", "backslash", "sealing"];
    for (const spelling of flagged) expect(normalWordKind(spelling, lists)).toBe("word");
    for (const spelling of ["Leo", "Leonard", "Leia"]) {
      expect(normalWordKind(spelling, lists)).toBe("name");
    }
  });

  it("leave real misspellings and product names alone", () => {
    for (const spelling of ["Clawd", "Clawde", "AOS", "Haiky", "Antigarity", "Kronjob"]) {
      expect(normalWordKind(spelling, lists)).toBeNull();
    }
  });
});

describe("flags on grouped fixes", () => {
  const rules = [
    { wrong: "Cloud", correct: "Claude" },
    { wrong: "Clawd", correct: "Claude" },
    { wrong: "claude", correct: "Claude" },
    { wrong: "Google Cloud", correct: "Google Cloud" },
    { wrong: "Leo", correct: "Leonidas" },
  ];

  it("flags a normal word, skips real misspellings and same-word rules", () => {
    const groups = groupFixes(rules, lists);
    expect(groups.map((g) => [g.correct, g.flags.map((f) => `${f.wrong}:${f.kind}`)])).toEqual([
      ["Claude", ["Cloud:word"]],
      ["Google Cloud", []],
      ["Leonidas", ["Leo:name"]],
    ]);
  });

  it("says why in one plain sentence", () => {
    expect(flagReason({ wrong: "Leo", kind: "name", fine: false }, "Leonidas")).toBe(
      "A first name. Every “Leo” you say becomes “Leonidas”.",
    );
    expect(flagReason({ wrong: "Cloud", kind: "word", fine: false }, "Claude")).toBe(
      "A common English word. Every “Cloud” you say becomes “Claude”.",
    );
  });

  it("flags nothing before the lists are loaded", () => {
    expect(groupFixes(rules).every((group) => group.flags.length === 0)).toBe(true);
  });

  it("stops asking about a spelling marked as fine, only for that rule", () => {
    const fine = new Set([fineKey("Claude", "cloud")]);
    const groups = groupFixes(rules, lists, fine);
    expect(groups[0]?.flags).toEqual([{ wrong: "Cloud", kind: "word", fine: true }]);
    expect(needsLook(groups[0]!)).toBe(false);
    expect(viewFixes(groups, "", "look", "name").map((g) => g.correct)).toEqual(["Leonidas"]);
    const moved = groupFixes([{ wrong: "Cloud", correct: "Claud" }], lists, fine);
    expect(needsLook(moved[0]!)).toBe(true);
  });
});
