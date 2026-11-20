import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import * as Clock from "effect/Clock";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Sink from "effect/Sink";
import * as Stream from "effect/Stream";
import { ChildProcessSpawner } from "effect/process";

import * as ScribeSupervisor from "./ScribeSupervisor.ts";

interface FakeChild {
  readonly exit: Deferred.Deferred<ChildProcessSpawner.ExitCode>;
  killed: boolean;
}

/** A spawner whose children run until the test ends them, and that records kills. */
const fakeSpawner = (children: FakeChild[]) =>
  ChildProcessSpawner.make(() =>
    Effect.gen(function* () {
      const child: FakeChild = {
        exit: yield* Deferred.make<ChildProcessSpawner.ExitCode>(),
        killed: false,
      };
      children.push(child);
      yield* Effect.addFinalizer(() =>
        Effect.sync(() => {
          child.killed = true;
        }),
      );
      return ChildProcessSpawner.makeHandle({
        pid: ChildProcessSpawner.ProcessId(1000 + children.length),
        exitCode: Deferred.await(child.exit),
        isRunning: Effect.succeed(true),
        kill: () => Effect.void,
        unref: Effect.succeed(Effect.void),
        stdin: Sink.drain,
        stdout: Stream.empty,
        stderr: Stream.empty,
        all: Stream.empty,
        getInputFd: () => Sink.drain,
        getOutputFd: () => Stream.empty,
      });
    }),
  );

const waitFor = <A>(read: Effect.Effect<A>, done: (value: A) => boolean, ms = 2000) =>
  Effect.gen(function* () {
    const deadline = (yield* Clock.currentTimeMillis) + ms;
    while ((yield* Clock.currentTimeMillis) < deadline) {
      const value = yield* read;
      if (done(value)) return value;
      yield* Effect.sleep("10 millis");
    }
    return yield* Effect.die(new Error(`condition not met in ${ms} ms`));
  });

const withFake = (children: FakeChild[], options: Partial<ScribeSupervisor.SupervisorOptions>) =>
  ScribeSupervisor.makeWith({ bin: "engine.exe", startGrace: "0 millis", ...options }).pipe(
    Effect.provide(Layer.succeed(ChildProcessSpawner.ChildProcessSpawner, fakeSpawner(children))),
  );

it.live("reports unmanaged and spawns nothing without a binary", () =>
  Effect.gen(function* () {
    const children: FakeChild[] = [];
    const supervisor = yield* withFake(children, { bin: null });
    expect(yield* supervisor.current).toEqual({
      status: "unmanaged",
      restarts: 0,
      lastRestartAt: null,
    });
    expect(children).toHaveLength(0);
  }).pipe(Effect.scoped),
);

it.live("restarts a crashed engine within 2 seconds", () =>
  Effect.gen(function* () {
    const children: FakeChild[] = [];
    const supervisor = yield* withFake(children, {});
    yield* waitFor(supervisor.current, (p) => p.status === "running");
    const crashedAt = yield* Clock.currentTimeMillis;
    yield* Deferred.succeed(children[0]!.exit, ChildProcessSpawner.ExitCode(1));
    const after = yield* waitFor(
      supervisor.current,
      (p) => p.status === "running" && p.restarts === 1,
    );
    expect((yield* Clock.currentTimeMillis) - crashedAt).toBeLessThan(2000);
    expect(children).toHaveLength(2);
    expect(after.lastRestartAt).not.toBeNull();
  }).pipe(Effect.scoped),
);

it.live("backs off after repeated fast crashes", () =>
  Effect.gen(function* () {
    const children: FakeChild[] = [];
    const supervisor = yield* withFake(children, {
      restartDelay: "10 millis",
      maxFastCrashes: 3,
      backoff: "10 seconds",
    });
    for (let i = 0; i < 3; i += 1) {
      yield* waitFor(
        Effect.sync(() => children.length),
        (n) => n === i + 1,
      );
      yield* Deferred.succeed(children[i]!.exit, ChildProcessSpawner.ExitCode(1));
    }
    yield* Effect.sleep("300 millis");
    expect(children).toHaveLength(3);
    expect((yield* supervisor.current).status).toBe("crashed");
  }).pipe(Effect.scoped),
);

