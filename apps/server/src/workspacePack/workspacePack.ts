import type {
  TaskBoardTeamMember,
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

const EMPTY_ORG: WorkspaceOrgResult = { org: null, me: null, proposals: [], invites: [] };
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

/**
 * The Members of a business workspace as the board's team: the display name is the name, and the
 * slug and GitHub login are aliases, so a task file may store any of them. A removed Member is
 * left out. Any failure gives an empty team.
 */
export async function teamForWorkspace(
  workspaces: ReadonlyArray<AiosWorkspaceState>,
  workspaceId: string | undefined,
  load: () => Promise<BusinessPack | null> = loadBusinessPack,
): Promise<ReadonlyArray<TaskBoardTeamMember>> {
  const view = await orgForWorkspace(workspaces, workspaceId, null, load);
  return (view.org?.members ?? [])
    .filter((member) => member.status !== "removed")
    .map((member) => ({
      name: member.name,
      aliases: [member.slug, member.github].filter(Boolean),
      slug: member.slug,
      kind: member.kind,
    }));
}

/**
 * Makes one task of a business workspace private in an Area, or public with null. Returns an
 * error text for the user, or null when it worked.
 */
export async function privacyForWorkspace(
  workspaces: ReadonlyArray<AiosWorkspaceState>,
  workspaceId: string | undefined,
  file: string,
  taskId: string,
  area: string | null,
  load: () => Promise<BusinessPack | null> = loadBusinessPack,
): Promise<string | null> {
  const root = businessRoot(workspaces, workspaceId);
  if (root === null) return "Only a business workspace has private tasks.";
  try {
    const pack = await load();
    return pack
      ? await pack.setCardPrivacy(root, file, taskId, area)
      : "This build has no business pack.";
  } catch {
    return "Could not change the privacy of this task.";
  }
}

interface MaskedTask {
  readonly id: string;
  readonly title: string;
  readonly labels: ReadonlyArray<string>;
  readonly sourceRoot?: string | undefined;
}

/**
 * A private task shows its Area name in Home. On a computer that has the Area folder, the real
 * title comes back. Any failure keeps the masked title.
 */
export async function revealPrivateTitles<T extends MaskedTask>(
  tasks: ReadonlyArray<T>,
  load: () => Promise<BusinessPack | null> = loadBusinessPack,
): Promise<ReadonlyArray<T>> {
  const areaOf = (task: T) =>
    task.labels.find((label) => label.startsWith("area:"))?.slice("area:".length);
  const hidden = tasks.filter(
    (task) => task.labels.includes("private") && task.sourceRoot && areaOf(task),
  );
  if (hidden.length === 0) return tasks;
  const pack = await load().catch(() => null);
  if (!pack) return tasks;
  const titles = new Map<string, string>();
  await Promise.all(
    hidden.map(async (task) => {
      const title = await pack
        .readPrivateTitle(task.sourceRoot!, areaOf(task)!, task.id)
        .catch(() => null);
      if (title) titles.set(task.id, title);
    }),
  );
  return titles.size === 0
    ? tasks
    : tasks.map((task) => (titles.has(task.id) ? { ...task, title: titles.get(task.id)! } : task));
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

/**
 * Copies the business template into a folder that is being set up as a business. Returns an
 * error text for the user, or null when it worked.
 */
export async function scaffoldForSetup(
  root: string,
  input: { readonly id: string; readonly name: string; readonly ownerName?: string | undefined },
  githubLogin: string | null,
  timezone: string,
  load: () => Promise<BusinessPack | null> = loadBusinessPack,
): Promise<string | null> {
  if (!input.ownerName) return "A business needs the name of its Owner.";
  // A GitHub login is plain letters, digits and hyphens; anything else never reaches a file.
  if (!githubLogin || !/^[A-Za-z0-9-]{1,39}$/.test(githubLogin)) {
    return "A business needs GitHub signed in on this computer (run gh auth login).";
  }
  try {
    const pack = await load();
    if (!pack) return "This build has no business template.";
    pack.scaffoldBusiness(root, {
      id: input.id,
      name: input.name,
      ownerName: input.ownerName,
      ownerGithub: githubLogin,
      timezone,
    });
    return null;
  } catch {
    return "Could not copy the business template. Check that the folder is writable.";
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
