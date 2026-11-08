// @effect-diagnostics nodeBuiltinImport:off
import * as NodeFs from "node:fs";
import * as NodeOs from "node:os";
import * as NodePath from "node:path";

import { afterEach, describe, expect, it } from "@effect/vitest";

import { loadSubagentPersona, parseSubagentSpec, SubagentPersonaError } from "./subagentPersona.ts";

const roots: string[] = [];

function makeRoot(): string {
  const root = NodeFs.mkdtempSync(NodePath.join(NodeOs.tmpdir(), "subagent-persona-"));
  roots.push(root);
  return root;
}

function writeSpec(root: string, name: string, source: string): void {
  const directory = NodePath.join(root, ".agents", "subagents");
  NodeFs.mkdirSync(directory, { recursive: true });
  NodeFs.writeFileSync(NodePath.join(directory, `${name}.md`), source);
}

const designer = [
  "---",
  "name: frontend-designer",
  "model: claude-opus-5-5",
  "tools: [Read, Edit, mcp__leonidas__leo_preview_open]",
  "context: [DESIGN.md]",
  "---",
  "You design front-end UI.",
].join("\n");

afterEach(() => {
  for (const root of roots.splice(0)) NodeFs.rmSync(root, { recursive: true, force: true });
});

describe("parseSubagentSpec", () => {
  it("reads model, tools, context and the persona body", () => {
    const spec = parseSubagentSpec(designer, "frontend-designer");
    expect(spec.model).toBe("claude-opus-5-5");
    expect(spec.tools).toEqual(["Read", "Edit", "mcp__leonidas__leo_preview_open"]);
    expect(spec.context).toEqual(["DESIGN.md"]);
    expect(spec.body).toBe("You design front-end UI.");
  });

  it("rejects a spec whose name does not match the file", () => {
    expect(() => parseSubagentSpec(designer, "reviewer")).toThrow(SubagentPersonaError);
  });
});

describe("loadSubagentPersona", () => {
  it("inlines Context List files after the persona body", () => {
    const root = makeRoot();
    NodeFs.writeFileSync(NodePath.join(root, "DESIGN.md"), "Use the dark tokens.");
    writeSpec(root, "frontend-designer", designer);
    const cwd = NodePath.join(root, "projects", "app");
    NodeFs.mkdirSync(cwd, { recursive: true });

    const persona = loadSubagentPersona(cwd, "frontend-designer");

    expect(persona.systemPrompt).toBe(
      'You design front-end UI.\n\n<context file="DESIGN.md">\nUse the dark tokens.\n</context>',
    );
  });

  it("prefers the nearest spec, so a project subagent shadows the AIOS one", () => {
    const root = makeRoot();
    NodeFs.writeFileSync(NodePath.join(root, "DESIGN.md"), "x");
    writeSpec(root, "frontend-designer", designer);
    const project = NodePath.join(root, "projects", "game");
    writeSpec(
      project,
      "frontend-designer",
      designer.replace("context: [DESIGN.md]", "context: []"),
    );

    const persona = loadSubagentPersona(project, "frontend-designer");

    expect(persona.specPath.startsWith(project)).toBe(true);
    expect(persona.systemPrompt).toBe("You design front-end UI.");
  });

  it("fails on a missing context file and on a path outside the root", () => {
    const root = makeRoot();
    writeSpec(root, "frontend-designer", designer);
    expect(() => loadSubagentPersona(root, "frontend-designer")).toThrow(/does not exist/);
    writeSpec(root, "frontend-designer", designer.replace("DESIGN.md", "../secret.md"));
    expect(() => loadSubagentPersona(root, "frontend-designer")).toThrow(/leaves/);
  });

  it("rejects names that could escape the subagents folder", () => {
    expect(() => loadSubagentPersona(makeRoot(), "../x")).toThrow(/not a valid/);
  });
});
