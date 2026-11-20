import { describe, expect, it } from "@effect/vitest";
import { ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Stream from "effect/Stream";

import { SpawnApprovals, makeSpawnApprovals } from "./SpawnApprovals.ts";
import { confirmDelegatedSpawn, confirmPersonaSpawn } from "./confirmPersonaSpawn.ts";
import type { LoadedSubagentPersona } from "./subagentPersona.ts";

const parent = { thread: { id: ThreadId.make("thread-1"), title: "Main" } };
const gate = {
  callerDepth: 0,
  callerCanSpawn: false,
  runningChildren: 0,
  todaySpendUsd: 0,
  dailyCapUsd: 2,
  rate: null,
};
const base = {
  parent,
  cwd: null,
  task: "Look at the folder",
  model: "claude-haiku-5-5",
  account: "Claude",
  reason: "Look",
  appFreeModels: ["claude-haiku-5-5"],
  approvalId: "spawn:1",
  gate,
};

const openCards = (broker: Effect.Success<typeof makeSpawnApprovals>) =>
  broker.pending.pipe(
    Stream.take(1),
    Stream.runCollect,
    Effect.map((lists) => lists[0]!),
  );

describe("spawn gate on delegated spawns", () => {
  it.effect("decision 3: a free-tier model starts with no card", () =>
    Effect.gen(function* () {
      const broker = yield* makeSpawnApprovals;
      yield* confirmDelegatedSpawn(base).pipe(Effect.provideService(SpawnApprovals, broker));
      expect(yield* openCards(broker)).toEqual([]);
    }),
  );

  it.effect(
    "decision 2: a child of a child, a fourth child and a spawn over the cap are refused",
    () =>
      Effect.gen(function* () {
        const broker = yield* makeSpawnApprovals;
        const refused = (over: Partial<typeof gate>) =>
          confirmDelegatedSpawn({ ...base, gate: { ...gate, ...over } }).pipe(
            Effect.provideService(SpawnApprovals, broker),
            Effect.flip,
          );
        const deep = yield* refused({ callerDepth: 2, callerCanSpawn: true });
        expect([deep.code, deep.message]).toEqual([
          "capability_denied",
          expect.stringContaining("cannot start subagents"),
        ]);
        const crowded = yield* refused({ runningChildren: 3 });
        expect(crowded.message).toContain("3 subagents already run");
        const spent = yield* refused({ todaySpendUsd: 2 });
        expect(spent.message).toContain("daily subagent cap of $2.00");
        // A refused spawn opens no card and starts nothing.
        expect(yield* openCards(broker)).toEqual([]);
      }),
  );

  it.effect("decision 3: a frontier model shows the card with account, model and rough cost", () =>
    Effect.gen(function* () {
      const broker = yield* makeSpawnApprovals;
      const rate = {
        inputCostPerToken: 0.01,
        outputCostPerToken: 0,
        cacheReadCostPerToken: 0,
        cacheCreationCostPerToken: 0,
      };
      const waiting = yield* Effect.forkChild(
        confirmDelegatedSpawn({
          ...base,
          model: "claude-opus-5-5",
          gate: { ...gate, todaySpendUsd: 1.7, rate },
        }).pipe(Effect.provideService(SpawnApprovals, broker), Effect.flip),
      );
      yield* Effect.yieldNow;
      const [card] = yield* openCards(broker);
      expect([card?.model, card?.account]).toEqual(["claude-opus-5-5", "Claude"]);
      expect(card?.roughCost).toMatch(/^about \$\d+\.\d\d$/);
      expect(card?.capWarning).toBe(true);
      yield* broker.respond({ id: "spawn:1", decision: { kind: "deny" } });
      const denied = yield* Fiber.join(waiting);
      expect(denied.code).toBe("capability_denied");
    }),
  );
});

describe("spawn gate on persona spawns", () => {
  const persona = (tier: "confirm" | null) =>
    ({
      spec: { name: "scout", tier, tools: [], context: [] },
      systemPrompt: "You are scout.",
      specPath: "C:/no-such-folder/.agents/subagents/scout.md",
    }) as unknown as LoadedSubagentPersona;

  it.effect("decision 3: an agent file with tier confirm asks even on a free-tier model", () =>
    Effect.gen(function* () {
      const broker = yield* makeSpawnApprovals;
      const waiting = yield* Effect.forkChild(
        confirmPersonaSpawn({ ...base, persona: persona("confirm") }).pipe(
          Effect.provideService(SpawnApprovals, broker),
          Effect.flip,
        ),
      );
      yield* Effect.yieldNow;
      expect((yield* openCards(broker)).map((card) => card.subagent)).toEqual(["scout"]);
      yield* broker.respond({ id: "spawn:1", decision: { kind: "deny" } });
      expect((yield* Fiber.join(waiting)).code).toBe("capability_denied");
    }),
  );

  it.effect("decision 2: a persona child without canSpawn cannot start another subagent", () =>
    Effect.gen(function* () {
      const broker = yield* makeSpawnApprovals;
      const refused = yield* confirmPersonaSpawn({
        ...base,
        persona: persona(null),
        gate: { ...gate, callerDepth: 1, callerCanSpawn: false },
      }).pipe(Effect.provideService(SpawnApprovals, broker), Effect.flip);
      expect(refused.message).toContain("cannot start subagents");
    }),
  );
});
