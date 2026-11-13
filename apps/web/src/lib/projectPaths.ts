import { findProjectByPath } from "@t3tools/client-runtime/state/projects";
import type { EnvironmentId } from "@t3tools/contracts";

/**
 * The project that already owns `folder` on one computer. Pass every project, never the list the
 * active workspace shows: the server allows one project per folder across workspaces, so a project
 * that the workspace hides still owns the folder.
 */
export function findExistingProjectForFolder<
  T extends { readonly environmentId: EnvironmentId; readonly workspaceRoot: string },
>(allProjects: ReadonlyArray<T>, environmentId: EnvironmentId, folder: string): T | undefined {
  return findProjectByPath(
    allProjects.filter((project) => project.environmentId === environmentId),
    folder,
  );
}

export {
  appendBrowsePathSegment,
  canNavigateUp,
  ensureBrowseDirectoryPath,
  findProjectByPath,
  getBrowseDirectoryPath,
  getBrowseLeafPathSegment,
  getBrowseParentPath,
  hasTrailingPathSeparator,
  inferProjectTitleFromPath,
  isExplicitRelativeProjectPath,
  isFilesystemBrowseQuery,
  isUnsupportedWindowsProjectPath,
  normalizeProjectPathForComparison,
  normalizeProjectPathForDispatch,
  resolveProjectPathForDispatch,
} from "@t3tools/client-runtime/state/projects";
