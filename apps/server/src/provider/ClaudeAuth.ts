import {
  ProviderSetupError,
  type ClaudeSettings,
  type ProviderAuthState,
  type ProviderInstanceId,
} from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import * as Clock from "effect/Clock";
import * as Crypto from "effect/Crypto";
import * as DateTime from "effect/DateTime";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Fiber from "effect/Fiber";
import * as Option from "effect/Option";
import type * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as Scope from "effect/Scope";
import * as Stream from "effect/Stream";
import * as SubscriptionRef from "effect/SubscriptionRef";
import { ChildProcess, ChildProcessSpawner } from "effect/process";
import { resolveSpawnCommand } from "@t3tools/shared/shell";
import { spawnAndCollect } from "@t3tools/provider-core/server/snapshotProbe";
import type { ProviderAuthController } from "./ProviderAuthService.ts";
import { makeClaudeEnvironment } from "./Drivers/ClaudeHome.ts";

const isSetupError = Schema.is(ProviderSetupError);

/** The browser sign-in has five minutes to finish. */
const CLAUDE_AUTH_TIMEOUT_MS = 300_000;
/** The start method that signs in again even when Claude already has a login. */
const CLAUDE_AUTH_FORCE_METHOD_ID = "force";

const MAX_OUTPUT_BUFFER = 65_536;
const MAX_URL_LENGTH = 16_384;
// Claude prints its own sign-in page. Show no other host as a sign-in link.
const ALLOWED_HOST_SUFFIXES = ["claude.ai", "claude.com", "anthropic.com"] as const;
// eslint-disable-next-line no-control-regex -- ANSI escape codes start with the ESC control character.
const ANSI_PATTERN = /\u001b\[[0-9;?]*[ -/]*[@-~]|\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)/g;
const URL_PATTERN = /https:\/\/[^\s"'<>`]+/g;

const decodeStatus = Schema.decodeUnknownOption(
  Schema.fromJsonString(Schema.Struct({ loggedIn: Schema.optional(Schema.Boolean) })),
);

function stripAnsi(text: string): string {
  return text.replace(ANSI_PATTERN, "");
}

function isAllowedHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return ALLOWED_HOST_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
}

/** Return the first Claude sign-in page the CLI printed, or null. */
export function parseClaudeAuthorizationUrl(output: string): string | null {
  const text = stripAnsi(output);
  for (const match of text.matchAll(URL_PATTERN)) {
    const candidate = match[0].replace(/[.,;:)\]}]+$/u, "");
    if (candidate.length > MAX_URL_LENGTH) continue;
    try {
      const url = new URL(candidate);
      if (url.protocol === "https:" && isAllowedHost(url.hostname)) return url.toString();
    } catch {
      continue;
    }
  }
  return null;
}

/** Read `loggedIn` from the JSON that `claude auth status` prints. */
export function parseClaudeAuthStatus(stdout: string): boolean {
  const start = stdout.indexOf("{");
  if (start < 0) return false;
  const decoded = decodeStatus(stdout.slice(start).trim());
  return decoded._tag === "Some" && decoded.value.loggedIn === true;
}

export interface ClaudeLoginProcess {
  /** Text from stdout and stderr, in the order Claude wrote it. */
  readonly output: Stream.Stream<string>;
  readonly exitCode: Effect.Effect<number>;
}

export interface ClaudeAuthOptions {
  readonly instanceId: ProviderInstanceId;
  /** Starts `claude auth login`. Closing the scope must stop that child process. */
  readonly spawnLogin: Effect.Effect<ClaudeLoginProcess, ProviderSetupError, Scope.Scope>;
  /** True when `claude auth status` reports loggedIn. */
  readonly checkLoggedIn: Effect.Effect<boolean>;
  /** Runs `claude auth logout`. */
  readonly signOut: Effect.Effect<void, ProviderSetupError>;
  /** Refresh the provider snapshot after the login changed. */
  readonly onAuthenticated: Effect.Effect<void>;
  readonly credentialKey: string;
  readonly timeoutMs?: number;
}

interface AuthFlow {
  readonly id: string;
  readonly ownerSessionId: string;
  state: ProviderAuthState;
  fiber: Fiber.Fiber<void> | undefined;
}

