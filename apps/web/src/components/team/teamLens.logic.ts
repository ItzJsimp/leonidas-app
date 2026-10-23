import type { TaskBoardTask, TaskBoardTeamMember, WorkspaceOrg } from "@t3tools/contracts";

import { isAgentRun, ownerOf } from "../taskBoard/owner.logic";
import { isOpen } from "../taskBoard/taskBoard.logic";
import { memberInLens, type TeamLens } from "./teamView.logic";

type Member = WorkspaceOrg["members"][number];

/** The task fields the Team lens reads. */
export type LensTask = Pick<
  TaskBoardTask,
  | "id"
  | "title"
  | "status"
  | "priority"
  | "assignee"
  | "claimedBy"
  | "claimedAgent"
  | "kind"
  | "updatedAt"
>;

const PRIORITY_RANK = { critical: 3, high: 2, medium: 1, low: 0 } as const;

const lower = (value: string) => value.trim().toLowerCase();

/**
 * The open tasks that belong to the lens. A task belongs when its owner is a Member the lens keeps
 * (`memberInLens`). Unowned tasks and agent run records are in no lens.
 */
export function lensTasks<T extends LensTask>(
  org: WorkspaceOrg,
  lens: TeamLens,
  tasks: ReadonlyArray<T>,
  team: ReadonlyArray<TaskBoardTeamMember>,
): T[] {
  if (!lens) return [];
  const names = new Set(
    org.members
      .filter((member) => member.status !== "removed" && memberInLens(org, lens, member))
      .map((member) => lower(member.name)),
  );
  return tasks.filter((task) => {
    if (!isOpen(task) || isAgentRun(task)) return false;
    const owner = ownerOf(task, team);
    return owner !== null && names.has(lower(owner));
  });
}

export function lensCounts(tasks: ReadonlyArray<Pick<LensTask, "status">>) {
  const count = (status: LensTask["status"]) =>
    tasks.filter((task) => task.status === status).length;
  return {
    todo: count("todo"),
    inProgress: count("in_progress"),
    review: count("review"),
    blocked: count("blocked"),
  };
}

/** The task to focus on: highest priority first, then the most recently updated. */
export function topLensTask<T extends Pick<LensTask, "priority" | "updatedAt">>(
  tasks: ReadonlyArray<T>,
): T | null {
  let best: T | null = null;
  for (const task of tasks) {
    if (
      best === null ||
      PRIORITY_RANK[task.priority] > PRIORITY_RANK[best.priority] ||
      (task.priority === best.priority && task.updatedAt > best.updatedAt)
    ) {
      best = task;
    }
  }
  return best;
}

/** What the Home card shows while a lens is set: the lens counts and its top task as the focus. */
export function lensHome(label: string, tasks: ReadonlyArray<LensTask>) {
  const top = topLensTask(tasks);
  return {
    counts: lensCounts(tasks),
    move: top
      ? { title: top.title, reason: `Top ${top.priority} task for ${label}.` }
      : {
          title: `No open tasks for ${label}`,
          reason: "Pick another Member or clear the filter.",
        },
  };
}

export type AgentWork<T> = {
  readonly state: "working" | "waiting" | "idle";
  readonly task: T | null;
};

/**
 * What an agent Member does now, read from the board. Working: it holds a task in progress or in
 * review (a task that links a chat comes first). Waiting: its open task is blocked.
 */
export function agentWork<T extends LensTask>(
  member: Member,
  tasks: ReadonlyArray<T>,
  team: ReadonlyArray<TaskBoardTeamMember>,
): AgentWork<T> {
  const own = tasks.filter((task) => {
    if (!isOpen(task) || isAgentRun(task)) return false;
    const owner = ownerOf(task, team);
    return owner !== null && lower(owner) === lower(member.name);
  });
  const active = own.filter((task) => task.status === "in_progress" || task.status === "review");
  const working = active.find((task) => task.claimedAgent?.threadId) ?? active[0];
  if (working) return { state: "working", task: working };
  const blocked = own.find((task) => task.status === "blocked");
  return blocked ? { state: "waiting", task: blocked } : { state: "idle", task: null };
}

/** The name shown for a lens; the raw slug when the org no longer has it. */
export function lensLabel(org: WorkspaceOrg, lens: NonNullable<TeamLens>): string {
  const list: ReadonlyArray<{ slug: string; name: string }> =
    lens.kind === "member" ? org.members : lens.kind === "area" ? org.areas : org.departments;
  return list.find((entry) => entry.slug === lens.slug)?.name ?? lens.slug;
}
