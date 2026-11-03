import type {
  ProjectId,
  TaskBoardHistoryEntry,
  TaskBoardTask,
  TaskBoardTaskPriority,
  TaskBoardTaskStatus,
  TaskBoardTeamMember,
  TaskBoardWorkspaceProject,
} from "@t3tools/contracts";
import { daysUntilDue, dueSortKey } from "@t3tools/client-runtime/task-board/daily-planning";

export { formatDue } from "@t3tools/client-runtime/task-board/daily-planning";
import { ownerOf } from "./owner.logic";

export type TaskView = TaskBoardTask & {
  origin: "local" | "shared" | "both";
  section: string;
};

export type TaskTone = "neutral" | "info" | "review" | "danger" | "success" | "muted";
export type TaskSort = "priority" | "updated" | "due" | "title";

const GENERAL_SECTION = "general";
const DAY_MS = 86_400_000;
const STALE_AFTER_DAYS = 21;

const OPEN_STATUSES: ReadonlySet<TaskBoardTaskStatus> = new Set([
  "todo",
  "in_progress",
  "review",
  "blocked",
]);

const PRIORITY_ORDER: ReadonlyArray<TaskBoardTaskPriority> = ["critical", "high", "medium", "low"];

const STATUS_LABELS: Record<TaskBoardTaskStatus, string> = {
  todo: "To do",
  in_progress: "In progress",
  review: "In review",
  blocked: "Blocked",
  done: "Done",
  parked: "Parked",
  retired: "Retired",
};

const STATUS_TONES: Record<TaskBoardTaskStatus, TaskTone> = {
  todo: "neutral",
  in_progress: "info",
  review: "review",
  blocked: "danger",
  done: "success",
  parked: "muted",
  retired: "muted",
};

const PRIORITY_LABELS: Record<TaskBoardTaskPriority, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};

const PRIORITY_TONES: Record<TaskBoardTaskPriority, TaskTone> = {
  critical: "danger",
  high: "review",
  medium: "neutral",
  low: "muted",
};

export function isOpen(task: Pick<TaskBoardTask, "status">): boolean {
  return OPEN_STATUSES.has(task.status);
}

/** Open cards with no change for 21 days are stale; open cards with no "Done when" list have no gates. */
export function taskFlags(
  task: Pick<TaskBoardTask, "status" | "updatedAt" | "checklist">,
  now: number,
): { readonly stale: boolean; readonly noGates: boolean } {
  const open = isOpen(task);
  return {
    stale: open && task.updatedAt < now - STALE_AFTER_DAYS * DAY_MS,
    noGates: open && !task.checklist?.total,
  };
}

export function statusLabel(status: TaskBoardTaskStatus): string {
  return STATUS_LABELS[status];
}

export function statusTone(status: TaskBoardTaskStatus): TaskTone {
  return STATUS_TONES[status];
}

export function priorityLabel(priority: TaskBoardTaskPriority): string {
  return PRIORITY_LABELS[priority];
}

/** Lower is more urgent: critical is 0. */
export function priorityRank(priority: TaskBoardTaskPriority): number {
  return PRIORITY_ORDER.indexOf(priority);
}

export function priorityTone(priority: TaskBoardTaskPriority): TaskTone {
  return PRIORITY_TONES[priority];
}

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug.length > 0 ? slug : GENERAL_SECTION;
}

function sharedSection(task: TaskBoardTask): string {
  const slug = task.projectSlug?.trim();
  return slug && slug.length > 0 ? slug : slugify(task.project);
}

/**
 * Combines the user's own AIOS cards with the cards collaborators published to the shared board.
 * A shared card that mirrors a local card (same source id) collapses into one row marked "both".
 */
