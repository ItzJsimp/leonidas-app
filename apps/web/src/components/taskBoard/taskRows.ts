import type {
  TaskBoardAgent,
  TaskBoardTaskStatus,
  TaskBoardTeamMember,
  TaskBoardWorkspaceProject,
} from "@t3tools/contracts";

import { groupByState, type StateGroups } from "./doNext.logic";
import { ownerOf } from "./owner.logic";
import {
  groupByStatus,
  isOpen,
  statusLabel,
  type TaskSectionGroup,
  type TaskView,
} from "./taskBoard.logic";

/** The Done column renders this many cards until the user asks for more. */
export const DONE_COLUMN_PAGE = 25;
/** Cards an open board column shows before "Show more"; keeps a 400-card board light to open. */
export const COLUMN_PAGE = 40;

/** Dot colour per status, from semantic tokens only. */
const STATUS_DOT_CLASS: Record<TaskBoardTaskStatus, string> = {
  todo: "bg-muted-foreground/50",
  in_progress: "bg-info",
  review: "bg-warning",
  blocked: "bg-destructive",
  done: "bg-success",
  parked: "bg-muted-foreground/30",
  retired: "bg-muted-foreground/30",
};

export function statusDotClass(status: TaskBoardTaskStatus): string {
  return STATUS_DOT_CLASS[status];
}

/** Statuses a card can be moved to from the board (the five columns). */
const BOARD_STATUSES: ReadonlyArray<TaskBoardTaskStatus> = [
  "todo",
  "in_progress",
  "review",
  "blocked",
  "done",
];

/** The status a card takes when dropped on a column, or null when it is already there. */
export function statusChangeForDrop(
  task: Pick<TaskView, "status">,
  target: TaskBoardTaskStatus,
): TaskBoardTaskStatus | null {
  return task.status === target ? null : target;
}

/** Columns offered by the "Move to" menu for a card in `current`. */
export function moveTargets(current: TaskBoardTaskStatus): TaskBoardTaskStatus[] {
  return BOARD_STATUSES.filter((status) => status !== current);
}

/** Most recently updated first; `hidden` is how many fell off the end. */
export function capByRecency<T extends { updatedAt: number }>(
  tasks: ReadonlyArray<T>,
  limit: number,
): { visible: T[]; hidden: number } {
  const sorted = tasks.toSorted((a, b) => b.updatedAt - a.updatedAt);
  return { visible: sorted.slice(0, limit), hidden: Math.max(0, sorted.length - limit) };
}

/**
 * The cards one board column shows: Done keeps its newest cards; other columns keep their order.
 * `extra` is how many more cards the user asked for with "Show more".
 */
export function pageColumn<T extends { updatedAt: number }>(
  status: string,
  tasks: ReadonlyArray<T>,
  extra: number,
): { visible: T[]; hidden: number; page: number } {
  if (status === "done")
    return { ...capByRecency(tasks, DONE_COLUMN_PAGE + extra), page: DONE_COLUMN_PAGE };
  const limit = COLUMN_PAGE + extra;
  return {
    visible: tasks.slice(0, limit),
    hidden: Math.max(0, tasks.length - limit),
    page: COLUMN_PAGE,
  };
}

/** slug -> display name, built once per render of a view instead of searching per card. */
export function projectNameIndex(
  projects: ReadonlyArray<TaskBoardWorkspaceProject>,
): ReadonlyMap<string, string> {
  return new Map(projects.map((project) => [project.slug, project.name]));
}

/** Project chip text, or null for cards that belong to no project. */
export function projectNameFor(
  task: Pick<TaskView, "section" | "project">,
  names: ReadonlyMap<string, string>,
): string | null {
  const known = names.get(task.section);
  if (known) return known;
  return task.section === "general" ? null : task.project;
}

/** How the board names work nobody owns yet. */
const ANYONE_LABEL = "Anyone";

export function agentLabel(agent: TaskBoardAgent | null | undefined): string | null {
  return agent?.model ?? agent?.providerInstanceId ?? null;
}

export function nameInitial(name: string): string {
  const letter = name.trim().charAt(0);
  return letter.length > 0 ? letter.toUpperCase() : "?";
}

export function sameMember(a: string | null | undefined, b: string): boolean {
  return a != null && a.trim().toLowerCase() === b.trim().toLowerCase();
}

export type ListGroup = {
  key: string;
  /** Null for the flat list, which renders no header. */
  label: string | null;
  count: number;
  /** Shown beside the label for project sections. */
  openCount: number | null;
  tasks: ReadonlyArray<TaskView>;
  defaultOpen: boolean;
  /** What puts a card in this group, shown muted after the count. */
  hint?: string;
};

const STATE_GROUPS: ReadonlyArray<{
  key: keyof StateGroups<TaskView>;
  label: string;
  hint: string;
  defaultOpen: boolean;
}> = [
  { key: "now", label: "Now", hint: "In progress or past due", defaultOpen: true },
  {
    key: "next",
    label: "Next",
    hint: "Top to do: due soon, then priority, then closest to done",
    defaultOpen: true,
  },
  { key: "waiting", label: "Waiting", hint: "In review or blocked", defaultOpen: true },
  { key: "later", label: "Later", hint: "Other open work", defaultOpen: false },
  { key: "closed", label: "Closed", hint: "Done, parked or retired", defaultOpen: true },
];

