import type { CheckInput, CheckOutcome, Finding } from "./check.ts";

export const RELEASE_WORKFLOW = "team-release.yml";
/** The team-release step that boots the built server on a fresh home. */
export const BOOT_SMOKE_STEP = "Check the server boots and answers";

/** `owner/repo` from a GitHub remote URL, or null. */
export function githubRepo(remoteUrl: string): string | null {
  const match = /github\.com[:/]([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/.exec(remoteUrl.trim());
  return match ? `${match[1]}/${match[2]}` : null;
}

/** A step that never ran has an empty conclusion; only these mean the smoke itself failed. */
const SMOKE_FAILED = new Set(["failure", "timed_out", "cancelled"]);

interface Run {
  readonly databaseId: number;
  readonly conclusion: string;
  readonly url: string;
  readonly headSha: string;
}

interface Job {
  readonly steps?: ReadonlyArray<{ readonly name: string; readonly conclusion: string }>;
}

function parse<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

/** The last finished release run and its boot smoke step, read with `gh`. */
export async function releaseHealth(input: CheckInput): Promise<CheckOutcome> {
  const repo = input.repoPath;
  if (repo === null) return { status: "skipped", summary: "No Leonidas Code checkout found." };
  const remote = await input.exec("git", ["-C", repo, "remote", "get-url", "origin"], {
    cwd: repo,
  });
  const slug = githubRepo(remote.stdout);
  if (slug === null) return { status: "skipped", summary: "The origin remote is not on GitHub." };

  const gh = (args: ReadonlyArray<string>) => input.exec("gh", args, { cwd: repo });
  const list = await gh([
    "run",
    "list",
    "-R",
    slug,
    "--workflow",
    RELEASE_WORKFLOW,
    "--status",
    "completed",
    "--limit",
    "1",
    "--json",
    "databaseId,conclusion,url,headSha",
  ]);
  if (list.code !== 0) {
    return {
      status: "skipped",
      summary: "GitHub CLI is missing or not signed in (gh auth login).",
    };
  }
  const run = parse<ReadonlyArray<Run>>(list.stdout)?.[0];
  if (!run) return { status: "skipped", summary: "No finished release run yet." };

  const view = await gh(["run", "view", String(run.databaseId), "-R", slug, "--json", "jobs"]);
  const jobs = parse<{ jobs?: ReadonlyArray<Job> }>(view.stdout)?.jobs ?? [];
  const smoke = jobs
    .flatMap((job) => job.steps ?? [])
    .find((step) => step.name === BOOT_SMOKE_STEP);

  const findings: Finding[] = [];
  const sha = run.headSha.slice(0, 7);
  if (run.conclusion !== "success") {
    findings.push({
      key: `release:${run.databaseId}`,
      text: `Release run for ${sha} ended "${run.conclusion}": ${run.url}`,
    });
  }
  if (smoke !== undefined && SMOKE_FAILED.has(smoke.conclusion)) {
    findings.push({
      key: `smoke:${run.databaseId}`,
      text: `Boot smoke for ${sha} ended "${smoke.conclusion}".`,
    });
  }
  if (findings.length === 0) {
    return {
      status: "ok",
      summary: `Last release ${sha} passed${smoke?.conclusion === "success" ? ", boot smoke passed" : ""}.`,
    };
  }
  return {
    status: "findings",
    level: "failed",
    title: `Release health: release ${sha} did not pass`,
    summary: `The last release run did not pass. ${run.url}`,
    findings,
  };
}