it.live("starts no second engine while one we did not start already answers", () =>
  Effect.gen(function* () {
    const children: FakeChild[] = [];
    let answering = true;
    const supervisor = yield* withFake(children, {
      healthy: Effect.sync(() => answering),
      healthEvery: "10 millis",
    });
    yield* Effect.sleep("150 millis");
    expect(children).toHaveLength(0);
    expect((yield* supervisor.current).status).toBe("running");
    answering = false;
    yield* waitFor(
      Effect.sync(() => children.length),
      (n) => n === 1,
    );
  }).pipe(Effect.scoped),
);

it.live("kills and restarts an engine that stops answering", () =>
  Effect.gen(function* () {
    const children: FakeChild[] = [];
    let answering = false;
    const supervisor = yield* withFake(children, {
      healthy: Effect.sync(() => answering),
      healthEvery: "10 millis",
      healthMisses: 3,
    });
    yield* waitFor(
      Effect.sync(() => children.length),
      (n) => n === 1,
    );
    answering = true;
    yield* waitFor(supervisor.current, (p) => p.status === "running");
    answering = false;
    yield* waitFor(
      Effect.sync(() => children.length),
      (n) => n === 2,
    );
    expect(children[0]!.killed).toBe(true);
    answering = true;
    yield* waitFor(supervisor.current, (p) => p.status === "running" && p.restarts === 1);
  }).pipe(Effect.scoped),
);

it.live("kills the engine when the server stops", () =>
  Effect.gen(function* () {
    const children: FakeChild[] = [];
    yield* Effect.scoped(
      Effect.gen(function* () {
        const supervisor = yield* withFake(children, {});
        yield* waitFor(supervisor.current, (p) => p.status === "running");
      }),
    );
    expect(children[0]!.killed).toBe(true);
  }),
);

it.live(
  "restarts a real process killed by its PID within 2 seconds",
  () =>
    Effect.gen(function* () {
      const pids: number[] = [];
      const real = yield* ChildProcessSpawner.ChildProcessSpawner;
      const recording = ChildProcessSpawner.make((command) =>
        Effect.tap(real.spawn(command), (handle) =>
          Effect.sync(() => pids.push(Number(handle.pid))),
        ),
      );
      const supervisor = yield* ScribeSupervisor.makeWith({
        bin: process.execPath,
        args: ["-e", "setInterval(() => {}, 1000)"],
        startGrace: "0 millis",
      }).pipe(Effect.provide(Layer.succeed(ChildProcessSpawner.ChildProcessSpawner, recording)));
      yield* waitFor(supervisor.current, (p) => p.status === "running");
      const killedAt = yield* Clock.currentTimeMillis;
      // Kill only the PID this test captured at spawn.
      process.kill(pids[0]!);
      yield* waitFor(supervisor.current, (p) => p.status === "running" && p.restarts === 1);
      expect((yield* Clock.currentTimeMillis) - killedAt).toBeLessThan(2000);
      expect(pids).toHaveLength(2);
      expect(pids[1]).not.toBe(pids[0]);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  15_000,
);

it("passes LEONIDAS_SCRIBE_ENGINE_CONFIG to the engine as --config", () => {
  expect(
    ScribeSupervisor.engineArgs({ LEONIDAS_SCRIBE_ENGINE_CONFIG: " C:/dev/config.json " }),
  ).toEqual(["--config", "C:/dev/config.json", "--parent-pid", String(process.pid)]);
  expect(ScribeSupervisor.engineArgs({ LEONIDAS_SCRIBE_ENGINE_CONFIG: "  " }, 7)).toEqual([
    "--parent-pid",
    "7",
  ]);
  expect(ScribeSupervisor.engineArgs({}, 7)).toEqual(["--parent-pid", "7"]);
});
