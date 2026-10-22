// @effect-diagnostics nodeBuiltinImport:off preferSchemaOverJson:off instanceOfSchema:off - Board files are parsed from external JSON and gh output with tolerant checks.
import {
  TaskBoardIssue,
  TaskBoardOperationError,
  TaskBoardProjectDatabase,
  TaskBoardReadError,
  TaskBoardRoadmap,
  TaskBoardTeamMember,
  type TaskBoardAgent,
  type TaskBoardClaimInput,
  type TaskBoardCompleteInput,
  type TaskBoardCompletion,
  type TaskBoardCompletions,
  type FocusAttachment,
  type FocusAttachmentInput,
  type FocusSnapshot,
  type FocusUpdateInput,
  type TaskBoardCreateInput,
  type TaskBoardHistoryEntry,
  type InboxDrop,
  type InboxDropInput,
  type InboxUndoInput,
  type TaskBoardAiosConfirmInput,
  type TaskBoardAiosDetectInput,
  type TaskBoardAiosDetectResult,
  type TaskBoardCardCreateInput,
  type TaskBoardCardUpdateInput,
  type TaskBoardHome,
  type TaskBoardReleaseInput,
  type TaskBoardShareInput,
  type TaskBoardSnapshot,
  type TaskBoardTask,
  type TaskBoardTaskPriority,
  type TaskBoardTaskStatus,
  type TaskBoardRoadmap as TaskBoardRoadmapType,
  type TaskBoardUpdateInput,
  type TaskBoardWorkspaceSnapshot,
  type Project,
  type AiosWorkspaceInitInput,
  type AiosWorkspaceSummary,
  type AiosWorkspacesListResult,
  type WorkspacePackWidgetsResult,
  type AiosDirection,
} from "@t3tools/contracts";
import { parseGitHubRepositoryNameWithOwnerFromRemoteUrl } from "@t3tools/shared/git";
import * as Cache from "effect/Cache";
import * as Clock from "effect/Clock";
import * as Context from "effect/Context";
import * as Data from "effect/Data";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as Option from "effect/Option";
import * as Stream from "effect/Stream";
import * as SubscriptionRef from "effect/SubscriptionRef";
import { ServerConfig } from "../config.ts";
import { ServerSettingsService } from "../serverSettings.ts";
import { readAiosShape, type AiosShape } from "./aiosShape.ts";
import { detectAiosCandidates, inspectAiosCandidate } from "./aiosDetect.ts";
import { buildDirection, readDirection } from "./aiosDirection.ts";
import { widgetsForWorkspace } from "../workspacePack/workspacePack.ts";
import { buildHome } from "./aiosHome.ts";
import {
  addFocusItem,
  changeFocusItem,
  focusPathFor,
  moveFocusItem,
  readFocusFile,
  sectionItems,
  writeFocusFile,
} from "./focusFile.ts";
import { memoryDirOf, readFocusAttachment, storeFocusFiles } from "./focusAttachments.ts";
import { linkDropToTask, removeDrop, writeDrop } from "./inbox.ts";
import { triageDrop } from "./triage.ts";
import * as ProcessRunner from "../processRunner.ts";
import {
  applyCardPatch,
  createCardFile,
  discoverProjects,
  cardToTask,
  findCardFile,
  readAiosCardFile,
  readAiosTasks,
  resolveMember,
  type AiosCardCache,
  type AiosCardPatch,
} from "./aiosCards.ts";
import { makeAiosCardReader } from "./aiosCardReader.ts";
import {
  type AiosWorkspaceState,
  listAiosWorkspaces,
  resolveWorkspaceRoot,
  workspaceForPath,
  writeWorkspaceFile,
} from "./aiosWorkspaces.ts";
import { planSharedSync, publicCopy } from "./sharedSync.ts";
import * as NodeCrypto from "node:crypto";
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

const LIMIT = 200;
const SYNC_INTERVAL_MS = 60_000;
const DATABASE_VERSION = 1;
// Clients poll the board every 10 s. A successful read is shared for 5 s, so
// concurrent pollers of one project cost one gh round. Failures back off
// (10 s, 20 s, ... capped at 2 min) so a broken repo does not spawn gh on every poll.
const LIST_TTL_MS = 5_000;
const FAILURE_BACKOFF_MIN_MS = 10_000;
const FAILURE_BACKOFF_MAX_MS = 30_000;
const databaseFile = (slug: string) => `.leonidas/task-board/${slug}.json`;
const decodeIssues = Schema.decodeUnknownEffect(
  Schema.fromJsonString(Schema.Array(TaskBoardIssue)),
);
const decodeDatabase = Schema.decodeUnknownSync(TaskBoardProjectDatabase);

type BoardProject = {
  readonly projectId: Project["id"];
  readonly name: string;
  readonly slug: string;
  readonly workspaceRoot: string;
  readonly repository: string;
  readonly owner: string;
  readonly repo: string;
};

// Structural equality so a freshly built BoardProject hits the same cache entry.
class BoardProjectKey extends Data.Class<BoardProject> {}

type Database = typeof TaskBoardProjectDatabase.Type;
type LoadedDatabase = { readonly data: Database; readonly sha: string | null };
type GhResult = {
  readonly stdout: string;
  readonly stderr: string;
  readonly code: number;
  readonly timedOut: boolean;
};

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || "project"
  );
}

function toBoardProject(project: Project): BoardProject {
  const repository = githubRepository(project);
  if (!repository) {
    throw new TaskBoardReadError({ reason: "repository_not_supported", cause: project.id });
  }
  const [owner, repo] = repository.split("/");
  return {
    projectId: project.id,
    name: project.title,
    slug: slugify(project.title),
    workspaceRoot: project.workspaceRoot,
    repository,
    owner: owner!,
    repo: repo!,
  };
}

function summary(tasks: ReadonlyArray<TaskBoardTask>) {
  return {
    total: tasks.length,
    todo: tasks.filter((task) => task.status === "todo").length,
    inProgress: tasks.filter((task) => task.status === "in_progress").length,
    review: tasks.filter((task) => task.status === "review").length,
    blocked: tasks.filter((task) => task.status === "blocked").length,
    done: tasks.filter((task) => task.status === "done").length,
  };
}

function priorityFromLabels(
  labels: ReadonlyArray<{ readonly name: string }>,
): TaskBoardTaskPriority {
  const names = labels.map((label) => label.name.toLowerCase());
  if (names.some((name) => name.includes("critical"))) return "critical";
  if (names.some((name) => name.includes("high"))) return "high";
  if (names.some((name) => name.includes("low"))) return "low";
  return "medium";
}

const OPEN_STATUSES: ReadonlyArray<TaskBoardTaskStatus> = [
  "todo",
  "in_progress",
  "review",
  "blocked",
];
const isOpen = (task: TaskBoardTask) => OPEN_STATUSES.includes(task.status);

function githubRepository(project: Project): string | null {
  const identity = project.repositoryIdentity;
  // Fork collaboration belongs to origin. The canonical identity can describe upstream.
  if (identity?.origin) {
    return parseGitHubRepositoryNameWithOwnerFromRemoteUrl(
      `https://${identity.origin.canonicalKey}`,
    );
  }
  return identity && identity.provider === "github" && identity.owner && identity.name
    ? `${identity.owner}/${identity.name}`
    : null;
}

/** The slug cards use for a Leonidas project: its folder under `projects/`, else its slugified title. */
const MAX_RECENT_COMPLETIONS = 20;

export function aiosSlugFor(project: Project): string {
  const root = project.workspaceRoot.replace(/\\/g, "/").replace(/\/+$/, "");
  const inProjects = NodePath.posix.basename(NodePath.posix.dirname(root)) === "projects";
  return inProjects ? NodePath.posix.basename(root).toLowerCase() : slugify(project.title);
}

/** Which workspace a request reads: by id (absent means the default workspace) or by project. */
type WorkspaceTarget =
  | { readonly workspaceId?: string | null | undefined }
  | { readonly project: { readonly workspaceRoot: string } };

function titleCase(slug: string): string {
  return slug
    .split(/[-_\s/]+/)
    .filter(Boolean)
    .map((word) => word[0]!.toUpperCase() + word.slice(1))
    .join(" ");
}

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

const agentLabel = (agent: TaskBoardAgent | undefined): string | undefined => {
  const label = [agent?.providerInstanceId, agent?.model].filter(Boolean).join("/");
  return label || undefined;
};

const storageError = (message: string) =>
  new TaskBoardOperationError({ reason: "storage_error", message });

/** Writes next to the card, then renames over it, so a reader never sees half a card. */
function writeCardAtomically(file: string, contents: string): void {
  const real = NodeFS.realpathSync(file);
  const temp = NodePath.join(
    NodePath.dirname(real),
    `.${NodePath.basename(real)}.${NodeCrypto.randomUUID()}.tmp`,
  );
  try {
    NodeFS.writeFileSync(temp, contents, "utf8");
    NodeFS.renameSync(temp, real);
  } catch (error) {
    NodeFS.rmSync(temp, { force: true });
    throw error;
  }
}

