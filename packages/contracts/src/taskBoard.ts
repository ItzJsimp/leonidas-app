import * as Schema from "effect/Schema";
import { PositiveInt, ProjectId, TrimmedNonEmptyString } from "./baseSchemas.ts";
import { ProviderOptionSelections } from "./model.ts";

/** A calendar day, without a timezone or time of day. */
export const TaskBoardDueDate = Schema.String.check(
  Schema.isPattern(/^\d{4}-\d{2}-\d{2}$/),
  Schema.makeFilter(
    (value) => {
      const [year = 0, month = 0, day = 0] = value.split("-").map(Number);
      const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
      const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
      return year > 0 && day >= 1 && day <= (days[month - 1] ?? 0);
    },
    { expected: "a valid calendar date (YYYY-MM-DD)" },
  ),
);

/** Numeric semantic version without a prerelease or build suffix. */
export const TaskBoardMilestoneVersion = Schema.String.check(
  Schema.isPattern(/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/),
);

// "review" is a card's Awaiting Review, "parked" its Dormant, "retired" its Retired. Parked and
// retired work stays readable but is hidden from the open queue.
export const TaskBoardTaskStatus = Schema.Literals([
  "todo",
  "in_progress",
  "review",
  "blocked",
  "done",
  "parked",
  "retired",
]);
export type TaskBoardTaskStatus = typeof TaskBoardTaskStatus.Type;

export const TaskBoardTaskPriority = Schema.Literals(["low", "medium", "high", "critical"]);
export type TaskBoardTaskPriority = typeof TaskBoardTaskPriority.Type;

export const TaskBoardTaskKind = Schema.Literals(["task", "agent_run"]);
export type TaskBoardTaskKind = typeof TaskBoardTaskKind.Type;

export const TaskBoardAgent = Schema.Struct({
  providerInstanceId: Schema.optional(TrimmedNonEmptyString),
  model: Schema.optional(TrimmedNonEmptyString),
  options: Schema.optional(ProviderOptionSelections),
  threadId: Schema.optional(TrimmedNonEmptyString),
});
export type TaskBoardAgent = typeof TaskBoardAgent.Type;

export const TaskBoardHistoryEntry = Schema.Struct({
  id: TrimmedNonEmptyString,
  taskId: TrimmedNonEmptyString,
  action: Schema.Literals([
    "created",
    "claimed",
    "released",
    "updated",
    "blocked",
    "completed",
    "reopened",
    "imported",
    "progress",
  ]),
  actor: TrimmedNonEmptyString,
  timestamp: Schema.Number,
  note: Schema.optional(Schema.NullOr(Schema.String)),
  agent: Schema.optional(TaskBoardAgent),
});
export type TaskBoardHistoryEntry = typeof TaskBoardHistoryEntry.Type;

export const TaskBoardTask = Schema.Struct({
  id: TrimmedNonEmptyString,
  project: TrimmedNonEmptyString,
  title: TrimmedNonEmptyString,
  description: Schema.String,
  status: TaskBoardTaskStatus,
  priority: TaskBoardTaskPriority,
  claimedBy: Schema.NullOr(TrimmedNonEmptyString),
  claimedAt: Schema.NullOr(Schema.Number),
  claimedAgent: Schema.NullOr(TaskBoardAgent),
  /** Every chat that ever worked on this task, oldest first. `claimedAgent.threadId` is the newest. */
  threadIds: Schema.optional(Schema.Array(TrimmedNonEmptyString)),
  completedBy: Schema.NullOr(TrimmedNonEmptyString),
  completedAt: Schema.NullOr(Schema.Number),
  completionSummary: Schema.NullOr(Schema.String),
  createdAt: Schema.Number,
  updatedAt: Schema.Number,
  labels: Schema.Array(TrimmedNonEmptyString),
  source: Schema.Literals(["board", "github_issue", "aios_card"]),
  // The fields below come from an AIOS task card. All are optional so shared records written
  // before they existed still decode.
  projectSlug: Schema.optional(Schema.NullOr(Schema.String)),
  // The app project a native card was made for; it picks the card's workspace on a slug clash.
  projectId: Schema.optional(Schema.String),
  effort: Schema.optional(Schema.NullOr(Schema.String)),
  energy: Schema.optional(Schema.NullOr(Schema.String)),
  due: Schema.optional(Schema.NullOr(Schema.String)),
  milestone: Schema.optional(Schema.NullOr(TaskBoardMilestoneVersion)),
  verify: Schema.optional(Schema.NullOr(Schema.String)),
  startFiles: Schema.optional(Schema.Array(Schema.String)),
  blockedBy: Schema.optional(Schema.Array(Schema.String)),
  checklist: Schema.optional(Schema.Struct({ done: Schema.Number, total: Schema.Number })),
  // True when the card is published to the project's shared board so collaborators see it.
  shared: Schema.optional(Schema.Boolean),
  sharedBy: Schema.optional(Schema.NullOr(Schema.String)),
  // Set while a shared card's latest local edit has not reached the shared board: "pending" while
  // the copy is being written, "failed" when it could not be. Sharing the card again retries.
  sharedSync: Schema.optional(Schema.Literals(["pending", "failed"])),
  // The person who owns the task (a team member's name). Null or missing means anyone can take it.
  assignee: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
  // "agent_run" marks a card the app filed from a chat request. It records agent work and stays
  // out of backlog counts and the shared board.
  kind: Schema.optional(TaskBoardTaskKind),
  sourceId: Schema.NullOr(TrimmedNonEmptyString),
  sourceFile: Schema.NullOr(TrimmedNonEmptyString),
  sourceRoot: Schema.optional(TrimmedNonEmptyString),
  issueUrl: Schema.NullOr(TrimmedNonEmptyString),
  history: Schema.Array(TaskBoardHistoryEntry),
});
export type TaskBoardTask = typeof TaskBoardTask.Type;

