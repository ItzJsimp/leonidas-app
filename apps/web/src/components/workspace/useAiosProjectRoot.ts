import { aiosRootForNewProject, isAiosRoot } from "./aiosProject.logic";
import { useActiveAiosWorkspace } from "./useActiveAiosWorkspace";

/** The AIOS folder that receives a new project; `root` is null until an AIOS is found. */
export function useAiosProjectRoot() {
  const { environmentId, workspaces, active } = useActiveAiosWorkspace();
  return { environmentId, workspaces, root: aiosRootForNewProject(workspaces, active) };
}

/** True when `path` is an AIOS folder itself, not a project folder inside one. */
export function useIsAiosRoot(path: string | null): boolean {
  const { workspaces } = useAiosProjectRoot();
  return path !== null && isAiosRoot(workspaces, path);
}
