import type { AiosWorkspaceSummary } from "@t3tools/contracts";

import { childFolder } from "./aiosWorkspace.logic";

/** The AIOS folder a new project goes into: the active workspace, else the first one listed. */
export function aiosRootForNewProject(
  workspaces: ReadonlyArray<AiosWorkspaceSummary>,
  active: AiosWorkspaceSummary | undefined,
): string | null {
  return active?.root ?? workspaces[0]?.root ?? null;
}

const normalize = (path: string) => path.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();

/** True when `path` is an AIOS folder itself, not a project folder inside one. */
export function isAiosRoot(workspaces: ReadonlyArray<AiosWorkspaceSummary>, path: string): boolean {
  const target = normalize(path);
  return workspaces.some((workspace) => normalize(workspace.root) === target);
}

/** The first message of a new project's chat. The user sends it; the agent then asks the questions. */
export function projectFillInPrompt(name: string): string {
  return [
    `Fill in my new project "${name}".`,
    "1. Read AGENTS.md, project.md and spec.md in this folder.",
    "2. Ask me plain questions about the project. Ask five at most at one time, easiest first.",
    "3. Replace each TODO: mark with my answers. Never invent a fact.",
    "4. When no TODO: mark is left, tell me the project is ready.",
  ].join("\n");
}

/** The folder name for a project: lowercase letters, digits and hyphens. Same rule as the server. */
export function projectFolderName(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
  return slug || "project";
}

// shortcut: a taken name gets a number from the server (`-2`), so the preview can differ then;
// upgrade by returning the made folder before the dialog closes.
/** Where the project folder will be, shown before it is made. */
export function projectFolderPreview(aiosRoot: string, name: string): string {
  const projects = childFolder(aiosRoot, "projects");
  return name.trim() === "" ? projects : childFolder(projects, projectFolderName(name));
}
