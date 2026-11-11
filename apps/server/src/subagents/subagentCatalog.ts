// @effect-diagnostics nodeBuiltinImport:off - a few small synchronous reads per Studio refresh, same as subagentPersona.
/**
 * The Studio's subagent list: every spec in the AIOS root, in the AIOS
 * `projects/<p>/` folders and in registered projects, resolved the way a
 * spawn resolves it, with each Context List file's start cost.
 */
import * as NodeFs from "node:fs";
import * as NodePath from "node:path";

import type { SubagentCatalogEntry } from "@t3tools/contracts";

import {
  estimatePersonaStartTokens,
  readAiosModelTiersNear,
  resolveSpawnTier,
} from "./spawnTiers.ts";
import { resolveSubagentSpec } from "./subagentPersona.ts";

/** About 4 characters per token, the same rule the confirm card uses. */
const tokensForBytes = (bytes: number) => Math.round(bytes / 4);
const LEGACY_FIELD = /^(models|permissions|effort|omit_claude_md):/m;

export interface SubagentSource {
  readonly folder: string;
  readonly source: "aios" | "project";
  readonly projectName: string | null;
}

/** Spec folders to list, AIOS first, each folder once. */
export function subagentSources(input: {
  readonly aiosRoot: string | null;
  readonly projects: ReadonlyArray<{ readonly title: string; readonly workspaceRoot: string }>;
}): ReadonlyArray<SubagentSource> {
  const sources: SubagentSource[] = [];
  const seen = new Set<string>();
  const add = (root: string, source: SubagentSource["source"], projectName: string | null) => {
    const folder = NodePath.resolve(root, ".agents", "subagents");
    if (seen.has(folder.toLowerCase()) || !NodeFs.existsSync(folder)) return;
    seen.add(folder.toLowerCase());
    sources.push({ folder, source, projectName });
  };
  if (input.aiosRoot !== null) {
    add(input.aiosRoot, "aios", null);
    const projectsDir = NodePath.join(input.aiosRoot, "projects");
    if (NodeFs.existsSync(projectsDir)) {
      for (const entry of NodeFs.readdirSync(projectsDir, { withFileTypes: true })) {
        if (entry.isDirectory()) add(NodePath.join(projectsDir, entry.name), "project", entry.name);
      }
    }
  }
  for (const project of input.projects) add(project.workspaceRoot, "project", project.title);
  return sources;
}

export function catalogEntry(
  specPath: string,
  source: SubagentSource,
  appFreeModels: ReadonlyArray<string>,
): SubagentCatalogEntry {
  const base = {
    name: NodePath.basename(specPath, ".md"),
    source: source.source,
    projectName: source.projectName,
    specPath,
  };
  const empty = {
    description: null,
    extends: null,
    enabled: false,
    model: null,
    account: null,
    tier: null,
    tools: [],
    never: [],
    context: [],
    estimatedStartTokens: null,
    avatar: null,
    effort: null,
    skills: [],
    canSpawn: false,
    maxTurns: null,
  };
  const raw = NodeFs.readFileSync(specPath, "utf8");
  if (LEGACY_FIELD.test(raw.slice(0, 2_000))) {
    return { ...base, ...empty, legacy: true, error: "Old format. Migrate it to format v1." };
  }
  try {
    const spec = resolveSubagentSpec(specPath);
    const context = spec.context.map(({ path, absolutePath }) => ({
      path,
      tokens: NodeFs.existsSync(absolutePath)
        ? tokensForBytes(NodeFs.statSync(absolutePath).size)
        : null,
    }));
    const missing = context.find((entry) => entry.tokens === null);
    const promptChars =
      spec.body.length +
      spec.never.join("\n").length +
      context.reduce((sum, entry) => sum + (entry.tokens ?? 0) * 4, 0);
    const tier =
      spec.model === null
        ? null
        : spec.tier === "confirm"
          ? "confirm"
          : resolveSpawnTier({
              model: spec.model,
              appFreeModels,
              aios: readAiosModelTiersNear(specPath),
            }).tier;
    return {
      ...base,
      description: spec.description,
      extends: raw.match(/^extends:\s*(\S+)/m)?.[1] ?? null,
      enabled: spec.enabled,
      model: spec.model,
      account: spec.account,
      tier,
      tools: spec.tools,
      never: spec.never,
      context,
      avatar: spec.avatar,
      effort: spec.effort,
      skills: spec.skills,
      canSpawn: spec.canSpawn,
      maxTurns: spec.maxTurns,
      estimatedStartTokens: estimatePersonaStartTokens({
        systemPromptChars: promptChars,
        tools: spec.tools,
      }),
      legacy: false,
      error: missing === undefined ? null : `Context file "${missing.path}" does not exist.`,
    };
  } catch (error) {
    return {
      ...base,
      ...empty,
      legacy: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function listSubagents(input: {
  readonly sources: ReadonlyArray<SubagentSource>;
  readonly appFreeModels: ReadonlyArray<string>;
}): ReadonlyArray<SubagentCatalogEntry> {
  return input.sources.flatMap((source) =>
    NodeFs.readdirSync(source.folder)
      .filter((file) => file.endsWith(".md"))
      .toSorted()
      .map((file) => catalogEntry(NodePath.join(source.folder, file), source, input.appFreeModels)),
  );
}
