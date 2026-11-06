// @effect-diagnostics nodeBuiltinImport:off - plain Node probes; the runner awaits them in Effect.tryPromise.
/**
 * Decides whether a dev server already runs for a home directory, so a second
 * `vp run dev` can reuse it instead of starting a Vite that has no backend.
 *
 * The descriptor is the `server-runtime.json` the server writes (see
 * `PersistedServerRuntimeState` in apps/server/src/serverRuntimeState.ts). Only
 * the fields read here are validated. A recycled pid is caught the same way the
 * server's own guard catches it: the recorded ports must also answer.
 */
import * as NodeFS from "node:fs";
import * as NodeNet from "node:net";
import * as NodePath from "node:path";

export interface DevRuntime {
  readonly pid: number;
  readonly origin: string;
  readonly devUrl: string;
  readonly webPort: number;
  readonly serverPort: number;
  readonly startedAt: string;
}

export function devRuntimePath(homeDir: string): string {
  return NodePath.join(homeDir, "userdata", "server-runtime.json");
}

/** `undefined` for a missing, empty, malformed or non-dev (no `devUrl`) descriptor. */
export function readDevRuntime(homeDir: string): DevRuntime | undefined {
  let raw: string;
  try {
    raw = NodeFS.readFileSync(devRuntimePath(homeDir), "utf8");
  } catch {
    return undefined;
  }
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    const { pid, port, origin, devUrl, startedAt } = value;
    if (
      typeof pid !== "number" ||
      !Number.isInteger(pid) ||
      typeof port !== "number" ||
      typeof origin !== "string" ||
      typeof devUrl !== "string" ||
      typeof startedAt !== "string"
    ) {
      return undefined;
    }
    const webPort = Number(new URL(devUrl).port);
    if (!Number.isInteger(webPort) || webPort <= 0) return undefined;
    return { pid, origin, devUrl, webPort, serverPort: port, startedAt };
  } catch {
    return undefined;
  }
}

export interface DevReuseProbes {
  readonly isProcessAlive: (pid: number) => boolean;
  readonly isPortListening: (port: number) => Promise<boolean>;
}

const defaultDevReuseProbes: DevReuseProbes = {
  isProcessAlive: (pid) => {
    try {
      process.kill(pid, 0);
      return true;
    } catch (error) {
      // EPERM: the pid exists but belongs to another user.
      return error instanceof Error && "code" in error && error.code === "EPERM";
    }
  },
  isPortListening: (port) =>
    new Promise((resolve) => {
      const socket = NodeNet.connect({ port, host: "127.0.0.1", timeout: 750 });
      const done = (listening: boolean) => {
        socket.destroy();
        resolve(listening);
      };
      socket.once("connect", () => done(true));
      socket.once("timeout", () => done(false));
      socket.once("error", () => done(false));
    }),
};

/**
 * The running dev stack for `homeDir`, or `undefined` when the descriptor is
 * missing or stale (dead pid, or either recorded port not answering).
 */
export async function findHealthyDev(
  homeDir: string,
  probes: DevReuseProbes = defaultDevReuseProbes,
): Promise<DevRuntime | undefined> {
  const runtime = readDevRuntime(homeDir);
  if (!runtime || !probes.isProcessAlive(runtime.pid)) return undefined;
  const [serverUp, webUp] = await Promise.all([
    probes.isPortListening(runtime.serverPort),
    probes.isPortListening(runtime.webPort),
  ]);
  return serverUp && webUp ? runtime : undefined;
}

/**
 * Reuse applies only to a plain full-stack `dev` start. Explicit ports, --share
 * and --dry-run mean the caller wants something specific, so they start normally.
 */
export function findReusableDev(
  input: {
    readonly mode: string;
    readonly dryRun?: boolean | undefined;
    readonly share?: boolean | undefined;
    readonly port?: number | undefined;
    readonly devUrl?: URL | undefined;
  },
  homeDir: string,
  probes?: DevReuseProbes,
): Promise<DevRuntime | undefined> {
  const plain =
    input.mode === "dev" &&
    !input.dryRun &&
    !input.share &&
    input.port === undefined &&
    input.devUrl === undefined;
  return plain ? findHealthyDev(homeDir, probes) : Promise.resolve(undefined);
}

export function formatDevReuseMessage(runtime: DevRuntime): string {
  return `[dev-runner] reusing healthy dev at ${runtime.devUrl} (server ${runtime.origin}, pid ${String(runtime.pid)}, started ${runtime.startedAt}). Nothing started. Fresh pairing link: node apps/server/src/bin.ts pair`;
}
