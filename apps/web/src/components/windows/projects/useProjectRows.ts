import { isScratchProject } from "@t3tools/client-runtime/state/projects";
import { useMemo } from "react";

import { useActiveAiosWorkspace } from "~/components/workspace/useActiveAiosWorkspace";
import { scopeToWorkspace } from "~/components/workspace/aiosWorkspace.logic";
import { useClientSettings } from "~/hooks/useSettings";
import { selectProjectGroupingSettings } from "~/logicalProject";
import { buildSidebarProjectSnapshots } from "~/sidebarProjectGrouping";
import {
  useAllEnvironmentProjectSnapshotsReady,
  useProjects,
  useServerConfigs,
  useThreadShells,
} from "~/state/entities";
import { useEnvironments, usePrimaryEnvironmentId } from "~/state/environments";

import {
  projectRows,
  type ProjectChat,
  type ProjectGroup,
  type ProjectRow,
} from "./projects.logic";

/** The projects of the active workspace, grouped the way the chat list groups them. */
export function useProjectRows(): { readonly rows: ProjectRow[] | null } {
  const projects = useProjects();
  const threads = useThreadShells();
  const configs = useServerConfigs();
  const settings = useClientSettings(selectProjectGroupingSettings);
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const { environments } = useEnvironments();
  const workspace = useActiveAiosWorkspace();
  const snapshotsReady = useAllEnvironmentProjectSnapshotsReady();
  const { environmentId, workspaces, active, scopeReady } = workspace;
  return useMemo(() => {
    if (!scopeReady || !snapshotsReady) return { rows: null };
    const scoped = scopeToWorkspace({ environmentId, workspaces, active, projects, threads });
    const named = scoped.projects.filter(
      (project) =>
        !isScratchProject(project, configs.get(project.environmentId)?.scratchWorkspaceRoot),
    );
    const labels = new Map(environments.map((entry) => [entry.environmentId, entry.label]));
    const groups: ProjectGroup[] = buildSidebarProjectSnapshots({
      projects: named,
      settings,
      primaryEnvironmentId,
      resolveEnvironmentLabel: (id) => labels.get(id) ?? null,
    }).map((group) => ({
      key: group.projectKey,
      name: group.displayName,
      memberKeys: group.memberProjects.map((member) => `${member.environmentId}:${member.id}`),
    }));
    const chats: ProjectChat[] = scoped.threads.map((thread) => ({
      id: thread.id,
      environmentId: thread.environmentId,
      projectKey: `${thread.environmentId}:${thread.projectId}`,
      at: thread.lastActivityAt ?? thread.updatedAt,
      archived: thread.archivedAt !== null,
    }));
    return { rows: projectRows(groups, chats) };
  }, [
    scopeReady,
    snapshotsReady,
    environmentId,
    workspaces,
    active,
    projects,
    threads,
    configs,
    settings,
    primaryEnvironmentId,
    environments,
  ]);
}