/** One move of a task from an open status to done, made through this server. */
export const TaskBoardCompletion = Schema.Struct({
  // Unique per completion, so a task completed, reopened and completed again is two completions.
  id: TrimmedNonEmptyString,
  taskId: TrimmedNonEmptyString,
  title: TrimmedNonEmptyString,
  projectSlug: Schema.NullOr(Schema.String),
  actor: TrimmedNonEmptyString,
  // True when an agent made the change, false when the user did.
  byAgent: Schema.Boolean,
  completedAt: Schema.Number,
});
export type TaskBoardCompletion = typeof TaskBoardCompletion.Type;

/** The latest completions, newest last; a subscriber reads the current list first. */
export const TaskBoardCompletions = Schema.Array(TaskBoardCompletion);
export type TaskBoardCompletions = typeof TaskBoardCompletions.Type;

export const TaskBoardIssue = Schema.Struct({
  number: PositiveInt,
  title: TrimmedNonEmptyString,
  url: TrimmedNonEmptyString,
  updatedAt: Schema.String,
  createdAt: Schema.optional(Schema.String),
  body: Schema.optional(Schema.NullOr(Schema.String)),
  state: Schema.optional(Schema.Literals(["OPEN", "CLOSED"])),
  labels: Schema.Array(Schema.Struct({ name: Schema.String })),
  assignees: Schema.Array(Schema.Struct({ login: Schema.String })),
});
export type TaskBoardIssue = typeof TaskBoardIssue.Type;

export const TaskBoardSummary = Schema.Struct({
  total: Schema.Number,
  todo: Schema.Number,
  inProgress: Schema.Number,
  review: Schema.optional(Schema.Number),
  blocked: Schema.Number,
  done: Schema.Number,
});
export type TaskBoardSummary = typeof TaskBoardSummary.Type;

export const TaskBoardSnapshot = Schema.Struct({
  projectId: ProjectId,
  project: TrimmedNonEmptyString,
  repository: TrimmedNonEmptyString,
  tasks: Schema.Array(TaskBoardTask),
  issues: Schema.Array(TaskBoardIssue),
  checkedAt: Schema.Number,
  limit: PositiveInt,
  aiosConnected: Schema.Boolean,
  summary: TaskBoardSummary,
});
export type TaskBoardSnapshot = typeof TaskBoardSnapshot.Type;

export const TaskBoardListInput = Schema.Struct({ projectId: ProjectId });
export type TaskBoardListInput = typeof TaskBoardListInput.Type;

export const TaskBoardCreateInput = Schema.Struct({
  projectId: ProjectId,
  title: TrimmedNonEmptyString.check(Schema.isMaxLength(256)),
  description: Schema.optional(Schema.String.check(Schema.isMaxLength(20_000))),
  priority: Schema.optional(TaskBoardTaskPriority),
  actor: TrimmedNonEmptyString.check(Schema.isMaxLength(100)),
  agent: Schema.optional(TaskBoardAgent),
  labels: Schema.optional(Schema.Array(TrimmedNonEmptyString)),
});
export type TaskBoardCreateInput = typeof TaskBoardCreateInput.Type;

export const TaskBoardClaimInput = Schema.Struct({
  projectId: ProjectId,
  taskId: TrimmedNonEmptyString,
  actor: TrimmedNonEmptyString.check(Schema.isMaxLength(100)),
  agent: Schema.optional(TaskBoardAgent),
});
export type TaskBoardClaimInput = typeof TaskBoardClaimInput.Type;

export const TaskBoardReleaseInput = Schema.Struct({
  projectId: ProjectId,
  taskId: TrimmedNonEmptyString,
  actor: TrimmedNonEmptyString.check(Schema.isMaxLength(100)),
});
export type TaskBoardReleaseInput = typeof TaskBoardReleaseInput.Type;

export const TaskBoardCompleteInput = Schema.Struct({
  projectId: ProjectId,
  taskId: TrimmedNonEmptyString,
  actor: TrimmedNonEmptyString.check(Schema.isMaxLength(100)),
  summary: Schema.optional(Schema.String.check(Schema.isMaxLength(20_000))),
});
export type TaskBoardCompleteInput = typeof TaskBoardCompleteInput.Type;

export const TaskBoardUpdateInput = Schema.Struct({
  projectId: ProjectId,
  taskId: TrimmedNonEmptyString,
  actor: TrimmedNonEmptyString.check(Schema.isMaxLength(100)),
  agent: Schema.optional(TaskBoardAgent),
  title: Schema.optional(TrimmedNonEmptyString.check(Schema.isMaxLength(256))),
  description: Schema.optional(Schema.String.check(Schema.isMaxLength(20_000))),
  status: Schema.optional(TaskBoardTaskStatus),
  priority: Schema.optional(TaskBoardTaskPriority),
  labels: Schema.optional(Schema.Array(TrimmedNonEmptyString)),
  note: Schema.optional(Schema.String.check(Schema.isMaxLength(4_000))),
});
export type TaskBoardUpdateInput = typeof TaskBoardUpdateInput.Type;

export const TaskBoardRoadmap = Schema.Struct({
  projectSlug: TrimmedNonEmptyString,
  name: TrimmedNonEmptyString,
  currentVersion: TaskBoardMilestoneVersion,
  targetVersion: TaskBoardMilestoneVersion,
  releaseDefinition: Schema.String,
  milestones: Schema.Array(
    Schema.Struct({
      version: TaskBoardMilestoneVersion,
      title: TrimmedNonEmptyString,
      goal: Schema.String,
      tasks: Schema.Array(
        Schema.Struct({
          key: TrimmedNonEmptyString,
          title: TrimmedNonEmptyString,
          description: Schema.String,
          priority: Schema.optional(TaskBoardTaskPriority),
        }),
      ),
    }),
  ),
});
export type TaskBoardRoadmap = typeof TaskBoardRoadmap.Type;

// One section of the workspace view: an AIOS project, optionally backed by a Leonidas project.
export const TaskBoardWorkspaceProject = Schema.Struct({
  slug: TrimmedNonEmptyString,
  name: TrimmedNonEmptyString,
  projectId: Schema.NullOr(ProjectId),
  // GitHub "owner/name" when sharing with collaborators is possible for this project.
  repository: Schema.NullOr(TrimmedNonEmptyString),
  total: Schema.Number,
  open: Schema.Number,
  // The open-card cap and warning line from `projects/<slug>/project.md`; absent without an AIOS.
  cap: Schema.optional(Schema.Number),
  warn: Schema.optional(Schema.Number),
});
export type TaskBoardWorkspaceProject = typeof TaskBoardWorkspaceProject.Type;

