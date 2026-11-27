// @effect-diagnostics nodeBuiltinImport:off globalConsole:off - CLI script reads files synchronously and prints plain lines.
// Checks the curated library in .agents/library.json: every item has an allowed
// license that matches its SKILL.md, every upstream item ships its LICENSE file
// and a credit line, and every core skill has no dead relative links outside the app repo.
//
//   node scripts/lint-library.ts
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

// Leonidas originals are MIT too (Jake, 2026-10-21).
const ALLOWED_LICENSES: ReadonlySet<string> = new Set(["MIT", "Apache-2.0"]);
const LEONIDAS_CREDIT = "Leonidas";
export const MANIFEST_PATH = ".agents/library.json";

export interface LibraryItem {
  readonly name: string;
  readonly kind: "skill" | "rule" | "script";
  readonly pack: string;
  readonly needs: readonly string[];
  readonly version: string;
  readonly license: string;
  readonly credit: string;
}

function frontmatterLicense(text: string): string | undefined {
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)?.[1] ?? "";
  return /^license:[ \t]*"?([^"\r\n]*?)"?[ \t]*$/m.exec(frontmatter)?.[1] || undefined;
}

function listMarkdownFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of NodeFS.readdirSync(dir, { withFileTypes: true }).toSorted((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    if (entry.name === "__pycache__") continue;
    const full = NodePath.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...listMarkdownFiles(full));
    else if (entry.isFile() && entry.name.endsWith(".md")) files.push(full);
  }
  return files;
}

// Matches a markdown link OR an inline code span so backtick-wrapped examples are skipped.
const LINK_OR_CODE = /(?<!!)\[([^\]\n]+)\]\(([^)\s]+)(?:\s+"[^"\n]*")?\)|(`+)[^`\n]*?\3/g;
const EXTERNAL_OR_ANCHOR = /^(?:[a-z][a-z0-9+.-]*:|#)/i;

function lintCoreLinks(repoRoot: string, skillDir: string, label: string): string[] {
  const problems: string[] = [];
  const rootResolved = NodePath.resolve(repoRoot);
  const rootPrefix = `${rootResolved}${NodePath.sep}`;
  for (const mdFile of listMarkdownFiles(skillDir)) {
    const lines = NodeFS.readFileSync(mdFile, "utf8").split(/\r?\n/);
    let inFence = false;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? "";
      if (/^[ \t]*```/.test(line)) {
        inFence = !inFence;
        continue;
      }
      if (inFence) continue;
      for (const match of line.matchAll(LINK_OR_CODE)) {
        const target = match[2];
        if (!target || EXTERNAL_OR_ANCHOR.test(target)) continue;
        const clean = target.split("#", 1)[0]?.split("?", 1)[0]?.replaceAll("%20", " ") ?? "";
        if (!clean) continue;
        const resolved = NodePath.resolve(NodePath.dirname(mdFile), clean);
        const insideRepo = resolved === rootResolved || resolved.startsWith(rootPrefix);
        if (!insideRepo || !NodeFS.existsSync(resolved)) {
          const relMd = NodePath.relative(repoRoot, mdFile).replaceAll("\\", "/");
          problems.push(`${label}: dead link "${target}" in ${relMd}:${i + 1}`);
        }
      }
    }
  }
  return problems;
}

/** Problems found in the library under `repoRoot`. An empty list means it passes. */
export function lintLibrary(repoRoot: string): string[] {
  const items = (
    JSON.parse(NodeFS.readFileSync(NodePath.join(repoRoot, MANIFEST_PATH), "utf8")) as {
      items: LibraryItem[];
    }
  ).items;
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const label = `${item.kind} ${item.name}`;
    if (seen.has(label)) problems.push(`${label}: listed twice`);
    seen.add(label);
    if (!ALLOWED_LICENSES.has(item.license)) {
      problems.push(`${label}: manifest license "${item.license}" is not MIT or Apache-2.0`);
    }
    if (!item.pack) problems.push(`${label}: pack missing`);
    if (!item.credit) problems.push(`${label}: credit missing`);
    if (item.kind !== "skill") continue;

    const dir = NodePath.join(repoRoot, ".agents/skills", item.name);
    const skillFile = NodePath.join(dir, "SKILL.md");
    if (!NodeFS.existsSync(skillFile)) {
      problems.push(`${label}: ${NodePath.relative(repoRoot, skillFile)} not found`);
      continue;
    }
    const text = NodeFS.readFileSync(skillFile, "utf8");
    const license = frontmatterLicense(text);
    if (!license) problems.push(`${label}: license missing in SKILL.md frontmatter`);
    else if (!ALLOWED_LICENSES.has(license)) {
      problems.push(`${label}: SKILL.md license "${license}" is not MIT or Apache-2.0`);
    } else if (license !== item.license) {
      problems.push(
        `${label}: SKILL.md license "${license}" differs from manifest "${item.license}"`,
      );
    }
    if (item.credit !== LEONIDAS_CREDIT) {
      if (!NodeFS.existsSync(NodePath.join(dir, "LICENSE"))) {
        problems.push(`${label}: upstream skill has no LICENSE file`);
      }
      if (!/^Credit: /m.test(text))
        problems.push(`${label}: upstream skill has no "Credit: " line`);
    }
    if (item.pack === "core") {
      problems.push(...lintCoreLinks(repoRoot, dir, label));
    }
  }
  return problems;
}

if (import.meta.main) {
  const problems = lintLibrary(NodePath.resolve(import.meta.dirname, ".."));
  for (const problem of problems) console.error(problem);
  console.log(
    problems.length === 0 ? "library lint: PASS" : `library lint: FAIL (${problems.length})`,
  );
  process.exitCode = problems.length === 0 ? 0 : 1;
}
