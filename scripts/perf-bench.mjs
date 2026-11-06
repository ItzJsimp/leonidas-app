#!/usr/bin/env node
// Leonidas performance benchmark. Times typecheck, tests, the web build,
// bundle size and a headless boot of the built app, then appends one JSON line
// per run to perf/benchmarks.jsonl (the single store for all benchmark data).
//   node scripts/perf-bench.mjs --root C:/lcw/perf-bench   full run against the bench worktree
//   node scripts/perf-bench.mjs --only a,b                 run only the named steps
//   node scripts/perf-bench.mjs --note "x"                 attach a note (for example the change under test)
import { spawn, execFileSync } from "node:child_process";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs";
import { createServer } from "node:net";
import { cpus, tmpdir, totalmem } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};
// The store always lives next to this script, so every run lands in one file.
// --root points at the checkout under test (a stable worktree such as C:/lcw/perf-bench),
// because the shared main checkout can lose node_modules while another agent reinstalls.
const scriptRepo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const store = join(scriptRepo, "perf", "benchmarks.jsonl");
const repoRoot = resolve(flag("--root") ?? scriptRepo);
const vp = join(repoRoot, "node_modules", ".bin", process.platform === "win32" ? "vp.cmd" : "vp");
const only = flag("--only")?.split(",");

// Scoped test files: fast, stable, and covering hot paths. Add files here; keep names stable.
const TEST_FILES = {
  web: [
    "src/components/desktopUpdate.logic.test.ts",
    "src/components/chat/composerSkillFolders.logic.test.ts",
  ],
  desktop: ["src/updates/DesktopRemoteUpdates.test.ts"],
};

const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g");

function run(cmd, args, cwd, timeoutMs) {
  return new Promise((done) => {
    const started = performance.now();
    const win = process.platform === "win32";
    // Windows .cmd shims need a shell; quote the command because the repo path has spaces.
    const child = spawn(win ? `"${cmd}"` : cmd, args, {
      cwd,
      shell: win,
      env: { ...process.env, CI: "1", FORCE_COLOR: "0" },
    });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    const timer = setTimeout(() => child.kill(), timeoutMs);
    child.on("close", (code) => {
      clearTimeout(timer);
      // Strip ANSI colors so the count parsers see plain text.
      const plain = out.replace(ANSI, "");
      done({
        code,
        ms: Math.round(performance.now() - started),
        out: plain.split(repoRoot).join("<repo>"),
      });
    });
  });
}

const tail = (text, n = 12) => text.trim().split(/\r?\n/).slice(-n).join("\n");
const tscErrors = (out) => (out.match(/error TS\d+/g) ?? []).length;

function dirBytes(dir) {
  let total = 0;
  let js = 0;
  let largest = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true, recursive: true })) {
    if (!entry.isFile()) continue;
    const size = statSync(join(entry.parentPath, entry.name)).size;
    total += size;
    if (entry.name.endsWith(".js")) {
      js += size;
      largest = Math.max(largest, size);
    }
  }
  return {
    totalKb: Math.round(total / 1024),
    jsKb: Math.round(js / 1024),
    largestJsKb: Math.round(largest / 1024),
  };
}

async function testStep(dir, files) {
  const r = await run(vp, ["test", "run", ...files], join(repoRoot, dir), 300_000);
  const passed = Number(r.out.match(/Tests\s+(\d+) passed/)?.[1] ?? 0);
  const failed = Number(r.out.match(/(\d+) failed/)?.[1] ?? 0);
  return {
    ms: r.ms,
    ok: r.code === 0,
    passed,
    failed,
    detail: r.code === 0 ? undefined : tail(r.out),
  };
}

/** Working set in MB of a PID plus all its descendants (Windows), or RSS of the PID elsewhere. */
function treeMemoryMb(pid) {
  try {
    if (process.platform !== "win32") {
      const kb = execFileSync("ps", ["-o", "rss=", "-p", String(pid)], { encoding: "utf8" });
      return Math.round(Number(kb) / 1024);
    }
    const script = `$all = Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,WorkingSetSize; $ids = @(${pid}); $i = 0; while ($i -lt $ids.Count) { $ids += @($all | Where-Object { $_.ParentProcessId -eq $ids[$i] } | ForEach-Object { $_.ProcessId }); $i++ }; ($all | Where-Object { $ids -contains $_.ProcessId } | Measure-Object WorkingSetSize -Sum).Sum`;
    const bytes = execFileSync("powershell", ["-NoProfile", "-Command", script], {
      encoding: "utf8",
      timeout: 20_000,
    });
    return Math.round(Number(bytes.trim()) / 2 ** 20);
  } catch {
    return undefined;
  }
}

/**
 * Live server from source on a fresh temp home (never ~/.t3/userdata): time to the
 * readiness endpoint, one live orchestration command (`project add`), and memory
 * at idle and after the command. Same boot path as scripts/smoke.mjs.
 */