// One collaborator: the name the board shows and every login or git name that means them.
export const TaskBoardTeamMember = Schema.Struct({
  name: TrimmedNonEmptyString,
  aliases: Schema.Array(TrimmedNonEmptyString),
  // A business Member: the slug is what a task file stores as its assignee.
  slug: Schema.optional(TrimmedNonEmptyString),
  kind: Schema.optional(Schema.Literals(["person", "agent"])),
});
export type TaskBoardTeamMember = typeof TaskBoardTeamMember.Type;

// Everything in the user's AIOS task folders, read from disk with no GitHub round trip.
export const TaskBoardWorkspaceSnapshot = Schema.Struct({
  member: TrimmedNonEmptyString,
  aiosRoot: Schema.NullOr(Schema.String),
  aiosConnected: Schema.Boolean,
  checkedAt: Schema.Number,
  projects: Schema.Array(TaskBoardWorkspaceProject),
  tasks: Schema.Array(TaskBoardTask),
  roadmaps: Schema.optional(Schema.Array(TaskBoardRoadmap)),
  // Read from `leonidas.team.json` in the project folders; empty when no project defines a team.
  team: Schema.optional(Schema.Array(TaskBoardTeamMember)),
});
export type TaskBoardWorkspaceSnapshot = typeof TaskBoardWorkspaceSnapshot.Type;

// The AIOS workspace a Command request reads (ADR-0080). Absent: the server's default workspace.
export const AiosWorkspaceId = TrimmedNonEmptyString.check(Schema.isMaxLength(64));
const workspaceScope = { workspaceId: Schema.optional(AiosWorkspaceId) };

export const TaskBoardWorkspaceInput = Schema.Struct({ ...workspaceScope });
export type TaskBoardWorkspaceInput = typeof TaskBoardWorkspaceInput.Type;

// Patches one AIOS card in place. `projectSlug: null` unlinks it from its project.
export const TaskBoardCardUpdateInput = Schema.Struct({
  ...workspaceScope,
  taskId: TrimmedNonEmptyString,
  // Needed only to update a task that exists on a project's shared board but not in this AIOS.
  projectId: Schema.optional(ProjectId),
  actor: TrimmedNonEmptyString.check(Schema.isMaxLength(100)),
  agent: Schema.optional(TaskBoardAgent),
  title: Schema.optional(TrimmedNonEmptyString.check(Schema.isMaxLength(256))),
  due: Schema.optional(Schema.NullOr(TaskBoardDueDate)),
  milestone: Schema.optional(Schema.NullOr(TaskBoardMilestoneVersion)),
  status: Schema.optional(TaskBoardTaskStatus),
  priority: Schema.optional(TaskBoardTaskPriority),
  projectSlug: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
  claimedBy: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
  // `null` makes the task available to anyone.
  assignee: Schema.optional(Schema.NullOr(TrimmedNonEmptyString.check(Schema.isMaxLength(100)))),
  // The `updatedAt` the caller last saw. When set, the update fails with `stale_revision` if the
  // task changed since, so an edit made from an old view never overwrites a newer one.
  expectedUpdatedAt: Schema.optional(Schema.Number),
  effort: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
  // Replaces the card's tags.
  labels: Schema.optional(Schema.Array(TrimmedNonEmptyString)),
  // Business workspace: the Area slug that makes the task private, or `null` to make it public.
  privateArea: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
  // Appended to the card's activity log.
  note: Schema.optional(Schema.String.check(Schema.isMaxLength(4_000))),
});
export type TaskBoardCardUpdateInput = typeof TaskBoardCardUpdateInput.Type;

// A bulk change: set status, priority or project on many cards at once. `dryRun` previews the
// per-card diff, `apply` writes it and a ledger, `undo` restores the cards of one ledger.
export const TaskBoardChange = Schema.Struct({
  taskId: TrimmedNonEmptyString,
  status: Schema.optional(TaskBoardTaskStatus),
  priority: Schema.optional(TaskBoardTaskPriority),
  projectSlug: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
});
export type TaskBoardChange = typeof TaskBoardChange.Type;

export const TaskBoardChangeSetInput = Schema.Struct({
  ...workspaceScope,
  actor: TrimmedNonEmptyString.check(Schema.isMaxLength(100)),
  mode: Schema.Literals(["dryRun", "apply", "undo"]),
  changes: Schema.optional(Schema.Array(TaskBoardChange).check(Schema.isMaxLength(500))),
  // Names the ledger to undo.
  ledgerId: Schema.optional(TrimmedNonEmptyString.check(Schema.isMaxLength(100))),
});
export type TaskBoardChangeSetInput = typeof TaskBoardChangeSetInput.Type;

const TaskBoardChangeFields = Schema.Struct({
  status: TaskBoardTaskStatus,
  priority: TaskBoardTaskPriority,
  projectSlug: Schema.NullOr(Schema.String),
});

export const TaskBoardChangeRow = Schema.Struct({
  taskId: Schema.String,
  title: Schema.String,
  before: TaskBoardChangeFields,
  after: TaskBoardChangeFields,
  outcome: Schema.Literals(["changed", "unchanged", "refused", "missing", "restored", "conflict"]),
  reason: Schema.optional(Schema.String),
});
export type TaskBoardChangeRow = typeof TaskBoardChangeRow.Type;

export const TaskBoardChangeSetResult = Schema.Struct({
  mode: Schema.Literals(["dryRun", "apply", "undo"]),
  // The ledger written by `apply`; null when nothing changed or the mode wrote none.
  ledgerId: Schema.NullOr(Schema.String),
  rows: Schema.Array(TaskBoardChangeRow),
});
export type TaskBoardChangeSetResult = typeof TaskBoardChangeSetResult.Type;

