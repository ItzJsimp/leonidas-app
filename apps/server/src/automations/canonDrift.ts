// @effect-diagnostics nodeBuiltinImport:off - scans AIOS markdown files on disk.
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

import type { CheckInput, CheckOutcome, Finding } from "./check.ts";

/** Folders whose top-level markdown is canon. Skill files are added one folder deeper. */
const CANON_DIRS = ["", "modes", "standards", ".agents/rules"];
/** `memory/` holds thousands of dated notes; only the files every session loads are canon. */
const CANON_MEMORY = ["user.md", "soul.md", "core.md", "ai-stack.md", "daily-life.md"];
const SKILLS_DIR = ".agents/skills";
const LINK = /\]\(<?([^)\s>]+)>?(?:\s+"[^"]*")?\)/g;
const TICKED = /`([^`\s]+)`/g;
/** A backticked repo path: a known top folder, a file extension, and no wildcard or placeholder. */
const REPO_PATH =
  /^(?:scripts|\.agents|memory|modes|standards|wiki|decisions|workflows|tools)\/[\w./-]+\.[a-z0-9]{1,5}$/i;
const UNUSED_DAYS = 60;

function markdownIn(dir: string): string[] {
  try {
    return NodeFS.readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
      .map((entry) => NodePath.join(dir, entry.name));
  } catch {
    return [];
  }
}

export function canonFiles(root: string): string[] {
  const files = CANON_DIRS.flatMap((dir) => markdownIn(NodePath.join(root, dir)));
  for (const name of CANON_MEMORY) files.push(NodePath.join(root, "memory", name));
  for (const skill of skillNames(root))
    files.push(NodePath.join(root, SKILLS_DIR, skill, "SKILL.md"));
  return files.filter((file) => NodeFS.existsSync(file));
}

export function skillNames(root: string): string[] {
  try {
    return NodeFS.readdirSync(NodePath.join(root, SKILLS_DIR)).filter((name) =>
      NodeFS.existsSync(NodePath.join(root, SKILLS_DIR, name, "SKILL.md")),
    );
  } catch {
    return [];
  }
}

/** Removes fenced code, so example links inside code blocks do not count. */
const stripFences = (text: string) => text.replace(/```[\s\S]*?```/g, "");

const exists = (path: string, cache: Map<string, Promise<boolean>>) => {
  let hit = cache.get(path);
  if (hit === undefined) {
    hit = NodeFS.promises.access(path).then(
      () => true,
      () => false,
    );
    cache.set(path, hit);
  }
  return hit;
};

export async function brokenLinks(
  root: string,
  file: string,
  text: string,
  cache: Map<string, Promise<boolean>> = new Map(),
): Promise<Finding[]> {
  const findings: Finding[] = [];
  const relFile = NodePath.relative(root, file).replaceAll("\\", "/");
  const body = stripFences(text);
  for (const match of body.matchAll(LINK)) {
    const raw = match[1] ?? "";
    if (/^[a-z][a-z0-9+.-]*:/i.test(raw) || raw.startsWith("#") || raw.startsWith("/")) continue;
    let target = raw.replace(/[#?].*$/, "");
    if (!target) continue;
    try {
      target = decodeURIComponent(target);
    } catch {
      // A bad escape stays as written; the existence check then reports it.
    }
    if (!(await exists(NodePath.resolve(NodePath.dirname(file), target), cache))) {
      findings.push({ key: `link:${relFile}:${raw}`, text: `${relFile}: broken link ${raw}` });
    }
  }
  for (const match of body.matchAll(TICKED)) {
    const path = match[1] ?? "";
    if (!REPO_PATH.test(path) || path.includes("<")) continue;
    if (!(await exists(NodePath.join(root, path), cache))) {
      findings.push({ key: `path:${relFile}:${path}`, text: `${relFile}: stale path ${path}` });
    }
  }
  return findings;
}

/** Skill names that no event in the feed named as `$name` in the last 60 days. */
export function unusedSkills(root: string, skills: ReadonlyArray<string>, now: number): string[] {
  const used = new Set<string>();
  for (let back = 0; back < 3; back++) {
    // @effect-diagnostics-next-line globalDate:off
    const at = new Date(now);
    at.setDate(1);
    at.setMonth(at.getMonth() - back);
    const month = `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, "0")}`;
    let text = "";
    try {
      text = NodeFS.readFileSync(NodePath.join(root, "events", `${month}.jsonl`), "utf8");
    } catch {
      continue;
    }
    const cutoff = now - UNUSED_DAYS * 86_400_000;
    for (const line of text.split("\n")) {
      const ts = /"ts":"([^"]+)"/.exec(line)?.[1];
      if (!ts || Date.parse(ts) < cutoff) continue;
      for (const name of line.matchAll(/\$([a-z0-9][a-z0-9:-]*)/g)) used.add(name[1]!);
    }
  }
  return skills.filter((skill) => !used.has(skill));
}

/** Broken links and stale paths in canon and skills, plus a count of unused skills. */
export async function canonDrift(input: CheckInput): Promise<CheckOutcome> {
  const root = input.aiosRoot;
  const cache = new Map<string, Promise<boolean>>();
  // Async reads keep the server answering while about 400 files are scanned.
  const perFile = await Promise.all(
    canonFiles(root).map(async (file) =>
      brokenLinks(root, file, await NodeFS.promises.readFile(file, "utf8"), cache),
    ),
  );
  const findings = perFile.flat();
  const skills = skillNames(root);
  const unused = unusedSkills(root, skills, input.now);
  const usage = `${unused.length} of ${skills.length} skills had no use in ${UNUSED_DAYS} days.`;
  if (findings.length === 0)
    return { status: "ok", summary: `Links and paths are clean. ${usage}` };
  const links = findings.filter((finding) => finding.key.startsWith("link:")).length;
  return {
    status: "findings",
    level: "needs_you",
    title: `Canon drift: ${links} broken links, ${findings.length - links} stale paths`,
    summary: usage,
    findings,
  };
}