async function serverLiveStep() {
  const home = mkdtempSync(join(tmpdir(), "leonidas-perf-"));
  const workspace = join(home, "workspace");
  mkdirSync(workspace);
  const entry = join(repoRoot, "apps/server/src/bin.ts");
  const env = { ...process.env, T3CODE_HOME: home, T3CODE_NO_BROWSER: "1" };
  const port = await new Promise((res, rej) => {
    const probe = createServer();
    probe.once("error", rej);
    probe.listen(0, "127.0.0.1", () => {
      const { port: p } = probe.address();
      probe.close(() => res(p));
    });
  });
  const origin = `http://127.0.0.1:${port}`;
  const started = performance.now();
  const server = spawn(
    process.execPath,
    [entry, "--base-dir", home, "--host", "127.0.0.1", "--port", String(port), "--no-browser"],
    { cwd: repoRoot, env },
  );
  let log = "";
  server.stdout.on("data", (d) => (log = (log + d).slice(-4_000)));
  server.stderr.on("data", (d) => (log = (log + d).slice(-4_000)));
  const stop = () => {
    // Kill only the PID captured at spawn, with its child tree.
    if (server.exitCode !== null) return;
    if (process.platform === "win32")
      execFileSync("taskkill", ["/PID", String(server.pid), "/T", "/F"], { stdio: "ignore" });
    else server.kill("SIGKILL");
  };
  try {
    let readyMs;
    while (performance.now() - started < 90_000 && server.exitCode === null) {
      try {
        const res = await fetch(`${origin}/.well-known/t3/environment`, {
          signal: AbortSignal.timeout(5_000),
        });
        if (res.status === 200) {
          readyMs = Math.round(performance.now() - started);
          break;
        }
      } catch {}
      await new Promise((r) => setTimeout(r, 250));
    }
    if (readyMs === undefined)
      return {
        ms: Math.round(performance.now() - started),
        ok: false,
        detail: tail(log.split(repoRoot).join("<repo>"), 8),
      };
    // Let startup work settle before the idle memory sample.
    await new Promise((r) => setTimeout(r, 3_000));
    const idleMb = treeMemoryMb(server.pid);
    const commandStart = performance.now();
    const cmd = await new Promise((res) => {
      const child = spawn(
        process.execPath,
        [entry, "project", "add", workspace, "--base-dir", home],
        { cwd: repoRoot, env },
      );
      const timer = setTimeout(() => child.kill(), 30_000);
      child.on("exit", (code) => {
        clearTimeout(timer);
        res(code);
      });
    });
    const commandMs = Math.round(performance.now() - commandStart);
    const afterCommandMb = treeMemoryMb(server.pid);
    const live = existsSync(join(home, "userdata", "server-runtime.json"));
    return {
      ms: Math.round(performance.now() - started),
      ok: cmd === 0 && live,
      readyMs,
      commandMs,
      idleMb,
      afterCommandMb,
      detail: cmd === 0 && live ? undefined : `project add exited ${cmd}, live=${live}`,
    };
  } finally {
    stop();
    try {
      rmSync(home, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    } catch {}
  }
}

const steps = [
  [
    "typecheck_web",
    async () => {
      const r = await run(vp, ["run", "typecheck"], join(repoRoot, "apps/web"), 300_000);
      return {
        ms: r.ms,
        ok: r.code === 0,
        errors: tscErrors(r.out),
        detail: r.code === 0 ? undefined : tail(r.out),
      };
    },
  ],
  [
    "typecheck_server",
    async () => {
      // Known errors exist in unrelated files; the count is the metric, not pass/fail.
      const r = await run(vp, ["run", "typecheck"], join(repoRoot, "apps/server"), 300_000);
      return { ms: r.ms, ok: r.code === 0, errors: tscErrors(r.out) };
    },
  ],
  ["test_web", async () => testStep("apps/web", TEST_FILES.web)],
  ["test_desktop", async () => testStep("apps/desktop", TEST_FILES.desktop)],
  [
    "build_web",
    async () => {
      const r = await run(vp, ["build"], join(repoRoot, "apps/web"), 600_000);
      const size = r.code === 0 ? dirBytes(join(repoRoot, "apps/web/dist")) : {};
      return {
        ms: r.ms,
        ok: r.code === 0,
        ...size,
        detail: r.code === 0 ? undefined : tail(r.out),
      };
    },
  ],
  ["server_live", serverLiveStep],
  [
    "boot_web",
    async () => {
      // Headless browser loads the built bundle; catches boot crashes and times cold start.
      const r = await run("node", ["scripts/check-web-boot.mjs"], repoRoot, 120_000);
      return { ms: r.ms, ok: r.code === 0, detail: r.code === 0 ? undefined : tail(r.out, 4) };
    },
  ],
];

const git = (...a) => {
  try {
    return execFileSync("git", a, { cwd: repoRoot, encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
};

const record = {
  ts: new Date().toISOString(),
  commit: git("rev-parse", "--short", "HEAD"),
  branch: git("rev-parse", "--abbrev-ref", "HEAD"),
  dirty: git("status", "--porcelain", "--untracked-files=no") !== "",
  node: process.version,
  machine: { cpus: cpus().length, memGb: Math.round(totalmem() / 2 ** 30) },
  note: flag("--note"),
  steps: {},
};

const totalStart = performance.now();
for (const [name, fn] of steps) {
  if (only && !only.includes(name)) continue;
  process.stdout.write(`${name} ... `);
  try {
    record.steps[name] = await fn();
  } catch (error) {
    record.steps[name] = { ok: false, ms: 0, detail: String(error) };
  }
  const s = record.steps[name];
  console.log(`${s.ok ? "ok" : "FAIL"} ${s.ms} ms`);
}
record.totalMs = Math.round(performance.now() - totalStart);
record.failures = Object.entries(record.steps)
  .filter(([, s]) => !s.ok)
  .map(([n]) => n);

mkdirSync(dirname(store), { recursive: true });
appendFileSync(store, `${JSON.stringify(record)}\n`);
console.log(
  `\nTotal ${record.totalMs} ms, failures: ${record.failures.join(", ") || "none"}. Saved to perf/benchmarks.jsonl`,
);