export function mergeTasks(
  local: ReadonlyArray<TaskBoardTask>,
  shared: ReadonlyArray<TaskBoardTask>,
): TaskView[] {
  const sharedByCard = new Map<string, TaskBoardTask>();
  const sharedOnly: TaskBoardTask[] = [];
  for (const task of shared) {
    const key = task.source === "aios_card" ? (task.sourceId ?? null) : null;
    if (key !== null) {
      sharedByCard.set(key, task);
    } else {
      sharedOnly.push(task);
    }
  }

  const matched = new Set<string>();
  const views: TaskView[] = [];
  for (const task of local) {
    const key = task.source === "aios_card" ? (task.sourceId ?? task.id) : null;
    const twin = key !== null ? sharedByCard.get(key) : undefined;
    const section = task.projectSlug?.trim() || (twin ? sharedSection(twin) : GENERAL_SECTION);
    if (twin && key !== null) {
      matched.add(key);
      // A collaborator's newer edit on the shared copy (a claim, a status) shows here too; the
      // card's own file fields stay so edits still reach the file.
      const theirs =
        twin.updatedAt > task.updatedAt
          ? {
              title: twin.title,
              status: twin.status,
              priority: twin.priority,
              assignee: twin.assignee ?? task.assignee ?? null,
              claimedBy: twin.claimedBy,
              claimedAt: twin.claimedAt,
              claimedAgent: twin.claimedAgent,
              completedBy: twin.completedBy,
              completedAt: twin.completedAt,
              completionSummary: twin.completionSummary,
              updatedAt: twin.updatedAt,
            }
          : {};
      views.push({
        ...task,
        ...theirs,
        shared: true,
        sharedBy: twin.sharedBy ?? task.sharedBy ?? null,
        origin: "both",
        section,
      });
    } else {
      views.push({ ...task, origin: "local", section });
    }
  }

  for (const [key, task] of sharedByCard) {
    if (matched.has(key)) continue;
    views.push({ ...task, shared: true, origin: "shared", section: sharedSection(task) });
  }
  for (const task of sharedOnly) {
    views.push({ ...task, shared: true, origin: "shared", section: sharedSection(task) });
  }
  return views;
}

export type TaskFilters = {
  query: string;
  statuses: ReadonlySet<TaskBoardTaskStatus> | null;
  priorities: ReadonlySet<TaskBoardTaskPriority> | null;
  sharedOnly: boolean;
  includeClosed: boolean;
  /** Keep only stale, or only gateless, open cards. */
  flag: TaskFlag | null;
  /** The time the stale flag compares against. */
  now: number;
};

export type TaskFlag = "stale" | "noGates";

export const DEFAULT_FILTERS: TaskFilters = {
  query: "",
  statuses: null,
  priorities: null,
  sharedOnly: false,
  includeClosed: false,
  flag: null,
  now: 0,
};

