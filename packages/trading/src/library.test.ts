// @effect-diagnostics globalConsole:off - the search test prints its timing with console.info.
import { assert, describe, it } from "@effect/vitest";

import {
  buildIndex,
  fetchDateOf,
  isStale,
  parseCardsCsv,
  parseManifestCsv,
  parseQuizJson,
  search,
  type LibraryDoc,
} from "./library.ts";

// Made-up course, cards and quiz. Real course text and numbers stay in the private pack.
const MANIFEST_HEADER =
  "chapter,chapter_title,lesson,title,duration,lesson_id,tier,transcript,status";

describe("parseManifestCsv", () => {
  it("reads quoted fields, a byte order mark and CRLF lines", () => {
    const text = `﻿${MANIFEST_HEADER}\r\n1,"Intro, Basics",1,"Say ""hello""",01:24,lesn_a1,1,transcripts/01.md,ok\r\n`;
    const [lesson] = parseManifestCsv(text);
    assert.strictEqual(lesson?.chapterTitle, "Intro, Basics");
    assert.strictEqual(lesson?.title, 'Say "hello"');
    assert.strictEqual(lesson?.transcript, "transcripts/01.md");
    assert.deepStrictEqual(lesson?.keywords, []);
    assert.strictEqual(lesson?.url, null);
  });

  it("reads optional keywords and url columns", () => {
    const text = `${MANIFEST_HEADER},keywords,url\n1,C,1,T,01:00,l1,1,t.md,ok,vwap;gap,https://example.com/x\n`;
    const [lesson] = parseManifestCsv(text);
    assert.deepStrictEqual(lesson?.keywords, ["vwap", "gap"]);
    assert.strictEqual(lesson?.url, "https://example.com/x");
  });

  it("rejects a header with a missing or unknown column", () => {
    assert.throws(() => parseManifestCsv("chapter,title\n1,T\n"), /column/i);
    assert.throws(() => parseManifestCsv(`${MANIFEST_HEADER},secret\n`), /column/i);
  });

  it("rejects a row with the wrong number of cells", () => {
    assert.throws(() => parseManifestCsv(`${MANIFEST_HEADER}\n1,C,1\n`), /row 1/);
  });

  it("rejects a url that is not http or https", () => {
    const text = `${MANIFEST_HEADER},url\n1,C,1,T,01:00,l1,1,t.md,ok,javascript:alert(1)\n`;
    assert.throws(() => parseManifestCsv(text), /url/);
  });

  it("caps the row count at 5,000", () => {
    const row = "1,C,1,T,01:00,l1,1,t.md,ok";
    const text = `${MANIFEST_HEADER}\n${Array.from({ length: 5_001 }, () => row).join("\n")}\n`;
    assert.throws(() => parseManifestCsv(text), /5,000/);
  });
});

describe("parseCardsCsv", () => {
  it("reads quoted cards and checks the header", () => {
    const text = 'front,back,citation\n"What is a ""gap""?","An open price range.","[JJ Gaps]"\n';
    assert.deepStrictEqual(parseCardsCsv(text), [
      { front: 'What is a "gap"?', back: "An open price range.", citation: "[JJ Gaps]" },
    ]);
  });

  it("rejects another header", () => {
    assert.throws(() => parseCardsCsv("question,answer\nq,a\n"), /column/i);
  });
});

const QUESTION = {
  id: "Q-01",
  topic: "Foundations",
  level: "Apply",
  source: "Foundations: a check?",
  prompt: "Which check comes first?",
  correct: 1,
  options: [
    { text: "Count the trades.", why: "Too early." },
    { text: "Read the sample size.", why: "Right." },
  ],
};

describe("parseQuizJson", () => {
  it("reads a question list", () => {
    const [question] = parseQuizJson(JSON.stringify([QUESTION]));
    assert.strictEqual(question?.correct, 1);
    assert.strictEqual(question?.options.length, 2);
  });

  it("rejects an unknown key, a bad answer index and bad JSON", () => {
    assert.throws(() => parseQuizJson(JSON.stringify([{ ...QUESTION, extra: 1 }])), /unknown/);
    assert.throws(() => parseQuizJson(JSON.stringify([{ ...QUESTION, correct: 5 }])), /correct/);
    assert.throws(() => parseQuizJson("[not json"), /JSON/);
  });
});

