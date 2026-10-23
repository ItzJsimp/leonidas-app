import type { TaskBoardTask, TaskBoardTeamMember } from "@t3tools/contracts";

/**
 * Which tasks the page shows, by owner. "agents" lists agent work: chat requests the app filed as
 * agent runs and tasks an agent is working on now. Every other lens hides agent-run records.
 */
export type OwnerLens = "everyone" | "mine" | "anyone" | "agents" | `person:${string}`;

export const DEFAULT_OWNER_LENS: OwnerLens = "everyone";

type OwnedTask = Pick<TaskBoardTask, "assignee" | "claimedBy" | "claimedAgent" | "kind" | "status">;

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** The team name for a login, git name or display name; the raw value when nobody matches. */
export function canonicalName(
  raw: string | null | undefined,
  team: ReadonlyArray<TaskBoardTeamMember>,
): string | null {
  const value = raw?.trim();
  if (!value) return null;
  const member = team.find(
    (candidate) =>
      same(candidate.name, value) || candidate.aliases.some((alias) => same(alias, value)),
  );
  return member?.name ?? value;
}

/** The person a task belongs to: its owner field, else whoever claimed it. Null means anyone. */
export function ownerOf(task: OwnedTask, team: ReadonlyArray<TaskBoardTeamMember>): string | null {
  return canonicalName(task.assignee ?? task.claimedBy, team);
}

export function isAgentRun(task: Pick<TaskBoardTask, "kind">): boolean {
  return task.kind === "agent_run";
}

/** An agent holds the task right now: it has a thread and is not finished. */
export function hasActiveAgent(task: OwnedTask): boolean {
  return (
    task.claimedAgent?.threadId !== undefined &&
    (task.status === "in_progress" || task.status === "review")
  );
}

export function matchesOwnerLens(
  task: OwnedTask,
  lens: OwnerLens,
  viewer: string,
  team: ReadonlyArray<TaskBoardTeamMember>,
): boolean {
  if (lens === "agents") return isAgentRun(task) || hasActiveAgent(task);
  if (isAgentRun(task)) return false;
  if (lens === "everyone") return true;
  const owner = ownerOf(task, team);
  if (lens === "anyone") return owner === null;
  if (lens === "mine") return owner !== null && same(owner, viewer);
  return owner !== null && same(owner, lens.slice("person:".length));
}

export type OwnerLensOption = {
  readonly lens: OwnerLens;
  readonly label: string;
  readonly count: number;
};

/**
 * The owner lenses with their open-task counts: Everyone, Mine, each other teammate, Anyone and
 * Agents. People who own open tasks but are not on the team still get a lens.
 */
export function ownerLensOptions(
  openTasks: ReadonlyArray<OwnedTask>,
  viewer: string,
  team: ReadonlyArray<TaskBoardTeamMember>,
): OwnerLensOption[] {
  const backlog = openTasks.filter((task) => !isAgentRun(task));
  const people = new Map<string, number>(team.map((member) => [member.name, 0] as const));
  let anyone = 0;
  for (const task of backlog) {
    const owner = ownerOf(task, team);
    if (owner === null) anyone++;
    else people.set(owner, (people.get(owner) ?? 0) + 1);
  }
  const mine = [...people].find(([name]) => same(name, viewer))?.[1] ?? 0;
  return [
    { lens: "everyone", label: "Everyone", count: backlog.length },
    { lens: "mine", label: "Mine", count: mine },
    ...[...people]
      .filter(([name]) => !same(name, viewer))
      .map(([name, count]) => ({ lens: `person:${name}` as const, label: name, count })),
    { lens: "anyone", label: "Anyone", count: anyone },
    {
      lens: "agents",
      label: "Agents",
      count: openTasks.filter((task) => isAgentRun(task) || hasActiveAgent(task)).length,
    },
  ];
}

export function parseOwnerLens(value: unknown): OwnerLens {
  if (value === "everyone" || value === "mine" || value === "anyone" || value === "agents") {
    return value;
  }
  return typeof value === "string" && value.startsWith("person:") && value.length > 7
    ? (value as OwnerLens)
    : DEFAULT_OWNER_LENS;
}

export interface OwnerPickerItem {
  readonly value: string;
  readonly label: string;
}

/**
 * The Owner picker's rows, one for each teammate. A business Member is stored by slug, and an
 * agent says so in its label. An owner the team does not list still gets a row.
 */
export function ownerPickerItems(
  team: ReadonlyArray<TaskBoardTeamMember>,
  owner: string | null,
): Array<OwnerPickerItem> {
  const items = new Map<string, string>();
  for (const member of team) {
    items.set(
      member.slug ?? member.name,
      member.kind === "agent" ? `${member.name} (agent)` : member.name,
    );
  }
  if (owner && !team.some((member) => member.name === owner)) items.set(owner, owner);
  return [...items].map(([value, label]) => ({ value, label }));
}

/** The picker value for the task's owner: the Member's slug when it has one, else the name. */
export function ownerPickerValue(
  team: ReadonlyArray<TaskBoardTeamMember>,
  owner: string | null,
): string | null {
  if (!owner) return null;
  const member = team.find((candidate) => candidate.name === owner);
  return member ? (member.slug ?? member.name) : owner;
}
