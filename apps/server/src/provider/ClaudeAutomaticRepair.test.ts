import { expect, it } from "@effect/vitest";
import type { ServerProvider } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import { makeClaudeAutomaticRepair } from "./ClaudeAutomaticRepair.ts";

const missing = (instanceId: string, patch: Partial<ServerProvider> = {}): ServerProvider =>
  ({
    instanceId,
    driver: "claudeAgent",
    enabled: true,
    installed: false,
    status: "error",
    message:
      "Claude is not installed yet.\nDetails: Claude Agent CLI (`claude`) was not found on PATH.",
    ...patch,
  }) as ServerProvider;

const accounts = { a: { config: {} }, b: { config: {} } };

it.effect("does not retry when the automatic operation fails to start", () =>
  Effect.gen(function* () {
    let attempts = 0;
    const repair = yield* makeClaudeAutomaticRepair(
      Effect.sync(() => {
        attempts++;
      }).pipe(Effect.andThen(Effect.fail("unavailable"))),
    );
    expect((yield* repair([missing("a")], accounts).pipe(Effect.result))._tag).toBe("Failure");
    yield* repair([missing("a")], accounts);
    expect(attempts).toBe(1);
  }),
);

it.effect("shares one automatic attempt across accounts and repeated failed checks", () =>
  Effect.gen(function* () {
    let attempts = 0;
    const repair = yield* makeClaudeAutomaticRepair(
      Effect.sync(() => {
        attempts++;
      }),
    );
    const providers = [missing("a"), missing("b")];
    yield* Effect.all([repair(providers, accounts), repair(providers, accounts)], {
      concurrency: "unbounded",
    });
    yield* repair(providers, accounts);
    expect(attempts).toBe(1);
  }),
);

it.effect("does not install for disabled accounts, custom paths, or authentication failures", () =>
  Effect.gen(function* () {
    let attempts = 0;
    const repair = yield* makeClaudeAutomaticRepair(
      Effect.sync(() => {
        attempts++;
      }),
    );
    yield* repair([missing("a")], {});
    yield* repair([missing("a", { enabled: false })], accounts);
    yield* repair([missing("a")], { a: { config: { binaryPath: "/custom/claude" } } });
    yield* repair([missing("a", { installed: true })], accounts);
    yield* repair([missing("a", { message: "Health check timed out." })], accounts);
    expect(attempts).toBe(0);
  }),
);

it.effect("allows one new attempt after a verified recovery and later disappearance", () =>
  Effect.gen(function* () {
    let attempts = 0;
    const repair = yield* makeClaudeAutomaticRepair(
      Effect.sync(() => {
        attempts++;
      }),
    );
    yield* repair([missing("a")], accounts);
    yield* repair([missing("a", { installed: true, status: "ready" })], accounts);
    yield* repair([missing("a")], accounts);
    expect(attempts).toBe(2);
  }),
);