describe("firm fetch date", () => {
  it("reads the Fetched line", () => {
    assert.strictEqual(
      fetchDateOf("# Firm\n\n- **Fetched:** 2026-11-01. Fetch again after 2026-12-01.\n"),
      "2026-11-01",
    );
    assert.strictEqual(fetchDateOf("# Firm with no date\n"), null);
  });

  it("is stale after 30 days, and stale when the date is unknown", () => {
    const now = Date.parse("2026-02-15T12:00:00Z");
    assert.isTrue(isStale("2026-01-01", now));
    assert.isFalse(isStale("2026-01-20", now));
    assert.isTrue(isStale(null, now));
    assert.isTrue(isStale("not-a-date", now));
  });
});

const doc = (
  kind: LibraryDoc["kind"],
  id: string,
  title: string,
  body: string,
  keywords: readonly string[] = [],
): LibraryDoc => ({ kind, id, title, keywords, body });

describe("search", () => {
  const index = buildIndex([
    doc("knowledge", "risk", "Risk management", "Keep a stop. VWAP is not a stop."),
    doc("lesson", "lesson-1", "Opening range", "We read the open.", ["vwap"]),
    doc("card", "card-1", "What is VWAP?", "Volume weighted average price."),
    doc("community", "post-1", "Morning notes", "Nothing about it here."),
  ]);

  it("matches whole words and prefixes, case-insensitive", () => {
    const hits = search(index, "vwa", 10);
    assert.deepStrictEqual(hits.map((hit) => hit.kind).toSorted(), ["card", "knowledge", "lesson"]);
  });

  it("ranks title hits first, then key words, then body", () => {
    const hits = search(index, "vwap", 10);
    assert.strictEqual(hits[0]?.kind, "card");
    assert.strictEqual(hits[1]?.kind, "lesson");
    assert.strictEqual(hits[2]?.kind, "knowledge");
  });

  it("returns a snippet around the match and respects the limit", () => {
    const hits = search(index, "stop", 1);
    assert.strictEqual(hits.length, 1);
    assert.include(hits[0]?.snippet ?? "", "stop");
  });

  it("returns nothing for an empty query", () => {
    assert.deepStrictEqual(search(index, "   ", 10), []);
  });
});

describe("search on a synthetic full course", () => {
  // Invented words from a fixed seed, so the run is repeatable. One planted term.
  const SYLLABLES = ["ka", "to", "ri", "mun", "sel", "bax", "dor", "pim", "vex", "lo"];
  let seed = 7;
  const word = () => {
    let out = "";
    for (let i = 0; i < 3; i += 1) {
      seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
      out += SYLLABLES[seed % SYLLABLES.length];
    }
    return out;
  };
  const body = (size: number) => {
    const words: string[] = [];
    let length = 0;
    while (length < size) {
      const next = word();
      words.push(next);
      length += next.length + 1;
    }
    return words.join(" ");
  };

  it("finds a planted term in lessons, knowledge pages and cards under 300 ms", () => {
    const docs: LibraryDoc[] = [];
    for (let i = 0; i < 2_000; i += 1) {
      docs.push(
        doc("lesson", `lesson-${i}`, `Lesson ${word()}`, i === 1_500 ? "zelfrax" : body(120), [
          word(),
        ]),
      );
    }
    for (let i = 0; i < 200; i += 1) {
      docs.push(
        doc(
          "knowledge",
          `page-${i}`,
          `Page ${word()}`,
          i === 42 ? `zelfrax ${body(8_000)}` : body(8_000),
        ),
      );
    }
    for (let i = 0; i < 2_000; i += 1) {
      docs.push(doc("card", `card-${i}`, word(), i === 7 ? `zelfrax ${body(200)}` : body(200)));
    }

    const buildStart = performance.now();
    const index = buildIndex(docs);
    const buildMs = performance.now() - buildStart;

    const searchStart = performance.now();
    const hits = search(index, "zelfrax", 30);
    const searchMs = performance.now() - searchStart;

    console.info(
      `library index build: ${buildMs.toFixed(1)} ms, search: ${searchMs.toFixed(2)} ms, ${docs.length} docs, ${hits.length} hits`,
    );
    assert.isBelow(searchMs, 300);
    const kinds = new Set(hits.map((hit) => hit.kind));
    assert.isTrue(kinds.has("lesson"));
    assert.isTrue(kinds.has("knowledge"));
    assert.isTrue(kinds.has("card"));
  });
});
