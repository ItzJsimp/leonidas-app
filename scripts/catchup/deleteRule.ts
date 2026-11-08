// The delete rule for files that T3 Code deleted and Leonidas edited (mechanics ticket, 2026-11-08):
// take the deletion for tests; leave source files for a person to decide after reading the Leonidas diff.
import { git } from "./plan.ts";

const TEST_FILE = /(\.(test|spec)\.[cm]?[jt]sx?$)|(\/__tests__\/)|(\.browser\.[jt]sx?$)/;

export function isTestFile(path: string): boolean {
  return TEST_FILE.test(path);
}

/** Paths that are `deleted by them, modified by us` in the index of a merge in progress. */
export function deletedByThem(cwd: string): string[] {
  const out = git(["status", "--porcelain=v1", "-z"], cwd);
  const paths: string[] = [];
  for (const entry of out.split("\0")) {
    if (entry.startsWith("UD ")) paths.push(entry.slice(3));
  }
  return paths;
}

export interface DeleteRuleResult {
  removed: string[];
  /** Source files T3 Code deleted: read `git diff <base> <ours> -- <file>` and apply the four keep tests. */
  needDecision: string[];
}

export function applyDeleteRule(cwd: string, dryRun = false): DeleteRuleResult {
  const removed: string[] = [];
  const needDecision: string[] = [];
  for (const path of deletedByThem(cwd)) {
    if (isTestFile(path)) {
      if (!dryRun) git(["rm", "-q", "--", path], cwd);
      removed.push(path);
    } else {
      needDecision.push(path);
    }
  }
  return { removed, needDecision };
}
