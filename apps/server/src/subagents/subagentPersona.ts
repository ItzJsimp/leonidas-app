// @effect-diagnostics nodeBuiltinImport:off - one synchronous read per spawn, same as taskBoard/aiosCards.
/**
 * Loads a named subagent spec (`.agents/subagents/<name>.md`) into the lean
 * persona a delegated child starts with (ADR-0082). The nearest spec wins,
 * walking up from the child's working directory, so a Project Subagent
 * shadows an AIOS Subagent of the same name. A spec with `extends: <base>`
 * resolves its base from the `.agents/subagents/` folders above its own.
 *
 * Spec format v1 (frontmatter, then the persona body):
 * - `name` (required, matches the file name) and `description` (one line).
 * - `extends`: base subagent; the child lists only what it changes.
 * - `model`: catalog model id. `account`: a provider instance id, or
 *   `balanced` (default) to let the app pick. `provider` is the slice 1
 *   name for `account` and still works.
 * - `tier: confirm` always shows the confirm card. The model tier map
 *   decides otherwise; a spec can never lower its tier.
 * - `enabled`: false keeps it in the catalog but off. Default true.
 * - `tools`: built-in tools and named app MCP tools (`mcp__...`).
 * - `context`: files loaded after the body, relative to the folder that
 *   holds `.agents/`. `never`: actions the subagent must not take.
 *
 * Merge for `extends`: the child's scalars and `tools` replace the base's;
 * `context` and `never` add to the base's; the child body follows the base.
 */
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

import { parse as parseYamlDocument } from "yaml";

const SUBAGENT_NAME = /^[a-z0-9][a-z0-9-]{0,63}$/;
const MAX_CONTEXT_FILE_BYTES = 200_000;
const MAX_EXTENDS_DEPTH = 4;
const KNOWN_FIELDS = new Set([
  "name",
  "description",
  "extends",
  "model",
  "account",
  "provider",
  "tier",
  "enabled",
  "tools",
  "context",
  "never",
  // AIOS metadata (personal or structural) that the AIOS audit requires; a spawn ignores it.
  "scope",
]);

export interface SubagentPersonaSpec {
  readonly name: string;
  readonly description: string | null;
  readonly extends: string | null;
  readonly model: string | null;
  /** Provider instance id, or null for balanced (the app picks). */
  readonly account: string | null;
  /** Only `confirm` is stored: it raises the tier above the model map. */
  readonly tier: "confirm" | null;
  readonly enabled: boolean | null;
  readonly tools: ReadonlyArray<string> | null;
  readonly context: ReadonlyArray<string>;
  readonly never: ReadonlyArray<string>;
  readonly body: string;
}

/** A spec with its `extends` chain merged and its Context List resolved. */
export interface ResolvedSubagentSpec {
  readonly name: string;
  readonly description: string | null;
  readonly model: string | null;
  readonly account: string | null;
  readonly tier: "confirm" | null;
  readonly enabled: boolean;
  readonly tools: ReadonlyArray<string>;
  /** Context List entries as written, each with the absolute path it resolved to. */
  readonly context: ReadonlyArray<{ readonly path: string; readonly absolutePath: string }>;
  readonly never: ReadonlyArray<string>;
  readonly body: string;
  /** Spec files from this one down to its last base. */
  readonly chain: ReadonlyArray<string>;
}

export interface LoadedSubagentPersona {
  readonly spec: ResolvedSubagentSpec;
  readonly specPath: string;
  readonly systemPrompt: string;
}

export class SubagentPersonaError extends Error {
  override readonly name = "SubagentPersonaError";
}

function stringList(value: unknown, field: string): ReadonlyArray<string> | null {
  if (value === undefined || value === null) return null;
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new SubagentPersonaError(`Field "${field}" must be a list of strings.`);
  }
  return value.map((item: string) => item.trim()).filter((item) => item.length > 0);
}

function optionalString(value: unknown, field: string): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw new SubagentPersonaError(`Field "${field}" must be text.`);
  return value.trim().length > 0 ? value.trim() : null;
}

