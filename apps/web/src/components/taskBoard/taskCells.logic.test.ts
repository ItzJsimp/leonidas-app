import type { TaskSchemaProperty } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import type { TaskView } from "./taskBoard.logic";
import {
  cellChange,
  cellEdit,
  columnProperty,
  listOptions,
  optionTone,
  type CellEditor,
} from "./taskCells.logic";

const task = (extra: Partial<TaskView> = {}) =>
  ({
    id: "t1",
    title: "Write the spec",
    status: "todo",
    priority: "medium",
    due: null,
    section: "app",
    project: "app",
    assignee: null,
    claimedBy: null,
    props: { lane: "draft", hours: "3", tags_x: ["a"], autonomous: "true" },
    updatedAt: 10,
    ...extra,
  }) as unknown as TaskView;

const schema: ReadonlyArray<TaskSchemaProperty> = [
  {
    key: "lane",
    type: "select",
    builtIn: true,
    options: ["draft", "human"],
    colors: { draft: "yellow", human: "pink" },
  },
  { key: "hours", type: "number", builtIn: false },
  { key: "link", type: "url", builtIn: false },
  { key: "tags_x", type: "multi_select", builtIn: false, options: ["a", "b"] },
  { key: "autonomous", type: "checkbox", builtIn: true },
  { key: "priority", type: "select", builtIn: true, options: ["High"] },
];
const context = {
  team: [],
  projects: [
    { slug: "app", name: "App", projectId: null, repository: null, total: 1, open: 1 },
    { slug: "general", name: "General", projectId: null, repository: null, total: 0, open: 0 },
  ],
};
const edit = (column: string, t = task()) => cellEdit(column, t, context, schema) as CellEditor;

describe("cellEdit", () => {
  it("gives built-in columns their editor and keeps gates and updated read-only", () => {
    expect(edit("title")).toEqual({ kind: "text", input: "text", value: "Write the spec" });
    expect(edit("status")).toMatchObject({ kind: "select", value: "todo", clearLabel: null });
    expect(edit("priority").kind === "select" && edit("priority")).toMatchObject({
      options: [{ value: "critical" }, { value: "high" }, { value: "medium" }, { value: "low" }],
    });
    expect(edit("project")).toMatchObject({
      value: "app",
      options: [{ value: "app", label: "App" }],
    });
    expect(edit("project", task({ section: "general" }))).toMatchObject({ value: null });
    expect(edit("due", task({ due: "2026-11-04" }))).toEqual({ kind: "date", value: "2026-11-04" });
    expect(cellEdit("gates", task(), context, schema)).toBeNull();
    expect(cellEdit("updated", task(), context, schema)).toBeNull();
  });

  it("maps each property type to an editor and option colors to theme tones", () => {
    expect(edit("prop:lane")).toEqual({
      kind: "select",
      value: "draft",
      clearLabel: "Empty",
      options: [
        { value: "draft", label: "draft", tone: "warning" },
        { value: "human", label: "human", tone: "muted" },
      ],
    });
    expect(edit("prop:hours")).toEqual({ kind: "text", input: "number", value: "3" });
    expect(edit("prop:link")).toEqual({ kind: "text", input: "url", value: "" });
    expect(edit("prop:tags_x")).toMatchObject({ kind: "multi", value: ["a"] });
    expect(edit("prop:autonomous")).toEqual({ kind: "toggle", value: true });
  });

  it("refuses unknown properties and schema keys that a task field holds", () => {
    expect(cellEdit("prop:missing", task(), context, schema)).toBeNull();
    expect(columnProperty("prop:priority", schema)).toBeNull();
    expect(optionTone("red")).toBe("danger");
    expect(optionTone(undefined)).toBe("muted");
  });
});

describe("cellChange", () => {
  it("maps a new value to one action and an unchanged value to none", () => {
    expect(cellChange("title", task(), edit("title"), " New name ")).toEqual({
      type: "rename",
      title: "New name",
    });
    expect(cellChange("title", task(), edit("title"), "Write the spec ")).toBeNull();
    expect(cellChange("status", task(), edit("status"), "done")).toEqual({
      type: "setStatus",
      status: "done",
    });
    expect(cellChange("project", task(), edit("project"), null)).toEqual({
      type: "linkProject",
      slug: null,
    });
    expect(cellChange("due", task(), edit("due"), "2026-12-01")).toEqual({
      type: "setDue",
      due: "2026-12-01",
    });
    expect(cellChange("owner", task(), edit("owner"), "Jake")).toEqual({
      type: "setAssignee",
      assignee: "Jake",
    });
  });

  it("sets, clears and checks property values", () => {
    expect(cellChange("prop:lane", task(), edit("prop:lane"), "human")).toEqual({
      type: "setProp",
      key: "lane",
      value: "human",
    });
    expect(cellChange("prop:hours", task(), edit("prop:hours"), "")).toEqual({
      type: "setProp",
      key: "hours",
      value: null,
    });
    expect(cellChange("prop:autonomous", task(), edit("prop:autonomous"), false)).toEqual({
      type: "setProp",
      key: "autonomous",
      value: "false",
    });
    expect(cellChange("prop:tags_x", task(), edit("prop:tags_x"), ["a", "b"])).toEqual({
      type: "setProp",
      key: "tags_x",
      value: ["a", "b"],
    });
    expect(cellChange("prop:tags_x", task(), edit("prop:tags_x"), [])).toMatchObject({
      value: null,
    });
    expect(cellChange("prop:tags_x", task(), edit("prop:tags_x"), ["a"])).toBeNull();
  });

  it("returns an error for a value the card cannot hold", () => {
    expect(cellChange("title", task(), edit("title"), "  ")).toHaveProperty("error");
    expect(cellChange("title", task(), edit("title"), "x".repeat(257))).toHaveProperty("error");
    expect(cellChange("prop:hours", task(), edit("prop:hours"), "three")).toHaveProperty("error");
    expect(cellChange("prop:link", task(), edit("prop:link"), "example.com")).toHaveProperty(
      "error",
    );
    expect(cellChange("due", task(), edit("due"), "11/04")).toHaveProperty("error");
  });
});

describe("listOptions", () => {
  it("shows the no-value row only before a search, so Enter picks the first match", () => {
    expect(listOptions(edit("prop:lane"), "", "clear").map((o) => o.value)).toEqual([
      "clear",
      "draft",
      "human",
    ]);
    expect(listOptions(edit("prop:lane"), " HUM", "clear").map((o) => o.value)).toEqual(["human"]);
    expect(listOptions(edit("status"), "", "clear")[0]?.value).toBe("todo");
    expect(listOptions(edit("title"), "", "clear")).toEqual([]);
  });
});
