import { describe, expect, it } from "vite-plus/test";

import { answerBlockType, parseAnswerBlock } from "./answerBlocks.ts";

describe("answerBlockType", () => {
  it("reads the block type from a fence language", () => {
    expect(answerBlockType("leo:table")).toBe("table");
    expect(answerBlockType("leo:chart")).toBe("chart");
    expect(answerBlockType("ts")).toBeNull();
    expect(answerBlockType("leo:map")).toBeNull();
  });
});

describe("parseAnswerBlock", () => {
  it("parses a table with KPIs", () => {
    const result = parseAnswerBlock(
      "table",
      '{"kpis":[["Models","5"]],"cols":["A","B"],"rows":[["x",1],["y",2]]}',
      true,
    );
    expect(result).toEqual({
      status: "block",
      block: {
        type: "table",
        kpis: [["Models", "5"]],
        cols: ["A", "B"],
        rows: [
          ["x", 1],
          ["y", 2],
        ],
      },
    });
  });

  it("parses choices given as strings or objects", () => {
    const result = parseAnswerBlock(
      "choices",
      '{"q":"Pick","options":["A",{"label":"B","note":"why"}]}',
      true,
    );
    expect(result).toEqual({
      status: "block",
      block: {
        type: "choices",
        q: "Pick",
        options: [{ label: "A" }, { label: "B", note: "why" }],
      },
    });
  });

  it("parses a checklist and a chart", () => {
    expect(parseAnswerBlock("checklist", '{"items":["one","two"]}', true)).toEqual({
      status: "block",
      block: { type: "checklist", items: ["one", "two"] },
    });
    expect(
      parseAnswerBlock("chart", '{"kind":"donut","labels":["a","b"],"values":[1,2]}', true),
    ).toEqual({
      status: "block",
      block: { type: "chart", kind: "donut", labels: ["a", "b"], values: [1, 2] },
    });
  });

  it("returns pending while an unclosed fence streams", () => {
    expect(parseAnswerBlock("table", '{"cols":["A"', false)).toEqual({ status: "pending" });
  });

  it("returns fallback for bad JSON or a bad shape in a closed fence", () => {
    expect(parseAnswerBlock("table", "{nope", true)).toEqual({ status: "fallback" });
    expect(parseAnswerBlock("table", '{"cols":"A","rows":[]}', true)).toEqual({
      status: "fallback",
    });
    expect(parseAnswerBlock("chart", '{"kind":"pie","labels":[],"values":[]}', true)).toEqual({
      status: "fallback",
    });
    expect(parseAnswerBlock("chart", '{"kind":"bar","labels":["a"],"values":[1,2]}', true)).toEqual(
      { status: "fallback" },
    );
    expect(parseAnswerBlock("choices", '{"options":[]}', true)).toEqual({ status: "fallback" });
  });
});

describe("parseAnswerBlock aliases (shapes models guess)", () => {
  it("accepts columns, KPI objects and option descriptions", () => {
    expect(
      parseAnswerBlock(
        "table",
        '{"columns":["A"],"rows":[["x"]],"kpis":[{"label":"Best","value":"x"}]}',
        true,
      ),
    ).toEqual({
      status: "block",
      block: { type: "table", kpis: [["Best", "x"]], cols: ["A"], rows: [["x"]] },
    });
    expect(
      parseAnswerBlock(
        "choices",
        '{"title":"Pick","options":[{"label":"A","value":"a","description":"why"}]}',
        true,
      ),
    ).toEqual({
      status: "block",
      block: { type: "choices", q: "Pick", options: [{ label: "A", note: "why" }] },
    });
  });

  it("accepts checklist item objects", () => {
    expect(
      parseAnswerBlock(
        "checklist",
        '{"items":[{"text":"one","checked":false},{"label":"two"}]}',
        true,
      ),
    ).toEqual({ status: "block", block: { type: "checklist", items: ["one", "two"] } });
  });

  it("accepts a chart given as data rows with xKey and yKey", () => {
    expect(
      parseAnswerBlock(
        "chart",
        '{"type":"bar","data":[{"runner":"Jest","speed":1},{"runner":"Bun","speed":3}],"xKey":"runner","yKey":"speed"}',
        true,
      ),
    ).toEqual({
      status: "block",
      block: { type: "chart", kind: "bar", labels: ["Jest", "Bun"], values: [1, 3] },
    });
    expect(
      parseAnswerBlock("chart", '{"kind":"line","data":[{"label":"a","value":2}]}', true),
    ).toEqual({
      status: "block",
      block: { type: "chart", kind: "line", labels: ["a"], values: [2] },
    });
  });
});