function sameName(a: string | null | undefined, b: string): boolean {
  return a != null && a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * Applies the toolbar filters. Closed tasks (done, parked, retired) stay hidden unless
 * `includeClosed` is set or the status filter asks for that status explicitly.
 */
export function filterTasks<T extends TaskView>(
  tasks: ReadonlyArray<T>,
  filters: TaskFilters,
): T[] {
  const query = filters.query.trim().toLowerCase();
  return tasks.filter((task) => {
    if (filters.statuses !== null) {
      if (!filters.statuses.has(task.status)) return false;
    } else if (!filters.includeClosed && !isOpen(task)) {
      return false;
    }
    if (filters.priorities !== null && !filters.priorities.has(task.priority)) return false;
    if (filters.sharedOnly && task.origin === "local") return false;
    if (filters.flag !== null && !taskFlags(task, filters.now)[filters.flag]) return false;
    if (query.length === 0) return true;
    const haystack = [
      task.title,
      task.description,
      task.claimedBy ?? "",
      task.assignee ?? "",
      task.id,
      ...task.labels,
    ];
    return haystack.some((part) => part.toLowerCase().includes(query));
  });
}

export function sortTasks<T extends TaskBoardTask>(tasks: ReadonlyArray<T>, sort: TaskSort): T[] {
  const byPriority = (a: T, b: T) => priorityRank(a.priority) - priorityRank(b.priority);
  const byUpdated = (a: T, b: T) => b.updatedAt - a.updatedAt;
  const copy = [...tasks];
  switch (sort) {
    case "priority":
      return copy.sort((a, b) => byPriority(a, b) || byUpdated(a, b));
    case "updated":
      return copy.sort(byUpdated);
    case "due":
      return copy.sort((a, b) => {
        const left = dueSortKey(a.due);
        const right = dueSortKey(b.due);
        if (left !== right) return left < right ? -1 : 1;
        return byPriority(a, b) || byUpdated(a, b);
      });
    case "title":
      return copy.sort((a, b) =>
        a.title.localeCompare(b.title, undefined, { sensitivity: "base" }),
      );
  }
}

export type TaskSectionGroup = {
  slug: string;
  name: string;
  projectId: ProjectId | null;
  repository: string | null;
  tasks: TaskView[];
  open: number;
};

function humanizeSlug(slug: string): string {
  const words = slug.replace(/[-_]+/g, " ").trim();
  return words.length > 0 ? words.charAt(0).toUpperCase() + words.slice(1) : slug;
}

/**
 * Groups tasks into project sections. Known projects keep the server's order, unknown slugs follow
 * in first-seen order, and "general" (shown as "No project") is always last.
 */
export function groupBySection(
  tasks: ReadonlyArray<TaskView>,
  projects: ReadonlyArray<TaskBoardWorkspaceProject>,
  options?: { hideEmpty?: boolean },
): TaskSectionGroup[] {
  const bySlug = new Map<string, TaskView[]>();
  for (const task of tasks) {
    const bucket = bySlug.get(task.section);
    if (bucket) bucket.push(task);
    else bySlug.set(task.section, [task]);
  }

  const toGroup = (
    slug: string,
    name: string,
    projectId: ProjectId | null,
    repository: string | null,
  ): TaskSectionGroup => {
    const members = bySlug.get(slug) ?? [];
    return {
      slug,
      name,
      projectId,
      repository,
      tasks: members,
      // Agent-run records are history, not backlog, so they never count as open work.
      open: members.filter((task) => isOpen(task) && task.kind !== "agent_run").length,
    };
  };

  const groups: TaskSectionGroup[] = [];
  const known = new Set<string>();
  for (const project of projects) {
    if (project.slug === GENERAL_SECTION || known.has(project.slug)) continue;
    known.add(project.slug);
    groups.push(toGroup(project.slug, project.name, project.projectId, project.repository));
  }
  for (const [slug, members] of bySlug) {
    if (slug === GENERAL_SECTION || known.has(slug)) continue;
    known.add(slug);
    const name = members[0]?.project ? members[0].project : humanizeSlug(slug);
    groups.push(toGroup(slug, name, null, null));
  }
  groups.push(toGroup(GENERAL_SECTION, "No project", null, null));

  return options?.hideEmpty ? groups.filter((group) => group.tasks.length > 0) : groups;
}

const BOARD_COLUMNS = ["todo", "in_progress", "review", "blocked", "done"] as const;

/** Kanban columns in fixed order; every column is present even when empty. */
export function groupByStatus(
  tasks: ReadonlyArray<TaskView>,
): Array<{ status: TaskBoardTaskStatus; tasks: TaskView[] }> {
  return BOARD_COLUMNS.map((status) => ({
    status,
    tasks: tasks.filter((task) => task.status === status),
  }));
}

function localDayKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

const HISTORY_VERBS: Record<TaskBoardHistoryEntry["action"], string> = {
  created: "Created",
  claimed: "Taken",
  released: "Given back",
  updated: "Updated",
  blocked: "Blocked",
  completed: "Completed",
  reopened: "Reopened",
  imported: "Imported",
  progress: "Progress",
};

function historyText(entry: TaskBoardHistoryEntry): string {
  const verb = HISTORY_VERBS[entry.action];
  const note = entry.note?.trim();
  if (!note) return verb;
  const flat = note.replace(/\s+/g, " ");
  return `${verb}: ${flat.length > 140 ? `${flat.slice(0, 139)}…` : flat}`;
}

function completionTime(task: TaskBoardTask): number {
  return task.completedAt ?? task.updatedAt;
}

export type TaskDashboard = {
  open: number;
  inProgress: number;
  review: number;
  blocked: number;
  doneThisWeek: number;
  overdue: number;
  dueSoon: number;
  unassigned: number;
  mine: number;
  sharedOpen: number;
  byPriority: Record<TaskBoardTaskPriority, number>;
  bySection: Array<{
    slug: string;
    open: number;
    done: number;
    inProgress: number;
    blocked: number;
  }>;
  completionsPerDay: Array<{ day: string; count: number }>;
  staleOpen: TaskView[];
  recentActivity: Array<{ task: TaskView; at: number; actor: string; text: string }>;
};

/** Aggregates every number the overview tab shows. Due dates compare by the local calendar day. */
export function buildDashboard(
  tasks: ReadonlyArray<TaskView>,
  now: number,
  member: string,
  team: ReadonlyArray<TaskBoardTeamMember> = [],
): TaskDashboard {
  const openTasks = tasks.filter(isOpen);
  const weekAgo = now - 7 * DAY_MS;

  const byPriority: Record<TaskBoardTaskPriority, number> = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
  };
  for (const task of openTasks) byPriority[task.priority] += 1;

  const sections = new Map<
    string,
    { slug: string; open: number; done: number; inProgress: number; blocked: number }
  >();
  for (const task of tasks) {
    let row = sections.get(task.section);
    if (!row) {
      row = { slug: task.section, open: 0, done: 0, inProgress: 0, blocked: 0 };
      sections.set(task.section, row);
    }
    if (isOpen(task)) row.open += 1;
    if (task.status === "done") row.done += 1;
    if (task.status === "in_progress") row.inProgress += 1;
    if (task.status === "blocked") row.blocked += 1;
  }

  const days: Array<{ day: string; count: number }> = [];
  const dayIndex = new Map<string, number>();
  const today = new Date(now);
  for (let offset = 13; offset >= 0; offset -= 1) {
    const day = localDayKey(
      new Date(today.getFullYear(), today.getMonth(), today.getDate() - offset),
    );
    dayIndex.set(day, days.length);
    days.push({ day, count: 0 });
  }
  for (const task of tasks) {
    if (task.status !== "done") continue;
    const slot = dayIndex.get(localDayKey(new Date(completionTime(task))));
    if (slot !== undefined) days[slot]!.count += 1;
  }

  const dueDays = (task: TaskBoardTask) => daysUntilDue(task.due, now);
  const staleCutoff = now - STALE_AFTER_DAYS * DAY_MS;

  const recentActivity = tasks
    .flatMap((task) =>
      task.history.map((entry) => ({
        task,
        at: entry.timestamp,
        actor: entry.actor,
        text: historyText(entry),
      })),
    )
    .toSorted((a, b) => b.at - a.at)
    .slice(0, 8);

  return {
    open: openTasks.length,
    inProgress: tasks.filter((task) => task.status === "in_progress").length,
    review: tasks.filter((task) => task.status === "review").length,
    blocked: tasks.filter((task) => task.status === "blocked").length,
    doneThisWeek: tasks.filter(
      (task) =>
        task.status === "done" && completionTime(task) >= weekAgo && completionTime(task) <= now,
    ).length,
    overdue: openTasks.filter((task) => (dueDays(task) ?? 0) < 0).length,
    dueSoon: openTasks.filter((task) => {
      const days = dueDays(task);
      return days !== null && days >= 0 && days <= 7;
    }).length,
    unassigned: openTasks.filter((task) => ownerOf(task, team) === null).length,
    mine: openTasks.filter((task) => sameName(ownerOf(task, team), member)).length,
    sharedOpen: openTasks.filter((task) => task.origin !== "local").length,
    byPriority,
    bySection: [...sections.values()],
    completionsPerDay: days,
    staleOpen: openTasks
      .filter((task) => task.updatedAt < staleCutoff)
      .toSorted((a, b) => a.updatedAt - b.updatedAt)
      .slice(0, 5),
    recentActivity,
  };
}

