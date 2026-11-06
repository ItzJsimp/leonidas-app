import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, describe, it } from "@effect/vitest";
import {
  CommandId,
  EnvironmentId,
  NodeId,
  type OrchestrationV2ThreadShell,
  type ScheduledTask,
  ScheduledTaskId,
  type TaskBoardCardCreateInput,
  type TaskBoardCardUpdateInput,
  TaskBoardOperationError,
  type TaskBoardTask,
  type TaskBoardWorkspaceSnapshot,
  ProjectId,
  ProviderDriverKind,
  ProviderInstanceId,
  type RuntimeMode,
  RunId,
  ThreadId,
  type OrchestrationV2ThreadProjection,
  type ServerProvider,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Ref from "effect/Ref";
import * as Stream from "effect/Stream";

import {
  DispatchModeLimit,
  type DispatchModeRefusal,
} from "../orchestration-v2/DispatchModeLimit.ts";
import {
  OrchestratorProjectionError,
  OrchestratorThreadAboveModeLimitError,
} from "../orchestration-v2/Orchestrator.ts";
import * as ProviderAdapterRegistry from "../orchestration-v2/ProviderAdapterRegistry.ts";
import * as ThreadManagementService from "../orchestration-v2/ThreadManagementService.ts";
import * as ProviderRegistry from "../provider/ProviderRegistry.ts";
import { buildUnavailableProviderSnapshot } from "../provider/unavailableProviderSnapshot.ts";
import * as ProjectService from "../project/ProjectService.ts";
import * as ScheduledTaskService from "../scheduledTasks/ScheduledTaskService.ts";
import * as ServerSettings from "../serverSettings.ts";
import * as SecretRequests from "../secrets/SecretRequests.ts";
import * as TaskBoardService from "../taskBoard/TaskBoardService.ts";
import type { McpInvocationScope } from "./McpInvocationContext.ts";
import { idleThreadProjection, liveThreadShell } from "./McpToolAccess.testkit.ts";
import * as OrchestratorMcpService from "./OrchestratorMcpService.ts";
import { SpawnApprovals, type SpawnApprovalsShape } from "../subagents/SpawnApprovals.ts";
import type * as ProviderAdapter from "@t3tools/provider-core/server/ProviderAdapter";

/** A broker that allows every confirm-tier spawn, so delegate tests do not wait for a card. */
const spawnApprovalsAnswering = (
  answer: "allow_once" | "deny",
  requested?: Array<{ readonly subagent: string; readonly model: string }>,
): SpawnApprovalsShape => ({
  pending: Stream.empty,
  isAllowedForThread: () => Effect.succeed(false),
  request: (approval) =>
    Effect.sync(() => {
      requested?.push({ subagent: approval.subagent, model: approval.model });
      return { kind: answer };
    }),
  respond: () => Effect.void,
  recordSpawn: () => Effect.void,
  stats: Effect.succeed({ spawnsToday: 0, waitedToday: 0, meanStartTokensToday: null }),
  keepStatsIn: () => Effect.void,
});

/** No project folder, so a plain delegation reads only the app's free-tier list. */
const noProjects = Layer.mock(ProjectService.ProjectService)({
  getById: () => Effect.succeedNone,
});

const serviceLayerUnderTest = Layer.merge(
  OrchestratorMcpService.layer,
  Layer.succeed(SpawnApprovals, spawnApprovalsAnswering("allow_once")),
);

describe("OrchestratorMcpService", () => {
  it.effect("retries terminal acknowledgement with a fresh command id", () =>
    Effect.gen(function* () {
      const parentThreadId = ThreadId.make("thread:mcp-ack-parent");
      const childThreadId = ThreadId.make("thread:mcp-ack-child");
      const childRunId = RunId.make("run:mcp-ack-child");
      const taskId = NodeId.make("node:mcp-ack-task");
      const acknowledgementCommandIds = yield* Ref.make<ReadonlyArray<string>>([]);
      const acknowledgementAttempts = yield* Ref.make(0);
      const parentProjection = {
        thread: { id: parentThreadId },
        runs: [],
        contextTransfers: [],
        subagents: [
          {
            id: taskId,
            threadId: parentThreadId,
            origin: "app_owned",
            childThreadId,
            driver: "codex",
            model: "gpt-5.6-terra",
            result: "terminal result",
            completionDelivery: { state: "pending" },
          },
        ],
      } as unknown as OrchestrationV2ThreadProjection;
      const childProjection = {
        thread: { id: childThreadId },
        runs: [
          {
            id: childRunId,
            ordinal: 1,
            status: "completed",
            startedAt: DateTime.makeUnsafe("2026-10-03T10:00:00Z"),
            completedAt: DateTime.makeUnsafe("2026-10-03T10:10:00Z"),
          },
          {
            id: RunId.make("run:mcp-ack-continuation"),
            ordinal: 2,
            status: "failed",
            startedAt: DateTime.makeUnsafe("2026-10-03T10:02:00Z"),
            completedAt: DateTime.makeUnsafe("2026-10-03T10:05:00Z"),
          },
        ],
        contextTransfers: [],
        messages: [],
        subagents: [],
        providerThreads: [],
      } as unknown as OrchestrationV2ThreadProjection;
      let hasNestedWork = true;
      const layerDependencies = Layer.mergeAll(
        NodeServices.layer,
        Layer.mock(ThreadManagementService.ThreadManagementService)({
          getThreadRecords: (threadId) =>
            Effect.succeed(
              threadId === parentThreadId
                ? hasNestedWork
                  ? {
                      ...parentProjection,
                      subagents: parentProjection.subagents.map((task) => ({
                        ...task,
                        result: null,
                        status: "running" as const,
                      })),
                    }
                  : parentProjection
                : hasNestedWork
                  ? {
                      ...childProjection,
                      subagents: [
                        { ...parentProjection.subagents[0]!, status: "running" as const },
                      ],
                    }
                  : childProjection,
            ),
          dispatch: (command) =>
            Ref.update(acknowledgementCommandIds, (commandIds) => [
              ...commandIds,
              String(command.commandId),
            ]).pipe(
              Effect.andThen(Ref.updateAndGet(acknowledgementAttempts, (count) => count + 1)),
              Effect.flatMap((attempt) =>
                attempt === 1
                  ? Effect.fail(new Error("simulated acknowledgement failure") as never)
                  : Effect.succeed({} as never),
              ),
            ),
        }),
        ServerSettings.layerTest(),
        Layer.mock(ProviderRegistry.ProviderRegistry)({ getProviders: Effect.succeed([]) }),
        Layer.mock(ProviderAdapterRegistry.ProviderAdapterRegistryV2)({
          list: () => Effect.succeed([]),
        }),
        noProjects,
        Layer.mock(TaskBoardService.TaskBoardService)({}),
        Layer.mock(SecretRequests.SecretRequests)({}),
        Layer.mock(ScheduledTaskService.ScheduledTaskService)({}),
      );
      const scope: McpInvocationScope = {
        environmentId: EnvironmentId.make("environment:mcp-ack"),
        requestNamespace: "provider-session:mcp-ack",
        thread: {
          threadId: parentThreadId,
          providerSessionId: "provider-session:mcp-ack",
          providerInstanceId: ProviderInstanceId.make("codex"),
        },
        client: undefined,
        capabilities: new Set(["orchestration"]),
        issuedAt: 1,
      };

      yield* Effect.gen(function* () {
        const service = yield* OrchestratorMcpService.OrchestratorMcpService;
        const pending = yield* service.taskStatus(scope, taskId);
        assert.equal(pending.status, "running");
        assert.equal(pending.workState, "waiting_for_children");
        assert.isNull(pending.summary);
        assert.equal(yield* Ref.get(acknowledgementAttempts), 0);
        hasNestedWork = false;
        const error = yield* service.taskStatus(scope, taskId).pipe(Effect.flip);
        assert.equal(error.code, "orchestration_error");

        const result = yield* service.taskStatus(scope, taskId);
        assert.equal(result.status, "completed");
        assert.equal(result.summary, "terminal result");
        assert.equal(result.latestTerminalRunId, childRunId);
        assert.equal(result.latestTerminalStatus, "completed");
        assert.equal(result.usage?.usageStatus, "unavailable");
        assert.equal(result.usage?.runCount, 2);
        assert.equal(result.usage?.wallTimeMs, 780_000);
        const commandIds = yield* Ref.get(acknowledgementCommandIds);
        assert.equal(commandIds.length, 2);
        assert.notEqual(commandIds[0], commandIds[1]);
      }).pipe(Effect.provide(serviceLayerUnderTest.pipe(Layer.provide(layerDependencies))));
    }),
  );

  it.effect("reports a restart-cut child as working until its continuation settles", () =>
    Effect.gen(function* () {
      const parentThreadId = ThreadId.make("thread:mcp-restart-parent");
      const childThreadId = ThreadId.make("thread:mcp-restart-child");
      const taskId = NodeId.make("node:mcp-restart-task");
      const dispatched = yield* Ref.make(0);
      let awaitsRestart = true;
      let readFails = true;
      const parentProjection = {
        thread: { id: parentThreadId },
        runs: [],
        contextTransfers: [],
        subagents: [
          {
            id: taskId,
            threadId: parentThreadId,
            origin: "app_owned",
            childThreadId,
            driver: "codex",
            model: "gpt-5.6-terra",
            status: "running",
            result: null,
            completionDelivery: { state: "pending" },
          },
        ],
      } as unknown as OrchestrationV2ThreadProjection;
      const childProjection = {
        thread: { id: childThreadId },
        runs: [
          {
            id: RunId.make("run:mcp-restart-child"),
            ordinal: 1,
            status: "cancelled",
            delegatedTaskId: taskId,
          },
          // An unrelated later run cannot supply this follow-up's result.
          { id: RunId.make("run:mcp-restart-later"), ordinal: 2, status: "running" },
        ],
        contextTransfers: [],
        messages: [],
        subagents: [],
        providerThreads: [],
        turnItems: [],
      } as unknown as OrchestrationV2ThreadProjection;
      const layerDependencies = Layer.mergeAll(
        NodeServices.layer,
        Layer.mock(ThreadManagementService.ThreadManagementService)({
          getThreadRecords: (threadId) =>
            Effect.succeed(threadId === parentThreadId ? parentProjection : childProjection),
          delegatedTaskResultPending: () =>
            readFails
              ? Effect.fail(new OrchestratorProjectionError({ threadId: childThreadId }))
              : Effect.succeed(awaitsRestart),
          dispatch: () => Ref.update(dispatched, (count) => count + 1).pipe(Effect.as({} as never)),
        }),
        ServerSettings.layerTest(),
        Layer.mock(ProviderRegistry.ProviderRegistry)({ getProviders: Effect.succeed([]) }),
        Layer.mock(ProviderAdapterRegistry.ProviderAdapterRegistryV2)({
          list: () => Effect.succeed([]),
        }),
        noProjects,
        Layer.mock(TaskBoardService.TaskBoardService)({}),
        Layer.mock(SecretRequests.SecretRequests)({}),
        Layer.mock(ScheduledTaskService.ScheduledTaskService)({}),
      );
      const scope: McpInvocationScope = {
        environmentId: EnvironmentId.make("environment:mcp-restart"),
        requestNamespace: "provider-session:mcp-restart",
        thread: {
          threadId: parentThreadId,
          providerSessionId: "provider-session:mcp-restart",
          providerInstanceId: ProviderInstanceId.make("codex"),
        },
        client: undefined,
        capabilities: new Set(["orchestration"]),
        issuedAt: 1,
      };

      yield* Effect.gen(function* () {
        const service = yield* OrchestratorMcpService.OrchestratorMcpService;
        const failed = yield* service.taskStatus(scope, taskId).pipe(Effect.flip);
        assert.equal(failed.code, "orchestration_error");
        assert.equal(yield* Ref.get(dispatched), 0);
        readFails = false;
        const held = yield* service.taskStatus(scope, taskId);
        assert.equal(held.status, "running");
        assert.equal(held.workState, "working");
        assert.isNull(held.summary);
        // Acknowledging the cut run would suppress the real result's wake.
        assert.equal(yield* Ref.get(dispatched), 0);
        awaitsRestart = false;
        const settled = yield* service.taskStatus(scope, taskId);
        assert.equal(settled.status, "cancelled");
        assert.equal(yield* Ref.get(dispatched), 1);
      }).pipe(Effect.provide(serviceLayerUnderTest.pipe(Layer.provide(layerDependencies))));
    }),
  );

  it.effect("does not dispose delivery when a nonterminal task has no active child run", () =>
    Effect.gen(function* () {
      const parentThreadId = ThreadId.make("thread:mcp-cancel-parent");
      const childThreadId = ThreadId.make("thread:mcp-cancel-child");
      const taskId = NodeId.make("node:mcp-cancel-task");
      const dispatched = yield* Ref.make<ReadonlyArray<unknown>>([]);
      const parentProjection = {
        thread: { id: parentThreadId },
        runs: [],
        contextTransfers: [],
        subagents: [
          {
            id: taskId,
            threadId: parentThreadId,
            origin: "app_owned",
            childThreadId,
            driver: "codex",
            model: "gpt-5.6-terra",
            result: null,
            completionDelivery: { state: "pending" },
          },
        ],
      } as unknown as OrchestrationV2ThreadProjection;
      const childProjection = {
        thread: { id: childThreadId },
        runs: [],
        contextTransfers: [],
        messages: [],
        subagents: [],
        providerThreads: [],
      } as unknown as OrchestrationV2ThreadProjection;
      const layerDependencies = Layer.mergeAll(
        NodeServices.layer,
        Layer.mock(ThreadManagementService.ThreadManagementService)({
          getThreadRecords: (threadId) =>
            Effect.succeed(threadId === parentThreadId ? parentProjection : childProjection),
          // The child still runs within the parent's modes.
          getThreadShell: (threadId) => Effect.succeed(liveThreadShell(threadId)),
          dispatch: (command) =>
            Ref.update(dispatched, (commands) => [...commands, command]).pipe(
              Effect.as({} as never),
            ),
        }),
        ServerSettings.layerTest(),
        Layer.mock(ProviderRegistry.ProviderRegistry)({ getProviders: Effect.succeed([]) }),
        Layer.mock(ProviderAdapterRegistry.ProviderAdapterRegistryV2)({
          list: () => Effect.succeed([]),
        }),
        noProjects,
        Layer.mock(TaskBoardService.TaskBoardService)({}),
        Layer.mock(SecretRequests.SecretRequests)({}),
        Layer.mock(ScheduledTaskService.ScheduledTaskService)({}),
      );
      const scope: McpInvocationScope = {
        environmentId: EnvironmentId.make("environment:mcp-cancel"),
        requestNamespace: "provider-session:mcp-cancel",
        thread: {
          threadId: parentThreadId,
          providerSessionId: "provider-session:mcp-cancel",
          providerInstanceId: ProviderInstanceId.make("codex"),
        },
        client: undefined,
        capabilities: new Set(["orchestration"]),
        issuedAt: 1,
      };

      yield* Effect.gen(function* () {
        const service = yield* OrchestratorMcpService.OrchestratorMcpService;
        const error = yield* service
          .cancelTask(scope, { taskId, clientRequestId: "cancel-unstarted-task" })
          .pipe(Effect.flip);
        assert.equal(error.code, "task_not_cancellable");
        assert.deepEqual(yield* Ref.get(dispatched), []);
      }).pipe(Effect.provide(serviceLayerUnderTest.pipe(Layer.provide(layerDependencies))));
    }),
  );

  it.effect("does not dispose delivery when the child stop fails", () =>
    Effect.gen(function* () {
      const parentThreadId = ThreadId.make("thread:mcp-cancel-failed-parent");
      const childThreadId = ThreadId.make("thread:mcp-cancel-failed-child");
      const childRunId = RunId.make("run:mcp-cancel-failed-child");
      const taskId = NodeId.make("node:mcp-cancel-failed-task");
      const dispatched = yield* Ref.make<ReadonlyArray<unknown>>([]);
      const parentProjection = {
        thread: { id: parentThreadId },
        runs: [],
        contextTransfers: [],
        subagents: [
          {
            id: taskId,
            threadId: parentThreadId,
            origin: "app_owned",
            childThreadId,
            driver: "codex",
            model: "gpt-5.6-terra",
            result: null,
            completionDelivery: { state: "pending" },
          },
        ],
      } as unknown as OrchestrationV2ThreadProjection;
      const childProjection = {
        thread: { id: childThreadId },
        runs: [{ id: childRunId, status: "running" }],
        contextTransfers: [],
        messages: [],
        subagents: [],
        providerThreads: [],
      } as unknown as OrchestrationV2ThreadProjection;
      const layerDependencies = Layer.mergeAll(
        NodeServices.layer,
        Layer.mock(ThreadManagementService.ThreadManagementService)({
          getThreadRecords: (threadId) =>
            Effect.succeed(threadId === parentThreadId ? parentProjection : childProjection),
          // The child still runs within the parent's modes.
          getThreadShell: (threadId) => Effect.succeed(liveThreadShell(threadId)),
          dispatch: (command) =>
            Ref.update(dispatched, (commands) => [...commands, command]).pipe(
              Effect.andThen(Effect.fail(new Error("simulated stop failure") as never)),
            ),
        }),
        ServerSettings.layerTest(),
        Layer.mock(ProviderRegistry.ProviderRegistry)({ getProviders: Effect.succeed([]) }),
        Layer.mock(ProviderAdapterRegistry.ProviderAdapterRegistryV2)({
          list: () => Effect.succeed([]),
        }),
        noProjects,
        Layer.mock(TaskBoardService.TaskBoardService)({}),
        Layer.mock(SecretRequests.SecretRequests)({}),
        Layer.mock(ScheduledTaskService.ScheduledTaskService)({}),
      );
      const scope: McpInvocationScope = {
        environmentId: EnvironmentId.make("environment:mcp-cancel-failed"),
        requestNamespace: "provider-session:mcp-cancel-failed",
        thread: {
          threadId: parentThreadId,
          providerSessionId: "provider-session:mcp-cancel-failed",
          providerInstanceId: ProviderInstanceId.make("codex"),
        },
        client: undefined,
        capabilities: new Set(["orchestration"]),
        issuedAt: 1,
      };

      yield* Effect.gen(function* () {
        const service = yield* OrchestratorMcpService.OrchestratorMcpService;
        const error = yield* service
          .cancelTask(scope, { taskId, clientRequestId: "cancel-failed-task" })
          .pipe(Effect.flip);
        assert.equal(error.code, "task_not_cancellable");
        assert.deepEqual(
          (yield* Ref.get(dispatched)).map((command) => (command as { type: string }).type),
          ["thread.stop"],
        );
      }).pipe(Effect.provide(serviceLayerUnderTest.pipe(Layer.provide(layerDependencies))));
    }),
  );

  it.effect("returns cancel requested when post-stop disposal fails", () =>
    Effect.gen(function* () {
      const parentThreadId = ThreadId.make("thread:mcp-cancel-dispose-failed-parent");
      const childThreadId = ThreadId.make("thread:mcp-cancel-dispose-failed-child");
      const childRunId = RunId.make("run:mcp-cancel-dispose-failed-child");
      const taskId = NodeId.make("node:mcp-cancel-dispose-failed-task");
      const dispatched = yield* Ref.make<ReadonlyArray<unknown>>([]);
      const parentProjection = {
        thread: { id: parentThreadId },
        runs: [],
        contextTransfers: [],
        subagents: [
          {
            id: taskId,
            threadId: parentThreadId,
            origin: "app_owned",
            childThreadId,
            driver: "codex",
            model: "gpt-5.6-terra",
            result: null,
            completionDelivery: { state: "pending" },
          },
        ],
      } as unknown as OrchestrationV2ThreadProjection;
      const childProjection = {
        thread: { id: childThreadId },
        runs: [{ id: childRunId, status: "running" }],
        contextTransfers: [],
        messages: [],
        subagents: [],
        providerThreads: [],
      } as unknown as OrchestrationV2ThreadProjection;
      const layerDependencies = Layer.mergeAll(
        NodeServices.layer,
        Layer.mock(ThreadManagementService.ThreadManagementService)({
          getThreadRecords: (threadId) =>
            Effect.succeed(threadId === parentThreadId ? parentProjection : childProjection),
          // The child still runs within the parent's modes.
          getThreadShell: (threadId) => Effect.succeed(liveThreadShell(threadId)),
          dispatch: (command) =>
            Ref.update(dispatched, (commands) => [...commands, command]).pipe(
              Effect.andThen(
                command.type === "delegated_task.completion-delivery.dispose"
                  ? Effect.fail(new Error("simulated disposal failure") as never)
                  : Effect.succeed({} as never),
              ),
            ),
          stopDelegatedTasks: () => Effect.void,
        }),
        ServerSettings.layerTest(),
        Layer.mock(ProviderRegistry.ProviderRegistry)({ getProviders: Effect.succeed([]) }),
        Layer.mock(ProviderAdapterRegistry.ProviderAdapterRegistryV2)({
          list: () => Effect.succeed([]),
        }),
        noProjects,
        Layer.mock(TaskBoardService.TaskBoardService)({}),
        Layer.mock(SecretRequests.SecretRequests)({}),
        Layer.mock(ScheduledTaskService.ScheduledTaskService)({}),
      );
      const scope: McpInvocationScope = {
        environmentId: EnvironmentId.make("environment:mcp-cancel-dispose-failed"),
        requestNamespace: "provider-session:mcp-cancel-dispose-failed",
        thread: {
          threadId: parentThreadId,
          providerSessionId: "provider-session:mcp-cancel-dispose-failed",
          providerInstanceId: ProviderInstanceId.make("codex"),
        },
        client: undefined,
        capabilities: new Set(["orchestration"]),
        issuedAt: 1,
      };

      yield* Effect.gen(function* () {
        const service = yield* OrchestratorMcpService.OrchestratorMcpService;
        const result = yield* service.cancelTask(scope, {
          taskId,
          clientRequestId: "cancel-dispose-failed-task",
        });
        assert.equal(result.status, "cancel_requested");
        assert.deepEqual(
          (yield* Ref.get(dispatched)).map((command) => (command as { type: string }).type),
          ["thread.stop", "delegated_task.completion-delivery.dispose"],
        );
      }).pipe(Effect.provide(serviceLayerUnderTest.pipe(Layer.provide(layerDependencies))));
    }),
  );

  it.effect("refuses to cancel a task whose child now runs above the parent's modes", () =>
    Effect.gen(function* () {
      const parentThreadId = ThreadId.make("thread:mcp-cancel-dispose-failed-parent");
      const childThreadId = ThreadId.make("thread:mcp-cancel-dispose-failed-child");
      const childRunId = RunId.make("run:mcp-cancel-dispose-failed-child");
      const taskId = NodeId.make("node:mcp-cancel-dispose-failed-task");
      const dispatched = yield* Ref.make<ReadonlyArray<unknown>>([]);
      // The parent runs Supervised in plan mode.
      const parentProjection = {
        thread: { id: parentThreadId, runtimeMode: "approval-required", interactionMode: "plan" },
        runs: [],
        contextTransfers: [],
        subagents: [
          {
            id: taskId,
            threadId: parentThreadId,
            origin: "app_owned",
            childThreadId,
            driver: "codex",
            model: "gpt-5.6-terra",
            result: null,
            completionDelivery: { state: "pending" },
          },
        ],
      } as unknown as OrchestrationV2ThreadProjection;
      const childProjection = {
        thread: { id: childThreadId },
        runs: [{ id: childRunId, status: "running" }],
        contextTransfers: [],
        messages: [],
        subagents: [],
        providerThreads: [],
      } as unknown as OrchestrationV2ThreadProjection;
      const layerDependencies = Layer.mergeAll(
        NodeServices.layer,
        Layer.mock(ThreadManagementService.ThreadManagementService)({
          getThreadRecords: (threadId) =>
            Effect.succeed(threadId === parentThreadId ? parentProjection : childProjection),
          // Its user has since raised the child to full access.
          getThreadShell: (threadId) => Effect.succeed(liveThreadShell(threadId)),
          dispatch: (command) =>
            Ref.update(dispatched, (commands) => [...commands, command]).pipe(
              Effect.andThen(
                command.type === "delegated_task.completion-delivery.dispose"
                  ? Effect.fail(new Error("simulated disposal failure") as never)
                  : Effect.succeed({} as never),
              ),
            ),
          stopDelegatedTasks: () => Effect.void,
        }),
        ServerSettings.layerTest(),
        Layer.mock(ProviderRegistry.ProviderRegistry)({ getProviders: Effect.succeed([]) }),
        Layer.mock(ProviderAdapterRegistry.ProviderAdapterRegistryV2)({
          list: () => Effect.succeed([]),
        }),
        noProjects,
        Layer.mock(TaskBoardService.TaskBoardService)({}),
        Layer.mock(SecretRequests.SecretRequests)({}),
        Layer.mock(ScheduledTaskService.ScheduledTaskService)({}),
      );
      const scope: McpInvocationScope = {
        environmentId: EnvironmentId.make("environment:mcp-cancel-dispose-failed"),
        requestNamespace: "provider-session:mcp-cancel-dispose-failed",
        thread: {
          threadId: parentThreadId,
          providerSessionId: "provider-session:mcp-cancel-dispose-failed",
          providerInstanceId: ProviderInstanceId.make("codex"),
        },
        client: undefined,
        capabilities: new Set(["orchestration"]),
        issuedAt: 1,
      };

      yield* Effect.gen(function* () {
        const service = yield* OrchestratorMcpService.OrchestratorMcpService;
        const error = yield* service
          .cancelTask(scope, { taskId, clientRequestId: "cancel-above-modes" })
          .pipe(Effect.flip);
        assert.equal(error.code, "runtime_mode_escalation_denied");
        assert.deepEqual(yield* Ref.get(dispatched), []);
      }).pipe(Effect.provide(serviceLayerUnderTest.pipe(Layer.provide(layerDependencies))));
    }),
  );

  /**
   * A Supervised parent cancels its Supervised child, under which a task
   * now runs at full access. Reports what the cancel did.
   */
  const cancelOverRaisedGrandchild = (child: {
    readonly deleted: boolean;
    /** The grandchild passes the check, and its user raises it before the stop reaches it. */
    readonly raisedDuringStop?: boolean;
  }) =>
    Effect.gen(function* () {
      const parentThreadId = ThreadId.make("thread:mcp-cancel-grandchild-parent");
      const childThreadId = ThreadId.make("thread:mcp-cancel-grandchild-child");
      const grandchildThreadId = ThreadId.make("thread:mcp-cancel-grandchild-grandchild");
      const taskId = NodeId.make("node:mcp-cancel-grandchild-task");
      const dispatched = yield* Ref.make<ReadonlyArray<unknown>>([]);
      const stoppedBelow = yield* Ref.make(false);
      const appOwnedTask = (id: string, threadId: ThreadId, childId: ThreadId) => ({
        id: NodeId.make(id),
        threadId,
        origin: "app_owned",
        childThreadId: childId,
        driver: "codex",
        model: "gpt-5.6-terra",
        result: null,
        completionDelivery: { state: "pending" },
      });
      // A Supervised parent delegated a Supervised child, which delegated a task of its own.
      const projections = new Map([
        [
          parentThreadId,
          {
            thread: {
              id: parentThreadId,
              runtimeMode: "approval-required",
              interactionMode: "default",
            },
            runs: [],
            contextTransfers: [],
            subagents: [appOwnedTask(taskId, parentThreadId, childThreadId)],
          },
        ],
        [
          childThreadId,
          {
            thread: { id: childThreadId },
            runs: [{ id: RunId.make("run:mcp-cancel-grandchild-child"), status: "running" }],
            contextTransfers: [],
            messages: [],
            subagents: [
              appOwnedTask("node:mcp-cancel-grandchild-below", childThreadId, grandchildThreadId),
            ],
            providerThreads: [],
          },
        ],
        [
          grandchildThreadId,
          {
            thread: { id: grandchildThreadId },
            runs: [],
            contextTransfers: [],
            messages: [],
            subagents: [],
            providerThreads: [],
          },
        ],
      ]) as unknown as ReadonlyMap<ThreadId, OrchestrationV2ThreadProjection>;
      const layerDependencies = Layer.mergeAll(
        NodeServices.layer,
        Layer.mock(ThreadManagementService.ThreadManagementService)({
          getThreadRecords: (threadId) => Effect.succeed(projections.get(threadId)!),
          // The child still runs Supervised; its user has since raised the task under it
          // to full access.
          getThreadShell: (threadId) =>
            Effect.succeed(
              threadId === grandchildThreadId && child.raisedDuringStop !== true
                ? liveThreadShell(threadId)
                : threadId === childThreadId && child.deleted
                  ? null
                  : liveThreadShell(threadId, { runtimeMode: "approval-required" }),
            ),
          dispatch: (command) =>
            Ref.update(dispatched, (commands) => [...commands, command]).pipe(
              Effect.as({} as never),
            ),
          // Stands in for the orchestrator, which finds the grandchild raised
          // under its lock, when the stop runs under the parent's limit.
          stopDelegatedTasks: () =>
            Effect.gen(function* () {
              const limit = yield* DispatchModeLimit;
              if (child.raisedDuringStop === true && limit?.refused !== undefined) {
                const refusal: DispatchModeRefusal = {
                  threadId: grandchildThreadId,
                  mode: "runtime",
                  runtimeMode: "full-access",
                  interactionMode: "default",
                };
                yield* Ref.set(limit.refused, refusal);
                return yield* new OrchestratorThreadAboveModeLimitError({
                  commandId: CommandId.make("stop-grandchild"),
                  threadId: grandchildThreadId,
                  mode: "runtime",
                  runtimeMode: "full-access",
                  interactionMode: "default",
                });
              }
              yield* Ref.set(stoppedBelow, true);
            }),
        }),
        ServerSettings.layerTest(),
        Layer.mock(ProviderRegistry.ProviderRegistry)({ getProviders: Effect.succeed([]) }),
        Layer.mock(ProviderAdapterRegistry.ProviderAdapterRegistryV2)({
          list: () => Effect.succeed([]),
        }),
        noProjects,
        Layer.mock(TaskBoardService.TaskBoardService)({}),
        Layer.mock(SecretRequests.SecretRequests)({}),
        Layer.mock(ScheduledTaskService.ScheduledTaskService)({}),
      );
      const scope: McpInvocationScope = {
        environmentId: EnvironmentId.make("environment:mcp-cancel-grandchild"),
        requestNamespace: "provider-session:mcp-cancel-grandchild",
        thread: {
          threadId: parentThreadId,
          providerSessionId: "provider-session:mcp-cancel-grandchild",
          providerInstanceId: ProviderInstanceId.make("codex"),
        },
        client: undefined,
        capabilities: new Set(["orchestration"]),
        issuedAt: 1,
      };

      return yield* Effect.gen(function* () {
        const service = yield* OrchestratorMcpService.OrchestratorMcpService;
        const error = yield* service
          .cancelTask(scope, { taskId, clientRequestId: "cancel-grandchild-above-modes" })
          .pipe(Effect.flip);
        return {
          code: error.code,
          dispatched: yield* Ref.get(dispatched),
          stoppedBelow: yield* Ref.get(stoppedBelow),
        };
      }).pipe(Effect.provide(serviceLayerUnderTest.pipe(Layer.provide(layerDependencies))));
    });

  it.effect("refuses to cancel a task when a task under it now runs above the parent's modes", () =>
    Effect.gen(function* () {
      assert.deepEqual(yield* cancelOverRaisedGrandchild({ deleted: false }), {
        code: "runtime_mode_escalation_denied",
        dispatched: [],
        stoppedBelow: false,
      });
    }),
  );

  it.effect("reports a task under the child that its user raises while it is being stopped", () =>
    Effect.gen(function* () {
      const outcome = yield* cancelOverRaisedGrandchild({ deleted: false, raisedDuringStop: true });
      assert.equal(outcome.code, "runtime_mode_escalation_denied");
      assert.isFalse(outcome.stoppedBelow);
    }),
  );

  it.effect("checks the tasks under a deleted child before cancelling it", () =>
    Effect.gen(function* () {
      assert.deepEqual(yield* cancelOverRaisedGrandchild({ deleted: true }), {
        code: "runtime_mode_escalation_denied",
        dispatched: [],
        stoppedBelow: false,
      });
    }),
  );
});

describe("OrchestratorMcpService provider resolution", () => {
  const parentThreadId = ThreadId.make("thread:mcp-providers-parent");
  const childThreadId = ThreadId.make("thread:mcp-providers-child");
  const parentRunId = RunId.make("run:mcp-providers-parent");
  const parentNodeId = NodeId.make("node:mcp-providers-root");
  const taskId = NodeId.make("node:mcp-providers-task");
  const projectId = ProjectId.make("project:mcp-providers");
  const codexInstanceId = ProviderInstanceId.make("codex");
  const antigravityInstanceId = ProviderInstanceId.make("antigravity");

  const scope: McpInvocationScope = {
    environmentId: EnvironmentId.make("environment:mcp-providers"),
    requestNamespace: "provider-session:mcp-providers",
    thread: {
      threadId: parentThreadId,
      providerSessionId: "provider-session:mcp-providers",
      providerInstanceId: codexInstanceId,
    },
    client: undefined,
    capabilities: new Set(["orchestration"]),
    issuedAt: 1,
  };

  const providerSnapshot = (input: {
    readonly instanceId: ProviderInstanceId;
    readonly driver: ProviderDriverKind;
    readonly model?: string;
    readonly enabled?: boolean;
    readonly email?: string;
    readonly credentialFingerprint?: string;
    readonly usagePercent?: number;
    readonly message?: string;
    readonly runtimeModes?: ReadonlyArray<RuntimeMode>;
  }): ServerProvider => ({
    instanceId: input.instanceId,
    driver: input.driver,
    enabled: input.enabled ?? true,
    installed: true,
    version: "test",
    status: "ready",
    auth: {
      status: "authenticated",
      ...(input.email === undefined ? {} : { email: input.email }),
    },
    checkedAt: "2026-09-13T00:00:00.000Z",
    ...(input.message === undefined ? {} : { message: input.message }),
    models:
      input.model === undefined
        ? []
        : [{ slug: input.model, name: input.model, isCustom: false, capabilities: null }],
    slashCommands: [],
    skills: [],
    ...(input.runtimeModes === undefined ? {} : { supportedRuntimeModes: input.runtimeModes }),
    ...(input.usagePercent === undefined && input.credentialFingerprint === undefined
      ? {}
      : {
          usageLimits: {
            checkedAt: "2026-09-13T00:00:00.000Z",
            windows:
              input.usagePercent === undefined
                ? []
                : [
                    {
                      id: "weekly",
                      kind: "weekly" as const,
                      label: "Weekly",
                      usedPercent: input.usagePercent,
                    },
                  ],
            ...(input.credentialFingerprint === undefined
              ? {}
              : { credentialFingerprint: input.credentialFingerprint }),
          },
        }),
  });

  /** A registry whose probes report the same snapshots it already holds. */
  const providerRegistryLayer = (providers: ReadonlyArray<ServerProvider>) =>
    Layer.mock(ProviderRegistry.ProviderRegistry)({
      getProviders: Effect.succeed(providers),
      refreshInstance: () => Effect.succeed(providers),
    });

  const adapterRegistryLayer = (instanceIds: ReadonlyArray<ProviderInstanceId>) =>
    Layer.succeed(
      ProviderAdapterRegistry.ProviderAdapterRegistryV2,
      ProviderAdapterRegistry.ProviderAdapterRegistryV2.of({
        list: () => Effect.succeed(instanceIds),
        get: (instanceId) =>
          instanceIds.includes(instanceId)
            ? Effect.succeed({
                instanceId,
              } as unknown as ProviderAdapter.ProviderAdapterV2["Service"])
            : Effect.fail(
                new ProviderAdapterRegistry.ProviderAdapterRegistryLookupError({ instanceId }),
              ),
      }),
    );

  const parentProjection = (
    subagents: ReadonlyArray<unknown>,
    modelSelection: {
      readonly instanceId: ProviderInstanceId;
      readonly model: string;
      readonly options?: ReadonlyArray<{ readonly id: string; readonly value: unknown }>;
    } = { instanceId: codexInstanceId, model: "gpt-5.4" },
    history: {
      readonly providerThreads?: OrchestrationV2ThreadProjection["providerThreads"];
      readonly providerTurns?: OrchestrationV2ThreadProjection["providerTurns"];
    } = {},
  ): OrchestrationV2ThreadProjection =>
    ({
      thread: {
        id: parentThreadId,
        projectId,
        title: "MCP parent",
        createdBy: "user",
        creationSource: "web",
        modelSelection,
        runtimeMode: "full-access",
        interactionMode: "default",
      },
      runs: [
        {
          id: parentRunId,
          ordinal: 1,
          status: "running",
          rootNodeId: parentNodeId,
          providerInstanceId: codexInstanceId,
          modelSelection,
        },
      ],
      contextTransfers: [],
      subagents,
      providerThreads: history.providerThreads ?? [],
      providerTurns: history.providerTurns ?? [],
    }) as unknown as OrchestrationV2ThreadProjection;

  const childProjection = {
    thread: { id: childThreadId },
    runs: [],
    contextTransfers: [],
    messages: [],
    subagents: [],
    providerThreads: [],
    turnItems: [],
  } as unknown as OrchestrationV2ThreadProjection;

  it.effect(
    "advertises orchestration capability from registered adapters rather than a driver allowlist",
    () =>
      Effect.gen(function* () {
        const disabledAntigravityInstanceId = ProviderInstanceId.make("antigravity-alt");
        const forkOnlyInstanceId = ProviderInstanceId.make("forkOnly");
        const forkShadow = yield* buildUnavailableProviderSnapshot({
          driverKind: "forkOnly",
          instanceId: forkOnlyInstanceId,
          reason: "Driver 'forkOnly' is not registered in this build.",
          checkedAt: "2026-09-13T00:00:00.000Z",
        });
        const reasoningDescriptor = {
          id: "reasoning",
          label: "Reasoning effort",
          type: "select" as const,
          options: [
            { id: "low", label: "Low" },
            { id: "high", label: "High" },
          ],
        };
        let providers: ReadonlyArray<ServerProvider> = [
          {
            ...providerSnapshot({
              instanceId: codexInstanceId,
              driver: ProviderDriverKind.make("codex"),
            }),
            models: [
              {
                slug: "gpt-5.4",
                name: "gpt-5.4",
                isCustom: false,
                capabilities: { optionDescriptors: [reasoningDescriptor] },
              },
            ],
          },
          providerSnapshot({
            instanceId: ProviderInstanceId.make("claudeAgent"),
            driver: ProviderDriverKind.make("claudeAgent"),
            model: "claude-sonnet-4-6",
          }),
          providerSnapshot({
            instanceId: ProviderInstanceId.make("pi"),
            driver: ProviderDriverKind.make("pi"),
            model: "pi-model",
          }),
          providerSnapshot({
            instanceId: ProviderInstanceId.make("acpRegistry"),
            driver: ProviderDriverKind.make("acpRegistry"),
            model: "acp-model",
          }),
          // Antigravity has a live orchestration adapter through the provider
          // instance registry even though no adapter driver entry exists in
          // the static built-in list.
          providerSnapshot({
            instanceId: antigravityInstanceId,
            driver: ProviderDriverKind.make("antigravity"),
            model: "ant-model",
          }),
          // A second Antigravity instance whose adapter resolves but whose
          // provider state still blocks delegation.
          providerSnapshot({
            instanceId: disabledAntigravityInstanceId,
            driver: ProviderDriverKind.make("antigravity"),
            model: "ant-model",
            enabled: false,
          }),
          forkShadow,
        ];
        const layerDependencies = Layer.mergeAll(
          NodeServices.layer,
          Layer.mock(ThreadManagementService.ThreadManagementService)({
            getThreadRecords: () => Effect.succeed(parentProjection([])),
          }),
          ServerSettings.layerTest(),
          Layer.mock(ProviderRegistry.ProviderRegistry)({
            getProviders: Effect.sync(() => providers),
          }),
          adapterRegistryLayer([
            codexInstanceId,
            ProviderInstanceId.make("claudeAgent"),
            ProviderInstanceId.make("pi"),
            ProviderInstanceId.make("acpRegistry"),
            antigravityInstanceId,
            disabledAntigravityInstanceId,
          ]),
          noProjects,
          Layer.mock(TaskBoardService.TaskBoardService)({}),
          Layer.mock(SecretRequests.SecretRequests)({}),
          Layer.mock(ScheduledTaskService.ScheduledTaskService)({}),
        );

        yield* Effect.gen(function* () {
          const service = yield* OrchestratorMcpService.OrchestratorMcpService;
          const capabilities = yield* service.capabilities(scope);
          const byId = new Map(
            capabilities.providers.map((provider) => [provider.providerInstanceId, provider]),
          );

          // The overview drops per-model option descriptors; narrowing to one provider restores them.
          assert.isTrue(capabilities.modelOptionsOmitted);
          assert.isFalse(
            capabilities.providers.some((provider) =>
              provider.models.some((model) => "options" in model),
            ),
          );
          const codexOnly = yield* service.capabilities(scope, {
            providerInstanceId: codexInstanceId,
          });
          assert.deepEqual(
            codexOnly.providers.map((provider) => provider.providerInstanceId),
            [codexInstanceId],
          );
          assert.deepEqual(codexOnly.providers[0]?.models[0]?.options, [reasoningDescriptor]);
          assert.isUndefined(codexOnly.modelOptionsOmitted);
          for (const provider of providers) {
            assert.deepEqual(
              byId.get(provider.instanceId)?.models.map((model) => model.id),
              provider.models.map((model) => model.slug),
            );
          }

          providers = providers.map((provider) => ({
            ...provider,
            models: [
              ...provider.models,
              {
                slug: `${provider.driver}/custom-model-after-refresh`,
                name: "Custom model",
                isCustom: true,
                capabilities: null,
              },
            ],
          }));
          const refreshed = yield* service.capabilities(scope);
          for (const provider of providers) {
            assert.deepEqual(
              refreshed.providers
                .find((entry) => entry.providerInstanceId === provider.instanceId)
                ?.models.map((model) => model.id),
              provider.models.map((model) => model.slug),
            );
          }

          // A long catalog is cut to a sample plus the total; narrowing returns every model.
          providers = providers.map((provider) =>
            provider.instanceId === codexInstanceId
              ? {
                  ...provider,
                  models: Array.from({ length: 12 }, (_, index) => ({
                    slug: `bulk-${index}`,
                    name: `Bulk ${index}`,
                    isCustom: true,
                    capabilities: null,
                  })),
                }
              : provider,
          );
          const cutOverview = yield* service.capabilities(scope);
          const cutCodex = cutOverview.providers.find(
            (entry) => entry.providerInstanceId === codexInstanceId,
          );
          assert.strictEqual(cutCodex?.models.length, 8);
          assert.strictEqual(cutCodex?.modelCount, 12);
          assert.isUndefined(
            cutOverview.providers.find((entry) => entry.providerInstanceId !== codexInstanceId)
              ?.modelCount,
          );
          const fullCodex = yield* service.capabilities(scope, {
            providerInstanceId: codexInstanceId,
          });
          assert.strictEqual(fullCodex.providers[0]?.models.length, 12);
          assert.isUndefined(fullCodex.providers[0]?.modelCount);

          for (const instanceId of [
            codexInstanceId,
            ProviderInstanceId.make("claudeAgent"),
            ProviderInstanceId.make("pi"),
            ProviderInstanceId.make("acpRegistry"),
            antigravityInstanceId,
          ]) {
            const entry = byId.get(instanceId);
            assert.isDefined(entry);
            assert.isTrue(
              entry!.canRunChildTask,
              `expected ${instanceId} to advertise canRunChildTask`,
            );
            assert.isTrue(entry!.canRunCrossProviderChildTask);
            assert.deepEqual(entry!.constraints, []);
          }

          const disabled = byId.get(disabledAntigravityInstanceId);
          assert.isDefined(disabled);
          assert.isFalse(disabled!.canRunChildTask);
          assert.deepEqual(disabled!.constraints, ["Provider instance is disabled."]);

          const fork = byId.get(forkOnlyInstanceId);
          assert.isDefined(fork);
          assert.isFalse(fork!.canRunChildTask);
          assert.isTrue(
            fork!.constraints.includes("No V2 provider adapter is registered."),
            `expected missing-adapter constraint, got ${fork!.constraints.join(" | ")}`,
          );
          assert.isTrue(
            fork!.constraints.includes("Driver 'forkOnly' is not registered in this build."),
          );
        }).pipe(Effect.provide(serviceLayerUnderTest.pipe(Layer.provide(layerDependencies))));
      }),
  );

  it.effect("leaves models the user hid out of the capability catalog", () =>
    Effect.gen(function* () {
      const codex = providerSnapshot({
        instanceId: codexInstanceId,
        driver: ProviderDriverKind.make("codex"),
        model: "gpt-5.4",
      });
      const layerDependencies = Layer.mergeAll(
        NodeServices.layer,
        Layer.mock(TaskBoardService.TaskBoardService)({}),
        Layer.mock(ThreadManagementService.ThreadManagementService)({
          getThreadRecords: () => Effect.succeed(parentProjection([])),
        }),
        ServerSettings.layerTest({
          providerModelPreferences: {
            [codexInstanceId]: { hiddenModels: ["gpt-5.4-mini", "my-model"], modelOrder: [] },
          },
        }),
        providerRegistryLayer([
          {
            ...codex,
            models: [
              ...codex.models,
              { slug: "gpt-5.4-mini", name: "Mini", isCustom: false, capabilities: null },
              // Custom models cannot be hidden, matching the client pickers.
              { slug: "my-model", name: "Mine", isCustom: true, capabilities: null },
            ],
          },
        ]),
        adapterRegistryLayer([codexInstanceId]),
        noProjects,
        Layer.mock(TaskBoardService.TaskBoardService)({}),
        Layer.mock(SecretRequests.SecretRequests)({}),
        Layer.mock(ScheduledTaskService.ScheduledTaskService)({}),
      );

      yield* Effect.gen(function* () {
        const service = yield* OrchestratorMcpService.OrchestratorMcpService;
        const capabilities = yield* service.capabilities(scope);
        assert.deepEqual(
          capabilities.providers[0]?.models.map((model) => model.id),
          ["gpt-5.4", "my-model"],
        );
      }).pipe(Effect.provide(serviceLayerUnderTest.pipe(Layer.provide(layerDependencies))));
    }),
  );

  it.effect(
    "delegates to an Antigravity instance whose adapter resolves through the registry",
    () =>
      Effect.gen(function* () {
        let delegated = false;
        const task = {
          id: taskId,
          threadId: parentThreadId,
          runId: parentRunId,
          parentNodeId,
          origin: "app_owned",
          createdBy: "agent",
          driver: ProviderDriverKind.make("antigravity"),
          providerInstanceId: antigravityInstanceId,
          providerThreadId: null,
          childThreadId,
          nativeTaskRef: null,
          prompt: "Summarize the diff.",
          title: null,
          model: "ant-model",
          status: "running",
          result: null,
          startedAt: null,
          completedAt: null,
        };
        const dispatched = yield* Ref.make<ReadonlyArray<unknown>>([]);
        const layerDependencies = Layer.mergeAll(
          NodeServices.layer,
          Layer.mock(ThreadManagementService.ThreadManagementService)({
            getThreadRecords: (threadId) =>
              Effect.succeed(
                threadId === parentThreadId
                  ? parentProjection(delegated ? [task] : [])
                  : childProjection,
              ),
            dispatch: (command) =>
              Ref.update(dispatched, (commands) => [...commands, command]).pipe(
                Effect.andThen(
                  Effect.sync(() => {
                    delegated = true;
                  }),
                ),
                Effect.as({
                  sequence: 1,
                  storedEvents: [
                    {
                      sequence: 1,
                      commandId: null,
                      event: { type: "subagent.updated", payload: task },
                    },
                  ],
                } as never),
              ),
          }),
          ServerSettings.layerTest(),
          Layer.mock(ProviderRegistry.ProviderRegistry)({
            getProviders: Effect.succeed([
              providerSnapshot({
                instanceId: codexInstanceId,
                driver: ProviderDriverKind.make("codex"),
                model: "gpt-5.4",
              }),
              providerSnapshot({
                instanceId: antigravityInstanceId,
                driver: ProviderDriverKind.make("antigravity"),
                model: "ant-model",
              }),
            ]),
          }),
          adapterRegistryLayer([codexInstanceId, antigravityInstanceId]),
          noProjects,
          Layer.mock(TaskBoardService.TaskBoardService)({}),
          Layer.mock(SecretRequests.SecretRequests)({}),
          Layer.mock(ScheduledTaskService.ScheduledTaskService)({}),
        );

        yield* Effect.gen(function* () {
          const service = yield* OrchestratorMcpService.OrchestratorMcpService;
          const result = yield* service.delegateTask(scope, {
            task: "Summarize the diff.",
            target: { providerInstanceId: antigravityInstanceId, model: "ant-model" },
            mode: "async",
            clientRequestId: "delegate-antigravity-1",
          });
          assert.equal(result.status, "running");
          assert.equal(result.providerInstanceId, antigravityInstanceId);
          const commands = yield* Ref.get(dispatched);
          assert.equal(commands.length, 1);
          const request = commands[0] as {
            type: string;
            modelSelection: { instanceId: string; model: string };
          };
          assert.equal(request.type, "delegated_task.request");
          assert.equal(request.modelSelection.instanceId, antigravityInstanceId);
          assert.equal(request.modelSelection.model, "ant-model");
        }).pipe(Effect.provide(serviceLayerUnderTest.pipe(Layer.provide(layerDependencies))));
      }),
  );

  it.effect(
    "passes workspaceStrategy and returns worktreePath and branch on speculative branching delegation",
    () =>
      Effect.gen(function* () {
        const dispatched = yield* Ref.make<ReadonlyArray<unknown>>([]);
        const task = {
          id: taskId,
          threadId: parentThreadId,
          runId: parentRunId,
          parentNodeId,
          origin: "app_owned",
          createdBy: "agent",
          driver: ProviderDriverKind.make("codex"),
          providerInstanceId: codexInstanceId,
          providerThreadId: null,
          childThreadId,
          nativeTaskRef: null,
          prompt: "Run speculative branch",
          title: null,
          model: "gpt-5.4",
          status: "running",
          result: null,
          startedAt: null,
          completedAt: null,
          workspaceStrategy: {
            type: "worktree",
            baseRef: "feature/base",
            branch: "feature/speculative-1",
          },
          worktreePath: "/isolated/worktree/spec-1",
          branch: "feature/speculative-1",
        };
        let delegated = false;
        const layerDependencies = Layer.mergeAll(
          NodeServices.layer,
          Layer.mock(ThreadManagementService.ThreadManagementService)({
            getThreadRecords: (threadId) =>
              Effect.succeed(
                threadId === parentThreadId
                  ? parentProjection(delegated ? [task] : [])
                  : childProjection,
              ),
            dispatch: (command) =>
              Ref.update(dispatched, (commands) => [...commands, command]).pipe(
                Effect.andThen(
                  Effect.sync(() => {
                    delegated = true;
                  }),
                ),
                Effect.as({
                  sequence: 1,
                  storedEvents: [
                    {
                      sequence: 1,
                      commandId: null,
                      event: { type: "subagent.updated", payload: task },
                    },
                  ],
                } as never),
              ),
          }),
          Layer.mock(ProviderRegistry.ProviderRegistry)({
            getProviders: Effect.succeed([
              providerSnapshot({
                instanceId: codexInstanceId,
                driver: ProviderDriverKind.make("codex"),
                model: "gpt-5.4",
              }),
            ]),
          }),
          adapterRegistryLayer([codexInstanceId]),
          noProjects,
          Layer.mock(TaskBoardService.TaskBoardService)({}),
          ServerSettings.layerTest(),
          Layer.mock(SecretRequests.SecretRequests)({}),
          Layer.mock(ScheduledTaskService.ScheduledTaskService)({}),
        );

        yield* Effect.gen(function* () {
          const service = yield* OrchestratorMcpService.OrchestratorMcpService;
          const result = yield* service.delegateTask(scope, {
            task: "Run speculative branch",
            workspaceStrategy: {
              type: "worktree",
              baseRef: "feature/base",
              branch: "feature/speculative-1",
            },
            mode: "async",
            clientRequestId: "delegate-speculative-1",
          });
          assert.equal(result.status, "running");
          assert.equal(result.worktreePath, "/isolated/worktree/spec-1");
          assert.equal(result.branch, "feature/speculative-1");
          const commands = yield* Ref.get(dispatched);
          assert.equal(commands.length, 1);
          const request = commands[0] as {
            type: string;
            workspaceStrategy?: { type: string; baseRef: string; branch: string };
            branch?: string;
          };
          assert.equal(request.type, "delegated_task.request");
          assert.equal(request.workspaceStrategy?.type, "worktree");
          assert.equal(request.branch, "feature/speculative-1");
        }).pipe(Effect.provide(serviceLayerUnderTest.pipe(Layer.provide(layerDependencies))));
      }),
  );

  it.effect("resolves a driverKind target to a capable Antigravity instance", () =>
    Effect.gen(function* () {
      const dispatched = yield* Ref.make<ReadonlyArray<unknown>>([]);
      const task = {
        id: taskId,
        threadId: parentThreadId,
        runId: parentRunId,
        parentNodeId,
        origin: "app_owned",
        createdBy: "agent",
        driver: ProviderDriverKind.make("antigravity"),
        providerInstanceId: antigravityInstanceId,
        providerThreadId: null,
        childThreadId,
        nativeTaskRef: null,
        prompt: "Summarize the diff.",
        title: null,
        model: "ant-model",
        status: "running",
        result: null,
        startedAt: null,
        completedAt: null,
      };
      let delegated = false;
      const layerDependencies = Layer.mergeAll(
        NodeServices.layer,
        Layer.mock(ThreadManagementService.ThreadManagementService)({
          getThreadRecords: (threadId) =>
            Effect.succeed(
              threadId === parentThreadId
                ? parentProjection(delegated ? [task] : [])
                : childProjection,
            ),
          dispatch: (command) =>
            Ref.update(dispatched, (commands) => [...commands, command]).pipe(
              Effect.andThen(
                Effect.sync(() => {
                  delegated = true;
                }),
              ),
              Effect.as({
                sequence: 1,
                storedEvents: [
                  {
                    sequence: 1,
                    commandId: null,
                    event: { type: "subagent.updated", payload: task },
                  },
                ],
              } as never),
            ),
        }),
        ServerSettings.layerTest(),
        Layer.mock(ProviderRegistry.ProviderRegistry)({
          getProviders: Effect.succeed([
            providerSnapshot({
              instanceId: codexInstanceId,
              driver: ProviderDriverKind.make("codex"),
              model: "gpt-5.4",
            }),
            providerSnapshot({
              instanceId: antigravityInstanceId,
              driver: ProviderDriverKind.make("antigravity"),
              model: "ant-model",
            }),
          ]),
        }),
        adapterRegistryLayer([codexInstanceId, antigravityInstanceId]),
        noProjects,
        Layer.mock(TaskBoardService.TaskBoardService)({}),
        Layer.mock(SecretRequests.SecretRequests)({}),
        Layer.mock(ScheduledTaskService.ScheduledTaskService)({}),
      );

      yield* Effect.gen(function* () {
        const service = yield* OrchestratorMcpService.OrchestratorMcpService;
        const result = yield* service.delegateTask(scope, {
          task: "Summarize the diff.",
          target: { driverKind: ProviderDriverKind.make("antigravity") },
          mode: "async",
          clientRequestId: "delegate-antigravity-driver-1",
        });
        assert.equal(result.status, "running");
        const commands = yield* Ref.get(dispatched);
        assert.equal(commands.length, 1);
        const request = commands[0] as {
          modelSelection: { instanceId: string; model: string };
        };
        assert.equal(request.modelSelection.instanceId, antigravityInstanceId);
        assert.equal(request.modelSelection.model, "ant-model");
      }).pipe(Effect.provide(serviceLayerUnderTest.pipe(Layer.provide(layerDependencies))));
    }),
  );

  it.effect("routes implicit background delegation to a healthy same-model account", () =>
    Effect.gen(function* () {
      const codexTeamInstanceId = ProviderInstanceId.make("codex-team");
      const sameLoginInstanceId = ProviderInstanceId.make("codex-same-login");
      const sameCredentialInstanceId = ProviderInstanceId.make("codex-same-credential");
      const limitedInstanceId = ProviderInstanceId.make("codex-limited");
      const task = {
        id: taskId,
        threadId: parentThreadId,
        runId: parentRunId,
        parentNodeId,
        origin: "app_owned",
        createdBy: "agent",
        driver: ProviderDriverKind.make("codex"),
        providerInstanceId: codexTeamInstanceId,
        providerThreadId: null,
        childThreadId,
        nativeTaskRef: null,
        prompt: "Review the changes.",
        title: null,
        model: "gpt-5.4",
        status: "running",
        result: null,
        startedAt: null,
        completedAt: null,
      };
      const dispatched = yield* Ref.make<ReadonlyArray<unknown>>([]);
      let delegated = false;
      const layerDependencies = Layer.mergeAll(
        NodeServices.layer,
        Layer.mock(ThreadManagementService.ThreadManagementService)({
          getThreadRecords: (threadId) =>
            Effect.succeed(
              threadId === parentThreadId
                ? parentProjection(delegated ? [task] : [])
                : childProjection,
            ),
          dispatch: (command) =>
            Ref.update(dispatched, (commands) => [...commands, command]).pipe(
              Effect.andThen(
                Effect.sync(() => {
                  delegated = true;
                }),
              ),
              Effect.as({
                sequence: 1,
                storedEvents: [
                  {
                    sequence: 1,
                    commandId: null,
                    event: { type: "subagent.updated", payload: task },
                  },
                ],
              } as never),
            ),
        }),
        ServerSettings.layerTest(),
        providerRegistryLayer([
          providerSnapshot({
            instanceId: codexInstanceId,
            driver: ProviderDriverKind.make("codex"),
            model: "gpt-5.4",
            email: "jake@example.com",
            credentialFingerprint: "credential-jake",
            usagePercent: 95,
          }),
          providerSnapshot({
            instanceId: codexTeamInstanceId,
            driver: ProviderDriverKind.make("codex"),
            model: "gpt-5.4",
            email: "team@example.com",
            usagePercent: 35,
          }),
          providerSnapshot({
            instanceId: sameLoginInstanceId,
            driver: ProviderDriverKind.make("codex"),
            model: "gpt-5.4",
            email: "JAKE@example.com",
            usagePercent: 5,
          }),
          providerSnapshot({
            instanceId: sameCredentialInstanceId,
            driver: ProviderDriverKind.make("codex"),
            model: "gpt-5.4",
            email: "second@example.com",
            credentialFingerprint: "CREDENTIAL-JAKE",
            usagePercent: 2,
          }),
          providerSnapshot({
            instanceId: limitedInstanceId,
            driver: ProviderDriverKind.make("codex"),
            model: "gpt-5.4",
            email: "limited@example.com",
            usagePercent: 5,
            message: "Rate limit reached until the account resets.",
          }),
        ]),
        adapterRegistryLayer([
          codexInstanceId,
          codexTeamInstanceId,
          sameLoginInstanceId,
          sameCredentialInstanceId,
          limitedInstanceId,
        ]),
        noProjects,
        Layer.mock(TaskBoardService.TaskBoardService)({}),
        Layer.mock(SecretRequests.SecretRequests)({}),
        Layer.mock(ScheduledTaskService.ScheduledTaskService)({}),
      );

      yield* Effect.gen(function* () {
        const service = yield* OrchestratorMcpService.OrchestratorMcpService;
        const result = yield* service.delegateTask(scope, {
          task: "Review the changes.",
          mode: "async",
          clientRequestId: "delegate-quota-pool-1",
        });

        assert.equal(result.status, "running");
        assert.equal(result.providerInstanceId, codexTeamInstanceId);
        const commands = yield* Ref.get(dispatched);
        const request = commands[0] as {
          readonly modelSelection: { readonly instanceId: string; readonly model: string };
        };
        assert.equal(commands.length, 1);
        assert.equal(request.modelSelection.instanceId, codexTeamInstanceId);
        assert.equal(request.modelSelection.model, "gpt-5.4");
      }).pipe(Effect.provide(serviceLayerUnderTest.pipe(Layer.provide(layerDependencies))));
    }),
  );

  it.effect(
    "steps an inherited runtime mode down to the mode the routed background account offers",
    () =>
      Effect.gen(function* () {
        const codexAltInstanceId = ProviderInstanceId.make("codex-alt-modes");
        const task = {
          id: taskId,
          threadId: parentThreadId,
          runId: parentRunId,
          parentNodeId,
          origin: "app_owned",
          createdBy: "agent",
          driver: ProviderDriverKind.make("codex"),
          providerInstanceId: codexAltInstanceId,
          providerThreadId: null,
          childThreadId,
          nativeTaskRef: null,
          prompt: "Review the changes.",
          title: null,
          model: "gpt-5.4",
          status: "running",
          result: null,
          startedAt: null,
          completedAt: null,
        };
        const dispatched = yield* Ref.make<ReadonlyArray<unknown>>([]);
        let delegated = false;
        const layerDependencies = Layer.mergeAll(
          NodeServices.layer,
          Layer.mock(ThreadManagementService.ThreadManagementService)({
            getThreadRecords: (threadId) =>
              Effect.succeed(
                threadId === parentThreadId
                  ? parentProjection(delegated ? [task] : [])
                  : childProjection,
              ),
            dispatch: (command) =>
              Ref.update(dispatched, (commands) => [...commands, command]).pipe(
                Effect.andThen(
                  Effect.sync(() => {
                    delegated = true;
                  }),
                ),
                Effect.as({
                  sequence: 1,
                  storedEvents: [
                    {
                      sequence: 1,
                      commandId: null,
                      event: { type: "subagent.updated", payload: task },
                    },
                  ],
                } as never),
              ),
          }),
          ServerSettings.layerTest(),
          Layer.mock(TaskBoardService.TaskBoardService)({}),
          providerRegistryLayer([
            providerSnapshot({
              instanceId: codexInstanceId,
              driver: ProviderDriverKind.make("codex"),
              model: "gpt-5.4",
              email: "jake@example.com",
              usagePercent: 95,
            }),
            // The routed account offers only Supervised, so the parent's
            // inherited full-access steps down instead of being handed a mode
            // the provider would silently run as approval-required.
            providerSnapshot({
              instanceId: codexAltInstanceId,
              driver: ProviderDriverKind.make("codex"),
              model: "gpt-5.4",
              email: "alt@example.com",
              usagePercent: 5,
              runtimeModes: ["approval-required"],
            }),
          ]),
          adapterRegistryLayer([codexInstanceId, codexAltInstanceId]),
          noProjects,
          Layer.mock(SecretRequests.SecretRequests)({}),
          Layer.mock(ScheduledTaskService.ScheduledTaskService)({}),
        );

        yield* Effect.gen(function* () {
          const service = yield* OrchestratorMcpService.OrchestratorMcpService;
          const result = yield* service.delegateTask(scope, {
            task: "Review the changes.",
            mode: "async",
            clientRequestId: "delegate-quota-pool-modes-1",
          });

          assert.equal(result.status, "running");
          const commands = yield* Ref.get(dispatched);
          assert.equal(commands.length, 1);
          const request = commands[0] as {
            readonly modelSelection: { readonly instanceId: string };
            readonly runtimeMode: string;
          };
          // Quota routing moved the delegation to the alternate account, and
          // the mode was then resolved against that account rather than the
          // parent's provider.
          assert.equal(request.modelSelection.instanceId, codexAltInstanceId);
          assert.equal(request.runtimeMode, "approval-required");
        }).pipe(Effect.provide(serviceLayerUnderTest.pipe(Layer.provide(layerDependencies))));
      }),
  );

  it.effect(
    "refuses a quota-exhausted background task when no distinct usable account exists",
    () =>
      Effect.gen(function* () {
        const duplicateLoginInstanceId = ProviderInstanceId.make("codex-duplicate-login");
        const dispatched = yield* Ref.make<ReadonlyArray<unknown>>([]);
        const layerDependencies = Layer.mergeAll(
          NodeServices.layer,
          Layer.mock(ThreadManagementService.ThreadManagementService)({
            getThreadRecords: () => Effect.succeed(parentProjection([])),
            dispatch: (command) =>
              Ref.update(dispatched, (commands) => [...commands, command]).pipe(
                Effect.as({ sequence: 1, storedEvents: [] } as never),
              ),
          }),
          ServerSettings.layerTest(),
          providerRegistryLayer([
            providerSnapshot({
              instanceId: codexInstanceId,
              driver: ProviderDriverKind.make("codex"),
              model: "gpt-5.4",
              email: "jake@example.com",
              usagePercent: 100,
            }),
            providerSnapshot({
              instanceId: duplicateLoginInstanceId,
              driver: ProviderDriverKind.make("codex"),
              model: "gpt-5.4",
              email: "jake@example.com",
              usagePercent: 10,
            }),
          ]),
          adapterRegistryLayer([codexInstanceId, duplicateLoginInstanceId]),
          noProjects,
          Layer.mock(TaskBoardService.TaskBoardService)({}),
          Layer.mock(SecretRequests.SecretRequests)({}),
          Layer.mock(ScheduledTaskService.ScheduledTaskService)({}),
        );

        yield* Effect.gen(function* () {
          const service = yield* OrchestratorMcpService.OrchestratorMcpService;
          const error = yield* service
            .delegateTask(scope, {
              task: "Review the changes.",
              mode: "async",
              clientRequestId: "delegate-quota-exhausted-1",
            })
            .pipe(Effect.flip);

          assert.equal(error.code, "provider_unavailable");
          assert.equal((yield* Ref.get(dispatched)).length, 0);
        }).pipe(Effect.provide(serviceLayerUnderTest.pipe(Layer.provide(layerDependencies))));
      }),
  );

  it.effect(
    "refuses an explicit spawn on an account past the quota guard and names one with room",
    () =>
      Effect.gen(function* () {
        const claudeInstanceId = ProviderInstanceId.make("claudeAgent");
        const dispatched = yield* Ref.make<ReadonlyArray<unknown>>([]);
        const layerDependencies = Layer.mergeAll(
          NodeServices.layer,
          Layer.mock(ThreadManagementService.ThreadManagementService)({
            getThreadRecords: () => Effect.succeed(parentProjection([])),
            dispatch: (command) =>
              Ref.update(dispatched, (commands) => [...commands, command]).pipe(
                Effect.as({ sequence: 1, storedEvents: [] } as never),
              ),
          }),
          ServerSettings.layerTest(),
          providerRegistryLayer([
            providerSnapshot({
              instanceId: codexInstanceId,
              driver: ProviderDriverKind.make("codex"),
              model: "gpt-5.4",
              usagePercent: 98,
            }),
            providerSnapshot({
              instanceId: claudeInstanceId,
              driver: ProviderDriverKind.make("claudeAgent"),
              model: "claude-sonnet-4-6",
              usagePercent: 20,
            }),
          ]),
          adapterRegistryLayer([codexInstanceId, claudeInstanceId]),
          noProjects,
          Layer.mock(TaskBoardService.TaskBoardService)({}),
          Layer.mock(SecretRequests.SecretRequests)({}),
          Layer.mock(ScheduledTaskService.ScheduledTaskService)({}),
        );

        yield* Effect.gen(function* () {
          const service = yield* OrchestratorMcpService.OrchestratorMcpService;
          const error = yield* service
            .delegateTask(scope, {
              task: "Port the parser.",
              mode: "async",
              target: { providerInstanceId: codexInstanceId, model: "gpt-5.4" },
              clientRequestId: "delegate-quota-guard-1",
            })
            .pipe(Effect.flip);

          assert.equal(error.code, "provider_unavailable");
          assert.include(error.message, "98% of its Weekly limit");
          assert.include(error.message, "claudeAgent, highest window 20%");
          assert.equal((yield* Ref.get(dispatched)).length, 0);
        }).pipe(Effect.provide(serviceLayerUnderTest.pipe(Layer.provide(layerDependencies))));
      }),
  );

  it.effect("asks the user before a plain delegate_task starts on a confirm-tier model", () =>
    Effect.gen(function* () {
      const dispatched = yield* Ref.make<ReadonlyArray<unknown>>([]);
      const requested: Array<{ readonly subagent: string; readonly model: string }> = [];
      const layerDependencies = Layer.mergeAll(
        NodeServices.layer,
        Layer.mock(ThreadManagementService.ThreadManagementService)({
          getThreadRecords: () => Effect.succeed(parentProjection([])),
          dispatch: (command) =>
            Ref.update(dispatched, (commands) => [...commands, command]).pipe(
              Effect.as({ sequence: 1, storedEvents: [] } as never),
            ),
        }),
        ServerSettings.layerTest(),
        providerRegistryLayer([
          providerSnapshot({
            instanceId: codexInstanceId,
            driver: ProviderDriverKind.make("codex"),
            model: "gpt-5.4",
            usagePercent: 10,
          }),
        ]),
        adapterRegistryLayer([codexInstanceId]),
        noProjects,
        Layer.mock(TaskBoardService.TaskBoardService)({}),
        Layer.mock(SecretRequests.SecretRequests)({}),
        Layer.mock(ScheduledTaskService.ScheduledTaskService)({}),
      );

      yield* Effect.gen(function* () {
        const service = yield* OrchestratorMcpService.OrchestratorMcpService;
        const error = yield* service
          .delegateTask(scope, {
            task: "Port the parser.",
            mode: "async",
            clientRequestId: "delegate-confirm-tier-1",
          })
          .pipe(Effect.flip);

        assert.equal(error.code, "capability_denied");
        assert.deepEqual(requested, [{ subagent: "delegated task", model: "gpt-5.4" }]);
        assert.equal((yield* Ref.get(dispatched)).length, 0);
      }).pipe(
        Effect.provide(
          Layer.merge(
            OrchestratorMcpService.layer,
            Layer.succeed(SpawnApprovals, spawnApprovalsAnswering("deny", requested)),
          ).pipe(Layer.provide(layerDependencies)),
        ),
      );
    }),
  );

  it.effect("rejects delegation to a provider without a registered adapter", () =>
    Effect.gen(function* () {
      const forkOnlyInstanceId = ProviderInstanceId.make("forkOnly");
      const forkShadow = yield* buildUnavailableProviderSnapshot({
        driverKind: "forkOnly",
        instanceId: forkOnlyInstanceId,
        reason: "Driver 'forkOnly' is not registered in this build.",
        checkedAt: "2026-09-13T00:00:00.000Z",
      });
      const layerDependencies = Layer.mergeAll(
        NodeServices.layer,
        Layer.mock(ThreadManagementService.ThreadManagementService)({
          getThreadRecords: () => Effect.succeed(parentProjection([])),
        }),
        ServerSettings.layerTest(),
        providerRegistryLayer([
          providerSnapshot({
            instanceId: codexInstanceId,
            driver: ProviderDriverKind.make("codex"),
            model: "gpt-5.4",
          }),
          forkShadow,
        ]),
        adapterRegistryLayer([codexInstanceId]),
        noProjects,
        Layer.mock(TaskBoardService.TaskBoardService)({}),
        Layer.mock(SecretRequests.SecretRequests)({}),
        Layer.mock(ScheduledTaskService.ScheduledTaskService)({}),
      );

      yield* Effect.gen(function* () {
        const service = yield* OrchestratorMcpService.OrchestratorMcpService;
        const byInstance = yield* service
          .delegateTask(scope, {
            task: "Summarize the diff.",
            target: { providerInstanceId: forkOnlyInstanceId },
            mode: "async",
            clientRequestId: "delegate-fork-1",
          })
          .pipe(Effect.flip);
        assert.equal(byInstance.code, "provider_unavailable");
        assert.isTrue(byInstance.message.includes("No V2 provider adapter is registered."));

        const byDriver = yield* service
          .delegateTask(scope, {
            task: "Summarize the diff.",
            target: { driverKind: ProviderDriverKind.make("forkOnly") },
            mode: "async",
            clientRequestId: "delegate-fork-2",
          })
          .pipe(Effect.flip);
        assert.equal(byDriver.code, "provider_unavailable");
        assert.isTrue(
          byDriver.message.includes("No V2 provider adapter is registered for driver forkOnly."),
        );
      }).pipe(Effect.provide(serviceLayerUnderTest.pipe(Layer.provide(layerDependencies))));
    }),
  );

  it.effect("re-probes an unavailable target once before refusing it", () =>
    Effect.gen(function* () {
      const claudeInstanceId = ProviderInstanceId.make("claudeAgent");
      const claudeDriver = ProviderDriverKind.make("claudeAgent");
      const task = {
        id: taskId,
        threadId: parentThreadId,
        runId: parentRunId,
        parentNodeId,
        origin: "app_owned",
        createdBy: "agent",
        driver: claudeDriver,
        providerInstanceId: claudeInstanceId,
        providerThreadId: null,
        childThreadId,
        nativeTaskRef: null,
        prompt: "Review the diff.",
        title: null,
        model: "claude-opus-5-5",
        status: "running",
        result: null,
        startedAt: null,
        completedAt: null,
      };
      const healthy = providerSnapshot({
        instanceId: claudeInstanceId,
        driver: claudeDriver,
        model: "claude-opus-5-5",
      });
      const missingCli: ServerProvider = {
        ...healthy,
        installed: false,
        status: "error",
        message:
          "Claude is not installed yet.\nDetails: Claude Agent CLI (`claude`) was not found on PATH.",
      };
      const codex = providerSnapshot({
        instanceId: codexInstanceId,
        driver: ProviderDriverKind.make("codex"),
        model: "gpt-5.4",
      });
      // The cache still says the CLI is missing; a probe reports `cliInstalled`.
      let cliInstalled = false;
      const probes = yield* Ref.make(0);
      const dispatched = yield* Ref.make(0);
      const layerDependencies = Layer.mergeAll(
        NodeServices.layer,
        Layer.mock(ThreadManagementService.ThreadManagementService)({
          getThreadRecords: (threadId) =>
            Effect.succeed(
              threadId === parentThreadId ? parentProjection([task]) : childProjection,
            ),
          dispatch: () =>
            Ref.update(dispatched, (count) => count + 1).pipe(
              Effect.as({
                sequence: 1,
                storedEvents: [
                  {
                    sequence: 1,
                    commandId: null,
                    event: { type: "subagent.updated", payload: task },
                  },
                ],
              } as never),
            ),
        }),
        ServerSettings.layerTest(),
        Layer.mock(ProviderRegistry.ProviderRegistry)({
          getProviders: Effect.succeed([codex, missingCli]),
          refreshInstance: () =>
            Ref.update(probes, (count) => count + 1).pipe(
              Effect.as([codex, cliInstalled ? healthy : missingCli]),
            ),
        }),
        adapterRegistryLayer([codexInstanceId, claudeInstanceId]),
        Layer.mock(ScheduledTaskService.ScheduledTaskService)({}),
        noProjects,
        Layer.mock(TaskBoardService.TaskBoardService)({}),
        Layer.mock(SecretRequests.SecretRequests)({}),
      );

      yield* Effect.gen(function* () {
        const service = yield* OrchestratorMcpService.OrchestratorMcpService;
        const delegate = (clientRequestId: string) =>
          service.delegateTask(scope, {
            task: "Review the diff.",
            target: { providerInstanceId: claudeInstanceId, model: "claude-opus-5-5" },
            mode: "async",
            clientRequestId,
          });

        const error = yield* delegate("delegate-recheck-1").pipe(Effect.flip);
        assert.equal(error.code, "provider_unavailable");
        assert.equal(yield* Ref.get(probes), 1);
        assert.equal(yield* Ref.get(dispatched), 0);

        cliInstalled = true;
        const result = yield* delegate("delegate-recheck-2");
        assert.equal(result.providerInstanceId, claudeInstanceId);
        assert.equal(yield* Ref.get(probes), 2);
        assert.equal(yield* Ref.get(dispatched), 1);
      }).pipe(Effect.provide(serviceLayerUnderTest.pipe(Layer.provide(layerDependencies))));
    }),
  );

  it.effect(
    "inherits an available parent instance for driver-only targets and otherwise selects a healthy peer",
    () =>
      Effect.gen(function* () {
        const codexAltInstanceId = ProviderInstanceId.make("codex-alt");
        const driver = ProviderDriverKind.make("codex");
        const claudeDriver = ProviderDriverKind.make("claudeAgent");
        const parentModelSelection = {
          instanceId: codexInstanceId,
          model: "gpt-5.4",
          options: [{ id: "reasoningEffort", value: "high" }],
        } as const;
        const task = {
          id: taskId,
          threadId: parentThreadId,
          runId: parentRunId,
          parentNodeId,
          origin: "app_owned",
          createdBy: "agent",
          driver,
          providerInstanceId: codexInstanceId,
          providerThreadId: null,
          childThreadId,
          nativeTaskRef: null,
          prompt: "Summarize the diff.",
          title: null,
          model: "gpt-5.4",
          status: "running",
          result: null,
          startedAt: null,
          completedAt: null,
        };
        const cases = [
          {
            name: "healthy-inherited",
            inheritedEnabled: true,
            peerEnabled: true,
            explicit: false,
            selectedInstanceId: codexInstanceId,
            candidateDriver: driver,
          },
          {
            name: "unavailable-inherited-falls-back-to-healthy-peer",
            inheritedEnabled: false,
            peerEnabled: true,
            explicit: false,
            selectedInstanceId: codexAltInstanceId,
            candidateDriver: driver,
          },
          {
            name: "no-available-peer",
            inheritedEnabled: false,
            peerEnabled: false,
            explicit: false,
            selectedInstanceId: null,
            candidateDriver: driver,
          },
          {
            name: "cross-driver-no-available-candidate",
            inheritedEnabled: false,
            peerEnabled: false,
            explicit: false,
            selectedInstanceId: null,
            candidateDriver: claudeDriver,
          },
          {
            name: "explicit-unavailable",
            inheritedEnabled: false,
            peerEnabled: true,
            explicit: true,
            selectedInstanceId: null,
            candidateDriver: driver,
          },
          {
            name: "explicit-healthy",
            inheritedEnabled: true,
            peerEnabled: true,
            explicit: true,
            selectedInstanceId: codexAltInstanceId,
            candidateDriver: driver,
          },
        ] as const;

        for (const testCase of cases) {
          const dispatched = yield* Ref.make<ReadonlyArray<unknown>>([]);
          let delegated = false;
          const layerDependencies = Layer.mergeAll(
            NodeServices.layer,
            Layer.mock(ThreadManagementService.ThreadManagementService)({
              getThreadRecords: (threadId) =>
                Effect.succeed(
                  threadId === parentThreadId
                    ? parentProjection(delegated ? [task] : [], parentModelSelection)
                    : childProjection,
                ),
              dispatch: (command) =>
                Ref.update(dispatched, (commands) => [...commands, command]).pipe(
                  Effect.andThen(
                    Effect.sync(() => {
                      delegated = true;
                    }),
                  ),
                  Effect.as({
                    sequence: 1,
                    storedEvents: [
                      {
                        sequence: 1,
                        commandId: null,
                        event: { type: "subagent.updated", payload: task },
                      },
                    ],
                  } as never),
                ),
            }),
            ServerSettings.layerTest(),
            providerRegistryLayer([
              providerSnapshot({
                instanceId: codexInstanceId,
                driver,
                model: "gpt-5.4",
                enabled: testCase.inheritedEnabled,
              }),
              providerSnapshot({
                instanceId: codexAltInstanceId,
                driver: testCase.candidateDriver,
                model: "codex-alt-model",
                enabled: testCase.peerEnabled,
              }),
            ]),
            adapterRegistryLayer([codexInstanceId, codexAltInstanceId]),
            noProjects,
            Layer.mock(TaskBoardService.TaskBoardService)({}),
            Layer.mock(SecretRequests.SecretRequests)({}),
            Layer.mock(ScheduledTaskService.ScheduledTaskService)({}),
          );

          yield* Effect.gen(function* () {
            const service = yield* OrchestratorMcpService.OrchestratorMcpService;
            const target = testCase.explicit
              ? ({
                  providerInstanceId:
                    testCase.selectedInstanceId === null
                      ? codexInstanceId
                      : testCase.selectedInstanceId,
                } as const)
              : ({ driverKind: testCase.candidateDriver } as const);
            if (testCase.selectedInstanceId === null) {
              const error = yield* service
                .delegateTask(scope, {
                  task: "Summarize the diff.",
                  target,
                  mode: "async",
                  clientRequestId: `delegate-select-${testCase.name}`,
                })
                .pipe(Effect.flip);
              assert.equal(error.code, "provider_unavailable", testCase.name);
              if (testCase.name === "cross-driver-no-available-candidate") {
                assert.isTrue(error.message.includes("driver claudeAgent"), testCase.name);
                const threadError = yield* service
                  .createThreads(scope, {
                    threads: [{ prompt: "Summarize the diff.", target }],
                    clientRequestId: `delegate-threads-${testCase.name}`,
                  })
                  .pipe(Effect.flip);
                assert.equal(
                  threadError.code,
                  "provider_unavailable",
                  `${testCase.name}-createThreads`,
                );
                assert.isTrue(
                  threadError.message.includes("driver claudeAgent"),
                  `${testCase.name}-createThreads`,
                );
              }
              assert.deepEqual(yield* Ref.get(dispatched), [], testCase.name);
              return;
            }
            const result = yield* service.delegateTask(scope, {
              task: "Summarize the diff.",
              target,
              mode: "async",
              clientRequestId: `delegate-select-${testCase.name}`,
            });
            assert.equal(result.status, "running", testCase.name);
            const commands = yield* Ref.get(dispatched);
            assert.equal(commands.length, 1, testCase.name);
            const request = commands[0] as {
              type: string;
              modelSelection: {
                instanceId: string;
                model: string;
                options?: ReadonlyArray<{ id: string; value: unknown }>;
              };
            };
            assert.equal(request.type, "delegated_task.request", testCase.name);
            assert.equal(
              request.modelSelection.instanceId,
              testCase.selectedInstanceId,
              testCase.name,
            );
            if (testCase.name === "healthy-inherited") {
              assert.deepEqual(request.modelSelection, parentModelSelection, testCase.name);
            } else {
              assert.equal(request.modelSelection.model, "codex-alt-model", testCase.name);
            }
          }).pipe(Effect.provide(serviceLayerUnderTest.pipe(Layer.provide(layerDependencies))));
        }
      }),
  );

  describe("scheduled tasks at modes above the caller's", () => {
    const projectId = ProjectId.make("project:scheduled");
    const boundThreadId = ThreadId.make("thread:scheduled-bound");
    const task = (overrides: Partial<ScheduledTask>): ScheduledTask => ({
      id: ScheduledTaskId.make("scheduled-task:webhook"),
      title: "On push",
      prompt: "Do {{body.instruction}}",
      enabled: true,
      schedule: { type: "webhook", signature: null },
      projectId,
      threadId: null,
      workspaceStrategy: { type: "root" },
      modelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "gpt-5" },
      runtimeMode: "approval-required",
      interactionMode: "default",
      createdBy: "agent",
      creationSource: "mcp",
      createdAt: "2026-10-05T00:00:00.000Z",
      updatedAt: "2026-10-05T00:00:00.000Z",
      nextRunAt: null,
      lastRunAt: null,
      lastRunStatus: "never",
      lastRunError: null,
      runCount: 0,
      webhook: {
        path: "/hooks/scheduled-task/secret",
        url: "https://t3.example/hooks/secret",
        hasSecret: false,
      },
      ...overrides,
    });
    const supervisedClient: McpInvocationScope = {
      environmentId: EnvironmentId.make("environment:scheduled"),
      requestNamespace: "client:scheduled",
      thread: undefined,
      client: {
        sessionId: "scheduled",
        label: "Claude Code",
        access: "approval-required",
      },
      capabilities: new Set(["orchestration"]),
      issuedAt: 1,
    };
    const service = (
      tasks: ReadonlyArray<ScheduledTask>,
      boundThread: OrchestrationV2ThreadShell | null,
      upserted: Ref.Ref<number>,
    ) =>
      serviceLayerUnderTest.pipe(
        Layer.provide(
          Layer.mergeAll(
            NodeServices.layer,
            Layer.mock(ThreadManagementService.ThreadManagementService)({
              getThreadShell: (threadId) =>
                Effect.succeed(threadId === boundThreadId ? boundThread : null),
            }),
            ServerSettings.layerTest(),
            Layer.mock(ProviderRegistry.ProviderRegistry)({ getProviders: Effect.succeed([]) }),
            Layer.mock(ProviderAdapterRegistry.ProviderAdapterRegistryV2)({
              list: () => Effect.succeed([]),
            }),
            noProjects,
            Layer.mock(TaskBoardService.TaskBoardService)({}),
            Layer.mock(SecretRequests.SecretRequests)({}),
            Layer.mock(ScheduledTaskService.ScheduledTaskService)({
              list: () => Effect.succeed({ tasks }),
              upsert: () =>
                Ref.update(upserted, (count) => count + 1).pipe(Effect.as({ task: tasks[0]! })),
            }),
          ),
        ),
      );

    it.effect("hides a webhook URL from a caller below the task's modes", () =>
      Effect.gen(function* () {
        const upserted = yield* Ref.make(0);
        const listed = yield* OrchestratorMcpService.OrchestratorMcpService.pipe(
          Effect.flatMap((mcp) => mcp.listScheduledTasks(supervisedClient, { projectId })),
          Effect.provide(
            service(
              [
                task({ runtimeMode: "full-access" }),
                task({ id: ScheduledTaskId.make("scheduled-task:supervised") }),
              ],
              null,
              upserted,
            ),
          ),
        );
        assert.deepEqual(
          listed.tasks.map((summary) => summary.webhookUrl),
          [undefined, "https://t3.example/hooks/secret"],
        );
      }),
    );

    it.effect("hides a webhook URL from a thread whose turn has ended", () =>
      Effect.gen(function* () {
        const callerId = ThreadId.make("thread:scheduled-ended");
        const shell = liveThreadShell(callerId, { activeRunId: null });
        const listed = yield* OrchestratorMcpService.OrchestratorMcpService.pipe(
          Effect.flatMap((mcp) =>
            mcp.listScheduledTasks(
              {
                ...supervisedClient,
                requestNamespace: "provider:scheduled-ended",
                thread: {
                  threadId: callerId,
                  providerSessionId: "provider:scheduled-ended",
                  providerInstanceId: shell.providerInstanceId,
                },
                client: undefined,
              },
              { projectId },
            ),
          ),
          Effect.provide(
            serviceLayerUnderTest.pipe(
              Layer.provide(
                Layer.mergeAll(
                  NodeServices.layer,
                  Layer.mock(ThreadManagementService.ThreadManagementService)({
                    getThreadShell: () => Effect.succeed(null),
                    // Its turn ended: no run is active.
                    getThreadRecords: () => Effect.succeed(idleThreadProjection(shell)),
                  }),
                  ServerSettings.layerTest(),
                  Layer.mock(ProviderRegistry.ProviderRegistry)({
                    getProviders: Effect.succeed([]),
                  }),
                  Layer.mock(ProviderAdapterRegistry.ProviderAdapterRegistryV2)({
                    list: () => Effect.succeed([]),
                  }),
                  noProjects,
                  Layer.mock(TaskBoardService.TaskBoardService)({}),
                  Layer.mock(SecretRequests.SecretRequests)({}),
                  Layer.mock(ScheduledTaskService.ScheduledTaskService)({
                    list: () => Effect.succeed({ tasks: [task({})] }),
                  }),
                ),
              ),
            ),
          ),
        );
        assert.equal(listed.tasks[0]?.webhookUrl, undefined);
      }),
    );

    it.effect("never shows a read-only client a webhook URL", () =>
      Effect.gen(function* () {
        const upserted = yield* Ref.make(0);
        const listed = yield* OrchestratorMcpService.OrchestratorMcpService.pipe(
          Effect.flatMap((mcp) =>
            mcp.listScheduledTasks(
              {
                ...supervisedClient,
                client: { sessionId: "scheduled", label: "Claude Code", access: "read-only" },
              },
              { projectId },
            ),
          ),
          Effect.provide(service([task({})], null, upserted)),
        );
        assert.equal(listed.tasks[0]?.webhookUrl, undefined);
      }),
    );

    it.effect("checks a bound task against its thread's current modes", () =>
      Effect.gen(function* () {
        const upserted = yield* Ref.make(0);
        // Scheduled while the thread was Supervised; the thread now runs in full access.
        const bound = task({ threadId: boundThreadId });
        const layer = service(
          [bound],
          liveThreadShell(boundThreadId, { runtimeMode: "full-access" }),
          upserted,
        );
        const mcp = yield* OrchestratorMcpService.OrchestratorMcpService.pipe(
          Effect.provide(layer),
        );
        const listed = yield* mcp.listScheduledTasks(supervisedClient, { projectId });
        assert.equal(listed.tasks[0]?.webhookUrl, undefined);
        const error = yield* mcp
          .updateScheduledTask(supervisedClient, {
            scheduledTaskId: bound.id,
            prompt: "Something else",
          })
          .pipe(Effect.flip);
        assert.equal(error.code, "runtime_mode_escalation_denied");
        assert.equal(yield* Ref.get(upserted), 0);
      }),
    );

    it.effect("reports a saved task even when its bound thread cannot be read", () =>
      Effect.gen(function* () {
        const upserted = yield* Ref.make(0);
        const bound = task({ threadId: boundThreadId });
        const lookups = yield* Ref.make(0);
        // The edit's own check reads the thread; the read after the save fails.
        const mcp = yield* OrchestratorMcpService.OrchestratorMcpService.pipe(
          Effect.provide(
            serviceLayerUnderTest.pipe(
              Layer.provide(
                Layer.mergeAll(
                  NodeServices.layer,
                  Layer.mock(ThreadManagementService.ThreadManagementService)({
                    getThreadShell: (threadId) =>
                      Ref.getAndUpdate(lookups, (count) => count + 1).pipe(
                        Effect.flatMap((count) =>
                          count === 0
                            ? Effect.succeed(
                                liveThreadShell(threadId, { runtimeMode: "approval-required" }),
                              )
                            : Effect.fail(new OrchestratorProjectionError({ threadId })),
                        ),
                      ),
                  }),
                  ServerSettings.layerTest(),
                  Layer.mock(ProviderRegistry.ProviderRegistry)({
                    getProviders: Effect.succeed([]),
                  }),
                  Layer.mock(ProviderAdapterRegistry.ProviderAdapterRegistryV2)({
                    list: () => Effect.succeed([]),
                  }),
                  noProjects,
                  Layer.mock(TaskBoardService.TaskBoardService)({}),
                  Layer.mock(SecretRequests.SecretRequests)({}),
                  Layer.mock(ScheduledTaskService.ScheduledTaskService)({
                    list: () => Effect.succeed({ tasks: [bound] }),
                    upsert: () =>
                      Ref.update(upserted, (count) => count + 1).pipe(Effect.as({ task: bound })),
                  }),
                ),
              ),
            ),
          ),
        );
        const updated = yield* mcp.updateScheduledTask(supervisedClient, {
          scheduledTaskId: bound.id,
          prompt: "Something else",
        });
        assert.equal(yield* Ref.get(upserted), 1);
        assert.equal(updated.scheduledTaskId, bound.id);
        assert.equal(updated.webhookUrl, undefined);
      }),
    );
  });

  describe("resolveRuntimeMode", () => {
    // Muse offers only these two, and runs any other mode as Supervised.
    const muse = {
      modelSelection: { instanceId: ProviderInstanceId.make("muse"), model: "muse-model" },
      supportedRuntimeModes: ["approval-required", "full-access"] as const,
    };

    it.effect("refuses an explicit mode the target provider does not offer", () =>
      Effect.gen(function* () {
        const error = yield* OrchestratorMcpService.resolveRuntimeMode(
          "full-access",
          "auto-accept-edits",
          muse,
        ).pipe(Effect.flip);
        assert.equal(error.code, "invalid_request");
        assert.include(error.message, "approval-required, full-access");
      }),
    );

    it.effect("steps an inherited mode down to the broadest one the provider offers", () =>
      Effect.gen(function* () {
        assert.equal(
          yield* OrchestratorMcpService.resolveRuntimeMode("full-access", "inherit", muse),
          "full-access",
        );
        assert.equal(
          yield* OrchestratorMcpService.resolveRuntimeMode("auto", undefined, muse),
          "approval-required",
        );
      }),
    );
  });
});

