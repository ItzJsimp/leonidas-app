// Leonidas service worker: an offline app shell and a durable cache for hashed build files.
// Pages always come from the network first, so an online phone never runs an old build.
// Everything else (API, WebSocket, attachments, previews) passes through untouched.

const CACHE = "leonidas-shell-v1";
const SHELL_KEY = "/__shell";
// shortcut: evicts by insertion order, not last use; upgrade to LRU if old builds crowd the cap.
const MAX_ASSETS = 400;
const HASHED_ASSET = /^\/assets\/.+-[\w-]{8}\.[^/]+$/;

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirstPage(request, event));
  } else if (HASHED_ASSET.test(url.pathname)) {
    event.respondWith(cacheFirstAsset(request, event));
  }
});

async function networkFirstPage(request, event) {
  try {
    const response = await fetch(request);
    if (response.ok && (response.headers.get("content-type") ?? "").includes("text/html")) {
      event.waitUntil(saveShell(response.clone()));
    }
    return response;
  } catch (error) {
    const shell = await caches.open(CACHE).then((cache) => cache.match(SHELL_KEY));
    if (shell) return shell;
    throw error;
  }
}

// Only the app page is a valid offline shell; other HTML (pairing, previews) is skipped.
async function saveShell(response) {
  const html = await response.text();
  if (!html.includes('id="root"')) return;
  const cache = await caches.open(CACHE);
  await cache.put(
    SHELL_KEY,
    new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } }),
  );
}

async function cacheFirstAsset(request, event) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  // The server marks only real build output immutable; a custom file with a hash-like name is not.
  if (response.ok && (response.headers.get("cache-control") ?? "").includes("immutable")) {
    event.waitUntil(storeAsset(cache, request, response.clone()));
  }
  return response;
}

async function storeAsset(cache, request, response) {
  await cache.put(request, response);
  const keys = (await cache.keys()).filter((key) => new URL(key.url).pathname !== SHELL_KEY);
  await Promise.all(
    keys.slice(0, Math.max(0, keys.length - MAX_ASSETS)).map((key) => cache.delete(key)),
  );
}
