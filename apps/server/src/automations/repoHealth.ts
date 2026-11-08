// @effect-diagnostics nodeBuiltinImport:off - reads lock and claim files next to the git folder.
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

import type { CheckInput, CheckOutcome, Finding } from "./check.ts";

const HOUR_MS = 3_600_000;

export interface RepoHealthLimits {
  readonly unpushedAgeMs: number;
  readonly lockAgeMs: number;
  readonly claimAgeMs: number;
  /** Local-only branches by design, such as the derived `dev` branch. */
  readonly ignoreBranches: ReadonlyArray<string>;
}

export const REPO_HEALTH_LIMITS: RepoHealthLimits = {
  unpushedAgeMs: 24 * HOUR_MS,
  lockAgeMs: 10 * 60_000,
  claimAgeMs: 24 * HOUR_MS,
  ignoreBranches: ["dev"],
};

interface Worktree {
  readonly path: string;
  readonly branch: string | null;
  readonly prunable: string | null;
}

export function parseWorktrees(porcelain: string): ReadonlyArray<Worktree> {
  const result: Worktree[] = [];
  for (const block of porcelain.replaceAll("\r", "").split("\n\n")) {
    const lines = block.split("\n").filter(Boolean);
    const path = lines.find((line) => line.startsWith("worktree "))?.slice(9);
    if (!path) continue;
    const branch = lines.find((line) => line.startsWith("branch "))?.slice(7) ?? null;
    const prunable = lines.find((line) => line.startsWith("prunable"));
    result.push({
      path,
      branch: branch?.replace(/^refs\/heads\//, "") ?? null,
      prunable: prunable === undefined ? null : prunable.slice(9) || "folder is gone",
    });
  }
  return result;
}

const ageText = (ms: number) =>
  ms >= 48 * HOUR_MS
    ? `${Math.floor(ms / (24 * HOUR_MS))} days`
    : `${Math.floor(ms / HOUR_MS)} hours`;

function mtime(file: string): number | null {
  try {
    return NodeFS.statSync(file).mtimeMs;
  } catch {
    return null;
  }
}

/** Worktrees, unpushed work and stuck locks in the Leonidas Code checkout. */
export async function repoHealth(
  input: CheckInput,
  limits: RepoHealthLimits = REPO_HEALTH_LIMITS,
): Promise<CheckOutcome> {
  const repo = input.repoPath;
  if (repo === null) return { status: "skipped", summary: "No Leonidas Code checkout found." };
  const git = (args: ReadonlyArray<string>) =>
    input.exec("git", ["-C", repo, ...args], { cwd: repo });

  const list = await git(["worktree", "list", "--porcelain"]);
  if (list.code !== 0) return { status: "skipped", summary: "Git could not list the worktrees." };
  const common = (
    await git(["rev-parse", "--path-format=absolute", "--git-common-dir"])
  ).stdout.trim();

  const findings: Finding[] = [];
  const seenBranches = new Set<string>();
  for (const worktree of parseWorktrees(list.stdout)) {
    if (worktree.prunable !== null || !NodeFS.existsSync(worktree.path)) {
      findings.push({
        key: `worktree:${worktree.path}`,
        text: `Worktree ${worktree.path} is stale (${worktree.prunable ?? "folder is gone"}). Run git worktree prune.`,
      });
      continue;
    }
    const branch = worktree.branch;
    if (branch === null || limits.ignoreBranches.includes(branch) || seenBranches.has(branch))
      continue;
    seenBranches.add(branch);
    const log = await git(["log", `refs/heads/${branch}`, "--not", "--remotes", "--format=%ct"]);
    const times = log.stdout
      .split("\n")
      .filter(Boolean)
      .map((line) => Number(line) * 1000);
    if (times.length === 0) continue;
    const age = input.now - Math.min(...times);
    if (age < limits.unpushedAgeMs) continue;
    findings.push({
      key: `unpushed:${branch}`,
      text: `${branch}: ${times.length} unpushed ${times.length === 1 ? "commit" : "commits"}, oldest ${ageText(age)}.`,
    });
  }

  if (common) {
    const locks = [NodePath.join(common, "index.lock")];
    const worktreesDir = NodePath.join(common, "worktrees");
    for (const name of NodeFS.existsSync(worktreesDir) ? NodeFS.readdirSync(worktreesDir) : []) {
      locks.push(NodePath.join(worktreesDir, name, "index.lock"));
    }
    for (const lock of locks) {
      const at = mtime(lock);
      if (at === null || input.now - at < limits.lockAgeMs) continue;
      findings.push({
        key: `lock:${lock}`,
        text: `Git lock ${lock} is ${ageText(input.now - at)} old. Delete it if no Git command runs.`,
      });
    }
    const claimsDir = NodePath.join(common, "leonidas-claims");
    for (const name of NodeFS.existsSync(claimsDir) ? NodeFS.readdirSync(claimsDir) : []) {
      if (!name.endsWith(".json")) continue;
      let claim: { owner?: unknown; claimedAt?: unknown } = {};
      try {
        claim = JSON.parse(NodeFS.readFileSync(NodePath.join(claimsDir, name), "utf8"));
      } catch {
        continue;
      }
      const at = typeof claim.claimedAt === "string" ? Date.parse(claim.claimedAt) : Number.NaN;
      if (!Number.isFinite(at) || input.now - at < limits.claimAgeMs) continue;
      const task = name.slice(0, -5);
      findings.push({
        key: `claim:${task}`,
        text: `Task claim ${task} (${String(claim.owner ?? "unknown")}) is ${ageText(input.now - at)} old.`,
      });
    }
  }

  if (findings.length === 0)
    return { status: "ok", summary: "Worktrees, branches and locks are clean." };
  return {
    status: "findings",
    level: "needs_you",
    title: `Repo health: ${findings.length} ${findings.length === 1 ? "problem" : "problems"}`,
    summary: "Leonidas Code checkout needs cleanup.",
    findings,
  };
}
