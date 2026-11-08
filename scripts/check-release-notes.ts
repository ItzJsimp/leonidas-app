// @effect-diagnostics nodeBuiltinImport:off globalConsole:off - Release checks run before dependency installation, with Node built-ins only.
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";
import {
  classifyRelease,
  readCommits,
  type ReleaseCommit,
  type ReleaseKind,
} from "./leonidas-release.ts";

export interface NotesCheck {
  ok: boolean;
  /** True when no commit in the range changes what a user sees. */
  internalOnly: boolean;
  reasons: string[];
}

// shortcut: the commit scope decides visibility; move to a Release-Internal trailer if scopes drift.
const INTERNAL_SCOPES = new Set([
  "ci",
  "docs",
  "test",
  "tests",
  "scripts",
  "dev",
  "deps",
  "build",
  "release",
  "tooling",
]);
const VERBS = /^(Added|Improved|Fixed|Changed|Removed)\b/;
const FILLER = /behind-the-scenes|reliability improvements?/i;
const PRODUCT_NAMES = /\b(macOS|iOS|iPadOS|iPhone|iPad)\b/g;
const JARGON = [
  /\b[\w-]+\.(?:ts|tsx|js|mjs|json|md|ya?ml|ps1|py|css)\b/i,
  /\b[a-z]+[A-Z]\w*\b/,
  /#\d+/,
  /\b(?:RPC|CI|IPC)\b/,
  /\b(?:contract|projection|provider-core|refactor|typecheck|schema)\b/i,
];

function isUserVisible(subject: string): boolean {
  if (/^Build:/i.test(subject)) return true;
  const match = /^(feat|fix)(?:\(([^)]*)\))?!?:/i.exec(subject);
  return !!match && !INTERNAL_SCOPES.has((match[2] ?? "").toLowerCase());
}

function trailers(body: string, key: string): string[] {
  return [...body.matchAll(new RegExp(`^${key}:\\s*(.+)$`, "gim"))].map((m) => m[1]!.trim());
}

/** Plain reasons why one Release-Note breaks the writing guide; empty when it passes. */
export function noteProblems(note: string): string[] {
  const problems: string[] = [];
  if (!VERBS.test(note)) problems.push("start with Added, Improved, Fixed, Changed or Removed");
  const words = note.split(/\s+/).filter(Boolean).length;
  if (words < 8 || words > 18) problems.push(`use 8 to 18 words (now ${words})`);
  const plain = note.replace(PRODUCT_NAMES, "");
  for (const pattern of JARGON) {
    const hit = pattern.exec(plain);
    if (hit) problems.push(`remove internal term "${hit[0]}"`);
  }
  if (FILLER.test(note)) problems.push("say what the user sees, not a general reliability claim");
  return problems;
}

function storyProblems(root: string, file: string): string[] {
  if (!/^release-posts\/[\w./-]+\.md$/.test(file) || file.split("/").includes("..")) {
    return ["Release-Post must name a Markdown file inside release-posts/"];
  }
  const path = NodePath.join(root, file);
  if (!NodeFS.existsSync(path)) return [`Release-Post file ${file} was not found`];
  const story = NodeFS.readFileSync(path, "utf8").trim();
  const problems: string[] = [];
  if (!/^# [^\n]+\n\n\S/.test(story)) problems.push("The story needs a title and an introduction");
  const images = [...story.matchAll(/!\[([^\]]*)\]\(([^\s)]+)\)/g)];
  if (images.length === 0) problems.push("The story needs at least 1 screenshot");
  for (const [, alt, source] of images) {
    if (!alt!.trim()) problems.push(`Screenshot ${source} needs alt text`);
    const image = NodePath.posix.normalize(
      NodePath.posix.join(NodePath.posix.dirname(file), source!),
    );
    if (source!.includes("://") || !image.startsWith("release-posts/")) {
      problems.push(`Screenshot ${source} must be a file inside release-posts/`);
    } else if (!/\.(webp|avif)$/i.test(image)) {
      problems.push(`Screenshot ${image} must be WebP or AVIF`);
    } else if (!NodeFS.existsSync(NodePath.join(root, image))) {
      problems.push(`Screenshot ${image} was not found`);
    } else if (NodeFS.statSync(NodePath.join(root, image)).size > 2_000_000) {
      problems.push(`Screenshot ${image} is larger than 2 MB`);
    }
  }
  if ((story.match(/^## /gm) ?? []).length < 2) {
    problems.push("The story needs 2 or more feature sections (## headings)");
  }
  return problems;
}

/** Decide whether a release range has notes good enough to publish. */
export function checkReleaseNotes(input: {
  commits: ReadonlyArray<ReleaseCommit>;
  kind: ReleaseKind;
  root: string;
}): NotesCheck {
  const reasons: string[] = [];
  const internalOnly = !input.commits.some(({ subject }) => isUserVisible(subject));
  const notes = input.commits
    .flatMap(({ body }) => trailers(body, "Release-Note"))
    .filter((note) => note.toLowerCase() !== "none");
  if (!internalOnly && notes.length === 0) {
    reasons.push("User-visible feat or fix commits have no Release-Note trailer");
  }
  for (const note of notes) {
    const problems = noteProblems(note);
    if (problems.length) reasons.push(`Release-Note "${note}": ${problems.join("; ")}`);
  }
  if (input.kind === "minor" || input.kind === "launch") {
    const post = input.commits.flatMap(({ body }) => trailers(body, "Release-Post")).at(-1);
    if (post) reasons.push(...storyProblems(input.root, post));
    else reasons.push("A MINOR release needs a Release-Post story in release-posts/");
  }
  return { ok: reasons.length === 0, internalOnly, reasons };
}

function main() {
  // `auto` picks the kind the release script would pick, so the queue and the publisher agree.
  const [range = "-1", kind = "auto"] = process.argv.slice(2);
  if (!["auto", "patch", "minor", "major", "launch"].includes(kind))
    throw new Error("Unknown release kind");
  const commits = readCommits(range);
  const result = checkReleaseNotes({
    commits,
    kind: kind === "auto" ? classifyRelease(commits) : (kind as ReleaseKind),
    root: process.cwd(),
  });
  if (result.ok) {
    console.log(result.internalOnly ? "PASS: internal changes only, no notes needed" : "PASS");
    return;
  }
  console.log(
    `FAIL: release notes for ${range}\n${result.reasons.map((r) => `- ${r}`).join("\n")}\n` +
      "Fix: add a plain `Release-Note: <Added|Improved|Fixed|Changed|Removed> ...` trailer to each user-visible commit (see .agents/skills/leonidas-release/SKILL.md), or `Release-Note: none` for internal work.",
  );
  process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === NodeURL.pathToFileURL(process.argv[1]).href) main();
