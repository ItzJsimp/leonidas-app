import { describe, expect, it } from "@effect/vitest";
import { ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";

import * as ServerSettings from "../serverSettings.ts";
import * as UsageService from "../usage/UsageService.ts";
import { NativeSpawnGate } from "./nativeSpawnGate.ts";
import * as NativeSpawnGateLive from "./nativeSpawnGateLive.ts";
import { SpawnApprovals, makeSpawnApprovals } from "./SpawnApprovals.ts";
import * as SubagentRuns from "./SubagentRuns.ts";

const threadId = ThreadId.make("thread-1");
const request = {
  threadId,
  threadTitle: "Main",
  cwd: null,
  instanceId: "claude",
  account: "Claude",
  model: "claude-haiku-5-5",
  callerIsSubagent: false,
  label: "Explore",
  task: "Find every caller",
  reason: "Find callers",
  toolUseId: "tool-1",
};

const facts = { depth: 0, runningChildren: 0, callerCanSpawn: false, spendUsd: 0 };

const gateWith = (spawnContext: typeof facts) =>
  Layer.effect(NativeSpawnGate, NativeSpawnGateLive.make).pipe(
    Layer.provide(
      Layer.mergeAll(
        ServerSettings.layerTest({
          subagentFreeTierModels: ["claude-haiku-5-5"],
          subagentDailyCapUsd: 2,
        }),
        Layer.mock(SubagentRuns.SubagentRuns)({ spawnContext: () => Effect.succeed(spawnContext) }),
        Layer.mock(UsageService.UsageService)({ rateFor: () => Effect.succeed(null) }),
      ),
    ),
  );

const check = (over: Partial<typeof request>, spawnContext = facts) =>
  Effect.gen(function* () {
    const broker = yield* makeSpawnApprovals;
    const gate = yield* NativeSpawnGate;
    return {
      broker,
      verdict: gate
        .check({ ...request, ...over })
        .pipe(Effect.provideService(SpawnApprovals, broker)),
    };
  }).pipe(Effect.provide(gateWith(spawnContext)));

const openCards = (broker: Effect.Success<typeof makeSpawnApprovals>) =>
  broker.pending.pipe(
    Stream.take(1),
    Stream.runCollect,
    Effect.map((lists) => lists[0]!),
  );

describe("native spawn gate", () => {
  it.effect("decision 3: a free-tier model starts with no card", () =>
    Effect.gen(function* () {
      const { broker, verdict } = yield* check({});
      expect(yield* verdict).toEqual({ allow: true });
      expect(yield* openCards(broker)).toEqual([]);
    }),
  );

  it.effect("decision 3: a frontier model asks first, and Deny stops it with a message", () =>
    Effect.gen(function* () {
      const { broker, verdict } = yield* check({ model: "claude-opus-5-5" });
      const waiting = yield* Effect.forkChild(verdict);
      yield* Effect.yieldNow;
      const [card] = yield* openCards(broker);
      expect([card?.subagent, card?.model, card?.account]).toEqual([
        "Explore",
        "claude-opus-5-5",
        "Claude",
      ]);
      yield* broker.respond({ id: card!.id, decision: { kind: "deny" } });
      const result = yield* Fiber.join(waiting);
      expect(result).toMatchObject({ allow: false, message: expect.stringContaining("denied") });
    }),
  );

  it.effect("decision 3: Allow once lets the frontier spawn start", () =>
    Effect.gen(function* () {
      const { broker, verdict } = yield* check({ model: "claude-opus-5-5" });
      const waiting = yield* Effect.forkChild(verdict);
      yield* Effect.yieldNow;
      const [card] = yield* openCards(broker);
      yield* broker.respond({ id: card!.id, decision: { kind: "allow_once" } });
      expect(yield* Fiber.join(waiting)).toEqual({ allow: true });
    }),
  );

  it.effect("decision 2: a native subagent cannot start another, and fan-out is capped", () =>
    Effect.gen(function* () {
      const inner = yield* check({ callerIsSubagent: true });
      expect(yield* inner.verdict).toMatchObject({
        allow: false,
        message: expect.stringContaining("cannot start subagents"),
      });
      const crowded = yield* check({}, { ...facts, runningChildren: 3 });
      expect(yield* crowded.verdict).toMatchObject({
        allow: false,
        message: expect.stringContaining("3 subagents already run"),
      });
    }),
  );

  it.effect("decision 4: a spawn over the daily cap is refused, free tier too", () =>
    Effect.gen(function* () {
      const spent = yield* check({}, { ...facts, spendUsd: 2 });
      expect(yield* spent.verdict).toMatchObject({
        allow: false,
        message: expect.stringContaining("daily subagent cap of $2.00"),
      });
    }),
  );

  it.effect("decision 2: an orchestrator child may spawn natively, any other child may not", () =>
    Effect.gen(function* () {
      const orchestrator = yield* check({}, { ...facts, depth: 1, callerCanSpawn: true });
      expect(yield* orchestrator.verdict).toEqual({ allow: true });
      const worker = yield* check({}, { ...facts, depth: 1 });
      expect((yield* worker.verdict).allow).toBe(false);
    }),
  );
});
