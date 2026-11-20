// @effect-diagnostics nodeBuiltinImport:off - small synchronous reads for the Studio write checks.
/**
 * The Studio's two writes: change a listed spec, or create one in a listed
 * folder. A spec is editable only when the catalog lists it, so the RPC can
 * never write an arbitrary file.
 */
import * as NodeFs from "node:fs";
import * as NodePath from "node:path";

import type {
  SubagentCatalogEntry,
  SubagentCreateInput,
  SubagentDeleteResult,
  SubagentSpecPatch,
} from "@t3tools/contracts";

import { catalogEntry, subagentSources, type SubagentSource } from "./subagentCatalog.ts";
import { createSubagentSpec, deleteSubagentSpec, updateSubagentSpec } from "./subagentEdit.ts";

interface StudioScope {
  readonly aiosRoot: string | null;
  readonly projects: ReadonlyArray<{ readonly title: string; readonly workspaceRoot: string }>;
  readonly appFreeModels: ReadonlyArray<string>;
}

const samePath = (left: string, right: string) =>
  NodePath.resolve(left).toLowerCase() === NodePath.resolve(right).toLowerCase();

function sourceOfSpec(scope: StudioScope, specPath: string): SubagentSource | null {
  const folder = NodePath.dirname(specPath);
  if (!specPath.endsWith(".md")) return null;
  return subagentSources(scope).find((source) => samePath(source.folder, folder)) ?? null;
}

export function updateStudioSubagent(
  scope: StudioScope,
  input: { readonly specPath: string; readonly patch: SubagentSpecPatch },
): SubagentCatalogEntry {
  const source = sourceOfSpec(scope, input.specPath);
  if (source === null || !NodeFs.existsSync(input.specPath)) {
    throw new Error("That subagent is not in the Studio list.");
  }
  updateSubagentSpec(input.specPath, input.patch);
  return catalogEntry(input.specPath, source, scope.appFreeModels);
}

export function createStudioSubagent(
  scope: StudioScope,
  input: SubagentCreateInput,
): SubagentCatalogEntry {
  let source: SubagentSource | null = null;
  let folder: string | null = null;
  if (input.destination.kind === "aios") {
    if (scope.aiosRoot === null) throw new Error("No AIOS folder is set up on this computer.");
    folder = NodePath.resolve(scope.aiosRoot, ".agents", "subagents");
    source = { folder, source: "aios", projectName: null };
  } else {
    const wanted = input.destination.projectName;
    const project = scope.projects.find((entry) => entry.title === wanted);
    if (project === undefined) throw new Error(`No project named "${wanted}".`);
    folder = NodePath.resolve(project.workspaceRoot, ".agents", "subagents");
    source = { folder, source: "project", projectName: project.title };
  }
  const specPath = createSubagentSpec({
    folder,
    name: input.name,
    contents: input.contents,
    ...(input.onNameTaken === undefined ? {} : { onNameTaken: input.onNameTaken }),
  });
  return catalogEntry(specPath, source, scope.appFreeModels);
}

/** The spec must be listed and exist: the RPC can never touch another file. */
function requireListedSpec(scope: StudioScope, specPath: string): void {
  if (sourceOfSpec(scope, specPath) === null || !NodeFs.existsSync(specPath)) {
    throw new Error("That subagent is not in the Studio list.");
  }
}

export function deleteStudioSubagent(
  scope: StudioScope,
  input: { readonly specPath: string },
): SubagentDeleteResult {
  requireListedSpec(scope, input.specPath);
  deleteSubagentSpec(input.specPath);
  return { specPath: input.specPath };
}

/** Copies a listed agent into the AIOS folder as the first free `<name>-N.md`. */
export function duplicateStudioSubagent(
  scope: StudioScope,
  input: { readonly specPath: string },
): SubagentCatalogEntry {
  requireListedSpec(scope, input.specPath);
  return createStudioSubagent(scope, {
    name: NodePath.basename(input.specPath, ".md"),
    contents: NodeFs.readFileSync(input.specPath, "utf8"),
    destination: { kind: "aios" },
    onNameTaken: "number",
  });
}
