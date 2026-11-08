import * as Schema from "effect/Schema";
import { describe, expect, it } from "vite-plus/test";

import {
  ScribeDeleteHistoryInput,
  ScribeDeleteHistoryResult,
  ScribeDevices,
  ScribeDictionary,
  ScribePatchSettingsInput,
  ScribePatchSettingsResult,
  ScribeSettings,
  ScribeSuggestionList,
  ScribeEngineWireEvent,
  ScribeHistoryPage,
  ScribeListHistoryInput,
  ScribeLiveEvent,
} from "./scribe.ts";

const decodeWire = Schema.decodeUnknownSync(Schema.fromJsonString(ScribeEngineWireEvent));
const decodeLive = Schema.decodeUnknownSync(ScribeLiveEvent);
const decodePage = Schema.decodeUnknownSync(ScribeHistoryPage);
const decodeListInput = Schema.decodeUnknownSync(ScribeListHistoryInput);

const historyItem = {
  id: "h-1",
  at: "2026-10-15T01:00:03.000Z",
  mode: "hold",
  app: "code.exe",
  rawText: "hello world",
  cleanedText: "Hello world.",
  words: 2,
  metrics: { transcribeMs: 700, polishMs: 300, totalMs: 1000 },
  pasted: true,
};

describe("ScribeEngineWireEvent", () => {
  it("decodes every v1 contract example", () => {
    const lines = [
      '{"type":"state","state":"listening","at":"2026-10-15T01:00:00.000Z"}',
      '{"type":"partial","text":"hello wor","at":"2026-10-15T01:00:01.000Z"}',
      '{"type":"transcript","text":"Hello world.","durationMs":1840,"pasted":true,"at":"2026-10-15T01:00:03.000Z"}',
      '{"type":"error","code":"mic_error","message":"No input device","at":"2026-10-15T01:00:00.000Z"}',
    ];
    expect(lines.map((line) => decodeWire(line).type)).toEqual([
      "state",
      "partial",
      "transcript",
      "error",
    ]);
  });

  it("keeps the v1.1 transcript fields and ignores the envelope", () => {
    const event = decodeWire(
      '{"service":"leonidas-scribe","apiVersion":1,"type":"transcript","text":"Hello world.","raw":"hello world","durationMs":1840,"pasted":true,"engine":"local","at":"2026-10-15T01:00:03.000Z"}',
    );
    expect(event).toMatchObject({ type: "transcript", raw: "hello world", engine: "local" });
  });

  it("decodes the v1.2 history event", () => {
    const event = decodeWire(JSON.stringify({ type: "history", item: historyItem }));
    expect(event).toMatchObject({ type: "history", item: { id: "h-1", words: 2 } });
  });

  it("rejects an unknown state", () => {
    expect(() => decodeWire('{"type":"state","state":"asleep","at":"x"}')).toThrow();
  });
});

describe("ScribeLiveEvent", () => {
  it("accepts server connection and process events", () => {
    expect(decodeLive({ type: "connection", connected: false, at: "x" }).type).toBe("connection");
    expect(
      decodeLive({
        type: "process",
        process: { status: "running", restarts: 1, lastRestartAt: "2026-10-15T01:00:00.000Z" },
      }).type,
    ).toBe("process");
  });
});

describe("ScribeHistoryPage and ScribeListHistoryInput", () => {
  it("decodes a page with a cursor", () => {
    const page = decodePage({ items: [historyItem], next: "h-1" });
    expect(page.items).toHaveLength(1);
  });

  it("rejects a limit over 500", () => {
    expect(() => decodeListInput({ limit: 501 })).toThrow();
  });
});

describe("ScribeDeleteHistoryInput and Result", () => {
  const decodeDelete = Schema.decodeUnknownSync(ScribeDeleteHistoryInput);
  const decodeDeleted = Schema.decodeUnknownSync(ScribeDeleteHistoryResult);

  it("takes one history id and replies {deleted:true}", () => {
    expect(decodeDelete({ id: "d1760745603000" })).toEqual({ id: "d1760745603000" });
    expect(decodeDeleted({ deleted: true })).toEqual({ deleted: true });
  });

  it("rejects an empty id and a false reply", () => {
    expect(() => decodeDelete({ id: "" })).toThrow();
    expect(() => decodeDeleted({ deleted: false })).toThrow();
  });
});

