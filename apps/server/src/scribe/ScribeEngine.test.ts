import { afterEach, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Stream from "effect/Stream";
import { FetchHttpClient } from "effect/http";

// Loaded by path so the server typecheck does not pull the Node-only mock into its Effect rules.
interface MockScribeEngineOptions {
  readonly port?: number;
  readonly fail?: "status" | "events" | "dictionary" | "settings" | "all";
  readonly historyCount?: number;
  readonly processingMs?: number;
  readonly pingMs?: number;
}
// Resolved from this file, so the test runs from the repo root and from apps/server alike.
const mockPath = new URL("../../../../scripts/mock-scribe-engine.ts", import.meta.url).href;
const { startMockScribeEngine } = (await import(/* @vite-ignore */ mockPath)) as {
  startMockScribeEngine(
    options: MockScribeEngineOptions,
  ): Promise<{ port: number; close(): Promise<void> }>;
};
import { scribeEngineBaseUrl } from "./engineUrl.ts";
import * as ScribeEngine from "./ScribeEngine.ts";

const engines: Array<{ close(): Promise<void> }> = [];
afterEach(async () => {
  await Promise.all(engines.splice(0).map((engine) => engine.close()));
});

const withMock = (options: MockScribeEngineOptions = {}) =>
  Effect.gen(function* () {
    const mock = yield* Effect.promise(() =>
      startMockScribeEngine({ port: 0, processingMs: 20, pingMs: 50, ...options }),
    );
    engines.push(mock);
    return yield* ScribeEngine.makeWith({
      baseUrl: `http://127.0.0.1:${mock.port}`,
      retryEvery: "50 millis",
    });
  }).pipe(Effect.provide(FetchHttpClient.layer));

it.effect("starts and stops a dictation", () =>
  Effect.gen(function* () {
    const engine = yield* withMock();
    expect(yield* engine.start({ mode: "hold" })).toEqual({ state: "listening" });
    expect(yield* engine.stop({ paste: false })).toEqual({ state: "processing" });
  }),
);

it.effect("a retry with no saved take is not_found, and invalid_state while listening", () =>
  Effect.gen(function* () {
    const engine = yield* withMock();
    expect((yield* Effect.flip(engine.retry)).reason).toBe("not_found");
    yield* engine.start({ mode: "toggle" });
    expect((yield* Effect.flip(engine.retry)).reason).toBe("invalid_state");
  }),
);

it.effect("maps 409 to invalid_state", () =>
  Effect.gen(function* () {
    const engine = yield* withMock();
    const error = yield* Effect.flip(engine.stop({ paste: true }));
    expect(error.reason).toBe("invalid_state");
  }),
);

it.effect("pages history without duplicates", () =>
  Effect.gen(function* () {
    const engine = yield* withMock({ historyCount: 30 });
    const first = yield* engine.listHistory({ limit: 20 });
    expect(first.items).toHaveLength(20);
    expect(first.next).not.toBeNull();
    const second = yield* engine.listHistory({ limit: 20, before: first.next ?? undefined });
    expect(second.items).toHaveLength(10);
    const ids = new Set([...first.items, ...second.items].map((item) => item.id));
    expect(ids.size).toBe(30);
  }),
);

it.effect("deletes one history item and reports not_found the second time", () =>
  Effect.gen(function* () {
    const engine = yield* withMock({ historyCount: 5 });
    const page = yield* engine.listHistory({});
    const victim = page.items[2]?.id ?? "";
    expect(yield* engine.deleteHistory({ id: victim })).toEqual({ deleted: true });
    const after = yield* engine.listHistory({});
    expect(after.items).toHaveLength(4);
    expect(after.items.some((item) => item.id === victim)).toBe(false);
    const error = yield* Effect.flip(engine.deleteHistory({ id: victim }));
    expect(error.reason).toBe("not_found");
  }),
);

it.effect("reads and replaces the dictionary, and maps a rejected save to bad_request", () =>
  Effect.gen(function* () {
    const engine = yield* withMock();
    const before = yield* engine.getDictionary;
    expect(before.replacements.length).toBeGreaterThan(0);
    const saved = yield* engine.putDictionary({
      replacements: [{ wrong: "cube", correct: "Kube" }],
      vocabulary: ["Gersi"],
    });
    expect(saved.vocabulary).toEqual(["Gersi"]);
    expect((yield* engine.getDictionary).replacements).toEqual([
      { wrong: "cube", correct: "Kube" },
    ]);
    const error = yield* Effect.flip(
      engine.putDictionary({ replacements: [{ wrong: " ", correct: "x" }], vocabulary: [] }),
    );
    expect(error.reason).toBe("bad_request");
  }),
);

it.effect("lists suggestions and rejects one with an encoded phrase", () =>
  Effect.gen(function* () {
    const engine = yield* withMock();
    const { items } = yield* engine.listSuggestions;
    const phrase = items.find((item) => item.wrong.includes(" "));
    expect(phrase).toBeDefined();
    expect(yield* engine.rejectSuggestion({ wrong: phrase?.wrong ?? "" })).toEqual({
      rejected: true,
    });
    const after = yield* engine.listSuggestions;
    expect(after.items.some((item) => item.wrong === phrase?.wrong)).toBe(false);
  }),
);

it.effect("reads settings, patches one section and reports restartRequired", () =>
  Effect.gen(function* () {
    const engine = yield* withMock();
    const before = yield* engine.getSettings;
    expect(before.sections.transcription.groqKey).toEqual({ set: true });
    const audio = yield* engine.patchSettings({ section: "audio", values: { device: "USB Mic" } });
    expect(audio.restartRequired).toBe(false);
    expect(audio.values).toMatchObject({ device: "USB Mic", maxRecordSeconds: 600 });
    const model = yield* engine.patchSettings({
      section: "transcription",
      values: { polishModel: "llama-3.3-70b-versatile" },
    });
    expect(model.restartRequired).toBe(true);
    expect((yield* engine.getSettings).sections.audio.device).toBe("USB Mic");
    const error = yield* Effect.flip(
      engine.patchSettings({ section: "audio", values: { speed: 1 } }),
    );
    expect(error.reason).toBe("bad_request");
  }),
);

it.effect("lists input devices", () =>
  Effect.gen(function* () {
    const engine = yield* withMock();
    const { inputs } = yield* engine.listDevices;
    expect(inputs.some((input) => input.default)).toBe(true);
  }),
);

it.effect("sets and clears the Groq key without ever reading it back", () =>
  Effect.gen(function* () {
    const engine = yield* withMock();
    yield* engine.clearGroqKey;
    expect((yield* engine.getSettings).sections.transcription.groqKey).toEqual({ set: false });
    yield* engine.setGroqKey({ key: "gsk_test" });
    const settings = yield* engine.getSettings;
    expect(settings.sections.transcription.groqKey).toEqual({ set: true });
    expect(JSON.stringify(settings)).not.toContain("gsk_test");
  }),
);

it.effect("maps a dictionary store failure to store_error", () =>
  Effect.gen(function* () {
    const engine = yield* withMock({ fail: "dictionary" });
    expect((yield* Effect.flip(engine.getDictionary)).reason).toBe("store_error");
  }),
);

it.effect("maps a store failure to store_error", () =>
  Effect.gen(function* () {
    const engine = yield* withMock({ fail: "all" });
    const error = yield* Effect.flip(engine.listHistory({}));
    expect(error.reason).toBe("store_error");
  }),
);

it.effect("reports offline when no engine listens", () =>
  Effect.gen(function* () {
    const engine = yield* ScribeEngine.makeWith({ baseUrl: "http://127.0.0.1:9" }).pipe(
      Effect.provide(FetchHttpClient.layer),
    );
    const error = yield* Effect.flip(engine.listHistory({}));
    expect(error.reason).toBe("offline");
  }),
);

it.live("streams state, transcript and history events after a dictation", () =>
  Effect.gen(function* () {
    const engine = yield* withMock();
    const fiber = yield* engine.events.pipe(
      Stream.takeUntil((event) => event.type === "history"),
      Stream.runCollect,
      Effect.forkChild,
    );
    yield* Effect.sleep("100 millis");
    yield* engine.start({ mode: "toggle" });
    yield* engine.stop({ paste: true });
    const events = Array.from(yield* Fiber.join(fiber));
    expect(events.map((event) => event.type)).toEqual([
      "connection",
      "state",
      "state",
      "state",
      "state",
      "transcript",
      "history",
    ]);
    // The first state comes from /v1/status right after the connect.
    expect(events[1]).toMatchObject({ type: "state", state: "ready" });
  }),
);

it.live("reports one offline event while the engine is down, then reconnects", () =>
  Effect.gen(function* () {
    const engine = yield* withMock({ fail: "events" });
    const events = Array.from(
      yield* engine.events.pipe(
        Stream.filter((event) => event.type === "connection"),
        Stream.take(3),
        Stream.runCollect,
        Effect.timeout("2 seconds"),
      ),
    );
    // A failing stream connects, drops, and reconnects: link events alternate, never repeat.
    expect(events.map((event) => event.type === "connection" && event.connected)).toEqual([
      true,
      false,
      true,
    ]);
  }),
);

it("ignores comments and unknown events", () => {
  expect(ScribeEngine.parseEventLine(": ping")).toBeNull();
  expect(ScribeEngine.parseEventLine('data: {"type":"nope"}')).toBeNull();
  expect(
    ScribeEngine.parseEventLine('data: {"type":"state","state":"ready","at":"x"}'),
  ).toMatchObject({ type: "state", state: "ready" });
});

it("reads the engine port from the environment, loopback only", () => {
  expect(scribeEngineBaseUrl({})).toBe("http://127.0.0.1:8766");
  expect(scribeEngineBaseUrl({ LEONIDAS_SCRIBE_ENGINE_PORT: "8799" })).toBe(
    "http://127.0.0.1:8799",
  );
  expect(scribeEngineBaseUrl({ LEONIDAS_SCRIBE_ENGINE_PORT: "evil.com" })).toBe(
    "http://127.0.0.1:8766",
  );
});

it.effect("proxies meetings calls and keeps the engine message", () =>
  Effect.gen(function* () {
    const engine = yield* withMock();
    const list = (yield* engine.meetings({ method: "GET", path: "" })) as {
      items: Array<{ id: string }>;
    };
    expect(list.items[0]?.id).toBe("2026-11-07-0900-meeting");
    const error = yield* Effect.flip(
      Effect.asVoid(engine.meetings({ method: "GET", path: "nope" })),
    );
    expect([error.reason, error.message]).toEqual(["not_found", "No meeting with this id."]);
  }),
);

it("only lets meetings paths through, and Discord writes only with the settings call", () => {
  const ok = (method: "GET" | "PUT" | "POST", path: string, settings: boolean) =>
    ScribeEngine.meetingsPathAllowed({ method, path }, settings);
  expect(ok("GET", "", false)).toBe(true);
  expect(ok("POST", "2026-11-07-0900-meeting/ask", false)).toBe(true);
  expect(ok("GET", "discord", false)).toBe(true);
  expect(ok("PUT", "discord", false)).toBe(false);
  expect(ok("PUT", "discord", true)).toBe(true);
  expect(ok("POST", "discord/connect", true)).toBe(true);
  expect(ok("GET", "../history", false)).toBe(false);
  expect(ok("GET", "a/b/c/d", false)).toBe(false);
  expect(ok("GET", "live", true)).toBe(false);
});
