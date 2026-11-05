import { it, expect } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { make, type SkillPickRequest } from "./SkillPick.ts";

const OPENROUTER = { or1: { driver: "openrouter", enabled: true, config: { apiKey: "sk-or-1" } } };
const settings = (providerInstances: object = {}) =>
  ({
    getSettings: Effect.succeed({
      providerInstances,
      textGenerationModelSelection: { instanceId: "codex", model: "gpt-6-luna" },
    }),
  }) as never;

const request: SkillPickRequest = {
  cwd: "/project",
  request: "Fix the login bug",
  project: "app",
  alreadyAdded: [],
  candidates: [
    { name: "tdd", description: "Test-driven development." },
    { name: "diagnosing-bugs", description: "Find why something is broken." },
  ],
  max: 2,
  engine: "auto",
  openRouterModel: "openrouter/free",
  groqModel: "qwen/qwen3.8-27b",
  localModel: "",
};

const reply = (picks: object[], status = 200) =>
  new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ picks }) } }] }), {
    status,
  });

/** A fetch that records each call and answers per host. */
function fakeFetch(answers: Record<string, () => Response>) {
  const calls: { url: string; headers: Record<string, string>; body: any }[] = [];
  const fetcher = (async (url: string, init: RequestInit) => {
    calls.push({
      url,
      headers: init.headers as Record<string, string>,
      body: JSON.parse(String(init.body)),
    });
    const host = Object.keys(answers).find((key) => url.includes(key));
    if (!host) throw new TypeError("connection refused");
    return answers[host]!();
  }) as unknown as typeof fetch;
  return { calls, fetcher };
}

const chatModel = () => {
  const seen = { calls: 0, selection: undefined as unknown };
  return {
    seen,
    service: {
      pickSkills: (input: { modelSelection: unknown }) => {
        seen.calls += 1;
        seen.selection = input.modelSelection;
        return Effect.succeed({ picks: [{ name: "tdd", reason: "chat model" }] });
      },
    },
  };
};
const groqKey = Effect.succeed(Option.some("gsk-test"));
const noGroqKey = Effect.succeed(Option.none<string>());

it.effect("auto asks the OpenRouter free model first, with the saved key", () =>
  Effect.gen(function* () {
    const { calls, fetcher } = fakeFetch({
      "openrouter.ai": () => reply([{ name: "diagnosing-bugs", reason: "find the cause" }]),
    });
    const chat = chatModel();
    const result = yield* make(chat.service as never, settings(OPENROUTER), {
      groqKey,
      fetch: fetcher,
    }).pick(request);
    expect(result).toEqual({
      picks: [{ name: "diagnosing-bugs", reason: "find the cause" }],
      modelUsed: true,
      engine: "openrouter",
      model: "openrouter/free",
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.headers.Authorization).toBe("Bearer sk-or-1");
    expect(calls[0]!.body).toMatchObject({
      model: "openrouter/free",
      temperature: 0,
      response_format: { type: "json_object" },
    });
    expect(calls[0]!.body.messages[0].content).toContain("Fix the login bug");
    expect(chat.seen.calls).toBe(0);
  }),
);

it.effect(
  "auto moves to Groq when OpenRouter is rate limited, and skips OpenRouter next time",
  () =>
    Effect.gen(function* () {
      let clock = 1_000;
      const { calls, fetcher } = fakeFetch({
        "openrouter.ai": () => new Response("", { status: 429 }),
        "groq.com": () => reply([{ name: "tdd", reason: "test first" }]),
      });
      const service = make(chatModel().service as never, settings(OPENROUTER), {
        groqKey,
        fetch: fetcher,
        now: () => clock,
      });
      const first = yield* service.pick(request);
      expect(first).toMatchObject({ engine: "groq", model: "qwen/qwen3.8-27b", modelUsed: true });
      expect(calls.map((call) => new URL(call.url).host)).toEqual([
        "openrouter.ai",
        "api.groq.com",
      ]);
      expect(calls[1]!.headers.Authorization).toBe("Bearer gsk-test");

      clock += 60_000;
      yield* service.pick(request);
      expect(calls.map((call) => new URL(call.url).host)).toEqual([
        "openrouter.ai",
        "api.groq.com",
        "api.groq.com",
      ]);
    }),
);

it.effect("auto never uses the paid chat model, even when every free engine is missing", () =>
  Effect.gen(function* () {
    const { calls, fetcher } = fakeFetch({});
    const chat = chatModel();
    const result = yield* make(chat.service as never, settings(), {
      groqKey: noGroqKey,
      fetch: fetcher,
    }).pick(request);
    expect(result).toEqual({ picks: [], modelUsed: false });
    expect(calls).toHaveLength(0);
    expect(chat.seen.calls).toBe(0);
  }),
);

it.effect("auto never uses the paid chat model when every free engine fails", () =>
  Effect.gen(function* () {
    const { fetcher } = fakeFetch({
      "openrouter.ai": () => new Response("", { status: 500 }),
      "groq.com": () => new Response("not json", { status: 200 }),
    });
    const chat = chatModel();
    const result = yield* make(chat.service as never, settings(OPENROUTER), {
      groqKey,
      fetch: fetcher,
    }).pick({ ...request, localModel: "gemma4:12b" });
    expect(result.modelUsed).toBe(false);
    expect(chat.seen.calls).toBe(0);
  }),
);

it.effect("a local model joins auto only when the user names one, and sends no key", () =>
  Effect.gen(function* () {
    const { calls, fetcher } = fakeFetch({
      "127.0.0.1:11434": () => reply([{ name: "tdd", reason: "local" }]),
    });
    const service = make(chatModel().service as never, settings(), {
      groqKey: noGroqKey,
      fetch: fetcher,
    });
    expect((yield* service.pick(request)).modelUsed).toBe(false);
    const result = yield* service.pick({ ...request, localModel: "gemma4:12b" });
    expect(result).toMatchObject({ engine: "local", model: "gemma4:12b", modelUsed: true });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.headers.Authorization).toBeUndefined();
  }),
);

