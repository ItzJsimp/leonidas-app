// Client bench: boot one checkout's server on a copy of the fixture DB, drive its built web UI in headless Edge.
// Times app start (reload -> first sidebar row), thread switch per size, long-thread scroll; records long tasks
// and heap / DOM nodes / listeners after each cycle (leak signal). One JSON line per run.
//   node client-bench.mjs --root C:/lcw/perf-new --label new --cycles 10 --out client.jsonl
import { spawn, spawnSync } from "node:child_process";
import {
  appendFileSync,
  copyFileSync,
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
const label = flag("--label", "run");
const fixture = resolve(flag("--fixture", "C:/lcw/p5/bench-fixture"));
const cycles = Number(flag("--cycles", "10"));
const out = resolve(flag("--out", "client.jsonl"));
const pw = await import(
  pathToFileURL(
    join(root, "node_modules/.pnpm/playwright-core@1.60.0/node_modules/playwright-core/index.mjs"),
  ).href
);
const meta = JSON.parse(readFileSync(join(fixture, "fixture.json"), "utf8"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pct = (xs, p) =>
  [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(xs.length * p))];
const stat = (xs) => ({
  p50: +pct(xs, 0.5).toFixed(1),
  p95: +pct(xs, 0.95).toFixed(1),
  max: +Math.max(...xs).toFixed(1),
  n: xs.length,
});

const home = mkdtempSync(join(tmpdir(), "leonidas-cbench-"));
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
  { cwd: root, env },
);
let log = "";
server.stdout.on("data", (d) => (log = (log + d).slice(-4000)));
server.stderr.on("data", (d) => (log = (log + d).slice(-4000)));
let browser;
function cleanup() {
  browser?.close().catch(() => {});
  if (server.exitCode === null)
    spawnSync("taskkill", ["/PID", String(server.pid), "/T", "/F"], { stdio: "ignore" });
  try {
    rmSync(home, { recursive: true, force: true, maxRetries: 20, retryDelay: 500 });
  } catch (e) {
    console.error(`[cbench] temp home not removed: ${e.code} ${home}`);
  }
}
function fail(why) {
  console.error(`[cbench] FAIL ${why}\n${log.slice(-1500)}`);
  cleanup();
  process.exit(1);
}
let envId;
for (const t0 = Date.now(); Date.now() - t0 < 600_000; await sleep(250)) {
  if (server.exitCode !== null) fail(`server exited ${server.exitCode}`);
  try {
    const r = await fetch(`${origin}/.well-known/t3/environment`);
    if (r.ok) {
      envId = (await r.json()).environmentId;
      break;
    }
  } catch {}
}
if (!envId) fail("server not ready");
const cli = spawnSync(
  process.execPath,
  [entry, "auth", "pairing", "create", "--base-dir", home, "--base-url", origin],
  { cwd: root, env, encoding: "utf8", timeout: 60_000 },
);
const pairUrl = (cli.stdout.match(/https?:\/\/\S+\/pair#token=\S+/) || [])[0];
if (!pairUrl) fail(`no pairing url: ${cli.stdout.slice(0, 300)} ${cli.stderr.slice(0, 300)}`);

browser = await pw.chromium.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
});
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
const cdp = await page.context().newCDPSession(page);
await cdp.send("Performance.enable");
const installObserver = () =>
  page.evaluate(() => {
    window.__lt = [];
    new PerformanceObserver((l) =>
      l.getEntries().forEach((e) => window.__lt.push(e.duration)),
    ).observe({ type: "longtask", buffered: true });
  });
const takeLongTasks = () => page.evaluate(() => window.__lt.splice(0));
const metrics = async () => {
  await cdp.send("HeapProfiler.collectGarbage");
  const m = Object.fromEntries(
    (await cdp.send("Performance.getMetrics")).metrics.map((x) => [x.name, x.value]),
  );
  return {
    heapMb: +(m.JSHeapUsedSize / 2 ** 20).toFixed(1),
    nodes: m.Nodes,
    listeners: m.JSEventListeners,
  };
};
const firstRow = () =>
  page.waitForSelector("[data-timeline-row-id]", { timeout: 120_000 }).catch(async (e) => {
    await page.screenshot({ path: `C:/lcw/perf-regress/fail-${label}.png` }).catch(() => {});
    fail(
      `no sidebar row at ${page.url()}: ${(await page.innerText("body").catch(() => "")).slice(0, 600)}`,
    );
  });

// 1. App start: pair once, open a mid-size thread (warm-up), then reloads until its timeline rows show.
await page.goto(pairUrl);
await page.waitForURL((u) => !u.pathname.startsWith("/pair"), { timeout: 120_000 });
await page.goto(`${origin}/${envId}/${encodeURIComponent(meta.threadIds.p40)}`);
await firstRow();
const start = [];
for (let i = 0; i < 11; i++) {
  const t = Date.now();
  await page.reload();
  await firstRow();
  if (i > 0) start.push(Date.now() - t);
}
await installObserver();

// 2. Thread switch: client-side navigation, time until timeline rows show and loading is gone.
const threads = Object.entries(meta.threadIds);
const openThread = async (id) =>
  page.evaluate(
    async ({ url }) => {
      const t = performance.now();
      history.pushState({}, "", url);
      dispatchEvent(new PopStateEvent("popstate"));
      for (;;) {
        await new Promise((r) => requestAnimationFrame(r));
        const rows = document.querySelectorAll("[data-timeline-row-id]").length;
        if (
          rows > 0 &&
          !document.querySelector("[data-timeline-loading]") &&
          location.pathname === new URL(url).pathname
        )
          break;
        if (performance.now() - t > 60_000) return -1;
      }
      return performance.now() - t;
    },
    { url: `${origin}/${envId}/${encodeURIComponent(id)}` },
  );
const sw = Object.fromEntries(threads.map(([k]) => [k, []]));
const heap = [];
// Longest task inside each timed switch (0 when none). Its p90 is steadier than one max over all switches.
const perSwitch = [];
const cold = []; // first open of each thread in this page (cycle 0)
const switchLong = [];
for (let c = 0; c <= cycles; c++) {
  for (const [k, id] of threads) {
    await takeLongTasks();
    const ms = await openThread(id);
    await sleep(300);
    const lt = await takeLongTasks();
    if (c === 0) cold.push({ k, ms: Math.round(ms), lt: Math.max(0, ...lt) });
    if (c > 0) {
      sw[k].push(ms);
      perSwitch.push(Math.max(0, ...lt));
      switchLong.push(...lt);
    }
  }
  heap.push(await metrics());
}

// 3. Long-thread scroll: largest thread, scroll the timeline top to bottom; long tasks during the scroll.
await openThread(meta.threadIds.largest);
const scroll = [];
const scrollLong = [];
for (let i = 0; i < 11; i++) {
  await takeLongTasks();
  const ms = await page.evaluate(async () => {
    const rootEl = document.querySelector("[data-timeline-root]");
    let el = rootEl;
    while (
      el &&
      !(el.scrollHeight > el.clientHeight + 10 && getComputedStyle(el).overflowY !== "visible")
    )
      el = el.parentElement;
    if (!el) return -1;
    el.scrollTop = 0;
    await new Promise((r) => setTimeout(r, 200));
    const t = performance.now();
    for (let n = 0; n < 400 && el.scrollTop + el.clientHeight < el.scrollHeight - 2; n++) {
      el.scrollTop += 1200;
      await new Promise((r) => requestAnimationFrame(r));
    }
    return performance.now() - t;
  });
  const lt = await takeLongTasks();
  if (i > 0) {
    scroll.push(ms);
    scrollLong.push(Math.max(0, ...lt));
  }
}
const allLong = [...switchLong, ...scrollLong];
const result = {
  label,
  root,
  at: new Date().toISOString(),
  appStart: stat(start),
  threadSwitch: Object.fromEntries(Object.entries(sw).map(([k, v]) => [k, stat(v)])),
  scroll: { ...stat(scroll), worstLongTaskPerRun: stat(scrollLong) },
  coldOpen: cold,
  perSwitchLongTask: {
    ...stat(perSwitch),
    p90: +pct(perSwitch, 0.9).toFixed(0),
    sum: Math.round(perSwitch.reduce((a, b) => a + b, 0)),
  },
  longTasks: {
    switchCount: switchLong.length,
    switchMax: +Math.max(0, ...switchLong).toFixed(0),
    over200: allLong.filter((x) => x > 200).length,
  },
  heap: {
    first: heap[1],
    last: heap.at(-1),
    series: heap.map((h) => h.heapMb),
    nodes: heap.map((h) => h.nodes),
    listeners: heap.map((h) => h.listeners),
  },
  pageErrors: errors.slice(0, 5),
};
appendFileSync(out, JSON.stringify(result) + "\n");
console.log(JSON.stringify(result));
cleanup();
