// @effect-diagnostics nodeBuiltinImport:off - build script reads and writes files synchronously.
// Stages the core skills (the `core` pack of .agents/library.json) as a local Claude plugin (ADR-0102).
// The desktop build ships the folder as resources/core-skills-plugin and the server hands it to the
// Agent SDK `plugins` option, so every Claude thread gets the core skills with no AIOS.
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

import { MANIFEST_PATH, type LibraryItem } from "./lint-library.ts";

// Claude names a plugin skill `<plugin>:<skill>`, so this is the prefix users see.
export const CORE_SKILLS_PLUGIN_NAME = "leonidas";
export const CORE_SKILLS_PLUGIN_DIRECTORY = "core-skills-plugin";

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