export const TaskBoardCardCreateInput = Schema.Struct({
  ...workspaceScope,
  idempotencyKey: Schema.optional(TrimmedNonEmptyString.check(Schema.isMaxLength(256))),
  projectId: Schema.optional(ProjectId),
  title: TrimmedNonEmptyString.check(Schema.isMaxLength(256)),
  due: Schema.optional(Schema.NullOr(TaskBoardDueDate)),
  milestone: Schema.optional(Schema.NullOr(TaskBoardMilestoneVersion)),
  description: Schema.optional(Schema.String.check(Schema.isMaxLength(20_000))),
  priority: Schema.optional(TaskBoardTaskPriority),
  projectSlug: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
  assignee: Schema.optional(Schema.NullOr(TrimmedNonEmptyString.check(Schema.isMaxLength(100)))),
  kind: Schema.optional(TaskBoardTaskKind),
  actor: TrimmedNonEmptyString.check(Schema.isMaxLength(100)),
});
export type TaskBoardCardCreateInput = typeof TaskBoardCardCreateInput.Type;

/** A raw capture: saved first, classified later. `source` says where it came from. */
export const InboxDropInput = Schema.Struct({
  ...workspaceScope,
  text: TrimmedNonEmptyString.check(Schema.isMaxLength(20_000)),
  source: Schema.optional(TrimmedNonEmptyString.check(Schema.isMaxLength(500))),
  projectSlug: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
  actor: TrimmedNonEmptyString.check(Schema.isMaxLength(100)),
});
export type InboxDropInput = typeof InboxDropInput.Type;

export const InboxDrop = Schema.Struct({
  id: Schema.String,
  createdAt: Schema.String,
  /** Triage's guess. A confident task also becomes a task card, titled `filedTask`. */
  kind: Schema.Literals(["note", "idea", "task"]),
  filedTask: Schema.optional(Schema.String),
});
export type InboxDrop = typeof InboxDrop.Type;

export const InboxUndoInput = Schema.Struct({ ...workspaceScope, id: TrimmedNonEmptyString });
export type InboxUndoInput = typeof InboxUndoInput.Type;

// Publishes (or withdraws) cards on the project's shared board. Omitting `taskIds` targets every
// open card linked to the project.
export const TaskBoardShareInput = Schema.Struct({
  projectId: ProjectId,
  taskIds: Schema.optional(Schema.Array(TrimmedNonEmptyString)),
  shared: Schema.Boolean,
  actor: TrimmedNonEmptyString.check(Schema.isMaxLength(100)),
});
export type TaskBoardShareInput = typeof TaskBoardShareInput.Type;

// Folders that look like the user's AIOS. `pickedPath` is a folder the user chose by hand.
export const TaskBoardAiosCandidate = Schema.Struct({
  root: Schema.String,
  confidence: Schema.Literals(["marker", "schema"]),
  cardCount: Schema.Number,
  cardsWithFrontmatter: Schema.Number,
  markers: Schema.Array(Schema.String),
});
export type TaskBoardAiosCandidate = typeof TaskBoardAiosCandidate.Type;

export const TaskBoardAiosDetectInput = Schema.Struct({
  pickedPath: Schema.optional(TrimmedNonEmptyString),
});
export type TaskBoardAiosDetectInput = typeof TaskBoardAiosDetectInput.Type;

export const TaskBoardAiosDetectResult = Schema.Struct({
  /** The root already confirmed for this environment, if any. */
  confirmedRoot: Schema.NullOr(Schema.String),
  candidates: Schema.Array(TaskBoardAiosCandidate),
});
export type TaskBoardAiosDetectResult = typeof TaskBoardAiosDetectResult.Type;

// The Command tab's Home: today's brief priorities, open-task counts and one next move, all read
// from the AIOS folder. `root` is null when no AIOS is connected yet.
export const TaskBoardHomeInput = Schema.Struct({ ...workspaceScope });
export type TaskBoardHomeInput = typeof TaskBoardHomeInput.Type;

export const AiosWorkspaceScopeInput = Schema.Struct({ ...workspaceScope });
export type AiosWorkspaceScopeInput = typeof AiosWorkspaceScopeInput.Type;

export const AiosWorkspaceType = Schema.Literals(["personal", "business"]);
export type AiosWorkspaceType = typeof AiosWorkspaceType.Type;

// One AIOS folder the app found. Only a `ready` workspace (valid workspace.json) can be opened;
// `missing` and `invalid` show the setup prompt. `projectIds` are the app projects inside it.
export const AiosWorkspaceSummary = Schema.Struct({
  root: Schema.String,
  status: Schema.Literals(["ready", "missing", "invalid"]),
  id: Schema.NullOr(Schema.String),
  name: Schema.NullOr(Schema.String),
  type: Schema.NullOr(AiosWorkspaceType),
  error: Schema.NullOr(Schema.String),
  isDefault: Schema.Boolean,
  projectIds: Schema.Array(ProjectId),
  // Projects the Tasks rail folds into "More". Optional, so an older server still parses.
  hiddenProjects: Schema.optional(Schema.Array(Schema.String)),
});
export type AiosWorkspaceSummary = typeof AiosWorkspaceSummary.Type;

export const AiosWorkspacesListResult = Schema.Struct({
  workspaces: Schema.Array(AiosWorkspaceSummary),
});
export type AiosWorkspacesListResult = typeof AiosWorkspacesListResult.Type;

// Saves the projects the Tasks rail folds into "More" in workspace.json, so the list follows
// the AIOS folder to every device. An empty list shows every project again.
export const AiosWorkspaceHiddenProjectsInput = Schema.Struct({
  ...workspaceScope,
  hiddenProjects: Schema.Array(TrimmedNonEmptyString.check(Schema.isMaxLength(100))).check(
    Schema.isMaxLength(200),
  ),
});
export type AiosWorkspaceHiddenProjectsInput = typeof AiosWorkspaceHiddenProjectsInput.Type;

// Sets one project's open-task limit and warning in its project.md. Whole numbers: the server
// checks the range and answers in plain words, so a bad value never reaches the file.
export const TaskBoardCapSetInput = Schema.Struct({
  ...workspaceScope,
  projectSlug: TrimmedNonEmptyString.check(Schema.isMaxLength(100)),
  cap: Schema.Number,
  warn: Schema.Number,
});
export type TaskBoardCapSetInput = typeof TaskBoardCapSetInput.Type;

