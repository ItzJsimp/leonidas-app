// Loads the built web app (apps/web/dist) in a headless browser and fails when
// the boot shell reports "Leonidas could not load". Catches module-order
// bugs (import cycles) that only appear in the production bundle: 0.24.0
// shipped with one and nothing else noticed until the installed app died.
// Run after the web build: node scripts/check-web-boot.mjs
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const dist = fileURLToPath(new URL("../apps/web/dist", import.meta.url));
const CDP_PORT = 9341;
const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};

function findBrowser() {
  const candidates = [
    process.env.BOOT_CHECK_BROWSER,
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ];
  return candidates.find((candidate) => candidate && existsSync(candidate));
}

if (!existsSync(join(dist, "index.html"))) {
  console.error(`boot check: ${dist} has no index.html. Build the web app first.`);
  process.exit(2);
}
const browser = findBrowser();
if (!browser) {
  console.error("boot check: no Edge or Chrome found. Set BOOT_CHECK_BROWSER to its path.");
  process.exit(2);
}

const server = createServer((req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname));
  let file = join(dist, path);
  if (!file.startsWith(dist) || !existsSync(file) || path === "/" || path.endsWith("\\")) {
    file = join(dist, "index.html");
  }
  res.setHeader("content-type", MIME[extname(file)] ?? "application/octet-stream");
  res.end(readFileSync(file));
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}/`;

const profile = join(process.env.TEMP ?? "/tmp", `boot-check-${process.pid}`);
const child = spawn(
  browser,
  [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    `--user-data-dir=${profile}`,
    `--remote-debugging-port=${CDP_PORT}`,
    "about:blank",
  ],
  { stdio: "ignore" },
);

let failure = null;
try {
  let tab;
  for (let attempt = 0; attempt < 40 && !tab; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    tab = await fetch(`http://127.0.0.1:${CDP_PORT}/json`)
      .then((response) => response.json())
      .then((tabs) => tabs.find((entry) => entry.type === "page"))
      .catch(() => undefined);
  }
  if (!tab) throw new Error("browser did not expose a debugging page");

  const socket = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.onopen = resolve;
    socket.onerror = reject;
  });
  let nextId = 0;
  let bootProbeId = -1;
  const send = (method, params = {}) =>
    socket.send(JSON.stringify({ id: ++nextId, method, params }));
  socket.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.id === bootProbeId) {
      if (message.result?.result?.value === true) failure ??= "The boot error screen is showing.";
      return;
    }
    if (message.method === "Runtime.exceptionThrown") {
      failure ??= `Uncaught at boot: ${message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text}`;
      return;
    }
    if (message.method !== "Runtime.consoleAPICalled" || message.params.type !== "error") return;
    const text = message.params.args.map((arg) => arg.description ?? arg.value).join(" ");
    if (text.includes("failed to start")) failure ??= text;
  };
  send("Runtime.enable");
  send("Page.enable");
  send("Page.navigate", { url: origin });
  // The shell either renders the app or the boot error within a few seconds.
  await new Promise((resolve) => setTimeout(resolve, 12_000));
  bootProbeId = nextId + 1;
  send("Runtime.evaluate", { expression: "!!document.getElementById('boot-error')" });
  await new Promise((resolve) => setTimeout(resolve, 1_000));
} catch (error) {
  failure ??= `boot check could not run: ${error.message}`;
} finally {
  child.kill();
  server.close();
}

if (failure) {
  console.error(`Web bundle failed to boot:\n${failure.slice(0, 1500)}`);
  process.exit(1);
}
console.log("Web bundle booted without a startup error.");
process.exit(0);
