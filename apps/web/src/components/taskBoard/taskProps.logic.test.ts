import type { TaskSchemaProperty } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { DEFAULT_LAYOUT, setColumnHidden } from "./taskLayout.logic";
import {
  newPropertyKey,
  parseOptions,
  recolor,
  retype,
  withOptions,
  withSchemaColumns,
} from "./taskProps.logic";

const lane: TaskSchemaProperty = {
  key: "lane",
  type: "select",
  builtIn: true,
  options: ["draft", "human"],
  colors: { draft: "yellow" },
};
const hours: TaskSchemaProperty = {
  key: "hours",
  type: "number",
  builtIn: false,
  format: "progress",
};
const status: TaskSchemaProperty = { key: "status", type: "status", builtIn: true };
const keys = (layout: typeof DEFAULT_LAYOUT) =>
  layout.table.columns.map((column) => `${column.key}${column.hidden ? "-" : ""}`);

describe("withSchemaColumns", () => {
  it("lists each card property as a hidden column, never a task field", () => {
    const layout = withSchemaColumns(DEFAULT_LAYOUT, [lane, hours, status]);
    expect(keys(layout).slice(-2)).toEqual(["prop:lane-", "prop:hours-"]);
    expect(keys(layout)).not.toContain("prop:status-");
    expect(withSchemaColumns(DEFAULT_LAYOUT, [])).toBe(DEFAULT_LAYOUT);
  });

  it("keeps a saved property column and drops one the schema no longer holds", () => {
    const saved = setColumnHidden(
      setColumnHidden(DEFAULT_LAYOUT, "prop:hours", false),
      "prop:gone",
      false,
    );
    expect(keys(saved).slice(-2)).toEqual(["prop:hours", "prop:gone"]);
    const layout = withSchemaColumns(saved, [hours]);
    expect(keys(layout).filter((key) => key.startsWith("prop:"))).toEqual(["prop:hours"]);
  });
});

describe("setColumnHidden", () => {
  it("adds a listed property column when it is shown, and ignores bad keys", () => {
    expect(setColumnHidden(DEFAULT_LAYOUT, "prop:hours", true)).toBe(DEFAULT_LAYOUT);
    expect(setColumnHidden(DEFAULT_LAYOUT, "nope", false)).toBe(DEFAULT_LAYOUT);
  });
});

describe("property edits", () => {
  it("makes a key of letters and _ that no property uses", () => {
    expect(newPropertyKey("Hours left 2", new Set())).toBe("hours_left");
    expect(newPropertyKey("Lane", new Set(["lane", "lane_b"]))).toBe("lane_c");
    expect(newPropertyKey("123", new Set())).toBe("property");
  });

  it("retypes, recolors and changes options without losing other fields", () => {
    expect(retype(lane, "multi_select")).toEqual({
      type: "multi_select",
      options: ["draft", "human"],
      colors: { draft: "yellow" },
    });
    expect(retype(hours, "text")).toEqual({ type: "text" });
    expect(recolor(lane, "human", "blue").colors).toEqual({ draft: "yellow", human: "blue" });
    expect(withOptions(lane, ["human", "solo"])).toEqual({
      type: "select",
      options: ["human", "solo"],
    });
    expect(parseOptions(" a, b ,, a,c ")).toEqual(["a", "b", "c"]);
  });
});
