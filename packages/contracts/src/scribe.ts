import * as Schema from "effect/Schema";

/**
 * Scribe engine: the Rust dictation process. The server is its only client
 * (contract: services/scribe-engine/contract.md). The web app reads it only
 * through the `scribe.*` RPCs below.
 */

export const ScribeEngineState = Schema.Literals(["ready", "listening", "processing", "mic_error"]);
export type ScribeEngineState = typeof ScribeEngineState.Type;

export const ScribeRecordMode = Schema.Literals(["hold", "toggle"]);
export type ScribeRecordMode = typeof ScribeRecordMode.Type;

/** One saved dictation (contract v1.2 proposal, `GET /v1/history`). */
export const ScribeHistoryItem = Schema.Struct({
  id: Schema.String,
  at: Schema.String,
  // `rewrite` is a preset rewrite. A plain string, so one unknown mode cannot break the whole page.
  mode: Schema.String,
  app: Schema.String,
  rawText: Schema.String,
  cleanedText: Schema.String,
  words: Schema.Number,
  metrics: Schema.Struct({
    transcribeMs: Schema.Number,
    polishMs: Schema.Number,
    totalMs: Schema.Number,
  }),
  pasted: Schema.Boolean,
  preset: Schema.optional(Schema.String),
});
export type ScribeHistoryItem = typeof ScribeHistoryItem.Type;

export const ScribeHistoryPage = Schema.Struct({
  items: Schema.Array(ScribeHistoryItem),
  next: Schema.NullOr(Schema.String),
});
export type ScribeHistoryPage = typeof ScribeHistoryPage.Type;

/** Events as the engine sends them on `GET /v1/events` (v1.1 plus the v1.2 `history` event). */
export const ScribeEngineWireEvent = Schema.Union([
  Schema.Struct({ type: Schema.Literal("state"), state: ScribeEngineState, at: Schema.String }),
  Schema.Struct({ type: Schema.Literal("partial"), text: Schema.String, at: Schema.String }),
  Schema.Struct({
    type: Schema.Literal("transcript"),
    text: Schema.String,
    raw: Schema.optional(Schema.String),
    durationMs: Schema.Number,
    pasted: Schema.Boolean,
    engine: Schema.optional(Schema.Literals(["groq", "local"])),
    at: Schema.String,
  }),
  Schema.Struct({
    type: Schema.Literal("error"),
    code: Schema.String,
    message: Schema.String,
    at: Schema.String,
  }),
  Schema.Struct({ type: Schema.Literal("history"), item: ScribeHistoryItem }),
]);
export type ScribeEngineWireEvent = typeof ScribeEngineWireEvent.Type;

/** How the server sees the engine process. `unmanaged` means no supervisor owns it. */
export const ScribeEngineProcess = Schema.Struct({
  status: Schema.Literals(["unmanaged", "starting", "running", "stopped", "crashed"]),
  restarts: Schema.Number,
  lastRestartAt: Schema.NullOr(Schema.String),
});
export type ScribeEngineProcess = typeof ScribeEngineProcess.Type;

/** What `scribe.subscribeEvents` streams: engine events plus server-side link and process events. */
export const ScribeLiveEvent = Schema.Union([
  ScribeEngineWireEvent,
  Schema.Struct({
    type: Schema.Literal("connection"),
    connected: Schema.Boolean,
    at: Schema.String,
  }),
  Schema.Struct({ type: Schema.Literal("process"), process: ScribeEngineProcess }),
]);
export type ScribeLiveEvent = typeof ScribeLiveEvent.Type;

export const ScribeStartInput = Schema.Struct({ mode: ScribeRecordMode });
export type ScribeStartInput = typeof ScribeStartInput.Type;

export const ScribeStopInput = Schema.Struct({ paste: Schema.Boolean });
export type ScribeStopInput = typeof ScribeStopInput.Type;

export const ScribeCommandResult = Schema.Struct({ state: ScribeEngineState });
export type ScribeCommandResult = typeof ScribeCommandResult.Type;

export const ScribeListHistoryInput = Schema.Struct({
  limit: Schema.optional(Schema.Number.check(Schema.isBetween({ minimum: 1, maximum: 500 }))),
  before: Schema.optional(Schema.String.check(Schema.isMaxLength(200))),
  mode: Schema.optional(Schema.String.check(Schema.isMaxLength(40))),
});
export type ScribeListHistoryInput = typeof ScribeListHistoryInput.Type;

