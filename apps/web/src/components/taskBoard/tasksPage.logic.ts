import type {
  ProjectId,
  TaskBoardTaskPriority,
  TaskBoardTaskStatus,
  TaskBoardWorkspaceProject,
} from "@t3tools/contracts";

import { inDailyFocus } from "@t3tools/client-runtime/task-board/daily-planning";

import { DEFAULT_OWNER_LENS, parseOwnerLens, type OwnerLens } from "./owner.logic";

import {
  groupBySection,
  isOpen,
  shareableOpenCount,
  type TaskFilters,
  type TaskFlag,
  type TaskSort,
  type TaskView,
} from "./taskBoard.logic";

export type TasksView = "dashboard" | "board" | "table" | "list" | "roadmap";
export type TaskFocus = "all" | "inbox" | "today" | "upcoming";
export type TaskListGroupBy =
  | "state"
  | "owner"
  | "project"
  | "status"
  | "priority"
  | "due"
  | "none";

/** What the Tasks page remembers between visits. The search text is deliberately not kept. */
export type TasksPrefs = {
  view: TasksView;
  /** The selected project section's slug, or null for all tasks. */
  section: string | null;
  focus: TaskFocus;
  statuses: TaskBoardTaskStatus[] | null;
  priorities: TaskBoardTaskPriority[] | null;
  /** Whose tasks the page shows; see `OwnerLens`. */
  owner: OwnerLens;
  sharedOnly: boolean;
  includeClosed: boolean;
  sort: TaskSort;
  groupBy: TaskListGroupBy;
  /** Keep only stale, or only gateless, open cards. */
  flag: TaskFlag | null;
};

// v2: the list now groups by state by default, so older saves start fresh once.
export const TASKS_PREFS_KEY = "leonidas-tasks:prefs:v2";

/** Task-only projects need a stable key without requiring a repository or folder. */
export function taskProjectSlug(name: string): string {
  const slug = name
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
  return slug === "general" ? "general-tasks" : slug;
}

export const DEFAULT_TASKS_PREFS: TasksPrefs = {
  view: "table",
  section: null,
  focus: "inbox",
  statuses: null,
  priorities: null,
  owner: DEFAULT_OWNER_LENS,
  sharedOnly: false,
  includeClosed: false,
  sort: "priority",
  groupBy: "state",
  flag: null,
};

const VIEWS: ReadonlyArray<TasksView> = ["dashboard", "board", "table", "list", "roadmap"];
const GROUP_BYS: ReadonlyArray<TaskListGroupBy> = [
  "state",
  "owner",
  "project",
  "status",
  "priority",
  "due",
  "none",
];
const SORTS: ReadonlyArray<TaskSort> = ["priority", "updated", "due", "title"];
const STATUSES: ReadonlyArray<TaskBoardTaskStatus> = [
  "todo",
  "in_progress",
  "review",
  "blocked",
  "done",
  "parked",
  "retired",
];
const PRIORITIES: ReadonlyArray<TaskBoardTaskPriority> = ["low", "medium", "high", "critical"];

function pick<T extends string>(options: ReadonlyArray<T>, value: unknown, fallback: T): T {
  return typeof value === "string" && (options as ReadonlyArray<string>).includes(value)
    ? (value as T)
    : fallback;
}

function pickList<T extends string>(options: ReadonlyArray<T>, value: unknown): T[] | null {
  if (!Array.isArray(value)) return null;
  const known = value.filter(
    (item): item is T =>
      typeof item === "string" && (options as ReadonlyArray<string>).includes(item),
  );
  return known.length > 0 ? known : null;
}

/** Reads saved preferences, ignoring anything missing, malformed or from an older shape. */
export function parseTasksPrefs(raw: string | null): TasksPrefs {
  if (!raw) return DEFAULT_TASKS_PREFS;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return DEFAULT_TASKS_PREFS;
  }
  if (typeof value !== "object" || value === null) return DEFAULT_TASKS_PREFS;
  const record = value as Record<string, unknown>;
  return {
    view: pick(VIEWS, record.view, DEFAULT_TASKS_PREFS.view),
    section:
      typeof record.section === "string" && record.section.length > 0 ? record.section : null,
    focus: pick(["all", "inbox", "today", "upcoming"] as const, record.focus, "all"),
    statuses: pickList(STATUSES, record.statuses),
    priorities: pickList(PRIORITIES, record.priorities),
    // Older saves kept a "Mine" toggle instead of an owner lens.
    owner:
      record.owner === undefined && record.mine === true ? "mine" : parseOwnerLens(record.owner),
    sharedOnly: record.sharedOnly === true,
    includeClosed: record.includeClosed === true,
    sort: pick(SORTS, record.sort, DEFAULT_TASKS_PREFS.sort),
    groupBy: pick(GROUP_BYS, record.groupBy, DEFAULT_TASKS_PREFS.groupBy),
    flag: record.flag === "stale" || record.flag === "noGates" ? record.flag : null,
  };
}

/**
 * Turns the saved preferences and the live search text into the filter the task logic takes.
 * The board always shows its Done column, so it never hides closed work behind a toggle.
 */
export function toTaskFilters(prefs: TasksPrefs, query: string, now: number): TaskFilters {
  return {
    query,
    statuses: prefs.statuses ? new Set(prefs.statuses) : null,
    priorities: prefs.priorities ? new Set(prefs.priorities) : null,
    sharedOnly: prefs.sharedOnly,
    // A search finds closed cards too; `openFirst` keeps them below the open matches.
    includeClosed: prefs.view === "board" || query.trim().length > 0 ? true : prefs.includeClosed,
    flag: prefs.flag,
    now,
  };
}

