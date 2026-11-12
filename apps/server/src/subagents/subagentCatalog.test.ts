// @effect-diagnostics nodeBuiltinImport:off
import * as NodeFs from "node:fs";
import * as NodeOs from "node:os";
import * as NodePath from "node:path";

import { afterEach, describe, expect, it } from "@effect/vitest";
import { DEFAULT_SUBAGENT_FREE_TIER_MODELS } from "@t3tools/contracts";

import { listSubagents, subagentSources } from "./subagentCatalog.ts";

const roots: string[] = [];

function makeRoot(): string {
  const root = NodeFs.mkdtempSync(NodePath.join(NodeOs.tmpdir(), "subagent-catalog-"));
  roots.push(root);
  return root;
}

function writeSpec(root: string, name: string, lines: ReadonlyArray<string>): void {
  const directory = NodePath.join(root, ".agents", "subagents");
  NodeFs.mkdirSync(directory, { recursive: true });
  NodeFs.writeFileSync(NodePath.join(directory, `${name}.md`), lines.join("\n"));
}

afterEach(() => {
  for (const root of roots.splice(0)) NodeFs.rmSync(root, { recursive: true, force: true });
});

describe("listSubagents", () => {
  it("lists AIOS and project specs with tier, Context List cost and errors", () => {
    const aios = makeRoot();
    NodeFs.writeFileSync(NodePath.join(aios, "DESIGN.md"), "x".repeat(4_000));
    writeSpec(aios, "frontend-designer", [
      "---",
      "name: frontend-designer",
      "model: claude-opus-5-5",
      "tools: [Read]",
      "context: [DESIGN.md]",
      "---",
      "Design.",
    ]);
    writeSpec(aios, "explorer", [
      "---",
      "name: explorer",
      "model: claude-haiku-5-5",
      "enabled: false",
      "tools: [Read]",
      "---",
      "Find.",
    ]);
    writeSpec(aios, "old", ["---", "name: old", "models:", "  claude: haiku", "---", "Old."]);
    writeSpec(aios, "scout-v1", [
      "---",
      "name: scout-v1",
      "model: claude-haiku-5-5",
      "avatar: felt/scout",
      "tools: [Read]",
      "effort: low",
      "maxTurns: 12",
      "---",
      "Find.",
    ]);
    const game = NodePath.join(aios, "projects", "game");
    writeSpec(game, "roblox", ["---", "name: roblox", "extends: frontend-designer", "---"]);
    writeSpec(game, "bad", ["---", "name: bad", "extends: nobody", "---"]);

    const sources = subagentSources({
      aiosRoot: aios,
      projects: [{ title: "Game", workspaceRoot: game }],
    });
    const entries = listSubagents({ sources, appFreeModels: DEFAULT_SUBAGENT_FREE_TIER_MODELS });
    const byName = new Map(entries.map((entry) => [entry.name, entry]));

    expect(sources.map((source) => source.projectName)).toEqual([null, "game"]);
    expect(byName.get("frontend-designer")).toMatchObject({
      source: "aios",
      tier: "confirm",
      enabled: true,
      context: [{ path: "DESIGN.md", tokens: 1_000 }],
      instructions: "Design.",
      error: null,
    });
    expect(byName.get("explorer")).toMatchObject({
      tier: "free",
      enabled: false,
      instructions: "Find.",
    });
    expect(byName.get("old")).toMatchObject({ legacy: true });
    // A format v1 file with the new keys is not legacy (found in the live check: effort).
    expect(byName.get("scout-v1")).toMatchObject({
      legacy: false,
      error: null,
      effort: "low",
      maxTurns: 12,
      avatar: "felt/scout",
    });
    expect(byName.get("roblox")).toMatchObject({
      source: "project",
      projectName: "game",
      extends: "frontend-designer",
      model: "claude-opus-5-5",
      error: null,
    });
    expect(byName.get("bad")?.error).toMatch(/extends "nobody"/);
  });
});
