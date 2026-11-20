// @effect-diagnostics nodeBuiltinImport:off
import * as NodeFs from "node:fs";
import * as NodeOs from "node:os";
import * as NodePath from "node:path";

import { afterEach, describe, expect, it } from "@effect/vitest";

import { applySpecPatch, createSubagentSpec, updateSubagentSpec } from "./subagentEdit.ts";
import { parseSubagentSpec } from "./subagentPersona.ts";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) NodeFs.rmSync(root, { recursive: true, force: true });
});

const SPEC = [
  "---",
  "name: explorer",
  'description: "Finds things."',
  "# kept comment",
  "model: claude-haiku-5-5",
  "scope: structural",
  "enabled: false",
  "tools: [Read, Grep]",
  "context: []",
  "never:",
  '  - "Edit files."',
  "---",
  "",
  "You are explorer.",
  "",
].join("\n");

function makeSpecFile(contents = SPEC) {
  const root = NodeFs.mkdtempSync(NodePath.join(NodeOs.tmpdir(), "subagent-edit-"));
  roots.push(root);
  const folder = NodePath.join(root, ".agents", "subagents");
  NodeFs.mkdirSync(folder, { recursive: true });
  const path = NodePath.join(folder, "explorer.md");
  NodeFs.writeFileSync(path, contents);
  return { root, folder, path };
}

describe("applySpecPatch", () => {
  it("changes only the named fields and keeps the rest", () => {
    const next = applySpecPatch(SPEC, { enabled: true, tools: ["Read", "Glob"] });
    expect(next).toContain("enabled: true");
    expect(next).toContain("tools: [ Read, Glob ]");
    expect(next).toContain("# kept comment");
    expect(next).toContain("scope: structural");
    expect(next).toContain('  - "Edit files."');
    expect(next.endsWith("You are explorer.\n")).toBe(true);
    const spec = parseSubagentSpec(next, "explorer");
    expect(spec.enabled).toBe(true);
    expect(spec.tools).toEqual(["Read", "Glob"]);
  });

  it("removes the model line when the patch sets null", () => {
    const next = applySpecPatch(SPEC, { model: null });
    expect(next).not.toContain("model:");
  });

  it("writes a Context List as a column of paths", () => {
    const next = applySpecPatch(SPEC, { context: ["skills/a/SKILL.md", "DESIGN.md"] });
    expect(parseSubagentSpec(next, "explorer").context).toEqual(["skills/a/SKILL.md", "DESIGN.md"]);
  });
});

describe("updateSubagentSpec", () => {
  it("writes the patch to disk", () => {
    const { path } = makeSpecFile();
    updateSubagentSpec(path, { enabled: true });
    expect(parseSubagentSpec(NodeFs.readFileSync(path, "utf8"), "explorer").enabled).toBe(true);
  });

  it("puts the old text back when a Context List path leaves the folder", () => {
    const { path } = makeSpecFile();
    expect(() => updateSubagentSpec(path, { context: ["../outside.md"] })).toThrow();
    expect(NodeFs.readFileSync(path, "utf8")).toBe(SPEC);
  });
});

describe("createSubagentSpec", () => {
  it("creates a spec from starter text under the new name", () => {
    const { folder } = makeSpecFile();
    const target = createSubagentSpec({ folder, name: "scout", contents: SPEC });
    const spec = parseSubagentSpec(NodeFs.readFileSync(target, "utf8"), "scout");
    expect(spec.name).toBe("scout");
    expect(spec.tools).toEqual(["Read", "Grep"]);
  });

  it("refuses to overwrite and refuses a bad name", () => {
    const { folder } = makeSpecFile();
    expect(() => createSubagentSpec({ folder, name: "explorer", contents: SPEC })).toThrow(
      /already exists/,
    );
    expect(() => createSubagentSpec({ folder, name: "Bad Name", contents: SPEC })).toThrow();
  });
});

describe("agent file keys and body (S6)", () => {
  it("writes avatar, effort, skills, canSpawn and maxTurns, and keeps comments", () => {
    const next = applySpecPatch(SPEC, {
      avatar: "felt/researcher",
      effort: "medium",
      skills: ["youtube-search"],
      canSpawn: true,
      maxTurns: 20,
    });
    expect(next).toContain("# kept comment");
    const spec = parseSubagentSpec(next, "explorer");
    expect([spec.avatar, spec.effort, spec.skills, spec.canSpawn, spec.maxTurns]).toEqual([
      "felt/researcher",
      "medium",
      ["youtube-search"],
      true,
      20,
    ]);
    // null removes a key, an empty skills list removes the line.
    const cleared = applySpecPatch(next, {
      avatar: null,
      canSpawn: null,
      maxTurns: null,
      skills: [],
    });
    expect(cleared).not.toMatch(/avatar:|canSpawn:|maxTurns:|skills:/);
  });

  it("replaces the instructions and leaves the frontmatter as it was", () => {
    const next = applySpecPatch(SPEC, { body: "You are explorer. Be brief." });
    expect(next).toContain("# kept comment");
    expect(next.endsWith("---\nYou are explorer. Be brief.\n")).toBe(true);
    expect(parseSubagentSpec(next, "explorer").body).toBe("You are explorer. Be brief.");
  });

  it("decision 1: refuses a maxTurns below 1 before it writes", () => {
    const { path } = makeSpecFile();
    expect(() => updateSubagentSpec(path, { maxTurns: 0 })).toThrow(/maxTurns/);
    expect(NodeFs.readFileSync(path, "utf8")).toBe(SPEC);
  });

  it("writes the first free <name>-N.md when the name is taken, with name set to match", () => {
    const { folder, path } = makeSpecFile();
    const second = createSubagentSpec({
      folder,
      name: "explorer",
      contents: NodeFs.readFileSync(path, "utf8"),
      onNameTaken: "number",
    });
    const third = createSubagentSpec({
      folder,
      name: "explorer",
      contents: NodeFs.readFileSync(path, "utf8"),
      onNameTaken: "number",
    });
    expect([NodePath.basename(second), NodePath.basename(third)]).toEqual([
      "explorer-2.md",
      "explorer-3.md",
    ]);
    expect(parseSubagentSpec(NodeFs.readFileSync(second, "utf8"), "explorer-2").name).toBe(
      "explorer-2",
    );
    // The default still refuses a clash, so the editor can reject a duplicate name.
    expect(() => createSubagentSpec({ folder, name: "explorer", contents: SPEC })).toThrow(
      /already exists/,
    );
  });
});
