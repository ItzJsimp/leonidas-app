// @effect-diagnostics nodeBuiltinImport:off
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import * as HostProcess from "@t3tools/shared/HostProcess";
import { SpawnExecutableResolution } from "@t3tools/shared/shell";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";

/**
 * Windows launcher-script extensions that Node cannot spawn without a shell
 * (`spawn EINVAL` since Node 20.12) and that the Claude Agent SDK therefore
 * cannot use as `pathToClaudeCodeExecutable`.
 */
const WINDOWS_SHIM_EXTENSIONS: ReadonlySet<string> = new Set([".cmd", ".bat", ".ps1"]);

export const isWindowsClaudeLauncherShimPath = (filePath: string): boolean =>
  WINDOWS_SHIM_EXTENSIONS.has(NodePath.win32.extname(filePath).toLowerCase());

/**
 * Newer package versions ship a native `bin/claude.exe`; older versions only ship `cli.js`,
 * which the SDK runs with a JavaScript runtime.
 */
const NPM_PACKAGE_ENTRY_CANDIDATES = [
  ["node_modules", "@anthropic-ai", "claude-code", "bin", "claude.exe"],
  ["node_modules", "@anthropic-ai", "claude-code", "cli.js"],
] as const;

export type ExecutableFileCheck = (filePath: string) => boolean;

function isExistingFile(filePath: string): boolean {
  try {
    return NodeFS.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

export const ClaudeExecutableFileCheck = Context.Reference<ExecutableFileCheck>(
  "server/provider/Drivers/ClaudeExecutableFileCheck",
  {
    defaultValue: () => isExistingFile,
  },
);

/**
 * The SDK spawns the given path without a shell and without Windows PATH / PATHEXT resolution,
 * so a bare command name like `claude` fails with "native binary not found" and an npm
 * `claude.cmd` shim fails with `spawn EINVAL`. CLI probes avoid this via `resolveSpawnCommand`,
 * which can fall back to `shell: true`; the SDK offers no such escape hatch.
 */
export const resolveClaudeSdkExecutablePath = Effect.fn("resolveClaudeSdkExecutablePath")(
  function* (binaryPath: string, environment: NodeJS.ProcessEnv): Effect.fn.Return<string> {
    const platform = yield* HostProcess.Platform;
    if (platform !== "win32") {
      return binaryPath;
    }

    const resolveExecutable = yield* SpawnExecutableResolution;
    const isFile = yield* ClaudeExecutableFileCheck;
    const resolved = resolveExecutable(binaryPath, platform, environment) ?? binaryPath;
    const extension = NodePath.win32.extname(resolved).toLowerCase();
    if (!WINDOWS_SHIM_EXTENSIONS.has(extension)) {
      return resolved;
    }

    const shimDirectory = NodePath.win32.dirname(resolved);
    for (const entrySegments of NPM_PACKAGE_ENTRY_CANDIDATES) {
      const candidate = NodePath.win32.join(shimDirectory, ...entrySegments);
      if (isFile(candidate)) {
        return candidate;
      }
    }

    yield* Effect.logWarning(
      "Claude launcher shim resolved but no known package entry was found next to it; the Claude Agent SDK cannot spawn launcher scripts directly.",
      { binaryPath, resolvedShimPath: resolved },
    );
    return binaryPath;
  },
);

/**
 * Folder where the official Claude installer puts the `claude` program on
 * every platform. The installer adds it to the user PATH, but a server that
 * was already running keeps its old PATH.
 */
const claudeUserBinDirectory = (home: string, platform: NodeJS.Platform): string =>
  (platform === "win32" ? NodePath.win32 : NodePath.posix).join(home, ".local", "bin");

/**
 * Return `env` with the official Claude install folder at the end of PATH, so
 * a Claude installed after server start is found without a restart. Keeps the
 * existing PATH key spelling (`Path` on Windows).
 */
export const withClaudeUserBinOnPath = (
  env: NodeJS.ProcessEnv,
  home: string,
  platform: NodeJS.Platform,
): NodeJS.ProcessEnv => {
  const directory = claudeUserBinDirectory(home, platform);
  const key =
    Object.keys(env).find((name) => name.toUpperCase() === "PATH") ??
    (platform === "win32" ? "Path" : "PATH");
  const separator = platform === "win32" ? ";" : ":";
  const current = env[key] ?? "";
  const entries = current.split(separator).filter((entry) => entry.length > 0);
  const same = (entry: string) =>
    platform === "win32"
      ? entry.replace(/[\\/]+$/u, "").toLowerCase() === directory.toLowerCase()
      : entry.replace(/\/+$/u, "") === directory;
  if (entries.some(same)) return env;
  return { ...env, [key]: [...entries, directory].join(separator) };
};

/**
 * Re-check a bare `claude` command each time a session starts. The adapter
 * fixes its Claude path once, so a Claude installed after server start (the
 * first-run wizard does this) would stay a bare name that the SDK cannot
 * spawn. A bare name falls back to the official install folder when the file
 * exists there. Any other value is returned unchanged.
 */
export const resolveInstalledClaudeBinary = (
  binaryPath: string,
  options: {
    readonly home?: string;
    readonly platform?: NodeJS.Platform;
    readonly isFile?: ExecutableFileCheck;
  } = {},
): string => {
  if (/[\/]/u.test(binaryPath)) return binaryPath;
  const platform = options.platform ?? process.platform;
  const name = platform === "win32" ? "claude.exe" : "claude";
  if (binaryPath !== "claude" && binaryPath !== name) return binaryPath;
  const candidate = (platform === "win32" ? NodePath.win32 : NodePath.posix).join(
    options.home ?? NodeOS.homedir(),
    ".local",
    "bin",
    name,
  );
  return (options.isFile ?? isExistingFile)(candidate) ? candidate : binaryPath;
};

/** `withClaudeUserBinOnPath` for the current user, for code that has no home folder service. */
export const withInstalledClaudeOnPath = (env: NodeJS.ProcessEnv): NodeJS.ProcessEnv =>
  withClaudeUserBinOnPath(env, NodeOS.homedir(), process.platform);
