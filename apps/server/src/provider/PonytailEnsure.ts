// @effect-diagnostics nodeBuiltinImport:off globalTimers:off - small detached installer, no Effect runtime needed
/**
 * Ponytail plugin for Claude accounts.
 *
 * The Ponytail rules already reach every provider through `buildRuntimeInstructions`. The Claude
 * plugin adds `/ponytail` levels, its skills and a per-turn cost ledger. This module installs it
 * once for each Claude config dir (each account), so a new account needs no setup.
 *
 * Codex has its own plugin install (`codex plugin add`). Codex asks the user to trust a plugin's
 * lifecycle hooks, and this module never grants that trust: it installs, then the card shows
 * "needs trust" until the user approves the hooks in Codex (`/hooks`).
 *
 * It never overrides a user choice: if `settings.json` already lists the plugin (on or off), it
 * does nothing. It needs `node` on PATH for the plugin hooks; without it the rules in the runtime
 * instructions still apply.
 */
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

export const PONYTAIL_PLUGIN_ID = "ponytail@ponytail";
/** Pinned to a release tag: a later push to the third-party repo must not reach users. */
const PONYTAIL_MARKETPLACE = "DietrichGebert/ponytail#v5.3.3";
/** Third-party plugin code runs on every Claude turn, so the install is opt-in. */
export const PONYTAIL_INSTALL_OPT_IN_ENV = "LEONIDAS_INSTALL_PONYTAIL_PLUGIN";
const COMMAND_TIMEOUT_MS = 120_000;
/** Wait before the first install so it never competes with server start. */
const START_DELAY_MS = 30_000;

const attempted = new Set<string>();

export function claudeConfigDirOf(env: NodeJS.ProcessEnv | undefined): string {
  const configured = env?.CLAUDE_CONFIG_DIR?.trim();
  return configured ? NodePath.resolve(configured) : NodePath.join(NodeOS.homedir(), ".claude");
}

function readEnabledPlugins(configDir: string): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(
      NodeFS.readFileSync(NodePath.join(configDir, "settings.json"), "utf8"),
    );
    const plugins = parsed?.enabledPlugins;
    return plugins && typeof plugins === "object" ? plugins : {};
  } catch {
    return undefined;
  }
}

/** True when the plugin injects the rules for this account, so the app skips its own copy. */
export function isPonytailPluginEnabled(env: NodeJS.ProcessEnv | undefined): boolean {
  return readEnabledPlugins(claudeConfigDirOf(env))?.[PONYTAIL_PLUGIN_ID] === true;
}

function run(
  file: string,
  args: readonly string[],
  env: NodeJS.ProcessEnv,
  shell = false,
): Promise<boolean> {
  return new Promise((resolve) => {
    NodeChildProcess.execFile(
      file,
      [...args],
      { env, timeout: COMMAND_TIMEOUT_MS, windowsHide: true, shell },
      (error) => resolve(error === null),
    );
  });
}

/** Install the plugin for one Claude account. Never throws; a failed try repeats at next start. */
export async function ensureClaudePonytail(input: {
  readonly binaryPath: string;
  readonly env: NodeJS.ProcessEnv;
}): Promise<"installed" | "present" | "skipped" | "failed"> {
  if (input.env[PONYTAIL_INSTALL_OPT_IN_ENV] !== "1") return "skipped";
  const configDir = claudeConfigDirOf(input.env);
  if (attempted.has(configDir)) return "skipped";
  attempted.add(configDir);
  const settings = readEnabledPlugins(configDir);
  if (settings !== undefined && PONYTAIL_PLUGIN_ID in settings) return "present";
  const env = { ...input.env, CLAUDE_CONFIG_DIR: configDir };
  if (!(await run("node", ["--version"], env))) return "skipped";
  const claude = input.binaryPath.trim() || "claude";
  const added = await run(claude, ["plugin", "marketplace", "add", PONYTAIL_MARKETPLACE], env);
  const installed =
    added && (await run(claude, ["plugin", "install", PONYTAIL_PLUGIN_ID, "--scope", "user"], env));
  if (!installed) attempted.delete(configDir);
  return installed ? "installed" : "failed";
}

/** Fire and forget, delayed, from the driver. */
export function scheduleClaudePonytail(input: {
  readonly binaryPath: string;
  readonly env: NodeJS.ProcessEnv;
}): void {
  setTimeout(() => void ensureClaudePonytail(input), START_DELAY_MS).unref();
}

export type CodexPluginState = "off" | "needs-trust" | "on";

/**
 * Reads a Codex home's `config.toml` text. Trust is stored as `[hooks.state."<key>"]`; a trusted
 * Ponytail hook has a key that names the plugin. shortcut: the key format for plugin hooks is
 * matched by name only, so check it against a real trusted install if the badge looks wrong.
 */
export function codexPonytailState(configToml: string | undefined): CodexPluginState {
  const block = configToml ? /\[plugins\."ponytail@ponytail"\]([^[]*)/.exec(configToml) : null;
  if (!configToml || !block || !/enabled\s*=\s*true/.test(block[1] ?? "")) return "off";
  return /\[hooks\.state\.[^\]]*ponytail[^\]]*\]/i.test(configToml) ? "on" : "needs-trust";
}

export function codexHomeOf(env: NodeJS.ProcessEnv | undefined): string {
  const configured = env?.CODEX_HOME?.trim();
  return configured ? NodePath.resolve(configured) : NodePath.join(NodeOS.homedir(), ".codex");
}

export function readCodexPonytailState(home: string): CodexPluginState {
  try {
    return codexPonytailState(NodeFS.readFileSync(NodePath.join(home, "config.toml"), "utf8"));
  } catch {
    return "off";
  }
}

/** Install the plugin for one Codex home. Never throws; a failed try repeats at next start. */
async function ensureCodexPonytail(input: {
  readonly binaryPath: string;
  readonly env: NodeJS.ProcessEnv;
}): Promise<"installed" | "present" | "skipped" | "failed"> {
  const home = codexHomeOf(input.env);
  const key = `codex:${home}`;
  if (attempted.has(key)) return "skipped";
  attempted.add(key);
  let text = "";
  try {
    text = NodeFS.readFileSync(NodePath.join(home, "config.toml"), "utf8");
  } catch {
    // No config yet: Codex has never run here, so install.
  }
  if (text.includes(PONYTAIL_PLUGIN_ID)) return "present";
  const env = { ...input.env, CODEX_HOME: home };
  if (!(await run("node", ["--version"], env))) return "skipped";
  const codex = input.binaryPath.trim() || "codex";
  // A shell runs the .cmd shim Codex uses on Windows; the arguments are fixed.
  const added = await run(codex, ["plugin", "marketplace", "add", PONYTAIL_MARKETPLACE], env, true);
  const installed = added && (await run(codex, ["plugin", "add", PONYTAIL_PLUGIN_ID], env, true));
  if (!installed) attempted.delete(key);
  return installed ? "installed" : "failed";
}

/** Which Codex binary serves each Codex home, so a later hook approval uses the same one. */
const codexBinaryByHome = new Map<string, string>();
export const codexBinaryFor = (home: string): string => codexBinaryByHome.get(home) || "codex";

/** Fire and forget, delayed, from the driver. */
export function scheduleCodexPonytail(input: {
  readonly binaryPath: string;
  readonly env: NodeJS.ProcessEnv;
}): void {
  codexBinaryByHome.set(codexHomeOf(input.env), input.binaryPath.trim());
  setTimeout(() => void ensureCodexPonytail(input), START_DELAY_MS).unref();
}
