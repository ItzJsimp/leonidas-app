// @effect-diagnostics nodeBuiltinImport:off
import * as NodeFs from "node:fs";
import * as NodeOs from "node:os";
import * as NodePath from "node:path";

import { afterEach, describe, expect, it } from "@effect/vitest";

import {
  createStudioSubagent,
  deleteStudioSubagent,
  duplicateStudioSubagent,
  updateStudioSubagent,
} from "./subagentStudioWrites.ts";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) NodeFs.rmSync(root, { recursive: true, force: true });
});

const STARTER = [
  "---",
  "name: explorer",
  "model: claude-haiku-5-5",
  "enabled: false",
  "tools: [Read]",
  "---",
  "",
  "You are explorer.",
  "",
].join("\n");

function makeAios() {
  const aios = NodeFs.mkdtempSync(NodePath.join(NodeOs.tmpdir(), "studio-writes-"));
  roots.push(aios);
  const folder = NodePath.join(aios, ".agents", "subagents");
  NodeFs.mkdirSync(folder, { recursive: true });
  NodeFs.writeFileSync(NodePath.join(folder, "explorer.md"), STARTER);
  return {
    aios,
    folder,
    scope: { aiosRoot: aios, projects: [], appFreeModels: ["claude-haiku-5-5"] },
  };
}

describe("studio writes", () => {
  it("turns a listed subagent on and returns its new entry", () => {
    const { folder, scope } = makeAios();
    const entry = updateStudioSubagent(scope, {
      specPath: NodePath.join(folder, "explorer.md"),
      patch: { enabled: true },
    });
    expect(entry.enabled).toBe(true);
    expect(entry.error).toBeNull();
  });

  it("refuses a file the catalog does not list", () => {
    const { aios, scope } = makeAios();
    const stray = NodePath.join(aios, "notes.md");
    NodeFs.writeFileSync(stray, "x");
    expect(() =>
      updateStudioSubagent(scope, { specPath: stray, patch: { enabled: true } }),
    ).toThrow(/not in the Studio list/);
  });

  it("creates a subagent in the AIOS folder and refuses a second one with the same name", () => {
    const { scope } = makeAios();
    const entry = createStudioSubagent(scope, {
      name: "scout",
      contents: STARTER,
      destination: { kind: "aios" },
    });
    expect(entry.name).toBe("scout");
    expect(() =>
      createStudioSubagent(scope, {
        name: "scout",
        contents: STARTER,
        destination: { kind: "aios" },
      }),
    ).toThrow(/already exists/);
  });
});

describe("studio duplicate and delete (S6)", () => {
  it("duplicate adds exactly one new file in the AIOS folder and leaves the original", () => {
    const { folder, scope } = makeAios();
    const original = NodePath.join(folder, "explorer.md");
    const before = NodeFs.readdirSync(folder).sort();
    const copy = duplicateStudioSubagent(scope, { specPath: original });
    const after = NodeFs.readdirSync(folder).sort();
    expect(before).toEqual(["explorer.md"]);
    expect(after).toEqual(["explorer-2.md", "explorer.md"]);
    expect(copy.name).toBe("explorer-2");
    expect(NodeFs.readFileSync(original, "utf8")).toBe(STARTER);
  });

  it("delete removes only that file, and the original stays", () => {
    const { folder, scope } = makeAios();
    const original = NodePath.join(folder, "explorer.md");
    const copy = duplicateStudioSubagent(scope, { specPath: original });
    deleteStudioSubagent(scope, { specPath: copy.specPath });
    expect(NodeFs.existsSync(copy.specPath)).toBe(false);
    expect(NodeFs.existsSync(original)).toBe(true);
  });

  it("refuses to delete or duplicate a file that the catalog does not list", () => {
    const { aios, scope } = makeAios();
    const stray = NodePath.join(aios, "notes.md");
    NodeFs.writeFileSync(stray, "x");
    expect(() => deleteStudioSubagent(scope, { specPath: stray })).toThrow(
      /not in the Studio list/,
    );
    expect(() => duplicateStudioSubagent(scope, { specPath: stray })).toThrow(
      /not in the Studio list/,
    );
    expect(NodeFs.existsSync(stray)).toBe(true);
  });

  it("create from a starter numbers the name when it is taken", () => {
    const { folder, scope } = makeAios();
    const entry = createStudioSubagent(scope, {
      name: "explorer",
      contents: STARTER,
      destination: { kind: "aios" },
      onNameTaken: "number",
    });
    expect(entry.name).toBe("explorer-2");
    expect(NodeFs.existsSync(NodePath.join(folder, "explorer-2.md"))).toBe(true);
  });
});
