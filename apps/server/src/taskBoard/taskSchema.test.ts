// @effect-diagnostics nodeBuiltinImport:off - synchronous node APIs are used on purpose in this file.
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";

import {
  TASK_SCHEMA_FILE,
  checkCardProps,
  editTaskSchema,
  formatTaskSchema,
  readTaskSchema,
  setTaskSchemaProperty,
  valueFits,
} from "./taskSchema.ts";

const file = {
  $comment: "Single source of truth.",
  properties: {
    name: { type: "text", required: true },
    status: { type: "status", options: ["Not started", "Done"], colors: { Done: "green" } },
    priority: { type: "select", options: ["Critical", "High", "Medium", "Low"] },
    story_points: { type: "number", note: "Kept on edit." },
  },
};

describe("editTaskSchema", () => {
  it("adds a property with a label, and the key never changes on a rename", () => {
    const added = editTaskSchema(file, "focus_area", {
      type: "select",
      label: "Focus area",
      options: ["Home", "Work"],
      colors: { Home: "pink" },
    });
    expect(added.properties.focus_area).toEqual({
      type: "select",
      label: "Focus area",
      options: ["Home", "Work"],
      colors: { Home: "pink" },
    });
    const renamed = editTaskSchema(added, "focus_area", {
      type: "select",
      label: "Area",
      options: ["Home", "Work"],
    });
    expect(Object.keys(renamed.properties)).toEqual([
      ...Object.keys(file.properties),
      "focus_area",
    ]);
    expect(renamed.properties.focus_area).toEqual({
      type: "select",
      label: "Area",
      options: ["Home", "Work"],
    });
  });

  it("changes only the colors of a built-in property", () => {
    const recolored = editTaskSchema(file, "status", {
      type: "status",
      options: ["Not started", "Done"],
      colors: { Done: "blue" },
    });
    expect(recolored.properties.status).toEqual({
      ...file.properties.status,
      colors: { Done: "blue" },
    });
    expect(() => editTaskSchema(file, "status", { type: "select" })).toThrow(/built-in/);
    expect(() =>
      editTaskSchema(file, "status", { type: "status", options: ["Not started"] }),
    ).toThrow(/built-in/);
    expect(() => editTaskSchema(file, "status", { type: "status", label: "State" })).toThrow(
      /built-in/,
    );
    expect(() => editTaskSchema(file, "priority", null)).toThrow(/built-in/);
  });

  it("keeps the other keys of an added property and removes it on null", () => {
    const progress = editTaskSchema(file, "story_points", { type: "number", format: "progress" });
    expect(progress.properties.story_points).toEqual({
      type: "number",
      format: "progress",
      note: "Kept on edit.",
    });
    expect(Object.keys(editTaskSchema(file, "story_points", null).properties)).not.toContain(
      "story_points",
    );
    expect(() => editTaskSchema(file, "missing", null)).toThrow(/No property/);
  });

  it("refuses bad keys, types, options and colors at the boundary", () => {
    const bad = (key: string, edit: Parameters<typeof editTaskSchema>[2]) => () =>
      editTaskSchema(file, key, edit);
    expect(bad("Points", { type: "number" })).toThrow(/name/);
    expect(bad("q4_goal", { type: "text" })).toThrow(/name/);
    expect(bad("assignee", { type: "person" })).toThrow(/used/);
    expect(bad("mood", { type: "formula" as "text" })).toThrow(/type/);
    expect(bad("mood", { type: "text", format: "progress" })).toThrow(/progress/);
    expect(bad("mood", { type: "select", options: ["a", "a"] })).toThrow(/twice/);
    expect(bad("mood", { type: "select", options: ['say "hi"'] })).toThrow(/option/);
    expect(bad("mood", { type: "select", options: ["a"], colors: { b: "red" } })).toThrow(/color/);
    expect(bad("mood", { type: "select", options: ["a"], colors: { a: "teal" } })).toThrow(/color/);
    expect(bad("mood", { type: "text", label: "two\nlines" })).toThrow(/name/);
  });
});