// The setup prompt: writes workspace.json into a folder the app already lists.
export const AiosWorkspaceInitInput = Schema.Struct({
  root: TrimmedNonEmptyString,
  id: TrimmedNonEmptyString.check(Schema.isPattern(/^[a-z0-9][a-z0-9-]{0,63}$/)),
  name: TrimmedNonEmptyString.check(Schema.isMaxLength(80)),
  type: AiosWorkspaceType,
  // The Owner of a new business. Setup copies the business template with this name.
  ownerName: Schema.optional(TrimmedNonEmptyString.check(Schema.isMaxLength(80))),
});
export type AiosWorkspaceInitInput = typeof AiosWorkspaceInitInput.Type;

// A card a workspace pack adds to the Command Home. Data only: the core renders it and never
// imports the pack. `[]` means no pack, or a workspace that is not `type: business`.
export const WorkspacePackKpi = Schema.Struct({
  label: Schema.String,
  value: Schema.String,
  detail: Schema.String,
});
export type WorkspacePackKpi = typeof WorkspacePackKpi.Type;

export const WorkspacePackWidget = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  kpis: Schema.Array(WorkspacePackKpi),
});
export type WorkspacePackWidget = typeof WorkspacePackWidget.Type;

export const WorkspacePackWidgetsResult = Schema.Struct({
  widgets: Schema.Array(WorkspacePackWidget),
});
export type WorkspacePackWidgetsResult = typeof WorkspacePackWidgetsResult.Type;

// The org record of a business workspace (ADR-0088): Departments, Areas and Members read from the
// Home area files. `org` is null for a personal workspace, a build with no pack, or a folder with
// no Member yet, so the Team view can show its empty state.
export const WorkspaceOrg = Schema.Struct({
  name: Schema.String,
  departments: Schema.Array(
    Schema.Struct({
      slug: Schema.String,
      name: Schema.String,
      areas: Schema.Array(Schema.String),
      leads: Schema.Array(Schema.String),
    }),
  ),
  areas: Schema.Array(
    Schema.Struct({
      slug: Schema.String,
      name: Schema.String,
      department: Schema.String,
      sensitivity: Schema.String,
      status: Schema.String,
    }),
  ),
  members: Schema.Array(
    Schema.Struct({
      slug: Schema.String,
      name: Schema.String,
      kind: Schema.Literals(["person", "agent"]),
      status: Schema.String,
      department: Schema.String,
      owner: Schema.String,
      github: Schema.String,
      roles: Schema.Record(Schema.String, Schema.String),
    }),
  ),
  // The permission table of org/roles.md: the four Roles that ship, then the custom ones.
  roles: Schema.Array(
    Schema.Struct({
      name: Schema.String,
      basedOn: Schema.String,
      write: Schema.Literals(["none", "files", "all"]),
      approve: Schema.Literals(["none", "area", "wall"]),
      manage: Schema.Literals(["none", "area", "org"]),
    }),
  ),
});
export type WorkspaceOrg = typeof WorkspaceOrg.Type;

// A change to the org record (ADR-0088). The server decides whether it applies now (it only
// narrows access) or waits as a proposal (it widens access).
export const WorkspaceOrgChange = Schema.Union([
  Schema.Struct({
    kind: Schema.Literal("setRole"),
    member: Schema.String,
    area: Schema.String,
    role: Schema.NullOr(Schema.String),
  }),
  Schema.Struct({
    kind: Schema.Literal("addMember"),
    member: Schema.Struct({
      slug: Schema.String,
      name: Schema.String,
      kind: Schema.Literals(["person", "agent"]),
      department: Schema.String,
      owner: Schema.optional(Schema.String),
      github: Schema.optional(Schema.String),
      roles: Schema.Record(Schema.String, Schema.String),
    }),
  }),
  Schema.Struct({ kind: Schema.Literal("removeMember"), member: Schema.String }),
  // Only an Owner changes the permission table. `wall` and `org` stay with the Owner Role.
  Schema.Struct({
    kind: Schema.Literal("setRoleDef"),
    role: Schema.Struct({
      name: Schema.String,
      basedOn: Schema.String,
      write: Schema.Literals(["none", "files", "all"]),
      approve: Schema.Literals(["none", "area"]),
      manage: Schema.Literals(["none", "area"]),
    }),
  }),
  Schema.Struct({ kind: Schema.Literal("removeRoleDef"), role: Schema.String }),
  // The invited person accepts their own Invite. An Owner renews a closed one.
  Schema.Struct({ kind: Schema.Literal("acceptInvite") }),
  Schema.Struct({ kind: Schema.Literal("renewInvite"), member: Schema.String }),
]);
export type WorkspaceOrgChange = typeof WorkspaceOrgChange.Type;

export const WorkspaceOrgProposal = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  proposedBy: Schema.String,
  proposedAt: Schema.String,
});
export type WorkspaceOrgProposal = typeof WorkspaceOrgProposal.Type;

// `me` is the Member who uses this computer, matched by GitHub login. `proposals` are the ones
// still waiting for an Owner.
export const WorkspaceOrgResult = Schema.Struct({
  org: Schema.NullOr(WorkspaceOrg),
  me: Schema.NullOr(
    Schema.Struct({
      slug: Schema.String,
      canDecide: Schema.Boolean,
      invited: Schema.Boolean,
    }),
  ),
  proposals: Schema.Array(WorkspaceOrgProposal),
  // Open Invites with their link. Only an Owner gets them. The link holds no secret.
  invites: Schema.Array(
    Schema.Struct({
      slug: Schema.String,
      name: Schema.String,
      github: Schema.String,
      status: Schema.String,
      expiresAt: Schema.String,
      approvedBy: Schema.String,
      link: Schema.String,
    }),
  ),
});
export type WorkspaceOrgResult = typeof WorkspaceOrgResult.Type;

