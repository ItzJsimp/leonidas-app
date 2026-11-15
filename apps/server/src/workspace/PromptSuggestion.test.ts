import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { vi } from "vite-plus/test";

import * as PromptSuggestion from "./PromptSuggestion.ts";

const messages = [
  { role: "user" as const, text: "Fix the login bug" },
  { role: "assistant" as const, text: "Fixed the token refresh in auth.ts." },
];
const makeSettings = (overrides: Record<string, unknown> = {}) =>
  ({
    getSettings: Effect.succeed({
      promptPredictionMode: "cloud",
      promptPredictionLocalModel: "",
      promptPredictionModelSelection: null,
      promptPredictionCloudRequestLimit: 30,
      textGenerationModelSelection: { instanceId: "codex", model: "m" },
      ...overrides,
    }),
  }) as never;

describe("PromptSuggestion", () => {
  it.effect("predicts once per chat state and serves repeats from cache", () =>
    Effect.gen(function* () {
      const generatePromptSuggestion = vi.fn(() =>
        Effect.succeed({ prompt: "Add a regression test for the token refresh." }),
      );
      const service = PromptSuggestion.make({ generatePromptSuggestion } as never, makeSettings());
      const first = yield* service.predict({ cwd: "/p", messages });
      const second = yield* service.predict({ cwd: "/p", messages });
      expect(first.prompt).toBe("Add a regression test for the token refresh.");
      expect(second).toEqual(first);
      expect(generatePromptSuggestion).toHaveBeenCalledTimes(1);
    }),
  );
  it.effect("returns null on provider failure and retries next time", () =>
    Effect.gen(function* () {
      let calls = 0;
      const generatePromptSuggestion = vi.fn(() => {
        calls++;
        return calls === 1
          ? Effect.fail("quota" as const)
          : Effect.succeed({ prompt: "Run the focused tests." });
      });
      const service = PromptSuggestion.make({ generatePromptSuggestion } as never, makeSettings());
      expect((yield* service.predict({ cwd: "/p", messages })).prompt).toBeNull();
      expect((yield* service.predict({ cwd: "/p", messages })).prompt).toBeNull();
    }),
  );
  it.effect("skips the model for an empty chat", () =>
    Effect.gen(function* () {
      const generatePromptSuggestion = vi.fn();
      const service = PromptSuggestion.make({ generatePromptSuggestion } as never, makeSettings());
      expect((yield* service.predict({ cwd: "/p", messages: [] })).prompt).toBeNull();
      expect(generatePromptSuggestion).not.toHaveBeenCalled();
    }),
  );
  it.effect("uses local mode without calling a model", () =>
    Effect.gen(function* () {
      const generatePromptSuggestion = vi.fn();
      const service = PromptSuggestion.make(
        { generatePromptSuggestion } as never,
        makeSettings({ promptPredictionMode: "local" }),
      );
      expect(
        (yield* service.predict({ cwd: "/p", messages, draft: "Please add" })).prompt,
      ).toBeNull();
      expect(generatePromptSuggestion).not.toHaveBeenCalled();
    }),
  );
  it.effect("preserves a draft and rejects a rewritten prefix", () =>
    Effect.gen(function* () {
      const generatePromptSuggestion = vi.fn(() =>
        Effect.succeed({ prompt: "Please add a focused test." }),
      );
      const service = PromptSuggestion.make({ generatePromptSuggestion } as never, makeSettings());
      expect((yield* service.predict({ cwd: "/p", messages, draft: "Please add" })).prompt).toBe(
        "Please add a focused test.",
      );
      expect(
        (yield* service.predict({ cwd: "/p", messages, draft: "please add" })).prompt,
      ).toBeNull();
    }),
  );
  it.effect("does not collide on messages with the same prefix and length", () =>
    Effect.gen(function* () {
      const generatePromptSuggestion = vi.fn(() =>
        Effect.succeed({ prompt: "Check the remaining cases." }),
      );
      const service = PromptSuggestion.make({ generatePromptSuggestion } as never, makeSettings());
      const first = "x".repeat(200) + "A";
      const second = "x".repeat(200) + "B";
      yield* service.predict({ cwd: "/p", messages: [{ role: "user", text: first }] });
      yield* service.predict({ cwd: "/p", messages: [{ role: "user", text: second }] });
      expect(generatePromptSuggestion).toHaveBeenCalledTimes(2);
    }),
  );
  it.effect("uses the configured local model at the fixed loopback endpoint", () =>
    Effect.gen(function* () {
      const fetcher = vi.fn(
        async (_url: string, _init: RequestInit) =>
          new Response(
            JSON.stringify({ response: JSON.stringify({ prompt: "Please add a test." }) }),
            { status: 200 },
          ),
      );
      const generatePromptSuggestion = vi.fn();
      const service = PromptSuggestion.make(
        { generatePromptSuggestion } as never,
        makeSettings({ promptPredictionMode: "local-model", promptPredictionLocalModel: "small" }),
        { fetch: fetcher as never },
      );
      expect((yield* service.predict({ cwd: "/p", messages, draft: "Please add" })).prompt).toBe(
        "Please add a test.",
      );
      expect(fetcher.mock.calls[0]?.[0]).toBe("http://127.0.0.1:11434/api/generate");
      expect(JSON.parse(fetcher.mock.calls[0]![1].body as string)).toMatchObject({
        model: "small",
        stream: false,
        think: false,
        keep_alive: "5m",
        options: { num_predict: 96 },
      });
      expect(generatePromptSuggestion).not.toHaveBeenCalled();
    }),
  );
  it.effect("enforces hourly cap and session spacing", () =>
    Effect.gen(function* () {
      let time = 10_000;
      const generatePromptSuggestion = vi.fn(() =>
        Effect.succeed({ prompt: "Review the latest diff." }),
      );
      const service = PromptSuggestion.make(
        { generatePromptSuggestion } as never,
        makeSettings({ promptPredictionCloudRequestLimit: 2 }),
        { now: () => time },
      );
      const req = (sessionId: string, draft: string) => ({ cwd: "/p", messages, sessionId, draft });
      expect((yield* service.predict(req("one", ""))).prompt).toBe("Review the latest diff.");
      expect((yield* service.predict(req("one", "Review"))).prompt).toBeNull();
      time += 5_000;
      expect((yield* service.predict(req("one", "Review"))).prompt).toBe("Review the latest diff.");
      expect((yield* service.predict(req("two", "Please"))).prompt).toBeNull();
      expect(generatePromptSuggestion).toHaveBeenCalledTimes(2);
    }),
  );
  it.effect("applies a provider failure cooldown without caching failure", () =>
    Effect.gen(function* () {
      let time = 0;
      const generatePromptSuggestion = vi
        .fn()
        .mockImplementationOnce(() => Effect.fail("quota"))
        .mockImplementation(() => Effect.succeed({ prompt: "Review the latest diff." }));
      const service = PromptSuggestion.make({ generatePromptSuggestion } as never, makeSettings(), {
        now: () => time,
      });
      expect((yield* service.predict({ cwd: "/p", messages })).prompt).toBeNull();
      time = 29_999;
      expect((yield* service.predict({ cwd: "/p", messages })).prompt).toBeNull();
      time = 30_000;
      expect((yield* service.predict({ cwd: "/p", messages })).prompt).toBe(
        "Review the latest diff.",
      );
      expect(generatePromptSuggestion).toHaveBeenCalledTimes(2);
    }),
  );
  it.effect("rejects generated claims of unobserved actions but preserves the typed prefix", () =>
    Effect.gen(function* () {
      const generatePromptSuggestion = vi.fn((input: { draft?: string }) =>
        Effect.succeed({
          prompt: input.draft
            ? "I've checked; please review remaining tests."
            : "I've checked the tests passed.",
        }),
      );
      const service = PromptSuggestion.make({ generatePromptSuggestion } as never, makeSettings());
      expect((yield* service.predict({ cwd: "/p", messages })).prompt).toBeNull();
      expect((yield* service.predict({ cwd: "/p", messages, draft: "I've checked" })).prompt).toBe(
        "I've checked; please review remaining tests.",
      );
    }),
  );
  it("aborts an active request when its session is cancelled", async () => {
    let started!: () => void;
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    const generatePromptSuggestion = vi.fn(() =>
      Effect.tryPromise({
        try: (signal) => {
          started();
          return new Promise<{ prompt: string }>((_resolve, reject) => {
            signal.addEventListener("abort", () => reject("aborted"), { once: true });
          });
        },
        catch: () => "aborted" as const,
      }),
    );
    const service = PromptSuggestion.make({ generatePromptSuggestion } as never, makeSettings());
    const pending = Effect.runPromise(service.predict({ cwd: "/p", messages, sessionId: "one" }));
    await ready;
    await Effect.runPromise(service.cancel("one"));
    expect((await pending).prompt).toBeNull();
  });
  it("allows only one cloud generation at a time", async () => {
    let started!: () => void;
    let finish!: (value: { prompt: string }) => void;
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    const response = new Promise<{ prompt: string }>((resolve) => {
      finish = resolve;
    });
    const generatePromptSuggestion = vi.fn(() =>
      Effect.tryPromise({
        try: () => {
          started();
          return response;
        },
        catch: () => "failed" as const,
      }),
    );
    const service = PromptSuggestion.make({ generatePromptSuggestion } as never, makeSettings());
    const first = Effect.runPromise(
      service.predict({ cwd: "/p", messages, draft: "Review", sessionId: "one" }),
    );
    await ready;
    expect(
      (
        await Effect.runPromise(
          service.predict({ cwd: "/p", messages, draft: "Please", sessionId: "two" }),
        )
      ).prompt,
    ).toBeNull();
    expect(generatePromptSuggestion).toHaveBeenCalledTimes(1);
    finish({ prompt: "Review the latest diff." });
    expect((await first).prompt).toBe("Review the latest diff.");
  });
  it.effect("rejects more than two added sentences", () =>
    Effect.gen(function* () {
      const service = PromptSuggestion.make(
        {
          generatePromptSuggestion: () =>
            Effect.succeed({ prompt: "Check one. Check two. Check three." }),
        } as never,
        makeSettings(),
      );
      expect((yield* service.predict({ cwd: "/p", messages })).prompt).toBeNull();
    }),
  );
  it.effect("separates cached answers by selected model", () =>
    Effect.gen(function* () {
      let model = "first";
      const dynamicSettings = {
        getSettings: Effect.sync(() => ({
          promptPredictionMode: "cloud",
          promptPredictionCloudRequestLimit: 30,
          promptPredictionModelSelection: { instanceId: "codex", model },
          textGenerationModelSelection: { instanceId: "codex", model: "fallback" },
        })),
      } as never;
      const generatePromptSuggestion = vi.fn(() =>
        Effect.succeed({ prompt: "Review the latest diff." }),
      );
      const service = PromptSuggestion.make(
        { generatePromptSuggestion } as never,
        dynamicSettings,
        { now: () => 0 },
      );
      yield* service.predict({ cwd: "/p", messages });
      model = "second";
      yield* service.predict({ cwd: "/p", messages });
      expect(generatePromptSuggestion).toHaveBeenCalledTimes(2);
    }),
  );
});
