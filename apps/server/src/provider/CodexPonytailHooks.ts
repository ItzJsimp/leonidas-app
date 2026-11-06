// @effect-diagnostics nodeBuiltinImport:off globalTimers:off - one-shot JSON-RPC over a short-lived `codex app-server`, no Effect runtime needed
/**
 * Lists and approves the Ponytail plugin's Codex hooks.
 *
 * Codex runs a plugin's lifecycle hooks only after the user trusts them (the `/hooks` screen). The
 * app-server exposes the same switch: `hooks/list` reports each hook's trust status and
 * `config/batchWrite` stores `[hooks.state."<key>"] trusted_hash`. The card calls this when the user
 * clicks "Approve", so the user still gives the consent. Only hooks of `ponytail@ponytail` are touched.
 */
import * as NodeChildProcess from "node:child_process";

import type { PonytailCodexHooks } from "@t3tools/contracts";

import { codexBinaryFor, PONYTAIL_PLUGIN_ID } from "./PonytailEnsure.ts";

const TIMEOUT_MS = 30_000;

interface RawHook {
  readonly key: string;
  readonly eventName: string;
  readonly command?: string;
  readonly pluginId?: string | null;
  readonly trustStatus: "managed" | "untrusted" | "trusted" | "modified";
  readonly currentHash: string;
}

/** Runs requests against a fresh app-server for one Codex home and always stops it. */
async function withAppServer<T>(
  home: string,
  cwd: string,
  run: (call: (method: string, params: unknown) => Promise<any>) => Promise<T>,
): Promise<T> {
  const binary = codexBinaryFor(home);
  // shortcut: a shell runs the .cmd shim Codex uses on Windows; the arguments are fixed and only the path is quoted.
  const child = NodeChildProcess.spawn(/\s/.test(binary) ? `"${binary}"` : binary, ["app-server"], {
    cwd,
    env: { ...process.env, CODEX_HOME: home },
    stdio: ["pipe", "pipe", "ignore"],
    shell: true,
    windowsHide: true,
  });
  const waiting = new Map<number, (message: any) => void>();
  let buffer = "";
  child.stdout.on("data", (chunk) => {
    buffer += chunk;
    for (let end = buffer.indexOf("\n"); end >= 0; end = buffer.indexOf("\n")) {
      const line = buffer.slice(0, end).trim();
      buffer = buffer.slice(end + 1);
      try {
        const message = line ? JSON.parse(line) : undefined;
        if (message?.id !== undefined) waiting.get(message.id)?.(message);
      } catch {
        // A non-JSON log line.
      }
    }
  });
  let next = 0;
  const call = (method: string, params: unknown) =>
    new Promise<any>((resolve, reject) => {
      const id = ++next;
      waiting.set(id, (message) =>
        message.error
          ? reject(new Error(String(message.error.message ?? "request failed")))
          : resolve(message.result),
      );
      child.stdin.write(`${JSON.stringify({ id, method, params })}\n`);
    });
  const timer = setTimeout(() => child.kill(), TIMEOUT_MS);
  try {
    await call("initialize", {
      clientInfo: { name: "leonidas-code", title: "Leonidas", version: "0.0.0" },
    });
    child.stdin.write(`${JSON.stringify({ method: "initialized", params: {} })}\n`);
    return await run(call);
  } finally {
    clearTimeout(timer);
    child.kill();
  }
}

const ponytailHooks = async (call: (m: string, p: unknown) => Promise<any>, cwd: string) => {
  const list = await call("hooks/list", { cwds: [cwd] });
  const hooks: RawHook[] = (list?.data ?? []).flatMap(
    (entry: { hooks?: RawHook[] }) => entry.hooks ?? [],
  );
  return hooks.filter((hook) => hook.pluginId === PONYTAIL_PLUGIN_ID);
};

const toResult = (hooks: ReadonlyArray<RawHook>): PonytailCodexHooks => ({
  hooks: hooks.map((hook) => ({
    event: hook.eventName,
    command: hook.command ?? "",
    trusted: hook.trustStatus === "trusted" || hook.trustStatus === "managed",
  })),
  error: null,
});

/** Lists Ponytail's hooks for one Codex home, and trusts the ones that are not trusted when `approve` is true. */
export async function codexPonytailHooks(input: {
  readonly home: string;
  readonly cwd: string;
  readonly approve: boolean;
}): Promise<PonytailCodexHooks> {
  try {
    return await withAppServer(input.home, input.cwd, async (call) => {
      let hooks = await ponytailHooks(call, input.cwd);
      const pending = hooks.filter(
        (hook) => hook.trustStatus === "untrusted" || hook.trustStatus === "modified",
      );
      if (input.approve && pending.length > 0) {
        await call("config/batchWrite", {
          edits: [
            {
              keyPath: "hooks.state",
              mergeStrategy: "upsert",
              value: Object.fromEntries(
                pending.map((hook) => [hook.key, { trusted_hash: hook.currentHash }]),
              ),
            },
          ],
          reloadUserConfig: true,
        });
        hooks = await ponytailHooks(call, input.cwd);
      }
      return toResult(hooks);
    });
  } catch (cause) {
    return { hooks: [], error: cause instanceof Error ? cause.message : "Could not reach Codex." };
  }
}
