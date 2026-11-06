// @effect-diagnostics globalFetch:off -- The HTTP adapter preserves native FormData and AbortSignal semantics.
import {
  VOICE_MAX_AUDIO_BYTES,
  VoiceError,
  type VoiceErrorReason,
  type VoiceStatus,
  type VoiceTranscribeInput,
  type VoiceTranscribeResult,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import * as VoiceKeyStore from "./VoiceKeyStore.ts";
import { PerfMonitor } from "../diagnostics/perfMonitor.ts";
import {
  GROQ_BASE_URL,
  GROQ_POLISH_MODEL,
  GROQ_WHISPER_MODEL,
  acceptPolished,
  audioFileName,
  buildPolishMessages,
  canSkipPolish,
  fastClean,
  groqKeyHint,
  normalizeGroqKey,
  voiceReasonForGroqStatus,
} from "./voiceDictation.logic.ts";

const TRANSCRIBE_TIMEOUT_MS = 30_000;
const POLISH_TIMEOUT_MS = 6_000;
const VERIFY_TIMEOUT_MS = 8_000;
const encodeJson = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown));
const decodeTranscript = Schema.decodeUnknownEffect(Schema.Struct({ text: Schema.String }));
const decodePolish = Schema.decodeUnknownEffect(
  Schema.Struct({
    choices: Schema.Array(Schema.Struct({ message: Schema.Struct({ content: Schema.String }) })),
  }),
);

/** The HTTP edge, kept as a seam so tests never reach Groq. */
export class GroqHttp extends Context.Service<
  GroqHttp,
  { readonly fetch: (url: string, init: RequestInit) => Promise<Response> }
>()("t3/scribe/VoiceDictation/GroqHttp") {}

const groqHttpLive = Layer.succeed(
  GroqHttp,
  GroqHttp.of({ fetch: (url, init) => fetch(url, init) }),
);

export class VoiceDictation extends Context.Service<
  VoiceDictation,
  {
    readonly status: Effect.Effect<VoiceStatus, VoiceError>;
    readonly setGroqKey: (key: string) => Effect.Effect<VoiceStatus, VoiceError>;
    readonly clearGroqKey: Effect.Effect<VoiceStatus, VoiceError>;
    readonly transcribe: (
      input: VoiceTranscribeInput,
    ) => Effect.Effect<VoiceTranscribeResult, VoiceError>;
  }
>()("t3/scribe/VoiceDictation") {}

const fail = (reason: VoiceErrorReason) => Effect.fail(new VoiceError({ reason }));

