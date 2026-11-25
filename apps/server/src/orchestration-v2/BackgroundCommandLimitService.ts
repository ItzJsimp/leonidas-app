import {
  CommandId,
  MessageId,
  RunId,
  type OrchestrationV2PendingBackgroundTask,
  type ThreadId,
} from "@t3tools/contracts";
import {
  derivePendingBackgroundWork,
  TASK_COMMAND_HOLD_ENABLED,
} from "@t3tools/shared/orchestrationV2PendingBackgroundWork";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FiberMap from "effect/FiberMap";
import * as Option from "effect/Option";
import * as Stream from "effect/Stream";

import { forkParked } from "../serverActivation.ts";
import {
  cacheWakeDue,
  extendedLimitMs,
  initialLimitMs,
  keptTaskIds,
  MAX_LIMIT_MS,
  REPLY_DEADLINE_MS,
} from "./BackgroundCommandLimit.ts";
import * as Orchestrator from "./Orchestrator.ts";
import * as ProjectionStore from "./ProjectionStore.ts";
import * as ProviderSessionManager from "./ProviderSessionManager.ts";

const TICK = "1 minute";

interface Tracked {
  readonly startedAtMs: number;
  limitMs: number;
}

interface Question {
  readonly messageId: MessageId;
  readonly askedAtMs: number;
  readonly taskIds: ReadonlyArray<string>;
}

const describeTask = (task: OrchestrationV2PendingBackgroundTask) =>
  `- \`${task.taskId}\`: ${task.description ?? "background command"}`;

/**
 * While a thread has a live task command, checks it once a minute: past its limit the agent is
 * asked to keep it, and without an answer the command stops. It also wakes the agent before a
 * long-lived prompt cache expires. State lives in memory: a restart ends the commands too.
 */
