import { FeedEventError } from "@t3tools/contracts";
import type {
  FeedEventDraft,
  OrchestrationV2ConversationMessage,
  OrchestrationV2Run,
  Project,
  ProjectId,
  TaskBoardTask,
  ThreadId,
} from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import * as Clock from "effect/Clock";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Schedule from "effect/Schedule";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";

import * as Orchestrator from "../orchestration-v2/Orchestrator.ts";
import * as ProjectionStore from "../orchestration-v2/ProjectionStore.ts";
import { isTerminalRunStatus } from "../orchestration-v2/ThreadManagementService.ts";
import * as ProjectService from "../project/ProjectService.ts";
import { forkParked } from "../serverActivation.ts";
import { appendDraft } from "../events/eventsRpc.ts";
import * as ProcessRunner from "../processRunner.ts";
import { aiosSlugFor, TaskBoardService } from "./TaskBoardService.ts";
import { gitRunSummary, replyHeadOf, taskMoveDraft, workedDraft } from "./TaskLedger.ts";

const ACTOR = "Leonidas";
const MIN_REQUEST_LENGTH = 12;
const TITLE_LENGTH = 80;
const IDLE_MS = 6 * 60 * 60 * 1000;
const SWEEP_EVERY = "5 minutes";
const IDLE_MARKER = "[idle]";
// Older unmarked runs predate the log (a claim made by hand), so replaying them would flood the ledger.
const REPLAY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/** A request is real work when a person typed it; relays, schedules and one-word replies are not. */
export function isLoggableRequest(message: OrchestrationV2ConversationMessage): boolean {
  return (
    message.role === "user" &&
    !message.streaming &&
    message.delegatedCompletion === undefined &&
    message.notification === undefined &&
    message.senderThreadId === undefined &&
    message.scheduledTaskId === undefined &&
    message.text.trim().length >= MIN_REQUEST_LENGTH
  );
}

/** The first line of the request, trimmed to a card title. */
export function titleFromRequest(text: string): string {
  const line = text.trim().split(/\r?\n/, 1)[0]!.replace(/\s+/g, " ");
  if (line.length <= TITLE_LENGTH) return line;
  const cut = line.slice(0, TITLE_LENGTH - 1);
  return `${cut.slice(0, cut.lastIndexOf(" ") > 40 ? cut.lastIndexOf(" ") : cut.length)}…`;
}

/**
 * The task id an explicit "Send to agent" prompt names (`buildTaskPrompt` in the web client).
 * It lets the server link the thread to that card even when the client never recorded the link.
 */
export function explicitTaskId(text: string): string | undefined {
  return /^You are picking up task (\S+?):\s/.exec(text)?.[1];
}

/** Notes carry the message or run id so a replayed event is recognized from the card itself. */
const messageMarker = (id: string) => `[message ${id}]`;
const runMarker = (id: string) => `[run ${id}]`;

/** A card lists every chat that worked on it; older records name only the newest one. */
const isLinked = (task: TaskBoardTask, threadId: string): boolean =>
  task.threadIds?.includes(threadId) === true || task.claimedAgent?.threadId === threadId;

/** The run fields the ledger reads; a bare id and status still log the outcome note. */
export type AutoLogRun = Pick<OrchestrationV2Run, "id" | "status"> &
  Partial<Pick<OrchestrationV2Run, "modelSelection" | "startedAt" | "completedAt">>;

export type AutoLogEvent =
  | { readonly type: "message.updated"; readonly payload: OrchestrationV2ConversationMessage }
  | {
      readonly type: "run.updated";
      readonly threadId: ThreadId;
      readonly payload: AutoLogRun;
    };

/**
 * Files every user request as a task card, one card per thread: later messages
 * and the run outcome are appended to the same card's activity log. The card
 * is the log; the agent and the nightly auditor add detail on top of it.
 *
 * The thread-to-card link is the card's own `thread_id`, never process memory, so a restart,
 * a replayed event or a client that failed to claim the card all resolve to the same card.
 */
