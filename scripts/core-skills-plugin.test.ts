// @effect-diagnostics nodeBuiltinImport:off - tests use real files in temp folders.
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest";

import { MANIFEST_PATH } from "./lint-library.ts";
import {
  CORE_SKILLS_PLUGIN_NAME,
  coreSkillNames,
  stageCoreSkillsPlugin,
  writeCoreSkillsBundle,
} from "./core-skills-plugin.ts";

describe("core skills plugin", () => {
  let dir: string;
  beforeEach(() => {
    dir = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "core plugin "));
  });
  afterEach(() => NodeFS.rmSync(dir, { recursive: true, force: true }));

  const write = (name: string, body: string) => {
    const file = NodePath.join(dir, name);
    NodeFS.mkdirSync(NodePath.dirname(file), { recursive: true });
    NodeFS.writeFileSync(file, body);
  };
  const library = (items: Array<{ name: string; pack: string; kind?: string }>) =>
    write(MANIFEST_PATH, JSON.stringify({ items: items.map((i) => ({ kind: "skill", ...i })) }));

  it("ships exactly the core pack of this repo, each with a SKILL.md", () => {
    const repoRoot = NodePath.resolve(import.meta.dirname, "..");
    const out = NodePath.join(dir, "out");
    const names = stageCoreSkillsPlugin({ repoRoot, outDir: out, version: "1.2.3" });
    expect(names).toEqual(coreSkillNames(repoRoot));
    expect(names.length).toBeGreaterThan(30);
    for (const name of names) {
      expect(NodeFS.existsSync(NodePath.join(out, "skills", name, "SKILL.md"))).toBe(true);
    }
    expect(
      JSON.parse(NodeFS.readFileSync(NodePath.join(out, ".claude-plugin/plugin.json"), "utf8")),
    ).toMatchObject({
      name: CORE_SKILLS_PLUGIN_NAME,
      version: "1.2.3",
    });
  });

  it("copies only core skills and drops caches and a stale earlier stage", () => {
    library([
      { name: "tdd", pack: "core" },
      { name: "roast", pack: "extras" },
    ]);
    write(".agents/skills/tdd/SKILL.md", "---\nname: tdd\n---\n");
    write(".agents/skills/tdd/__pycache__/x.pyc", "x");
    write(".agents/skills/tdd/refs/a.md", "a");
    write(".agents/skills/roast/SKILL.md", "---\nname: roast\n---\n");
    write("out/skills/old/SKILL.md", "stale");
    stageCoreSkillsPlugin({ repoRoot: dir, outDir: NodePath.join(dir, "out"), version: "1.0.0" });
    expect(NodeFS.readdirSync(NodePath.join(dir, "out/skills"))).toEqual(["tdd"]);
    expect(NodeFS.existsSync(NodePath.join(dir, "out/skills/tdd/refs/a.md"))).toBe(true);
    expect(NodeFS.existsSync(NodePath.join(dir, "out/skills/tdd/__pycache__"))).toBe(false);
  });

  it("packs the plugin into one file that holds every staged file", () => {
    library([{ name: "tdd", pack: "core" }]);
    write(".agents/skills/tdd/SKILL.md", "---\nname: tdd\n---\n");
    write(".agents/skills/tdd/refs/a.md", "a");
    const outFile = NodePath.join(dir, "out", "core-skills-plugin.json");
    writeCoreSkillsBundle({ repoRoot: dir, outFile, version: "1.0.0" });
    const bundle = JSON.parse(NodeFS.readFileSync(outFile, "utf8")) as {
      id: string;
      files: Record<string, string>;
    };
    expect(bundle.id).toMatch(/^[0-9a-f]{16}$/);
    expect(Object.keys(bundle.files)).toEqual([
      ".claude-plugin/plugin.json",
      "skills/tdd/SKILL.md",
      "skills/tdd/refs/a.md",
    ]);
    expect(Buffer.from(bundle.files["skills/tdd/refs/a.md"]!, "base64").toString()).toBe("a");
    // The stage folder is temporary: only the bundle stays.
    expect(NodeFS.readdirSync(NodePath.join(dir, "out"))).toEqual(["core-skills-plugin.json"]);
  });

  it("fails when the core pack is empty or a core skill is missing", () => {
    library([{ name: "roast", pack: "extras" }]);
    expect(() =>
      stageCoreSkillsPlugin({ repoRoot: dir, outDir: NodePath.join(dir, "out"), version: "1" }),
    ).toThrow("no core skills");
    library([{ name: "tdd", pack: "core" }]);
    expect(() =>
      stageCoreSkillsPlugin({ repoRoot: dir, outDir: NodePath.join(dir, "out"), version: "1" }),
    ).toThrow("tdd has no SKILL.md");
  });
});
