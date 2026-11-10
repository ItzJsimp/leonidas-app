// @effect-diagnostics nodeBuiltinImport:off - synchronous node and global APIs are used on purpose in this file.
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";

import { isInsideRoot } from "./aiosCards.ts";
import {
  listAiosWorkspaces,
  readWorkspaceFile,
  resolveWorkspaceRoot,
  workspaceForPath,
  writeHiddenProjects,
  writeWorkspaceFile,
} from "./aiosWorkspaces.ts";

let temp: string;
const makeAios = (name: string, file?: unknown) => {
  const root = NodePath.join(temp, name);
  NodeFS.mkdirSync(NodePath.join(root, "tasks"), { recursive: true });
  NodeFS.mkdirSync(NodePath.join(root, "projects"), { recursive: true });
  if (file !== undefined) {
    NodeFS.writeFileSync(
      NodePath.join(root, "workspace.json"),
      typeof file === "string" ? file : JSON.stringify(file),
    );
  }
  return root;
};

beforeEach(() => {
  // A space in the path, like "D:\SimplyGersi AIOS".
  temp = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "aios workspaces-"));
});
afterEach(() => NodeFS.rmSync(temp, { recursive: true, force: true }));

describe("readWorkspaceFile", () => {
  it("reads a valid file", () => {
    const root = makeAios("SG AIOS", {
      id: "simplygersi",
      name: "SimplyGersi",
      type: "business",
      schemaVersion: 1,
    });
    expect(readWorkspaceFile(root)).toEqual({
      status: "ready",
      root,
      file: { id: "simplygersi", name: "SimplyGersi", type: "business", schemaVersion: 1 },
    });
  });

  it("reports a missing file", () => {
    const root = makeAios("bare");
    expect(readWorkspaceFile(root)).toEqual({ status: "missing", root });
  });

  it.each([
    ["not json", "{ id:"],
    ["bad type", { id: "x", name: "X", type: "team", schemaVersion: 1 }],
    ["bad id", { id: "Has Space", name: "X", type: "personal", schemaVersion: 1 }],
    ["no name", { id: "x", name: " ", type: "personal", schemaVersion: 1 }],
    ["future schema", { id: "x", name: "X", type: "personal", schemaVersion: 2 }],
  ])("reports an invalid file: %s", (_label, file) => {
    const root = makeAios("bad", file);
    const state = readWorkspaceFile(root);
    expect(state.status).toBe("invalid");
  });

  it("accepts a UTF-8 BOM and CRLF line endings", () => {
    const root = makeAios(
      "bom",
      '\uFEFF{\r\n"id": "leonidas",\r\n"name": "Leonidas",\r\n"type": "personal",\r\n"schemaVersion": 1\r\n}\r\n',
    );
    expect(readWorkspaceFile(root).status).toBe("ready");
  });
});

describe("listAiosWorkspaces and resolveWorkspaceRoot", () => {
  it("finds each AIOS once from roots and project folders, in hint order", () => {
    const a = makeAios("A", { id: "a", name: "A", type: "personal", schemaVersion: 1 });
    const b = makeAios("B", { id: "b", name: "B", type: "business", schemaVersion: 1 });
    const projectInA = NodePath.join(a, "projects", "app");
    NodeFS.mkdirSync(projectInA, { recursive: true });
    const list = listAiosWorkspaces([undefined, a, projectInA, b, "", b]);
    expect(list.map((workspace) => workspace.root)).toEqual([a, b]);
  });

  it("resolves an id only to its own root and never falls back to another", () => {
    const a = makeAios("A", { id: "a", name: "A", type: "personal", schemaVersion: 1 });
    const b = makeAios("B", { id: "b", name: "B", type: "business", schemaVersion: 1 });
    const list = listAiosWorkspaces([a, b]);
    expect(resolveWorkspaceRoot(list, "b")).toBe(b);
    expect(resolveWorkspaceRoot(list, "missing-id")).toBeNull();
    // No id: the first listed root, so a single-AIOS install keeps working.
    expect(resolveWorkspaceRoot(list, undefined)).toBe(a);
  });

  it("keeps the first listed root as the default even when its file is broken", () => {
    const personal = makeAios("P", "{ broken");
    const business = makeAios("B", { id: "b", name: "B", type: "business", schemaVersion: 1 });
    expect(resolveWorkspaceRoot(listAiosWorkspaces([personal, business]), undefined)).toBe(
      personal,
    );
  });

  it("falls back to the first root when no workspace is set up yet", () => {
    const bare = makeAios("bare");
    expect(resolveWorkspaceRoot(listAiosWorkspaces([bare]), null)).toBe(bare);
    expect(resolveWorkspaceRoot(listAiosWorkspaces([bare]), "any")).toBeNull();
  });
});

