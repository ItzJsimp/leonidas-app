// @effect-diagnostics nodeBuiltinImport:off - a small sync reader of the AIOS memory index (node:sqlite, read-only).
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as NodeSqlite from "node:sqlite";

/** The index the AIOS builds (`scripts/Build-LeonidasMemoryIndex.py`): `memory_fts(path, name, desc, body)`. */
const INDEX_FILE = NodePath.join(".leonidas", "memory.sqlite");
export const MAX_READ_CHARS = 20_000;
export const MAX_QUERY_CHARS = 500;

export interface MemoryHit {
  readonly path: string;
  readonly name: string;
  readonly description: string;
  readonly snippet: string;
  readonly score: number;
  /** First line of the file that holds a query word. Absent when the file is gone. */
  readonly line?: number;
}

const termsOf = (query: string) =>
  query
    .slice(0, MAX_QUERY_CHARS)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((term) => term.length > 1);

/** Runs `use` on the index, or returns null when the AIOS has not built one. The handle always closes. */
function withIndex<A>(root: string, use: (db: NodeSqlite.DatabaseSync) => A): A | null {
  const file = NodePath.join(root, INDEX_FILE);
  if (!NodeFS.existsSync(file)) return null;
  const db = new NodeSqlite.DatabaseSync(file, { readOnly: true });
  try {
    return use(db);
  } finally {
    db.close();
  }
}

// shortcut: the first line with any query word, which is often the name line of the frontmatter. Skip frontmatter if agents need the body line.
function lineOf(root: string, path: string, terms: ReadonlyArray<string>): number | undefined {
  const full = NodePath.resolve(root, path);
  // The path comes from the index, but a bad index must not read outside the AIOS.
  if (!full.startsWith(NodePath.resolve(root) + NodePath.sep)) return undefined;
  try {
    const lines = NodeFS.readFileSync(full, "utf8").split(/\r?\n/);
    const at = lines.findIndex((line) => terms.some((term) => line.toLowerCase().includes(term)));
    return at < 0 ? undefined : at + 1;
  } catch {
    return undefined;
  }
}

/** Ranked hits, best first. `null` means the index is not built. A query with no usable word finds nothing. */
export function searchMemory(
  root: string,
  query: string,
  limit: number,
): ReadonlyArray<MemoryHit> | null {
  const terms = termsOf(query);
  return withIndex(root, (db) => {
    if (terms.length === 0) return [];
    const rows = db
      .prepare(
        `SELECT path, name, desc, snippet(memory_fts, 3, '[', ']', ' ... ', 20) AS snip,
                bm25(memory_fts, 0.0, 4.0, 3.0, 1.0) AS score
         FROM memory_fts WHERE memory_fts MATCH ? ORDER BY score LIMIT ?`,
      )
      .all(terms.map((term) => `"${term}"`).join(" OR "), limit) as ReadonlyArray<
      Record<string, string | number | null>
    >;
    return rows.map((row) => {
      const path = String(row.path ?? "");
      const line = lineOf(root, path, terms);
      return {
        path,
        name: String(row.name ?? ""),
        description: String(row.desc ?? ""),
        snippet: String(row.snip ?? ""),
        score: Number(row.score ?? 0),
        ...(line === undefined ? {} : { line }),
      };
    });
  });
}

export interface MemoryEntry {
  readonly path: string;
  readonly name: string;
  readonly description: string;
  readonly content: string;
  readonly truncated: boolean;
}

/**
 * One indexed entry by its exact path. It reads the index row, never the file system, so only
 * indexed memory can come back: a path like `../.env` finds nothing.
 */
export function readMemory(root: string, path: string): MemoryEntry | "not_built" | null {
  const entry = withIndex(
    root,
    (db) =>
      db
        .prepare("SELECT path, name, desc, body FROM memory_fts WHERE path = ? LIMIT 1")
        .get(path) as Record<string, string | null> | undefined,
  );
  if (entry === null) return "not_built";
  if (entry === undefined) return null;
  const body = String(entry.body ?? "");
  return {
    path: String(entry.path),
    name: String(entry.name ?? ""),
    description: String(entry.desc ?? ""),
    content: body.slice(0, MAX_READ_CHARS),
    truncated: body.length > MAX_READ_CHARS,
  };
}
