// @effect-diagnostics nodeBuiltinImport:off - reads the upstream-review ledger file.
// @effect-diagnostics globalDate:off - the 7-day window is wall-clock time.
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

import type { CheckInput, CheckOutcome, Finding } from "./check.ts";

export const UPSTREAM_LEDGER = "project/upstream-review-ledger.json";
const WEEK_MS = 7 * 24 * 3_600_000;

/** Ledger keys are 10-character short SHAs of reviewed upstream commits. */
export function readLedger(repo: string): ReadonlySet<string> | null {
  try {
    const ledger = JSON.parse(NodeFS.readFileSync(NodePath.join(repo, UPSTREAM_LEDGER), "utf8"));
    return new Set(Object.keys(ledger as Record<string, unknown>).map((key) => key.slice(0, 10)));
  } catch {
    return null;
  }
}

/** Upstream T3 Code commits from the last 7 days that the upstream-review ledger has not seen. */
export async function upstreamDigest(input: CheckInput): Promise<CheckOutcome> {
  const repo = input.repoPath;
  if (repo === null) return { status: "skipped", summary: "No Leonidas Code checkout found." };
  const git = (args: ReadonlyArray<string>) =>
    input.exec("git", ["-C", repo, ...args], { cwd: repo, timeoutMs: 120_000 });

  const remotes = (await git(["remote"])).stdout.split(/\s+/);
  if (!remotes.includes("upstream")) {
    return {
      status: "skipped",
      summary:
        "No upstream remote. Add it: git remote add upstream https://github.com/pingdotgg/t3code.",
    };
  }
  const ledger = readLedger(repo);
  if (ledger === null) return { status: "skipped", summary: `No ledger at ${UPSTREAM_LEDGER}.` };
  if (!input.dryRun) await git(["fetch", "-q", "upstream", "main"]);

  const since = new Date(input.now - WEEK_MS).toISOString();
  const log = await git([
    "log",
    "upstream/main",
    `--since=${since}`,
    "--no-merges",
    "--format=%H%x09%s",
  ]);
  if (log.code !== 0) return { status: "skipped", summary: "Git could not read upstream/main." };

  const findings: Finding[] = log.stdout
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [sha = "", subject = ""] = line.split("\t");
      return { sha: sha.slice(0, 10), subject };
    })
    .filter((commit) => commit.sha.length === 10 && !ledger.has(commit.sha))
    .map((commit) => ({ key: commit.sha, text: `${commit.sha} ${commit.subject}` }));

  if (findings.length === 0) {
    return {
      status: "ok",
      summary: "Every upstream commit from the last 7 days is in the ledger.",
    };
  }
  return {
    status: "findings",
    level: "info",
    title: `Upstream digest: ${findings.length} new T3 Code ${findings.length === 1 ? "commit" : "commits"}`,
    summary: "Review them with the upstream-review skill.",
    findings,
  };
}
