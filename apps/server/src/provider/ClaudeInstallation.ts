import { ProviderDriverKind, type ProviderInstallState } from "@t3tools/contracts";
import * as HostProcess from "@t3tools/shared/HostProcess";
import { resolveCommandPath, resolveSpawnCommand } from "@t3tools/shared/shell";
import * as Cause from "effect/Cause";
import * as Context from "effect/Context";
import * as Crypto from "effect/Crypto";
import type * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Fiber from "effect/Fiber";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as Semaphore from "effect/Semaphore";
import * as Stream from "effect/Stream";
import * as SubscriptionRef from "effect/SubscriptionRef";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

import { withClaudeUserBinOnPath } from "./Drivers/ClaudeExecutable.ts";

const DRIVER = ProviderDriverKind.make("claudeAgent");
const MESSAGE_TAIL = 400;
const VERSION_TIMEOUT = "20 seconds";
const INSTALL_TIMEOUT = "3 minutes";
const OUTPUT_GRACE = "2 seconds";

export class ClaudeInstallationError extends Schema.TaggedError<ClaudeInstallationError>()(
  "ClaudeInstallationError",
  { operation: Schema.String, detail: Schema.String },
) {}

const installationError = (operation: string, detail: string) =>
  new ClaudeInstallationError({ operation, detail });

/** The official installer command for each platform. Anthropic hosts both scripts. */
export const claudeInstallerCommand = (
  platform: NodeJS.Platform,
): { readonly command: string; readonly args: ReadonlyArray<string> } =>
  platform === "win32"
    ? {
        command: "powershell.exe",
        args: [
          "-NoProfile",
          "-NonInteractive",
          "-ExecutionPolicy",
          "Bypass",
          "-Command",
          "irm https://claude.ai/install.ps1 | iex",
        ],
      }
    : { command: "bash", args: ["-c", "curl -fsSL https://claude.ai/install.sh | bash"] };

/** First line of `claude --version` output, for example `2.1.300 (Claude Code)`. */
export const parseClaudeVersion = (output: string): string | null =>
  /(\d+\.\d+\.\d+(?:-[\w.-]+)?)/u.exec(output)?.[1] ?? null;

interface ClaudeInstallationService {
  readonly start: Effect.Effect<ProviderInstallState, ClaudeInstallationError>;
  readonly cancel: (
    operationId: string,
  ) => Effect.Effect<ProviderInstallState, ClaudeInstallationError>;
  readonly state: Effect.Effect<ProviderInstallState>;
  readonly changes: Stream.Stream<ProviderInstallState>;
  readonly remove: (
    protectedBinaryPaths?: ReadonlyArray<string>,
  ) => Effect.Effect<void, ClaudeInstallationError>;
}

export class ClaudeInstallation extends Context.Service<
  ClaudeInstallation,
  ClaudeInstallationService
>()("t3/provider/ClaudeInstallation") {
  static readonly layer = Layer.effect(
    ClaudeInstallation,
    Effect.suspend(() => makeClaudeInstallation()),
  );
}

const isRunning = (state: ProviderInstallState) =>
  ["downloading", "extracting", "verifying"].includes(state.phase);

/**
 * Installs Claude with the official installer, so a new user never opens a
 * terminal. Leonidas does not own the files: Claude updates itself, and
 * removal stays with the user.
 */