const PROMPT_DESCRIPTION_LIMIT = 1_400;
const PROMPT_ITEM_LIMIT = 80;
const PROMPT_LIST_LIMIT = 4;

function clip(value: string, limit: number): string {
  return value.length > limit ? `${value.slice(0, limit - 1)}…` : value;
}

function cardPath(aiosRoot: string | null, sourceFile: string | null): string | null {
  if (!aiosRoot || !sourceFile) return null;
  return `${aiosRoot.replace(/[\\/]+$/, "")}/tasks/${sourceFile}`;
}

/**
 * The first message sent to an agent that picks up a task. Plain text, kept under about 2,500
 * characters so long descriptions are clipped rather than flooding the thread.
 */
export function buildTaskPrompt(
  task: TaskBoardTask,
  ctx: { aiosRoot: string | null; member: string },
): string {
  const lines: string[] = [
    `You are picking up task ${task.id}: ${clip(task.title, 200)}.`,
    `Priority: ${task.priority}. Requested by: ${ctx.member}.`,
  ];

  const path = cardPath(task.sourceRoot ?? ctx.aiosRoot, task.sourceFile);
  if (path) lines.push(`Task card: ${path}`);
  if (task.due) lines.push(`Due: ${task.due}`);
  if (task.milestone) lines.push(`Release milestone: V${task.milestone}.`);
  if (task.checklist && task.checklist.total > 0) {
    lines.push(`Checklist progress: ${task.checklist.done} of ${task.checklist.total} done.`);
  }

  const startFiles = (task.startFiles ?? []).filter((file) => file.trim().length > 0);
  if (startFiles.length > 0) {
    lines.push(
      "Start with these files:",
      ...startFiles.slice(0, PROMPT_LIST_LIMIT).map((file) => `- ${clip(file, PROMPT_ITEM_LIMIT)}`),
    );
  }

  const blockers = (task.blockedBy ?? []).filter((item) => item.trim().length > 0);
  if (blockers.length > 0) {
    lines.push(
      "Blocked by (check these before starting):",
      ...blockers.slice(0, PROMPT_LIST_LIMIT).map((item) => `- ${clip(item, PROMPT_ITEM_LIMIT)}`),
    );
  }

  const verify = task.verify?.trim();
  if (verify) lines.push(`Verify with: ${clip(verify, 200)}`);

  lines.push(
    "",
    "You keep this card current yourself; the user should never have to update or close it. Use the board_task_update tool (task id above):",
    "1. Set the card status to in_progress when you start.",
    "2. Add a note on each meaningful step of progress.",
    "3. When finished, set the status to review (or done if nothing needs a human check) and put the verification result in the note.",
  );

  const rest = lines.join("\n");
  const description = task.description.trim();
  if (description.length === 0) return rest;

  const budget = Math.max(200, Math.min(PROMPT_DESCRIPTION_LIMIT, 2_450 - rest.length));
  const body =
    description.length > budget
      ? `${description.slice(0, budget - 1).trimEnd()}…\n(Description truncated. Read the full task card for the rest.)`
      : description;
  const [head, ...tail] = lines;
  return [head, "", "Description and done-when criteria:", body, "", ...tail].join("\n");
}

