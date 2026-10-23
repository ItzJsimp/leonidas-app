import type {
  TaskBoardTaskPriority,
  TaskBoardTaskStatus,
  TaskBoardTeamMember,
  TaskBoardWorkspaceProject,
} from "@t3tools/contracts";

import type { AreaOption } from "./privateArea.logic";
import type { TaskView, TriageSuggestion } from "./taskBoard.logic";

/** Everything the Tasks views need to render and act on tasks, supplied by `TasksPage`. */
export type TaskContext = {
  readonly member: string;
  /** The viewer's team name, and the roster that maps logins to names. */
  readonly viewer: string;
  readonly team: ReadonlyArray<TaskBoardTeamMember>;
  readonly now: number;
  readonly aiosRoot: string | null;
  readonly projects: ReadonlyArray<TaskBoardWorkspaceProject>;
  /** The Areas a task can be private in. Empty outside a business workspace. */
  readonly areas: ReadonlyArray<AreaOption>;
};

/** Mutations the views can trigger. Every call is fire-and-forget; the page reports failures and refreshes. */
export type TaskActions = {
  readonly canEdit: boolean;
  readonly setStatus: (task: TaskView, status: TaskBoardTaskStatus) => void;
  readonly setPriority: (task: TaskView, priority: TaskBoardTaskPriority) => void;
  readonly setDue: (task: TaskView, due: string | null) => void;
  readonly setMilestone: (task: TaskView, milestone: string | null) => void;
  /** Claims the task for the current member and moves it to in progress. */
  readonly claim: (task: TaskView) => void;
  readonly release: (task: TaskView) => void;
  /** Gives the task to a teammate; `null` makes it available to anyone. */
  readonly setAssignee: (task: TaskView, assignee: string | null) => void;
  /** Makes the task private in an Area (Home keeps a masked row); `null` makes it public. */
  readonly setPrivateArea: (task: TaskView, area: string | null) => void;
  /** `null` unlinks the task from its project. */
  readonly linkProject: (task: TaskView, slug: string | null) => void;
  /** Publishes the task to (or withdraws it from) its project's shared board. */
  readonly setShared: (task: TaskView, shared: boolean) => void;
  /** Starts a new agent thread for the task, claims it and opens the thread. */
  readonly sendToAgent: (task: TaskView) => void;
  /** Starts one agent thread for several small tasks of the same project and claims them all. */
  readonly sendBatchToAgent: (tasks: ReadonlyArray<TaskView>) => void;
  /** Writes suggested effort and labels onto each card; returns how many cards changed. */
  readonly organize: (
    changes: ReadonlyArray<{ task: TaskView; suggestion: TriageSuggestion }>,
  ) => void;
  readonly addNote: (task: TaskView, note: string) => void;
  /** True while a mutation for this task is in flight. */
  readonly isBusy: (taskId: string) => boolean;
  /** Whether the task's project has a GitHub repository to share through. */
  readonly canShare: (task: TaskView) => boolean;
  /** Whether the task is linked to a project this environment can start an agent in. */
  readonly canSendToAgent: (task: TaskView) => boolean;
};
