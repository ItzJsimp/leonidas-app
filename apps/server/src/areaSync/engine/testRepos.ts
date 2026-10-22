// @effect-diagnostics nodeBuiltinImport:off - test fixtures: real git repos in temp folders.
import { execFileSync } from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

const ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: "Test",
  GIT_AUTHOR_EMAIL: "test@example.invalid",
  GIT_COMMITTER_NAME: "Test",
  GIT_COMMITTER_EMAIL: "test@example.invalid",
  LC_ALL: "C",
};

/** Sync git for fixtures only. Throws on failure so a broken fixture fails loudly. */
export const g = (cwd: string, ...args: string[]) =>
  execFileSync("git", args, {
    cwd,
    env: ENV,
    encoding: "utf8",
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();

const roots: string[] = [];
export const tempDir = (prefix = "as-") => {
  const dir = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), prefix));
  roots.push(dir);
  return dir;
};
export const cleanTemp = () => {
  for (const dir of roots.splice(0)) NodeFS.rmSync(dir, { recursive: true, force: true });
};

export const write = (root: string, path: string, text: string) => {
  const file = NodePath.join(root, path);
  NodeFS.mkdirSync(NodePath.dirname(file), { recursive: true });
  NodeFS.writeFileSync(file, text, "utf8");
};
export const read = (root: string, path: string) =>
  NodeFS.readFileSync(NodePath.join(root, path), "utf8");

/** A bare remote `<base>/<repo>.git` seeded with files on branch main. */
export function makeRemote(base: string, repo: string, files: Record<string, string>): string {
  const bare = NodePath.join(base, `${repo}.git`);
  NodeFS.mkdirSync(bare, { recursive: true });
  g(bare, "init", "--bare", "-b", "main");
  const seed = tempDir("seed-");
  g(seed, "init", "-b", "main");
  for (const [path, text] of Object.entries(files)) write(seed, path, text);
  g(seed, "add", "-A");
  g(seed, "commit", "-m", "seed");
  g(seed, "push", bare, "main");
  return bare;
}

/** Clones a remote like another Member would, for making competing edits. */
export function cloneOf(base: string, repo: string): string {
  const dir = tempDir("peer-");
  g(dir, "clone", NodePath.join(base, `${repo}.git`), ".");
  return dir;
}

export const AREAS_TABLE = (rows: ReadonlyArray<readonly [string, string]>) =>
  [
    "# Areas",
    "",
    "| Slug | Name | Repo | Department | Sensitivity | Status |",
    "|---|---|---|---|---|---|",
    ...rows.map(
      ([slug, status]) =>
        `| \`${slug}\` | ${slug} | \`acme-${slug}\` | general | shared | ${status} |`,
    ),
    "",
  ].join("\n");

/** Home cloned into a root folder, like a Member's workspace. Remote Areas come from `base`. */
export function makeWorkspace(
  base: string,
  rows: ReadonlyArray<readonly [string, string]>,
): { root: string; base: string } {
  makeRemote(base, "acme-home", { "org/areas.md": AREAS_TABLE(rows), "workspace.json": "{}\n" });
  const root = tempDir("ws-");
  g(root, "clone", NodePath.join(base, "acme-home.git"), ".");
  return { root, base: `${base}${NodePath.sep}` };
}
