// @effect-diagnostics nodeBuiltinImport:off - plain Node test setup, outside any Effect runtime.
// Global setup for the e2e browser project: one real Leonidas server on temporary state, with a
// fake `codex` binary that replays a recorded turn. The browser reaches it through the Vite proxy.
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import * as HostProcess from "@t3tools/shared/HostProcess";

import { E2E_AUTH_TOKEN, E2E_BROWSER_PORT, E2E_SERVER_PORT } from "./config";

const repoRoot = NodePath.resolve(import.meta.dirname, "../../../..");
const transcript = NodePath.join(
  repoRoot,
  "apps/server/src/orchestration-v2/testkit/fixtures/simple/codex_transcript.ndjson",
);

function writeFakeCodexLauncher(directory: string): string {
  const script = NodePath.join(import.meta.dirname, "fakeCodex.mjs");
  if (HostProcess.Platform.defaultValue() === "win32") {
    const launcher = NodePath.join(directory, "codex.cmd");
    NodeFS.writeFileSync(launcher, `@echo off\r\nnode "${script}" %*\r\nexit /b %ERRORLEVEL%\r\n`);
    return launcher;
  }
  const launcher = NodePath.join(directory, "codex");
  NodeFS.writeFileSync(launcher, `#!/bin/sh\nexec node "${script}" "$@"\n`, { mode: 0o755 });
  return launcher;
}

export default async function setup() {
  const root = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "leonidas-e2e-"));
  const home = NodePath.join(root, "home");
  const workspace = NodePath.join(root, "workspace");
  const codexHome = NodePath.join(root, "codex-home");
  for (const dir of [NodePath.join(home, "userdata"), workspace, codexHome])
    NodeFS.mkdirSync(dir, { recursive: true });

  const git = (...args: string[]) =>
    NodeChildProcess.execFileSync("git", args, { cwd: workspace, stdio: "ignore" });
  git("init", "-q", "-b", "main");
  NodeFS.writeFileSync(NodePath.join(workspace, "README.md"), "# e2e\n");
  git("add", "README.md");
  git("-c", "user.name=e2e", "-c", "user.email=e2e@example.com", "commit", "-qm", "init");

  NodeFS.writeFileSync(
    NodePath.join(home, "userdata", "settings.json"),
    JSON.stringify({
      providerInstances: {
        codex: {
          driver: "codex",
          enabled: true,
          config: { binaryPath: writeFakeCodexLauncher(root), homePath: codexHome },
        },
      },
    }),
  );

  const server = NodeChildProcess.spawn(
    process.execPath,
    [NodePath.join(repoRoot, "apps/server/src/bin.ts"), "--base-dir", home, "--no-browser"],
    {
      cwd: workspace,
      env: {
        ...process.env,
        T3CODE_PORT: String(E2E_SERVER_PORT),
        T3CODE_MODE: "web",
        T3CODE_AUTO_BOOTSTRAP_PROJECT_FROM_CWD: "1",
        T3CODE_DEV_AUTH_TOKEN: E2E_AUTH_TOKEN,
        VITE_DEV_SERVER_URL: `http://localhost:${E2E_BROWSER_PORT}`,
        LEONIDAS_E2E_CODEX_TRANSCRIPT: transcript,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let output = "";
  await new Promise<void>((ready, fail) => {
    const timer = setTimeout(() => fail(new Error(`e2e server did not start:\n${output}`)), 90_000);
    const onData = (chunk: Buffer) => {
      output += chunk.toString();
      if (output.includes("Listening on")) {
        clearTimeout(timer);
        ready();
      }
    };
    server.stdout.on("data", onData);
    server.stderr.on("data", onData);
    server.once("exit", (code) => fail(new Error(`e2e server exited (${code}):\n${output}`)));
  });

  return () => {
    server.kill();
    NodeFS.rmSync(root, { recursive: true, force: true });
  };
}
