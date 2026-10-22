import type { WorkspaceOrg, WorkspacePackWidget } from "@t3tools/contracts";

import { resolveWorkspaceRoot, type AiosWorkspaceState } from "../taskBoard/aiosWorkspaces.ts";
import { loadBusinessPack, type BusinessPack } from "./loadBusinessPack.ts";

export type { BusinessPack };

/**
 * The pack widgets for one workspace. Only a `ready` workspace of `type: business` gets any, read
 * from its own root; every other case is `[]`. A pack failure also gives `[]`, so a widget never
 * breaks the Command Home.
 */
export async function widgetsForWorkspace(
  workspaces: ReadonlyArray<AiosWorkspaceState>,
  workspaceId: string | undefined,
  now: number,
  load: () => Promise<BusinessPack | null> = loadBusinessPack,
): Promise<ReadonlyArray<WorkspacePackWidget>> {
  const root = resolveWorkspaceRoot(workspaces, workspaceId);
  if (root === null) return [];
  const state = workspaces.find((workspace) => workspace.root === root);
  if (state?.status !== "ready" || state.file.type !== "business") return [];
  try {
    const pack = await load();
    return pack ? await pack.readWidgets(root, now) : [];
  } catch {
    return [];
  }
}

/**
 * The org record of one workspace, read from its Home area files. Same rule as the widgets: only a
 * `ready` workspace of `type: business` has one, and any failure gives `null`.
 */
export async function orgForWorkspace(
  workspaces: ReadonlyArray<AiosWorkspaceState>,
  workspaceId: string | undefined,
  load: () => Promise<BusinessPack | null> = loadBusinessPack,
): Promise<WorkspaceOrg | null> {
  const root = resolveWorkspaceRoot(workspaces, workspaceId);
  if (root === null) return null;
  const state = workspaces.find((workspace) => workspace.root === root);
  if (state?.status !== "ready" || state.file.type !== "business") return null;
  try {
    const pack = await load();
    return pack ? await pack.readOrg(root) : null;
  } catch {
    return null;
  }
}
