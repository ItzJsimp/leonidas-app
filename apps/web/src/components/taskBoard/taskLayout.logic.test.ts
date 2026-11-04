import { describe, expect, it } from "vite-plus/test";

import {
  COLUMN_MAX,
  COLUMN_MIN,
  DEFAULT_LAYOUT,
  byManualRank,
  moveColumn,
  parseLayout,
  pruneRanks,
  rerank,
  resizeColumn,
  setColumnHidden,
  setFreezeName,
  setRowHeight,
  toggleWrap,
} from "./taskLayout.logic";

const keys = (layout: typeof DEFAULT_LAYOUT) => layout.table.columns.map((column) => column.key);

describe("parseLayout", () => {
  it("returns the default for missing or broken input", () => {
    expect(parseLayout(undefined)).toEqual(DEFAULT_LAYOUT);
    expect(parseLayout({ table: "x", ranks: [1] })).toEqual(DEFAULT_LAYOUT);
  });

  it("keeps saved order and widths, clamps widths, drops unknown keys, and adds new columns", () => {
    const parsed = parseLayout({
      table: {
        columns: [
          { key: "due", width: 9_999 },
          { key: "title", width: 300 },
          { key: "nope", width: 100 },
          { key: "prop:energy_type", width: 140, hidden: true },
          { key: "status", width: 1 },
        ],
        density: "comfortable",
        wrap: ["title", "nope"],
      },
      ranks: { a: 2, b: "x" },
    });
    expect(keys(parsed).slice(0, 4)).toEqual(["title", "due", "prop:energy_type", "status"]);
    expect(parsed.table.columns[1]?.width).toBe(COLUMN_MAX);
    expect(parsed.table.columns[3]?.width).toBe(COLUMN_MIN);
    expect(keys(parsed)).toContain("owner");
    expect(parsed.table.density).toBe("comfortable");
    expect(parsed.table.wrap).toEqual(["title"]);
    expect(parsed.ranks).toEqual({ a: 2 });
  });
});

describe("column edits", () => {
  it("resizes within the limits and keeps Name wide enough to read", () => {
    expect(resizeColumn(DEFAULT_LAYOUT, "status", 10).table.columns[1]?.width).toBe(COLUMN_MIN);
    const title = resizeColumn(DEFAULT_LAYOUT, "title", 10).table.columns[0];
    expect(title?.width).toBeGreaterThanOrEqual(160);
  });

  it("moves a column but keeps a frozen Name first", () => {
    const moved = moveColumn(DEFAULT_LAYOUT, "owner", 1);
    expect(keys(moved)[1]).toBe("owner");
    expect(keys(moveColumn(DEFAULT_LAYOUT, "due", 0))[0]).toBe("title");
    const unfrozen = { ...DEFAULT_LAYOUT, table: { ...DEFAULT_LAYOUT.table, freezeName: false } };
    expect(keys(moveColumn(unfrozen, "due", 0))[0]).toBe("due");
  });

  it("puts Name first when it is frozen again", () => {
    const unfrozen = moveColumn(setFreezeName(DEFAULT_LAYOUT, false), "due", 0);
    expect(keys(unfrozen)[0]).toBe("due");
    expect(keys(setFreezeName(unfrozen, true))[0]).toBe("title");
  });

  it("hides and shows columns but never Name, toggles wrap, and clamps row height", () => {
    const hidden = setColumnHidden(DEFAULT_LAYOUT, "priority", true);
    expect(hidden.table.columns.find((c) => c.key === "priority")?.hidden).toBe(true);
    expect(setColumnHidden(DEFAULT_LAYOUT, "title", true)).toBe(DEFAULT_LAYOUT);
    expect(toggleWrap(toggleWrap(DEFAULT_LAYOUT, "title"), "title").table.wrap).toEqual([]);
    expect(setRowHeight(DEFAULT_LAYOUT, 500).table.rowHeight).toBe(72);
    expect(setRowHeight(DEFAULT_LAYOUT, null).table.rowHeight).toBeNull();
  });
});

describe("manual row order", () => {
  it("ranks a group in its new order and sorts ranked rows first", () => {
    const ranked = rerank({}, ["c", "a", "b"]);
    const rows = ["a", "b", "x", "c"].map((id) => ({ id }));
    expect(rows.sort(byManualRank(ranked, () => 0)).map((row) => row.id)).toEqual([
      "c",
      "a",
      "b",
      "x",
    ]);
  });

  it("keeps ranks of other groups and drops ranks of tasks that are gone", () => {
    const ranks = rerank({ z: 5 }, ["a", "b"]);
    expect(ranks.z).toBe(5);
    expect(pruneRanks(ranks, new Set(["a", "z"]))).toEqual({ a: ranks.a, z: 5 });
  });
});