describe("workspaceForPath", () => {
  it("maps a project folder to the workspace that holds it", () => {
    const a = makeAios("A", { id: "a", name: "A", type: "personal", schemaVersion: 1 });
    const b = makeAios("A-b", { id: "b", name: "B", type: "business", schemaVersion: 1 });
    const project = NodePath.join(b, "projects", "app");
    NodeFS.mkdirSync(project, { recursive: true });
    const list = listAiosWorkspaces([a, b]);
    expect(workspaceForPath(list, project)?.root).toBe(b);
    expect(workspaceForPath(list, a)?.root).toBe(a);
    expect(workspaceForPath(list, temp)).toBeUndefined();
  });
});

describe("workspace root rules (L3 follow-ups)", () => {
  it("maps a path in a nested AIOS to the innermost root, in any hint order", () => {
    const outer = makeAios("outer", {
      id: "outer",
      name: "Outer",
      type: "personal",
      schemaVersion: 1,
    });
    const inner = makeAios(NodePath.join("outer", "inner"), {
      id: "inner",
      name: "Inner",
      type: "business",
      schemaVersion: 1,
    });
    const project = NodePath.join(inner, "projects", "app");
    NodeFS.mkdirSync(project, { recursive: true });
    for (const hints of [
      [outer, inner],
      [inner, outer],
    ]) {
      expect(workspaceForPath(listAiosWorkspaces(hints), project)?.root).toBe(inner);
    }
  });

  it("refuses a second root that reuses a workspace id", () => {
    const file = { id: "same", name: "Same", type: "personal", schemaVersion: 1 };
    const first = makeAios("first", file);
    const second = makeAios("second", file);
    const listed = listAiosWorkspaces([first, second]);
    expect(listed.map((workspace) => workspace.status)).toEqual(["ready", "invalid"]);
    expect(resolveWorkspaceRoot(listed, "same")).toBe(first);
  });

  it("does not list a project folder's bare tasks/ folder as a workspace", () => {
    const aios = makeAios("aios", { id: "main", name: "Main", type: "personal", schemaVersion: 1 });
    const loose = NodePath.join(temp, "loose");
    NodeFS.mkdirSync(NodePath.join(loose, "tasks"), { recursive: true });
    expect(listAiosWorkspaces([aios, loose]).map((workspace) => workspace.root)).toEqual([aios]);
    expect(listAiosWorkspaces([loose])).toEqual([]);
  });
});

describe("listAiosWorkspaces cache", () => {
  it("reuses a recent list and reads again after writeWorkspaceFile", () => {
    const root = makeAios("cached");
    const other = makeAios("other");
    expect(listAiosWorkspaces([root])[0]?.status).toBe("missing");
    NodeFS.writeFileSync(
      NodePath.join(root, "workspace.json"),
      JSON.stringify({ id: "cached", name: "Cached", type: "personal", schemaVersion: 1 }),
    );
    // An edit outside the app shows after the short cache window.
    expect(listAiosWorkspaces([root])[0]?.status).toBe("missing");
    writeWorkspaceFile(other, { id: "other", name: "Other", type: "personal" });
    expect(listAiosWorkspaces([root])[0]?.status).toBe("ready");
  });
});