interface AuthSnapshot {
  readonly ownerSessionId: string | null;
  readonly state: ProviderAuthState;
}

const BUSY_PHASES: ReadonlySet<string> = new Set(["starting", "waiting", "verifying"]);

function visibleSnapshot(snapshot: AuthSnapshot, ownerSessionId: string): ProviderAuthState {
  if (snapshot.ownerSessionId === null || snapshot.ownerSessionId === ownerSessionId) {
    return snapshot.state;
  }
  return {
    ...snapshot.state,
    flowId: null,
    authorizationUrl: null,
    expiresAt: null,
    ...(BUSY_PHASES.has(snapshot.state.phase)
      ? { message: "Sign-in is in progress in another client." }
      : {}),
  };
}

/** Owns one Claude instance's browser sign-in through `claude auth login`. */
export const makeClaudeAuth = Effect.fn("makeClaudeAuth")(function* (
  options: ClaudeAuthOptions,
): Effect.fn.Return<ProviderAuthController, never, Crypto.Crypto | Scope.Scope> {
  const crypto = yield* Crypto.Crypto;
  const instanceScope = yield* Scope.Scope;
  const timeoutMs = options.timeoutMs ?? CLAUDE_AUTH_TIMEOUT_MS;
  const closed = yield* Deferred.make<void>();
  const emptyState: ProviderAuthState = {
    instanceId: options.instanceId,
    phase: "idle",
    flowId: null,
    authorizationUrl: null,
    expiresAt: null,
    message: null,
  };
  const snapshot = yield* SubscriptionRef.make<AuthSnapshot>({
    ownerSessionId: null,
    state: emptyState,
  });
  let activeFlow: AuthFlow | undefined;
  let signingOut = false;

  const setupError = (operation: string, detail: string) =>
    new ProviderSetupError({ instanceId: options.instanceId, operation, detail });

  // A flow that is no longer active can never change the shown state.
  const publish = (flow: AuthFlow, state: ProviderAuthState) =>
    Effect.suspend(() => {
      if (activeFlow !== flow) return Effect.void;
      flow.state = state;
      return SubscriptionRef.set(snapshot, { ownerSessionId: flow.ownerSessionId, state });
    });

  const settle = (
    flow: AuthFlow,
    phase: "succeeded" | "failed" | "cancelled",
    message: string,
  ): Effect.Effect<void> =>
    Effect.suspend(() => {
      if (activeFlow !== flow) return Effect.void;
      activeFlow = undefined;
      const state: ProviderAuthState = {
        ...flow.state,
        phase,
        authorizationUrl: null,
        expiresAt: null,
        message,
      };
      flow.state = state;
      return SubscriptionRef.set(snapshot, { ownerSessionId: flow.ownerSessionId, state });
    });

  const finishSignedIn = (flow: AuthFlow) =>
    options.onAuthenticated.pipe(Effect.andThen(settle(flow, "succeeded", "Claude is connected.")));

  const runSignIn = (flow: AuthFlow) =>
    Effect.gen(function* () {
      const login = yield* options.spawnLogin;
      yield* publish(flow, {
        ...flow.state,
        phase: "waiting",
        message: "Finish signing in in your browser.",
      });
      let buffer = "";
      let urlShown = false;
      const reader = yield* login.output.pipe(
        Stream.runForEach((chunk) =>
          Effect.suspend(() => {
            if (urlShown) return Effect.void;
            buffer = (buffer + chunk).slice(-MAX_OUTPUT_BUFFER);
            const url = parseClaudeAuthorizationUrl(buffer);
            if (url === null) return Effect.void;
            urlShown = true;
            return publish(flow, { ...flow.state, authorizationUrl: url });
          }),
        ),
        Effect.ignore,
        Effect.forkScoped,
      );
      const code = yield* login.exitCode;
      yield* Fiber.join(reader).pipe(Effect.timeoutOption("1 second"), Effect.ignore);
      if (code !== 0) {
        return yield* setupError("start", "Claude sign-in did not finish. Start sign-in again.");
      }
      yield* publish(flow, {
        ...flow.state,
        phase: "verifying",
        authorizationUrl: null,
        message: "Checking your Claude sign-in.",
      });
      if (!(yield* options.checkLoggedIn)) {
        return yield* setupError(
          "start",
          "Claude did not confirm the sign-in. Start sign-in again.",
        );
      }
    }).pipe(
      Effect.scoped,
      Effect.timeoutOrElse({
        duration: timeoutMs,
        orElse: () =>
          Effect.fail(setupError("start", "Claude sign-in expired. Start sign-in again.")),
      }),
      Effect.exit,
      Effect.flatMap((result) =>
        Exit.isSuccess(result)
          ? finishSignedIn(flow)
          : settle(
              flow,
              "failed",
              Exit.isFailure(result)
                ? failureMessage(result.cause)
                : "Claude sign-in failed. Start sign-in again.",
            ),
      ),
    );

  const requireFlow = (ownerSessionId: string, flowId: string, operation: string) =>
    Effect.suspend(() => {
      const flow = activeFlow;
      if (!flow || flow.id !== flowId || flow.ownerSessionId !== ownerSessionId) {
        return Effect.fail(
          setupError(operation, "This sign-in is no longer active in this client."),
        );
      }
      return Effect.succeed(flow);
    });

  const controller: ProviderAuthController = {
    credentialBinding: { owner: "provider", key: options.credentialKey },
    isChangingCredentials: Effect.sync(() => activeFlow !== undefined || signingOut),
    start: (ownerSessionId, _stopSessions, methodId) =>
      Effect.uninterruptible(
        Effect.gen(function* () {
          if (activeFlow?.ownerSessionId === ownerSessionId) return activeFlow.state;
          if (activeFlow || signingOut) {
            return yield* setupError("start", "Claude sign-in is already in progress.");
          }
          const flowId = yield* crypto.randomUUIDv4.pipe(
            Effect.mapError(() =>
              setupError("start", "Could not start Claude sign-in. Try again."),
            ),
          );
          const now = yield* Clock.currentTimeMillis;
          const expiresAtMillis = now + timeoutMs;
          const flow: AuthFlow = {
            id: flowId,
            ownerSessionId,
            fiber: undefined,
            state: {
              ...emptyState,
              phase: "starting",
              flowId,
              expiresAt: DateTime.formatIso(DateTime.makeUnsafe(expiresAtMillis)),
              message: "Starting Claude sign-in.",
            },
          };
          activeFlow = flow;
          yield* SubscriptionRef.set(snapshot, { ownerSessionId, state: flow.state });
          // A login that already works is reused: no browser, no second sign-in.
          const reuse =
            methodId === CLAUDE_AUTH_FORCE_METHOD_ID
              ? Effect.succeed(false)
              : options.checkLoggedIn;
          flow.fiber = yield* reuse.pipe(
            Effect.flatMap((loggedIn) => (loggedIn ? finishSignedIn(flow) : runSignIn(flow))),
            Effect.interruptible,
            Effect.forkIn(instanceScope),
          );
          return flow.state;
        }),
      ),
    complete: (_ownerSessionId, _input) =>
      Effect.fail(setupError("complete", "Claude finishes sign-in in the browser.")),
    cancel: Effect.fn("ClaudeAuth.cancel")(function* (ownerSessionId, flowId) {
      const flow = yield* requireFlow(ownerSessionId, flowId, "cancel");
      yield* settle(flow, "cancelled", "Claude sign-in was cancelled.");
      // Closing the flow scope stops the one child process this flow started.
      if (flow.fiber) yield* Fiber.interrupt(flow.fiber);
      return flow.state;
    }),
    logout: Effect.fn("ClaudeAuth.logout")(function* (stopSessions) {
      if (activeFlow || signingOut) {
        return yield* setupError("logout", "Claude setup is already in progress.");
      }
      signingOut = true;
      yield* stopSessions.pipe(
        Effect.andThen(options.signOut),
        Effect.andThen(options.onAuthenticated),
        Effect.ensuring(
          Effect.sync(() => {
            signingOut = false;
          }),
        ),
      );
      const state: ProviderAuthState = { ...emptyState, message: "Signed out of Claude." };
      yield* SubscriptionRef.set(snapshot, { ownerSessionId: null, state });
      return state;
    }),
    subscribe: (ownerSessionId) =>
      SubscriptionRef.changes(snapshot).pipe(
        Stream.map((value) => {
          const state = visibleSnapshot(value, ownerSessionId);
          return {
            ...state,
            credentialOwner: "provider" as const,
            interaction:
              state.phase === "waiting" && state.authorizationUrl && state.flowId
                ? {
                    type: "browser" as const,
                    id: state.flowId,
                    url: state.authorizationUrl,
                    requiresConsent: false,
                    acceptsCallback: false,
                  }
                : null,
          };
        }),
        Stream.interruptWhen(Deferred.await(closed)),
      ),
  };

  yield* Effect.addFinalizer(() =>
    Effect.gen(function* () {
      const flow = activeFlow;
      activeFlow = undefined;
      if (flow?.fiber) yield* Fiber.interrupt(flow.fiber);
      yield* Deferred.succeed(closed, undefined);
    }),
  );

  return controller;
});