export const ScribeDeleteHistoryInput = Schema.Struct({
  id: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(200)),
});
export type ScribeDeleteHistoryInput = typeof ScribeDeleteHistoryInput.Type;

export const ScribeDeleteHistoryResult = Schema.Struct({ deleted: Schema.Literal(true) });
export type ScribeDeleteHistoryResult = typeof ScribeDeleteHistoryResult.Type;

/** `timeZone` is an IANA name such as `America/Phoenix`. The server falls back to its own zone. */
export const ScribeStatsInput = Schema.Struct({
  timeZone: Schema.optional(Schema.String.check(Schema.isMaxLength(64))),
});
export type ScribeStatsInput = typeof ScribeStatsInput.Type;

const ScribeCount = Schema.Struct({ key: Schema.String, count: Schema.Number });

/**
 * Computed by the server from `GET /v1/history` (port of the Python `load_insights`).
 * Days are local `YYYY-MM-DD`. `truncated` is true when more history exists than the 5,000 rows read.
 */
export const ScribeInsights = Schema.Struct({
  words: Schema.Number,
  transcripts: Schema.Number,
  daysActive: Schema.Number,
  firstDay: Schema.NullOr(Schema.String),
  lastDay: Schema.NullOr(Schema.String),
  todayWords: Schema.Number,
  todayTranscripts: Schema.Number,
  streakDays: Schema.Number,
  weekAvgWords: Schema.Number,
  weekly: Schema.Struct({
    words: Schema.Number,
    prevWords: Schema.Number,
    transcripts: Schema.Number,
    prevTranscripts: Schema.Number,
    p50: Schema.Number,
    prevP50: Schema.Number,
    topApp: Schema.String,
    days: Schema.Array(Schema.Struct({ day: Schema.String, words: Schema.Number })),
  }),
  latencySamples: Schema.Number,
  p50: Schema.Number,
  p90: Schema.Number,
  sttP50: Schema.Number,
  polishP50: Schema.Number,
  sttShare: Schema.Number,
  polishShare: Schema.Number,
  byDay: Schema.Record(Schema.String, Schema.Number),
  byMode: Schema.Array(ScribeCount),
  byApp: Schema.Array(ScribeCount),
  truncated: Schema.Boolean,
});
export type ScribeInsights = typeof ScribeInsights.Type;

/** Computed by the server from `GET /v1/history` (port of the Python `goals.compute`). */
export const ScribeGoals = Schema.Struct({
  xp: Schema.Number,
  level: Schema.Number,
  rank: Schema.String,
  levelFloor: Schema.Number,
  levelCeil: Schema.Number,
  levelFrac: Schema.Number,
  nextRank: Schema.NullOr(Schema.Struct({ level: Schema.Number, name: Schema.String })),
  today: Schema.Struct({
    day: Schema.String,
    words: Schema.Number,
    goal: Schema.Number,
    deep: Schema.Number,
    deepGoal: Schema.Number,
    xp: Schema.Number,
    dictations: Schema.Number,
  }),
  quests: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      title: Schema.String,
      desc: Schema.String,
      have: Schema.Number,
      need: Schema.Number,
      done: Schema.Boolean,
      xp: Schema.Number,
    }),
  ),
  questsDone: Schema.Number,
  streak: Schema.Number,
  bestStreak: Schema.Number,
  depth7d: Schema.Number,
  depthPrev: Schema.Number,
  metrics: Schema.Struct({
    dictations: Schema.Number,
    words: Schema.Number,
    longestPrompt: Schema.Number,
    bestStreak: Schema.Number,
    bestDay: Schema.Number,
    agentApps: Schema.Number,
    deepPrompts: Schema.Number,
    sweeps: Schema.Number,
  }),
  achievements: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      name: Schema.String,
      how: Schema.String,
      glyph: Schema.String,
      key: Schema.String,
      have: Schema.Number,
      need: Schema.Number,
      unlocked: Schema.Boolean,
    }),
  ),
  truncated: Schema.Boolean,
});
export type ScribeGoals = typeof ScribeGoals.Type;

/** Contract v1.2 `GET` and `PUT /v1/dictionary`. The engine allows at most 800 vocabulary words. */
export const ScribeDictionary = Schema.Struct({
  replacements: Schema.Array(Schema.Struct({ wrong: Schema.String, correct: Schema.String })),
  vocabulary: Schema.Array(Schema.String).check(Schema.isMaxLength(800)),
});
export type ScribeDictionary = typeof ScribeDictionary.Type;

