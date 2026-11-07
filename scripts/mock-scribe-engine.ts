// Mock Scribe engine: follows contract v1.1 and v1.2 (history, dictionary, suggestions, settings, devices).
// Lets the UI be built before the Rust engine is ready.
import * as NodeURL from "node:url";
import * as Clock from "effect/Clock";
import * as Console from "effect/Console";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import type * as Fiber from "effect/Fiber";
import {
  startMockHttpServer,
  type MockRequest,
  type MockResponse,
} from "./lib/mock-http-server.ts";

export type MockFailMode = "status" | "events" | "history" | "dictionary" | "settings" | "all";

export interface MockScribeEngineOptions {
  port?: number;
  empty?: boolean;
  fail?: MockFailMode;
  /** Run one full dictation cycle every N seconds. */
  demoSeconds?: number;
  seed?: number;
  historyCount?: number;
  pingMs?: number;
  processingMs?: number;
}

export interface MockScribeEngine {
  port: number;
  close(): Promise<void>;
}

type State = "ready" | "listening" | "processing" | "mic_error";
type Mode = "hands-free" | "hold" | "toggle";

interface HistoryItem {
  id: string;
  at: string;
  mode: Mode;
  app: string;
  rawText: string;
  cleanedText: string;
  words: number;
  metrics: { transcribeMs: number; polishMs: number; totalMs: number };
  pasted: boolean;
}

const MODES: readonly Mode[] = ["hands-free", "hold", "toggle"];
const APPS = ["code.exe", "chrome.exe", "discord.exe", "claude.exe", "notepad.exe"] as const;
const SENTENCES = [
  "Please send the report by the end of the day.",
  "The meeting moved to Thursday afternoon.",
  "I will review the draft and leave comments.",
  "The build finished without any errors.",
  "Let us plan the next steps for the release.",
  "Add a short note to the task about the open question.",
  "The new layout looks cleaner on a small screen.",
  "Remember to update the schedule before the weekend.",
  "We should test this change on a second machine.",
  "The draft needs a clearer title and a short summary.",
  "Check the numbers again before we share them.",
  "I think the plan works if we keep the scope small.",
] as const;
const DAY_MS = 86_400_000;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rng: () => number, list: readonly T[]): T {
  return list[Math.floor(rng() * list.length)] as T;
}

function makeTexts(rng: () => number): { rawText: string; cleanedText: string; words: number } {
  const count = 1 + Math.floor(rng() * 3);
  const parts: string[] = [];
  for (let i = 0; i < count; i += 1) parts.push(pick(rng, SENTENCES));
  const cleanedText = parts.join(" ");
  const rawText = cleanedText.toLowerCase().replace(/[.,!?]/g, "");
  return { rawText, cleanedText, words: cleanedText.split(/\s+/).length };
}

function makeItem(
  rng: () => number,
  id: string,
  at: DateTime.Utc,
  mode: Mode,
  app: string,
  pasted: boolean,
): HistoryItem {
  const texts = makeTexts(rng);
  const transcribeMs = 300 + Math.floor(rng() * 900);
  const polishMs = 150 + Math.floor(rng() * 500);
  return {
    id,
    at: DateTime.formatIso(at),
    ...texts,
    mode,
    app,
    metrics: { transcribeMs, polishMs, totalMs: transcribeMs + polishMs + 40 },
    pasted,
  };
}

function buildHistory(
  seed: number,
  count: number,
  now = Effect.runSync(Clock.currentTimeMillis),
): HistoryItem[] {
  const rng = mulberry32(seed);
  const gaps: number[] = [];
  let sum = 0;
  for (let i = 0; i < count; i += 1) {
    const gap = 0.2 + rng();
    gaps.push(gap);
    sum += gap;
  }
  const scale = (30 * DAY_MS) / (sum || 1);
  const items: HistoryItem[] = [];
  let offset = 0;
  for (let i = 0; i < count; i += 1) {
    offset += (gaps[i] as number) * scale;
    const id = `h${String(count - i).padStart(5, "0")}`;
    items.push(
      makeItem(
        rng,
        id,
        DateTime.makeUnsafe(Math.trunc(now - offset)),
        pick(rng, MODES),
        pick(rng, APPS),
        rng() < 0.9,
      ),
    );
  }
  return items;
}

const SETTINGS_SECTIONS = [
  "hotkeys",
  "audio",
  "transcription",
  "presets",
  "hud",
  "features",
  "goals",
] as const;
type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