export function parseSubagentSpec(source: string, expectedName: string): SubagentPersonaSpec {
  const match = /^﻿?---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(source);
  if (match === null) throw new SubagentPersonaError("Spec has no frontmatter.");
  const frontmatter: unknown = parseYamlDocument(match[1] ?? "");
  if (typeof frontmatter !== "object" || frontmatter === null || Array.isArray(frontmatter)) {
    throw new SubagentPersonaError("Spec frontmatter is not a mapping.");
  }
  const fields = frontmatter as Record<string, unknown>;
  const unknown = Object.keys(fields).filter((key) => !KNOWN_FIELDS.has(key));
  if (unknown.length > 0) {
    throw new SubagentPersonaError(`Unknown field "${unknown[0]}". Format v1 does not use it.`);
  }
  const name = optionalString(fields.name, "name");
  if (name !== expectedName) {
    throw new SubagentPersonaError(`Spec name "${name ?? ""}" does not match "${expectedName}".`);
  }
  const extendsName = optionalString(fields.extends, "extends");
  if (extendsName !== null && !SUBAGENT_NAME.test(extendsName)) {
    throw new SubagentPersonaError(`"extends: ${extendsName}" is not a valid subagent name.`);
  }
  const tier = optionalString(fields.tier, "tier");
  if (tier !== null && tier !== "confirm") {
    throw new SubagentPersonaError(
      `"tier: ${tier}" is not allowed. Use "tier: confirm", or leave it out to use the model map.`,
    );
  }
  if (fields.enabled !== undefined && typeof fields.enabled !== "boolean") {
    throw new SubagentPersonaError('Field "enabled" must be true or false.');
  }
  const account =
    optionalString(fields.account, "account") ?? optionalString(fields.provider, "provider");
  const body = (match[2] ?? "").trim();
  if (body.length === 0 && extendsName === null) {
    throw new SubagentPersonaError("Spec has no persona body.");
  }
  return {
    name,
    description: optionalString(fields.description, "description"),
    extends: extendsName,
    model: optionalString(fields.model, "model"),
    account: account === "balanced" ? null : account,
    tier,
    enabled: fields.enabled === undefined ? null : (fields.enabled as boolean),
    tools: stringList(fields.tools, "tools"),
    context: stringList(fields.context, "context") ?? [],
    never: stringList(fields.never, "never") ?? [],
    body,
  };
}

/** Nearest `.agents/subagents/<name>.md` at or above `cwd`, or null. */
function findSubagentSpec(cwd: string, name: string): string | null {
  let directory = NodePath.resolve(cwd);
  for (;;) {
    const candidate = NodePath.join(directory, ".agents", "subagents", `${name}.md`);
    if (NodeFS.existsSync(candidate)) return candidate;
    const parent = NodePath.dirname(directory);
    if (parent === directory) return null;
    directory = parent;
  }
}

/** The folder that holds `.agents/` for a spec path. Context paths are relative to it. */
function specRoot(specPath: string): string {
  return NodePath.dirname(NodePath.dirname(NodePath.dirname(specPath)));
}

function resolveContextPath(root: string, relativePath: string): string {
  const absolute = NodePath.resolve(root, relativePath);
  if (!absolute.startsWith(root + NodePath.sep)) {
    throw new SubagentPersonaError(`Context path "${relativePath}" leaves ${root}.`);
  }
  return absolute;
}

/** True when a spec named `name` exists above `cwd` and resolves to an enabled subagent. */
export function isEnabledSubagent(cwd: string | null | undefined, name: string): boolean {
  if (!cwd) return false;
  const specPath = findSubagentSpec(cwd, name);
  if (specPath === null) return false;
  try {
    return resolveSubagentSpec(specPath).enabled;
  } catch {
    return false;
  }
}

const unique = (items: ReadonlyArray<string>) => [...new Set(items)];

