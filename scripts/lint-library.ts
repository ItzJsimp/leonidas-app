// @effect-diagnostics nodeBuiltinImport:off globalConsole:off - CLI script reads files synchronously and prints plain lines.
// Checks the curated library in .agents/library.json: every item has an allowed
// license that matches its SKILL.md, and every upstream item ships its LICENSE
// file and a credit line.
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
