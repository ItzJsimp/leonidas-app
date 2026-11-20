// @effect-diagnostics nodeBuiltinImport:off
import * as NodeFs from "node:fs";
import * as NodeOs from "node:os";
import * as NodePath from "node:path";

import { describe, expect, it } from "@effect/vitest";
import { ThreadId, type SubagentSpawnApproval } from "@t3tools/contracts";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Stream from "effect/Stream";
import * as TestClock from "effect/testing/TestClock";

import { makeSpawnApprovals, parseSavedCounts } from "./SpawnApprovals.ts";

const approval = (id: string): SubagentSpawnApproval => ({
  id,
  threadId: ThreadId.make("thread-1"),
  threadTitle: "Build",
  subagent: "frontend-designer",
  model: "claude-opus-5-5",
  account: "Claude",
  reason: "Design the view",
  filesInScope: ["DESIGN.md"],
  toolCount: 6,
  estimatedStartTokens: 12_000,
  tierSource: "app",
  goodFor: "Design",
  requestedAt: "2026-10-16T00:00:00.000Z",
});

const openIds = (broker: Effect.Success<typeof makeSpawnApprovals>) =>
  broker.pending.pipe(
    Stream.take(1),
    Stream.runCollect,
    Effect.map((lists) => lists[0]!.map((a) => a.id)),
  );

describe("SpawnApprovals", () => {
  it.effect("waits for Deny and then drops the card", () =>
    Effect.gen(function* () {
      const broker = yield* makeSpawnApprovals;
      const waiting = yield* Effect.forkChild(broker.request(approval("a")));
      yield* Effect.yieldNow;
      expect(yield* openIds(broker)).toEqual(["a"]);
      yield* broker.respond({ id: "a", decision: { kind: "deny" } });
      expect(yield* Fiber.join(waiting)).toEqual({ kind: "deny" });
      expect(yield* openIds(broker)).toEqual([]);
    }),
  );

  it.effect("remembers Allow for this thread per subagent and model", () =>
    Effect.gen(function* () {
      const broker = yield* makeSpawnApprovals;
      const key = {
        threadId: ThreadId.make("thread-1"),
        subagent: "frontend-designer",
        model: "claude-opus-5-5",
      };
      expect(yield* broker.isAllowedForThread(key)).toBe(false);
      const waiting = yield* Effect.forkChild(broker.request(approval("b")));
      yield* Effect.yieldNow;
      yield* broker.respond({ id: "b", decision: { kind: "allow_thread" } });
      yield* Fiber.join(waiting);
      expect(yield* broker.isAllowedForThread(key)).toBe(true);
      expect(yield* broker.isAllowedForThread({ ...key, model: "claude-fable-5-1" })).toBe(false);
    }),
  );

  it.effect("removes the card when the caller is interrupted", () =>
    Effect.gen(function* () {
      const broker = yield* makeSpawnApprovals;
      const waiting = yield* Effect.forkChild(broker.request(approval("c")));
      yield* Effect.yieldNow;
      yield* Fiber.interrupt(waiting);
      expect(yield* openIds(broker)).toEqual([]);
      const late = yield* broker
        .respond({ id: "c", decision: { kind: "allow_once" } })
        .pipe(Effect.flip);
      expect(late._tag).toBe("SubagentSpawnApprovalError");
    }),
  );
});

