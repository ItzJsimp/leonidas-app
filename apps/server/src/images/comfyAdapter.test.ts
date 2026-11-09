import { describe, expect, it } from "vite-plus/test";

import {
  DEFAULT_COMFY_URL,
  createComfyAdapter,
  describeComfyError,
  normalizeBaseUrl,
} from "./comfyAdapter.ts";
import { ImageCancelledError } from "./imageSource.ts";

interface Call {
  readonly method: string;
  readonly path: string;
  readonly body: unknown;
}

/** A fake ComfyUI. `history` answers each poll in turn; the last answer repeats. */
function fakeComfy(options: {
  history?: ReadonlyArray<unknown>;
  promptStatus?: number;
  promptBody?: string;
  running?: ReadonlyArray<string>;
}) {
  const calls: Call[] = [];
  let polls = 0;
  const fetchFake = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const path = `${url.pathname}${url.search}`;
    const method = init?.method ?? "GET";
    calls.push({ method, path, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (url.pathname === "/prompt") {
      return new Response(options.promptBody ?? JSON.stringify({ prompt_id: "p1" }), {
        status: options.promptStatus ?? 200,
      });
    }
    if (url.pathname.startsWith("/history/")) {
      const history = options.history ?? [{}];
      const answer = history[Math.min(polls, history.length - 1)];
      polls += 1;
      return new Response(JSON.stringify(answer), { status: 200 });
    }
    if (url.pathname === "/view") return new Response(new Uint8Array([137, 80, 78, 71]));
    if (url.pathname === "/queue" && method === "GET") {
      return new Response(
        JSON.stringify({ queue_running: (options.running ?? []).map((id) => [0, id]) }),
      );
    }
    if (url.pathname === "/free") return new Response(null, { status: 200 });
    if (url.pathname === "/system_stats") return new Response("{}", { status: 200 });
    return new Response("{}", { status: 200 });
  }) as typeof fetch;
  return { calls, fetchFake };
}

const success = {
  p1: {
    status: { status_str: "success", messages: [] },
    outputs: { "14": { images: [{ filename: "tmp.png", subfolder: "", type: "temp" }] } },
  },
};

describe("normalizeBaseUrl", () => {
  it("accepts a plain address and removes the closing slash", () => {
    expect(normalizeBaseUrl("http://127.0.0.1:8188/")).toBe("http://127.0.0.1:8188");
    expect(normalizeBaseUrl("  localhost:8188 ")).toBe("http://localhost:8188");
    expect(DEFAULT_COMFY_URL).toBe("http://127.0.0.1:8188");
  });

  it("rejects empty text, other schemes and sign-in details", () => {
    expect(normalizeBaseUrl("")).toBeNull();
    expect(normalizeBaseUrl("file:///etc/passwd")).toBeNull();
    expect(normalizeBaseUrl("http://user:pw@host")).toBeNull();
    expect(normalizeBaseUrl("http://")).toBeNull();
  });
});

describe("comfy adapter generate", () => {
  const request = { modelId: "flux2klein", prompt: "ghost", seed: 5 };

  it("posts the prompt, polls the history, then reads the image with /view", async () => {
    const fake = fakeComfy({ history: [{}, {}, success] });
    const adapter = createComfyAdapter({
      baseUrl: () => "http://comfy.test",
      fetch: fake.fetchFake,
      sleep: async () => undefined,
    });
    const result = await adapter.generate(request);
    expect([...result.bytes]).toEqual([137, 80, 78, 71]);
    expect(result.settings).toMatchObject({ steps: 4, sampler: "euler" });

    const paths = fake.calls.map((call) => `${call.method} ${call.path.split("?")[0]}`);
    expect(paths).toEqual([
      "POST /prompt",
      "GET /history/p1",
      "GET /history/p1",
      "GET /history/p1",
      "GET /view",
    ]);
    const posted = fake.calls[0]!.body as {
      prompt: Record<string, { inputs: { noise_seed?: number } }>;
    };
    expect(posted.prompt["11"]?.inputs.noise_seed).toBe(5);
    expect(fake.calls.at(-1)!.path).toBe("/view?filename=tmp.png&subfolder=&type=temp");
  });

  it("explains a refused prompt in plain words", async () => {
    const fake = fakeComfy({
      promptStatus: 400,
      promptBody: JSON.stringify({
        error: { message: "Prompt outputs failed validation" },
        node_errors: {
          "1": { errors: [{ message: "Value not in list", details: "unet_name: 'x' not in []" }] },
        },
      }),
    });
    const adapter = createComfyAdapter({
      baseUrl: () => "http://comfy.test",
      fetch: fake.fetchFake,
    });
    await expect(adapter.generate(request)).rejects.toThrow(
      "ComfyUI said: Prompt outputs failed validation. Value not in list: unet_name: 'x' not in []",
    );
  });

  it("reports a failed run with the node and the reason", async () => {
    const fake = fakeComfy({
      history: [
        {
          p1: {
            status: {
              status_str: "error",
              messages: [
                ["execution_error", { exception_message: "out of memory", node_type: "KSampler" }],
              ],
            },
          },
        },
      ],
    });
    const adapter = createComfyAdapter({
      baseUrl: () => "http://comfy.test",
      fetch: fake.fetchFake,
    });
    await expect(adapter.generate(request)).rejects.toThrow(
      "ComfyUI failed (KSampler): out of memory",
    );
  });

  it("maps an interrupted run to a cancel", async () => {
    const fake = fakeComfy({
      history: [
        { p1: { status: { status_str: "error", messages: [["execution_interrupted", {}]] } } },
      ],
    });
    const adapter = createComfyAdapter({
      baseUrl: () => "http://comfy.test",
      fetch: fake.fetchFake,
    });
    await expect(adapter.generate(request)).rejects.toBeInstanceOf(ImageCancelledError);
  });

  it("stops waiting when the signal aborts", async () => {
    const fake = fakeComfy({ history: [{}] });
    const controller = new AbortController();
    const adapter = createComfyAdapter({
      baseUrl: () => "http://comfy.test",
      fetch: fake.fetchFake,
      sleep: async () => controller.abort(),
    });
    await expect(adapter.generate(request, { signal: controller.signal })).rejects.toBeInstanceOf(
      ImageCancelledError,
    );
  });

  it("says ComfyUI is not reachable when the connection fails", async () => {
    const adapter = createComfyAdapter({
      baseUrl: () => "http://comfy.test",
      fetch: (async () => {
        throw new TypeError("fetch failed");
      }) as typeof fetch,
    });
    await expect(adapter.generate(request)).rejects.toThrow(
      "Cannot reach ComfyUI at http://comfy.test. Start ComfyUI, then try again.",
    );
    expect(await adapter.status()).toEqual({
      online: false,
      message: "Cannot reach ComfyUI at http://comfy.test.",
    });
  });
});

