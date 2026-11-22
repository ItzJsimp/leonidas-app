// @effect-diagnostics nodeBuiltinImport:off - build script reads and writes files synchronously.
// Stages the core skills (the `core` pack of .agents/library.json) as a local Claude plugin (ADR-0102).
// The desktop build ships the folder as one bundle file, resources/core-skills-plugin.json: the
// Windows payload check allows at most 80 files, and the folder alone has over 160. The desktop
// unpacks the bundle once and the server hands the folder to the Agent SDK `plugins` option.
import * as NodeCrypto from "node:crypto";
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

import { MANIFEST_PATH, type LibraryItem } from "./lint-library.ts";

// Claude names a plugin skill `<plugin>:<skill>`, so this is the prefix users see.
export const CORE_SKILLS_PLUGIN_NAME = "leonidas";
// Keep in sync with CORE_SKILLS_BUNDLE_FILE in apps/desktop/src/backend/coreSkillsBundle.ts.
export const CORE_SKILLS_BUNDLE_FILE = "core-skills-plugin.json";

/**
 * Stages the plugin, then packs every file into one JSON bundle: `{ id, files }`, where `files`
 * maps each POSIX relative path to base64 content and `id` is a content hash the desktop uses as
 * its unpack folder name. Returns the skill names.
 */
export function writeCoreSkillsBundle(input: {
  readonly repoRoot: string;
  readonly outFile: string;
  readonly version: string;
}): string[] {
  NodeFS.mkdirSync(NodePath.dirname(input.outFile), { recursive: true });
  const stageDir = NodeFS.mkdtempSync(`${input.outFile}.stage-`);
  try {
    const names = stageCoreSkillsPlugin({ ...input, outDir: stageDir });
    const files: Record<string, string> = {};
    const hash = NodeCrypto.createHash("sha256");
    const relativePaths = NodeFS.readdirSync(stageDir, { recursive: true, encoding: "utf8" })
      .map((entry) => entry.replaceAll("\\", "/"))
      .filter((entry) => NodeFS.statSync(NodePath.join(stageDir, entry)).isFile())
      .toSorted();
    for (const relativePath of relativePaths) {
      const content = NodeFS.readFileSync(NodePath.join(stageDir, relativePath));
      files[relativePath] = content.toString("base64");
      hash.update(`${relativePath}\0`).update(content);
    }
    const id = hash.digest("hex").slice(0, 16);
    NodeFS.writeFileSync(input.outFile, JSON.stringify({ id, files }));
    return names;
  } finally {
    NodeFS.rmSync(stageDir, { recursive: true, force: true });
  }
}

export function coreSkillNames(repoRoot: string): string[] {
  const manifest = JSON.parse(
    NodeFS.readFileSync(NodePath.join(repoRoot, MANIFEST_PATH), "utf8"),
  ) as {
    items: LibraryItem[];
  };
  return manifest.items
    .filter((item) => item.kind === "skill" && item.pack === "core")
    .map((item) => item.name);
}

/** Copies each core skill into `<outDir>/skills` and writes the plugin manifest. Returns the skill names. */
export function stageCoreSkillsPlugin(input: {
  readonly repoRoot: string;
  readonly outDir: string;
  readonly version: string;
}): string[] {
  const names = coreSkillNames(input.repoRoot);
  if (names.length === 0) throw new Error("The library has no core skills to ship.");
  for (const name of names) {
    if (!NodeFS.existsSync(NodePath.join(input.repoRoot, ".agents/skills", name, "SKILL.md"))) {
      throw new Error(`Core skill ${name} has no SKILL.md.`);
    }
  }
  NodeFS.rmSync(input.outDir, { recursive: true, force: true });
  for (const name of names) {
    NodeFS.cpSync(
      NodePath.join(input.repoRoot, ".agents/skills", name),
      NodePath.join(input.outDir, "skills", name),
      { recursive: true, filter: (source) => !/__pycache__|\.pyc$/.test(source) },
    );
  }
  NodeFS.mkdirSync(NodePath.join(input.outDir, ".claude-plugin"), { recursive: true });
  NodeFS.writeFileSync(
    NodePath.join(input.outDir, ".claude-plugin/plugin.json"),
    `${JSON.stringify(
      {
        name: CORE_SKILLS_PLUGIN_NAME,
        version: input.version,
        description: "The Leonidas core skills. Read-only: they update with each app release.",
      },
      null,
      2,
    )}\n`,
  );
  return names;
}
