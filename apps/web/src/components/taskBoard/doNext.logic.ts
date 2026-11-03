import type { TaskBoardTask } from "@t3tools/contracts";
import { daysUntilDue } from "@t3tools/client-runtime/task-board/daily-planning";

import { isOpen, priorityLabel, priorityRank, taskFlags } from "./taskBoard.logic";

/** How many to-do cards the Next group holds; the rest wait in Later. */
export const NEXT_COUNT = 8;

/** What the do-next order compares, read once per card: due-date parsing is the costly part. */
type DoNextKey = {
  readonly late: boolean;
  readonly soon: number;
  readonly rank: number;
  readonly ratio: number;
  readonly updatedAt: number;
};

function doNextKey(task: TaskBoardTask, now: number): DoNextKey {
  const days = daysUntilDue(task.due, now);
  return {
    late: (days ?? 0) < 0,
    soon: days !== null && days <= 7 ? 0 : 1,
    rank: priorityRank(task.priority),
    ratio: task.checklist?.total ? task.checklist.done / task.checklist.total : 0,
    updatedAt: task.updatedAt,
  };
}

function compareKeys(a: DoNextKey, b: DoNextKey): number {
  return a.soon - b.soon || a.rank - b.rank || b.ratio - a.ratio || b.updatedAt - a.updatedAt;
}

/**
 * The one do-next order every view shares: due within 7 days (or late) first, then priority,
 * then closest to done, then most recently touched.
 */
export function compareDoNext(a: TaskBoardTask, b: TaskBoardTask, now: number): number {
  return compareKeys(doNextKey(a, now), doNextKey(b, now));
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
  const keys = new Map<T, DoNextKey>();
  const keyOf = (task: T) => keys.get(task)!;
  const rank = (a: T, b: T) => compareKeys(keyOf(a), keyOf(b));
  const groups: StateGroups<T> = { now: [], next: [], waiting: [], later: [], closed: [] };
  for (const task of tasks) {
    if (!isOpen(task)) {
      groups.closed.push(task);
      continue;
    }
    const key = doNextKey(task, now);
    keys.set(task, key);
    if (task.status === "in_progress" || key.late) groups.now.push(task);
    else if (task.status === "review" || task.status === "blocked") groups.waiting.push(task);
    else groups.next.push(task);
  }
  groups.now.sort((a, b) => Number(keyOf(b).late) - Number(keyOf(a).late) || rank(a, b));
  groups.waiting.sort(
    (a, b) => Number(b.status === "blocked") - Number(a.status === "blocked") || rank(a, b),
  );
  groups.next.sort(rank);
  groups.later = groups.next.splice(NEXT_COUNT);
  return groups;
}

export type FocusPlan<T> = {
  /** The one card to start with: in-progress work first, else the top of Next. */
  lead: T | null;
  /** The cards after the lead, from Now and then Next. */
  rest: T[];
  /** Sizes of the lists the count tiles open. */
  counts: { now: number; waiting: number; stale: number; noGates: number };
};

/** The Dashboard's Focus section: one card to start, then the rest, from the same groups. */
export function buildFocus<T extends TaskBoardTask>(
  tasks: ReadonlyArray<T>,
  now: number,
  restCount = 5,
): FocusPlan<T> {
  const groups = groupByState(tasks, now);
  const lead =
    groups.now.find((task) => task.status === "in_progress") ??
    groups.next[0] ??
    groups.now[0] ??
    null;
  const open = tasks.filter(isOpen).map((task) => taskFlags(task, now));
  return {
    lead,
    rest: [...groups.now, ...groups.next].filter((task) => task !== lead).slice(0, restCount),
    counts: {
      now: groups.now.length,
      // The Waiting tile opens a review-or-blocked filter, so late ones in Now count too.
      waiting: tasks.filter((task) => task.status === "review" || task.status === "blocked").length,
      stale: open.filter((flags) => flags.stale).length,
      noGates: open.filter((flags) => flags.noGates).length,
    },
  };
}

/** Plain reasons a card ranks where it does, for example "2 d late, High priority, no gates". */
export function whyFirst(task: TaskBoardTask, now: number): string {
  const days = daysUntilDue(task.due, now);
  const due =
    days === null || days > 7
      ? null
      : days < 0
        ? `${-days} d late`
        : days === 0
          ? "due today"
          : `due in ${days} d`;
  const gates = task.checklist?.total
    ? `${task.checklist.done} of ${task.checklist.total} gates done`
    : "no gates";
  return [
    task.status === "in_progress" ? "In progress" : null,
    due,
    `${priorityLabel(task.priority)} priority`,
    gates,
  ]
    .filter((part) => part !== null)
    .join(", ");
}