function defaultSettings() {
  return {
    hotkeys: { hold: ["Ctrl + Shift + T"], toggle: ["Mouse5"], cancel: ["Escape"] },
    audio: { device: null as string | null, maxRecordSeconds: 600, minRecordMs: 250 },
    transcription: {
      privateMode: false,
      polishEnabled: true,
      polishInstructions: null as string | null,
      whisperModel: "whisper-large-v3-turbo",
      whisperModelBackup: "whisper-large-v3",
      polishModel: "qwen/qwen3.8-27b",
      backupPolishModel: "openai/gpt-oss-20b",
    },
    presets: {} as Record<string, unknown>,
    hud: { enabled: true },
    features: {} as Record<string, unknown>,
    goals: {} as Record<string, unknown>,
  };
}

const isStrings = (v: unknown) => Array.isArray(v) && v.every((x) => typeof x === "string");
const isString = (v: unknown) => typeof v === "string";
const isBool = (v: unknown) => typeof v === "boolean";
const isCount = (v: unknown) => Number.isInteger(v) && (v as number) >= 0;

/** Typed sections accept only their own keys with the right types, like the Rust engine. */
const SETTINGS_TYPES: Record<string, Record<string, (v: unknown) => boolean>> = {
  hotkeys: { hold: isStrings, toggle: isStrings, cancel: isStrings },
  audio: {
    device: (v) => v === null || isString(v),
    maxRecordSeconds: isCount,
    minRecordMs: isCount,
  },
  transcription: {
    privateMode: isBool,
    polishEnabled: isBool,
    polishInstructions: (v) => v === null || isString(v),
    whisperModel: isString,
    whisperModelBackup: isString,
    polishModel: isString,
    backupPolishModel: isString,
  },
  hud: { enabled: isBool },
};

/** A change to one of these keys applies only after the engine restarts. */
const RESTART_KEYS: Record<string, string[]> = {
  hotkeys: [],
  audio: [],
  transcription: ["whisperModel", "whisperModelBackup", "polishModel", "backupPolishModel"],
  hud: ["enabled"],
};

/** The engine's `PUT /v1/dictionary` rules: exact fields, a non-empty `wrong`, at most 800 words. */
function parseDictionary(body: Record<string, unknown> | null): {
  replacements: { wrong: string; correct: string }[];
  vocabulary: string[];
} | null {
  if (body === null) return null;
  const keys = Object.keys(body);
  if (keys.some((key) => key !== "replacements" && key !== "vocabulary")) return null;
  const { replacements, vocabulary } = body;
  if (!Array.isArray(replacements) || !Array.isArray(vocabulary) || vocabulary.length > 800) {
    return null;
  }
  const rules: { wrong: string; correct: string }[] = [];
  for (const rule of replacements) {
    if (typeof rule !== "object" || rule === null) return null;
    const { wrong, correct } = rule as Record<string, unknown>;
    if (typeof wrong !== "string" || typeof correct !== "string" || wrong.trim() === "")
      return null;
    rules.push({ wrong, correct });
  }
  if (vocabulary.some((word) => typeof word !== "string")) return null;
  return { replacements: rules, vocabulary: vocabulary as string[] };
}

