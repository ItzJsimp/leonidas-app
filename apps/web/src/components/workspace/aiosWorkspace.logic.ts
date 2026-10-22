import type { AiosWorkspaceSummary, EnvironmentId, ProjectId } from "@t3tools/contracts";

/**
 * The active AIOS workspace (ADR-0080): the stored id when it is still ready, else the server's
 * default, else the first ready one. Undefined when no workspace is set up.
 */
export function pickActiveWorkspace(
  workspaces: ReadonlyArray<AiosWorkspaceSummary>,
  storedId: string | undefined,
): AiosWorkspaceSummary | undefined {
  const ready = workspaces.filter((workspace) => workspace.status === "ready");
  return (
    ready.find((workspace) => workspace.id === storedId) ??
    ready.find((workspace) => workspace.isDefault) ??
    ready[0]
  );
}

/** The request field for a scoped call; empty when no workspace is active (old behavior). */
export function workspaceScopeInput(workspaceId: string | undefined): {
  readonly workspaceId?: string;
} {
  return workspaceId ? { workspaceId } : {};
}

interface ScopedEntity {
  readonly environmentId: EnvironmentId;
}

/** A thread follows its project's workspace, even while the Command tab shows another one. */
export function workspaceForProject(
  workspaces: ReadonlyArray<AiosWorkspaceSummary>,
  projectId: ProjectId | undefined,
  chosenId: string | undefined,
) {
  if (projectId === undefined) return pickActiveWorkspace(workspaces, chosenId);
  return (
    workspaces.find(
      (workspace) => workspace.status === "ready" && workspace.projectIds.includes(projectId),
    ) ?? workspaces.find((workspace) => workspace.status === "ready" && workspace.isDefault)
  );
}

/** Project candidates shared by new-chat defaults and the chat project picker. */
export function chatProjectsForWorkspace<
  P extends ScopedEntity & { readonly id: ProjectId },
>(input: {
  readonly environmentId: EnvironmentId | null;
  readonly workspaces: ReadonlyArray<AiosWorkspaceSummary>;
  readonly active: AiosWorkspaceSummary | undefined;
  readonly projects: ReadonlyArray<P>;
}) {
  if (input.environmentId === null || input.active === undefined) return input.projects;
  return scopeToWorkspace({ ...input, threads: [] }).projects.filter(
    (project) => project.environmentId === input.environmentId,
  );
}

/**
 * Keeps the projects and threads of the active workspace. A project inside no workspace belongs to
 * the default one. Other environments pass through: their workspaces are not listed here.
 */
export function scopeToWorkspace<
  P extends ScopedEntity & { readonly id: ProjectId },
  T extends ScopedEntity & { readonly projectId: ProjectId },
>(input: {
  readonly environmentId: EnvironmentId | null;
  readonly workspaces: ReadonlyArray<AiosWorkspaceSummary>;
  readonly active: AiosWorkspaceSummary | undefined;
  readonly projects: ReadonlyArray<P>;
  readonly threads: ReadonlyArray<T>;
}): { readonly projects: ReadonlyArray<P>; readonly threads: ReadonlyArray<T> } {
  const { environmentId, workspaces, active } = input;
  if (environmentId === null || active === undefined) {
    return { projects: input.projects, threads: input.threads };
  }
  const owned = new Set(workspaces.flatMap((workspace) => workspace.projectIds));
  const mine = new Set(active.projectIds);
  const visible = (scopeEnvironment: EnvironmentId, projectId: ProjectId) =>
    scopeEnvironment !== environmentId ||
    mine.has(projectId) ||
    (active.isDefault && !owned.has(projectId));
  const projects = input.projects.filter((project) => visible(project.environmentId, project.id));
  const threads = input.threads.filter((thread) => visible(thread.environmentId, thread.projectId));
  return projects.length === input.projects.length && threads.length === input.threads.length
    ? { projects: input.projects, threads: input.threads }
    : { projects, threads };
}

/** A workspace id from a folder or display name: lowercase words joined by hyphens. */
export function suggestWorkspaceId(name: string): string {
  const id = name
    .toLowerCase()
    .replace(/\baios\b/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)
    .replace(/-+$/, "");
  return id || "workspace";
}

/** The folder name of a workspace root, for the setup prompt. */
export function workspaceFolderName(root: string): string {
  return (
    root
      .replace(/[\\/]+$/, "")
      .split(/[\\/]/)
      .pop() ?? root
  );
}

/**
 * Where a new business folder goes: `businesses/<id>` beside the managed `projects` folder.
 * It cannot sit inside `projects`, because the workspace scan skips a folder whose parent has that name.
 */
export function newBusinessFolder(newProjectsRoot: string, name: string): string {
  const separator = newProjectsRoot.includes("\\") ? "\\" : "/";
  const parent = newProjectsRoot.replace(/[\\/]+$/, "").replace(/[\\/][^\\/]*$/, "");
  return `${parent}${separator}businesses${separator}${suggestWorkspaceId(name)}`;
}
