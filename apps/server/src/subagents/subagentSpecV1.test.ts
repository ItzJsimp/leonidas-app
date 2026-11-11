// @effect-diagnostics nodeBuiltinImport:off
import * as NodeFs from "node:fs";
import * as NodeOs from "node:os";
import * as NodePath from "node:path";

import { afterEach, describe, expect, it } from "@effect/vitest";

import { updateSubagentSpec } from "./subagentEdit.ts";
import { loadSubagentPersona, parseSubagentSpec, resolveSubagentSpec } from "./subagentPersona.ts";

const roots: string[] = [];

function makeRoot(): string {
  const root = NodeFs.mkdtempSync(NodePath.join(NodeOs.tmpdir(), "subagent-v1-"));
  roots.push(root);
  return root;
}

function writeSpec(root: string, name: string, lines: ReadonlyArray<string>): void {
  const directory = NodePath.join(root, ".agents", "subagents");
  NodeFs.mkdirSync(directory, { recursive: true });
  NodeFs.writeFileSync(NodePath.join(directory, `${name}.md`), lines.join("\n"));
}

const designer = (...extra: ReadonlyArray<string>) => [
  "---",
  "name: frontend-designer",
  "model: claude-opus-5-5",
  "tools: [Read, Edit, mcp__leonidas__leo_preview_open]",
  ...extra,
  "---",
  "You design front-end UI.",
];

afterEach(() => {
  for (const root of roots.splice(0)) NodeFs.rmSync(root, { recursive: true, force: true });
});

describe("format v1", () => {
  it("reads account, the slice 1 provider key, tier, enabled and never", () => {
    const spec = parseSubagentSpec(
      designer("provider: claudeWork", "tier: confirm", "enabled: false", "never: [Commit.]").join(
        "\n",
      ),
      "frontend-designer",
    );
    expect(spec).toMatchObject({
      account: "claudeWork",
      tier: "confirm",
      enabled: false,
      never: ["Commit."],
    });
    expect(
      parseSubagentSpec(designer("account: balanced").join("\n"), "frontend-designer").account,
    ).toBeNull();
  });

  it("rejects unknown fields and a tier that would lower the map", () => {
    expect(() =>
      parseSubagentSpec(designer("claude_model: haiku").join("\n"), "frontend-designer"),
    ).toThrow(/Unknown field "claude_model"/);
    expect(() => parseSubagentSpec(designer("tier: free").join("\n"), "frontend-designer")).toThrow(
      /tier: free/,
    );
  });

  it("accepts the AIOS scope tag and ignores it", () => {
    const spec = parseSubagentSpec(designer("scope: structural").join("\n"), "frontend-designer");
    expect(spec.name).toBe("frontend-designer");
  });

  it("refuses to start a subagent that is off", () => {
    const root = makeRoot();
    writeSpec(root, "frontend-designer", designer("enabled: false"));
    expect(() => loadSubagentPersona(root, "frontend-designer")).toThrow(/is off/);
  });
});

describe("extends", () => {
  const projectOf = (root: string) => NodePath.join(root, "projects", "game");

  it("merges a Project Subagent over its AIOS base", () => {
    const root = makeRoot();
    const project = projectOf(root);
    NodeFs.writeFileSync(NodePath.join(root, "DESIGN.md"), "AIOS tokens.");
    writeSpec(root, "frontend-designer", designer("context: [DESIGN.md]", "never: [Commit.]"));
    NodeFs.mkdirSync(project, { recursive: true });
    NodeFs.writeFileSync(NodePath.join(project, "GAME.md"), "Roblox rules.");
    writeSpec(project, "roblox-ui-designer", [
      "---",
      "name: roblox-ui-designer",
      "extends: frontend-designer",
      "context: [GAME.md]",
      "never: [Use web fonts.]",
      "---",
      "You design Roblox UI.",
    ]);

    const persona = loadSubagentPersona(project, "roblox-ui-designer");

    expect(persona.spec).toMatchObject({
      name: "roblox-ui-designer",
      model: "claude-opus-5-5",
      tools: ["Read", "Edit", "mcp__leonidas__leo_preview_open"],
      never: ["Commit.", "Use web fonts."],
    });
    expect(persona.spec.context.map((entry) => entry.path)).toEqual(["DESIGN.md", "GAME.md"]);
    expect(persona.systemPrompt).toBe(
      [
        "You design front-end UI.\n\nYou design Roblox UI.",
        "Never:\n- Commit.\n- Use web fonts.",
        '<context file="DESIGN.md">\nAIOS tokens.\n</context>',
        '<context file="GAME.md">\nRoblox rules.\n</context>',
      ].join("\n\n"),
    );
  });

  it("lets a same-name project copy extend the AIOS one", () => {
    const root = makeRoot();
    writeSpec(root, "frontend-designer", designer());
    writeSpec(projectOf(root), "frontend-designer", [
      "---",
      "name: frontend-designer",
      "extends: frontend-designer",
      "model: claude-sonnet-5-5",
      "---",
    ]);
    const spec = resolveSubagentSpec(
      NodePath.join(projectOf(root), ".agents", "subagents", "frontend-designer.md"),
    );
    expect(spec.model).toBe("claude-sonnet-5-5");
    expect(spec.body).toBe("You design front-end UI.");
    expect(spec.chain).toHaveLength(2);
  });

  it("fails on a missing base", () => {
    const root = makeRoot();
    writeSpec(root, "child", ["---", "name: child", "extends: nobody", "---"]);
    expect(() => loadSubagentPersona(root, "child")).toThrow(/extends "nobody"/);
  });
});