export const makeAutoLog = (deps: {
  readonly taskBoard: TaskBoardService["Service"];
  readonly allProjects: Effect.Effect<ReadonlyArray<Project>, ProjectService.ProjectOperationError>;
  readonly threadProjectId: (threadId: ThreadId) => Effect.Effect<ProjectId | undefined>;
  /** Writes the ledger entry for one linked card. A failure leaves the card unmarked, so a replay retries. */
  readonly worked?: (input: {
    readonly task: TaskBoardTask;
    readonly threadId: ThreadId;
    readonly run: AutoLogRun;
  }) => Effect.Effect<void, FeedEventError>;
  /** Writes a notice to the event feed. A failure is logged, never retried. */
  readonly notify?: (draft: FeedEventDraft) => Effect.Effect<void>;
}) => {
  const { taskBoard } = deps;

  const tasks = (projects: ReadonlyArray<Project>) =>
    taskBoard.workspace(projects).pipe(Effect.map((snapshot) => snapshot.tasks));

  const hasMarker = (task: TaskBoardTask, marker: string) =>
    task.history.some((entry) => entry.note?.includes(marker));

  const logRequest = (message: OrchestrationV2ConversationMessage) =>
    Effect.gen(function* () {
      const projects = yield* deps.allProjects;
      const all = yield* tasks(projects);
      const marker = messageMarker(message.id);
      const named = explicitTaskId(message.text);
      const linked = all.find((task) => isLinked(task, message.threadId));
      const target =
        linked ?? (named === undefined ? undefined : all.find((task) => task.id === named));

      if (target !== undefined) {
        if (hasMarker(target, marker)) return;
        const starting = named === target.id;
        // An explicit card takes every new chat that starts on it. The card records each chat.
        const adopt = starting && !isLinked(target, message.threadId);
        yield* taskBoard.cardUpdate(
          {
            taskId: target.id,
            actor: ACTOR,
            ...(adopt
              ? {
                  agent: { threadId: message.threadId },
                  ...(target.status === "todo" ? { status: "in_progress" as const } : {}),
                }
              : {}),
            note: starting
              ? `Agent started on this task. ${marker}`
              : `Follow-up: ${titleFromRequest(message.text)} ${marker}`,
          },
          projects,
        );
        return;
      }

      const projectId = yield* deps.threadProjectId(message.threadId);
      const project = projects.find((candidate) => candidate.id === projectId);
      // A stable key makes a replay or a racing duplicate resolve to the same card.
      const task = yield* taskBoard.cardCreate(
        {
          idempotencyKey: `task-auto-log:${message.threadId}`,
          kind: "agent_run",
          title: titleFromRequest(message.text),
          description: `${message.text.trim()}\n\nThread: ${message.threadId}`,
          projectSlug: project ? aiosSlugFor(project) : null,
          actor: ACTOR,
        },
        projects,
      );
      if (hasMarker(task, marker)) return;
      yield* taskBoard.cardUpdate(
        {
          taskId: task.id,
          actor: ACTOR,
          status: "in_progress",
          agent: { threadId: message.threadId },
          note: `Agent started on this request. ${marker}`,
        },
        projects,
      );
    });

  // Every card sharing the thread (a batch sends several to one agent) gets the outcome. A run
  // that finished while a card is still in progress means the agent did not close it itself, so
  // the card moves to review: an honest "ready to check" rather than a guess that it is done.
  // Failed and cancelled runs stay visible as such; the agent or a person moves a card to done.
  const logOutcome = (threadId: ThreadId, run: AutoLogRun) =>
    Effect.gen(function* () {
      const projects = yield* deps.allProjects;
      const marker = runMarker(run.id);
      const linked = (yield* tasks(projects)).filter(
        (item) => isLinked(item, threadId) && !hasMarker(item, marker),
      );
      for (const task of linked) {
        if (deps.worked) yield* deps.worked({ task, threadId, run });
        const finishing = run.status === "completed" && task.status === "in_progress";
        const updated = yield* taskBoard.cardUpdate(
          {
            taskId: task.id,
            actor: ACTOR,
            ...(finishing ? { status: "review" as const } : {}),
            note: finishing
              ? `Run completed. Moved to review because the agent did not mark it done. ${marker}`
              : `Run ${run.status}. ${marker}`,
          },
          projects,
        );
        // A card made from the request itself ends with every chat, so it would only repeat the
        // chat-finished notice. A real card in review needs the person.
        const draft =
          finishing && task.kind !== "agent_run" && deps.notify
            ? taskMoveDraft({
                task: updated,
                from: task.status,
                to: updated.status,
                agent: ACTOR,
                threadId,
                note: "The run ended before the agent marked the card done.",
                at: updated.updatedAt,
              })
            : null;
        if (draft !== null && deps.notify) yield* deps.notify(draft);
      }
    });

  const skip = (what: string) => (cause: Cause.Cause<unknown>) =>
    Effect.logWarning(`task auto-log skipped: ${what}`, { cause: Cause.pretty(cause) });

  const handle = (event: AutoLogEvent) => {
    if (event.type === "message.updated" && isLoggableRequest(event.payload)) {
      return logRequest(event.payload).pipe(Effect.catchCause(skip("request")));
    }
    if (event.type === "run.updated" && isTerminalRunStatus(event.payload.status)) {
      return logOutcome(event.threadId, event.payload).pipe(Effect.catchCause(skip("outcome")));
    }
    return Effect.void;
  };

  // An in-progress card with no run for IDLE_MS is not being worked: flag it for a person to check.
  // It never sets done. The status change is the dedupe, so a second sweep finds nothing.
  const sweep = (now: number, isLive: (threadId: string) => boolean) =>
    Effect.gen(function* () {
      const projects = yield* deps.allProjects;
      const idle = (yield* tasks(projects)).filter(
        (task) =>
          task.status === "in_progress" &&
          now - task.updatedAt >= IDLE_MS &&
          !(task.threadIds ?? []).some(isLive) &&
          !(task.claimedAgent?.threadId !== undefined && isLive(task.claimedAgent.threadId)),
      );
      for (const task of idle) {
        const last = task.claimedAgent?.threadId ?? task.threadIds?.at(-1);
        yield* taskBoard
          .cardUpdate(
            {
              taskId: task.id,
              actor: ACTOR,
              status: "review",
              note: `No chat has run on this for 6 hours. Moved to review.${last ? ` Last chat: ${last}.` : ""} ${IDLE_MARKER}`,
            },
            projects,
          )
          .pipe(Effect.catchCause(skip("sweep")));
      }
    }).pipe(Effect.catchCause(skip("sweep")));

  // Runs that ended while the server was off never reached the stream. Each goes through the same
  // outcome path, so the [run <id>] marker keeps a repeat from logging twice.
  const replay = (
    finishedRuns: (threadId: string) => Effect.Effect<ReadonlyArray<AutoLogRun>>,
    now: number,
  ) =>
    Effect.gen(function* () {
      const projects = yield* deps.allProjects;
      const open = (yield* tasks(projects)).filter((task) => task.status !== "done");
      const threads = new Set(
        open.flatMap((task) => [
          ...(task.threadIds ?? []),
          ...(task.claimedAgent?.threadId ? [task.claimedAgent.threadId] : []),
        ]),
      );
      for (const id of threads) {
        const threadId = id as ThreadId;
        for (const run of yield* finishedRuns(id)) {
          const recent =
            run.completedAt === null ||
            run.completedAt === undefined ||
            now - DateTime.toEpochMillis(run.completedAt) <= REPLAY_WINDOW_MS;
          if (recent && isTerminalRunStatus(run.status)) {
            yield* logOutcome(threadId, run).pipe(Effect.catchCause(skip("replay")));
          }
        }
      }
    }).pipe(Effect.catchCause(skip("replay")));

  return { handle, sweep, replay };
};

