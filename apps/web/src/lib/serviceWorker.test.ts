import * as NodeVM from "node:vm";

import { describe, expect, it, vi } from "vite-plus/test";

import SOURCE from "../../public/sw.js?raw";
import { registerServiceWorker } from "./serviceWorker";

const ORIGIN = "https://pc.tailnet.ts.net";

class FakeCache {
  readonly entries = new Map<string, Response>();
  async match(request: Request | string) {
    const response = this.entries.get(keyOf(request));
    return response?.clone();
  }
  async put(request: Request | string, response: Response) {
    this.entries.set(keyOf(request), response);
  }
  async keys() {
    return [...this.entries.keys()].map((url) => new Request(url));
  }
  async delete(request: Request | string) {
    return this.entries.delete(keyOf(request));
  }
}

function keyOf(request: Request | string) {
  return new URL(typeof request === "string" ? request : request.url, ORIGIN).href;
}

function loadWorker(fetchImpl: (request: Request) => Promise<Response>) {
  const listeners = new Map<string, (event: unknown) => void>();
  const cache = new FakeCache();
  const fetch = vi.fn(fetchImpl);
  NodeVM.runInNewContext(SOURCE, {
    self: {
      location: { origin: ORIGIN },
      addEventListener: (type: string, listener: (event: unknown) => void) =>
        listeners.set(type, listener),
      skipWaiting: () => undefined,
      clients: { claim: async () => undefined },
    },
    caches: { open: async () => cache, keys: async () => [], delete: async () => true },
    fetch,
    Response,
    Request,
    URL,
    Promise,
    Math,
  });

  async function dispatch(request: Request): Promise<Response | undefined> {
    let responded: Promise<Response> | undefined;
    const pending: Promise<unknown>[] = [];
    listeners.get("fetch")!({
      request,
      respondWith: (value: Promise<Response>) => (responded = value),
      waitUntil: (value: Promise<unknown>) => pending.push(value),
    });
    const response = await responded;
    await Promise.all(pending);
    return response;
  }
  return { cache, fetch, dispatch };
}

const page = (path = "/") =>
  // Node's Request rejects mode "navigate", so the fake only carries what the worker reads.
  ({ method: "GET", url: `${ORIGIN}${path}`, mode: "navigate" }) as unknown as Request;
const html = (body: string) =>
  new Response(body, { headers: { "content-type": "text/html; charset=utf-8" } });

describe("sw.js", () => {
  it("serves pages from the network and keeps the app page as the offline shell", async () => {
    const online = loadWorker(async () => html('<div id="root"></div>v2'));
    const response = await online.dispatch(page("/chat/1"));
    expect(await response!.text()).toContain("v2");
    expect(online.cache.entries.has(`${ORIGIN}/__shell`)).toBe(true);
  });

  it("falls back to the saved shell only when the network fails", async () => {
    const worker = loadWorker(async () => html('<div id="root"></div>saved'));
    await worker.dispatch(page());
    worker.fetch.mockRejectedValueOnce(new TypeError("offline"));
    const response = await worker.dispatch(page("/settings"));
    expect(await response!.text()).toContain("saved");
  });

  it("does not save a non-app HTML page as the shell", async () => {
    const worker = loadWorker(async () => html("<p>pairing</p>"));
    await worker.dispatch(page("/pair"));
    expect(worker.cache.entries.size).toBe(0);
  });

  it("serves an immutable hashed asset from the cache after the first load", async () => {
    const worker = loadWorker(
      async () =>
        new Response("js", { headers: { "cache-control": "public, max-age=31536000, immutable" } }),
    );
    const asset = new Request(`${ORIGIN}/assets/index-AbCd1234.js`);
    await worker.dispatch(asset);
    await worker.dispatch(asset);
    expect(worker.fetch).toHaveBeenCalledTimes(1);
  });

  it("does not store a hash-like file the server did not mark immutable", async () => {
    const worker = loadWorker(
      async () => new Response("x", { headers: { "cache-control": "no-cache" } }),
    );
    await worker.dispatch(new Request(`${ORIGIN}/assets/custom-AbCd1234.js`));
    expect(worker.cache.entries.size).toBe(0);
  });

  it("passes API, cross-origin and non-GET requests through", async () => {
    const worker = loadWorker(async () => new Response("x"));
    expect(await worker.dispatch(new Request(`${ORIGIN}/api/threads`))).toBeUndefined();
    expect(
      await worker.dispatch(new Request("https://other.example/assets/a-AbCd1234.js")),
    ).toBeUndefined();
    expect(
      await worker.dispatch(new Request(`${ORIGIN}/assets/a-AbCd1234.js`, { method: "POST" })),
    ).toBeUndefined();
    expect(worker.fetch).not.toHaveBeenCalled();
  });

  it("keeps at most 400 assets plus the shell", async () => {
    const worker = loadWorker(async (request) =>
      request.mode === "navigate"
        ? html('<div id="root"></div>')
        : new Response("js", { headers: { "cache-control": "immutable" } }),
    );
    await worker.dispatch(page());
    for (let index = 0; index < 402; index += 1) {
      await worker.dispatch(new Request(`${ORIGIN}/assets/chunk${index}-AbCd1234.js`));
    }
    expect(worker.cache.entries.size).toBe(401);
    expect(worker.cache.entries.has(`${ORIGIN}/__shell`)).toBe(true);
    expect(worker.cache.entries.has(`${ORIGIN}/assets/chunk0-AbCd1234.js`)).toBe(false);
  });
});

describe("registerServiceWorker", () => {
  const container = () => ({ register: vi.fn(async () => ({}) as ServiceWorkerRegistration) });
  const base = { isProduction: true, isElectron: false, isSecureContext: true };

  it("registers /sw.js at the root in a secure production browser", () => {
    const sw = container();
    registerServiceWorker({ ...base, container: sw });
    expect(sw.register).toHaveBeenCalledWith("/sw.js", { scope: "/" });
  });

  it.each([
    ["development", { isProduction: false }],
    ["the desktop app", { isElectron: true }],
    ["plain http on a LAN address", { isSecureContext: false }],
  ] as const)("skips %s", (_label: string, override: Partial<typeof base>) => {
    const sw = container();
    expect(registerServiceWorker({ ...base, ...override, container: sw })).toBeNull();
    expect(sw.register).not.toHaveBeenCalled();
  });
});
