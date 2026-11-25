import { expect, it } from "@effect/vitest";
import {
  EventId,
  ThreadId,
  type OrchestrationV2DomainEvent,
  type OrchestrationV2ServerCommand,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Queue from "effect/Queue";
import * as Stream from "effect/Stream";
import { TestClock } from "effect/testing";

import * as BackgroundCommandLimitService from "./BackgroundCommandLimitService.ts";
import * as Orchestrator from "./Orchestrator.ts";
import * as ProjectionStore from "./ProjectionStore.ts";
import * as ProviderSessionManager from "./ProviderSessionManager.ts";

const threadId = ThreadId.make("limit-thread");

// Only the fields the service reads.
const records = {
  thread: { id: threadId, activeProviderThreadId: "provider-thread" },
  runs: [],
  messages: [],
  providerTurns: [],
  turnItems: [],
  providerThreads: [
    {
      id: "provider-thread",
      providerSessionId: "session-1",
      pendingBackgroundTasks: [{ taskId: "b1", kind: "command", description: "Run the build" }],
    },
  ],
} as never;

const run = (enabled: boolean) =>
  Effect.gen(function* () {
    const events = yield* Queue.unbounded<OrchestrationV2DomainEvent>();
    const commands = yield* Queue.unbounded<OrchestrationV2ServerCommand>();
    const reads = yield* Queue.unbounded<void>();
    const stopped: Array<string> = [];
    const dependencies = Layer.mergeAll(
      Layer.mock(ProjectionStore.ProjectionStoreV2)({
        getThreadRecords: () => Queue.offer(reads, undefined).pipe(Effect.as(records)),
      }),
      Layer.mock(ProviderSessionManager.ProviderSessionManagerV2)({
        get: () =>
          Effect.succeed(
            Option.some({
              stopTask: ({ taskId }: { readonly taskId: string }) =>
                Effect.sync(() => void stopped.push(taskId)),
            } as never),
          ),
      }),
      Layer.mock(Orchestrator.OrchestratorV2)({
        streamDomainEvents: Stream.fromQueue(events),
        dispatch: (command) =>
          Queue.offer(commands, command).pipe(Effect.as({ sequence: 1, storedEvents: [] })),
      }),
    );
    const start = Effect.gen(function* () {
      const service = yield* BackgroundCommandLimitService.make({ enabled });
      yield* service.start();
      yield* Queue.offer(events, {
        id: EventId.make("started"),
        type: "provider-thread.updated",
        threadId,
        payload: { pendingBackgroundTasks: [{}] },
      } as never);
    });
    return { commands, reads, stopped, dependencies, start };
  });

it.effect("asks the agent past the limit and stops the command without an answer", () =>
  Effect.gen(function* () {
    const harness = yield* run(true);
    yield* Effect.gen(function* () {
      yield* harness.start;
      yield* Queue.take(harness.reads);
      yield* TestClock.adjust("29 minutes");
      expect(yield* Queue.size(harness.commands)).toBe(0);
      yield* TestClock.adjust("1 minute");
      const wake = yield* Queue.take(harness.commands);
      expect(wake).toMatchObject({ type: "message.dispatch", threadId, createdBy: "agent" });
      expect(wake.type === "message.dispatch" && wake.text).toContain("`b1`: Run the build");
      yield* TestClock.adjust("9 minutes");
      expect(harness.stopped).toEqual([]);
      yield* TestClock.adjust("1 minute");
      expect(harness.stopped).toEqual(["b1"]);
    }).pipe(Effect.provide(harness.dependencies));
  }).pipe(Effect.scoped),
);

it.effect("does nothing while the switch is off", () =>
  Effect.gen(function* () {
    const harness = yield* run(false);
    yield* Effect.gen(function* () {
      yield* harness.start;
      yield* TestClock.adjust("60 minutes");
      expect(yield* Queue.size(harness.reads)).toBe(0);
      expect(yield* Queue.size(harness.commands)).toBe(0);
    }).pipe(Effect.provide(harness.dependencies));
  }).pipe(Effect.scoped),
);