describe("OrchestratorMcpService board tasks", () => {
  const projectId = ProjectId.make("project:mcp-test");
  const callerId = ThreadId.make("thread:board-caller");
  const shell = liveThreadShell(callerId);
  const threadScope: McpInvocationScope = {
    environmentId: EnvironmentId.make("environment:board"),
    requestNamespace: "provider:board",
    thread: {
      threadId: callerId,
      providerSessionId: "provider:board",
      providerInstanceId: shell.providerInstanceId,
    },
    client: undefined,
    capabilities: new Set(["orchestration"]),
    issuedAt: 1,
  };
  const clientScope: McpInvocationScope = {
    ...threadScope,
    thread: undefined,
    client: { sessionId: "board", label: "Claude Code", access: "approval-required" },
  };
  const boardTask = (overrides: Partial<TaskBoardTask> & { id: string }): TaskBoardTask =>
    ({
      project: "Leonidas",
      projectSlug: "leonidas-code",
      title: overrides.id,
      description: "",
      status: "todo",
      priority: "medium",
      claimedBy: null,
      updatedAt: 1_000,
      labels: [],
      history: [],
      ...overrides,
    }) as TaskBoardTask;
  const workspace = (tasks: ReadonlyArray<TaskBoardTask>): TaskBoardWorkspaceSnapshot =>
    ({
      member: "Jake",
      aiosRoot: null,
      aiosConnected: true,
      checkedAt: 1,
      projects: [
        {
          slug: "leonidas-code",
          name: "Leonidas",
          projectId,
          repository: null,
          total: 0,
          open: 0,
        },
        { slug: "other", name: "Other", projectId: null, repository: null, total: 0, open: 0 },
      ],
      tasks,
    }) as TaskBoardWorkspaceSnapshot;

  const service = (
    tasks: ReadonlyArray<TaskBoardTask>,
    board: Partial<TaskBoardService.TaskBoardService["Service"]> = {},
  ) =>
    serviceLayerUnderTest.pipe(
      Layer.provide(
        Layer.mergeAll(
          NodeServices.layer,
          ServerSettings.layerTest(),
          Layer.mock(ThreadManagementService.ThreadManagementService)({
            getThreadRecords: () => Effect.succeed(idleThreadProjection(shell)),
          }),
          Layer.mock(ProviderRegistry.ProviderRegistry)({ getProviders: Effect.succeed([]) }),
          Layer.mock(ProviderAdapterRegistry.ProviderAdapterRegistryV2)({
            list: () => Effect.succeed([]),
          }),
          Layer.mock(ProjectService.ProjectService)({
            snapshot: Effect.succeed({ projects: [], updatedAt: "2026-10-11T00:00:00.000Z" }),
          }),
          Layer.mock(TaskBoardService.TaskBoardService)({
            workspace: () => Effect.succeed(workspace(tasks)),
            ...board,
          }),
          Layer.mock(SecretRequests.SecretRequests)({}),
          Layer.mock(ScheduledTaskService.ScheduledTaskService)({}),
        ),
      ),
    );

  it.effect("lists open tasks in the caller's project, most urgent first", () =>
    Effect.gen(function* () {
      const mcp = yield* OrchestratorMcpService.OrchestratorMcpService;
      const listed = yield* mcp.boardTaskList(threadScope, {});
      assert.equal(listed.member, "Jake");
      assert.deepEqual(
        listed.tasks.map((row) => row.id),
        ["crit", "doing", "old", "new"],
      );
      assert.equal(listed.total, 4);
      assert.equal(listed.tasks[0]?.updatedAt, "1970-01-01T00:00:01.000Z");
    }).pipe(
      Effect.provide(
        service([
          boardTask({ id: "new", updatedAt: 5_000 }),
          boardTask({ id: "old", updatedAt: 2_000 }),
          boardTask({ id: "doing", status: "in_progress", updatedAt: 9_000 }),
          boardTask({ id: "crit", priority: "critical", updatedAt: 1_000 }),
          boardTask({ id: "finished", status: "done" }),
          boardTask({ id: "parked", status: "parked" }),
          boardTask({ id: "elsewhere", projectSlug: "other" }),
        ]),
      ),
    ),
  );

  it.effect("lists every project outside a thread, and honours filters and limit", () =>
    Effect.gen(function* () {
      const mcp = yield* OrchestratorMcpService.OrchestratorMcpService;
      const everything = yield* mcp.boardTaskList(clientScope, {});
      assert.equal(everything.total, 3);
      const mine = yield* mcp.boardTaskList(clientScope, { mine: true });
      assert.deepEqual(
        mine.tasks.map((row) => row.id),
        ["mine"],
      );
      const done = yield* mcp.boardTaskList(clientScope, { status: ["done"] });
      assert.deepEqual(
        done.tasks.map((row) => row.id),
        ["finished"],
      );
      const limited = yield* mcp.boardTaskList(clientScope, { limit: 1 });
      assert.equal(limited.total, 3);
      assert.equal(limited.tasks.length, 1);
      const searched = yield* mcp.boardTaskList(clientScope, { query: "MINE" });
      assert.equal(searched.total, 1);
    }).pipe(
      Effect.provide(
        service([
          boardTask({ id: "mine", claimedBy: "Jake" }),
          boardTask({ id: "theirs", claimedBy: "Mob" }),
          boardTask({ id: "elsewhere", projectSlug: "other" }),
          boardTask({ id: "finished", status: "done" }),
        ]),
      ),
    ),
  );

  it.effect("returns a task in full and reports an unknown id", () =>
    Effect.gen(function* () {
      const mcp = yield* OrchestratorMcpService.OrchestratorMcpService;
      const detail = yield* mcp.boardTaskGet(threadScope, { taskId: "a" });
      assert.equal(detail.description, "Do the thing");
      assert.equal(detail.history.length, 15);
      assert.equal(detail.history[0]?.note, "step 5");
      const error = yield* mcp.boardTaskGet(threadScope, { taskId: "missing" }).pipe(Effect.flip);
      assert.equal(error.code, "task_not_found");
    }).pipe(
      Effect.provide(
        service([
          boardTask({
            id: "a",
            description: "Do the thing",
            history: Array.from({ length: 20 }, (_, index) => ({
              id: `h${index}`,
              taskId: "a",
              action: "progress" as const,
              actor: "Jake",
              timestamp: 1_000 * index,
              note: `step ${index}`,
            })),
          }),
        ]),
      ),
    ),
  );

  it.effect("claims a todo task for the member and records the calling agent", () =>
    Effect.gen(function* () {
      const received = yield* Ref.make<TaskBoardCardUpdateInput | undefined>(undefined);
      const mcp = yield* OrchestratorMcpService.OrchestratorMcpService.pipe(
        Effect.provide(
          service([boardTask({ id: "a" })], {
            cardUpdate: (input) =>
              Ref.set(received, input).pipe(
                Effect.as(boardTask({ id: "a", status: "in_progress", claimedBy: "Jake" })),
              ),
          }),
        ),
      );
      const row = yield* mcp.boardTaskUpdate(threadScope, { taskId: "a", claim: true });
      assert.equal(row.status, "in_progress");
      const input = yield* Ref.get(received);
      assert.equal(input?.actor, "Jake");
      assert.equal(input?.claimedBy, "Jake");
      assert.equal(input?.status, "in_progress");
      assert.equal(input?.agent?.threadId, callerId);
      assert.equal(input?.agent?.model, "gpt-5");
      assert.equal(input?.agent?.providerInstanceId, shell.providerInstanceId);

      yield* mcp.boardTaskUpdate(threadScope, { taskId: "a", milestone: "1.0.0" });
      assert.equal((yield* Ref.get(received))?.milestone, "1.0.0");

      yield* mcp.boardTaskUpdate(threadScope, { taskId: "a", release: true, note: "paused" });
      const released = yield* Ref.get(received);
      assert.isNull(released?.claimedBy);
      assert.isUndefined(released?.status);
      assert.equal(released?.note, "paused");
    }),
  );

  it.effect("maps board failures to the right failure code", () =>
    Effect.gen(function* () {
      const mcp = yield* OrchestratorMcpService.OrchestratorMcpService;
      const both = yield* mcp
        .boardTaskUpdate(threadScope, { taskId: "a", claim: true, release: true })
        .pipe(Effect.flip);
      assert.equal(both.code, "invalid_request");
      const missing = yield* mcp
        .boardTaskUpdate(threadScope, { taskId: "gone", status: "done" })
        .pipe(Effect.flip);
      assert.equal(missing.code, "invalid_request");
      const storage = yield* mcp
        .boardTaskUpdate(threadScope, { taskId: "broken", status: "done" })
        .pipe(Effect.flip);
      assert.equal(storage.code, "orchestration_error");
    }).pipe(
      Effect.provide(
        service([], {
          cardUpdate: (input) =>
            Effect.fail(
              new TaskBoardOperationError({
                reason: input.taskId === "gone" ? "task_not_found" : "storage_error",
                message: "failed",
              }),
            ),
        }),
      ),
    ),
  );

  it.effect("files a new task under the caller's project unless told otherwise", () =>
    Effect.gen(function* () {
      const received = yield* Ref.make<ReadonlyArray<TaskBoardCardCreateInput>>([]);
      const mcp = yield* OrchestratorMcpService.OrchestratorMcpService.pipe(
        Effect.provide(
          service([], {
            cardCreate: (input) =>
              Ref.update(received, (all) => [...all, input]).pipe(
                Effect.as(boardTask({ id: "new", title: input.title })),
              ),
          }),
        ),
      );
      const row = yield* mcp.boardTaskCreate(threadScope, {
        title: "Follow up",
        milestone: "0.22.0",
      });
      assert.equal(row.title, "Follow up");
      yield* mcp.boardTaskCreate(threadScope, { title: "Elsewhere", projectSlug: "other" });
      yield* mcp.boardTaskCreate(clientScope, { title: "Loose" });
      const inputs = yield* Ref.get(received);
      assert.deepEqual(
        inputs.map((input) => input.projectSlug),
        ["leonidas-code", "other", undefined],
      );
      assert.equal(inputs[0]?.actor, "Jake");
      assert.equal(inputs[0]?.milestone, "0.22.0");
    }),
  );
});

describe("OrchestratorMcpService thread read defaults", () => {
  it("pages the activity view in smaller chunks than the messages view", () => {
    assert.equal(OrchestratorMcpService.threadReadDefaultLimit(undefined), 50);
    assert.equal(OrchestratorMcpService.threadReadDefaultLimit("messages"), 50);
    assert.equal(OrchestratorMcpService.threadReadDefaultLimit("activity"), 25);
  });
});
