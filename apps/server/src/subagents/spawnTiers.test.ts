// @effect-diagnostics nodeBuiltinImport:off
import * as NodeFs from "node:fs";
import * as NodeOs from "node:os";
import * as NodePath from "node:path";
import { describe, expect, it } from "@effect/vitest";
import { DEFAULT_SUBAGENT_FREE_TIER_MODELS } from "@t3tools/contracts";

import {
  estimatePersonaStartTokens,
  ModelTiersFileError,
  parseModelTiers,
  readAiosModelTiersNear,
  resolveSpawnTier,
} from "./spawnTiers.ts";

const appFreeModels = DEFAULT_SUBAGENT_FREE_TIER_MODELS;

describe("resolveSpawnTier", () => {
  it("spawns Haiku 5.5 free and asks first for Opus and unknown models", () => {
    expect(
      resolveSpawnTier({ model: "claude-haiku-5-5", appFreeModels, aios: null }),
    ).toMatchObject({ tier: "free", source: "app" });
    expect(resolveSpawnTier({ model: "claude-opus-5-5", appFreeModels, aios: null })).toMatchObject(
      { tier: "confirm", source: "app" },
    );
    expect(resolveSpawnTier({ model: "brand-new-model", appFreeModels, aios: null }).tier).toBe(
      "confirm",
    );
  });

  it("lets the AIOS file override the app map in both directions", () => {
    const aios = parseModelTiers(
      JSON.stringify({
        free: ["claude-sonnet-5-5"],
        confirm: ["claude-haiku-5-5"],
        goodFor: { confirm: "Only when Jake says so." },
      }),
      "model-tiers.json",
    );
    expect(resolveSpawnTier({ model: "claude-sonnet-5-5", appFreeModels, aios })).toMatchObject({
      tier: "free",
      source: "aios",
    });
    expect(resolveSpawnTier({ model: "claude-haiku-5-5", appFreeModels, aios })).toEqual({
      tier: "confirm",
      source: "aios",
      goodFor: "Only when Jake says so.",
    });
    expect(resolveSpawnTier({ model: "gpt-6-luna", appFreeModels, aios }).source).toBe("app");
  });
});

describe("model-tiers.json", () => {
  it("rejects a malformed file", () => {
    expect(() => parseModelTiers("{", "x.json")).toThrow(ModelTiersFileError);
    expect(() => parseModelTiers(JSON.stringify({ free: "haiku" }), "x.json")).toThrow(
      ModelTiersFileError,
    );
  });

  it("finds the nearest file above a spec", () => {
    const root = NodeFs.mkdtempSync(NodePath.join(NodeOs.tmpdir(), "tiers-"));
    try {
      const aiosDir = NodePath.join(root, ".agents", "subagents");
      const projectDir = NodePath.join(root, "projects", "p", ".agents", "subagents");
      NodeFs.mkdirSync(aiosDir, { recursive: true });
      NodeFs.mkdirSync(projectDir, { recursive: true });
      NodeFs.writeFileSync(NodePath.join(aiosDir, "model-tiers.json"), '{"free":["x"]}');
      const tiers = readAiosModelTiersNear(NodePath.join(projectDir, "designer.md"));
      expect(tiers?.free).toEqual(["x"]);
      expect(readAiosModelTiersNear(NodePath.join(NodeOs.tmpdir(), "nowhere.md"))).toBeNull();
    } finally {
      NodeFs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("estimatePersonaStartTokens", () => {
  it("charges one schema per named app tool, not the whole app tool list", () => {
    const lean = estimatePersonaStartTokens({ systemPromptChars: 4_000, tools: ["Read", "Grep"] });
    const withMcp = estimatePersonaStartTokens({
      systemPromptChars: 4_000,
      tools: ["Read", "Grep", "mcp__leonidas__leo_preview_open", "mcp__leonidas__preview_click"],
    });
    expect(withMcp - lean).toBe(2_600);
  });

  it("lands within 25 percent of the measured roblox-ui-designer start", () => {
    const estimate = estimatePersonaStartTokens({
      systemPromptChars: 12_575,
      tools: [
        "Read",
        "Edit",
        "Write",
        "Glob",
        "Grep",
        "Bash",
        ...["open", "navigate", "snapshot", "click", "resize"].map(
          (n) => `mcp__leonidas__preview_${n}`,
        ),
      ],
    });
    expect(Math.abs(estimate - 19_001) / 19_001).toBeLessThan(0.25);
  });
});