const make = Effect.gen(function* () {
  const secrets = yield* VoiceKeyStore.VoiceKeyStore;
  const http = yield* GroqHttp;
  let perf: PerfMonitor | undefined;

  const call = (path: string, init: RequestInit, timeoutMs: number) =>
    Effect.tryPromise({
      try: (signal) =>
        http.fetch(`${GROQ_BASE_URL}${path}`, {
          ...init,
          signal: AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]),
        }),
      catch: () => new VoiceError({ reason: "network" }),
    });

  const readKey = secrets.get;

  const statusFor = (key: Option.Option<string>): VoiceStatus =>
    Option.match(key, {
      onNone: () => ({ keyConfigured: false, keyHint: null }),
      onSome: (value) => ({ keyConfigured: true, keyHint: groqKeyHint(value) }),
    });

  const status = readKey.pipe(Effect.map(statusFor), Effect.withSpan("VoiceDictation.status"));

  const setGroqKey = (input: string) =>
    Effect.gen(function* () {
      const key = normalizeGroqKey(input);
      if (key === null) return yield* fail("invalid_key");
      // Verify before saving, so a wrong paste never turns voice "on".
      const response = yield* call(
        "/models",
        { method: "GET", headers: { Authorization: `Bearer ${key}` } },
        VERIFY_TIMEOUT_MS,
      );
      if (!response.ok) return yield* fail(voiceReasonForGroqStatus(response.status));
      yield* secrets
        .set(key)
        .pipe(Effect.mapError(() => new VoiceError({ reason: "storage_error" })));
      return statusFor(Option.some(key));
    }).pipe(Effect.withSpan("VoiceDictation.setGroqKey"));

  const clearGroqKey = secrets.remove.pipe(
    Effect.mapError(() => new VoiceError({ reason: "storage_error" })),
    Effect.as(statusFor(Option.none())),
    Effect.withSpan("VoiceDictation.clearGroqKey"),
  );

  const polish = (key: string, raw: string) =>
    Effect.gen(function* () {
      const response = yield* call(
        "/chat/completions",
        {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          body: encodeJson({
            model: GROQ_POLISH_MODEL,
            messages: buildPolishMessages(raw),
            temperature: 0,
            max_tokens: Math.min(4096, Math.ceil(raw.length / 2) + 256),
            reasoning_effort: "low",
          }),
        },
        POLISH_TIMEOUT_MS,
      );
      if (!response.ok) return null;
      const body =
        (yield* Effect.tryPromise({
          try: () =>
            response.json() as Promise<{ choices?: Array<{ message?: { content?: string } }> }>,
          catch: () => new VoiceError({ reason: "provider_error" }),
        })) ?? {};
      const decoded = yield* decodePolish(body).pipe(
        Effect.mapError(() => new VoiceError({ reason: "provider_error" })),
      );
      const content = decoded.choices[0]?.message.content;
      return typeof content === "string" ? acceptPolished(raw, content) : null;
    }).pipe(
      // Clean-up is best effort: any failure keeps the raw words.
      Effect.catch(() => Effect.succeed(null)),
    );

  const transcribe = (input: VoiceTranscribeInput) =>
    Effect.gen(function* () {
      const key = yield* readKey;
      if (Option.isNone(key)) return yield* fail("no_key");
      if (!/^[A-Za-z0-9+/]+={0,2}$/.test(input.audioBase64)) return yield* fail("empty_audio");
      const audio = Buffer.from(input.audioBase64, "base64");
      if (audio.byteLength > VOICE_MAX_AUDIO_BYTES) return yield* fail("audio_too_large");
      if (audio.byteLength < 512) return yield* fail("empty_audio");

      const form = new FormData();
      form.append(
        "file",
        new Blob([audio], { type: input.mimeType || "audio/webm" }),
        audioFileName(input.mimeType),
      );
      form.append("model", GROQ_WHISPER_MODEL);
      form.append("response_format", "json");
      form.append("temperature", "0");

      const started = performance.now();
      const response = yield* call(
        "/audio/transcriptions",
        { method: "POST", headers: { Authorization: `Bearer ${key.value}` }, body: form },
        TRANSCRIBE_TIMEOUT_MS,
      );
      if (!response.ok) return yield* fail(voiceReasonForGroqStatus(response.status));
      const body = yield* Effect.tryPromise({
        try: () => response.json() as Promise<unknown>,
        catch: () => new VoiceError({ reason: "provider_error" }),
      });
      const transcript = yield* decodeTranscript(body).pipe(
        Effect.mapError(() => new VoiceError({ reason: "provider_error" })),
      );
      const rawText = transcript.text.trim();
      const transcribeMs = Math.round(performance.now() - started);
      if (rawText.length === 0) return yield* fail("empty_audio");

      if (!input.polish || canSkipPolish(rawText)) {
        return {
          text: input.polish ? fastClean(rawText) : rawText,
          rawText,
          polished: false,
          transcribeMs,
          polishMs: 0,
        };
      }
      const polishStarted = performance.now();
      const polished = yield* polish(key.value, rawText);
      return {
        text: polished ?? rawText,
        rawText,
        polished: polished !== null,
        transcribeMs,
        polishMs: Math.round(performance.now() - polishStarted),
      };
    }).pipe(
      Effect.tap((result) =>
        Effect.sync(() => {
          perf ??= new PerfMonitor("leonidas-code");
          perf.record("scribe.dictation.total_ms", result.transcribeMs + result.polishMs);
        }),
      ),
      Effect.withSpan("VoiceDictation.transcribe"),
    );

  return VoiceDictation.of({ status, setGroqKey, clearGroqKey, transcribe });
});

export const layer = Layer.effect(VoiceDictation, make).pipe(Layer.provide(groqHttpLive));
export const layerWithHttp = Layer.effect(VoiceDictation, make);
