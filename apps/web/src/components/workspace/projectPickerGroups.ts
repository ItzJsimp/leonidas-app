import type { AiosWorkspaceSummary, EnvironmentId, ProjectId } from "@t3tools/contracts";

import { workspaceFolderName, workspaceForProject } from "./aiosWorkspace.logic";

export interface ProjectPickerGroup<E> {
  readonly key: string;
  /** The workspace name; empty when every project is in one workspace, so no heading shows. */
  readonly label: string;
  readonly entries: ReadonlyArray<E>;
}

interface PickerEntry {
  readonly targetProject: { readonly id: ProjectId; readonly environmentId: EnvironmentId };
}

/**
 * Groups the new-chat picker rows by AIOS workspace, the active project's workspace first. A
 * project of another computer stays with the active group, as it does in the scoped lists. One
 * workspace (or none) gives one group with no label, so a user without workspaces sees no change.
 */
export function groupPickerEntriesByWorkspace<E extends PickerEntry>(
  entries: ReadonlyArray<E>,
  input: {
    readonly workspaces: ReadonlyArray<AiosWorkspaceSummary>;
    readonly environmentId: EnvironmentId | null;
    readonly activeProjectId: ProjectId | undefined;
  },
): ReadonlyArray<ProjectPickerGroup<E>> {
  const { workspaces, environmentId, activeProjectId } = input;
  const single = [{ key: "projects", label: "", entries }] as const;
  if (environmentId === null || workspaces.length < 2) return single;

  const activeRoot = workspaceForProject(workspaces, activeProjectId, undefined)?.root ?? null;
  const rootOf = (entry: E): string | null =>
    entry.targetProject.environmentId === environmentId
      ? (workspaceForProject(workspaces, entry.targetProject.id, undefined)?.root ?? activeRoot)
      : activeRoot;

  const byRoot = new Map<string, E[]>();
  for (const entry of entries) {
    const root = rootOf(entry) ?? "";
    byRoot.set(root, [...(byRoot.get(root) ?? []), entry]);
  }
  if (byRoot.size < 2) return single;

  const order = [
    ...(activeRoot === null ? [] : [activeRoot]),
    ...workspaces.map((workspace) => workspace.root),
    "",
  ].filter((root, index, all) => all.indexOf(root) === index && byRoot.has(root));
  return order.map((root) => {
    const workspace = workspaces.find((candidate) => candidate.root === root);
    return {
      key: root || "other",
      label: workspace ? (workspace.name ?? workspaceFolderName(workspace.root)) : "Other",
      entries: byRoot.get(root) ?? [],
    };
  });
}
