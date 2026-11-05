import { describe, expect, it } from "vite-plus/test";

import {
  COLUMN_MAX,
  COLUMN_MIN,
  DEFAULT_LAYOUT,
  MAX_PINNED_VIEWS,
  activeView,
  commitView,
  deleteView,
  openView,
  resetLayout,
  saveView,
  setViewPinned,
  showView,
  updateViewPrefs,
  byManualRank,
  moveColumn,
  moveRank,
  parseLayout,
  pruneRanks,
  rerank,
  resizeColumn,
  setColumnHidden,
  setFreezeName,
  setRowHeight,
  toggleWrap,
} from "./taskLayout.logic";
import { DEFAULT_TASKS_PREFS } from "./tasksPage.logic";

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

  const shown = (ranks: Record<string, number>, ids: string[]) =>
    ids
      .map((id) => ({ id }))
      .sort(byManualRank(ranks, () => 0))
      .map((row) => row.id);

  it("ranks only the rows above a moved row when no row below has a rank", () => {
    const ranks = moveRank({}, ["a", "b", "c", "d"], "d", 1);
    expect(Object.keys(ranks).toSorted()).toEqual(["a", "d"]);
    expect(shown(ranks, ["a", "b", "c", "d"])).toEqual(["a", "d", "b", "c"]);
  });

  it("re-ranks down to the last ranked row so old ranks do not collide", () => {
    const first = moveRank({}, ["a", "b", "c", "d"], "c", 0);
    const order = shown(first, ["a", "b", "c", "d"]);
    expect(order).toEqual(["c", "a", "b", "d"]);
    const second = moveRank(first, order, "d", 1);
    expect(shown(second, ["a", "b", "c", "d"])).toEqual(["c", "d", "a", "b"]);
    const third = moveRank(second, ["c", "d", "a", "b"], "c", 3);
    expect(shown(third, ["a", "b", "c", "d"])).toEqual(["d", "a", "b", "c"]);
  });

  it("adds a row from another group at the drop place and clamps the place", () => {
    const ranks = moveRank({ x: 1 }, ["a", "b"], "x", 9);
    expect(shown(ranks, ["x", "a", "b"])).toEqual(["a", "b", "x"]);
  });
});

describe("saved views", () => {
  const prefs = { ...DEFAULT_TASKS_PREFS, sort: "due" as const, groupBy: "project" as const };
  const wide = resizeColumn(DEFAULT_LAYOUT, "status", 300);

  it("saves the shown filters and columns, opens the view, and survives a parse", () => {
    const saved = saveView(wide, "v1", "  My   week ", prefs);
    expect(saved.activeViewId).toBe("v1");
    expect(saved.views[0]).toMatchObject({ name: "My week", pinned: true, prefs });
    const parsed = parseLayout(JSON.parse(JSON.stringify(saved)));
    expect(parsed.views[0]?.table.columns[1]?.width).toBe(300);
    expect(parsed.views[0]?.prefs.groupBy).toBe("project");
    expect(parsed.activeViewId).toBe("v1");
  });

  it("pins at most 5 views and drops bad views on parse", () => {
    let layout = DEFAULT_LAYOUT;
    for (let i = 0; i < 6; i++) layout = saveView(layout, `v${i}`, `View ${i}`, prefs);
    expect(layout.views.map((view) => view.pinned)).toEqual([true, true, true, true, true, false]);
    expect(setViewPinned(layout, "v5", true)).toBe(layout);
    expect(setViewPinned(setViewPinned(layout, "v0", false), "v5", true).views[5]?.pinned).toBe(
      true,
    );
    const parsed = parseLayout({
      views: [
        ...Array.from({ length: 6 }, (_, i) => ({ id: `p${i}`, name: "x", pinned: true })),
        { id: "p0", name: "dupe" },
        { id: "bad id!", name: "x" },
        { id: "blank", name: "  " },
      ],
      activeViewId: "missing",
    });
    expect(parsed.views.map((view) => view.id)).toEqual(["p0", "p1", "p2", "p3", "p4", "p5"]);
    expect(parsed.views.filter((view) => view.pinned)).toHaveLength(MAX_PINNED_VIEWS);
    expect(parsed.activeViewId).toBeNull();
  });

  it("sends a column change into the open view and keeps the default view's columns", () => {
    const raw = saveView(wide, "v1", "Mine", prefs);
    const shown = showView(raw);
    const next = commitView(raw, shown, resizeColumn(shown, "status", 200));
    expect(next.table).toBe(raw.table);
    expect(activeView(next)?.table.columns[1]?.width).toBe(200);
    // Closing the view moves no columns, and the default view shows its own again.
    const closed = commitView(next, showView(next), openView(showView(next), null));
    expect(closed.activeViewId).toBeNull();
    expect(showView(closed).table).toBe(raw.table);
  });

  it("updates only the open view's prefs, deletes, and resets to the default", () => {
    const raw = saveView(wide, "v1", "Mine", prefs);
    const sorted = updateViewPrefs(raw, (current) => ({ ...current, sort: "title" }));
    expect(activeView(sorted)?.prefs.sort).toBe("title");
    expect(
      updateViewPrefs(openView(raw, null), (current) => ({ ...current, sort: "title" })).views[0]
        ?.prefs.sort,
    ).toBe("due");
    expect(deleteView(raw, "v1")).toMatchObject({ views: [], activeViewId: null });
    const ranked = { ...raw, ranks: { a: 1 } };
    const reset = resetLayout(ranked);
    expect(reset).toMatchObject({
      table: DEFAULT_LAYOUT.table,
      activeViewId: null,
      ranks: { a: 1 },
    });
    expect(reset.views).toHaveLength(1);
  });
});