describe("writeWorkspaceFile", () => {
  it("writes a file that reads back as ready, and refuses a bad id", () => {
    const root = makeAios("new");
    const written = writeWorkspaceFile(root, { id: "sg", name: "SG", type: "business" });
    expect(written).toEqual({
      status: "ready",
      root,
      file: { id: "sg", name: "SG", type: "business", schemaVersion: 1 },
    });
    expect(readWorkspaceFile(root)).toEqual(written);
    expect(() => writeWorkspaceFile(root, { id: "../x", name: "X", type: "personal" })).toThrow();
  });

  it("refuses to write workspace.json through a link", () => {
    const root = makeAios("linked");
    const outside = NodePath.join(temp, "outside.json");
    NodeFS.writeFileSync(outside, "{}");
    NodeFS.symlinkSync(outside, NodePath.join(root, "workspace.json"), "file");
    expect(() => writeWorkspaceFile(root, { id: "x", name: "X", type: "personal" })).toThrow();
    expect(NodeFS.readFileSync(outside, "utf8")).toBe("{}");
  });
});

describe("writeHiddenProjects", () => {
  const file = { id: "me", name: "Me", type: "personal", schemaVersion: 1, extra: "keep" };

  it("saves the rail's hidden list once each, keeps other keys, and clears it when empty", () => {
    const root = makeAios("hide", file);
    const written = writeHiddenProjects(root, ["prop", "arch", "prop", " "]);
    expect(written.status === "ready" && written.file.hiddenProjects).toEqual(["prop", "arch"]);
    const raw = JSON.parse(NodeFS.readFileSync(NodePath.join(root, "workspace.json"), "utf8"));
    expect(raw).toMatchObject({ extra: "keep", hiddenProjects: ["prop", "arch"] });
    writeHiddenProjects(root, []);
    expect(readWorkspaceFile(root)).toEqual({
      status: "ready",
      root,
      file: { id: "me", name: "Me", type: "personal", schemaVersion: 1 },
    });
  });

  it("refuses a folder without a valid file, and a file behind a link", () => {
    expect(() => writeHiddenProjects(makeAios("none"), ["a"])).toThrow();
    const root = makeAios("linked-hide");
    const outside = NodePath.join(temp, "outside-hide.json");
    NodeFS.writeFileSync(outside, JSON.stringify(file));
    NodeFS.symlinkSync(outside, NodePath.join(root, "workspace.json"), "file");
    expect(() => writeHiddenProjects(root, ["a"])).toThrow();
    expect(JSON.parse(NodeFS.readFileSync(outside, "utf8"))).toEqual(file);
  });
});

describe("isInsideRoot", () => {
  it("allows the root and its children and rejects siblings and prefixes", () => {
    const root = makeAios("A");
    const real = NodeFS.realpathSync.native(root);
    expect(isInsideRoot(real, real)).toBe(true);
    expect(isInsideRoot(real, NodePath.join(real, "tasks", "x.md"))).toBe(true);
    expect(isInsideRoot(real, `${real}-other`)).toBe(false);
    expect(isInsideRoot(real, NodePath.dirname(real))).toBe(false);
  });
});

describe("trading workspace type", () => {
  it("accepts trading with an optional crew pack path", () => {
    const root = makeAios("trade", {
      id: "trading",
      name: "Trading",
      type: "trading",
      schemaVersion: 1,
      crewPack: " packs/crew ",
    });
    expect(readWorkspaceFile(root)).toMatchObject({
      status: "ready",
      file: { type: "trading", crewPack: "packs/crew" },
    });
  });

  it("rejects an unknown type and an empty crew pack path", () => {
    const unknown = makeAios("odd", { id: "x", name: "X", type: "trader", schemaVersion: 1 });
    expect(readWorkspaceFile(unknown).status).toBe("invalid");
    const empty = makeAios("empty", {
      id: "y",
      name: "Y",
      type: "trading",
      schemaVersion: 1,
      crewPack: " ",
    });
    expect(readWorkspaceFile(empty).status).toBe("invalid");
  });
});