describe("dictionary contract", () => {
  const decodeDictionary = Schema.decodeUnknownSync(ScribeDictionary);
  const decodeSuggestions = Schema.decodeUnknownSync(ScribeSuggestionList);

  it("decodes the v1.2 examples and ignores the envelope", () => {
    const dictionary = decodeDictionary({
      service: "leonidas-scribe",
      apiVersion: 1,
      replacements: [{ wrong: "btw", correct: "by the way" }],
      vocabulary: ["Gersi"],
    });
    expect(dictionary.vocabulary).toEqual(["Gersi"]);
    expect(
      decodeSuggestions({ items: [{ wrong: "jersey", correct: "Gersi", count: 3 }] }).items,
    ).toHaveLength(1);
  });

  it("decodes a suggestion with or without its v1.7 example", () => {
    const line = { before: "I talked to ", changed: "jersey", after: " today" };
    const [older, newer] = decodeSuggestions({
      items: [
        { wrong: "jersey", correct: "Gersi", count: 3 },
        {
          wrong: "jersey",
          correct: "Gersi",
          count: 3,
          example: { heard: line, wrote: { ...line, changed: "Gersi" } },
        },
      ],
    }).items;
    expect(older?.example).toBeUndefined();
    expect(newer?.example?.wrote.changed).toBe("Gersi");
    expect(() =>
      decodeSuggestions({
        items: [{ wrong: "a", correct: "b", count: 2, example: { heard: line } }],
      }),
    ).toThrow();
  });

  it("rejects more than 800 vocabulary words, as the engine does", () => {
    const words = Array.from({ length: 801 }, (_, index) => `w${index}`);
    expect(() => decodeDictionary({ replacements: [], vocabulary: words })).toThrow();
  });
});

describe("settings contract", () => {
  const decodeSettings = Schema.decodeUnknownSync(ScribeSettings);
  const decodePatch = Schema.decodeUnknownSync(ScribePatchSettingsInput);
  const decodePatched = Schema.decodeUnknownSync(ScribePatchSettingsResult);
  const decodeDevices = Schema.decodeUnknownSync(ScribeDevices);

  it("decodes the v1.2 GET /v1/settings example", () => {
    const settings = decodeSettings({
      sections: {
        hotkeys: { hold: ["Ctrl + Shift + T"], toggle: ["Mouse5"], cancel: ["Escape"] },
        audio: { device: null, maxRecordSeconds: 600, minRecordMs: 250 },
        transcription: {
          privateMode: false,
          polishEnabled: true,
          polishInstructions: null,
          whisperModel: "whisper-large-v3-turbo",
          whisperModelBackup: "whisper-large-v3",
          polishModel: "qwen/qwen3.8-27b",
          backupPolishModel: "openai/gpt-oss-20b",
          groqKey: { set: true },
        },
        presets: {},
        hud: { enabled: true },
        features: {},
        goals: {},
      },
    });
    expect(settings.sections.transcription.groqKey.set).toBe(true);
  });

  it("decodes a patch, its reply and the device list", () => {
    expect(decodePatch({ section: "audio", values: { device: "USB Mic" } }).section).toBe("audio");
    expect(
      decodePatched({
        section: "audio",
        values: { device: "USB Mic", maxRecordSeconds: 600, minRecordMs: 250 },
        restartRequired: false,
      }).restartRequired,
    ).toBe(false);
    expect(
      decodeDevices({ inputs: [{ id: "Mic", name: "Mic", default: true }] }).inputs,
    ).toHaveLength(1);
  });

  it("rejects an unknown section", () => {
    expect(() => decodePatch({ section: "secrets", values: {} })).toThrow();
  });
});
