// @effect-diagnostics nodeBuiltinImport:off - temp AIOS folders are plain Node fixtures.
import { FeedEventError } from "@t3tools/contracts";
import type {
  OrchestrationV2ConversationMessage,
  Project,
  TaskBoardTask,
} from "@t3tools/contracts";
import { describe, expect, it } from "@effect/vitest";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import * as ProcessRunner from "../processRunner.ts";
import { appendDraft } from "../events/eventsRpc.ts";
import * as TaskBoardServiceModule from "./TaskBoardService.ts";
import {
  explicitTaskId,
  isLoggableRequest,
  makeAutoLog,
  titleFromRequest,
  type AutoLogEvent,
  type AutoLogRun,
} from "./TaskAutoLog.ts";

const message = (patch: Record<string, unknown>) =>
  ({
    role: "user",
    streaming: false,
    text: "Fix the login redirect bug",
    ...patch,
  }) as unknown as OrchestrationV2ConversationMessage;

describe("isLoggableRequest", () => {
  it("logs a typed user request", () => {
    expect(isLoggableRequest(message({}))).toBe(true);
  });

  it("skips replies, relays, schedules and still-streaming text", () => {
    expect(isLoggableRequest(message({ text: "ok thanks" }))).toBe(false);
    expect(isLoggableRequest(message({ role: "assistant" }))).toBe(false);
    expect(isLoggableRequest(message({ streaming: true }))).toBe(false);
    expect(isLoggableRequest(message({ senderThreadId: "t1" }))).toBe(false);
    expect(isLoggableRequest(message({ scheduledTaskId: "s1" }))).toBe(false);
    expect(isLoggableRequest(message({ delegatedCompletion: {} }))).toBe(false);
  });
});

describe("titleFromRequest", () => {
  it("uses the first line", () => {
    expect(titleFromRequest("Add dark mode\nand also fix the sidebar")).toBe("Add dark mode");
  });

  it("shortens a long line at a word boundary", () => {
    const title = titleFromRequest(`${"word ".repeat(40)}end`);
    expect(title.length).toBeLessThanOrEqual(80);
    expect(title.endsWith("…")).toBe(true);
  });
});

describe("explicitTaskId", () => {
  it("reads the card id out of a Send to agent prompt", () => {
    expect(explicitTaskId("You are picking up task task-abc-123: Do it.\nPriority: high.")).toBe(
      "task-abc-123",
    );
    expect(explicitTaskId("Please fix the login redirect bug")).toBeUndefined();
  });
});

// Integration: the real card store in a throwaway AIOS, driven through the same handler the
// orchestrator stream feeds. "Restart" is a second handler over the same files.
const boardProject = {
  id: "project-board",
  title: "Leonidas",
  workspaceRoot: "D:/leonidas-code",
} as Project;

const withBoard = <A, E, R>(
  use: (input: {
    readonly root: string;
    readonly project: Project;
    readonly board: TaskBoardServiceModule.TaskBoardService["Service"];
    readonly newLog: (
      worked?: Parameters<typeof makeAutoLog>[0]["worked"],
      notify?: Parameters<typeof makeAutoLog>[0]["notify"],
    ) => ReturnType<typeof makeAutoLog>;
  }) => Effect.Effect<A, E, R>,
) =>
  Effect.acquireUseRelease(
    Effect.sync(() => {
      const root = NodeFS.realpathSync(
        NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "aios-autolog-")),
      );
      NodeFS.mkdirSync(NodePath.join(root, "tasks"), { recursive: true });
      NodeFS.mkdirSync(NodePath.join(root, "projects", "leonidas-code"), { recursive: true });
      const previous = process.env.LEONIDAS_AIOS_ROOT;
      process.env.LEONIDAS_AIOS_ROOT = root;
      return { root, previous };
    }),
    ({ root }) =>
      Effect.gen(function* () {
        const board = yield* TaskBoardServiceModule.TaskBoardService;
        const project = {
          ...boardProject,
          workspaceRoot: NodePath.join(root, "projects", "leonidas-code"),
        } as Project;
        return yield* use({
          root,
          project,
          board,
          newLog: (worked, notify) =>
            makeAutoLog({
              taskBoard: board,
              allProjects: Effect.succeed([project]),
              threadProjectId: () => Effect.succeed(project.id),
              ...(worked ? { worked } : {}),
              ...(notify ? { notify } : {}),
            }),
        });
      }).pipe(
        Effect.provide(
          TaskBoardServiceModule.layer.pipe(
            Layer.provide(
              Layer.succeed(
                ProcessRunner.ProcessRunner,
                ProcessRunner.ProcessRunner.of({ run: () => Effect.die("no GitHub in this test") }),
              ),
            ),
          ),
        ),
      ),
    ({ root, previous }) =>
      Effect.sync(() => {
        if (previous === undefined) delete process.env.LEONIDAS_AIOS_ROOT;
        else process.env.LEONIDAS_AIOS_ROOT = previous;
        NodeFS.rmSync(root, { recursive: true, force: true });
      }),
  );