describe("valueFits", () => {
  it("checks a card value the same way as Test-TaskSchema.ps1", () => {
    const select = { type: "select", options: ["a", "b"] };
    expect(valueFits(select, "a")).toBe(true);
    expect(valueFits(select, "c")).toBe(false);
    expect(valueFits(select, ["a", "b"])).toBe(false);
    expect(valueFits({ type: "multi_select", options: ["a", "b"] }, ["a", "b"])).toBe(true);
    expect(valueFits({ type: "number" }, "-2.5")).toBe(true);
    expect(valueFits({ type: "number" }, "two")).toBe(false);
    expect(valueFits({ type: "checkbox" }, "true")).toBe(true);
    expect(valueFits({ type: "checkbox" }, "yes")).toBe(false);
    expect(valueFits({ type: "date" }, "2026-11-04")).toBe(true);
    expect(valueFits({ type: "date" }, "2026-02-30")).toBe(false);
    expect(valueFits({ type: "url" }, "https://example.com")).toBe(true);
    expect(valueFits({ type: "url" }, "example.com")).toBe(false);
    expect(valueFits({ type: "text" }, "anything")).toBe(true);
    expect(valueFits({ type: "number" }, "")).toBe(true);
  });
});

describe("formatTaskSchema", () => {
  it("writes one line per property and keeps the top-level keys", () => {
    const text = formatTaskSchema(file);
    expect(JSON.parse(text)).toEqual(file);
    expect(text.split("\n")).toContain('    "name": { "type": "text", "required": true },');
    expect(text.endsWith("}\n")).toBe(true);
  });
});

describe("task schema on disk", () => {
  let root: string;
  const card = (name: string, extra: string) =>
    NodeFS.writeFileSync(
      NodePath.join(root, "tasks", name),
      `---\ntype: task\nname: "${name}"\nstatus: "Not started"\n${extra}---\n# ${name}\n`,
    );

  beforeEach(() => {
    root = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "task-schema-"));
    NodeFS.mkdirSync(NodePath.join(root, "tasks"), { recursive: true });
    NodeFS.mkdirSync(NodePath.dirname(NodePath.join(root, TASK_SCHEMA_FILE)), { recursive: true });
    NodeFS.writeFileSync(NodePath.join(root, TASK_SCHEMA_FILE), JSON.stringify(file, null, 2));
  });
  afterEach(() => NodeFS.rmSync(root, { recursive: true, force: true }));

  it("reads the properties in file order with the built-in flag and the label", () => {
    const properties = readTaskSchema(root);
    expect(properties.map((property) => [property.key, property.builtIn])).toEqual([
      ["name", true],
      ["status", true],
      ["priority", true],
      ["story_points", false],
    ]);
    expect(properties[1]).toMatchObject({ type: "status", colors: { Done: "green" } });
  });

  it("returns no properties when the AIOS has no schema file", () => {
    NodeFS.rmSync(NodePath.join(root, TASK_SCHEMA_FILE));
    expect(readTaskSchema(root)).toEqual([]);
    expect(() => setTaskSchemaProperty(root, "mood", { type: "text" })).toThrow(/task-schema/);
  });

  it("refuses a type change that a card value does not fit, and allows it once the value fits", () => {
    card("a.md", "story_points: 3\n");
    card("b.md", "story_points: lots\n");
    setTaskSchemaProperty(root, "story_points", { type: "text", label: "Points" });
    expect(readTaskSchema(root).at(-1)).toMatchObject({ key: "story_points", label: "Points" });
    expect(() => setTaskSchemaProperty(root, "story_points", { type: "number" })).toThrow(/1 card/);
    card("b.md", "story_points: 5\n");
    expect(
      setTaskSchemaProperty(root, "story_points", { type: "number", format: "progress" }).at(-1),
    ).toMatchObject({ type: "number", format: "progress" });
  });
});

describe("checkCardProps", () => {
  const properties = [
    { key: "story_points", type: "number", builtIn: false },
    { key: "status", type: "status", options: ["Not started", "Done"], builtIn: true },
    { key: "energy_type", type: "select", options: ["Deep Work"], builtIn: true },
  ] as const;

  it("allows schema keys without a task field and refuses the rest", () => {
    expect(checkCardProps(properties, { story_points: "3", energy_type: null })).toBeNull();
    expect(checkCardProps(properties, { status: "Done" })).toMatch(/cannot set/);
    expect(checkCardProps(properties, { mood: "x" })).toMatch(/cannot set/);
    expect(checkCardProps(properties, { story_points: "lots" })).toMatch(/does not fit/);
    expect(checkCardProps(properties, { energy_type: "Nap" })).toMatch(/does not fit/);
  });
});