describe("starter pack", () => {
  const startersDir = NodePath.resolve(
    import.meta.dirname,
    "../../../../packages/shared/src/subagentStarters",
  );

  it("ships 7 starters that parse and resolve: 5 on, 2 off", () => {
    const root = makeRoot();
    const directory = NodePath.join(root, ".agents", "subagents");
    NodeFs.mkdirSync(directory, { recursive: true });
    const files = NodeFs.readdirSync(startersDir).filter((file) => file.endsWith(".md"));
    for (const file of files) {
      NodeFs.copyFileSync(NodePath.join(startersDir, file), NodePath.join(directory, file));
    }

    const specs = files.map((file) => resolveSubagentSpec(NodePath.join(directory, file)));

    expect(specs).toHaveLength(7);
    expect(
      specs
        .filter((spec) => spec.enabled)
        .map((spec) => spec.name)
        .toSorted(),
    ).toEqual(["explorer", "frontend-designer", "researcher", "reviewer", "verifier"]);
    for (const spec of specs) {
      expect(spec.description).not.toBeNull();
      expect(spec.model).not.toBeNull();
      expect(spec.tools.length).toBeGreaterThan(0);
      if (spec.enabled) {
        expect(loadSubagentPersona(root, spec.name).systemPrompt.length).toBeGreaterThan(200);
      }
    }
  });
});

describe("agents tab keys", () => {
  it("decision 1: reads avatar, effort, skills, canSpawn and maxTurns, and keeps memory and triggers on write", () => {
    const root = makeRoot();
    writeSpec(
      root,
      "frontend-designer",
      designer(
        "avatar: felt/frontend-designer",
        "effort: high",
        "skills: [design-build]",
        "canSpawn: true",
        "maxTurns: 12",
        "memory: notes",
        "triggers: []",
      ),
    );
    const specPath = NodePath.join(root, ".agents", "subagents", "frontend-designer.md");

    const spec = resolveSubagentSpec(specPath);

    expect(spec).toMatchObject({
      avatar: "felt/frontend-designer",
      effort: "high",
      skills: ["design-build"],
      canSpawn: true,
      maxTurns: 12,
    });
    expect(spec.context.map((entry) => entry.path)).toEqual([
      ".agents/skills/design-build/SKILL.md",
    ]);

    updateSubagentSpec(specPath, { description: "Designs UI." });
    const written = NodeFs.readFileSync(specPath, "utf8");
    expect(written).toContain("memory: notes");
    expect(written).toContain("triggers: []");
  });

  it("decision 1: canSpawn defaults to false and is never inherited", () => {
    const root = makeRoot();
    const project = NodePath.join(root, "projects", "game");
    NodeFs.mkdirSync(project, { recursive: true });
    writeSpec(root, "lead", ["---", "name: lead", "canSpawn: true", "---", "Lead."]);
    writeSpec(project, "worker", ["---", "name: worker", "extends: lead", "---"]);

    expect(
      resolveSubagentSpec(NodePath.join(project, ".agents", "subagents", "worker.md")).canSpawn,
    ).toBe(false);
  });

  it("decision 1: rejects a bad maxTurns, canSpawn and skill name", () => {
    expect(() =>
      parseSubagentSpec(designer("maxTurns: 0").join("\n"), "frontend-designer"),
    ).toThrow(/maxTurns/);
    expect(() =>
      parseSubagentSpec(designer("canSpawn: yes please").join("\n"), "frontend-designer"),
    ).toThrow(/canSpawn/);
    expect(() =>
      parseSubagentSpec(designer("skills: [../x]").join("\n"), "frontend-designer"),
    ).toThrow(/valid skill name/);
  });
});