describe("lesson block", () => {
  it("reads the lesson type from a fence language", () => {
    expect(answerBlockType("leo:lesson")).toBe("lesson");
  });

  it("parses tabs of cards with callout kinds, progress and actions", () => {
    const result = parseAnswerBlock(
      "lesson",
      JSON.stringify({
        title: "Prop trading from zero",
        meta: "8 modules",
        tabs: [
          {
            label: "Modules",
            cards: [
              { title: "Firm rules", body: "Daily loss limit.", meta: "Week 1", done: true },
              { title: "Key idea", body: "Size from the stop.", kind: "key", actions: ["Quiz me"] },
            ],
          },
        ],
      }),
      true,
    );
    expect(result).toEqual({
      status: "block",
      block: {
        type: "lesson",
        title: "Prop trading from zero",
        meta: "8 modules",
        tabs: [
          {
            label: "Modules",
            cards: [
              { title: "Firm rules", body: "Daily loss limit.", meta: "Week 1", done: true },
              { title: "Key idea", body: "Size from the stop.", kind: "key", actions: ["Quiz me"] },
            ],
          },
        ],
      },
    });
  });

  it("maps guessed field names and wraps flat cards in one tab", () => {
    const result = parseAnswerBlock(
      "lesson",
      '{"title":"RSI","modules":[{"name":"Read the line","text":"Above 70 is stretched.","type":"warning"}]}',
      true,
    );
    expect(result).toEqual({
      status: "block",
      block: {
        type: "lesson",
        title: "RSI",
        tabs: [
          {
            label: "Lesson",
            cards: [{ title: "Read the line", body: "Above 70 is stretched.", kind: "warn" }],
          },
        ],
      },
    });
  });

  it("falls back when no tab has cards, and drops empty tabs", () => {
    expect(parseAnswerBlock("lesson", '{"title":"Empty","tabs":[]}', true)).toEqual({
      status: "fallback",
    });
    expect(
      parseAnswerBlock(
        "lesson",
        '{"title":"X","tabs":[{"label":"A","cards":[{"title":"One"}]},{"label":"B","cards":[]}]}',
        true,
      ),
    ).toEqual({
      status: "block",
      block: { type: "lesson", title: "X", tabs: [{ label: "A", cards: [{ title: "One" }] }] },
    });
  });

  it("turns an unknown kind into a plain card and trims repeated or empty actions", () => {
    const result = parseAnswerBlock(
      "lesson",
      '{"title":"X","cards":[{"title":"A","kind":"constructor","actions":["Quiz me"," Quiz me ",""]}]}',
      true,
    );
    expect(result).toEqual({
      status: "block",
      block: {
        type: "lesson",
        title: "X",
        tabs: [{ label: "Lesson", cards: [{ title: "A", actions: ["Quiz me"] }] }],
      },
    });
  });

  it.each([
    ["a done flag that is not true or false", '{"title":"X","cards":[{"title":"A","done":"yes"}]}'],
    ["a card title that is not text", '{"title":"X","cards":[{"title":7}]}'],
    ["a tab with no label", '{"title":"X","tabs":[{"cards":[{"title":"A"}]}]}'],
    ["a lesson with no title", '{"cards":[{"title":"A"}]}'],
  ])("falls back on %s", (_name, json) => {
    expect(parseAnswerBlock("lesson", json, true)).toEqual({ status: "fallback" });
  });
});