export type TriageSuggestion = {
  readonly effort?: "Low" | "Medium" | "High";
  /** The card's full tag list, existing tags first. */
  readonly labels?: ReadonlyArray<string>;
};

const LABEL_RULES: ReadonlyArray<readonly [string, RegExp]> = [
  ["bug", /\b(bug|fix|broken|crash|error|regression|fails?)\b/i],
  ["docs", /\b(docs?|documentation|readme|guide|changelog)\b/i],
  ["ui", /\b(ui|ux|design|layout|screen|button|style|theme|visual)\b/i],
  ["tests", /\b(tests?|coverage|e2e|verify)\b/i],
  ["security", /\b(security|auth|credential|secret|token|permission)\b/i],
  ["release", /\b(release|launch|publish|installer|update)\b/i],
  ["research", /\b(research|investigate|compare|evaluate|explore)\b/i],
];

/**
 * Plain-rule triage for a card: fills a missing effort from `taskSize` and adds topic labels
 * matched on the title and description. Never removes or overrides what the card already has.
 * Returns null when there is nothing to add.
 */
export function suggestTriage(task: TaskBoardTask): TriageSuggestion | null {
  const effort = (task.effort ?? "").trim()
    ? undefined
    : ({ small: "Low", medium: "Medium", large: "High" } as const)[taskSize(task)];
  const text = `${task.title} ${task.description.slice(0, 600)}`;
  const have = new Set(task.labels.map((label) => label.toLowerCase()));
  const added = LABEL_RULES.filter(([name, rule]) => !have.has(name) && rule.test(text)).map(
    ([name]) => name,
  );
  if (!effort && added.length === 0) return null;
  return {
    ...(effort ? { effort } : {}),
    ...(added.length > 0 ? { labels: [...task.labels, ...added] } : {}),
  };
}