it.effect("an explicit engine runs alone", () =>
  Effect.gen(function* () {
    const { calls, fetcher } = fakeFetch({ "openrouter.ai": () => reply([]) });
    const result = yield* make(chatModel().service as never, settings(OPENROUTER), {
      groqKey: noGroqKey,
      fetch: fetcher,
    }).pick({ ...request, engine: "groq" });
    expect(result.modelUsed).toBe(false);
    expect(calls).toHaveLength(0);
  }),
);

it.effect("chat is the only choice that uses the chat model", () =>
  Effect.gen(function* () {
    const { calls, fetcher } = fakeFetch({});
    const chat = chatModel();
    const result = yield* make(chat.service as never, settings(OPENROUTER), {
      groqKey,
      fetch: fetcher,
    }).pick({ ...request, engine: "chat" });
    expect(result).toMatchObject({ engine: "chat", model: "gpt-6-luna", modelUsed: true });
    expect(chat.seen.selection).toEqual({ instanceId: "codex", model: "gpt-6-luna" });
    expect(calls).toHaveLength(0);
  }),
);

it.effect("keyword only asks nothing", () =>
  Effect.gen(function* () {
    const { calls, fetcher } = fakeFetch({ "openrouter.ai": () => reply([]) });
    const chat = chatModel();
    const result = yield* make(chat.service as never, settings(OPENROUTER), {
      groqKey,
      fetch: fetcher,
    }).pick({ ...request, engine: "keyword" });
    expect(result.modelUsed).toBe(false);
    expect(calls).toHaveLength(0);
    expect(chat.seen.calls).toBe(0);
  }),
);

it.effect("drops invented and repeated skill names from a model reply", () =>
  Effect.gen(function* () {
    const { fetcher } = fakeFetch({
      "openrouter.ai": () =>
        reply([
          { name: "made-up", reason: "x" },
          { name: "tdd", reason: "ok" },
          { name: "tdd", reason: "again" },
        ]),
    });
    const result = yield* make(chatModel().service as never, settings(OPENROUTER), {
      groqKey: noGroqKey,
      fetch: fetcher,
    }).pick(request);
    expect(result.picks).toEqual([{ name: "tdd", reason: "ok" }]);
  }),
);

it.effect(
  "treats a reply wrapped in prose or a think block as valid, and an empty list as an answer",
  () =>
    Effect.gen(function* () {
      const wrapped = () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: '<think>hmm</think>Sure! {"picks":[{"name":"tdd","reason":"r"}]}',
                },
              },
            ],
          }),
        );
      const a = fakeFetch({ "openrouter.ai": wrapped });
      const r1 = yield* make(chatModel().service as never, settings(OPENROUTER), {
        groqKey: noGroqKey,
        fetch: a.fetcher,
      }).pick(request);
      expect(r1.picks.map((p) => p.name)).toEqual(["tdd"]);

      const b = fakeFetch({ "openrouter.ai": () => reply([]) });
      const r2 = yield* make(chatModel().service as never, settings(OPENROUTER), {
        groqKey: noGroqKey,
        fetch: b.fetcher,
      }).pick(request);
      expect(r2).toMatchObject({ picks: [], modelUsed: true, engine: "openrouter" });
    }),
);
