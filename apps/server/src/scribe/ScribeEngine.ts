import {
  ScribeCommandResult,
  type ScribeDeleteHistoryInput,
  type ScribeMeetingsInput,
  ScribeDeleteHistoryResult,
  ScribeDictionary,
  ScribeEngineError,
  ScribeEngineState,
  ScribeEngineWireEvent,
  ScribeDevices,
  ScribeHistoryPage,
  type ScribePatchSettingsInput,
  ScribePatchSettingsResult,
  type ScribeSetGroqKeyInput,
  ScribeSettings,
  type ScribeRejectSuggestionInput,
  ScribeRejectSuggestionResult,
  ScribeSuggestionList,
  type ScribeListHistoryInput,
  type ScribeLiveEvent,
  type ScribeStartInput,
  type ScribeStopInput,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import type * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schedule from "effect/Schedule";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import { FetchHttpClient, HttpClient, HttpClientRequest } from "effect/http";

import { scribeEngineBaseUrl } from "./engineUrl.ts";

/**
 * The server's only client of the Scribe engine. The browser never calls the
 * engine: the contract rejects any request with an Origin header.
 */
export class ScribeEngine extends Context.Service<
  ScribeEngine,
  {
    readonly start: (
      input: ScribeStartInput,
    ) => Effect.Effect<ScribeCommandResult, ScribeEngineError>;
    readonly stop: (
      input: ScribeStopInput,
    ) => Effect.Effect<ScribeCommandResult, ScribeEngineError>;
    /** Run the newest failed take again. `not_found` when the engine saved none. */
    readonly retry: Effect.Effect<ScribeCommandResult, ScribeEngineError>;
    readonly listHistory: (
      input: ScribeListHistoryInput,
    ) => Effect.Effect<ScribeHistoryPage, ScribeEngineError>;
    readonly listPublicHistory: (
      input: ScribeListHistoryInput,
    ) => Effect.Effect<ScribeHistoryPage, ScribeEngineError>;
    readonly deleteHistory: (
      input: ScribeDeleteHistoryInput,
    ) => Effect.Effect<ScribeDeleteHistoryResult, ScribeEngineError>;
    readonly getDictionary: Effect.Effect<ScribeDictionary, ScribeEngineError>;
    readonly putDictionary: (
      input: ScribeDictionary,
    ) => Effect.Effect<ScribeDictionary, ScribeEngineError>;
    readonly listSuggestions: Effect.Effect<ScribeSuggestionList, ScribeEngineError>;
    readonly rejectSuggestion: (
      input: ScribeRejectSuggestionInput,
    ) => Effect.Effect<ScribeRejectSuggestionResult, ScribeEngineError>;
    readonly getSettings: Effect.Effect<ScribeSettings, ScribeEngineError>;
    readonly patchSettings: (
      input: ScribePatchSettingsInput,
    ) => Effect.Effect<ScribePatchSettingsResult, ScribeEngineError>;
    readonly listDevices: Effect.Effect<ScribeDevices, ScribeEngineError>;
    /** The key goes to the engine's OS credential store. It is never returned. */
    readonly setGroqKey: (input: ScribeSetGroqKeyInput) => Effect.Effect<void, ScribeEngineError>;
    readonly clearGroqKey: Effect.Effect<void, ScribeEngineError>;
    /** Meetings routes except the Discord app settings. */
    readonly meetings: (input: ScribeMeetingsInput) => Effect.Effect<unknown, ScribeEngineError>;
    /** Save, remove or connect the Discord app (settings scope). */
    readonly meetingsDiscord: (
      input: ScribeMeetingsInput,
    ) => Effect.Effect<unknown, ScribeEngineError>;
    /** Engine events plus `connection` events. Reconnects every second while the engine is down. */
    readonly events: Stream.Stream<ScribeLiveEvent>;
  }
>()("t3/scribe/ScribeEngine") {}

const decodeCommand = Schema.decodeUnknownEffect(ScribeCommandResult);
const decodeStatus = Schema.decodeUnknownEffect(
  Schema.Struct({ state: ScribeEngineState, sampledAt: Schema.String }),
);
const decodeDeleted = Schema.decodeUnknownEffect(ScribeDeleteHistoryResult);
const decodeDictionary = Schema.decodeUnknownEffect(ScribeDictionary);
const decodeSuggestions = Schema.decodeUnknownEffect(ScribeSuggestionList);
const decodeRejected = Schema.decodeUnknownEffect(ScribeRejectSuggestionResult);
const decodeSettings = Schema.decodeUnknownEffect(ScribeSettings);
const decodePatched = Schema.decodeUnknownEffect(ScribePatchSettingsResult);
const decodeDevices = Schema.decodeUnknownEffect(ScribeDevices);
const decodePage = Schema.decodeUnknownEffect(ScribeHistoryPage);
const decodeWireEvent = Schema.decodeUnknownOption(Schema.fromJsonString(ScribeEngineWireEvent));

const reasonForStatus = (status: number): ScribeEngineError["reason"] => {
  if (status === 400) return "bad_request";
  if (status === 409) return "invalid_state";
  if (status === 404) return "not_found";
  if (status === 500) return "store_error";
  return "http_error";
};

/** One SSE `data:` line to an event, or null for comments, blank lines and unknown events. */
export const parseEventLine = (line: string): ScribeLiveEvent | null => {
  if (!line.startsWith("data:")) return null;
  const decoded = decodeWireEvent(line.slice(5).trim());
  return decoded._tag === "Some" ? decoded.value : null;
};

const MEETINGS_PATH = /^(?:[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+){0,2})?$/;

/**
 * Only `/v1/meetings` paths reach the engine. Writing the Discord app (`discord` with PUT or
 * DELETE, and `discord/connect`) is allowed only through the settings-scope call.
 */
export const meetingsPathAllowed = (input: ScribeMeetingsInput, settings: boolean): boolean => {
  if (!MEETINGS_PATH.test(input.path)) return false;
  const discordWrite =
    input.path === "discord/connect" || (input.path === "discord" && input.method !== "GET");
  return settings ? discordWrite : !discordWrite;
};

const meetingsSlow = (input: ScribeMeetingsInput) =>
  input.path.endsWith("/ask") || input.path === "discord/connect";

const isEvent = (event: ScribeLiveEvent | null): event is ScribeLiveEvent => event !== null;

export const makeWith = (options: {
  readonly baseUrl: string;
  readonly retryEvery?: Duration.Input;
}) =>
  Effect.gen(function* () {
    const http = yield* HttpClient.HttpClient;
    const { baseUrl } = options;

    const call = <A>(
      request: HttpClientRequest.HttpClientRequest,
      decode: ((body: unknown) => Effect.Effect<A, Schema.SchemaError>) | null,
    ) =>
      Effect.gen(function* () {
        const response = yield* http.execute(request);
        if (response.status >= 400) {
          return yield* new ScribeEngineError({ reason: reasonForStatus(response.status) });
        }
        if (decode === null) return undefined as A;
        const body = yield* response.json;
        return yield* decode(body).pipe(
          Effect.mapError(() => new ScribeEngineError({ reason: "invalid_response" })),
        );
      }).pipe(
        Effect.provideService(FetchHttpClient.RequestInit, {
          redirect: "manual",
          cache: "no-store",
        }),
        Effect.scoped,
        Effect.timeout("3 seconds"),
        Effect.mapError((error) =>
          error._tag === "ScribeEngineError"
            ? error
            : new ScribeEngineError({
                reason: error._tag === "TimeoutError" ? "timeout" : "offline",
              }),
        ),
      );

    const start = (input: ScribeStartInput) =>
      call(
        HttpClientRequest.post(`${baseUrl}/v1/start`).pipe(HttpClientRequest.bodyJsonUnsafe(input)),
        decodeCommand,
      );

    const stop = (input: ScribeStopInput) =>
      call(
        HttpClientRequest.post(`${baseUrl}/v1/stop`).pipe(HttpClientRequest.bodyJsonUnsafe(input)),
        decodeCommand,
      );

    const retry = call(HttpClientRequest.post(`${baseUrl}/v1/retry`), decodeCommand);

    const listHistory = (input: ScribeListHistoryInput, publicOnly = false) => {
      const params: Record<string, string> = {};
      if (input.limit !== undefined) params.limit = String(input.limit);
      if (input.before !== undefined) params.before = input.before;
      if (input.mode !== undefined) params.mode = input.mode;
      return call(
        HttpClientRequest.get(`${baseUrl}/v1/history${publicOnly ? "/public" : ""}`).pipe(
          HttpClientRequest.setUrlParams(params),
        ),
        decodePage,
      );
    };

    const deleteHistory = (input: ScribeDeleteHistoryInput) =>
      call(
        HttpClientRequest.delete(`${baseUrl}/v1/history/${encodeURIComponent(input.id)}`),
        decodeDeleted,
      );

    const getDictionary = call(HttpClientRequest.get(`${baseUrl}/v1/dictionary`), decodeDictionary);

    const putDictionary = (input: ScribeDictionary) =>
      call(
        HttpClientRequest.put(`${baseUrl}/v1/dictionary`).pipe(
          HttpClientRequest.bodyJsonUnsafe(input),
        ),
        decodeDictionary,
      );

    const listSuggestions = call(
      HttpClientRequest.get(`${baseUrl}/v1/dictionary/suggestions`),
      decodeSuggestions,
    );

    const rejectSuggestion = (input: ScribeRejectSuggestionInput) =>
      call(
        HttpClientRequest.delete(
          `${baseUrl}/v1/dictionary/suggestions/${encodeURIComponent(input.wrong)}`,
        ),
        decodeRejected,
      );

    const getSettings = call(HttpClientRequest.get(`${baseUrl}/v1/settings`), decodeSettings);

    const patchSettings = (input: ScribePatchSettingsInput) =>
      call(
        HttpClientRequest.patch(`${baseUrl}/v1/settings`).pipe(
          HttpClientRequest.bodyJsonUnsafe(input),
        ),
        decodePatched,
      );

    const listDevices = call(HttpClientRequest.get(`${baseUrl}/v1/devices`), decodeDevices);

    const setGroqKey = (input: ScribeSetGroqKeyInput) =>
      call<void>(
        HttpClientRequest.put(`${baseUrl}/v1/credentials/groq`).pipe(
          HttpClientRequest.bodyJsonUnsafe(input),
        ),
        null,
      );

    const clearGroqKey = call<void>(
      HttpClientRequest.delete(`${baseUrl}/v1/credentials/groq`),
      null,
    );

    /** Engine meetings call. Keeps the engine's plain `message` on errors. */
    const meetingsCall = (input: ScribeMeetingsInput) =>
      Effect.gen(function* () {
        const url = `${baseUrl}/v1/meetings${input.path === "" ? "" : `/${input.path}`}`;
        const request = HttpClientRequest.make(input.method)(url);
        const response = yield* http.execute(
          input.body === undefined
            ? request
            : HttpClientRequest.bodyJsonUnsafe(request, input.body),
        );
        if (response.status === 204) return null;
        const body = yield* response.json.pipe(Effect.orElseSucceed(() => null));
        if (response.status >= 400) {
          const message =
            body !== null && typeof body === "object" && "message" in body
              ? String((body as { message: unknown }).message)
              : undefined;
          return yield* new ScribeEngineError({
            reason: reasonForStatus(response.status),
            ...(message === undefined ? {} : { message }),
          });
        }
        return body;
      }).pipe(
        Effect.provideService(FetchHttpClient.RequestInit, {
          redirect: "manual",
          cache: "no-store",
        }),
        Effect.scoped,
        // Ask can wait out a provider rate limit; Discord connect waits for the user's click.
        Effect.timeout(meetingsSlow(input) ? "200 seconds" : "5 seconds"),
        Effect.mapError((error) =>
          error._tag === "ScribeEngineError"
            ? error
            : new ScribeEngineError({
                reason: error._tag === "TimeoutError" ? "timeout" : "offline",
              }),
        ),
      );

    const meetings = (input: ScribeMeetingsInput) =>
      meetingsPathAllowed(input, false)
        ? meetingsCall(input)
        : Effect.fail(new ScribeEngineError({ reason: "bad_request" }));

    const meetingsDiscord = (input: ScribeMeetingsInput) =>
      meetingsPathAllowed(input, true)
        ? meetingsCall(input)
        : Effect.fail(new ScribeEngineError({ reason: "bad_request" }));

    const connection = (connected: boolean) =>
      Effect.map(DateTime.now, (now): ScribeLiveEvent => ({
        type: "connection",
        connected,
        at: DateTime.formatIso(now),
      }));

    const readState = call(HttpClientRequest.get(`${baseUrl}/v1/status`), decodeStatus).pipe(
      Effect.map((status): ScribeLiveEvent | null => ({
        type: "state",
        state: status.state,
        at: status.sampledAt,
      })),
      Effect.orElseSucceed(() => null),
    );

    const connectOnce: Stream.Stream<ScribeLiveEvent> = Stream.unwrap(
      Effect.gen(function* () {
        const response = yield* http.execute(
          HttpClientRequest.get(`${baseUrl}/v1/events`).pipe(
            HttpClientRequest.setHeader("accept", "text/event-stream"),
          ),
        );
        if (response.status !== 200) return Stream.empty;
        const lines = response.stream.pipe(
          Stream.decodeText(),
          Stream.splitLines,
          Stream.map(parseEventLine),
          Stream.filter(isEvent),
        );
        // The stream sends only changes, so read the current state once after each connect.
        const current = Stream.fromEffect(readState).pipe(
          Stream.filter((event): event is ScribeLiveEvent => event !== null),
        );
        return Stream.concat(Stream.fromEffect(connection(true)), Stream.concat(current, lines));
      }).pipe(
        Effect.provideService(FetchHttpClient.RequestInit, {
          redirect: "manual",
          cache: "no-store",
        }),
      ),
    ).pipe(Stream.catchCause(() => Stream.empty));

    const events = Stream.concat(connectOnce, Stream.fromEffect(connection(false))).pipe(
      Stream.repeat(Schedule.spaced(options.retryEvery ?? "1 second")),
      // Report each link change once, not once per failed retry.
      Stream.changesWith(
        (a, b) => a.type === "connection" && b.type === "connection" && a.connected === b.connected,
      ),
    );

    return ScribeEngine.of({
      start,
      stop,
      retry,
      listHistory,
      listPublicHistory: (input) => listHistory(input, true),
      deleteHistory,
      getDictionary,
      putDictionary,
      listSuggestions,
      rejectSuggestion,
      getSettings,
      patchSettings,
      listDevices,
      setGroqKey,
      clearGroqKey,
      meetings,
      meetingsDiscord,
      events,
    });
  });

export const layer = Layer.effect(ScribeEngine, makeWith({ baseUrl: scribeEngineBaseUrl() }));