/** A run of words the engine saw polish fix in 2 or more dictations (`GET /v1/dictionary/suggestions`). */
export const ScribeSuggestionList = Schema.Struct({
  items: Schema.Array(
    Schema.Struct({ wrong: Schema.String, correct: Schema.String, count: Schema.Number }),
  ),
});
export type ScribeSuggestionList = typeof ScribeSuggestionList.Type;

export const ScribeRejectSuggestionInput = Schema.Struct({
  wrong: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(200)),
});
export type ScribeRejectSuggestionInput = typeof ScribeRejectSuggestionInput.Type;

export const ScribeRejectSuggestionResult = Schema.Struct({ rejected: Schema.Literal(true) });
export type ScribeRejectSuggestionResult = typeof ScribeRejectSuggestionResult.Type;

const ScribeOpenSection = Schema.Record(Schema.String, Schema.Unknown);

/**
 * Contract v1.2 `GET /v1/settings`. A key never appears: `groqKey` is `{set}` only.
 * `presets`, `features` and `goals` belong to the Leonidas UI; the engine stores them as sent.
 */
export const ScribeSettings = Schema.Struct({
  sections: Schema.Struct({
    hotkeys: Schema.Struct({
      hold: Schema.Array(Schema.String),
      toggle: Schema.Array(Schema.String),
      cancel: Schema.Array(Schema.String),
    }),
    audio: Schema.Struct({
      device: Schema.NullOr(Schema.String),
      maxRecordSeconds: Schema.Number,
      minRecordMs: Schema.Number,
    }),
    transcription: Schema.Struct({
      privateMode: Schema.Boolean,
      polishEnabled: Schema.Boolean,
      polishInstructions: Schema.NullOr(Schema.String),
      whisperModel: Schema.String,
      whisperModelBackup: Schema.String,
      polishModel: Schema.String,
      backupPolishModel: Schema.String,
      groqKey: Schema.Struct({ set: Schema.Boolean }),
    }),
    hud: Schema.Struct({ enabled: Schema.Boolean }),
    presets: ScribeOpenSection,
    features: ScribeOpenSection,
    goals: ScribeOpenSection,
  }),
});
export type ScribeSettings = typeof ScribeSettings.Type;

export const ScribeSettingsSection = Schema.Literals([
  "hotkeys",
  "audio",
  "transcription",
  "hud",
  "presets",
  "features",
  "goals",
]);
export type ScribeSettingsSection = typeof ScribeSettingsSection.Type;

/** `PATCH /v1/settings`: the values merge into that one section. */
export const ScribePatchSettingsInput = Schema.Struct({
  section: ScribeSettingsSection,
  values: Schema.Record(Schema.String, Schema.Unknown),
});
export type ScribePatchSettingsInput = typeof ScribePatchSettingsInput.Type;

/** `restartRequired` is true after a model or overlay change: it applies when the engine restarts. */
export const ScribePatchSettingsResult = Schema.Struct({
  section: ScribeSettingsSection,
  values: Schema.Record(Schema.String, Schema.Unknown),
  restartRequired: Schema.Boolean,
});
export type ScribePatchSettingsResult = typeof ScribePatchSettingsResult.Type;

/** `GET /v1/devices`. `id` equals `name`; `null` in `audio.device` means the system default. */
export const ScribeDevices = Schema.Struct({
  inputs: Schema.Array(
    Schema.Struct({ id: Schema.String, name: Schema.String, default: Schema.Boolean }),
  ),
});
export type ScribeDevices = typeof ScribeDevices.Type;

export const ScribeSetGroqKeyInput = Schema.Struct({
  key: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(200)),
});
export type ScribeSetGroqKeyInput = typeof ScribeSetGroqKeyInput.Type;

export const ScribeEngineErrorReason = Schema.Literals([
  "offline",
  "timeout",
  "invalid_state",
  "invalid_response",
  "bad_request",
  "not_found",
  "store_error",
  "http_error",
]);
export type ScribeEngineErrorReason = typeof ScribeEngineErrorReason.Type;

export class ScribeEngineError extends Schema.TaggedError<ScribeEngineError>()(
  "ScribeEngineError",
  { reason: ScribeEngineErrorReason },
) {}
