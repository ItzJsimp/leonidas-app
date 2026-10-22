// @effect-diagnostics nodeBuiltinImport:off - the engine reads and writes the workspace folder.
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

import { parseAreas, planJoin, type AreaEntry } from "./areas.ts";
import { classifyFailure, remoteBaseOf, type Git } from "./git.ts";

export const AREAS_FILE = "org/areas.md";
export const AREAS_DIR = "areas";

export type JoinState = "joined" | "present" | "locked" | "offline" | "failed";
export interface JoinResult {
  readonly slug: string;
  readonly state: JoinState;
  readonly detail: string;
}

export const areaDir = (root: string, slug: string) => NodePath.join(root, AREAS_DIR, slug);

const isRepo = (dir: string) => NodeFS.existsSync(NodePath.join(dir, ".git"));

/** The Areas already cloned under `areas/`. */
export function areasOnDisk(root: string): ReadonlySet<string> {
  const dir = NodePath.join(root, AREAS_DIR);
  if (!NodeFS.existsSync(dir)) return new Set();
  return new Set(
    NodeFS.readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && isRepo(NodePath.join(dir, entry.name)))
      .map((entry) => entry.name),
  );
}

/** Home must ignore `areas/`, because each Area is its own repo. Adds one line, never removes any. */
export function ensureAreasIgnored(root: string): boolean {
  const file = NodePath.join(root, ".gitignore");
  const text = NodeFS.existsSync(file) ? NodeFS.readFileSync(file, "utf8") : "";
  if (
    text
      .split(/\r?\n/)
      .some((line) => line.trim() === `${AREAS_DIR}/` || line.trim() === `/${AREAS_DIR}/`)
  ) {
    return false;
  }
  const lead = text === "" || text.endsWith("\n") ? "" : "\n";
  NodeFS.appendFileSync(file, `${lead}${AREAS_DIR}/\n`, "utf8");
  return true;
}

export interface JoinInput {
  readonly root: string;
  readonly git: Git;
  /** Where Area repos live, such as `https://github.com/org/`. Defaults to the base of Home's `origin`. */
  readonly remoteBase?: string;
}
export interface JoinOutcome {
  readonly results: ReadonlyArray<JoinResult>;
  readonly ignoreAdded: boolean;
}

async function cloneOne(input: JoinInput, base: string, area: AreaEntry): Promise<JoinResult> {
  const dir = areaDir(input.root, area.slug);
  if (NodeFS.existsSync(dir) && NodeFS.readdirSync(dir).length > 0) {
    return {
      slug: area.slug,
      state: "failed",
      detail: "The folder exists and is not an Area repo. It was left as it is.",
    };
  }
  const run = await input.git(["clone", `${base}${area.repo}.git`, dir], input.root);
  if (run.code === 0) return { slug: area.slug, state: "joined", detail: "" };
  const kind = classifyFailure(run.out);
  return {
    slug: area.slug,
    state: kind === "error" ? "failed" : kind,
    detail: run.out.slice(-200),
  };
}

/**
 * Clones every active Area the Member can read into `areas/<slug>/`. An Area that GitHub refuses
 * is `locked`, which is normal. Safe to run again: Areas already on disk are left alone.
 */
export async function joinWorkspace(input: JoinInput): Promise<JoinOutcome> {
  const file = NodePath.join(input.root, AREAS_FILE);
  if (!NodeFS.existsSync(file)) throw new Error(`${AREAS_FILE} is missing in the workspace.`);
  const plan = planJoin(parseAreas(NodeFS.readFileSync(file, "utf8")), areasOnDisk(input.root));

  let base = input.remoteBase ?? null;
  if (base === null && plan.clone.length > 0) {
    const origin = await input.git(["remote", "get-url", "origin"], input.root);
    base = origin.code === 0 ? remoteBaseOf(origin.out) : null;
    if (base === null)
      throw new Error("Home has no origin remote, so the Area repos cannot be found.");
  }
  const ignoreAdded = ensureAreasIgnored(input.root);
  NodeFS.mkdirSync(NodePath.join(input.root, AREAS_DIR), { recursive: true });

  const results: JoinResult[] = plan.sync.map((area) => ({
    slug: area.slug,
    state: "present",
    detail: "",
  }));
  for (const area of plan.clone) results.push(await cloneOne(input, base!, area));
  return { results, ignoreAdded };
}
