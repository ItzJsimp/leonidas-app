// @effect-diagnostics nodeBuiltinImport:off globalConsole:off - CI version planning runs before dependency installation, with Node built-ins only.
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeURL from "node:url";
import { loadReleasePost } from "./release-post.ts";

export type ReleaseKind = "patch" | "minor" | "major" | "launch";
export interface ReleaseCommit {
  subject: string;
  body: string;
  /** Git author name of the commit, when known. */
  author?: string;
}

/** Features advance minor; breaking changes advance major only after public launch. */
export function classifyRelease(commits: ReadonlyArray<ReleaseCommit>): ReleaseKind {
  if (
    commits.some(
      ({ subject, body }) =>
        /^[a-z]+(?:\([^)]*\))?!:/.test(subject) || /^BREAKING CHANGE:/m.test(body),
    )
  )
    return "major";
  if (
    commits.some(({ subject }) => /^feat(?:\([^)]*\))?:/i.test(subject) || /^Build:/i.test(subject))
  )
    return "minor";
  return "patch";
}

export function nextReleaseVersion(
  previous: string,
  kind: ReleaseKind,
  development: boolean,
): string {
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(previous))
    throw new Error("Expected a plain major.minor.patch version");
  const [major, minor, patch] = previous.split(".").map(Number) as [number, number, number];
  if (kind === "launch") {
    if (!development || major !== 0)
      throw new Error("Public launch must follow a 0.x development release");
    return "1.0.0";
  }
  if (development && major !== 0) throw new Error("Development releases must stay below 1.0.0");
  if (kind === "major") return development ? `0.${minor + 1}.0` : `${major + 1}.0.0`;
  if (kind === "minor") return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

/** Git author names shown to users; unknown names pass through unchanged. */
export const AUTHOR_ALIASES: Readonly<Record<string, string>> = {
  ItzJsimp: "Jake",
  "Seth Moncada": "Mob",
};

/** Highlights are the bullets a user reads in the update dialog; the rest go under Details. */
export const MAX_HIGHLIGHTS = 5;

export interface ReleaseMeta {
  /** Full sha of the release commit. */
  commit: string;
  authors: string[];
  coAuthors: string[];
  /** Commits per author in this release, for the "who built it" share in the update dialog. */
  authorCommits?: Record<string, number>;
}

function aliasName(name: string): string {
  return AUTHOR_ALIASES[name] ?? name;
}

function distinct(names: ReadonlyArray<string>): string[] {
  return [...new Set(names.filter(Boolean))];
}

/** `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` becomes "Claude". */
export function coAuthorNames(body: string): string[] {
  return [...body.matchAll(/^Co-Authored-By:\s*(.+?)\s*$/gim)].map((match) => {
    const raw = match[1]!;
    const name = raw.replace(/\s*<[^>]*>\s*$/, "").trim();
    return /claude|anthropic/i.test(raw) ? "Claude" : aliasName(name);
  });
}

/** Metadata comment the update dialog parses; `<` and `>` are escaped so a name cannot end the comment. */
export function releaseMetaComment(meta: ReleaseMeta): string {
  const json = JSON.stringify({
    commit: meta.commit,
    authors: meta.authors,
    coAuthors: meta.coAuthors,
    ...(meta.authorCommits ? { authorCommits: meta.authorCommits } : {}),
  })
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e");
  return `<!-- leonidas-release ${json} -->`;
}

/**
 * Highlights (max 5) come only from curated `Release-Note:` trailers.
 * Overflow plus `Release-Detail:` trailers go under `## Details`.
 * The last line is a machine-readable metadata comment.
 */