export const WorkspaceOrgChangeInput = Schema.Struct({
  ...workspaceScope,
  change: WorkspaceOrgChange,
});
export type WorkspaceOrgChangeInput = typeof WorkspaceOrgChangeInput.Type;

export const WorkspaceOrgDecideInput = Schema.Struct({
  ...workspaceScope,
  id: Schema.String,
  decision: Schema.Literals(["approve", "reject"]),
});
export type WorkspaceOrgDecideInput = typeof WorkspaceOrgDecideInput.Type;

export const WorkspaceOrgActionResult = Schema.Struct({
  result: Schema.Literals([
    "applied",
    "proposed",
    "rejected",
    "denied",
    "invalid",
    "unknown_actor",
    "missing",
  ]),
  message: Schema.String,
});
export type WorkspaceOrgActionResult = typeof WorkspaceOrgActionResult.Type;

export const TaskBoardHomePriority = Schema.Struct({
  title: Schema.String,
  detail: Schema.String,
  done: Schema.Boolean,
  taskId: Schema.NullOr(Schema.String),
  /** The checkbox line as it is in the brief file. The toggle sends it back. Absent on older servers. */
  line: Schema.optional(Schema.String),
});
export type TaskBoardHomePriority = typeof TaskBoardHomePriority.Type;

/**
 * Ticks or clears one priority in the brief file. `line` is the line the caller last read: when
 * the file no longer holds that exact line once, the toggle fails with `stale_revision`.
 */
export const TaskBoardHomePriorityToggleInput = Schema.Struct({
  ...workspaceScope,
  file: TrimmedNonEmptyString.check(Schema.isMaxLength(256)),
  line: Schema.String.check(Schema.isMaxLength(4_000)),
  done: Schema.Boolean,
});
export type TaskBoardHomePriorityToggleInput = typeof TaskBoardHomePriorityToggleInput.Type;

/** The AIOS note folders the Memory page lists. */
export const AiosNoteFolder = Schema.Literals(["decisions", "logs", "wiki"]);
export type AiosNoteFolder = typeof AiosNoteFolder.Type;

export const AiosFolderListInput = Schema.Struct({ ...workspaceScope, folder: AiosNoteFolder });
export type AiosFolderListInput = typeof AiosFolderListInput.Type;

/** One note: its AIOS-relative path, a title, the date it names and a one-line summary. */
export const AiosFolderItem = Schema.Struct({
  path: Schema.String,
  title: Schema.String,
  /** `YYYY-MM-DD` from the frontmatter or the file name; null when the note names none. */
  date: Schema.NullOr(Schema.String),
  summary: Schema.String,
  changedAt: Schema.Number,
});
export type AiosFolderItem = typeof AiosFolderItem.Type;

/** Newest first, at most a few hundred. `total` counts every note in the folder. */
export const AiosFolderList = Schema.Struct({
  root: Schema.NullOr(Schema.String),
  folder: AiosNoteFolder,
  items: Schema.Array(AiosFolderItem),
  total: Schema.Number,
});
export type AiosFolderList = typeof AiosFolderList.Type;

/** The line as it is in the file after the toggle. */
export const TaskBoardHomePriorityToggleResult = Schema.Struct({ line: Schema.String });
export type TaskBoardHomePriorityToggleResult = typeof TaskBoardHomePriorityToggleResult.Type;

export const TaskBoardHomeMove = Schema.Struct({
  kind: Schema.Literals(["review", "finish", "unblock", "focus", "rest"]),
  title: Schema.String,
  reason: Schema.String,
  taskId: Schema.NullOr(Schema.String),
});
export type TaskBoardHomeMove = typeof TaskBoardHomeMove.Type;

/** One goal row from `ideal-state/goals.md`. */
export const AiosDirectionGoal = Schema.Struct({
  id: Schema.String,
  goal: Schema.String,
  measuredBy: Schema.String,
  targetDate: Schema.String,
  status: Schema.String,
});
export type AiosDirectionGoal = typeof AiosDirectionGoal.Type;

/** An open high-priority card, placed under the horizon it is due in. */
export const AiosDirectionCard = Schema.Struct({
  taskId: Schema.String,
  title: Schema.String,
  priority: TaskBoardTaskPriority,
  due: Schema.NullOr(Schema.String),
});
export type AiosDirectionCard = typeof AiosDirectionCard.Type;

export const AiosDirectionHorizonKey = Schema.Literals([
  "week",
  "month",
  "sixMonths",
  "year",
  "life",
]);
export type AiosDirectionHorizonKey = typeof AiosDirectionHorizonKey.Type;

export const AiosDirectionHorizon = Schema.Struct({
  key: AiosDirectionHorizonKey,
  title: Schema.String,
  range: Schema.NullOr(Schema.String),
  items: Schema.Array(Schema.String),
  cards: Schema.Array(AiosDirectionCard),
});
export type AiosDirectionHorizon = typeof AiosDirectionHorizon.Type;

/** The Direction view: goals, the 5 horizons and a stale flag for the week block. */
export const AiosDirection = Schema.Struct({
  root: Schema.NullOr(Schema.String),
  goals: Schema.Array(AiosDirectionGoal),
  horizons: Schema.Array(AiosDirectionHorizon),
  weekHeading: Schema.NullOr(Schema.String),
  weekDate: Schema.NullOr(Schema.String),
  weekAgeDays: Schema.NullOr(Schema.Number),
  weekStale: Schema.Boolean,
});
export type AiosDirection = typeof AiosDirection.Type;

/** Counts that describe the user's AIOS for opt-in usage analytics. No names or paths. */
export const AiosUsageShape = Schema.Struct({
  aiosDetected: Schema.Boolean,
  skillsCount: Schema.Number,
  taskCardsCount: Schema.Number,
  memoryFilesPresent: Schema.Boolean,
});
export type AiosUsageShape = typeof AiosUsageShape.Type;

/** One AIOS area (`tasks`, `memory`, ...): its unit count and newest file time in ms. */
export const TaskBoardHomeArea = Schema.Struct({
  id: Schema.String,
  units: Schema.Number,
  changedAt: Schema.Number,
});
export type TaskBoardHomeArea = typeof TaskBoardHomeArea.Type;

