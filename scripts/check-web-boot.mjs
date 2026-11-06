// Loads the built web app (apps/web/dist) in a headless browser and fails when
// the boot shell reports "Leonidas could not load". Catches module-order
// bugs (import cycles) that only appear in the production bundle: 0.24.0
// shipped with one and nothing else noticed until the installed app died.
// Run after the web build: node scripts/check-web-boot.mjs
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeHttp from "node:http";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";
import * as NodeProcess from "node:process";
const { extname } = NodePath;

const dist = NodeURL.fileURLToPath(new URL("../apps/web/dist", import.meta.url));
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
    NodeProcess.env.BOOT_CHECK_BROWSER,
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ];
  return candidates.find((candidate) => candidate && NodeFS.existsSync(candidate));
}

if (!NodeFS.existsSync(NodePath.join(dist, "index.html"))) {
  console.error(`boot check: ${dist} has no index.html. Build the web app first.`);
  NodeProcess.exit(2);
}
const browser = findBrowser();
if (!browser) {
  console.error("boot check: no Edge or Chrome found. Set BOOT_CHECK_BROWSER to its path.");
  NodeProcess.exit(2);
}

const server = NodeHttp.createServer((req, res) => {
  const path = NodePath.normalize(decodeURIComponent(new URL(req.url, "http://x").pathname));
  let file = NodePath.join(dist, path);
  if (!file.startsWith(dist) || !NodeFS.existsSync(file) || path === "/" || path.endsWith("\\")) {
    file = NodePath.join(dist, "index.html");
  }
  res.setHeader("content-type", MIME[extname(file)] ?? "application/octet-stream");
  res.end(NodeFS.readFileSync(file));
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}/`;

const profile = NodePath.join(NodeProcess.env.TEMP ?? "/tmp", `boot-check-${NodeProcess.pid}`);
const child = NodeChildProcess.spawn(
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
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  let nextId = 0;
  let bootProbeId = -1;
  const send = (method, params = {}) =>
    socket.send(JSON.stringify({ id: ++nextId, method, params }));
  socket.addEventListener("message", (event) => {
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
  });
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
  NodeProcess.exit(1);
}
console.log("Web bundle booted without a startup error.");
NodeProcess.exit(0);
