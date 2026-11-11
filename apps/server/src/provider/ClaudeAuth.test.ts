import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, describe, it } from "@effect/vitest";
import { ProviderInstanceId, type ProviderAuthState } from "@t3tools/contracts";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Option from "effect/Option";
import * as Stream from "effect/Stream";
import * as TestClock from "effect/testing/TestClock";

import {
  makeClaudeAuth,
  parseClaudeAuthStatus,
  parseClaudeAuthorizationUrl,
  type ClaudeAuthOptions,
} from "./ClaudeAuth.ts";
import type { ProviderAuthController } from "./ProviderAuthService.ts";

const instanceId = ProviderInstanceId.make("claude-auth-test");
const owner = "t3-auth-session-owner";
const otherOwner = "t3-auth-session-other";
const signInUrl =
  "https://claude.ai/oauth/authorize?code=true&client_id=test-client&response_type=code&state=abc";

describe("parseClaudeAuthorizationUrl", () => {
  it("finds the sign-in page in plain output", () => {
    const output = `Opening browser to sign in...\nIf the browser does not open, visit: ${signInUrl}\n`;
    assert.equal(parseClaudeAuthorizationUrl(output), signInUrl);
  });

  it("ignores color codes and trailing punctuation", () => {
    const output = `\u001b[1mVisit\u001b[0m \u001b[4m${signInUrl}\u001b[24m.`;
    assert.equal(parseClaudeAuthorizationUrl(output), signInUrl);
  });

  it("skips a host that Claude does not own", () => {
    const output = `See https://example.com/help then ${signInUrl}`;
    assert.equal(parseClaudeAuthorizationUrl(output), signInUrl);
    assert.isNull(parseClaudeAuthorizationUrl("Open https://evil.example/claude.ai now"));
    assert.isNull(parseClaudeAuthorizationUrl("Open http://claude.ai/login now"));
  });

  it("returns null when there is no link", () => {
    assert.isNull(parseClaudeAuthorizationUrl("Waiting for sign-in..."));
    assert.isNull(parseClaudeAuthorizationUrl(""));
  });
});

describe("parseClaudeAuthStatus", () => {
  it("reads loggedIn from the status JSON", () => {
    assert.isTrue(parseClaudeAuthStatus('{\n  "loggedIn": true,\n  "authMethod": "claude.ai"\n}'));
    assert.isFalse(parseClaudeAuthStatus('{"loggedIn": false}'));
  });

  it("is false for output that is not the status JSON", () => {
    assert.isFalse(parseClaudeAuthStatus(""));
    assert.isFalse(parseClaudeAuthStatus("Not logged in"));
    assert.isFalse(parseClaudeAuthStatus('{"email": "a@b.c"}'));
  });
});

const phase = (
  auth: ProviderAuthController,
  value: ProviderAuthState["phase"],
  sessionId = owner,
) =>
  auth.subscribe(sessionId).pipe(
    Stream.filter((state) => state.phase === value),
    Stream.runHead,
    Effect.map(Option.getOrThrow),
  );

const makeHarness = Effect.fn("makeClaudeAuthHarness")(function* (
  options: {
    /** Answers to `claude auth status`, in order. The last one repeats. */
    readonly loggedIn?: ReadonlyArray<boolean>;
    readonly output?: ReadonlyArray<string>;
    readonly callbackPort?: number | null;
  } = {},
) {
  const exit = yield* Deferred.make<number>();
  const counts = { spawned: 0, closed: 0, authenticated: 0, checks: 0 };
  const answers = options.loggedIn ?? [false, true];
  const spawnLogin: ClaudeAuthOptions["spawnLogin"] = Effect.acquireRelease(
    Effect.sync(() => {
      counts.spawned += 1;
      return {
        output: Stream.fromIterable(options.output ?? [`Visit ${signInUrl}\n`]),
        exitCode: Deferred.await(exit),
        callbackPort: Effect.succeed(options.callbackPort ?? null),
      };
    }),
    () =>
      Effect.sync(() => {
        counts.closed += 1;
      }),
  );
  const auth = yield* makeClaudeAuth({
    instanceId,
    credentialKey: "claude:home:test",
    spawnLogin,
    checkLoggedIn: Effect.sync(() => {
      const answer = answers[Math.min(counts.checks, answers.length - 1)] ?? false;
      counts.checks += 1;
      return answer;
    }),
    signOut: Effect.void,
    onAuthenticated: Effect.sync(() => {
      counts.authenticated += 1;
    }),
  });
  return { auth, exit, counts };
});