const request = (id: string, threadId: string, text = "Fix the login redirect bug") =>
  ({
    type: "message.updated",
    payload: message({ id, threadId, text }),
  }) as unknown as AutoLogEvent;

const runEvent = (threadId: string, id: string, status: string) =>
  ({ type: "run.updated", threadId, payload: { id, status } }) as unknown as AutoLogEvent;

const notes = (task: TaskBoardTask) => task.history.map((entry) => entry.note ?? "");

const sendPrompt = (card: TaskBoardTask) =>
  `You are picking up task ${card.id}: ${card.title}.\nPriority: high.`;

const newCard = (board: TaskBoardServiceModule.TaskBoardService["Service"], project: Project) =>
  board.cardCreate({ title: "Persist task identity", actor: "Mob", projectSlug: "leonidas-code" }, [
    project,
  ]);

describe("TaskAutoLog persistence", () => {
  it.effect("links a thread to one card and ignores a replayed request", () =>
    withBoard(({ board, project, newLog }) =>
      Effect.gen(function* () {
        const log = newLog();
        yield* log.handle(request("m1", "thread-1"));
        yield* log.handle(request("m1", "thread-1"));
        const { tasks } = yield* board.workspace([project]);
        expect(tasks).toHaveLength(1);
        expect(tasks[0]!.claimedAgent?.threadId).toBe("thread-1");
        expect(tasks[0]!.status).toBe("in_progress");
        expect(notes(tasks[0]!).filter((note) => note.includes("[message m1]"))).toHaveLength(1);
      }),
    ),
  );

  it.effect("keeps appending to the same card after a restart", () =>
    withBoard(({ board, project, newLog }) =>
      Effect.gen(function* () {
        yield* newLog().handle(request("m1", "thread-1"));
        const restarted = newLog();
        const followUp = request("m2", "thread-1", "Also update the sidebar copy");
        yield* restarted.handle(followUp);
        yield* restarted.handle(followUp);
        yield* restarted.handle(runEvent("thread-1", "run-1", "completed"));
        const { tasks } = yield* board.workspace([project]);
        expect(tasks).toHaveLength(1);
        const history = notes(tasks[0]!);
        expect(history.filter((note) => note.includes("Follow-up"))).toHaveLength(1);
        expect(history.filter((note) => note.includes("[run run-1]"))).toHaveLength(1);
      }),
    ),
  );

  it.effect("reuses an explicitly sent card when the client never recorded the link", () =>
    withBoard(({ board, project, newLog }) =>
      Effect.gen(function* () {
        const card = yield* newCard(board, project);
        yield* newLog().handle(request("m1", "thread-9", sendPrompt(card)));
        const { tasks } = yield* board.workspace([project]);
        expect(tasks).toHaveLength(1);
        expect(tasks[0]!.id).toBe(card.id);
        expect(tasks[0]!.claimedAgent?.threadId).toBe("thread-9");
        expect(tasks[0]!.status).toBe("in_progress");
      }),
    ),
  );

  it.effect("links a second chat to the same card and logs its run", () =>
    withBoard(({ board, project, newLog }) =>
      Effect.gen(function* () {
        const card = yield* newCard(board, project);
        const log = newLog();
        yield* log.handle(request("m1", "thread-a", sendPrompt(card)));
        yield* log.handle(request("m2", "thread-b", sendPrompt(card)));
        yield* log.handle(runEvent("thread-b", "run-b", "failed"));
        yield* log.handle(runEvent("thread-a", "run-a", "completed"));
        const { tasks } = yield* board.workspace([project]);
        expect(tasks).toHaveLength(1);
        expect(tasks[0]!.threadIds).toEqual(["thread-a", "thread-b"]);
        expect(notes(tasks[0]!).some((note) => note.includes("[run run-b]"))).toBe(true);
        expect(notes(tasks[0]!).some((note) => note.includes("[run run-a]"))).toBe(true);
      }),
    ),
  );

  it.effect("does not link the same chat twice", () =>
    withBoard(({ board, project, newLog }) =>
      Effect.gen(function* () {
        const card = yield* newCard(board, project);
        const log = newLog();
        yield* log.handle(request("m1", "thread-a", sendPrompt(card)));
        yield* log.handle(request("m2", "thread-a", sendPrompt(card)));
        const { tasks } = yield* board.workspace([project]);
        expect(tasks[0]!.threadIds).toEqual(["thread-a"]);
      }),
    ),
  );

  it.effect("moves a still-in-progress card to review when its run completes", () =>
    withBoard(({ board, project, newLog }) =>
      Effect.gen(function* () {
        const log = newLog();
        yield* log.handle(request("m1", "thread-1"));
        yield* log.handle(runEvent("thread-1", "run-1", "completed"));
        yield* log.handle(runEvent("thread-1", "run-1", "completed"));
        const [task] = (yield* board.workspace([project])).tasks;
        expect(task!.status).toBe("review");
        expect(notes(task!).filter((note) => note.includes("[run run-1]"))).toHaveLength(1);
      }),
    ),
  );

  it.effect("notifies when a run moves a real card to review, never for the request card", () =>
    withBoard(({ board, project, newLog }) =>
      Effect.gen(function* () {
        const notices: string[] = [];
        const log = newLog(undefined, (draft) => Effect.sync(() => void notices.push(draft.type)));
        yield* log.handle(request("m1", "thread-auto"));
        yield* log.handle(runEvent("thread-auto", "run-a", "completed"));
        expect(notices).toEqual([]);

        const card = yield* newCard(board, project);
        yield* board.cardUpdate(
          {
            taskId: card.id,
            actor: "Mob",
            agent: { threadId: "thread-real" },
            status: "in_progress",
          },
          [project],
        );
        yield* log.handle(runEvent("thread-real", "run-r", "completed"));
        expect(notices).toEqual(["task.review"]);
      }),
    ),
  );

  it.effect("writes a review event to the feed when a run ends", () =>
    withBoard(({ board, project, root, newLog }) =>
      Effect.gen(function* () {
        const log = newLog(undefined, (draft) =>
          appendDraft(root, draft).pipe(Effect.asVoid, Effect.orDie),
        );
        const card = yield* newCard(board, project);
        yield* board.cardUpdate(
          {
            taskId: card.id,
            actor: "Mob",
            agent: { threadId: "thread-feed" },
            status: "in_progress",
          },
          [project],
        );
        yield* log.handle(runEvent("thread-feed", "run-feed", "completed"));
        const files = NodeFS.readdirSync(NodePath.join(root, "events"));
        const lines = files.flatMap((file) =>
          NodeFS.readFileSync(NodePath.join(root, "events", file), "utf8")
            .trim()
            .split("\n"),
        );
        const events = lines.map((line) => JSON.parse(line));
        expect(events).toHaveLength(1);
        expect(events[0]).toMatchObject({ type: "task.review", level: "needs_you" });
      }),
    ),
  );

  it.effect("updates every card a batch shares one thread with, leaving closed ones alone", () =>
    withBoard(({ board, project, newLog }) =>
      Effect.gen(function* () {
        const first = yield* newCard(board, project);
        const second = yield* newCard(board, project);
        const agent = { threadId: "thread-batch" };
        yield* board.cardUpdate({ taskId: first.id, actor: "Mob", agent, status: "in_progress" }, [
          project,
        ]);
        yield* board.cardUpdate({ taskId: second.id, actor: "Mob", agent, status: "in_progress" }, [
          project,
        ]);
        yield* board.cardUpdate({ taskId: first.id, actor: "Agent", status: "done" }, [project]);
        yield* newLog().handle(runEvent("thread-batch", "run-b", "completed"));
        const byId = new Map((yield* board.workspace([project])).tasks.map((t) => [t.id, t]));
        expect(byId.get(first.id)!.status).toBe("done");
        expect(byId.get(second.id)!.status).toBe("review");
      }),
    ),
  );

  it.effect("writes one ledger entry per linked card and none for a replayed run", () =>
    withBoard(({ board, project, newLog }) =>
      Effect.gen(function* () {
        const first = yield* newCard(board, project);
        const second = yield* newCard(board, project);
        const agent = { threadId: "thread-batch" };
        for (const card of [first, second]) {
          yield* board.cardUpdate({ taskId: card.id, actor: "Mob", agent, status: "in_progress" }, [
            project,
          ]);
        }
        const written: Array<string> = [];
        const log = newLog(({ task, run }) =>
          Effect.sync(() => void written.push(`${task.id}:${run.id}`)),
        );
        yield* log.handle(runEvent("thread-batch", "run-1", "completed"));
        yield* log.handle(runEvent("thread-batch", "run-1", "completed"));
        expect(written.toSorted()).toEqual([`${first.id}:run-1`, `${second.id}:run-1`].toSorted());
      }),
    ),
  );

  it.effect("retries a failed ledger write on the next event for the same run", () =>
    withBoard(({ board, project, newLog }) =>
      Effect.gen(function* () {
        const log0 = newLog();
        yield* log0.handle(request("m1", "thread-1"));
        let attempts = 0;
        const log = newLog(() =>
          ++attempts === 1
            ? Effect.fail(new FeedEventError({ message: "feed is locked" }))
            : Effect.void,
        );
        yield* log.handle(runEvent("thread-1", "run-1", "completed"));
        const [afterFail] = (yield* board.workspace([project])).tasks;
        expect(notes(afterFail!).some((note) => note.includes("[run run-1]"))).toBe(false);
        yield* log.handle(runEvent("thread-1", "run-1", "completed"));
        const [afterRetry] = (yield* board.workspace([project])).tasks;
        expect(notes(afterRetry!).some((note) => note.includes("[run run-1]"))).toBe(true);
        expect(attempts).toBe(2);
      }),
    ),
  );

  it.effect("records failed and cancelled runs once each without completing the card", () =>
    withBoard(({ board, project, newLog }) =>
      Effect.gen(function* () {
        const log = newLog();
        yield* log.handle(request("m1", "thread-1"));
        yield* log.handle(runEvent("thread-1", "run-1", "failed"));
        yield* log.handle(runEvent("thread-1", "run-2", "cancelled"));
        yield* log.handle(runEvent("thread-1", "run-1", "failed"));
        const [task] = (yield* board.workspace([project])).tasks;
        const history = notes(task!);
        expect(history.filter((note) => note.includes("Run failed."))).toHaveLength(1);
        expect(history.filter((note) => note.includes("Run cancelled."))).toHaveLength(1);
        expect(task!.status).toBe("in_progress");
      }),
    ),
  );
});

