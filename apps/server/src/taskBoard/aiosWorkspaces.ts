// @effect-diagnostics nodeBuiltinImport:off - synchronous node and global APIs are used on purpose in this file.
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

import { findAiosRoot } from "./aiosCards.ts";

/**
 * A Workspace is one AIOS root with a `workspace.json` (ADR-0080). Every Command view resolves
 * its root here, by workspace id, so one workspace never reads another's folder.
 */
const WORKSPACE_FILE = "workspace.json";
const SCHEMA_VERSION = 1;
const ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;

export type AiosWorkspaceType = "personal" | "business" | "trading";

export interface AiosWorkspaceFile {
  readonly id: string;
  readonly name: string;
  readonly type: AiosWorkspaceType;
  readonly schemaVersion: number;
  /** Projects the Tasks rail folds into "More". Present only when the list is not empty. */
  readonly hiddenProjects?: ReadonlyArray<string>;
  /** Folder of a private crew pack the workspace loads. Present only when set. */
  readonly crewPack?: string;
}

const MAX_HIDDEN_PROJECTS = 200;

/** Distinct, trimmed, non-empty slugs in their given order, capped. */
function parseHiddenProjects(value: unknown): ReadonlyArray<string> {
  if (!Array.isArray(value)) return [];
  const slugs = value.filter((slug): slug is string => typeof slug === "string");
  return [...new Set(slugs.map((slug) => slug.trim()).filter(Boolean))].slice(
    0,
    MAX_HIDDEN_PROJECTS,
  );
}

export type AiosWorkspaceState =
  | { readonly status: "ready"; readonly root: string; readonly file: AiosWorkspaceFile }
  | { readonly status: "missing"; readonly root: string }
  | { readonly status: "invalid"; readonly root: string; readonly error: string };

function parseWorkspaceFile(value: unknown): AiosWorkspaceFile | string {
  if (typeof value !== "object" || value === null) return "The file is not a JSON object.";
  const { id, name, type, schemaVersion, hiddenProjects, crewPack } = value as Record<
    string,
    unknown
  >;
  if (schemaVersion !== SCHEMA_VERSION) return `schemaVersion must be ${SCHEMA_VERSION}.`;
  if (typeof id !== "string" || !ID_PATTERN.test(id)) {
    return "id must be lowercase letters, digits and hyphens.";
  }
  if (typeof name !== "string" || !name.trim()) return "name must not be empty.";
  if (type !== "personal" && type !== "business" && type !== "trading") {
    return 'type must be "personal", "business" or "trading".';
  }
  if (crewPack !== undefined && (typeof crewPack !== "string" || !crewPack.trim())) {
    return "crewPack must be a path.";
  }
  const hidden = parseHiddenProjects(hiddenProjects);
  return {
    id,
    name: name.trim(),
    type,
    schemaVersion,
    ...(hidden.length > 0 ? { hiddenProjects: hidden } : {}),
    ...(typeof crewPack === "string" ? { crewPack: crewPack.trim() } : {}),
  };
}

export function readWorkspaceFile(root: string): AiosWorkspaceState {
  let text: string;
  try {
    text = NodeFS.readFileSync(NodePath.join(root, WORKSPACE_FILE), "utf8");
  } catch {
    return { status: "missing", root };
  }
  let json: unknown;
  try {
    json = JSON.parse(text.replace(/^﻿/, ""));
  } catch {
    return { status: "invalid", root, error: "The file is not valid JSON." };
  }
  const parsed = parseWorkspaceFile(json);
  return typeof parsed === "string"
    ? { status: "invalid", root, error: parsed }
    : { status: "ready", root, file: parsed };
}

/** Writes a valid `workspace.json` (the setup prompt). Throws on bad input. */
export function writeWorkspaceFile(
  root: string,
  input: { readonly id: string; readonly name: string; readonly type: AiosWorkspaceType },
): AiosWorkspaceState {
  const parsed = parseWorkspaceFile({ ...input, schemaVersion: SCHEMA_VERSION });
  if (typeof parsed === "string") throw new Error(parsed);
  const target = NodePath.join(root, WORKSPACE_FILE);
  let existing: NodeFS.Stats | undefined;
  try {
    existing = NodeFS.lstatSync(target);
  } catch {
    // No file yet: the normal setup case.
  }
  if (existing && !existing.isFile()) throw new Error("workspace.json is not a regular file.");
  NodeFS.writeFileSync(target, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
  listCache.clear();
  return readWorkspaceFile(root);
}

/** Adds the empty Trading logs that the `trading` RPC reads. Existing files stay as they are. */
export function writeTradingStarter(root: string): void {
  const dir = NodePath.join(root, "trading");
  NodeFS.mkdirSync(dir, { recursive: true });
  for (const name of ["ledger.jsonl", "trades.jsonl"]) {
    try {
      NodeFS.writeFileSync(NodePath.join(dir, name), "", { flag: "wx" });
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code !== "EEXIST") throw cause;
    }
  }
}

/**
 * Saves the projects the Tasks rail folds into "More". Every other key in the file stays, and the
 * file lives in the AIOS folder, so the list follows the folder to each device. Throws when the
 * folder has no valid workspace.json or the file is a link.
 */