export const TaskBoardHome = Schema.Struct({
  root: Schema.NullOr(Schema.String),
  /** Newest change first. Optional so an older server still decodes. */
  areas: Schema.optional(Schema.Array(TaskBoardHomeArea)),
  brief: Schema.NullOr(
    Schema.Struct({
      date: Schema.String,
      file: Schema.String,
      priorities: Schema.Array(TaskBoardHomePriority),
    }),
  ),
  counts: Schema.Struct({
    todo: Schema.Number,
    inProgress: Schema.Number,
    review: Schema.Number,
    blocked: Schema.Number,
  }),
  move: TaskBoardHomeMove,
});
export type TaskBoardHome = typeof TaskBoardHome.Type;

// Optional Home cards. Weather is for a place the user names (no location is assumed); news is
// a few public AI feeds. Both are free, keyless reads and degrade to "unavailable" or empty.
export const TaskBoardHomeWeatherInput = Schema.Struct({
  place: TrimmedNonEmptyString.check(Schema.isMaxLength(80)),
});
export type TaskBoardHomeWeatherInput = typeof TaskBoardHomeWeatherInput.Type;

export const TaskBoardHomeWeather = Schema.Union([
  Schema.Struct({
    status: Schema.Literal("available"),
    place: Schema.String,
    unit: Schema.Literals(["F", "C"]),
    temp: Schema.Number,
    feels: Schema.Number,
    high: Schema.Number,
    low: Schema.Number,
    condition: Schema.String,
    icon: Schema.String,
    observed: Schema.String,
  }),
  Schema.Struct({
    status: Schema.Literal("unavailable"),
    reason: Schema.Literals(["place_not_found", "offline"]),
  }),
]);
export type TaskBoardHomeWeather = typeof TaskBoardHomeWeather.Type;

export const TaskBoardHomeNewsItem = Schema.Struct({
  title: Schema.String,
  link: Schema.String,
  image: Schema.NullOr(Schema.String),
  at: Schema.NullOr(Schema.String),
  summary: Schema.String,
  source: Schema.String,
});
export type TaskBoardHomeNewsItem = typeof TaskBoardHomeNewsItem.Type;

export const TaskBoardHomeNews = Schema.Struct({ items: Schema.Array(TaskBoardHomeNewsItem) });
export type TaskBoardHomeNews = typeof TaskBoardHomeNews.Type;

// Ponytail monitor. Numbers come from the plugin's local ledger and the app's own turn records.
// `projected` is the only estimate: the published benchmark applied to code tasks, labelled as such.
const PonytailProviderTotals = Schema.Struct({
  provider: Schema.String,
  turns: Schema.Number,
  inputTokens: Schema.Number,
  cachedInputTokens: Schema.Number,
  outputTokens: Schema.Number,
  agentMinutes: Schema.Number,
});

export const PonytailUsage = Schema.Struct({
  status: Schema.Literals(["missing", "ready"]),
  // Every enabled provider account in the app. The rules reach all of them. `plugin` is "on" or
  // "off" for a Claude account, "needs-trust" for a Codex account whose hooks the user has not
  // approved yet, and "none" for a provider that has no Ponytail plugin.
  accounts: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      name: Schema.String,
      driver: Schema.String,
      plugin: Schema.Literals(["on", "needs-trust", "off", "none"]),
    }),
  ),
  // Date (YYYY-MM-DD) of the first ledger row: the day the plugin started logging.
  since: Schema.String,
  // Turns by provider driver from the app's own records. With a `since` date: the 30 days before
  // it, then since. With none (no ledger): `providers` is the last 30 days and `providersBefore` is empty.
  providersBefore: Schema.Array(PonytailProviderTotals),
  providers: Schema.Array(PonytailProviderTotals),
  tasks: Schema.Number,
  costUsd: Schema.Number,
  agentMinutes: Schema.Number,
  outputTokens: Schema.Number,
  // Tasks where the agent wrote or reused code, with what the ledger measured on them.
  code: Schema.Struct({
    tasks: Schema.Number,
    costUsd: Schema.Number,
    agentMinutes: Schema.Number,
    outputTokens: Schema.Number,
    reused: Schema.Number,
    created: Schema.Number,
    callersOpen: Schema.Number,
    // Tasks whose ledger row says the tests ran. Null when the ledger has no tests column.
    testsRan: Schema.NullOr(Schema.Number),
  }),
  // The published benchmark share applied to `code`. A projection, not a measurement.
  projected: Schema.Struct({
    costUsd: Schema.Number,
    agentMinutes: Schema.Number,
    outputTokens: Schema.Number,
  }),
  recent: Schema.Array(
    Schema.Struct({
      started: Schema.String,
      project: Schema.String,
      name: Schema.String,
      costUsd: Schema.Number,
      turns: Schema.Number,
      agentMinutes: Schema.Number,
      outputTokens: Schema.Number,
      level: Schema.String,
    }),
  ),
});
export type PonytailUsage = typeof PonytailUsage.Type;

// The user's approval of Ponytail's Codex hooks. With `approve` false it only lists them.
export const PonytailCodexHooksInput = Schema.Struct({
  instanceId: Schema.String,
  approve: Schema.Boolean,
});
export type PonytailCodexHooksInput = typeof PonytailCodexHooksInput.Type;
export const PonytailCodexHooks = Schema.Struct({
  hooks: Schema.Array(
    Schema.Struct({ event: Schema.String, command: Schema.String, trusted: Schema.Boolean }),
  ),
  error: Schema.NullOr(Schema.String),
});
export type PonytailCodexHooks = typeof PonytailCodexHooks.Type;

// Confirms a folder as the AIOS. `null` clears it and returns to auto-detection.
export const TaskBoardAiosConfirmInput = Schema.Struct({
  root: Schema.NullOr(TrimmedNonEmptyString),
});
export type TaskBoardAiosConfirmInput = typeof TaskBoardAiosConfirmInput.Type;

export const TaskBoardProjectDatabase = Schema.Struct({
  version: Schema.Literal(1),
  tasks: Schema.Array(TaskBoardTask),
});