export const make = Effect.gen(function* () {
  const orchestrator = yield* Orchestrator.OrchestratorV2;
  const projections = yield* ProjectionStore.ProjectionStoreV2;
  const projectService = yield* ProjectService.ProjectService;
  const taskBoard = yield* TaskBoardService;
  const runner = yield* ProcessRunner.ProcessRunner;
  const iso = (value: DateTime.Utc | null | undefined) =>
    value === null || value === undefined ? null : DateTime.formatIso(value);

  const log = makeAutoLog({
    taskBoard,
    notify: (draft) =>
      projectService.snapshot.pipe(
        Effect.flatMap(({ projects }) => taskBoard.aiosRoot(projects)),
        Effect.flatMap((root) => appendDraft(root, draft)),
        Effect.asVoid,
        Effect.catchCause((cause) =>
          Effect.logWarning("task review notice skipped", { cause: Cause.pretty(cause) }),
        ),
      ),
    worked: ({ task, threadId, run }) =>
      Effect.gen(function* () {
        const shell = yield* projections.getThreadShell(threadId);
        const projects = (yield* projectService.snapshot).projects;
        const aiosRoot = yield* taskBoard.aiosRoot(projects);
        if (!shell || aiosRoot === null) return;
        const cwd =
          shell.worktreePath ?? projects.find((item) => item.id === shell.projectId)?.workspaceRoot;
        const startedAt = iso(run.startedAt);
        const git =
          cwd === undefined
            ? { files: [], commits: [] }
            : yield* gitRunSummary(runner, cwd, startedAt);
        const selection = run.modelSelection ?? shell.modelSelection;
        yield* appendDraft(
          aiosRoot,
          workedDraft({
            task,
            threadId,
            runId: run.id,
            status: run.status,
            chatTitle: shell.title,
            agent: selection.instanceId,
            model: selection.model,
            startedAt,
            endedAt: iso(run.completedAt),
            git,
            replyHead:
              shell.latestVisibleMessage?.role === "assistant"
                ? replyHeadOf(shell.latestVisibleMessage.text)
                : null,
          }),
        );
      }).pipe(
        Effect.mapError((error) =>
          Schema.is(FeedEventError)(error) ? error : new FeedEventError({ message: String(error) }),
        ),
      ),
    allProjects: projectService.snapshot.pipe(Effect.map((snapshot) => snapshot.projects)),
    threadProjectId: (threadId) =>
      projections.getThreadShell(threadId).pipe(
        Effect.map((shell) => shell?.projectId),
        Effect.catchCause(() => Effect.succeed(undefined)),
      ),
  });

  const liveThreads = projections
    .getShellSnapshot({ unsettledOnly: true })
    .pipe(
      Effect.map(
        (snapshot) =>
          new Set(
            snapshot.threads
              .filter((t) => t.activityRunStatus === "running" || t.activityRunStatus === "waiting")
              .map((t) => t.id as string),
          ),
      ),
    );

  const start = Effect.fn("TaskAutoLog.start")(function* () {
    // Replay once, then sweep on a timer. A failed pass is logged by the pass itself and the
    // timer keeps going.
    yield* forkParked(
      Clock.currentTimeMillis
        .pipe(
          Effect.flatMap((now) =>
            log.replay(
              (id) =>
                projections.getThreadRecords(id as ThreadId, ["runs"]).pipe(
                  Effect.map((records) => records.runs),
                  Effect.catchCause(() => Effect.succeed([])),
                ),
              now,
            ),
          ),
        )
        .pipe(
          Effect.andThen(
            liveThreads.pipe(
              Effect.zip(Clock.currentTimeMillis),
              Effect.flatMap(([live, now]) => log.sweep(now, (id) => live.has(id))),
              Effect.catchCause(() => Effect.void),
              Effect.repeat(Schedule.spaced(SWEEP_EVERY)),
            ),
          ),
        ),
    );
    yield* forkParked(
      Stream.runForEach(orchestrator.streamDomainEvents, (event) =>
        event.type === "message.updated"
          ? log.handle({ type: event.type, payload: event.payload })
          : event.type === "run.updated"
            ? log.handle({ type: event.type, threadId: event.threadId, payload: event.payload })
            : Effect.void,
      ),
    );
  });

  return { start };
});