export function releaseNotes(
  commits: ReadonlyArray<ReleaseCommit>,
  version: string,
  development: boolean,
  commit = "",
  post = "",
): string {
  const rank = (subject: string) =>
    /^feat(?:\(|:)/i.test(subject) || /^Build:/i.test(subject)
      ? 0
      : /^fix(?:\(|:)/i.test(subject)
        ? 1
        : 2;
  const trailerValues = (body: string, key: string) =>
    [...body.matchAll(new RegExp(`^${key}:\\s*(.+)$`, "gim"))].map((match) => match[1]!.trim());
  const trailers: Array<{ rank: number; text: string }> = [];
  const details: string[] = [];
  for (const { subject, body } of commits) {
    const notes = trailerValues(body, "Release-Note");
    details.push(...trailerValues(body, "Release-Detail"));
    for (const text of notes) trailers.push({ rank: rank(subject), text });
  }
  const seen = new Set<string>();
  const ordered = trailers
    .toSorted((a, b) => a.rank - b.rank)
    .map(({ text }) => text)
    .filter((text) => {
      const key = text.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  const highlights = ordered.slice(0, MAX_HIGHLIGHTS);
  const shown = new Set(highlights.map((text) => text.toLowerCase()));
  const extra = [...ordered.slice(MAX_HIGHLIGHTS), ...details].filter((text) => {
    const key = text.toLowerCase();
    if (shown.has(key)) return false;
    shown.add(key);
    return true;
  });
  const authors = distinct(commits.map(({ author }) => (author ? aliasName(author.trim()) : "")));
  const coAuthors = distinct(commits.flatMap(({ body }) => coAuthorNames(body))).filter(
    (name) => !authors.includes(name),
  );
  const authorCommits: Record<string, number> = {};
  for (const { author } of commits) {
    const name = author ? aliasName(author.trim()) : "";
    if (name) authorCommits[name] = (authorCommits[name] ?? 0) + 1;
  }
  const bullets = (items: ReadonlyArray<string>) => items.map((item) => `- ${item}`).join("\n");
  const editorialNotes = (
    [
      [0, "New"],
      [1, "Fixes"],
      [2, "Improvements"],
    ] as const
  )
    .map(([group, title]) => {
      const groupItems = ordered.filter(
        (text) => trailers.find((note) => note.text === text)?.rank === group,
      );
      return groupItems.length ? `### ${title}\n${bullets(groupItems)}\n` : "";
    })
    .filter(Boolean)
    .join("\n");
  const postDetails = details.filter((text) => {
    const key = text.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return (
    (post
      ? `${post.trim()}\n\n## Patch notes\n\n${editorialNotes || "No patch notes were provided for this update.\n"}`
      : `# ${version}${development ? " · Development" : ""}\n\n${bullets(highlights.length ? highlights : [extra.length ? "Additional changes are listed below." : "No patch notes were provided for this update."])}\n`) +
    ((post ? postDetails : extra).length
      ? `\n## Details\n${bullets(post ? postDetails : extra)}\n`
      : "") +
    `\n${releaseMetaComment({ commit, authors, coAuthors, authorCommits })}\n`
  );
}

function run(command: string, args: string[]): string {
  return NodeChildProcess.execFileSync(command, args, { encoding: "utf8" }).trim();
}

function main() {
  const repo = process.env.GITHUB_REPOSITORY;
  if (!repo) throw new Error("GITHUB_REPOSITORY is required");
  const config = JSON.parse(NodeFS.readFileSync("leonidas-release.json", "utf8")) as {
    stage: string;
    initialVersion: string;
  };
  if (!["development", "public"].includes(config.stage)) throw new Error("Unknown release stage");
  const development = config.stage === "development";
  const releases = JSON.parse(run("gh", ["api", `repos/${repo}/releases?per_page=100`])) as Array<{
    tag_name: string;
    draft: boolean;
    prerelease: boolean;
  }>;
  // Legacy 1.0.x builds predate the development policy. Never use those as the 0.x baseline.
  const previous = releases.find(
    (release) =>
      !release.draft &&
      !release.prerelease &&
      /^v\d+\.\d+\.\d+$/.test(release.tag_name) &&
      (!development || release.tag_name.startsWith("v0.")),
  );
  // The first 0.x release still describes changes since the last legacy install.
  const notesBaseline =
    previous ??
    releases.find(
      (release) =>
        !release.draft && !release.prerelease && /^v\d+\.\d+\.\d+$/.test(release.tag_name),
    );
  let range = "-1";
  if (notesBaseline) {
    run("git", [
      "fetch",
      "--no-tags",
      "origin",
      `refs/tags/${notesBaseline.tag_name}:refs/tags/${notesBaseline.tag_name}`,
    ]);
    // Fetch only main's history, instead of every upstream branch.
    if (run("git", ["rev-parse", "--is-shallow-repository"]) === "true")
      run("git", ["fetch", "--no-tags", "--unshallow", "origin", "main"]);
    if (
      run("git", ["merge-base", notesBaseline.tag_name, "HEAD"]) !==
      run("git", ["rev-list", "-1", notesBaseline.tag_name])
    )
      throw new Error("Previous release is not an ancestor of this build");
    range = `${notesBaseline.tag_name}..HEAD`;
  }
  const raw = run("git", [
    "log",
    range,
    "--no-merges",
    "--reverse",
    "--format=%an%x1f%s%x1f%b%x1e",
  ]);
  const commits = raw
    .split("\x1e")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [author = "", subject = "", body = ""] = entry.split("\x1f");
      return { author, subject, body };
    });
  const override = process.env.RELEASE_KIND;
  if (override && !["auto", "patch", "minor", "major", "launch"].includes(override))
    throw new Error("Unknown release kind");
  const kind =
    override && override !== "auto" ? (override as ReleaseKind) : classifyRelease(commits);
  const version = nextReleaseVersion(
    previous?.tag_name.slice(1) ?? config.initialVersion,
    kind,
    development,
  );
  const sourceCommit = process.env.GITHUB_SHA ?? run("git", ["rev-parse", "HEAD"]);
  const postFile = commits
    .flatMap(({ body }) =>
      [...body.matchAll(/^Release-Post:\s*(.+)$/gim)].map((match) => match[1]!.trim()),
    )
    .at(-1);
  const post = postFile ? loadReleasePost(process.cwd(), postFile, repo, sourceCommit) : "";
  NodeFS.writeFileSync(
    "notes.md",
    releaseNotes(commits, version, development && kind !== "launch", sourceCommit, post),
  );
  if (process.env.GITHUB_OUTPUT)
    NodeFS.appendFileSync(
      process.env.GITHUB_OUTPUT,
      `version=${version}\nprevious=${previous?.tag_name ?? ""}\n`,
    );
  console.log(
    `Release ${version} (${kind}); previous development release: ${previous?.tag_name ?? "none"}`,
  );
}

if (process.argv[1] && import.meta.url === NodeURL.pathToFileURL(process.argv[1]).href) main();