/** Sections are the AIOS project folders, every slug a card names, and every Leonidas project. */
function buildWorkspace(input: {
  readonly root: string | null;
  readonly member: string;
  readonly checkedAt: number;
  readonly projects: ReadonlyArray<Project>;
  readonly discovered: ReadonlyArray<{ readonly slug: string; readonly name: string }>;
  readonly tasks: ReadonlyArray<TaskBoardTask>;
  readonly roadmaps?: ReadonlyArray<TaskBoardRoadmapType>;
  readonly team?: ReadonlyArray<TaskBoardTeamMember>;
}): TaskBoardWorkspaceSnapshot {
  const sections = new Map<string, { slug: string; name: string; project: Project | null }>();
  for (const found of input.discovered) {
    const slug = found.slug.toLowerCase();
    sections.set(slug, { slug, name: found.name, project: null });
  }
  const counts = new Map<string, { total: number; open: number }>();
  for (const task of input.tasks) {
    const slug = task.projectSlug?.toLowerCase();
    if (!slug) continue;
    if (!sections.has(slug)) sections.set(slug, { slug, name: titleCase(slug), project: null });
    const count = counts.get(slug) ?? { total: 0, open: 0 };
    count.total++;
    if (isOpen(task) && task.kind !== "agent_run") count.open++;
    counts.set(slug, count);
  }
  for (const project of input.projects) {
    const slug = aiosSlugFor(project);
    const section = sections.get(slug);
    if (!section) sections.set(slug, { slug, name: project.title, project });
    else if (
      !section.project ||
      (!githubRepository(section.project) && githubRepository(project))
    ) {
      section.project = project;
    }
  }
  const projects = [...sections.values()]
    .flatMap((section) => {
      const count = counts.get(section.slug) ?? { total: 0, open: 0 };
      if (count.total === 0 && !section.project) return [];
      return [
        {
          slug: section.slug,
          name: section.name,
          projectId: section.project?.id ?? null,
          repository: section.project ? githubRepository(section.project) : null,
          total: count.total,
          open: count.open,
        },
      ];
    })
    .sort((a, b) => b.open - a.open || a.name.localeCompare(b.name));
  const tasks = [...input.tasks].sort(
    (a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id),
  );
  return {
    member: input.member,
    aiosRoot: input.root,
    aiosConnected: input.root !== null,
    checkedAt: input.checkedAt,
    projects,
    tasks,
    ...(input.roadmaps === undefined ? {} : { roadmaps: input.roadmaps }),
    ...(input.team === undefined ? {} : { team: input.team }),
  };
}

const decodeProjectRoadmap = Schema.decodeUnknownSync(Schema.fromJsonString(TaskBoardRoadmap));

function readProjectRoadmaps(projects: ReadonlyArray<Project>): Array<TaskBoardRoadmapType> {
  return projects.flatMap((project) => {
    try {
      const raw = NodeFS.readFileSync(
        NodePath.join(project.workspaceRoot, "project-roadmap.json"),
        "utf8",
      );
      const roadmap = decodeProjectRoadmap(raw);
      return [{ ...roadmap, projectSlug: aiosSlugFor(project) }];
    } catch {
      return [];
    }
  });
}

const decodeTeam = Schema.decodeUnknownSync(
  Schema.fromJsonString(Schema.Struct({ members: Schema.Array(TaskBoardTeamMember) })),
);

/**
 * The collaborators every project folder names in `leonidas.team.json`, merged by name. It is a
 * committed file, so adding a person to a project is one pull request.
 */
export function readProjectTeams(projects: ReadonlyArray<Project>): Array<TaskBoardTeamMember> {
  const byName = new Map<string, Set<string>>();
  for (const root of new Set(projects.map((project) => project.workspaceRoot))) {
    let members: ReadonlyArray<TaskBoardTeamMember>;
    try {
      members = decodeTeam(
        NodeFS.readFileSync(NodePath.join(root, "leonidas.team.json"), "utf8"),
      ).members;
    } catch {
      continue;
    }
    for (const member of members) {
      const aliases = byName.get(member.name) ?? new Set<string>();
      for (const alias of member.aliases) aliases.add(alias);
      byName.set(member.name, aliases);
    }
  }
  return [...byName].map(([name, aliases]) => ({ name, aliases: [...aliases] }));
}

/** A claim held by someone else may only be taken over or released by that person. */
function claimConflict(
  card: TaskBoardTask,
  input: { readonly claimedBy?: string | null | undefined; readonly actor: string },
): TaskBoardOperationError | null {
  const holder = card.claimedBy;
  if (!holder || input.claimedBy === undefined || sameName(holder, input.actor)) return null;
  if (input.claimedBy === null) {
    return new TaskBoardOperationError({
      reason: "claim_conflict",
      message: `Only ${holder} can release this claim.`,
    });
  }
  if (!sameName(holder, input.claimedBy)) {
    return new TaskBoardOperationError({
      reason: "already_claimed",
      message: `This task is currently claimed by ${holder}.`,
    });
  }
  return null;
}

function cardPatchFor(input: TaskBoardCardUpdateInput, card: TaskBoardTask): AiosCardPatch {
  // Claiming a card nobody started moves it to In progress; releasing an in-progress card returns it to the queue.
  const status =
    input.status ??
    (typeof input.claimedBy === "string" && card.status === "todo"
      ? "in_progress"
      : input.claimedBy === null && card.status === "in_progress"
        ? "todo"
        : undefined);
  return {
    actor: input.actor,
    status,
    priority: input.priority,
    title: input.title,
    due: input.due,
    milestone: input.milestone,
    projectSlug: input.projectSlug,
    claimedBy: input.claimedBy,
    // Claiming a task that belongs to nobody makes the claimer its owner.
    assignee:
      input.assignee !== undefined
        ? input.assignee
        : typeof input.claimedBy === "string" && !card.assignee
          ? input.claimedBy
          : undefined,
    effort: input.effort,
    labels: input.labels,
    note: input.note,
    agentLabel: agentLabel(input.agent),
    threadId: input.agent?.threadId,
  };
}

const staleRevision = () =>
  new TaskBoardOperationError({
    reason: "stale_revision",
    message: "This task changed since you opened it. Review the latest version and try again.",
  });

/**
 * The shared copy after a local edit. When a collaborator changed the copy after the card's
 * previous local version, their fields stay and only the fields this edit set are taken from the
 * card; otherwise the card wins. History is always the union of both.
 */
function mirrorCard(
  copy: TaskBoardTask,
  card: TaskBoardTask,
  input: TaskBoardCardUpdateInput,
  localBefore: number,
): TaskBoardTask {
  const base = copy.updatedAt > localBefore ? copy : card;
  const statusTouched = input.status !== undefined || input.claimedBy !== undefined;
  const merged: TaskBoardTask = {
    ...base,
    ...(input.title !== undefined ? { title: card.title } : {}),
    ...(input.due !== undefined ? { due: card.due } : {}),
    ...(input.milestone !== undefined ? { milestone: card.milestone } : {}),
    ...(input.priority !== undefined ? { priority: card.priority } : {}),
    ...(input.projectSlug !== undefined ? { projectSlug: card.projectSlug } : {}),
    ...(statusTouched
      ? {
          status: card.status,
          completedBy: card.completedBy,
          completedAt: card.completedAt,
          completionSummary: card.completionSummary,
        }
      : {}),
    ...(input.claimedBy !== undefined
      ? { claimedBy: card.claimedBy, claimedAt: card.claimedAt, claimedAgent: card.claimedAgent }
      : {}),
    ...(input.assignee !== undefined || input.claimedBy !== undefined
      ? { assignee: card.assignee ?? null }
      : {}),
    project: copy.project,
    shared: true,
    sharedBy: copy.sharedBy ?? card.sharedBy ?? null,
    sharedSync: undefined,
    sourceRoot: undefined,
    updatedAt: Math.max(copy.updatedAt, card.updatedAt),
    history: copy.history,
  };
  // The board may be public: only planning fields leave the machine (see `publicCopy`). This edit
  // still shows in the copy's activity, as who and when, without the local note or agent.
  // Each edit appends exactly one activity line to the card, so the newest entry is this edit.
  const latest = card.history.at(-1);
  const seen = (entry: TaskBoardHistoryEntry) =>
    copy.history.some(
      (other) =>
        other.actor === entry.actor &&
        other.action === entry.action &&
        other.timestamp === entry.timestamp,
    );
  const edit =
    latest && !seen(latest)
      ? [
          {
            id: latest.id,
            taskId: latest.taskId,
            action: latest.action,
            actor: latest.actor,
            timestamp: latest.timestamp,
            note: null,
          },
        ]
      : [];
  return {
    ...publicCopy(merged, copy, { projectName: copy.project, actor: copy.sharedBy ?? "" }),
    history: [...copy.history, ...edit],
  };
}

function databaseFromContents(raw: string): LoadedDatabase {
  const response = JSON.parse(raw) as { readonly content?: string; readonly sha?: string };
  if (!response.content) return { data: { version: DATABASE_VERSION, tasks: [] }, sha: null };
  const parsed = JSON.parse(
    Buffer.from(response.content.replace(/\s/g, ""), "base64").toString("utf8"),
  );
  return { data: decodeDatabase(parsed), sha: response.sha ?? null };
}