describe("comfy adapter control calls", () => {
  it("checks the connection with /system_stats", async () => {
    const fake = fakeComfy({});
    const adapter = createComfyAdapter({
      baseUrl: () => "http://comfy.test",
      fetch: fake.fetchFake,
    });
    expect(await adapter.status()).toEqual({ online: true, message: null });
    expect(fake.calls[0]!.path).toBe("/system_stats");
  });

  it("frees memory with the exact body and never reads the empty reply as JSON", async () => {
    const fake = fakeComfy({});
    const adapter = createComfyAdapter({
      baseUrl: () => "http://comfy.test",
      fetch: fake.fetchFake,
    });
    await expect(adapter.freeMemory?.()).resolves.toBeUndefined();
    expect(fake.calls).toEqual([
      { method: "POST", path: "/free", body: { unload_models: true, free_memory: true } },
    ]);
  });

  it("uses the current address on every call", async () => {
    const fake = fakeComfy({});
    let address = "http://one.test";
    const seen: string[] = [];
    const adapter = createComfyAdapter({
      baseUrl: () => address,
      fetch: (async (input: string | URL | Request, init?: RequestInit) => {
        seen.push(String(input));
        return fake.fetchFake(input, init);
      }) as typeof fetch,
    });
    await adapter.status();
    address = "http://two.test";
    await adapter.status();
    expect(seen).toEqual(["http://one.test/system_stats", "http://two.test/system_stats"]);
  });

  it("interrupts only when its own prompt runs, else removes it from the queue", async () => {
    for (const [running, expected] of [
      [["p1"], "POST /interrupt"],
      [["other"], "POST /queue"],
    ] as const) {
      const fake = fakeComfy({ history: [{}], running });
      const controller = new AbortController();
      const adapter = createComfyAdapter({
        baseUrl: () => "http://comfy.test",
        fetch: fake.fetchFake,
        sleep: async () => {
          await adapter.interrupt();
          controller.abort();
        },
      });
      await adapter
        .generate({ modelId: "qwen", prompt: "x", seed: 1 }, { signal: controller.signal })
        .catch(() => undefined);
      const posts = fake.calls
        .filter((call) => call.method === "POST")
        .map((c) => `POST ${c.path}`);
      expect(posts).toContain(expected);
      expect(posts.filter((p) => p !== "POST /prompt" && p !== expected)).toEqual([]);
    }
  });

  it("does not interrupt another app when the queue cannot be read", async () => {
    const fake = fakeComfy({ history: [{}] });
    const controller = new AbortController();
    const adapter = createComfyAdapter({
      baseUrl: () => "http://comfy.test",
      fetch: (async (input, init) => {
        if (new URL(String(input)).pathname === "/queue" && !init?.method) {
          throw new Error("Queue unavailable");
        }
        return fake.fetchFake(input, init);
      }) as typeof fetch,
      sleep: async () => {
        await adapter.interrupt();
        controller.abort();
      },
    });
    await expect(
      adapter.generate({ modelId: "qwen", prompt: "x", seed: 1 }, { signal: controller.signal }),
    ).rejects.toBeInstanceOf(ImageCancelledError);
    expect(fake.calls.filter((call) => call.path === "/interrupt")).toEqual([]);
    expect(fake.calls).toContainEqual({ method: "POST", path: "/queue", body: { delete: ["p1"] } });
  });
});

describe("describeComfyError", () => {
  it("falls back to the status and raw text", () => {
    expect(describeComfyError(500, "boom")).toBe("ComfyUI answered 500: boom");
  });
});
