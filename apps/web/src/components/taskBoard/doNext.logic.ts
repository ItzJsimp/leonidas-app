import type { TaskBoardTask } from "@t3tools/contracts";
import { daysUntilDue } from "@t3tools/client-runtime/task-board/daily-planning";

import { isOpen, priorityRank } from "./taskBoard.logic";

/** How many to-do cards the Next group holds; the rest wait in Later. */
export const NEXT_COUNT = 8;

function isLate(task: Pick<TaskBoardTask, "due">, now: number): boolean {
  return (daysUntilDue(task.due, now) ?? 0) < 0;
}

function gateRatio(task: Pick<TaskBoardTask, "checklist">): number {
  return task.checklist?.total ? task.checklist.done / task.checklist.total : 0;
}

/**
 * The one do-next order every view shares: due within 7 days (or late) first, then priority,
 * then closest to done, then most recently touched.
 */
export function compareDoNext(a: TaskBoardTask, b: TaskBoardTask, now: number): number {
  const soon = (task: TaskBoardTask) => {
    const days = daysUntilDue(task.due, now);
    return days !== null && days <= 7 ? 0 : 1;
  };
  return (
    soon(a) - soon(b) ||
    priorityRank(a.priority) - priorityRank(b.priority) ||
    gateRatio(b) - gateRatio(a) ||
    b.updatedAt - a.updatedAt
  );
}

export type StateGroups<T> = {
  /** In progress or past due, late first. */
  now: T[];
  /** The top to-do cards. */
  next: T[];
  /** In review or blocked, blocked first. */
  waiting: T[];
  /** Every other to-do card. */
  later: T[];
  /** Done, parked and retired, in their incoming order. */
  closed: T[];
};

/** Splits cards by what to do with them next; open groups use the do-next order. */
export function groupByState<T extends TaskBoardTask>(
  tasks: ReadonlyArray<T>,
  now: number,
): StateGroups<T> {
  const rank = (a: T, b: T) => compareDoNext(a, b, now);
  const groups: StateGroups<T> = { now: [], next: [], waiting: [], later: [], closed: [] };
  for (const task of tasks) {
    if (!isOpen(task)) groups.closed.push(task);
    else if (task.status === "in_progress" || isLate(task, now)) groups.now.push(task);
    else if (task.status === "review" || task.status === "blocked") groups.waiting.push(task);
    else groups.next.push(task);
  }
  groups.now.sort((a, b) => Number(isLate(b, now)) - Number(isLate(a, now)) || rank(a, b));
  groups.waiting.sort(
    (a, b) => Number(b.status === "blocked") - Number(a.status === "blocked") || rank(a, b),
  );
  groups.next.sort(rank);
  groups.later = groups.next.splice(NEXT_COUNT);
  return groups;
}

/** The Dashboard's short list: open work that is not blocked, in do-next order. */
export function nextUpTasks<T extends TaskBoardTask>(
  tasks: ReadonlyArray<T>,
  now: number,
  limit = 5,
): T[] {
  return tasks
    .filter((task) => isOpen(task) && task.status !== "blocked")
    .toSorted((a, b) => compareDoNext(a, b, now))
    .slice(0, limit);
}
