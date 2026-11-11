import { describe, expect, it } from "vite-plus/test";

import { createComfyAdapter } from "./comfyAdapter.ts";

type Step = "refused" | "timeout" | "ok";

const success = {
  p1: {
    status: { status_str: "success", messages: [] },
    outputs: { "14": { images: [{ filename: "tmp.png", subfolder: "", type: "temp" }] } },
  },
};

/** A ComfyUI that fails on a script. `script[path]` lists what each call to that path does, in order. */
function scriptedComfy(script: Record<string, ReadonlyArray<Step>>) {
  const counts = new Map<string, number>();
  const sleeps: number[] = [];
  const fetchFake = (async (input: string | URL | Request) => {
    const path = new URL(String(input)).pathname;
    const index = counts.get(path) ?? 0;
    counts.set(path, index + 1);
    const steps = script[path] ?? ["ok"];
    const step = steps[Math.min(index, steps.length - 1)];
    if (step === "refused") {
      throw new TypeError("fetch failed", { cause: { code: "ECONNREFUSED" } });
    }
    if (step === "timeout") throw new DOMException("The operation timed out.", "TimeoutError");
    if (path === "/prompt") return new Response(JSON.stringify({ prompt_id: "p1" }));
    if (path.startsWith("/history/")) return new Response(JSON.stringify(success));
    if (path === "/view") return new Response(new Uint8Array([1, 2, 3]));
    return new Response("{}");
  }) as typeof fetch;
  const adapter = createComfyAdapter({
    baseUrl: () => "http://comfy.test",
    fetch: fetchFake,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
  });
  return { adapter, counts, sleeps };
}

describe("cold or busy ComfyUI", () => {
  const request = { modelId: "flux2klein", prompt: "ghost", seed: 5 };

  it("tells a timeout from a refused connection in the status check", async () => {
    const busy = scriptedComfy({ "/system_stats": ["timeout"] });
    expect(await busy.adapter.status()).toMatchObject({ online: false, timedOut: true });
    const gone = scriptedComfy({ "/system_stats": ["refused"] });
    const status = await gone.adapter.status();
    expect(status.online).toBe(false);
    expect(status.timedOut).toBeUndefined();
    expect(status.message).toBe("Cannot reach ComfyUI at http://comfy.test.");
  });

  it("keeps waiting when history polls time out while a model loads", async () => {
    const fake = scriptedComfy({ "/history/p1": ["timeout", "timeout", "ok"] });
    const result = await fake.adapter.generate(request);
    expect([...result.bytes]).toEqual([1, 2, 3]);
    expect(fake.counts.get("/history/p1")).toBe(3);
  });

  it("retries a refused history poll up to twice, with backoff", async () => {
    const fake = scriptedComfy({ "/history/p1": ["refused", "refused", "ok"] });
    await expect(fake.adapter.generate(request)).resolves.toBeTruthy();
    expect(fake.sleeps).toEqual([1_000, 2_000]);
  });

  it("fails with the unreachable message after three refused history polls", async () => {
    const fake = scriptedComfy({ "/history/p1": ["refused"] });
    await expect(fake.adapter.generate(request)).rejects.toThrow(
      "Cannot reach ComfyUI at http://comfy.test. Start ComfyUI, then try again.",
    );
    expect(fake.counts.get("/history/p1")).toBe(3);
  });

  it("never repeats a submission after a connection failure or timeout", async () => {
    const refusedOnce = scriptedComfy({ "/prompt": ["refused", "ok"] });
    await expect(refusedOnce.adapter.generate(request)).rejects.toThrow("Cannot reach ComfyUI");
    expect(refusedOnce.counts.get("/prompt")).toBe(1);

    const timedOut = scriptedComfy({ "/prompt": ["timeout"] });
    await expect(timedOut.adapter.generate(request)).rejects.toThrow(
      "ComfyUI did not answer in time. It may be loading a model. Try again.",
    );
    expect(timedOut.counts.get("/prompt")).toBe(1);
  });

  it("retries a timed out /view, because reading an image twice is harmless", async () => {
    const fake = scriptedComfy({ "/view": ["timeout", "ok"] });
    await expect(fake.adapter.generate(request)).resolves.toBeTruthy();
    expect(fake.counts.get("/view")).toBe(2);
  });
});
