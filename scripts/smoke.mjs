#!/usr/bin/env node
// Boot smoke gate: start the server on a fresh home, wait for the readiness
// endpoint, send one live orchestration command (`project add`), and fail on a
// hang. Catches the 0.62.0 class of bug: a layer change in server.ts left the
// command gate closed, so the port bound but every request hung with no error.
//   node scripts/smoke.mjs                    run the server from source
//   node scripts/smoke.mjs --entry <bin>      run a built entry (apps/server/dist/bin.mjs)
//   node scripts/smoke.mjs --runtime <Leonidas.exe> --entry <server.asar>/apps/server/dist/bin.mjs
//                                             run a packaged server with the app's Electron as Node
// Exit 0 = pass, 1 = fail. Prints one line per step with its time in ms.
// The server always gets a fresh temp home, so it never touches ~/.t3/userdata.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const flag = (name) => {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
};
const entry = resolve(flag("--entry") ?? join(repoRoot, "apps/server/src/bin.ts"));
const runtime = flag("--runtime") ? resolve(flag("--runtime")) : process.execPath;
const BOOT_DEADLINE_MS = 90_000;
const PROBE_TIMEOUT_MS = 5_000;
const COMMAND_TIMEOUT_MS = 30_000;
const started = Date.now();
const home = mkdtempSync(join(tmpdir(), "leonidas-smoke-"));
const workspace = join(home, "workspace");
mkdirSync(workspace);
let server;
let serverLog = "";

const step = (name, ms) => console.log(`[smoke] ${name} (${ms} ms)`);

function freePort() {
  return new Promise((res, rej) => {
    const probe = createServer();
    probe.once("error", rej);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => res(port));
    });
  });
}

function fail(reason) {
  console.error(`[smoke] FAIL: ${reason}`);
  if (serverLog) console.error(`[smoke] last server output:\n${serverLog.slice(-2_000)}`);
  cleanup();
  process.exit(1);
}

function cleanup() {
  // Kill only the PID captured at spawn, with its child tree.
  if (server?.pid && server.exitCode === null) {
    if (process.platform === "win32") {
      spawnSync("taskkill", ["/PID", String(server.pid), "/T", "/F"], { stdio: "ignore" });
    } else {
      server.kill("SIGKILL");
    }
  }
  try {
    // The temp home holds no links; retries cover file locks released after the kill.
    rmSync(home, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  } catch {}
}

const env = {
  ...process.env,
  T3CODE_HOME: home,
  T3CODE_NO_BROWSER: "1",
  ELECTRON_RUN_AS_NODE: "1",
};

async function waitReady(origin) {
  const deadline = started + BOOT_DEADLINE_MS;
  let last = "no response";
  while (Date.now() < deadline) {
    if (server.exitCode !== null) fail(`server exited with code ${server.exitCode} before ready`);
    try {
      const res = await fetch(`${origin}/.well-known/t3/environment`, {
        signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      });
      if (res.status === 200) return;
      last = `HTTP ${res.status}`;
    } catch (error) {
      // A timeout on an open port is the 0.62.0 hang: the server accepted the
      // connection but never answered.
      last = error?.name === "TimeoutError" ? "request hung (port open, no answer)" : "refused";
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  fail(`readiness endpoint never returned 200 in ${BOOT_DEADLINE_MS} ms: ${last}`);
}

function runCommand(args) {
  return new Promise((res) => {
    const child = spawn(runtime, [entry, ...args], { cwd: repoRoot, env });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      res({ code: "timeout", out });
    }, COMMAND_TIMEOUT_MS);
    child.on("exit", (code) => {
      clearTimeout(timer);
      res({ code, out });
    });
  });
}

const port = await freePort();
const origin = `http://127.0.0.1:${port}`;
server = spawn(
  runtime,
  [entry, "--base-dir", home, "--host", "127.0.0.1", "--port", String(port), "--no-browser"],
  { cwd: repoRoot, env },
);
const keepLog = (d) => (serverLog = (serverLog + d).slice(-8_000));
server.stdout.on("data", keepLog);
server.stderr.on("data", keepLog);
process.on("SIGINT", () => fail("interrupted"));

await waitReady(origin);
step(`server ready on ${origin}`, Date.now() - started);

const commandStart = Date.now();
const result = await runCommand(["project", "add", workspace, "--base-dir", home]);
if (result.code === "timeout") fail(`orchestration command hung for ${COMMAND_TIMEOUT_MS} ms`);
if (result.code !== 0) fail(`orchestration command exited ${result.code}: ${result.out.trim()}`);
// The CLI deletes server-runtime.json when it cannot reach the live server and
// then writes offline. The file still being there proves the command went live.
if (!existsSync(join(home, "userdata", "server-runtime.json")))
  fail("orchestration command fell back to offline mode: the live server did not answer");
step(
  `orchestration command dispatched: ${result.out.trim().split(/\r?\n/).pop()}`,
  Date.now() - commandStart,
);

cleanup();
console.log(`[smoke] PASS (${Date.now() - started} ms total)`);