export async function startMockScribeEngine(
  options: MockScribeEngineOptions = {},
): Promise<MockScribeEngine> {
  const failStatus = options.fail === "status" || options.fail === "all";
  const failEvents = options.fail === "events" || options.fail === "all";
  const failHistory = options.fail === "history" || options.fail === "all";
  const failDictionary = options.fail === "dictionary" || options.fail === "all";
  const failSettings = options.fail === "settings" || options.fail === "all";
  const seed = options.seed ?? 1;
  const pingMs = options.pingMs ?? 15_000;
  const processingMs = options.processingMs ?? 600;
  const history: HistoryItem[] = options.empty
    ? []
    : buildHistory(seed, options.historyCount ?? 200);
  const liveRng = mulberry32(seed ^ 0x9e3779b9);
  let nextLiveId = history.length + 1;

  // Dictionary and suggestions: same rules as the Rust engine (contract v1.2).
  let dictionary: { replacements: { wrong: string; correct: string }[]; vocabulary: string[] } =
    options.empty
      ? { replacements: [], vocabulary: [] }
      : {
          replacements: [{ wrong: "btw", correct: "by the way" }],
          vocabulary: ["Gersi", "Leonidas"],
        };
  const mined = options.empty
    ? []
    : [
        { wrong: "jersey", correct: "Gersi", count: 5 },
        { wrong: "leo nightness", correct: "Leonidas", count: 3 },
        { wrong: "cooper netties", correct: "Kubernetes", count: 2 },
      ];
  const rejected = new Set<string>();

  // Settings: the engine's 7 sections. Keys are never returned, only `{set}`.
  const settings = defaultSettings();
  const devices = [
    {
      id: "Microphone (Synthetic USB Audio)",
      name: "Microphone (Synthetic USB Audio)",
      default: true,
    },
    {
      id: "Headset Microphone (Synthetic)",
      name: "Headset Microphone (Synthetic)",
      default: false,
    },
    { id: "Line In (Synthetic)", name: "Line In (Synthetic)", default: false },
  ];
  const readSection = (name: SettingsSection) =>
    name === "transcription" ? { ...settings[name], groqKey: { set: groqKey } } : settings[name];

  let state: State = "ready";
  let groqKey = true;
  let currentMode: Mode = "hold";
  let boundPort = 0;
  const clients = new Set<MockResponse>();
  const timers = new Set<Fiber.Fiber<void>>();

  const base = { service: "leonidas-scribe", apiVersion: 1 } as const;

  const emit = (event: Record<string, unknown>) => {
    const line = `data: ${JSON.stringify({ ...base, ...event })}\n\n`;
    for (const res of clients) res.write(line);
  };
  const setState = (next: State) => {
    state = next;
    emit({ type: "state", state, at: DateTime.formatIso(DateTime.nowUnsafe()) });
  };
  const later = (ms: number, fn: () => void) => {
    const t = Effect.runFork(
      Effect.sleep(ms).pipe(
        Effect.andThen(
          Effect.sync(() => {
            timers.delete(t);
            fn();
          }),
        ),
      ),
    );
    timers.add(t);
  };

  const finishDictation = (paste: boolean) => {
    const item = makeItem(
      liveRng,
      `h${String(nextLiveId++).padStart(5, "0")}`,
      DateTime.nowUnsafe(),
      currentMode,
      pick(liveRng, APPS),
      paste,
    );
    history.unshift(item);
    setState("ready");
    emit({
      type: "transcript",
      text: item.cleanedText,
      raw: item.rawText,
      durationMs: item.metrics.totalMs,
      pasted: paste,
      engine: "groq",
      at: item.at,
    });
    emit({ type: "history", item });
  };
  const startDictation = (mode: Mode) => {
    currentMode = mode;
    setState("listening");
  };
  const stopDictation = (paste: boolean) => {
    setState("processing");
    later(processingMs, () => finishDictation(paste));
  };

  const send = (res: MockResponse, status: number, body?: Record<string, unknown>) => {
    res.setHeader("Cache-Control", "no-store");
    if (body === undefined) {
      res.writeHead(status);
      res.end();
      return;
    }
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ...base, ...body }));
  };
  const fail = (res: MockResponse, status: number, error: string) => send(res, status, { error });

  const readJson = (req: MockRequest): Promise<Record<string, unknown> | null> =>
    new Promise((resolve) => {
      const chunks: Buffer[] = [];
      req.on("data", (c: Buffer) => chunks.push(c));
      req.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8").trim();
        if (text === "") return resolve({});
        try {
          const value: unknown = JSON.parse(text);
          resolve(
            value && typeof value === "object" && !Array.isArray(value)
              ? (value as Record<string, unknown>)
              : null,
          );
        } catch {
          resolve(null);
        }
      });
      req.on("error", () => resolve(null));
    });

  const mockMeeting = {
    id: "2026-11-07-0900-meeting",
    title: "Mock call",
    started: "2026-11-07T09:00:00.000Z",
    ended: "2026-11-07T09:05:00.000Z",
    durationMs: 300_000,
    state: "done",
    app: "Discord",
    people: ["Me", "Speaker 1"],
    pinned: false,
    imported: false,
    hasTranscript: true,
    hasAudio: true,
    audioDeletesAt: "2026-12-07T09:05:00.000Z",
    notesState: "done",
    notesError: null,
    transcribeError: null,
    template: "default",
  };
  const handle = async (req: MockRequest, res: MockResponse) => {
    if (req.headers.origin !== undefined || req.headers.host !== `127.0.0.1:${boundPort}`) {
      return fail(res, 403, "forbidden");
    }
    const method = req.method ?? "GET";
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const path = url.pathname;
    const allow = (...methods: string[]) => {
      if (methods.includes(method)) return true;
      fail(res, 405, "method_not_allowed");
      return false;
    };

    if (path === "/v1/status") {
      if (!allow("GET")) return;
      if (failStatus) return fail(res, 503, "status_unavailable");
      return send(res, 200, {
        state,
        sampledAt: DateTime.formatIso(DateTime.nowUnsafe()),
        groqKey,
        privateMode: false,
      });
    }
    if (path === "/v1/start") {
      if (!allow("POST")) return;
      const body = await readJson(req);
      if (body === null) return fail(res, 400, "bad_request");
      const mode = body.mode ?? "hold";
      if (mode !== "hold" && mode !== "toggle") return fail(res, 400, "bad_request");
      if (state !== "ready") return fail(res, 409, "invalid_state");
      startDictation(mode);
      return send(res, 200, { state });
    }
    if (path === "/v1/stop") {
      if (!allow("POST")) return;
      const body = await readJson(req);
      if (body === null) return fail(res, 400, "bad_request");
      if (state !== "listening") return fail(res, 409, "invalid_state");
      stopDictation(body.paste !== false);
      return send(res, 200, { state });
    }
    if (path === "/v1/retry") {
      // The mock never fails a take, so it has nothing saved to retry.
      if (!allow("POST")) return;
      if (state !== "ready") return fail(res, 409, "invalid_state");
      return fail(res, 404, "nothing_to_retry");
    }
    // Meetings (contract v1.6): one saved meeting, enough for the server bridge and web dev.
    if (path === "/v1/meetings") {
      if (!allow("GET")) return;
      return send(res, 200, { items: [mockMeeting] });
    }
    if (path === `/v1/meetings/${mockMeeting.id}`) {
      if (!allow("GET")) return;
      return send(res, 200, {
        ...mockMeeting,
        transcript: [{ speaker_key: "Me", t0: 0, t1: 2, text: "Hello." }],
        note: { title: mockMeeting.title, summary: ["A short test call."] },
      });
    }
    if (path.startsWith("/v1/meetings/")) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "not_found", message: "No meeting with this id." }));
      return;
    }
    if (path === "/v1/credentials/groq") {
      if (!allow("PUT", "DELETE")) return;
      if (method === "PUT") {
        const body = await readJson(req);
        if (body === null || typeof body.key !== "string" || body.key === "") {
          return fail(res, 400, "bad_request");
        }
        groqKey = true;
      } else {
        groqKey = false;
      }
      return send(res, 204);
    }
    if (path === "/v1/events") {
      if (!allow("GET")) return;
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-store",
        Connection: "keep-alive",
      });
      if (failEvents) {
        res.end();
        return;
      }
      clients.add(res);
      res.write(": connected\n\n");
      const ping = Effect.runFork(
        Effect.sleep(pingMs).pipe(
          Effect.andThen(
            Effect.sync(() => {
              res.write(": ping\n\n");
            }),
          ),
          Effect.forever,
        ),
      );
      res.on("close", () => {
        ping.interruptUnsafe();
        clients.delete(res);
      });
      return;
    }
    if (path === "/v1/history") {
      if (!allow("GET")) return;
      if (failHistory) return fail(res, 500, "store_error");
      const limitRaw = url.searchParams.get("limit");
      const limit = limitRaw === null ? 50 : Number(limitRaw);
      if (!Number.isInteger(limit) || limit < 1) return fail(res, 400, "bad_request");
      const mode = url.searchParams.get("mode");
      const before = url.searchParams.get("before");
      let list = mode ? history.filter((i) => i.mode === mode) : history;
      if (before !== null) {
        const idx = list.findIndex((i) => i.id === before);
        list = idx < 0 ? [] : list.slice(idx + 1);
      }
      const size = Math.min(limit, 500);
      const items = list.slice(0, size);
      const next = list.length > size ? (items[items.length - 1]?.id ?? null) : null;
      return send(res, 200, { items, next });
    }
    const del = /^\/v1\/history\/([^/]+)$/.exec(path);
    if (del) {
      if (!allow("DELETE")) return;
      if (failHistory) return fail(res, 500, "store_error");
      const idx = history.findIndex((i) => i.id === decodeURIComponent(del[1] as string));
      if (idx < 0) return fail(res, 404, "not_found");
      history.splice(idx, 1);
      return send(res, 200, { deleted: true });
    }
    if (path === "/v1/settings") {
      if (!allow("GET", "PATCH")) return;
      if (failSettings) return fail(res, 500, "store_error");
      if (method === "GET") {
        const sections = Object.fromEntries(SETTINGS_SECTIONS.map((n) => [n, readSection(n)]));
        return send(res, 200, { sections });
      }
      const body = await readJson(req);
      const section = body?.section;
      const values = body?.values;
      if (
        typeof section !== "string" ||
        !(SETTINGS_SECTIONS as readonly string[]).includes(section) ||
        typeof values !== "object" ||
        values === null ||
        Array.isArray(values)
      ) {
        return fail(res, 400, "bad_request");
      }
      const name = section as SettingsSection;
      const patch = values as Record<string, unknown>;
      let restartRequired = false;
      if (name === "presets" || name === "features" || name === "goals") {
        Object.assign(settings[name], patch);
      } else {
        const current = settings[name] as Record<string, unknown>;
        const merged = { ...current };
        for (const [key, value] of Object.entries(patch)) {
          const check = SETTINGS_TYPES[name]?.[key];
          if (check === undefined || !check(value)) return fail(res, 400, "bad_request");
          merged[key] = value;
        }
        restartRequired = (RESTART_KEYS[name] ?? []).some((key) => merged[key] !== current[key]);
        Object.assign(current, merged);
      }
      return send(res, 200, { section: name, values: readSection(name), restartRequired });
    }
    if (path === "/v1/devices") {
      if (!allow("GET")) return;
      if (failSettings) return fail(res, 500, "mic_error");
      return send(res, 200, { inputs: devices });
    }
    if (path === "/v1/dictionary") {
      if (!allow("GET", "PUT")) return;
      if (failDictionary) return fail(res, 500, "store_error");
      if (method === "GET") return send(res, 200, dictionary);
      const body = await readJson(req);
      const next = parseDictionary(body);
      if (next === null) return fail(res, 400, "bad_request");
      dictionary = next;
      return send(res, 200, dictionary);
    }
    if (path === "/v1/dictionary/suggestions") {
      if (!allow("GET")) return;
      if (failDictionary) return fail(res, 500, "store_error");
      const known = new Set(dictionary.replacements.map((r) => r.wrong.toLowerCase()));
      const items = mined.filter((s) => !known.has(s.wrong) && !rejected.has(s.wrong));
      return send(res, 200, { items });
    }
    const reject = /^\/v1\/dictionary\/suggestions\/([^/]+)$/.exec(path);
    if (reject) {
      if (!allow("DELETE")) return;
      let wrong: string;
      try {
        wrong = decodeURIComponent(reject[1] as string).toLowerCase();
      } catch {
        return fail(res, 400, "bad_request");
      }
      if (failDictionary) return fail(res, 500, "store_error");
      rejected.add(wrong);
      return send(res, 200, { rejected: true });
    }
    return fail(res, 404, "not_found");
  };

  const server = await startMockHttpServer(options.port ?? 8766, (req, res) =>
    handle(req, res).catch(() => {
      if (!res.headersSent) fail(res, 500, "store_error");
      else res.end();
    }),
  );
  boundPort = server.port;

  if (options.demoSeconds && options.demoSeconds > 0) {
    const demo = Effect.runFork(
      Effect.sleep(options.demoSeconds * 1000).pipe(
        Effect.andThen(
          Effect.sync(() => {
            if (state !== "ready") return;
            startDictation("hold");
            later(1500, () => stopDictation(true));
          }),
        ),
        Effect.forever,
      ),
    );
    timers.add(demo);
  }

  return {
    port: boundPort,
    close: async () => {
      for (const t of timers) {
        t.interruptUnsafe();
      }
      timers.clear();
      for (const res of clients) res.destroy();
      clients.clear();
      await server.close();
    },
  };
}

function parseArgs(argv: string[]): MockScribeEngineOptions {
  const out: MockScribeEngineOptions = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--empty") out.empty = true;
    else if (arg === "--port") out.port = Number(argv[++i]);
    else if (arg === "--seed") out.seed = Number(argv[++i]);
    else if (arg === "--demo") out.demoSeconds = Number(argv[++i]);
    else if (arg === "--fail") {
      const value = argv[++i];
      if (
        value !== "status" &&
        value !== "events" &&
        value !== "history" &&
        value !== "dictionary" &&
        value !== "settings" &&
        value !== "all"
      ) {
        throw new Error("--fail takes status, events, history, dictionary, settings or all");
      }
      out.fail = value;
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  return out;
}

if (process.argv[1] && import.meta.url === NodeURL.pathToFileURL(process.argv[1]).href) {
  const engine = await startMockScribeEngine({ port: 8766, ...parseArgs(process.argv.slice(2)) });
  Effect.runSync(Console.log(`mock scribe engine on http://127.0.0.1:${engine.port}`));
}