export class TaskBoardService extends Context.Service<
  TaskBoardService,
  {
    readonly list: (project: Project) => Effect.Effect<TaskBoardSnapshot, TaskBoardReadError>;
    readonly create: (
      project: Project,
      input: TaskBoardCreateInput,
    ) => Effect.Effect<TaskBoardTask, TaskBoardReadError | TaskBoardOperationError>;
    readonly claim: (
      project: Project,
      input: TaskBoardClaimInput,
    ) => Effect.Effect<TaskBoardTask, TaskBoardReadError | TaskBoardOperationError>;
    readonly release: (
      project: Project,
      input: TaskBoardReleaseInput,
    ) => Effect.Effect<TaskBoardTask, TaskBoardReadError | TaskBoardOperationError>;
    readonly complete: (
      project: Project,
      input: TaskBoardCompleteInput,
    ) => Effect.Effect<TaskBoardTask, TaskBoardReadError | TaskBoardOperationError>;
    readonly update: (
      project: Project,
      input: TaskBoardUpdateInput,
    ) => Effect.Effect<TaskBoardTask, TaskBoardReadError | TaskBoardOperationError>;
    /** Every AIOS task card, sectioned by project, read from disk with no GitHub round trip. */
    readonly workspace: (
      projects: ReadonlyArray<Project>,
      workspaceId?: string,
    ) => Effect.Effect<TaskBoardWorkspaceSnapshot, TaskBoardReadError>;
    /** Patches one AIOS card in place; falls back to the project's shared board when the card is not local. */
    readonly cardUpdate: (
      input: TaskBoardCardUpdateInput,
      projects: ReadonlyArray<Project>,
    ) => Effect.Effect<TaskBoardTask, TaskBoardReadError | TaskBoardOperationError>;
    readonly cardCreate: (
      input: TaskBoardCardCreateInput,
      projects: ReadonlyArray<Project>,
    ) => Effect.Effect<TaskBoardTask, TaskBoardReadError | TaskBoardOperationError>;
    /** Publishes (or withdraws) AIOS cards on the project's shared board. */
    readonly share: (
      project: Project,
      input: TaskBoardShareInput,
    ) => Effect.Effect<TaskBoardSnapshot, TaskBoardReadError | TaskBoardOperationError>;
    /** Saves a raw capture in the AIOS `inbox/` folder (the native root when no AIOS is found). */
    readonly inboxDrop: (
      input: InboxDropInput,
      projects: ReadonlyArray<Project>,
    ) => Effect.Effect<InboxDrop, TaskBoardOperationError>;
    /** The Command tab's Home, read from the AIOS folder; an empty Home when none is connected. */
    readonly home: (
      projects: ReadonlyArray<Project>,
      workspaceId?: string,
    ) => Effect.Effect<TaskBoardHome, TaskBoardReadError>;
    /** The AIOS folder of a workspace (default: the first ready one); null when none or unknown. */
    readonly aiosRoot: (
      projects: ReadonlyArray<Project>,
      workspaceId?: string,
    ) => Effect.Effect<string | null>;
    /** The Direction view: goals and horizons from the workspace's `ideal-state/` folder. */
    readonly direction: (
      projects: ReadonlyArray<Project>,
      workspaceId?: string,
    ) => Effect.Effect<AiosDirection, TaskBoardReadError>;
    /** Cards a workspace pack adds to the Command Home; `[]` unless the workspace is business. */
    readonly workspacePackWidgets: (
      projects: ReadonlyArray<Project>,
      workspaceId?: string,
    ) => Effect.Effect<WorkspacePackWidgetsResult>;
    /** Counts about the AIOS folder for opt-in usage analytics. */
    readonly usageShape: (
      projects: ReadonlyArray<Project>,
      workspaceId?: string,
    ) => Effect.Effect<AiosShape>;
    /** Every AIOS folder the app found, with its workspace file state (ADR-0080). */
    readonly workspaces: (
      projects: ReadonlyArray<Project>,
    ) => Effect.Effect<AiosWorkspacesListResult>;
    /** The root and type of a ready workspace by id, or `null` when no ready workspace has it. */
    readonly workspaceRoot: (
      projects: ReadonlyArray<Project>,
      workspaceId: string,
    ) => Effect.Effect<{ readonly root: string; readonly type: "personal" | "business" } | null>;
    /** The setup prompt: writes workspace.json into a listed folder that has none or a bad one. */
    readonly workspaceInit: (
      input: AiosWorkspaceInitInput,
      projects: ReadonlyArray<Project>,
    ) => Effect.Effect<AiosWorkspaceSummary, TaskBoardOperationError>;
    /** Folders that look like the user's AIOS, plus the one already confirmed. */
    readonly aiosDetect: (
      input: TaskBoardAiosDetectInput,
      projects: ReadonlyArray<Project>,
    ) => Effect.Effect<TaskBoardAiosDetectResult>;
    /** Persists the chosen AIOS folder for every client (`null` returns to auto-detection). */
    readonly aiosConfirm: (
      input: TaskBoardAiosConfirmInput,
      projects: ReadonlyArray<Project>,
    ) => Effect.Effect<TaskBoardAiosDetectResult, TaskBoardOperationError>;
    readonly inboxUndo: (
      input: InboxUndoInput,
      projects: ReadonlyArray<Project>,
    ) => Effect.Effect<{ readonly removed: boolean }, TaskBoardOperationError>;
    /** The latest task completions made through this server: the current list, then each change. */
    readonly completions: Stream.Stream<TaskBoardCompletions>;
    /** The focus list in `<AIOS>/memory/focus.md` (the native root when no AIOS is found). */
    readonly focus: (
      projects: ReadonlyArray<Project>,
      target?: WorkspaceTarget,
    ) => Effect.Effect<FocusSnapshot>;
    readonly focusUpdate: (
      input: FocusUpdateInput,
      projects: ReadonlyArray<Project>,
    ) => Effect.Effect<FocusSnapshot, TaskBoardOperationError>;
    /** One file attached to a note, read from `<AIOS>/memory/focus-files/`. */
    readonly focusAttachment: (
      input: FocusAttachmentInput,
      projects: ReadonlyArray<Project>,
    ) => Effect.Effect<FocusAttachment, TaskBoardOperationError>;
    /** Ticks once on subscribe, then after each focus change made through this server. */
    readonly focusChanges: Stream.Stream<number>;
  }
>()("t3/taskBoard/TaskBoardService") {}