it.layer(NodeServices.layer)("ClaudeAuth", (it) => {
  const shownUrl = (harness: Effect.Success<ReturnType<typeof makeHarness>>) =>
    harness.auth.subscribe(owner).pipe(
      Stream.filter((state) => state.phase === "waiting" && state.authorizationUrl !== null),
      Stream.runHead,
      Effect.map((state) => new URL(Option.getOrThrow(state).authorizationUrl!)),
    );

  it.effect("shows the page that returns to Claude's local port, so no code is needed", () =>
    Effect.gen(function* () {
      const harness = yield* makeHarness({
        output: [
          `If the browser didn't open, visit: ${signInUrl}&redirect_uri=https%3A%2F%2Fplatform.claude.com%2Foauth%2Fcode%2Fcallback
`,
        ],
        callbackPort: 58807,
      });
      yield* harness.auth.start(owner);
      const url = yield* shownUrl(harness);
      assert.equal(url.searchParams.get("redirect_uri"), "http://localhost:58807/callback");
      assert.equal(url.searchParams.get("state"), "abc");
    }),
  );

  it.effect("keeps the code page when the local port is unknown", () =>
    Effect.gen(function* () {
      const harness = yield* makeHarness({ callbackPort: null });
      yield* harness.auth.start(owner);
      assert.equal((yield* shownUrl(harness)).toString(), signInUrl);
    }),
  );

  it.effect(
    "shows the sign-in page, then succeeds when the CLI exits 0 and status says loggedIn",
    () =>
      Effect.gen(function* () {
        const harness = yield* makeHarness();
        const started = yield* harness.auth.start(owner);
        assert.equal(started.phase, "starting");
        const waiting = yield* harness.auth.subscribe(owner).pipe(
          Stream.filter((state) => state.phase === "waiting" && state.authorizationUrl !== null),
          Stream.runHead,
          Effect.map(Option.getOrThrow),
        );
        assert.equal(waiting.authorizationUrl, signInUrl);
        assert.equal(waiting.message, "Finish signing in in your browser.");
        assert.equal(waiting.interaction?.type, "browser");
        yield* Deferred.succeed(harness.exit, 0);
        const done = yield* phase(harness.auth, "succeeded");
        assert.isNull(done.authorizationUrl);
        assert.equal(harness.counts.spawned, 1);
        assert.equal(harness.counts.closed, 1);
        assert.equal(harness.counts.authenticated, 1);
        // One check before the browser opens, one after the CLI exits.
        assert.equal(harness.counts.checks, 2);
      }),
  );

  it.effect("fails when the CLI exits 0 but status does not say loggedIn", () =>
    Effect.gen(function* () {
      const harness = yield* makeHarness({ loggedIn: [false] });
      yield* harness.auth.start(owner);
      yield* phase(harness.auth, "waiting");
      yield* Deferred.succeed(harness.exit, 0);
      const failed = yield* phase(harness.auth, "failed");
      assert.include(failed.message ?? "", "did not confirm");
      assert.equal(harness.counts.authenticated, 0);
      assert.equal(harness.counts.closed, 1);
    }),
  );

  it.effect("fails when the CLI exits with an error", () =>
    Effect.gen(function* () {
      const harness = yield* makeHarness();
      yield* harness.auth.start(owner);
      yield* phase(harness.auth, "waiting");
      yield* Deferred.succeed(harness.exit, 1);
      const failed = yield* phase(harness.auth, "failed");
      assert.include(failed.message ?? "", "did not finish");
      assert.equal(harness.counts.authenticated, 0);
      // Status is read once before sign-in and never after a failed exit.
      assert.equal(harness.counts.checks, 1);
    }),
  );

  it.effect("reuses a login that already works without starting the CLI", () =>
    Effect.gen(function* () {
      const harness = yield* makeHarness({ loggedIn: [true] });
      yield* harness.auth.start(owner);
      yield* phase(harness.auth, "succeeded");
      assert.equal(harness.counts.spawned, 0);
      assert.equal(harness.counts.authenticated, 1);
    }),
  );

  it.effect("signs in again on request even when a login exists", () =>
    Effect.gen(function* () {
      const harness = yield* makeHarness({ loggedIn: [true] });
      yield* harness.auth.start(owner, undefined, "force");
      yield* phase(harness.auth, "waiting");
      assert.equal(harness.counts.spawned, 1);
    }),
  );

  it.effect("cancel stops only the child it started and clears the link", () =>
    Effect.gen(function* () {
      const harness = yield* makeHarness();
      const started = yield* harness.auth.start(owner);
      yield* phase(harness.auth, "waiting");
      const wrongOwner = yield* harness.auth.cancel(otherOwner, started.flowId!).pipe(Effect.exit);
      assert.isTrue(Exit.isFailure(wrongOwner));
      assert.equal(harness.counts.closed, 0);
      const cancelled = yield* harness.auth.cancel(owner, started.flowId!);
      assert.equal(cancelled.phase, "cancelled");
      assert.isNull(cancelled.authorizationUrl);
      assert.equal(harness.counts.closed, 1);
      assert.equal(harness.counts.authenticated, 0);
      // A late exit cannot turn a cancelled flow into a success.
      yield* Deferred.succeed(harness.exit, 0);
      const settled = yield* phase(harness.auth, "cancelled");
      assert.equal(settled.phase, "cancelled");
    }),
  );

  it.effect("expires after five minutes and stops the child", () =>
    Effect.gen(function* () {
      const harness = yield* makeHarness();
      yield* harness.auth.start(owner);
      yield* phase(harness.auth, "waiting");
      yield* TestClock.adjust("300 seconds");
      const failed = yield* phase(harness.auth, "failed");
      assert.include(failed.message ?? "", "expired");
      assert.isNull(failed.authorizationUrl);
      assert.equal(harness.counts.closed, 1);
    }),
  );

  it.effect("keeps one flow per client and hides the link from another client", () =>
    Effect.gen(function* () {
      const harness = yield* makeHarness();
      const first = yield* harness.auth.start(owner);
      const again = yield* harness.auth.start(owner);
      assert.equal(again.flowId, first.flowId);
      const rival = yield* harness.auth.start(otherOwner).pipe(Effect.exit);
      assert.isTrue(Exit.isFailure(rival));
      const seen = yield* harness.auth.subscribe(otherOwner).pipe(Stream.runHead);
      assert.isNull(Option.getOrThrow(seen).authorizationUrl);
      assert.equal(harness.counts.spawned, 1);
    }),
  );
});