/** The page opens on every open task in the Table view; saved sort, grouping and filters stay. */
export function landingPrefs(saved: TasksPrefs): TasksPrefs {
  return { ...saved, view: "table", focus: "all", section: null };
}

/** A search looks through every card, not only the selected lens or project. */
export function searchBase<T>(
  all: ReadonlyArray<T>,
  scoped: ReadonlyArray<T>,
  query: string,
): ReadonlyArray<T> {
  return query.trim() ? all : scoped;
}

/** Open cards first, then closed ones, each group in its existing order. */
export function openFirst(tasks: ReadonlyArray<TaskView>): TaskView[] {
  return [...tasks.filter(isOpen), ...tasks.filter((task) => !isOpen(task))];
}

/** The lists a Dashboard count tile opens. */
export type FocusList = "now" | "waiting" | TaskFlag;

/** A count tile opens the Table, grouped by state, with only that list's filter set. */
export function prefsForList(list: FocusList): Partial<TasksPrefs> {
  return {
    view: "table",
    groupBy: "state",
    statuses: list === "waiting" ? ["review", "blocked"] : null,
    priorities: null,
    sharedOnly: false,
    flag: list === "stale" || list === "noGates" ? list : null,
  };
}

/** How many filters narrow the list, for the "Clear filters" affordance. */
export function activeFilterCount(prefs: TasksPrefs, query: string): number {
  return (
    Number(query.trim().length > 0) +
    Number(prefs.statuses !== null) +
    Number(prefs.priorities !== null) +
    Number(prefs.sharedOnly) +
    Number(prefs.flag !== null)
  );
}

export type RailEntry = {
  slug: string;
  name: string;
  projectId: ProjectId | null;
  repository: string | null;
  open: number;
  total: number;
};

/**
 * The project rail: every project that has tasks or a Leonidas project behind it, in the server's
 * order, with "No project" last and only when something is unlinked.
 */
export function buildRailEntries(
  tasks: ReadonlyArray<TaskView>,
  projects: ReadonlyArray<TaskBoardWorkspaceProject>,
): RailEntry[] {
  return groupBySection(tasks, projects)
    .filter((group) => group.tasks.length > 0 || group.projectId !== null)
    .map((group) => ({
      slug: group.slug,
      name: group.name,
      projectId: group.projectId,
      repository: group.repository,
      open: group.open,
      total: group.tasks.length,
    }));
}

/** The rail in its own order, with hidden projects moved into "More". */
export function splitRail(
  entries: ReadonlyArray<RailEntry>,
  hidden: ReadonlyArray<string>,
): { shown: RailEntry[]; hidden: RailEntry[] } {
  const set = new Set(hidden);
  return {
    shown: entries.filter((entry) => !set.has(entry.slug)),
    hidden: entries.filter((entry) => set.has(entry.slug)),
  };
}

/** The hidden list after one project is hidden or shown. */
export function nextHidden(hidden: ReadonlyArray<string>, slug: string, hide: boolean): string[] {
  const rest = hidden.filter((item) => item !== slug);
  return hide ? [...rest, slug] : rest;
}

export type SectionShareState =
  | { kind: "hidden" }
  | { kind: "share"; count: number }
  | { kind: "shared" }
  | { kind: "unavailable"; reason: string };

/**
 * What the share strip above a project's tasks should say. Sharing needs the AIOS project to be
 * set up in Leonidas Code and to have a GitHub repository; without one the strip says why.
 */
export function sectionShareState(
  entry: RailEntry | null,
  tasks: ReadonlyArray<TaskView>,
): SectionShareState {
  if (!entry || entry.slug === "general") return { kind: "hidden" };
  if (entry.projectId === null) {
    return {
      kind: "unavailable",
      reason: "Share tasks by linking them to a project connected to GitHub.",
    };
  }
  if (!entry.repository) {
    return {
      kind: "unavailable",
      reason: "Sharing is unavailable: connect this project to a GitHub repository first.",
    };
  }
  const count = shareableOpenCount(tasks, entry.slug);
  if (count > 0) return { kind: "share", count };
  const hasShared = tasks.some((task) => task.section === entry.slug && task.shared === true);
  return hasShared ? { kind: "shared" } : { kind: "hidden" };
}

/** Tasks that belong to one section, or all of them when `slug` is null. */
export function tasksInSection(tasks: ReadonlyArray<TaskView>, slug: string | null): TaskView[] {
  return slug === null ? [...tasks] : tasks.filter((task) => task.section === slug);
}

/** Daily views use calendar days in the viewer's timezone; Today includes overdue work. */
export function tasksInFocus(
  tasks: ReadonlyArray<TaskView>,
  focus: TaskFocus,
  now: number,
  includeClosed = false,
): TaskView[] {
  if (focus === "all") return [...tasks];
  return tasks.filter((task) => inDailyFocus(task, focus, now, includeClosed));
}

/**
 * Cards that exist only on a project's shared board carry the board's own project name, which may
 * not slug to the AIOS project they were fetched for. They are placed in that project's section.
 */
export function placeSharedOnlyIn(tasks: ReadonlyArray<TaskView>, slug: string): TaskView[] {
  return tasks.map((task) => (task.origin === "shared" ? { ...task, section: slug } : task));
}
