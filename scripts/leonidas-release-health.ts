// @effect-diagnostics nodeBuiltinImport:off globalFetch:off globalConsole:off - CI release-health check that runs before an Effect runtime exists, driving the `gh` CLI and verifying published installer assets over HTTPS, then printing the job summary.
import * as NodeChildProcess from "node:child_process";
import * as NodeCrypto from "node:crypto";
import * as NodeFS from "node:fs";
import * as NodeURL from "node:url";

type Step = { name: string; started_at: string | null; completed_at: string | null };
export function elapsedSeconds(start: string | null, end: string | null): number | null {
  if (!start || !end) return null;
  const elapsed = (Date.parse(end) - Date.parse(start)) / 1000;
  return Number.isFinite(elapsed) && elapsed >= 0 ? elapsed : null;
}

export function parseUpdateManifest(yaml: string) {
  const value = (key: string) => {
    const match = yaml.match(new RegExp(`^${key}: (.+)$`, "m"));
    if (!match?.[1]) throw new Error(`Manifest missing ${key}`);
    return match[1].trim();
  };
  const version = value("version"),
    path = value("path"),
    sha512 = value("sha512");
  if (
    !/^\d+\.\d+\.\d+$/.test(version) ||
    path !== `Leonidas-${version}-x64.exe` ||
    !/^[A-Za-z0-9+/]{86}==$/.test(sha512)
  )
    throw new Error("Invalid updater manifest");
  return { version, path, sha512 };
}

async function main() {
  const repository = process.env.GITHUB_REPOSITORY;
  const runId = process.env.GITHUB_RUN_ID;
  if (!repository || !runId) throw new Error("Release health needs a workflow run");
  const api = (path: string) =>
    JSON.parse(
      NodeChildProcess.execFileSync("gh", ["api", path], {
        encoding: "utf8",
        maxBuffer: 256 * 1024 * 1024,
      }),
    );
  const run = api(`repos/${repository}/actions/runs/${runId}`) as {
    created_at: string;
    html_url: string;
  };
  const jobs = api(`repos/${repository}/actions/runs/${runId}/jobs?per_page=100`) as {
    jobs: Array<{
      name: string;
      conclusion: string | null;
      started_at: string;
      completed_at: string | null;
      steps: Step[];
    }>;
  };
  const report = {
    run: run.html_url,
    version: process.env.RELEASE_VERSION ?? null,
    published: process.env.RELEASE_PUBLISHED === "true",
    publishSeconds: null as number | null,
    verified: false,
    problems: [] as string[],
    jobs: jobs.jobs
      .filter((job) => job.name !== "Verify delivery and timings")
      .map((job) => ({
        name: job.name,
        conclusion: job.conclusion,
        seconds: elapsedSeconds(job.started_at, job.completed_at),
        steps: job.steps.map((step) => ({
          name: step.name,
          seconds: elapsedSeconds(step.started_at, step.completed_at),
        })),
      })),
  };
  for (const job of report.jobs)
    if (job.conclusion === "failure" || job.conclusion === "timed_out")
      report.problems.push(`${job.name}: ${job.conclusion}`);
  try {
    if (report.published && report.version) {
      const release = api(`repos/${repository}/releases/tags/v${report.version}`) as {
        published_at: string;
        draft: boolean;
        assets: Array<{ name: string; size: number; browser_download_url: string }>;
      };
      report.publishSeconds = elapsedSeconds(run.created_at, release.published_at);
      if (release.draft) throw new Error("Release is still a draft");
      const asset = (name: string) => {
        const found = release.assets.find((item) => item.name === name);
        if (!found || found.size <= 0) throw new Error(`Missing release asset: ${name}`);
        return found;
      };
      const download = async (url: string) => {
        const response = await fetch(url, { signal: AbortSignal.timeout(180_000) });
        if (!response.ok) throw new Error(`Asset download failed: HTTP ${response.status}`);
        return response;
      };
      const manifest = parseUpdateManifest(
        await (await download(asset("latest.yml").browser_download_url)).text(),
      );
      if (manifest.version !== report.version)
        throw new Error("Manifest version differs from release");
      const installer = asset(manifest.path);
      const bytes = new Uint8Array(
        await (await download(installer.browser_download_url)).arrayBuffer(),
      );
      if (
        bytes.length !== installer.size ||
        NodeCrypto.createHash("sha512").update(bytes).digest("base64") !== manifest.sha512
      )
        throw new Error("Published installer checksum/size mismatch");
      await download(asset(`${manifest.path}.blockmap`).browser_download_url);
      const latest = api(`repos/${repository}/releases/latest`) as {
        tag_name: string;
        published_at: string;
      };
      if (
        latest.tag_name !== `v${report.version}` &&
        Date.parse(latest.published_at) <= Date.parse(release.published_at)
      )
        throw new Error("Updater latest release does not point to the published version");
      report.verified = true;
      if (report.publishSeconds !== null && report.publishSeconds > 600)
        report.problems.push(`Push-to-publication took ${report.publishSeconds}s (target <=600s)`);
    }
  } catch (error) {
    report.problems.push(error instanceof Error ? error.message : String(error));
  }
  NodeFS.writeFileSync("release-health.json", JSON.stringify(report, null, 2));
  const summary =
    `## Release delivery ${report.version ?? "build"}\n\n${report.published ? `Published in ${report.publishSeconds ?? "unknown"} seconds. Installer verified: ${report.verified}.` : "No release published (see job results; superseded runs are expected)."}\n\n` +
    report.jobs
      .map(
        (job) =>
          `- ${job.name}: ${job.seconds ?? "unknown"}s (${job.conclusion})\n` +
          job.steps
            .filter((step) => (step.seconds ?? 0) >= 10)
            .map((step) => `  - ${step.name}: ${step.seconds}s`)
            .join("\n"),
      )
      .join("\n") +
    `\n\n${report.problems.join("\n")}\n\n[Workflow](${run.html_url})\n`;
  if (process.env.GITHUB_STEP_SUMMARY)
    NodeFS.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
  if (report.problems.length) {
    NodeFS.writeFileSync("release-health-issue.md", summary);
    // One open tracking issue accumulates regressions rather than creating one per push.
    const title = "Release delivery needs attention";
    const issues = JSON.parse(
      NodeChildProcess.execFileSync(
        "gh",
        [
          "issue",
          "list",
          "-R",
          repository,
          "--state",
          "open",
          "--search",
          `${title} in:title`,
          "--json",
          "number,title",
        ],
        { encoding: "utf8" },
      ),
    ) as Array<{ number: number; title: string }>;
    const existing = issues.find((issue) => issue.title === title);
    NodeChildProcess.execFileSync(
      "gh",
      existing
        ? [
            "issue",
            "comment",
            String(existing.number),
            "-R",
            repository,
            "--body-file",
            "release-health-issue.md",
          ]
        : [
            "issue",
            "create",
            "-R",
            repository,
            "--title",
            title,
            "--body-file",
            "release-health-issue.md",
          ],
      { stdio: "inherit" },
    );
    process.exitCode = 1;
  }
  console.log(summary);
}

if (process.argv[1] && import.meta.url === NodeURL.pathToFileURL(process.argv[1]).href)
  await main();