const HOUR = 3_600_000;
// The test runner clock starts at 0; cards carry wall-clock times.
// @effect-diagnostics-next-line globalDate:off
const wallNow = Date.now();

describe("TaskAutoLog sweeper", () => {
  it.effect("moves an idle in-progress card to review and names the last chat, once", () =>
    withBoard(({ board, project, newLog }) =>
      Effect.gen(function* () {
        const log = newLog();
        yield* log.handle(request("m1", "thread-1"));
        const now = wallNow + 7 * HOUR;
        yield* log.sweep(now, () => false);
        yield* log.sweep(now, () => false);
        const { tasks } = yield* board.workspace([project]);
        expect(tasks[0]!.status).toBe("review");
        const idle = notes(tasks[0]!).filter((note) => note.includes("[idle]"));
        expect(idle).toHaveLength(1);
        expect(idle[0]).toContain("thread-1");
      }),
    ),
  );

  it.effect("leaves a recent card and a card with a live run alone", () =>
    withBoard(({ board, project, newLog }) =>
      Effect.gen(function* () {
        const log = newLog();
        yield* log.handle(request("m1", "thread-1"));
        yield* log.sweep(wallNow + 5 * HOUR, () => false);
        yield* log.sweep(wallNow + 99 * HOUR, (id) => id === "thread-1");
        const { tasks } = yield* board.workspace([project]);
        expect(tasks[0]!.status).toBe("in_progress");
      }),
    ),
  );

  it.effect("records a run that ended while the server was off, once", () =>
    withBoard(({ board, project, newLog }) =>
      Effect.gen(function* () {
        yield* newLog().handle(request("m1", "thread-1"));
        const restarted = newLog();
        const runs = (id: string) =>
          Effect.succeed(
            (id === "thread-1"
              ? [{ id: "run-9", status: "completed" }]
              : []) as unknown as ReadonlyArray<AutoLogRun>,
          );
        yield* restarted.replay(runs, wallNow);
        yield* restarted.replay(runs, wallNow);
        const { tasks } = yield* board.workspace([project]);
        expect(notes(tasks[0]!).filter((note) => note.includes("[run run-9]"))).toHaveLength(1);
        expect(tasks[0]!.status).toBe("review");
      }),
    ),
  );

  it.effect("does not replay a run older than a week", () =>
    withBoard(({ board, project, newLog }) =>
      Effect.gen(function* () {
        const log = newLog();
        yield* log.handle(request("m1", "thread-1"));
        const old = [
          {
            id: "run-old",
            status: "completed",
            completedAt: DateTime.makeUnsafe(wallNow - 8 * 24 * HOUR),
          },
        ] as unknown as ReadonlyArray<AutoLogRun>;
        yield* log.replay(() => Effect.succeed(old), wallNow);
        const { tasks } = yield* board.workspace([project]);
        expect(notes(tasks[0]!).some((note) => note.includes("[run run-old]"))).toBe(false);
      }),
    ),
  );
});
