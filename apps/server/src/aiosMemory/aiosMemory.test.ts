// @effect-diagnostics nodeBuiltinImport:off - the test builds a throwaway AIOS folder with a real FTS5 index.
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeSqlite from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest";

import { MAX_READ_CHARS, readMemory, searchMemory } from "./aiosMemory.ts";

let root: string;
const build = (docs: ReadonlyArray<readonly [string, string, string, string]>) => {
  NodeFS.mkdirSync(NodePath.join(root, ".leonidas"), { recursive: true });
  const db = new NodeSqlite.DatabaseSync(NodePath.join(root, ".leonidas", "memory.sqlite"));
  db.exec(
    "CREATE VIRTUAL TABLE memory_fts USING fts5(path, name, desc, body, tokenize='porter unicode61')",
  );
  const insert = db.prepare("INSERT INTO memory_fts(path, name, desc, body) VALUES (?, ?, ?, ?)");
  for (const doc of docs) insert.run(...doc);
  db.close();
};

beforeEach(() => {
  root = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "aios-memory-"));
});
afterEach(() => NodeFS.rmSync(root, { recursive: true, force: true }));

describe("searchMemory", () => {
  it("returns a ranked hit with its path and the line that holds the word", () => {
    NodeFS.mkdirSync(NodePath.join(root, "memory"));
    NodeFS.writeFileSync(NodePath.join(root, "memory", "cats.md"), "intro\nCats purr softly\n");
    build([["memory/cats.md", "Cats", "About cats", "intro\nCats purr softly"]]);
    const [hit] = searchMemory(root, "purr", 5) ?? [];
    expect(hit?.path).toBe("memory/cats.md");
    expect(hit?.line).toBe(2);
  });

  it("finds nothing for a miss, and for a query with no usable word", () => {
    build([["memory/a.md", "A", "d", "alpha beta"]]);
    expect(searchMemory(root, "zebra", 5)).toEqual([]);
    expect(searchMemory(root, "! ? a", 5)).toEqual([]);
  });

  it("reports an index that is not built as null", () => {
    expect(searchMemory(root, "anything", 5)).toBeNull();
  });
});

describe("readMemory", () => {
  it("cuts an over-size entry and flags it", () => {
    build([["memory/big.md", "Big", "d", "x".repeat(MAX_READ_CHARS + 10)]]);
    const entry = readMemory(root, "memory/big.md");
    expect(typeof entry === "object" && entry?.content.length).toBe(MAX_READ_CHARS);
    expect(typeof entry === "object" && entry?.truncated).toBe(true);
  });

  it("reads only indexed paths, so a traversal path finds nothing", () => {
    NodeFS.writeFileSync(NodePath.join(root, ".env"), "SECRET=1");
    build([["memory/a.md", "A", "d", "alpha"]]);
    expect(readMemory(root, "../.env")).toBeNull();
    expect(readMemory(root, ".env")).toBeNull();
    expect(readMemory(root, "memory/missing.md")).toBeNull();
  });

  it("reports an index that is not built", () => {
    expect(readMemory(root, "memory/a.md")).toBe("not_built");
  });
});