/** Turns the page's tasks and sections into the groups the list renders, empty groups dropped. */
export function buildListGroups(input: {
  tasks: ReadonlyArray<TaskView>;
  sections: ReadonlyArray<TaskSectionGroup>;
  groupBy: "state" | "owner" | "project" | "status" | "none";
  /** Needed to group by owner: maps logins to team names. */
  team?: ReadonlyArray<TaskBoardTeamMember>;
  /** Needed to group by state: due dates compare against this time. */
  now?: number;
}): ListGroup[] {
  const { tasks, sections, groupBy } = input;
  if (groupBy === "state") {
    const state = groupByState(tasks, input.now ?? Date.now());
    return STATE_GROUPS.filter((group) => state[group.key].length > 0).map((group) => ({
      key: `state:${group.key}`,
      label: group.label,
      hint: group.hint,
      count: state[group.key].length,
      openCount: null,
      tasks: state[group.key],
      defaultOpen: group.defaultOpen,
    }));
  }
  if (groupBy === "owner") {
    // Teammates in roster order, then other owners as they appear, then unowned work last.
    const team = input.team ?? [];
    const byOwner = new Map<string, TaskView[]>(team.map((member) => [member.name, []] as const));
    const anyone: TaskView[] = [];
    for (const task of tasks) {
      const owner = ownerOf(task, team);
      if (owner === null) anyone.push(task);
      else byOwner.set(owner, [...(byOwner.get(owner) ?? []), task]);
    }
    return [...byOwner, [ANYONE_LABEL, anyone] as const]
      .filter(([, members]) => members.length > 0)
      .map(([name, members]) => ({
        key: `owner:${name}`,
        label: name,
        count: members.length,
        openCount: members.filter(isOpen).length,
        tasks: members,
        defaultOpen: true,
      }));
  }
  if (groupBy === "none") {
    return tasks.length === 0
      ? []
      : [
          {
            key: "all",
            label: null,
            count: tasks.length,
            openCount: null,
            tasks,
            defaultOpen: true,
          },
        ];
  }
  if (groupBy === "project") {
    return sections
      .filter((section) => section.tasks.length > 0)
      .map((section) => ({
        key: `section:${section.slug}`,
        label: section.name,
        count: section.tasks.length,
        openCount: section.open,
        tasks: section.tasks,
        defaultOpen: true,
      }));
  }
  const columns = groupByStatus(tasks).map((column) => ({ ...column, defaultOpen: true }));
  const closed = (["parked", "retired"] as const).map((status) => ({
    status,
    tasks: tasks.filter((task) => task.status === status),
    defaultOpen: false,
  }));
  return [...columns, ...closed]
    .filter((group) => group.tasks.length > 0)
    .map((group) => ({
      key: `status:${group.status}`,
      label: statusLabel(group.status),
      count: group.tasks.length,
      openCount: isOpen({ status: group.status }) ? group.tasks.length : null,
      tasks: group.tasks,
      defaultOpen: group.defaultOpen,
    }));
}

export function isGroupExpanded(group: ListGroup, overrides: Readonly<Record<string, boolean>>) {
  return overrides[group.key] ?? group.defaultOpen;
}

/** One row of the flat, virtualized list: a group header or a task. */
export type ListItem =
  | { readonly kind: "header"; readonly key: string; readonly group: ListGroup }
  | { readonly kind: "task"; readonly key: string; readonly task: TaskView };

/** Flattens groups into list rows; collapsed groups keep only their header. */
export function flattenGroups(
  groups: ReadonlyArray<ListGroup>,
  overrides: Readonly<Record<string, boolean>>,
): ReadonlyArray<ListItem> {
  const items: ListItem[] = [];
  for (const group of groups) {
    if (group.label !== null) items.push({ kind: "header", key: `group:${group.key}`, group });
    if (!isGroupExpanded(group, overrides)) continue;
    for (const task of group.tasks) items.push({ kind: "task", key: task.id, task });
  }
  return items;
}

/** Task ids in on-screen order, skipping collapsed groups, for arrow-key navigation. */
export function visibleTaskIds(
  groups: ReadonlyArray<ListGroup>,
  overrides: Readonly<Record<string, boolean>>,
): string[] {
  return groups.flatMap((group) =>
    isGroupExpanded(group, overrides) ? group.tasks.map((task) => task.id) : [],
  );
}

export type ListNavigationKey = "ArrowDown" | "ArrowUp" | "Home" | "End";

/** The id the key moves to, clamped at the ends; null for an empty list. */
export function nextTaskId(
  ids: ReadonlyArray<string>,
  currentId: string | null,
  key: ListNavigationKey,
): string | null {
  if (ids.length === 0) return null;
  if (key === "Home") return ids[0]!;
  if (key === "End") return ids[ids.length - 1]!;
  const index = currentId === null ? -1 : ids.indexOf(currentId);
  if (index === -1) return key === "ArrowDown" ? ids[0]! : ids[ids.length - 1]!;
  const next = key === "ArrowDown" ? index + 1 : index - 1;
  return ids[Math.min(ids.length - 1, Math.max(0, next))]!;
}