const QUICK_BATCH_MAX = 5;
const QUICK_EFFORTS: ReadonlySet<string> = new Set(["low", "small", "xs", "s"]);

export type TaskSize = "small" | "medium" | "large";

const BIG_WORDS =
  /\b(redesign|refactor|migrate|architecture|rewrite|integrate|launch|implement)\b/i;

/**
 * Sizes a task. A card's own effort wins; otherwise plain rules on description length,
 * checklist size, start files and a few big-job words decide. No AI involved.
 */
export function taskSize(task: TaskBoardTask): TaskSize {
  const effort = (task.effort ?? "").trim().toLowerCase();
  if (QUICK_EFFORTS.has(effort)) return "small";
  if (effort === "high" || effort === "large" || effort === "l") return "large";
  if (effort) return "medium";

  const length = task.description.trim().length;
  const checklist = task.checklist?.total ?? 0;
  const files = (task.startFiles ?? []).length;
  if (length > 1_200 || checklist > 8 || files > 5 || BIG_WORDS.test(task.title)) return "large";
  if (length <= 300 && checklist <= 3 && files <= 2) return "small";
  return "medium";
}

/** A small, unblocked, unclaimed to-do that is cheap enough to share an agent with others. */
function isQuickTask(task: TaskView): boolean {
  return (
    task.status === "todo" &&
    !task.claimedBy &&
    (task.blockedBy ?? []).length === 0 &&
    taskSize(task) === "small"
  );
}

export type QuickBatch = { readonly section: string; readonly tasks: ReadonlyArray<TaskView> };

/**
 * Groups quick tasks by project (an agent works in one project), highest priority first,
 * in batches of at most `QUICK_BATCH_MAX`. A lone leftover is not worth a batch.
 */
export function pickQuickBatches(tasks: ReadonlyArray<TaskView>): QuickBatch[] {
  const bySection = new Map<string, TaskView[]>();
  for (const task of tasks) {
    if (!isQuickTask(task) || task.section === GENERAL_SECTION) continue;
    bySection.set(task.section, [...(bySection.get(task.section) ?? []), task]);
  }
  const batches: QuickBatch[] = [];
  for (const [section, group] of bySection) {
    const ranked = group.toSorted(
      (a, b) => PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority),
    );
    for (let i = 0; i < ranked.length; i += QUICK_BATCH_MAX) {
      const chunk = ranked.slice(i, i + QUICK_BATCH_MAX);
      if (chunk.length >= 2) batches.push({ section, tasks: chunk });
    }
  }
  return batches.toSorted((a, b) => b.tasks.length - a.tasks.length);
}

/** One prompt that asks a single agent to work through several small tasks in order. */
export function buildBatchPrompt(
  tasks: ReadonlyArray<TaskBoardTask>,
  ctx: { aiosRoot: string | null; member: string },
): string {
  return [
    `You have ${tasks.length} small tasks to complete in one session. Do them one at a time, in order. Finish each one and update its card with board_task_update (in progress when you start, a note on progress, then done once verified or review if a person must check) before starting the next. You keep every card current yourself; the user should never have to update or close one. Stop to ask only if a task is genuinely unclear.`,
    ...tasks.map(
      (task, index) =>
        `\n--- Task ${index + 1} of ${tasks.length} ---\n${buildTaskPrompt(task, ctx)}`,
    ),
  ].join("\n");
}

/** Short "5m ago" style age, falling back to a calendar date after about four weeks. */
export function relativeTime(ms: number, now: number): string {
  const diff = now - ms;
  if (diff < 60_000) return "just now";
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks} wk ago`;
  const date = new Date(ms);
  const sameYear = date.getFullYear() === new Date(now).getFullYear();
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

/** Open cards in a section that are not yet published to the shared board. */
export function shareableOpenCount(tasks: ReadonlyArray<TaskView>, slug: string): number {
  return tasks.filter(
    (task) =>
      task.section === slug && isOpen(task) && task.origin === "local" && task.shared !== true,
  ).length;
}