export const make = Effect.fn("BackgroundCommandLimitService.make")(function* (
  options: { readonly enabled?: boolean } = {},
) {
  const orchestrator = yield* Orchestrator.OrchestratorV2;
  const projections = yield* ProjectionStore.ProjectionStoreV2;
  const sessions = yield* ProviderSessionManager.ProviderSessionManagerV2;

  const watchThread = Effect.fn("BackgroundCommandLimitService.watchThread")(
    function* (threadId: ThreadId) {
      const tracked = new Map<string, Tracked>();
      let question: Question | null = null;
      let warmedExpiryMs: number | null = null;

      while (true) {
        const records = yield* projections.getThreadRecords(
          threadId,
          ["runs", "providerThreads", "providerTurns", "turnItems"],
          { turnItemStatuses: ["pending", "running", "waiting"] },
        );
        const tasks = derivePendingBackgroundWork({
          // Commands age during active runs too, so ask as if no run were active.
          latestRun: {
            id: RunId.make("background-command-limit"),
            ordinal: 0,
            status: "completed",
          },
          runs: records.runs,
          providerThreads: records.providerThreads,
          turnItems: records.turnItems,
          activeProviderThreadId: records.thread.activeProviderThreadId,
          hasActiveRun: false,
        }).filter((task) => task.kind === "command" && task.service !== true);
        if (tasks.length === 0) return;

        const nowMs = DateTime.toEpochMillis(yield* DateTime.now);
        for (const task of tasks) {
          if (tracked.has(task.taskId)) continue;
          tracked.set(task.taskId, {
            startedAtMs: nowMs,
            limitMs: initialLimitMs(task.kind === "command" ? task.timeoutMs : undefined),
          });
        }

        const stop = Effect.fnUntraced(function* (taskId: string) {
          // One attempt: a command that cannot stop must not wake the agent again and again.
          tracked.get(taskId)!.limitMs = Number.POSITIVE_INFINITY;
          const providerThread = records.providerThreads.find((candidate) =>
            candidate.pendingBackgroundTasks?.some((task) => task.taskId === taskId),
          );
          if (providerThread?.providerSessionId == null) return;
          const runtime = yield* sessions.get(providerThread.providerSessionId);
          if (Option.isNone(runtime) || runtime.value.stopTask === undefined) {
            yield* Effect.logWarning("background command limit cannot stop task", {
              threadId,
              taskId,
            });
            return;
          }
          yield* runtime.value
            .stopTask({ providerThread, taskId })
            .pipe(Effect.timeout("15 seconds"));
        });

        const busy = records.runs.some(
          (run) =>
            run.status === "preparing" ||
            run.status === "queued" ||
            run.status === "starting" ||
            run.status === "running",
        );
        const wake = (text: string) => {
          const id = `background-command:${threadId}:${nowMs}`;
          return orchestrator
            .dispatch({
              type: "message.dispatch",
              commandId: CommandId.make(`server:${id}`),
              messageId: MessageId.make(id),
              threadId,
              text,
              attachments: [],
              createdBy: "agent",
              creationSource: "server",
              dispatchMode: { type: "start_immediately" },
            })
            .pipe(Effect.as(MessageId.make(id)));
        };

        if (question !== null) {
          const asked: Question = question;
          const run = records.runs.find((candidate) => candidate.userMessageId === asked.messageId);
          const answered = run?.status === "completed" || run?.status === "waiting";
          if (run?.status === "interrupted" || run?.status === "cancelled") {
            // The user cut the turn, which is no answer either way: ask again.
            question = null;
          } else if (
            answered ||
            run?.status === "failed" ||
            nowMs - asked.askedAtMs >= REPLY_DEADLINE_MS
          ) {
            const messages =
              run === undefined
                ? []
                : (yield* projections.getThreadRecords(threadId, ["messages"], {
                    messageRunIds: [run.id],
                  })).messages;
            const reply = messages
              .filter((message) => message.role === "assistant")
              .map((message) => message.text)
              .join("\n");
            const kept = new Set(answered ? keptTaskIds(reply, asked.taskIds) : []);
            for (const taskId of asked.taskIds) {
              const entry = tracked.get(taskId);
              if (entry === undefined || !tasks.some((task) => task.taskId === taskId)) continue;
              if (kept.has(taskId)) entry.limitMs = extendedLimitMs(entry.startedAtMs, nowMs);
              else yield* stop(taskId);
            }
            question = null;
          }
        } else {
          const due = tasks.filter((task) => {
            const entry = tracked.get(task.taskId)!;
            return nowMs - entry.startedAtMs >= entry.limitMs;
          });
          const capped = due.filter((task) => tracked.get(task.taskId)!.limitMs >= MAX_LIMIT_MS);
          for (const task of capped) yield* stop(task.taskId);
          const askable = due.filter((task) => !capped.includes(task));
          const usage = records.providerTurns
            .filter((turn) => turn.providerThreadId === records.thread.activeProviderThreadId)
            .flatMap((turn) => (turn.tokenUsage === undefined ? [] : [turn.tokenUsage]))
            .toSorted((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))[0];
          const cache =
            usage?.promptCacheExpiresAt === undefined || usage.promptCacheTtlMs === undefined
              ? null
              : {
                  expiresAtMs: Date.parse(usage.promptCacheExpiresAt),
                  ttlMs: usage.promptCacheTtlMs,
                };
          if (!busy && askable.length > 0) {
            const messageId = yield* wake(
              [
                "These background commands passed their time limit:",
                ...askable.map(describeTask),
                "To give one 30 more minutes, reply with a line `KEEP <id>`. Any command you do not keep is stopped.",
              ].join("\n"),
            );
            question = { messageId, askedAtMs: nowMs, taskIds: askable.map((t) => t.taskId) };
          } else if (!busy && cacheWakeDue(cache, nowMs) && cache!.expiresAtMs !== warmedExpiryMs) {
            warmedExpiryMs = cache!.expiresAtMs;
            yield* wake(
              [
                "Check-in: these background commands are still running:",
                ...tasks.map(describeTask),
                "Stop one only if it is stuck. Otherwise reply in one line.",
              ].join("\n"),
            );
          }
        }
        yield* Effect.sleep(TICK);
      }
    },
    (effect, threadId) =>
      effect.pipe(
        Effect.catch((cause) =>
          Effect.logWarning("background command watch stopped", { threadId, cause }),
        ),
      ),
  );

  const start = Effect.fn("BackgroundCommandLimitService.start")(function* () {
    if (!(options.enabled ?? TASK_COMMAND_HOLD_ENABLED)) return;
    const watchers = yield* FiberMap.make<ThreadId>();
    yield* forkParked(
      Stream.runForEach(orchestrator.streamDomainEvents, (event) =>
        // Claude lists commands on the provider thread. Codex leaves them running past a run.
        (event.type === "run.updated" &&
          (event.payload.status === "completed" || event.payload.status === "waiting")) ||
        (event.type === "provider-thread.updated" &&
          (event.payload.pendingBackgroundTasks?.length ?? 0) > 0)
          ? FiberMap.run(watchers, event.threadId, watchThread(event.threadId), {
              onlyIfMissing: true,
            })
          : Effect.void,
      ),
    );
  });
  return { start };
});