const make = Effect.gen(function* () {
  const processes = yield* ProcessRunner.ProcessRunner;
  const config = yield* Effect.serviceOption(ServerConfig);
  const nativeRoot = Option.isSome(config)
    ? NodePath.join(config.value.stateDir, "task-board")
    : null;
  const settings = yield* Effect.serviceOption(ServerSettingsService);
  // The folder the user confirmed; the task board reads it before any detected folder.
  let confirmedRoot: string | undefined;
  if (Option.isSome(settings)) {
    const current = yield* settings.value.getSettings.pipe(Effect.option);
    confirmedRoot = Option.isSome(current) ? current.value.aiosRoot || undefined : undefined;
  }
  // Kept short: a client compares ids against what it already saw, so it only needs recent ones.
  const recentCompletions = yield* SubscriptionRef.make<TaskBoardCompletions>([]);
  const announce = (task: TaskBoardTask, actor: string, byAgent: boolean, at: number) =>
    SubscriptionRef.update(recentCompletions, (list) => {
      const completion: TaskBoardCompletion = {
        id: NodeCrypto.randomUUID(),
        taskId: task.id,
        title: task.title,
        projectSlug: task.projectSlug ?? null,
        actor,
        byAgent,
        completedAt: at,
      };
      return [...list, completion].slice(-MAX_RECENT_COMPLETIONS);
    });
  const announceTransitions = (
    before: ReadonlyArray<TaskBoardTask>,
    after: ReadonlyArray<TaskBoardTask>,
  ) =>
    Effect.forEach(
      after.filter(
        (task) =>
          task.status === "done" && before.find((prior) => prior.id === task.id)?.status !== "done",
      ),
      (task) => {
        const last = task.history.at(-1);
        return announce(
          task,
          task.completedBy ?? last?.actor ?? task.claimedBy ?? "unknown",
          last?.agent !== undefined,
          task.completedAt ?? task.updatedAt,
        );
      },
      { discard: true },
    );

  // ADR-0080: every Command read and card write resolves its AIOS root here, never by itself.
  const workspaceHints = (projects: ReadonlyArray<{ readonly workspaceRoot: string }>) => [
    confirmedRoot,
    process.env.LEONIDAS_AIOS_ROOT,
    process.env.AIOS_ROOT,
    ...projects.map((project) => project.workspaceRoot),
  ];

  const scopeFor = (projects: ReadonlyArray<Project>, target: WorkspaceTarget = {}) => {
    const workspaces = listAiosWorkspaces(workspaceHints(projects));
    const defaultRoot = resolveWorkspaceRoot(workspaces, undefined);
    const root =
      "project" in target
        ? (workspaceForPath(workspaces, target.project.workspaceRoot)?.root ?? defaultRoot)
        : resolveWorkspaceRoot(workspaces, target.workspaceId);
    const slugOwner = new Map<string, string>();
    for (const project of projects) {
      const owner = workspaceForPath(workspaces, project.workspaceRoot);
      const slug = aiosSlugFor(project);
      // On a slug clash across workspaces the default workspace keeps the card: native cards
      // predate workspaces, and a business card made with a workspace id lives in its own AIOS.
      if (owner && (!slugOwner.has(slug) || owner.root === defaultRoot)) {
        slugOwner.set(slug, owner.root);
      }
    }
    // Card callers with no workspace id (TaskAutoLog, MCP board tools, old clients) keep the
    // pre-workspace card view. Focus uses its file's workspace, including the default file.
    const scoped = "project" in target || Boolean(target.workspaceId);
    // App-owned (native) cards belong to the workspace that holds their project, else the default.
    // A card made for a known project keys by that project's id; older cards key by slug.
    const idOwner = (task: TaskBoardTask) => {
      const project = task.projectId
        ? projects.find((candidate) => candidate.id === task.projectId)
        : undefined;
      return project ? workspaceForPath(workspaces, project.workspaceRoot)?.root : undefined;
    };
    const keepNative = (task: TaskBoardTask) =>
      !scoped ||
      workspaces.length === 0 ||
      (root !== null &&
        (idOwner(task) ?? slugOwner.get(task.projectSlug?.toLowerCase() ?? "") ?? defaultRoot) ===
          root);
    // An app project belongs to the workspace that holds its folder, else the default.
    const inScope = (project: { readonly workspaceRoot: string }) =>
      !scoped ||
      workspaces.length === 0 ||
      (root !== null &&
        (workspaceForPath(workspaces, project.workspaceRoot)?.root ?? defaultRoot) === root);
    return { workspaces, defaultRoot, root, keepNative, inScope };
  };

  const rootForProject = (project: { readonly workspaceRoot: string }) => {
    const workspaces = listAiosWorkspaces(workspaceHints([project]));
    return (
      workspaceForPath(workspaces, project.workspaceRoot)?.root ??
      resolveWorkspaceRoot(workspaces, undefined)
    );
  };

  const unknownWorkspace = (target: WorkspaceTarget, root: string | null) =>
    !("project" in target) && Boolean(target.workspaceId) && root === null;

  const runGh = (args: ReadonlyArray<string>, allowNotFound = false) =>
    processes
      .run({ command: "gh", args, timeout: "20 seconds", maxOutputBytes: 4 * 1024 * 1024 })
      .pipe(
        Effect.mapError((cause) => new TaskBoardReadError({ reason: "unavailable", cause })),
        Effect.flatMap((result) => {
          if (result.code === 0 && !result.timedOut) return Effect.succeed(result);
          if (allowNotFound && /HTTP 404|Not Found/i.test(result.stderr))
            return Effect.succeed(null);
          if (/disabled issues/i.test(result.stderr)) {
            return Effect.fail(
              new TaskBoardReadError({ reason: "issues_disabled", cause: result }),
            );
          }
          return Effect.logWarning("GitHub request for the shared task board failed", {
            args: args.slice(0, 3).join(" "),
            stderr: result.stderr.slice(0, 500),
          }).pipe(
            Effect.andThen(
              Effect.fail(new TaskBoardReadError({ reason: "request_failed", cause: result })),
            ),
          );
        }),
      );

  const readIssues = (project: BoardProject) =>
    runGh([
      "issue",
      "list",
      "--repo",
      project.repository,
      "--state",
      "all",
      "--limit",
      String(LIMIT),
      "--json",
      "number,title,url,body,createdAt,updatedAt,state,labels,assignees",
    ]).pipe(
      Effect.flatMap((result) =>
        decodeIssues(result!.stdout).pipe(
          Effect.mapError((cause) => new TaskBoardReadError({ reason: "invalid_response", cause })),
        ),
      ),
    );

  const branchName = (project: BoardProject) =>
    `task-board-${NodeCrypto.createHash("sha256").update(`${project.repository.toLowerCase()}/${project.slug}`).digest("hex").slice(0, 20)}`;

  const findBranch = (project: BoardProject) =>
    runGh(
      ["api", `repos/${project.repository}/git/matching-refs/heads/${branchName(project)}`],
      true,
    ).pipe(
      Effect.flatMap((result) => {
        if (!result) return Effect.succeed(false);
        try {
          const refs = JSON.parse(result.stdout) as Array<{ readonly ref: string }>;
          return Effect.succeed(
            refs.some((ref) => ref.ref === `refs/heads/${branchName(project)}`),
          );
        } catch (cause) {
          return Effect.fail(new TaskBoardReadError({ reason: "invalid_response", cause }));
        }
      }),
    );

  const ensureBranch = (project: BoardProject) =>
    Effect.gen(function* () {
      if (yield* findBranch(project)) return;
      const repository = yield* runGh(["api", `repos/${project.repository}`]);
      let defaultBranch: string;
      try {
        defaultBranch = (JSON.parse(repository!.stdout) as { default_branch: string })
          .default_branch;
      } catch (cause) {
        return yield* new TaskBoardReadError({ reason: "invalid_response", cause });
      }
      const base = yield* runGh([
        "api",
        `repos/${project.repository}/git/ref/heads/${defaultBranch}`,
      ]);
      let sha: string;
      try {
        sha = (JSON.parse(base!.stdout) as { object: { sha: string } }).object.sha;
      } catch (cause) {
        return yield* new TaskBoardReadError({ reason: "invalid_response", cause });
      }
      const created = yield* processes
        .run({
          command: "gh",
          args: [
            "api",
            "--method",
            "POST",
            `repos/${project.repository}/git/refs`,
            "--raw-field",
            `ref=refs/heads/${branchName(project)}`,
            "--raw-field",
            `sha=${sha}`,
          ],
          timeout: "20 seconds",
          maxOutputBytes: 64 * 1024,
        })
        .pipe(Effect.mapError((cause) => new TaskBoardReadError({ reason: "unavailable", cause })));
      if (
        created.code !== 0 &&
        !/already exists|Reference already exists|HTTP 422/i.test(created.stderr)
      ) {
        return yield* new TaskBoardReadError({
          reason: /HTTP 403|Resource not accessible|write access/i.test(created.stderr)
            ? "write_access_required"
            : "request_failed",
          cause: created,
        });
      }
      if (created.code !== 0 && !(yield* findBranch(project))) {
        return yield* new TaskBoardReadError({ reason: "request_failed", cause: created });
      }
    });

  const loadDatabase = (project: BoardProject) =>
    Effect.gen(function* () {
      const exists = yield* findBranch(project);
      if (!exists)
        return {
          data: { version: DATABASE_VERSION, tasks: [] },
          sha: null,
        } satisfies LoadedDatabase;
      const response = yield* runGh(
        [
          "api",
          `repos/${project.repository}/contents/${databaseFile(project.slug)}`,
          "--method",
          "GET",
          "-f",
          `ref=${branchName(project)}`,
        ],
        true,
      );
      if (!response)
        return {
          data: { version: DATABASE_VERSION, tasks: [] },
          sha: null,
        } satisfies LoadedDatabase;
      try {
        return databaseFromContents(response.stdout);
      } catch (cause) {
        return yield* new TaskBoardReadError({ reason: "invalid_response", cause });
      }
    });

  const writeDatabase = (
    project: BoardProject,
    tasks: ReadonlyArray<TaskBoardTask>,
    sha: string | null,
  ) =>
    Effect.gen(function* () {
      const path = databaseFile(project.slug);
      const content = Buffer.from(
        JSON.stringify({ version: DATABASE_VERSION, tasks }, null, 2),
      ).toString("base64");
      // The whole board rides in the request body on stdin: as a command-line argument it passes
      // the Windows limit (about 32 KB) once a project has a few dozen cards.
      const body = JSON.stringify({
        message: "Update shared task board",
        branch: branchName(project),
        content,
        ...(sha ? { sha } : {}),
      });
      const result = yield* processes
        .run({
          command: "gh",
          args: [
            "api",
            "--method",
            "PUT",
            `repos/${project.repository}/contents/${path}`,
            "--input",
            "-",
          ],
          stdin: body,
          timeout: "30 seconds",
          maxOutputBytes: 64 * 1024,
        })
        .pipe(Effect.mapError((cause) => new TaskBoardReadError({ reason: "unavailable", cause })));
      if (result.code === 0 && !result.timedOut) return true;
      if (/HTTP 409|sha.*(does not match|must be provided)|already exists/i.test(result.stderr))
        return false;
      yield* Effect.logWarning("Could not write the shared task board", {
        stderr: result.stderr.slice(0, 500),
      });
      return yield* new TaskBoardReadError({
        reason: /HTTP 403|Resource not accessible|write access/i.test(result.stderr)
          ? "write_access_required"
          : "request_failed",
        cause: result,
      });
    });

  const issuesAsTasks = (
    project: BoardProject,
    issues: ReadonlyArray<TaskBoardIssue>,
  ): ReadonlyArray<TaskBoardTask> =>
    issues.map((issue) => {
      const created = issue.createdAt ? Date.parse(issue.createdAt) : Date.parse(issue.updatedAt);
      return {
        id: `github-${issue.number}`,
        project: project.name,
        title: issue.title,
        description: issue.body ?? "",
        status: issue.state === "CLOSED" ? "done" : "todo",
        priority: priorityFromLabels(issue.labels),
        claimedBy: null,
        claimedAt: null,
        claimedAgent: null,
        completedBy: null,
        completedAt: issue.state === "CLOSED" ? Date.parse(issue.updatedAt) : null,
        completionSummary: null,
        createdAt: Number.isFinite(created) ? created : 0,
        updatedAt: Date.parse(issue.updatedAt) || 0,
        labels: issue.labels.map((label) => label.name),
        source: "github_issue",
        sourceId: String(issue.number),
        sourceFile: null,
        issueUrl: issue.url,
        history: [
          {
            id: `github-${issue.number}-created`,
            taskId: `github-${issue.number}`,
            action: "imported",
            actor: "GitHub issue",
            timestamp: Number.isFinite(created) ? created : 0,
            note: "Imported from the project's issue tracker",
          },
        ],
      };
    });

  const mergeTasks = (
    project: BoardProject,
    stored: ReadonlyArray<TaskBoardTask>,
    issues: ReadonlyArray<TaskBoardIssue>,
  ) => {
    const all = new Map(issuesAsTasks(project, issues).map((task) => [task.id, task] as const));
    for (const task of stored) all.set(task.id, { ...task, project: project.name });
    // Everything on the project's shared board is visible to collaborators.
    return [...all.values()]
      .map((task) => ({ ...task, shared: true }))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  };

  const snapshot = (
    project: BoardProject,
    tasks: ReadonlyArray<TaskBoardTask>,
    issues: ReadonlyArray<TaskBoardIssue>,
  ) => {
    const aiosRoot = rootForProject(project);
    return Effect.map(
      Clock.currentTimeMillis,
      (checkedAt) =>
        ({
          projectId: project.projectId,
          project: project.name,
          repository: project.repository,
          tasks,
          issues,
          checkedAt,
          limit: LIMIT,
          aiosConnected: aiosRoot !== null,
          summary: summary(tasks),
        }) satisfies TaskBoardSnapshot,
    );
  };

  const readBoard = (project: BoardProject) =>
    Effect.gen(function* () {
      const [database, issues] = yield* Effect.all([loadDatabase(project), readIssues(project)]);
      return yield* snapshot(project, mergeTasks(project, database.data.tasks, issues), issues);
    });

  // timeToLive reads the failure streak synchronously, so the streaks live in a plain Map.
  const failureStreaks = new Map<string, number>();
  const boardCache = yield* Cache.makeWith(readBoard, {
    capacity: 64,
    timeToLive: (exit, project) => {
      if (Exit.isSuccess(exit)) {
        failureStreaks.delete(project.projectId);
        return Duration.millis(LIST_TTL_MS);
      }
      const streak = (failureStreaks.get(project.projectId) ?? 0) + 1;
      failureStreaks.set(project.projectId, streak);
      return Duration.millis(
        Math.min(FAILURE_BACKOFF_MIN_MS * 2 ** (streak - 1), FAILURE_BACKOFF_MAX_MS),
      );
    },
  });

  const list = (projectInput: Project) =>
    projectContext(projectInput).pipe(
      Effect.flatMap((project) => Cache.get(boardCache, new BoardProjectKey(project))),
      Effect.tap((snapshot) => scheduleSync(projectInput, snapshot.tasks)),
    );

  // Each read of a shared board checks, at most once a minute per project, that this machine's
  // cards are on it. The write runs in the background, so a read never waits for GitHub.
  const lastSync = new Map<string, number>();
  const scheduleSync = (projectInput: Project, board: ReadonlyArray<TaskBoardTask>) =>
    Effect.gen(function* () {
      const now = yield* Clock.currentTimeMillis;
      if (now - (lastSync.get(projectInput.id) ?? 0) < SYNC_INTERVAL_MS) return;
      lastSync.set(projectInput.id, now);
      const slug = aiosSlugFor(projectInput);
      const local = (yield* readLocalCards([projectInput], now, { project: projectInput })).filter(
        (card) => card.projectSlug?.toLowerCase() === slug,
      );
      const actor = resolveMember();
      const boardProject = yield* projectContext(projectInput);
      if (planSharedSync({ local, board, projectName: boardProject.name, actor }) === null) return;
      const outcome = yield* persist(boardProject, (tasks) => {
        const plan = planSharedSync({ local, board: tasks, projectName: boardProject.name, actor });
        return plan === null ? { tasks, result: null } : { tasks: plan.tasks, result: plan };
      });
      if (outcome) {
        yield* Effect.logInfo("Synced cards to the shared task board", {
          project: slug,
          published: outcome.published,
          refreshed: outcome.refreshed,
          withdrawn: outcome.withdrawn,
        });
      }
    }).pipe(
      Effect.catchCause((cause) =>
        Effect.logWarning("Could not sync cards to the shared task board", { cause }),
      ),
      Effect.forkDetach,
      Effect.asVoid,
    );

  const persist = <A>(
    project: BoardProject,
    apply: (tasks: ReadonlyArray<TaskBoardTask>) => {
      readonly tasks: ReadonlyArray<TaskBoardTask>;
      readonly result: A;
    },
  ) =>
    Effect.gen(function* () {
      yield* ensureBranch(project);
      for (let attempt = 0; attempt < 6; attempt++) {
        const [database, issues] = yield* Effect.all([loadDatabase(project), readIssues(project)]);
        const existingTasks = mergeTasks(project, database.data.tasks, issues);
        const outcome = yield* Effect.try({
          try: () => apply(existingTasks),
          catch: (cause) =>
            cause instanceof TaskBoardOperationError
              ? cause
              : new TaskBoardOperationError({ reason: "invalid_data", message: String(cause) }),
        });
        if (outcome.tasks === existingTasks) return outcome.result;
        if (yield* writeDatabase(project, outcome.tasks, database.sha)) {
          yield* announceTransitions(existingTasks, outcome.tasks);
          return outcome.result;
        }
      }
      return yield* new TaskBoardReadError({
        reason: "request_failed",
        cause: "Concurrent task edits; retry the operation.",
      });
    }).pipe(Effect.ensuring(Cache.invalidate(boardCache, new BoardProjectKey(project))));

  const record = (
    task: TaskBoardTask,
    action: TaskBoardHistoryEntry["action"],
    actor: string,
    timestamp: number,
    note: string | null,
    agent?: TaskBoardAgent,
  ): TaskBoardTask => ({
    ...task,
    updatedAt: timestamp,
    history: [
      ...task.history,
      {
        id: NodeCrypto.randomUUID(),
        taskId: task.id,
        action,
        actor,
        timestamp,
        note,
        ...(agent ? { agent } : {}),
      },
    ],
  });

  const projectContext = (projectInput: Project) =>
    Effect.try({
      try: () => toBoardProject(projectInput),
      catch: (cause) =>
        cause instanceof TaskBoardReadError
          ? cause
          : new TaskBoardReadError({ reason: "repository_not_supported", cause }),
    });

  const create = (projectInput: Project, input: TaskBoardCreateInput) =>
    Effect.gen(function* () {
      const project = yield* projectContext(projectInput);
      const now = yield* Clock.currentTimeMillis;
      const id = `task-${NodeCrypto.randomUUID()}`;
      const task: TaskBoardTask = {
        id,
        project: project.name,
        title: input.title,
        description: input.description ?? "",
        status: "todo",
        priority: input.priority ?? "medium",
        claimedBy: null,
        claimedAt: null,
        claimedAgent: null,
        completedBy: null,
        completedAt: null,
        completionSummary: null,
        createdAt: now,
        updatedAt: now,
        labels: input.labels ?? [project.slug],
        source: "board",
        sourceId: null,
        sourceFile: null,
        issueUrl: null,
        history: [
          {
            id: NodeCrypto.randomUUID(),
            taskId: id,
            action: "created",
            actor: input.actor,
            timestamp: now,
            note: null,
          },
        ],
      };
      return yield* persist(project, (tasks) => ({ tasks: [...tasks, task], result: task }));
    });

  const claim = (projectInput: Project, input: TaskBoardClaimInput) =>
    Effect.gen(function* () {
      const project = yield* projectContext(projectInput);
      const now = yield* Clock.currentTimeMillis;
      return yield* persist(project, (tasks) => {
        const existing = tasks.find((task) => task.id === input.taskId);
        if (!existing)
          throw new TaskBoardOperationError({
            reason: "task_not_found",
            message: "Task not found.",
          });
        if (existing.status === "done")
          throw new TaskBoardOperationError({
            reason: "task_completed",
            message: "Reopen this task before claiming it.",
          });
        if (existing.claimedBy) {
          if (existing.claimedBy === input.actor) return { tasks, result: existing };
          throw new TaskBoardOperationError({
            reason: "already_claimed",
            message: `This task is currently claimed by ${existing.claimedBy}.`,
          });
        }
        const updated = record(
          {
            ...existing,
            status: "in_progress",
            claimedBy: input.actor,
            claimedAt: now,
            claimedAgent: input.agent ?? null,
          },
          "claimed",
          input.actor,
          now,
          "Claimed task",
          input.agent,
        );
        return {
          tasks: tasks.map((task) => (task.id === existing.id ? updated : task)),
          result: updated,
        };
      });
    });

  const release = (projectInput: Project, input: TaskBoardReleaseInput) =>
    Effect.gen(function* () {
      const project = yield* projectContext(projectInput);
      const now = yield* Clock.currentTimeMillis;
      return yield* persist(project, (tasks) => {
        const existing = tasks.find((task) => task.id === input.taskId);
        if (!existing)
          throw new TaskBoardOperationError({
            reason: "task_not_found",
            message: "Task not found.",
          });
        if (!existing.claimedBy)
          throw new TaskBoardOperationError({
            reason: "not_claimed",
            message: "This task has no active claim.",
          });
        if (existing.claimedBy !== input.actor)
          throw new TaskBoardOperationError({
            reason: "claim_conflict",
            message: `Only ${existing.claimedBy} can release this claim.`,
          });
        const updated = record(
          { ...existing, status: "todo", claimedBy: null, claimedAt: null, claimedAgent: null },
          "released",
          input.actor,
          now,
          "Released task back to the queue",
        );
        return {
          tasks: tasks.map((task) => (task.id === existing.id ? updated : task)),
          result: updated,
        };
      });
    });

  const complete = (projectInput: Project, input: TaskBoardCompleteInput) =>
    Effect.gen(function* () {
      const project = yield* projectContext(projectInput);
      const now = yield* Clock.currentTimeMillis;
      return yield* persist(project, (tasks) => {
        const existing = tasks.find((task) => task.id === input.taskId);
        if (!existing)
          throw new TaskBoardOperationError({
            reason: "task_not_found",
            message: "Task not found.",
          });
        if (existing.claimedBy && existing.claimedBy !== input.actor)
          throw new TaskBoardOperationError({
            reason: "claim_conflict",
            message: `Only ${existing.claimedBy} can complete this task.`,
          });
        const completed: TaskBoardTask = {
          ...existing,
          status: "done",
          completedBy: input.actor,
          completedAt: now,
          completionSummary: input.summary ?? null,
        };
        const updated = record(
          completed,
          "completed",
          input.actor,
          now,
          input.summary ?? null,
          existing.claimedAgent ?? undefined,
        );
        return {
          tasks: tasks.map((task) => (task.id === existing.id ? updated : task)),
          result: updated,
        };
      });
    });

  const update = (projectInput: Project, input: TaskBoardUpdateInput) =>
    Effect.gen(function* () {
      const project = yield* projectContext(projectInput);
      const now = yield* Clock.currentTimeMillis;
      return yield* persist(project, (tasks) => {
        const existing = tasks.find((task) => task.id === input.taskId);
        if (!existing)
          throw new TaskBoardOperationError({
            reason: "task_not_found",
            message: "Task not found.",
          });
        const reopened =
          existing.status === "done" && input.status !== undefined && input.status !== "done";
        const status = input.status ?? existing.status;
        const updated: TaskBoardTask = {
          ...existing,
          title: input.title ?? existing.title,
          description: input.description ?? existing.description,
          status,
          priority: input.priority ?? existing.priority,
          labels: input.labels ?? existing.labels,
          ...(reopened ? { completedBy: null, completedAt: null, completionSummary: null } : {}),
        };
        const action =
          status === "blocked"
            ? "blocked"
            : reopened
              ? "reopened"
              : input.note
                ? "progress"
                : "updated";
        const recorded = record(
          updated,
          action,
          input.actor,
          now,
          input.note ?? null,
          existing.claimedAgent ?? undefined,
        );
        return {
          tasks: tasks.map((task) => (task.id === existing.id ? recorded : task)),
          result: recorded,
        };
      });
    });

  const cardCache: AiosCardCache = new Map();
  const cardReader = makeAiosCardReader(cardCache);
  yield* Effect.addFinalizer(() => Effect.sync(cardReader.close));

  /** Where a new card goes: the native board for the default workspace, else that workspace's AIOS. */
  const writeRootFor = (projects: ReadonlyArray<Project>, target: WorkspaceTarget = {}) => {
    const scope = scopeFor(projects, target);
    if (unknownWorkspace(target, scope.root)) return null;
    return scope.root !== null && scope.root !== scope.defaultRoot
      ? scope.root
      : (nativeRoot ?? scope.root);
  };

  const rootOrFail = (projects: ReadonlyArray<Project>, target: WorkspaceTarget = {}) => {
    const root = writeRootFor(projects, target);
    return root === null
      ? Effect.fail(
          new TaskBoardReadError({ reason: "aios_not_found", cause: "No AIOS tasks folder" }),
        )
      : Effect.succeed(root);
  };

  const readCards = (root: string, now: number) =>
    Effect.try({
      try: () =>
        cardReader.read(root, now).map((task) => ({
          ...task,
          sourceRoot: root,
        })),
      catch: (cause) => new TaskBoardReadError({ reason: "request_failed", cause }),
    });

  const readLocalCards = (
    projects: ReadonlyArray<Project>,
    now: number,
    target: WorkspaceTarget = {},
  ) => {
    const scope = scopeFor(projects, target);
    const roots = [nativeRoot, scope.root].filter((root): root is string => root !== null);
    return Effect.forEach([...new Set(roots)], (root) => readCards(root, now)).pipe(
      // Native storage wins when an imported copy has the same id.
      Effect.map((collections) => [
        ...new Map(
          collections
            .flat()
            .filter((task) => task.sourceRoot !== nativeRoot || scope.keepNative(task))
            .toReversed()
            .map((task) => [task.id, task]),
        ).values(),
      ]),
    );
  };

  const workspace = (projects: ReadonlyArray<Project>, workspaceId?: string) =>
    Effect.gen(function* () {
      const now = yield* Clock.currentTimeMillis;
      const scope = scopeFor(projects, { workspaceId });
      const root = scope.root;
      const tasks = yield* readLocalCards(projects, now, { workspaceId });
      // Only this workspace's projects reach the board, so no other shared board loads.
      const scoped = projects.filter(scope.inScope);
      return buildWorkspace({
        root,
        member: resolveMember(),
        checkedAt: now,
        projects: scoped,
        discovered: root ? discoverProjects(root) : [],
        tasks,
        roadmaps: readProjectRoadmaps(scoped),
        team: readProjectTeams(scoped),
      });
    });

  const cardWriteFailure = (cause: unknown) =>
    cause instanceof TaskBoardOperationError
      ? cause
      : new TaskBoardOperationError({
          reason:
            cause instanceof Error && cause.message === "invalid_card"
              ? "invalid_card"
              : "storage_error",
          message: cause instanceof Error ? cause.message : String(cause),
        });

  /** The project whose shared board holds the collaborators' copy of a card with this slug. */
  const mirrorTarget = (projects: ReadonlyArray<Project>, slug: string | null | undefined) => {
    const wanted = slug?.toLowerCase();
    return wanted
      ? projects.find(
          (candidate) => aiosSlugFor(candidate) === wanted && githubRepository(candidate) !== null,
        )
      : undefined;
  };

  /** Keeps the collaborators' copy of a published card in step with the local card. */
  const mirrorShared = (
    project: Project,
    card: TaskBoardTask,
    input: TaskBoardCardUpdateInput,
    localBefore: number,
  ) =>
    projectContext(project).pipe(
      Effect.flatMap((boardProject) =>
        persist(boardProject, (tasks) => {
          const copy = tasks.find((task) => task.id === card.id);
          if (!copy) return { tasks, result: undefined };
          const mirrored = mirrorCard(copy, card, input, localBefore);
          return {
            tasks: tasks.map((task) => (task.id === card.id ? mirrored : task)),
            result: undefined,
          };
        }),
      ),
    );

  /** Records the card's shared-board sync state and returns the card as it is now on disk. */
  const markSync = (
    root: string,
    file: string,
    card: TaskBoardTask,
    actor: string,
    sharedSync: "failed" | null,
    now: number,
  ) =>
    Effect.try({
      try: () => {
        const raw = NodeFS.readFileSync(file, "utf8");
        const next = applyCardPatch(raw, { actor, sharedSync }, now);
        if (next !== raw) writeCardAtomically(file, next);
        cardReader.invalidate(root);
        const read = readAiosCardFile(root, file, { now, cache: cardCache });
        return read?.id === card.id ? { ...read, sourceRoot: root } : card;
      },
      catch: cardWriteFailure,
    }).pipe(
      // The card on disk still says "pending", which stays true until a retry succeeds.
      Effect.orElseSucceed((): TaskBoardTask => ({ ...card, sharedSync: sharedSync ?? "pending" })),
    );

  const boardCardUpdate = (projectInput: Project, input: TaskBoardCardUpdateInput) =>
    Effect.gen(function* () {
      const project = yield* projectContext(projectInput);
      const now = yield* Clock.currentTimeMillis;
      return yield* persist(project, (tasks) => {
        const existing = tasks.find((task) => task.id === input.taskId);
        if (!existing)
          throw new TaskBoardOperationError({
            reason: "task_not_found",
            message: "Task not found.",
          });
        // Checked on every attempt, so a GitHub retry re-validates against the latest board.
        if (input.expectedUpdatedAt !== undefined && existing.updatedAt !== input.expectedUpdatedAt)
          throw staleRevision();
        const conflict = claimConflict(existing, input);
        if (conflict) throw conflict;
        const status = cardPatchFor(input, existing).status ?? existing.status;
        const claimed = typeof input.claimedBy === "string";
        const released = input.claimedBy === null;
        const reopened = existing.status === "done" && status !== "done";
        const completing = status === "done" && existing.status !== "done";
        const updated: TaskBoardTask = {
          ...existing,
          title: input.title ?? existing.title,
          due: input.due === undefined ? existing.due : input.due,
          milestone: input.milestone === undefined ? existing.milestone : input.milestone,
          status,
          priority: input.priority ?? existing.priority,
          effort: input.effort === undefined ? existing.effort : input.effort,
          labels: input.labels ?? existing.labels,
          claimedBy: claimed ? input.claimedBy! : released ? null : existing.claimedBy,
          claimedAt: claimed ? now : released ? null : existing.claimedAt,
          claimedAgent: claimed ? (input.agent ?? null) : released ? null : existing.claimedAgent,
          assignee:
            input.assignee !== undefined
              ? input.assignee
              : claimed && !existing.assignee
                ? input.claimedBy!
                : (existing.assignee ?? null),
          ...(completing
            ? { completedBy: input.actor, completedAt: now, completionSummary: input.note ?? null }
            : reopened
              ? { completedBy: null, completedAt: null, completionSummary: null }
              : {}),
        };
        const action = claimed
          ? "claimed"
          : released
            ? "released"
            : completing
              ? "completed"
              : status === "blocked"
                ? "blocked"
                : reopened
                  ? "reopened"
                  : input.note
                    ? "progress"
                    : "updated";
        const recorded = record(updated, action, input.actor, now, input.note ?? null, input.agent);
        return {
          tasks: tasks.map((task) => (task.id === existing.id ? recorded : task)),
          result: recorded,
        };
      });
    });

  const cardUpdate = (input: TaskBoardCardUpdateInput, projects: ReadonlyArray<Project>) =>
    Effect.gen(function* () {
      const now = yield* Clock.currentTimeMillis;
      const card = (yield* readLocalCards(projects, now, input)).find(
        (candidate) => candidate.id === input.taskId,
      );
      // Shared boards outside this request's workspace are never a fallback or a mirror target.
      const scope = scopeFor(projects, input);
      const boardProjects = projects.filter(scope.inScope);
      const root = card?.sourceRoot;
      if (!root || !card) {
        const project = input.projectId
          ? projects.find(
              (candidate) => candidate.id === input.projectId && scope.inScope(candidate),
            )
          : undefined;
        if (!project) {
          return yield* new TaskBoardOperationError({
            reason: "task_not_found",
            message: "Task not found.",
          });
        }
        return yield* boardCardUpdate(project, input);
      }
      const target = mirrorTarget(
        boardProjects,
        input.projectSlug === undefined ? card.projectSlug : input.projectSlug,
      );
      // Checks and write run in one synchronous block against the file as it is now, so a claim or
      // revision check can never pass on a version another editor has already replaced.
      const written = yield* Effect.try({
        try: () => {
          const file = card.sourceFile ? findCardFile(root, card.sourceFile) : null;
          if (!file) {
            throw new TaskBoardOperationError({
              reason: "task_not_found",
              message: "The task card file is missing.",
            });
          }
          const raw = NodeFS.readFileSync(file, "utf8");
          const current =
            cardToTask({
              fileName: NodePath.basename(file),
              raw,
              mtimeMs: NodeFS.statSync(file).mtimeMs,
              now,
            }) ?? card;
          if (
            input.expectedUpdatedAt !== undefined &&
            current.updatedAt !== input.expectedUpdatedAt
          ) {
            throw staleRevision();
          }
          const conflict = claimConflict(current, input);
          if (conflict) throw conflict;
          const pending = current.shared === true && target !== undefined;
          writeCardAtomically(
            file,
            applyCardPatch(
              raw,
              { ...cardPatchFor(input, current), ...(pending ? { sharedSync: "pending" } : {}) },
              now,
            ),
          );
          cardReader.invalidate(root);
          const read = readAiosCardFile(root, file, { now, cache: cardCache });
          const updated = read?.id === card.id ? read : undefined;
          return updated
            ? {
                file,
                before: current.updatedAt,
                wasDone: current.status === "done",
                updated: { ...updated, sourceRoot: root },
              }
            : undefined;
        },
        catch: cardWriteFailure,
      });
      if (!written) {
        return yield* new TaskBoardOperationError({
          reason: "task_not_found",
          message: "Task not found after the update.",
        });
      }
      const { file, before, wasDone, updated } = written;
      if (!wasDone && updated.status === "done") {
        yield* announce(updated, input.actor, input.agent !== undefined, now);
      }
      const project =
        updated.shared === true ? mirrorTarget(boardProjects, updated.projectSlug) : null;
      if (!project) {
        return updated.sharedSync === "pending"
          ? yield* markSync(root, file, updated, input.actor, null, now)
          : updated;
      }
      const mirrored = yield* Effect.exit(mirrorShared(project, updated, input, before));
      if (Exit.isFailure(mirrored)) {
        yield* Effect.logWarning("Could not mirror a task card to the shared board", {
          taskId: updated.id,
          cause: mirrored.cause,
        });
      }
      return yield* markSync(
        root,
        file,
        updated,
        input.actor,
        Exit.isSuccess(mirrored) ? null : "failed",
        now,
      );
    });

  const cardCreate = (input: TaskBoardCardCreateInput, projects: ReadonlyArray<Project>) =>
    Effect.gen(function* () {
      const root = yield* rootOrFail(projects, input);
      const now = yield* Clock.currentTimeMillis;
      return yield* Effect.try({
        try: () => {
          const stableId =
            input.idempotencyKey === undefined
              ? undefined
              : `task-${NodeCrypto.createHash("sha256").update(input.idempotencyKey).digest("hex")}`;
          if (stableId !== undefined) {
            const existing = readAiosTasks(root, { now, cache: cardCache }).find(
              (card) => card.id === stableId,
            );
            if (existing) return { ...existing, sourceRoot: root };
          }
          const taskProject =
            input.projectId === undefined
              ? undefined
              : projects.find(
                  (project) =>
                    project.id === input.projectId && scopeFor(projects, input).inScope(project),
                );
          cardReader.invalidate(root);
          const created = createCardFile(
            root,
            {
              ...input,
              ...(input.projectSlug === undefined && input.projectId !== undefined
                ? {
                    projectSlug: taskProject === undefined ? null : aiosSlugFor(taskProject),
                  }
                : {}),
              projectId: taskProject?.id ?? null,
              ...(stableId !== undefined
                ? { id: stableId }
                : root === nativeRoot
                  ? { id: `task-${NodeCrypto.randomUUID()}` }
                  : {}),
            },
            now,
          );
          const task = cardToTask({
            fileName: created.fileName,
            raw: created.raw,
            mtimeMs: now,
            now,
          });
          if (!task) {
            throw new TaskBoardOperationError({
              reason: "invalid_card",
              message: "The new card could not be read back.",
            });
          }
          return { ...task, sourceRoot: root };
        },
        catch: cardWriteFailure,
      });
    });

  const inboxRoot = (projects: ReadonlyArray<Project>, target: WorkspaceTarget = {}) => {
    const root = scopeFor(projects, target).root;
    return unknownWorkspace(target, root) ? null : (root ?? nativeRoot ?? null);
  };

  const inboxDrop = (input: InboxDropInput, projects: ReadonlyArray<Project>) =>
    Effect.gen(function* () {
      const root = inboxRoot(projects, input);
      if (root === null) return yield* storageError("No folder is available for the inbox.");
      const now = yield* Clock.currentTimeMillis;
      const verdict = triageDrop(input.text, now);
      const receipt = yield* Effect.try({
        try: () => writeDrop(root, { ...input, suggested: verdict.kind }, now),
        catch: cardWriteFailure,
      });
      if (verdict.kind !== "task" || !verdict.confident) {
        return { ...receipt, kind: verdict.kind };
      }
      // The drop is already safe on disk; filing it as a task must never lose it.
      const task = yield* cardCreate(
        {
          title: verdict.title,
          due: verdict.due,
          description: `From a quick capture:\n\n${input.text.trim()}`,
          projectSlug: input.projectSlug ?? null,
          actor: input.actor,
          ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
        },
        projects,
      ).pipe(Effect.option);
      if (Option.isNone(task) || !task.value.sourceFile)
        return { ...receipt, kind: "note" as const };
      const sourceFile = task.value.sourceFile;
      yield* Effect.try({
        try: () => linkDropToTask(root, receipt.id, sourceFile),
        catch: cardWriteFailure,
      }).pipe(Effect.ignore);
      return { ...receipt, kind: "task" as const, filedTask: verdict.title };
    });

  const inboxUndo = (input: InboxUndoInput, projects: ReadonlyArray<Project>) =>
    Effect.gen(function* () {
      const root = inboxRoot(projects, input);
      if (root === null) return { removed: false };
      return yield* Effect.try({
        try: () => {
          const { removed, taskFile } = removeDrop(root, input.id);
          const cardRoot = writeRootFor(projects, input);
          const card = taskFile && cardRoot ? findCardFile(cardRoot, taskFile) : null;
          if (card) {
            NodeFS.rmSync(card);
            cardReader.invalidate();
          }
          return { removed };
        },
        catch: cardWriteFailure,
      });
    });

  const focusRevision = yield* SubscriptionRef.make(0);
  const focusPath = (projects: ReadonlyArray<Project>, target: WorkspaceTarget = {}) => {
    const root = inboxRoot(projects, target);
    return root === null ? null : focusPathFor(root);
  };
  const focusProjects = (projects: ReadonlyArray<Project>, target: WorkspaceTarget) => {
    const scope = scopeFor(projects, target);
    return projects.filter(
      (project) =>
        (workspaceForPath(scope.workspaces, project.workspaceRoot)?.root ?? scope.defaultRoot) ===
        scope.root,
    );
  };
  const focusSnapshotOf = (
    path: string | null,
    doc: ReturnType<typeof readFocusFile>,
    projects: ReadonlyArray<Project>,
  ): FocusSnapshot => {
    const bySlug = new Map(projects.map((project) => [aiosSlugFor(project), project.id] as const));
    return {
      path,
      member: resolveMember(),
      sections: doc.sections.map((section) => ({
        slug: section.slug,
        projectId: section.slug === null ? null : (bySlug.get(section.slug) ?? null),
        items: sectionItems(section),
      })),
    };
  };
  // A file that cannot be read shows as an empty list with its path, so the widget can say where it looked.
  const focus = (projects: ReadonlyArray<Project>, target: WorkspaceTarget = {}) =>
    Effect.sync(() => {
      const path = focusPath(projects, target);
      if (path === null) return { path: null, member: resolveMember(), sections: [] };
      try {
        return focusSnapshotOf(path, readFocusFile(path), focusProjects(projects, target));
      } catch {
        return { path, member: resolveMember(), sections: [] };
      }
    });

  const focusUpdate = (input: FocusUpdateInput, projects: ReadonlyArray<Project>) =>
    Effect.gen(function* () {
      const path = focusPath(projects, input);
      if (path === null) return yield* storageError("No folder is available for the focus list.");
      const scopedProjects = focusProjects(projects, input);
      if (
        input.op === "add" &&
        input.projectId !== null &&
        !scopedProjects.some((project) => project.id === input.projectId)
      ) {
        return yield* storageError("That project is not in this workspace.");
      }
      const snapshot = yield* Effect.try({
        try: () => {
          const doc = readFocusFile(path);
          let next: typeof doc | null;
          if (input.op === "add") {
            const project = input.projectId
              ? scopedProjects.find((candidate) => candidate.id === input.projectId)
              : undefined;
            const lines = storeFocusFiles(memoryDirOf(path), input.files ?? []);
            next = addFocusItem(
              doc,
              project ? aiosSlugFor(project) : null,
              [input.text, ...lines].join("\n"),
              {
                ...(input.done === undefined ? {} : { done: input.done }),
                ...(input.pinned === undefined ? {} : { pinned: input.pinned }),
              },
            );
          } else if (input.op === "attach") {
            const current = doc.sections
              .flatMap((section) => sectionItems(section))
              .find((item) => item.id === input.id);
            const lines = storeFocusFiles(memoryDirOf(path), input.files);
            next = current
              ? changeFocusItem(doc, input.id, { text: [current.text, ...lines].join("\n") })
              : null;
          } else if (input.op === "move") {
            next = moveFocusItem(doc, input.id, input.direction);
          } else {
            next = changeFocusItem(
              doc,
              input.id,
              input.op === "remove"
                ? null
                : input.op === "edit"
                  ? { text: input.text }
                  : input.op === "pin"
                    ? { pinned: input.pinned }
                    : { done: input.done },
            );
          }
          if (next === null) {
            throw new TaskBoardOperationError({
              reason: "task_not_found",
              message: "That focus item is gone. The list has been refreshed.",
            });
          }
          writeFocusFile(path, next);
          return focusSnapshotOf(path, next, scopedProjects);
        },
        catch: cardWriteFailure,
      });
      yield* SubscriptionRef.update(focusRevision, (n) => n + 1);
      return snapshot;
    });

  const focusAttachment = (input: FocusAttachmentInput, projects: ReadonlyArray<Project>) =>
    Effect.gen(function* () {
      const path = focusPath(projects, input);
      if (path === null) return yield* storageError("No folder is available for the focus list.");
      return yield* Effect.try({
        try: () => readFocusAttachment(memoryDirOf(path), input.path),
        catch: cardWriteFailure,
      });
    });

  const share = (projectInput: Project, input: TaskBoardShareInput) =>
    Effect.gen(function* () {
      const project = yield* projectContext(projectInput);
      const now = yield* Clock.currentTimeMillis;
      const slug = aiosSlugFor(projectInput);
      const wanted = input.taskIds ? new Set(input.taskIds) : null;
      const cards = (yield* readLocalCards([projectInput], now, { project: projectInput })).filter(
        (card) =>
          card.projectSlug?.toLowerCase() === slug &&
          (wanted ? wanted.has(card.id) : input.shared ? isOpen(card) : card.shared === true),
      );
      if (cards.length > 0) {
        yield* persist(project, (tasks) => {
          const ids = new Set(cards.map((card) => card.id));
          const rest = tasks.filter((task) => !ids.has(task.id));
          // Re-sharing retries a failed mirror; a reviewed copy keeps its text and activity, and
          // only planning fields leave the machine (see `publicCopy`).
          const published = input.shared
            ? cards.map((card) =>
                publicCopy(
                  card,
                  tasks.find((task) => task.id === card.id),
                  { projectName: project.name, actor: input.actor },
                ),
              )
            : [];
          return { tasks: [...rest, ...published], result: undefined };
        });
        yield* Effect.try({
          try: () => {
            for (const card of cards) {
              const file =
                card.sourceFile && card.sourceRoot
                  ? findCardFile(card.sourceRoot, card.sourceFile)
                  : null;
              if (!file) continue;
              const raw = NodeFS.readFileSync(file, "utf8");
              const next = applyCardPatch(
                raw,
                {
                  actor: input.actor,
                  shared: input.shared,
                  sharedBy: input.shared ? input.actor : null,
                  sharedSync: null,
                },
                now,
              );
              if (next !== raw) writeCardAtomically(file, next);
              cardReader.invalidate();
            }
          },
          catch: cardWriteFailure,
        });
      }
      return yield* list(projectInput);
    });

  const home = (projects: ReadonlyArray<Project>, workspaceId?: string) =>
    Effect.gen(function* () {
      const root = scopeFor(projects, { workspaceId }).root;
      if (root === null) return buildHome(null, []);
      const now = yield* Clock.currentTimeMillis;
      const tasks = yield* readCards(root, now);
      return yield* Effect.try({
        try: () => buildHome(root, tasks),
        catch: (cause) => new TaskBoardReadError({ reason: "request_failed", cause }),
      });
    });

  const direction = (projects: ReadonlyArray<Project>, workspaceId?: string) =>
    Effect.gen(function* () {
      const root = scopeFor(projects, { workspaceId }).root;
      if (root === null) return buildDirection(null, null, null, [], 0);
      const now = yield* Clock.currentTimeMillis;
      const tasks = yield* readCards(root, now);
      return yield* Effect.try({
        try: () => readDirection(root, tasks, now),
        catch: (cause) => new TaskBoardReadError({ reason: "request_failed", cause }),
      });
    });

  const workspacePackWidgets = (projects: ReadonlyArray<Project>, workspaceId?: string) =>
    Effect.gen(function* () {
      const now = yield* Clock.currentTimeMillis;
      const { workspaces: found } = scopeFor(projects, { workspaceId });
      const widgets = yield* Effect.promise(() => widgetsForWorkspace(found, workspaceId, now));
      return { widgets };
    });

  const usageShape = (projects: ReadonlyArray<Project>, workspaceId?: string) =>
    Effect.sync(() => readAiosShape(scopeFor(projects, { workspaceId }).root));

  const summarize = (
    state: AiosWorkspaceState,
    projects: ReadonlyArray<Project>,
    defaultRoot: string | null,
  ): AiosWorkspaceSummary => ({
    root: state.root,
    status: state.status,
    id: state.status === "ready" ? state.file.id : null,
    name: state.status === "ready" ? state.file.name : null,
    type: state.status === "ready" ? state.file.type : null,
    error: state.status === "invalid" ? state.error : null,
    isDefault: state.root === defaultRoot,
    projectIds: projects
      .filter((project) => workspaceForPath([state], project.workspaceRoot) !== undefined)
      .map((project) => project.id),
  });

  const workspaces = (projects: ReadonlyArray<Project>) =>
    Effect.sync(() => {
      const { workspaces: found, defaultRoot } = scopeFor(projects);
      return { workspaces: found.map((state) => summarize(state, projects, defaultRoot)) };
    });

  const workspaceRoot = (projects: ReadonlyArray<Project>, workspaceId: string) =>
    Effect.sync(() => {
      const found = listAiosWorkspaces(workspaceHints(projects)).find(
        (state) => state.status === "ready" && state.file.id === workspaceId,
      );
      return found?.status === "ready" ? { root: found.root, type: found.file.type } : null;
    });

  const workspaceInit = (input: AiosWorkspaceInitInput, projects: ReadonlyArray<Project>) =>
    Effect.gen(function* () {
      const { workspaces: found } = scopeFor(projects);
      const target = found.find((state) => state.root === input.root);
      if (target === undefined) return yield* storageError("The app does not list that folder.");
      if (target.status === "ready") {
        return yield* storageError("That folder already has a workspace file.");
      }
      if (found.some((state) => state.status === "ready" && state.file.id === input.id)) {
        return yield* storageError("Another workspace already uses that id.");
      }
      yield* Effect.try({
        try: () => writeWorkspaceFile(target.root, input),
        catch: () => storageError("Could not write workspace.json."),
      });
      const after = scopeFor(projects);
      const written = after.workspaces.find((state) => state.root === target.root) ?? target;
      return summarize(written, projects, after.defaultRoot);
    });

  const aiosDetect = (input: TaskBoardAiosDetectInput, projects: ReadonlyArray<Project>) =>
    Effect.sync(() => ({
      confirmedRoot: confirmedRoot ?? null,
      candidates: detectAiosCandidates([
        input.pickedPath,
        confirmedRoot,
        process.env.LEONIDAS_AIOS_ROOT,
        process.env.AIOS_ROOT,
        ...projects.map((project) => project.workspaceRoot),
      ]),
    }));

  const aiosConfirm = (input: TaskBoardAiosConfirmInput, projects: ReadonlyArray<Project>) =>
    Effect.gen(function* () {
      if (Option.isNone(settings)) return yield* storageError("Settings are not available.");
      const root = input.root === null ? null : inspectAiosCandidate(input.root)?.root;
      if (root === undefined) {
        return yield* storageError("That folder has no AIOS task cards.");
      }
      yield* settings.value
        .updateSettings({ aiosRoot: root ?? "" })
        .pipe(Effect.mapError(() => storageError("Could not save the AIOS folder.")));
      confirmedRoot = root ?? undefined;
      return yield* aiosDetect({}, projects);
    });

  return TaskBoardService.of({
    list,
    home,
    aiosRoot: (projects: ReadonlyArray<Project>, workspaceId?: string) =>
      Effect.sync(() => scopeFor(projects, { workspaceId }).root),
    usageShape,
    direction,
    workspacePackWidgets,
    workspaces,
    workspaceRoot,
    workspaceInit,
    aiosDetect,
    aiosConfirm,
    create,
    claim,
    release,
    complete,
    update,
    workspace,
    cardUpdate,
    cardCreate,
    inboxDrop,
    inboxUndo,
    share,
    completions: SubscriptionRef.changes(recentCompletions),
    focus,
    focusUpdate,
    focusAttachment,
    focusChanges: SubscriptionRef.changes(focusRevision),
  });
});

export const layer = Layer.effect(TaskBoardService, make);
