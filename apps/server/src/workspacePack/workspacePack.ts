import type {
  WorkspaceOrgActionResult,
  WorkspaceOrgChange,
  WorkspaceOrgResult,
  WorkspacePackWidget,
} from "@t3tools/contracts";

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

const EMPTY_ORG: WorkspaceOrgResult = { org: null, me: null, proposals: [] };
const NO_PACK: WorkspaceOrgActionResult = {
  result: "invalid",
  message: "This workspace cannot change its org record.",
};

/** The root of a `ready` business workspace, or null. */
function businessRoot(
  workspaces: ReadonlyArray<AiosWorkspaceState>,
  workspaceId: string | undefined,
): string | null {
  const root = resolveWorkspaceRoot(workspaces, workspaceId);
  if (root === null) return null;
  const state = workspaces.find((workspace) => workspace.root === root);
  return state?.status === "ready" && state.file.type === "business" ? root : null;
}

/**
 * The org record of one workspace, who uses this computer, and the proposals that wait for an
 * Owner. Same rule as the widgets: only a `ready` business workspace has one, and any failure
 * gives an empty answer.
 */
export async function orgForWorkspace(
  workspaces: ReadonlyArray<AiosWorkspaceState>,
  workspaceId: string | undefined,
  githubLogin: string | null,
  load: () => Promise<BusinessPack | null> = loadBusinessPack,
): Promise<WorkspaceOrgResult> {
  const root = businessRoot(workspaces, workspaceId);
  if (root === null) return EMPTY_ORG;
  try {
    const pack = await load();
    return pack ? await pack.readOrgView(root, githubLogin) : EMPTY_ORG;
  } catch {
    return EMPTY_ORG;
  }
}

/** A change to the org record. The pack decides: apply at once, file a proposal, or refuse. */
export async function changeOrgForWorkspace(
  workspaces: ReadonlyArray<AiosWorkspaceState>,
  workspaceId: string | undefined,
  githubLogin: string | null,
  change: WorkspaceOrgChange,
  now: number,
  load: () => Promise<BusinessPack | null> = loadBusinessPack,
): Promise<WorkspaceOrgActionResult> {
  const root = businessRoot(workspaces, workspaceId);
  if (root === null) return NO_PACK;
  try {
    const pack = await load();
    return pack ? await pack.submitChange(root, githubLogin, change, now) : NO_PACK;
  } catch {
    return { result: "invalid", message: "The change could not be saved." };
  }
}

/** An Owner approves or rejects a waiting proposal. */
export async function decideOrgForWorkspace(
  workspaces: ReadonlyArray<AiosWorkspaceState>,
  workspaceId: string | undefined,
  githubLogin: string | null,
  id: string,
  decision: "approve" | "reject",
  now: number,
  load: () => Promise<BusinessPack | null> = loadBusinessPack,
): Promise<WorkspaceOrgActionResult> {
  const root = businessRoot(workspaces, workspaceId);
  if (root === null) return NO_PACK;
  try {
    const pack = await load();
    return pack ? await pack.decideProposal(root, githubLogin, id, decision, now) : NO_PACK;
  } catch {
    return { result: "invalid", message: "The decision could not be saved." };
  }
}