function failureMessage(cause: Cause.Cause<unknown>): string {
  const error = Cause.findErrorOption(cause);
  return Option.isSome(error) && isSetupError(error.value)
    ? error.value.detail
    : "Claude sign-in failed. Start sign-in again.";
}

/**
 * Real Claude commands for one instance. They use the same binary, PATH and
 * CLAUDE_CONFIG_DIR as the health check, and they open no console window.
 */
export const makeClaudeAuthCommands = Effect.fn("makeClaudeAuthCommands")(function* (
  settings: Pick<ClaudeSettings, "binaryPath" | "homePath">,
  baseEnvironment: NodeJS.ProcessEnv,
  instanceId: ProviderInstanceId,
): Effect.fn.Return<
  Pick<ClaudeAuthOptions, "spawnLogin" | "checkLoggedIn" | "signOut">,
  never,
  ChildProcessSpawner.ChildProcessSpawner | Path.Path
> {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const environment = yield* makeClaudeEnvironment(settings, baseEnvironment);
  const failure = (operation: string, detail: string) =>
    new ProviderSetupError({ instanceId, operation, detail });
  const buildCommand = (args: ReadonlyArray<string>) =>
    resolveSpawnCommand(settings.binaryPath, args, { env: environment }).pipe(
      Effect.map((spawn) =>
        ChildProcess.make(spawn.command, spawn.args, {
          env: environment,
          shell: spawn.shell,
          windowsHide: true,
        }),
      ),
    );

  const spawnLogin = Effect.gen(function* () {
    const command = yield* buildCommand(["auth", "login", "--claudeai"]);
    const child = yield* spawner
      .spawn(command)
      .pipe(
        Effect.mapError(() =>
          failure(
            "start",
            "Leonidas could not start Claude. Install Claude, then start sign-in again.",
          ),
        ),
      );
    const decoder = (stream: Stream.Stream<Uint8Array, unknown>) =>
      stream.pipe(
        Stream.decodeText(),
        Stream.catch(() => Stream.empty),
      );
    return {
      output: Stream.merge(decoder(child.stdout), decoder(child.stderr)),
      exitCode: child.exitCode.pipe(
        Effect.map(Number),
        Effect.orElseSucceed(() => -1),
      ),
    } satisfies ClaudeLoginProcess;
  });

  const checkLoggedIn = buildCommand(["auth", "status"]).pipe(
    Effect.flatMap((command) => spawnAndCollect(settings.binaryPath, command)),
    Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, spawner),
    Effect.timeout("20 seconds"),
    Effect.map((result) => result.code === 0 && parseClaudeAuthStatus(result.stdout)),
    Effect.orElseSucceed(() => false),
  );

  const signOut = buildCommand(["auth", "logout"]).pipe(
    Effect.flatMap((command) => spawnAndCollect(settings.binaryPath, command)),
    Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, spawner),
    Effect.timeout("30 seconds"),
    Effect.mapError(() => failure("logout", "Claude sign-out failed. Try again.")),
    Effect.flatMap((result) =>
      result.code === 0
        ? Effect.void
        : Effect.fail(failure("logout", "Claude sign-out failed. Try again.")),
    ),
  );

  return { spawnLogin, checkLoggedIn, signOut };
});