const makeClaudeInstallation = Effect.fn("makeClaudeInstallation")(function* () {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const crypto = yield* Crypto.Crypto;
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const serviceScope = yield* Effect.scope;
  const platform = yield* HostProcess.Platform;
  const home = yield* HostProcess.HomeDirectory;
  const environment = yield* HostProcess.Environment;
  const env = withClaudeUserBinOnPath(environment, home, platform);
  const gate = yield* Semaphore.make(1);
  let running: { readonly operationId: string; readonly fiber: Fiber.Fiber<void> } | undefined;
  const state = yield* SubscriptionRef.make<ProviderInstallState>({
    driver: DRIVER,
    operationId: null,
    phase: "idle",
    downloadedBytes: 0,
    totalBytes: null,
    version: null,
    installedVersion: null,
    executablePath: null,
    source: null,
    canRemove: false,
    message: null,
  });

  /**
   * Run a command and collect its output. On Windows an npm `claude.cmd`
   * launcher cannot start without a shell, so resolve it first. Spawn
   * defects become failures, so callers can show a plain message.
   */
  const run = (command: string, args: ReadonlyArray<string>, limit: Duration.Input) =>
    Effect.scoped(
      Effect.gen(function* () {
        const resolved = yield* resolveSpawnCommand(command, args, { env }).pipe(
          Effect.provideService(HostProcess.Platform, platform),
          Effect.provideService(HostProcess.Environment, environment),
          Effect.provideService(FileSystem.FileSystem, fileSystem),
          Effect.provideService(Path.Path, path),
        );
        const child = yield* spawner.spawn(
          ChildProcess.make(resolved.command, resolved.args, {
            env,
            shell: resolved.shell,
            stdin: "ignore",
          }),
        );
        const collect = (stream: Stream.Stream<Uint8Array, unknown>) =>
          stream.pipe(
            Stream.decodeText(),
            Stream.mkString,
            Effect.orElseSucceed(() => ""),
          );
        const stdout = yield* Effect.forkScoped(collect(child.stdout));
        const stderr = yield* Effect.forkScoped(collect(child.stderr));
        const exitCode = yield* child.exitCode.pipe(Effect.timeout(limit));
        // A helper the installer leaves running can keep the pipes open, so
        // wait for the output only briefly after the process has exited.
        const drain = (fiber: Fiber.Fiber<string>) =>
          Fiber.join(fiber).pipe(
            Effect.timeout(OUTPUT_GRACE),
            Effect.orElseSucceed(() => ""),
          );
        return {
          stdout: yield* drain(stdout),
          stderr: yield* drain(stderr),
          exitCode: Number(exitCode),
        };
      }),
    ).pipe(
      Effect.catchCause(() => Effect.fail(installationError("run", `Could not start ${command}.`))),
    );

  /** Find an installed Claude and read its version. `null` when none works. */
  const detect = Effect.gen(function* () {
    const executablePath = yield* resolveCommandPath("claude", { env }).pipe(
      Effect.provideService(FileSystem.FileSystem, fileSystem),
      Effect.provideService(Path.Path, path),
      Effect.orElseSucceed(() => null),
    );
    if (!executablePath) return null;
    const result = yield* run(executablePath, ["--version"], VERSION_TIMEOUT).pipe(
      Effect.orElseSucceed(() => null),
    );
    const version = result?.exitCode === 0 ? parseClaudeVersion(result.stdout) : null;
    return version ? { executablePath, version } : null;
  });

  const install = Effect.fn("ClaudeInstallation.install")(function* (operationId: string) {
    const installer = claudeInstallerCommand(platform);
    const result = yield* run(installer.command, installer.args, INSTALL_TIMEOUT).pipe(
      Effect.catch(() =>
        // The installer may finish its work and still not exit. Trust the result.
        detect.pipe(
          Effect.flatMap((found) =>
            found
              ? Effect.succeed({ stdout: "", stderr: "", exitCode: 0 })
              : Effect.fail(
                  installationError(
                    "install",
                    "The Claude installer took too long. Check your internet connection, then try again.",
                  ),
                ),
          ),
        ),
      ),
    );
    if (result.exitCode !== 0) {
      const tail = (result.stderr || result.stdout).trim().slice(-MESSAGE_TAIL);
      return yield* installationError(
        "install",
        `The Claude installer stopped with an error.${tail ? ` ${tail}` : ""}`,
      );
    }
    yield* SubscriptionRef.update(state, (current): ProviderInstallState =>
      current.operationId === operationId
        ? { ...current, phase: "verifying", message: "Checking Claude." }
        : current,
    );
    const found = yield* detect;
    if (!found) {
      return yield* installationError(
        "verify",
        "Claude installed, but Leonidas cannot start it. Restart Leonidas, then try again.",
      );
    }
    yield* SubscriptionRef.update(state, (current): ProviderInstallState =>
      current.operationId === operationId
        ? {
            ...current,
            phase: "succeeded",
            installedVersion: found.version,
            version: found.version,
            executablePath: found.executablePath,
            source: "local",
            message: "Claude is installed.",
          }
        : current,
    );
  });

  const start = gate
    .withPermit(
      Effect.gen(function* () {
        const current = yield* SubscriptionRef.get(state);
        if (isRunning(current)) return current;
        const existing = yield* detect;
        if (existing) {
          const ready: ProviderInstallState = {
            ...current,
            operationId: null,
            phase: "succeeded",
            installedVersion: existing.version,
            version: existing.version,
            executablePath: existing.executablePath,
            source: "local",
            message: "Claude is already installed.",
          };
          yield* SubscriptionRef.set(state, ready);
          return ready;
        }
        const operationId = yield* crypto.randomUUIDv4;
        const next: ProviderInstallState = {
          ...current,
          operationId,
          phase: "downloading",
          downloadedBytes: 0,
          totalBytes: null,
          message: "Installing Claude.",
        };
        yield* SubscriptionRef.set(state, next);
        const work = install(operationId).pipe(
          Effect.onExit((exit) =>
            Exit.isFailure(exit)
              ? SubscriptionRef.update(state, (value) => {
                  if (value.operationId !== operationId || value.phase === "succeeded") {
                    return value;
                  }
                  const error = Cause.findErrorOption(exit.cause);
                  const cancelled = Cause.hasInterruptsOnly(exit.cause);
                  return {
                    ...value,
                    phase: cancelled ? "cancelled" : "failed",
                    message: cancelled
                      ? "Installation cancelled."
                      : Option.isSome(error)
                        ? error.value.detail
                        : "Could not install Claude. Check your internet connection, then try again.",
                  } satisfies ProviderInstallState;
                })
              : Effect.void,
          ),
          Effect.ignoreCause,
          Effect.ensuring(
            Effect.sync(() => {
              if (running?.operationId === operationId) running = undefined;
            }),
          ),
        );
        const fiber = yield* Effect.forkIn(Effect.interruptible(work), serviceScope);
        running = { operationId, fiber };
        return next;
      }).pipe(Effect.uninterruptible),
    )
    .pipe(
      Effect.mapError(() => installationError("start", "Could not start the Claude installation.")),
    );

  const cancel = Effect.fn("ClaudeInstallation.cancel")(function* (operationId: string) {
    return yield* gate.withPermit(
      Effect.gen(function* () {
        const current = yield* SubscriptionRef.get(state);
        if (current.operationId !== operationId) {
          return yield* installationError(
            "cancel",
            "This installation is no longer current. Refresh its status before cancelling.",
          );
        }
        if (running?.operationId === operationId && isRunning(current)) {
          yield* Fiber.interrupt(running.fiber);
        }
        return yield* SubscriptionRef.get(state);
      }),
    );
  });

  const remove = () =>
    Effect.fail(
      installationError(
        "remove",
        "Leonidas does not remove Claude. Uninstall it from your system settings.",
      ),
    );

  return {
    start,
    cancel,
    remove,
    state: SubscriptionRef.get(state),
    changes: SubscriptionRef.changes(state),
  } satisfies ClaudeInstallationService;
});
