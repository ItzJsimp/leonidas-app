import type { TaskBoardTask, TaskBoardTaskPriority, TaskBoardTaskStatus } from "@t3tools/contracts";

/**
 * Practice project: sample tasks that live only in the browser, so people can try the Tasks page
 * (sending to an agent, batching, organizing) without touching real cards, GitHub or agents.
 */
export const PRACTICE_SLUG = "practice";
export const PRACTICE_NAME = "Practice (sample tasks)";

const DAY = 86_400_000;

type Seed = {
  readonly title: string;
  readonly description: string;
  readonly priority: TaskBoardTaskPriority;
  readonly effort: string | null;
  readonly lane: string;
  readonly status?: TaskBoardTaskStatus;
  readonly verify?: string;
  readonly blockedBy?: ReadonlyArray<string>;
};

const SEEDS: ReadonlyArray<Seed> = [
  {
    title: "Fix the typo on the pricing page",
    description: "The word 'recieve' appears twice in the FAQ. Correct the spelling.",
    priority: "high",
    effort: "Low",
    lane: "mob",
    verify: "Search the page for 'recieve' and find nothing.",
  },
  {
    title: "Rename the Save button to Save changes",
    description: "Use the longer label on the settings form so it matches the rest of the app.",
    priority: "medium",
    effort: "Low",
    lane: "mob",
  },
  {
    title: "Add a tooltip to the sync icon",
    description: "Hovering the sync icon should say when the last sync happened.",
    priority: "medium",
    effort: "Low",
    lane: "mob",
  },
  {
    title: "Remove an unused import in the login screen",
    description: "The linter warns about one unused import. Delete it.",
    priority: "low",
    effort: "Low",
    lane: "mob",
  },
  {
    title: "Update the empty state copy on the inbox",
    description: "Say 'You're all caught up' instead of 'No items'.",
    priority: "low",
    effort: "Low",
    lane: "jake",
  },
  {
    title: "Build a weekly summary email",
    description:
      "Collect finished tasks per project and send a short plain-text summary every Monday. Include a count of tasks done, in review and blocked, plus the three oldest open items.",
    priority: "high",
    effort: "Medium",
    lane: "mob",
    verify: "Run the summary against sample data and read the output.",
  },
  {
    title: "Design the new onboarding checklist",
    description: "Decide what the first-run checklist looks like and what it says.",
    priority: "high",
    effort: "Medium",
    lane: "jake",
  },
  {
    title: "Ship the export feature",
    description: "Export tasks as CSV. Waiting on the file-format decision.",
    priority: "medium",
    effort: "High",
    lane: "mob",
    status: "blocked",
    blockedBy: ["Decide the CSV columns"],
  },
  {
    title: "Set up the practice project",
    description: "This one is already done, so you can see what a finished task looks like.",
    priority: "low",
    effort: "Low",
    lane: "jake",
    status: "done",
  },
];

/** The starting set of practice tasks, ready to reset to at any time. */
export function practiceSeed(now: number): TaskBoardTask[] {
  return SEEDS.map((seed, index): TaskBoardTask => {
    const status = seed.status ?? "todo";
    return {
      id: `practice-${index + 1}`,
      project: PRACTICE_NAME,
      projectSlug: PRACTICE_SLUG,
      title: seed.title,
      description: seed.description,
      status,
      priority: seed.priority,
      claimedBy: null,
      claimedAt: null,
      claimedAgent: null,
      completedBy: status === "done" ? "You" : null,
      completedAt: status === "done" ? now - DAY : null,
      completionSummary: null,
      createdAt: now - (index + 1) * DAY,
      updatedAt: now - index * 3_600_000,
      labels: [`lane:${seed.lane}`],
      source: "board",
      effort: seed.effort,
      verify: seed.verify ?? null,
      blockedBy: seed.blockedBy ?? [],
      sourceId: null,
      sourceFile: null,
      issueUrl: null,
      history: [],
    };
  });
}

export type PracticePatch = {
  readonly status?: TaskBoardTaskStatus;
  readonly priority?: TaskBoardTaskPriority;
  readonly due?: string | null;
  readonly milestone?: string | null;
  readonly claimedBy?: string | null;
  readonly assignee?: string | null;
  readonly effort?: string | null;
  readonly labels?: ReadonlyArray<string>;
  readonly note?: string;
};

/** Applies an edit to a practice task, keeping its history like a real card does. */
export function applyPracticePatch(
  task: TaskBoardTask,
  patch: PracticePatch,
  actor: string,
  now: number,
): TaskBoardTask {
  const { note, ...fields } = patch;
  const next: TaskBoardTask = {
    ...task,
    ...(fields.status !== undefined ? { status: fields.status } : {}),
    ...(fields.priority !== undefined ? { priority: fields.priority } : {}),
    ...(fields.due !== undefined ? { due: fields.due } : {}),
    ...(fields.milestone !== undefined ? { milestone: fields.milestone } : {}),
    ...(fields.claimedBy !== undefined
      ? { claimedBy: fields.claimedBy, claimedAt: fields.claimedBy ? now : null }
      : {}),
    ...(fields.assignee !== undefined ? { assignee: fields.assignee } : {}),
    ...(fields.effort !== undefined ? { effort: fields.effort } : {}),
    ...(fields.labels !== undefined ? { labels: fields.labels } : {}),
    updatedAt: now,
  };
  const done = next.status === "done";
  const text =
    note ?? (patch.status ? `Status changed to ${patch.status.replace("_", " ")}` : null);
  return {
    ...next,
    completedAt: done ? (task.completedAt ?? now) : null,
    completedBy: done ? (task.completedBy ?? actor) : null,
    history: text
      ? [
          ...task.history,
          {
            id: `${task.id}-${now}`,
            taskId: task.id,
            action: "progress",
            actor,
            timestamp: now,
            note: text,
          },
        ]
      : task.history,
  };
}

export type PracticeDryRun = {
  readonly tasks: ReadonlyArray<TaskBoardTask>;
  readonly prompt: string;
};