describe("SpawnApprovals with a short call wait", () => {
  it.effect("keeps the card open when the call gives up, and a retry takes the late answer", () =>
    Effect.gen(function* () {
      const broker = yield* makeSpawnApprovals;
      const first = yield* Effect.forkChild(
        broker.request(approval("d"), { waitFor: Duration.seconds(45) }),
      );
      yield* Effect.yieldNow;
      yield* TestClock.adjust(Duration.seconds(46));
      expect(yield* Fiber.join(first)).toEqual({ kind: "still_waiting" });
      // The card is still open for the user.
      expect(yield* openIds(broker)).toEqual(["d"]);

      yield* broker.respond({ id: "d", decision: { kind: "allow_once" } });
      expect(yield* openIds(broker)).toEqual([]);

      // The retry opens no second card and gets the answer at once.
      const retry = yield* broker.request(approval("d"), { waitFor: Duration.seconds(45) });
      expect(retry).toEqual({ kind: "allow_once" });
      expect(yield* openIds(broker)).toEqual([]);
      expect((yield* broker.stats).waitedToday).toBe(1);
    }),
  );

  it.effect("lets a retry join the open card and wait for the answer", () =>
    Effect.gen(function* () {
      const broker = yield* makeSpawnApprovals;
      const first = yield* Effect.forkChild(
        broker.request(approval("e"), { waitFor: Duration.seconds(45) }),
      );
      yield* Effect.yieldNow;
      yield* TestClock.adjust(Duration.seconds(46));
      yield* Fiber.join(first);
      const retry = yield* Effect.forkChild(
        broker.request(approval("e"), { waitFor: Duration.seconds(45) }),
      );
      yield* Effect.yieldNow;
      expect(yield* openIds(broker)).toEqual(["e"]);
      yield* broker.respond({ id: "e", decision: { kind: "deny" } });
      expect(yield* Fiber.join(retry)).toEqual({ kind: "deny" });
    }),
  );

  it.effect("drops an unanswered card after 15 minutes", () =>
    Effect.gen(function* () {
      const broker = yield* makeSpawnApprovals;
      const first = yield* Effect.forkChild(
        broker.request(approval("f"), { waitFor: Duration.seconds(45) }),
      );
      yield* Effect.yieldNow;
      yield* TestClock.adjust(Duration.seconds(46));
      yield* Fiber.join(first);
      yield* TestClock.adjust(Duration.minutes(16));
      expect(yield* openIds(broker)).toEqual([]);
    }),
  );
});

describe("persisted counts", () => {
  const withTempFile = () => {
    const folder = NodeFs.mkdtempSync(NodePath.join(NodeOs.tmpdir(), "spawn-stats-"));
    return { folder, file: NodePath.join(folder, "subagent-stats.json") };
  };

  it.effect("keeps today's counts across a restart", () =>
    Effect.gen(function* () {
      const { folder, file } = withTempFile();
      const first = yield* makeSpawnApprovals;
      yield* first.keepStatsIn(file);
      yield* first.recordSpawn(10_000);
      yield* first.recordSpawn(14_000);

      const second = yield* makeSpawnApprovals;
      yield* second.keepStatsIn(file);
      const stats = yield* second.stats;
      NodeFs.rmSync(folder, { recursive: true, force: true });
      expect(stats.spawnsToday).toBe(2);
      expect(stats.meanStartTokensToday).toBe(12_000);
    }),
  );

  it.effect("does not add the saved counts again when the same file is kept twice", () =>
    Effect.gen(function* () {
      const { folder, file } = withTempFile();
      const first = yield* makeSpawnApprovals;
      yield* first.keepStatsIn(file);
      yield* first.recordSpawn(10_000);

      const second = yield* makeSpawnApprovals;
      yield* second.keepStatsIn(file);
      yield* second.keepStatsIn(file);
      yield* second.keepStatsIn(file);
      const stats = yield* second.stats;
      NodeFs.rmSync(folder, { recursive: true, force: true });
      expect(stats.spawnsToday).toBe(1);
    }),
  );

  it("ignores counts saved on another day or damaged", () => {
    const saved = JSON.stringify({ day: "2026-10-15", spawns: 4, waited: 1, startTokens: 40_000 });
    expect(parseSavedCounts(saved, "2026-10-16")).toBeNull();
    expect(parseSavedCounts(saved, "2026-10-15")).toEqual({
      day: "2026-10-15",
      spawns: 4,
      waited: 1,
      startTokens: 40_000,
    });
    expect(parseSavedCounts("{not json", "2026-10-16")).toBeNull();
    expect(parseSavedCounts('{"day":"2026-10-16","spawns":-1}', "2026-10-16")).toBeNull();
  });
});