export function writeHiddenProjects(
  root: string,
  slugs: ReadonlyArray<string>,
): AiosWorkspaceState {
  if (readWorkspaceFile(root).status !== "ready") {
    throw new Error("This folder has no valid workspace.json.");
  }
  const target = NodePath.join(root, WORKSPACE_FILE);
  if (!NodeFS.lstatSync(target).isFile()) throw new Error("workspace.json is not a regular file.");
  const raw = JSON.parse(NodeFS.readFileSync(target, "utf8").replace(/^﻿/, "")) as Record<
    string,
    unknown
  >;
  const { hiddenProjects: _previous, ...rest } = raw;
  const hidden = parseHiddenProjects(slugs);
  const next = hidden.length > 0 ? { ...rest, hiddenProjects: hidden } : rest;
  NodeFS.writeFileSync(target, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  listCache.clear();
  return readWorkspaceFile(root);
}

// Each request resolves its scope, so real paths are kept briefly instead of resolved per compare.
const KEY_TTL_MS = 2_000;
const keyCache = new Map<string, { readonly key: string; readonly at: number }>();

const keyFor = (path: string) => {
  const now = performance.now();
  const cached = keyCache.get(path);
  if (cached && now - cached.at < KEY_TTL_MS) return cached.key;
  let real = path;
  try {
    real = NodeFS.realpathSync.native(path);
  } catch {
    // Keep the given path when it cannot be resolved.
  }
  const key = NodePath.sep === "\\" ? real.toLowerCase() : real;
  if (keyCache.size > 512) keyCache.clear();
  keyCache.set(path, { key, at: now });
  return key;
};

/**
 * Finds each AIOS root once, in hint order (confirmed folder, env, then project folders).
 * A hint with its own valid workspace.json is a root. A folder with no workspace.json and no
 * projects/ is a bare tasks/ folder, not an AIOS. A root that reuses a ready id is refused, so one id never names two folders.
 */
export function listAiosWorkspaces(
  hints: ReadonlyArray<string | undefined>,
): ReadonlyArray<AiosWorkspaceState> {
  // One request calls this several times; a short cache keeps disk reads to one per window.
  const cacheKey = hints.join("\n");
  const now = performance.now();
  const cached = listCache.get(cacheKey);
  if (cached && now - cached.at < KEY_TTL_MS) return cached.workspaces;
  const workspaces = scanAiosWorkspaces(hints);
  if (listCache.size > 64) listCache.clear();
  listCache.set(cacheKey, { workspaces, at: now });
  return workspaces;
}

const listCache = new Map<
  string,
  { readonly workspaces: ReadonlyArray<AiosWorkspaceState>; readonly at: number }
>();

function scanAiosWorkspaces(
  hints: ReadonlyArray<string | undefined>,
): ReadonlyArray<AiosWorkspaceState> {
  const seen = new Set<string>();
  const ids = new Set<string>();
  const workspaces: AiosWorkspaceState[] = [];
  for (const hint of hints) {
    // A folder with its own valid workspace.json is a root, also with no tasks/ (a Trading folder).
    const own = hint?.trim() ? ownWorkspace(NodePath.resolve(hint.trim())) : null;
    const root = own?.root ?? findAiosRoot([hint]);
    if (root === null) continue;
    const key = keyFor(root);
    if (seen.has(key)) continue;
    seen.add(key);
    const state = own ?? readWorkspaceFile(root);
    if (state.status === "missing" && !hasProjects(root)) continue;
    if (state.status === "ready") {
      if (ids.has(state.file.id)) {
        workspaces.push({ status: "invalid", root, error: `The id "${state.file.id}" is in use.` });
        continue;
      }
      ids.add(state.file.id);
    }
    workspaces.push(state);
  }
  return workspaces;
}

/** The ready state of a folder's own workspace.json, else null. existsSync skips a thrown read. */
const ownWorkspace = (folder: string): AiosWorkspaceState | null => {
  if (!NodeFS.existsSync(NodePath.join(folder, WORKSPACE_FILE))) return null;
  const state = readWorkspaceFile(folder);
  return state.status === "ready" ? state : null;
};

const hasProjects = (root: string): boolean => {
  try {
    return NodeFS.statSync(NodePath.join(root, "projects")).isDirectory();
  } catch {
    return false;
  }
};

/**
 * The root for a workspace id. An id that matches no ready workspace resolves to null, never to
 * another workspace. With no id, the first listed root wins (the confirmed folder, then the env
 * folder), ready or not, so a broken workspace file never moves default writes into another
 * workspace.
 */
export function resolveWorkspaceRoot(
  workspaces: ReadonlyArray<AiosWorkspaceState>,
  workspaceId: string | null | undefined,
): string | null {
  if (workspaceId) {
    const match = workspaces.find(
      (workspace) => workspace.status === "ready" && workspace.file.id === workspaceId,
    );
    return match?.root ?? null;
  }
  return workspaces[0]?.root ?? null;
}

/** True when `path` (a project folder) is `root` or inside it, after links resolve. */
export function isPathInRoot(root: string, path: string): boolean {
  const relative = NodePath.relative(keyFor(root), keyFor(path));
  return relative === "" || (!relative.startsWith("..") && !NodePath.isAbsolute(relative));
}

/** The workspace whose root holds `path` (a project folder), or undefined. */
export function workspaceForPath(
  workspaces: ReadonlyArray<AiosWorkspaceState>,
  path: string,
): AiosWorkspaceState | undefined {
  // Nested roots: the innermost (longest) root that holds the path wins.
  let best: AiosWorkspaceState | undefined;
  for (const workspace of workspaces) {
    if (!isPathInRoot(workspace.root, path)) continue;
    if (!best || keyFor(workspace.root).length > keyFor(best.root).length) best = workspace;
  }
  return best;
}
