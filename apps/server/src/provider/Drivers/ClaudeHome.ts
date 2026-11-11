// @effect-diagnostics nodeBuiltinImport:off - Claude home resolution needs synchronous existence checks while building launch settings.
import type { ClaudeSettings } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as FS from "node:fs";

import { expandHomePath } from "@t3tools/provider-core/server/pathExpansion";
import * as HostProcess from "@t3tools/shared/HostProcess";

/**
 * Resolve the Claude config directory the CLI would use: the instance's
 * `homePath` (exported as `CLAUDE_CONFIG_DIR`), then an inherited
 * `CLAUDE_CONFIG_DIR`, then Claude's default `~/.claude`. Empty must not
 * fall back to bare `$HOME` — that leftover from the old HOME override
 * produced a different continuation group than an explicit `~/.claude`.
 */
export const resolveClaudeHomePath = Effect.fn("resolveClaudeHomePath")(function* (
  config: Pick<ClaudeSettings, "homePath">,
  environment?: NodeJS.ProcessEnv,
): Effect.fn.Return<string, never, Path.Path> {
  const path = yield* Path.Path;
  const home = yield* HostProcess.HomeDirectory;
  const homePath = config.homePath.trim();
  if (homePath.length > 0) {
    return path.resolve(expandHomePath(homePath, home));
  }
  // Inherited env vars are not shell-expanded, so a literal `~` stays literal.
  const inherited = environment?.CLAUDE_CONFIG_DIR?.trim() ?? "";
  if (inherited.length > 0) {
    return path.resolve(inherited);
  }
  const defaultDir = path.resolve(path.join(home, ".claude"));
  const personalCandidate = path.resolve(path.join(home, ".claude-personal"));
  try {
    const defaultJsonPath = path.join(defaultDir, ".claude.json");
    const personalJsonPath = path.join(personalCandidate, ".claude.json");
    const hasDefault = FS.existsSync(defaultJsonPath);
    const hasPersonal = FS.existsSync(personalJsonPath);
    if (hasPersonal) {
      if (!hasDefault) {
        return personalCandidate;
      }
      const defaultContent = FS.readFileSync(defaultJsonPath, "utf-8");
      const defaultHasAuth =
        (defaultContent.includes('"oauthAccount"') &&
          !defaultContent.includes('"oauthAccount": null')) ||
        defaultContent.includes('"claudeAiOauth"');
      if (!defaultHasAuth) {
        const personalContent = FS.readFileSync(personalJsonPath, "utf-8");
        const personalHasAuth =
          personalContent.includes('"oauthAccount"') || personalContent.includes('"claudeAiOauth"');
        if (personalHasAuth) {
          return personalCandidate;
        }
      }
    }
  } catch {
    // ignore
  }
  return defaultDir;
});

export const makeClaudeEnvironment = Effect.fn("makeClaudeEnvironment")(function* (
  config: Pick<ClaudeSettings, "homePath">,
  baseEnv?: NodeJS.ProcessEnv,
): Effect.fn.Return<NodeJS.ProcessEnv, never, Path.Path> {
  const resolvedBaseEnv = baseEnv ?? process.env;
  const homePath = config.homePath.trim();
  if (homePath.length === 0) return resolvedBaseEnv;
  const resolvedHomePath = yield* resolveClaudeHomePath(config);
  return {
    ...resolvedBaseEnv,
    // Overriding HOME also relocates the macOS login keychain lookup
    // ($HOME/Library/Keychains), so the spawned CLI can't find its stored
    // OAuth credentials and reports "Not logged in". CLAUDE_CONFIG_DIR points
    // Claude Code at its config dir directly while leaving HOME (and the
    // keychain) intact.
    CLAUDE_CONFIG_DIR: resolvedHomePath,
  };
});

/**
 * Whether an administrator installed Claude Code's `managed-mcp.json`. While it
 * exists Claude refuses `--strict-mcp-config` and exits before initializing,
 * but it already ignores user, project and `--mcp-config` servers on its own,
 * so callers that pass the flag for isolation can drop it. Paths match the
 * ones Claude Code checks.
 */
export const hasClaudeManagedMcpConfig = Effect.fn("hasClaudeManagedMcpConfig")(function* () {
  const fileSystem = yield* FileSystem.FileSystem;
  const platform = yield* HostProcess.Platform;
  const managedMcpConfigPath =
    platform === "darwin"
      ? "/Library/Application Support/ClaudeCode/managed-mcp.json"
      : platform === "win32"
        ? "C:\\Program Files\\ClaudeCode\\managed-mcp.json"
        : "/etc/claude-code/managed-mcp.json";
  return yield* fileSystem.exists(managedMcpConfigPath).pipe(Effect.orElseSucceed(() => false));
});

export const makeClaudeContinuationGroupKey = Effect.fn("makeClaudeContinuationGroupKey")(
  function* (
    config: Pick<ClaudeSettings, "homePath">,
    environment?: NodeJS.ProcessEnv,
  ): Effect.fn.Return<string, never, Path.Path> {
    const resolvedHomePath = yield* resolveClaudeHomePath(config, environment);
    return `claude:home:${resolvedHomePath}`;
  },
);

export const makeClaudeCapabilitiesCacheKey = Effect.fn("makeClaudeCapabilitiesCacheKey")(
  function* (
    config: Pick<ClaudeSettings, "binaryPath" | "homePath">,
    cwd?: string,
    environment?: NodeJS.ProcessEnv,
  ): Effect.fn.Return<string, never, Path.Path> {
    const resolvedHomePath = yield* resolveClaudeHomePath(config, environment);
    return `${config.binaryPath}\0${resolvedHomePath}\0${cwd ?? ""}`;
  },
);

/** Shown when Claude rejects the login. The web app offers a Sign in button for it. */
export const CLAUDE_SIGNED_OUT_MESSAGE =
  "Claude is signed out. Sign in again, then send your message again. If you use an API key, check this account's key in Settings.";