/** Reads a spec and merges its `extends` chain. Context files are located, not read. */
export function resolveSubagentSpec(specPath: string): ResolvedSubagentSpec {
  const chain: Array<{ readonly path: string; readonly spec: SubagentPersonaSpec }> = [];
  let path: string | null = specPath;
  while (path !== null) {
    const spec = parseSubagentSpec(
      NodeFS.readFileSync(path, "utf8"),
      NodePath.basename(path, ".md"),
    );
    chain.push({ path, spec });
    if (spec.extends === null) break;
    if (chain.length > MAX_EXTENDS_DEPTH) {
      throw new SubagentPersonaError(`"${chain[0]!.spec.name}" extends more than 4 levels deep.`);
    }
    const base = findSubagentSpec(NodePath.dirname(specRoot(path)), spec.extends);
    if (base === null) {
      throw new SubagentPersonaError(
        `"${spec.name}" extends "${spec.extends}", but no .agents/subagents/${spec.extends}.md exists above ${specRoot(path)}.`,
      );
    }
    if (chain.some((link) => link.path === base)) {
      throw new SubagentPersonaError(`"${spec.name}" extends itself through "${spec.extends}".`);
    }
    path = base;
  }
  // Merge from the last base up to the spec that was asked for.
  const ordered = chain.toReversed();
  const pick = <K extends keyof SubagentPersonaSpec>(key: K): SubagentPersonaSpec[K] | null =>
    ordered.reduce<SubagentPersonaSpec[K] | null>(
      (value, link) => (link.spec[key] === null ? value : link.spec[key]),
      null,
    );
  const context = ordered.flatMap((link) =>
    link.spec.context.map((entry) => ({
      path: entry,
      absolutePath: resolveContextPath(specRoot(link.path), entry),
    })),
  );
  const seen = new Set<string>();
  return {
    name: chain[0]!.spec.name,
    description: pick("description"),
    model: pick("model"),
    account: pick("account"),
    tier: ordered.some((link) => link.spec.tier === "confirm") ? "confirm" : null,
    // `enabled` is the asked-for spec's own choice; a base being off does not turn a project copy off.
    enabled: chain[0]!.spec.enabled ?? true,
    tools: pick("tools") ?? [],
    context: context.filter((entry) =>
      seen.has(entry.absolutePath) ? false : (seen.add(entry.absolutePath), true),
    ),
    never: unique(ordered.flatMap((link) => link.spec.never)),
    body: ordered
      .map((link) => link.spec.body)
      .filter((body) => body.length > 0)
      .join("\n\n"),
    chain: chain.map((link) => link.path),
  };
}

function buildPersonaSystemPrompt(input: {
  readonly spec: Pick<ResolvedSubagentSpec, "body" | "never">;
  readonly contextFiles: ReadonlyArray<{ readonly path: string; readonly content: string }>;
}): string {
  const sections = [input.spec.body];
  if (input.spec.never.length > 0) {
    sections.push(["Never:", ...input.spec.never.map((rule) => `- ${rule}`)].join("\n"));
  }
  for (const file of input.contextFiles) {
    sections.push(`<context file="${file.path}">\n${file.content.trim()}\n</context>`);
  }
  return sections.join("\n\n");
}

export function loadSubagentPersona(cwd: string, name: string): LoadedSubagentPersona {
  if (!SUBAGENT_NAME.test(name)) {
    throw new SubagentPersonaError(`"${name}" is not a valid subagent name.`);
  }
  const specPath = findSubagentSpec(cwd, name);
  if (specPath === null) {
    throw new SubagentPersonaError(`No subagent "${name}" in .agents/subagents/ above ${cwd}.`);
  }
  const spec = resolveSubagentSpec(specPath);
  if (!spec.enabled) {
    throw new SubagentPersonaError(`Subagent "${name}" is off. Turn it on in the Subagents view.`);
  }
  const contextFiles = spec.context.map(({ path, absolutePath }) => {
    if (!NodeFS.existsSync(absolutePath)) {
      throw new SubagentPersonaError(`Context file "${path}" does not exist.`);
    }
    if (NodeFS.statSync(absolutePath).size > MAX_CONTEXT_FILE_BYTES) {
      throw new SubagentPersonaError(`Context file "${path}" is over 200 KB.`);
    }
    return { path, content: NodeFS.readFileSync(absolutePath, "utf8") };
  });
  return { spec, specPath, systemPrompt: buildPersonaSystemPrompt({ spec, contextFiles }) };
}
