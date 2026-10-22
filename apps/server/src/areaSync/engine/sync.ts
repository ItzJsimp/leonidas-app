// @effect-diagnostics nodeBuiltinImport:off - the engine reads the workspace folder.
// @effect-diagnostics globalDate:off - the saved-ref name needs a clock; tests inject their own.
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

import { classifyFailure, identityArgs, type Git } from "./git.ts";
import { AREAS_DIR, areasOnDisk, joinWorkspace, type JoinResult } from "./join.ts";

/**
 * The safety rules, each proved by a test in sync.test.ts:
 * 1. Never delete a file or folder. 2. Never force-push, reset or clean.
 * 3. Commit local changes before any pull. 4. After a conflict the tree is clean and local commits stay.
 * 5. An Area that refuses us stays on disk, unchanged. 6. No network changes no local file.
 * 7. A repo in the middle of a merge or rebase is never auto-committed.
 */
export type SyncState =
  | "synced"
  | "pushed"
  | "pulled"
  | "conflict"
  | "merging"
  | "locked"
  | "offline"
  | "error";

export interface SyncResult {
  readonly state: SyncState;
  readonly detail: string;
  /** Files that conflicted, when `state` is `conflict`. */
  readonly conflicts: ReadonlyArray<string>;
  /** Ref that holds the remote side after a conflict, such as `refs/leonidas/remote-1760000000`. */
  readonly savedRef: string | null;
  /** True when local changes were saved as a commit. */
  readonly committed: boolean;
}

export interface SyncInput {
  readonly dir: string;
  readonly git: Git;
  readonly now?: () => number;
}

const result = (state: SyncState, detail = "", extra: Partial<SyncResult> = {}): SyncResult => ({
  state,
  detail,
  conflicts: [],
  savedRef: null,
  committed: false,
  ...extra,
});

const REJECTED = /rejected|non-fast-forward|fetch first|failed to push some refs/i;

async function gitPath(git: Git, dir: string, name: string): Promise<string | null> {
  const run = await git(["rev-parse", "--git-path", name], dir);
  return run.code === 0 ? NodePath.resolve(dir, run.out) : null;
}

/** True while a merge or rebase is open in the repo. */
export async function isMidMerge(git: Git, dir: string): Promise<boolean> {
  for (const name of ["MERGE_HEAD", "rebase-merge", "rebase-apply", "CHERRY_PICK_HEAD"]) {
    const path = await gitPath(git, dir, name);
    if (path !== null && NodeFS.existsSync(path)) return true;
  }
  return false;
}

async function counts(git: Git, dir: string, branch: string) {
  const run = await git(["rev-list", "--left-right", "--count", `HEAD...origin/${branch}`], dir);
  if (run.code !== 0) return null; // the remote branch does not exist yet
  const [ahead, behind] = run.out.split(/\s+/).map(Number);
  return { ahead: ahead ?? 0, behind: behind ?? 0 };
}

async function rebaseOntoRemote(input: SyncInput, branch: string): Promise<SyncResult | "ok"> {
  const { git, dir } = input;
  const run = await git(["rebase", `origin/${branch}`], dir);
  if (run.code === 0) return "ok";
  const files = await git(["diff", "--name-only", "--diff-filter=U"], dir);
  const conflicts = files.out ? files.out.split(/\r?\n/).filter(Boolean) : [];
  await git(["rebase", "--abort"], dir);
  if (conflicts.length === 0) return result("error", run.out.slice(-200));
  const ref = `refs/leonidas/remote-${(input.now ?? Date.now)()}`;
  await git(["update-ref", ref, `origin/${branch}`], dir);
  return result("conflict", "Both sides changed the same lines. Both are kept.", {
    conflicts,
    savedRef: ref,
  });
}

