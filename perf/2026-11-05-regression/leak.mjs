// Leak harness: same boot as client-bench, then thread-switch cycles with heap snapshots after cycle A and cycle B.
//   node leak.mjs --root C:/lcw/perf-new --a 2 --b 12 --dir C:/lcw/perf-regress/snaps [--threads largest,p10]
import { spawn, spawnSync } from "node:child_process";
import {
  copyFileSync,
  createWriteStream,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const argv = process.argv.slice(2);
const flag = (n, d) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : d);
const root = resolve(flag("--root", "."));
const fixture = resolve(flag("--fixture", "C:/lcw/p5/bench-fixture"));
const A = Number(flag("--a", "2"));
const B = Number(flag("--b", "12"));
const dir = resolve(flag("--dir", "snaps"));
const pick = flag("--threads", "largest,p10,p20,p40").split(",");
const profileOut = flag("--profile", null);
mkdirSync(dir, { recursive: true });
const pw = await import(
  pathToFileURL(
    join(root, "node_modules/.pnpm/playwright-core@1.60.0/node_modules/playwright-core/index.mjs"),
  ).href
);
const meta = JSON.parse(readFileSync(join(fixture, "fixture.json"), "utf8"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const home = mkdtempSync(join(tmpdir(), "leonidas-leak-"));
mkdirSync(join(home, "userdata"));
copyFileSync(join(fixture, "statev2.sqlite"), join(home, "userdata", "statev2.sqlite"));
const env = {
  ...process.env,
  T3CODE_HOME: home,
  T3CODE_NO_BROWSER: "1",
  ELECTRON_RUN_AS_NODE: "1",
  LEONIDAS_SCRIBE_ENGINE_BIN: "",
};
const entry = join(root, "apps/server/src/bin.ts");
const port = await new Promise((res) => {
  const s = createServer().listen(0, "127.0.0.1", () => {
    const p = s.address().port;
    s.close(() => res(p));
  });
});
const origin = `http://127.0.0.1:${port}`;
const server = spawn(
  process.execPath,
  [entry, "--base-dir", home, "--host", "127.0.0.1", "--port", String(port), "--no-browser"],
  { cwd: root, env, stdio: "ignore" },
);
let browser;
const cleanup = () => {
  browser?.close().catch(() => {});
  spawnSync("taskkill", ["/PID", String(server.pid), "/T", "/F"], { stdio: "ignore" });
  try {
    rmSync(home, { recursive: true, force: true, maxRetries: 20, retryDelay: 500 });
  } catch {}
};
let envId;
for (const t0 = Date.now(); !envId && Date.now() - t0 < 600_000; await sleep(250)) {
  try {
    const r = await fetch(`${origin}/.well-known/t3/environment`);
    if (r.ok) envId = (await r.json()).environmentId;
  } catch {}
}
const cli = spawnSync(
  process.execPath,
  [entry, "auth", "pairing", "create", "--base-dir", home, "--base-url", origin],
  { cwd: root, env, encoding: "utf8" },
);
const pairUrl = cli.stdout.match(/https?:\/\/\S+\/pair#token=\S+/)[0];
browser = await pw.chromium.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
});
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
const cdp = await page.context().newCDPSession(page);
await page.goto(pairUrl);
await page.waitForURL((u) => !u.pathname.startsWith("/pair"), { timeout: 120_000 });
const url = (k) => `${origin}/${envId}/${encodeURIComponent(meta.threadIds[k])}`;
await page.goto(url("p40"));
await page.waitForSelector("[data-timeline-row-id]", { timeout: 120_000 });
const open = (u) =>
  page.evaluate(async (u) => {
    history.pushState({}, "", u);
    dispatchEvent(new PopStateEvent("popstate"));
    const t = performance.now();
    while (performance.now() - t < 60_000) {
      await new Promise((r) => requestAnimationFrame(r));
      if (
        document.querySelector("[data-timeline-row-id]") &&
        !document.querySelector("[data-timeline-loading]") &&
        location.pathname === new URL(u).pathname
      )
        return;
    }
  }, u);
const snap = async (name) => {
  await cdp.send("HeapProfiler.collectGarbage");
  await cdp.send("HeapProfiler.collectGarbage");
  const file = join(dir, name);
  const ws = createWriteStream(file);
  const onChunk = ({ chunk }) => ws.write(chunk);
  cdp.on("HeapProfiler.addHeapSnapshotChunk", onChunk);
  await cdp.send("HeapProfiler.takeHeapSnapshot", { reportProgress: false });
  cdp.off("HeapProfiler.addHeapSnapshotChunk", onChunk);
  await new Promise((r) => ws.end(r));
  const { usedSize } = await cdp.send("Runtime.getHeapUsage");
  console.log(name, (usedSize / 2 ** 20).toFixed(1), "MB");
};
if (profileOut) {
  await cdp.send("Profiler.enable");
  await cdp.send("Profiler.setSamplingInterval", { interval: 200 });
  for (const k of pick) await open(url(k));
  await cdp.send("Profiler.start");
  for (let c = 0; c < 5; c++)
    for (const k of pick) {
      await open(url(k));
      await sleep(300);
    }
  const { profile } = await cdp.send("Profiler.stop");
  (await import("node:fs")).writeFileSync(profileOut, JSON.stringify(profile));
  cleanup();
  process.exit(0);
}
for (let c = 1; c <= B; c++) {
  for (const k of pick) {
    await open(url(k));
    await sleep(300);
  }
  if (c === A) await snap(`a.heapsnapshot`);
}
await snap(`b.heapsnapshot`);
cleanup();