export class TaskBoardReadError extends Schema.TaggedError<TaskBoardReadError>()(
  "TaskBoardReadError",
  {
    reason: Schema.Literals([
      "unavailable",
      "request_failed",
      "invalid_response",
      "issues_disabled",
      "project_not_found",
      "repository_not_supported",
      "write_access_required",
      "aios_not_found",
    ]),
    cause: Schema.Defect(),
  },
) {
  override get message(): string {
    switch (this.reason) {
      case "issues_disabled":
        return "GitHub Issues are disabled for this repository. Enable them in repository settings.";
      case "unavailable":
        return "GitHub CLI is unavailable on this server. Install gh and authenticate with repository access.";
      case "project_not_found":
        return "The selected project is not available in this computer.";
      case "repository_not_supported":
        return "Connect this project to a GitHub repository to enable its shared task board.";
      case "write_access_required":
        return "This GitHub account needs repository Contents write access to create shared task records.";
      case "aios_not_found":
        return "Could not find this computer's AIOS tasks folder. Set LEONIDAS_AIOS_ROOT to your AIOS root.";
      case "invalid_response":
        return "GitHub returned an unreadable task board. Retry the request.";
      case "request_failed":
        return "Could not load or save the shared task board. Check GitHub authentication, repository access and rate limits.";
    }
  }
}

export class TaskBoardOperationError extends Schema.TaggedError<TaskBoardOperationError>()(
  "TaskBoardOperationError",
  {
    reason: Schema.Literals([
      "task_not_found",
      "already_claimed",
      "not_claimed",
      "claim_conflict",
      "task_completed",
      "storage_error",
      "invalid_data",
      "invalid_card",
      "stale_revision",
      "project_full",
    ]),
    message: Schema.String,
    // Set with `project_full`: up to 3 open cards to park or retire to make room.
    suggestions: Schema.optional(
      Schema.Array(Schema.Struct({ id: Schema.String, title: Schema.String })),
    ),
  },
) {}

/** Longest focus line the app writes; longer text is a task card, not a scratch line. */
export const FOCUS_ITEM_MAX_LENGTH = 5000;

/** One scratch line in `<AIOS>/memory/focus.md`. The id is stable while its section and text stay the same. */
export const FocusItem = Schema.Struct({
  id: Schema.String,
  text: Schema.String,
  done: Schema.Boolean,
  /** Pinned lines show first in the widget. Absent means not pinned. */
  pinned: Schema.optional(Schema.Boolean),
});
export type FocusItem = typeof FocusItem.Type;

/** One `## heading` in the focus file: a project slug, or `null` for the Global section. */
export const FocusSection = Schema.Struct({
  slug: Schema.NullOr(Schema.String),
  /** The app project that uses this slug, when there is one. */
  projectId: Schema.NullOr(ProjectId),
  items: Schema.Array(FocusItem),
});
export type FocusSection = typeof FocusSection.Type;

export const FocusSnapshot = Schema.Struct({
  /** The focus file, or `null` when no folder is available. */
  path: Schema.NullOr(Schema.String),
  /** Who the app writes as, for cards made from a focus line. */
  member: Schema.String,
  sections: Schema.Array(FocusSection),
});
export type FocusSnapshot = typeof FocusSnapshot.Type;

/** Most files one `add` or `attach` call can carry, and the largest file in bytes. */
export const FOCUS_FILES_MAX = 5;
export const FOCUS_FILE_MAX_BYTES = 8 * 1024 * 1024;

/** A file the user attached to a note. The server saves it in `<AIOS>/memory/focus-files/`. */
export const FocusFileInput = Schema.Struct({
  name: TrimmedNonEmptyString,
  mimeType: Schema.String,
  dataBase64: Schema.String,
});
export type FocusFileInput = typeof FocusFileInput.Type;

export const FocusAttachmentInput = Schema.Struct({
  /** Path under the memory folder, as written in the note: `focus-files/<name>`. */
  path: Schema.String,
  ...workspaceScope,
});
export type FocusAttachmentInput = typeof FocusAttachmentInput.Type;

export const FocusAttachment = Schema.Struct({
  name: Schema.String,
  mimeType: Schema.String,
  dataBase64: Schema.String,
});
export type FocusAttachment = typeof FocusAttachment.Type;

const FocusText = TrimmedNonEmptyString.check(Schema.isMaxLength(FOCUS_ITEM_MAX_LENGTH));

/** One change to the focus file. `add` with `projectId: null` writes to the Global section. */
export const FocusUpdateInput = Schema.Union([
  Schema.Struct({
    op: Schema.Literal("add"),
    projectId: Schema.NullOr(ProjectId),
    text: FocusText,
    /** Used by Undo to bring a removed line back as it was. */
    done: Schema.optional(Schema.Boolean),
    pinned: Schema.optional(Schema.Boolean),
    files: Schema.optional(Schema.Array(FocusFileInput)),
    ...workspaceScope,
  }),
  Schema.Struct({
    op: Schema.Literal("attach"),
    id: Schema.String,
    files: Schema.Array(FocusFileInput),
    ...workspaceScope,
  }),
  Schema.Struct({
    op: Schema.Literal("set_done"),
    id: Schema.String,
    done: Schema.Boolean,
    ...workspaceScope,
  }),
  Schema.Struct({ op: Schema.Literal("remove"), id: Schema.String, ...workspaceScope }),
  Schema.Struct({
    op: Schema.Literal("edit"),
    id: Schema.String,
    text: FocusText,
    ...workspaceScope,
  }),
  Schema.Struct({
    op: Schema.Literal("pin"),
    id: Schema.String,
    pinned: Schema.Boolean,
    ...workspaceScope,
  }),
  Schema.Struct({
    op: Schema.Literal("move"),
    id: Schema.String,
    direction: Schema.Literals(["up", "down"]),
    ...workspaceScope,
  }),
]);
export type FocusUpdateInput = typeof FocusUpdateInput.Type;

/** The focus list of one workspace; no id keeps the default workspace (old clients). */
export const FocusSubscribeInput = Schema.Struct({ ...workspaceScope });
export type FocusSubscribeInput = typeof FocusSubscribeInput.Type;