/** One sync of one repo: save local work, fetch, rebase onto the remote, push. Never forces. */
export async function syncArea(input: SyncInput): Promise<SyncResult> {
  const { git, dir } = input;
  if (!NodeFS.existsSync(NodePath.join(dir, ".git"))) return result("error", "Not a git repo.");
  if (await isMidMerge(git, dir)) return result("merging", "A merge is open. Finish it first.");

  const head = await git(["symbolic-ref", "--short", "HEAD"], dir);
  if (head.code !== 0) return result("error", "The repo is on a detached HEAD.");
  const branch = head.out;

  let committed = false;
  const dirty = await git(["status", "--porcelain"], dir);
  if (dirty.out !== "") {
    const id = await identityArgs(git, dir);
    await git(["add", "-A"], dir);
    const commit = await git([...id, "commit", "-m", "sync: save local changes"], dir);
    if (commit.code !== 0) return result("error", commit.out.slice(-200));
    committed = true;
  }

  let pulled = false;
  for (let attempt = 0; attempt < 2; attempt++) {
    const fetch = await git(["fetch", "origin"], dir);
    if (fetch.code !== 0) {
      const kind = classifyFailure(fetch.out);
      return result(kind, fetch.out.slice(-200), { committed });
    }
    const pos = await counts(git, dir, branch);
    if (pos !== null && pos.behind > 0) {
      const rebased = await rebaseOntoRemote(input, branch);
      if (rebased !== "ok") return { ...rebased, committed };
      pulled = true;
    }
    const after = await counts(git, dir, branch);
    if (after !== null && after.ahead === 0) {
      return result(committed ? "pushed" : pulled ? "pulled" : "synced", "", { committed });
    }
    const push = await git(["push", "origin", `HEAD:refs/heads/${branch}`], dir);
    if (push.code === 0) return result("pushed", "", { committed });
    if (!REJECTED.test(push.out)) {
      const kind = classifyFailure(push.out);
      return result(kind === "error" ? "error" : kind, push.out.slice(-200), { committed });
    }
  }
  return result("error", "The remote kept changing. Try again.", { committed });
}

export interface AreaStatus {
  readonly slug: string;
  readonly branch: string | null;
  readonly ahead: number | null;
  readonly behind: number | null;
  readonly dirty: boolean;
  readonly merging: boolean;
}

/** Status of Home and every cloned Area. No network: ahead and behind come from the last fetch. */
export async function statusAll(input: {
  root: string;
  git: Git;
}): Promise<ReadonlyArray<AreaStatus>> {
  const { root, git } = input;
  const dirs: Array<[string, string]> = [["home", root]];
  for (const slug of [...areasOnDisk(root)].toSorted()) {
    dirs.push([slug, NodePath.join(root, AREAS_DIR, slug)]);
  }
  const out: AreaStatus[] = [];
  for (const [slug, dir] of dirs) {
    const head = await git(["symbolic-ref", "--short", "HEAD"], dir);
    const branch = head.code === 0 ? head.out : null;
    const pos = branch === null ? null : await counts(git, dir, branch);
    const dirty = (await git(["status", "--porcelain"], dir)).out !== "";
    out.push({
      slug,
      branch,
      ahead: pos?.ahead ?? null,
      behind: pos?.behind ?? null,
      dirty,
      merging: await isMidMerge(git, dir),
    });
  }
  return out;
}

export interface WorkspaceSync {
  readonly joined: ReadonlyArray<JoinResult>;
  readonly areas: ReadonlyArray<{ readonly slug: string; readonly result: SyncResult }>;
}

/**
 * Opens a workspace: sync Home, join any new Areas, then sync each Area on disk.
 * Home goes first, so a new Area added by an Owner is found in the same run.
 */
export async function syncWorkspace(input: {
  root: string;
  git: Git;
  now?: () => number;
}): Promise<WorkspaceSync> {
  const { root, git } = input;
  const areas: Array<{ slug: string; result: SyncResult }> = [];
  const clock = input.now ? { now: input.now } : {};
  areas.push({ slug: "home", result: await syncArea({ dir: root, git, ...clock }) });
  const { results } = await joinWorkspace({ root, git });
  for (const slug of [...areasOnDisk(root)].toSorted()) {
    const dir = NodePath.join(root, AREAS_DIR, slug);
    areas.push({ slug, result: await syncArea({ dir, git, ...clock }) });
  }
  return { joined: results, areas };
}
