// @effect-diagnostics globalDate:off - the ICS maths works on epoch numbers and Intl, not DateTime.
/**
 * Calendar - reads the calendars a user connected and answers "what is on, between these times".
 *
 * Two ways to connect: a private iCal link (works for any app) and Google sign-in (read-only).
 * Links and Google tokens are secrets. They live in the ServerSecretStore and never reach the
 * client or the log. Reads are cached for 15 minutes.
 *
 * @module Calendar
 */
import type {
  CalendarActionResult,
  CalendarAddLinkInput,
  CalendarEvent,
  CalendarEventsInput,
  CalendarEventsResult,
  CalendarGoogleCalendar,
  CalendarGoogleClientInput,
  CalendarGoogleConnectResult,
  CalendarSourceView,
} from "@t3tools/contracts";
import * as Clock from "effect/Clock";
import * as Config from "effect/Config";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Random from "effect/Random";
import * as Schema from "effect/Schema";
import * as Semaphore from "effect/Semaphore";
import * as Stream from "effect/Stream";
import { HttpClient, HttpClientRequest, type HttpClientResponse } from "effect/http";

import { ServerSecretStore } from "../auth/ServerSecretStore.ts";
import { nodeLoopbackListener, nodeOAuthCrypto } from "../mailAutopilot/googleOAuthNode.ts";
import { ExternalLauncher } from "../process/externalLauncher.ts";
import {
  MAX_CALENDAR_BYTES,
  checkCalendarLink,
  defaultCalendarName,
  maskCalendarLink,
  pickColor,
} from "./calendarLink.ts";
import { countIcsEvents, expandIcs, findJoinUrl, looksLikeIcs, type IcsEvent } from "./ics.ts";

const CACHE_TTL_MS = 15 * 60_000;
const DAY = 86_400_000;
const HOUR = 3_600_000;
const MAX_WINDOW_MS = 400 * DAY;
const MAX_SOURCES = 12;
const GOOGLE_SCOPE = "https://www.googleapis.com/auth/calendar.readonly";
const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_API = "https://www.googleapis.com/calendar/v3";
const SIGN_IN_TIMEOUT_MS = 5 * 60_000;

const SOURCES_SECRET = "calendar-sources";
const GOOGLE_CLIENT_SECRET = "calendar-google-client";
const GOOGLE_TOKEN_SECRET = "calendar-google-token";

const MESSAGES = {
  unreachable: "Could not reach that calendar. Check your internet and the link.",
  timeout: "The calendar took too long to answer.",
  notFound: "That link was not found. Copy the link again.",
  denied: "The calendar refused access. Make sure you copied the private link.",
  status: "The calendar site sent an error. Try again later.",
  tooLarge: "That calendar file is too big.",
  notCalendar: "That link did not return a calendar. Copy the iCal or ICS link.",
  needsReconnect: "Google sign-in ended. Sign in again.",
  googleNotReady: "Google sign-in is not set up yet.",
  googleFailed: "Google sign-in did not finish. Try again.",
} as const;

export class CalendarError extends Schema.TaggedError<CalendarError>()("CalendarError", {
  reason: Schema.Literals(
    Object.keys(MESSAGES) as [keyof typeof MESSAGES, ...(keyof typeof MESSAGES)[]],
  ),
  cause: Schema.optional(Schema.Defect()),
}) {
  override get message(): string {
    return MESSAGES[this.reason];
  }
}

const StoredSource = Schema.Struct({
  id: Schema.String,
  kind: Schema.Literals(["ics", "google"]),
  name: Schema.String,
  color: Schema.String,
  /** Secret. Set for `ics` sources. */
  url: Schema.optionalKey(Schema.String),
  /** Set for `google` sources. */
  calendarId: Schema.optionalKey(Schema.String),
});
type StoredSource = typeof StoredSource.Type;

const SourcesFile = Schema.fromJsonString(
  Schema.Struct({ v: Schema.Number, sources: Schema.Array(StoredSource) }),
);
const ClientFile = Schema.fromJsonString(
  Schema.Struct({ id: Schema.String, secret: Schema.String }),
);
const TokenFile = Schema.fromJsonString(
  Schema.Struct({ v: Schema.Number, refreshToken: Schema.String }),
);
type GoogleClient = typeof ClientFile.Type;
const encodeSources = Schema.encodeSync(SourcesFile);
const decodeSources = Schema.decodeUnknownOption(SourcesFile);
const encodeClient = Schema.encodeSync(ClientFile);
const decodeClient = Schema.decodeUnknownOption(ClientFile);
const decodeToken = Schema.decodeUnknownOption(TokenFile);
const encodeToken = Schema.encodeSync(TokenFile);
const isCalendarError = Schema.is(CalendarError);

export class Calendar extends Context.Service<
  Calendar,
  {
    readonly events: (input: CalendarEventsInput) => Effect.Effect<CalendarEventsResult>;
    readonly testLink: (url: string) => Effect.Effect<CalendarActionResult>;
    readonly addLink: (input: CalendarAddLinkInput) => Effect.Effect<CalendarActionResult>;
    readonly remove: (id: string) => Effect.Effect<CalendarActionResult>;
    readonly googleSetClient: (
      input: CalendarGoogleClientInput,
    ) => Effect.Effect<CalendarActionResult>;
    readonly googleConnect: Effect.Effect<CalendarGoogleConnectResult>;
    readonly googleSelect: (
      calendars: ReadonlyArray<CalendarGoogleCalendar>,
    ) => Effect.Effect<CalendarActionResult>;
  }
>()("t3/calendar/Calendar") {}

const parseSources = (text: string | null): ReadonlyArray<StoredSource> =>
  text === null
    ? []
    : Option.match(decodeSources(text), {
        onNone: () => [],
        onSome: (file) => file.sources,
      });

const base64Url = (bytes: Uint8Array): string => Buffer.from(bytes).toString("base64url");

const make = Effect.gen(function* () {
  const http = yield* HttpClient.HttpClient;
  const secrets = yield* ServerSecretStore;
  const launcher = yield* ExternalLauncher;
  const envClientId = yield* Config.String("LEONIDAS_GOOGLE_CLIENT_ID").pipe(
    Config.withDefault(""),
  );
  const envClientSecret = yield* Config.String("LEONIDAS_GOOGLE_CLIENT_SECRET").pipe(
    Config.withDefault(""),
  );
  const writeLock = yield* Semaphore.make(1);
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const cache = new Map<string, { readonly at: number; readonly value: unknown }>();
  const status = new Map<string, { lastSyncAt?: string; error?: string }>();
  let access: { readonly token: string; readonly expiresAt: number } | null = null;

  // ---- secrets ----
  const readSecret = (name: string) =>
    secrets.get(name).pipe(
      Effect.map(Option.match({ onNone: () => null, onSome: (bytes) => decoder.decode(bytes) })),
      Effect.orElseSucceed(() => null),
    );
  const writeSecret = (name: string, text: string) => secrets.set(name, encoder.encode(text));
  const loadSources = readSecret(SOURCES_SECRET).pipe(Effect.map(parseSources));
  const saveSources = (sources: ReadonlyArray<StoredSource>) =>
    writeSecret(SOURCES_SECRET, encodeSources({ v: 1, sources }));
  const saveFailed = {
    ok: false,
    message: "Could not save the calendar on this computer.",
  } as const;

  const googleClient = Effect.gen(function* () {
    if (envClientId.trim())
      return { id: envClientId.trim(), secret: envClientSecret.trim() } satisfies GoogleClient;
    const raw = yield* readSecret(GOOGLE_CLIENT_SECRET);
    return raw === null ? null : Option.getOrNull(decodeClient(raw));
  });

  // ---- network ----
  const limited = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    effect.pipe(
      Effect.timeoutOrElse({
        duration: "15 seconds",
        orElse: () => Effect.fail(new CalendarError({ reason: "timeout" })),
      }),
    );

  /** Reads at most `MAX_CALENDAR_BYTES`; a bigger body stops the download. */
  const readCapped = (response: HttpClientResponse.HttpClientResponse) =>
    Effect.gen(function* () {
      const declared = Number(response.headers["content-length"] ?? 0);
      if (declared > MAX_CALENDAR_BYTES) return yield* new CalendarError({ reason: "tooLarge" });
      const textDecoder = new TextDecoder();
      let size = 0;
      let text = "";
      yield* response.stream.pipe(
        Stream.runForEach((chunk) => {
          size += chunk.byteLength;
          if (size > MAX_CALENDAR_BYTES)
            return Effect.fail(new CalendarError({ reason: "tooLarge" }));
          text += textDecoder.decode(chunk, { stream: true });
          return Effect.void;
        }),
        Effect.mapError((cause) =>
          isCalendarError(cause) ? cause : new CalendarError({ reason: "unreachable", cause }),
        ),
      );
      return text;
    });

  const statusError = (code: number) =>
    new CalendarError({
      reason:
        code === 404 || code === 410
          ? "notFound"
          : code === 401 || code === 403
            ? "denied"
            : "status",
    });

  const send = (request: HttpClientRequest.HttpClientRequest) =>
    http
      .execute(request)
      .pipe(Effect.mapError((cause) => new CalendarError({ reason: "unreachable", cause })));

  const fetchText = (url: string) =>
    limited(
      send(
        HttpClientRequest.get(url).pipe(
          HttpClientRequest.setHeader("accept", "text/calendar, */*"),
        ),
      ).pipe(
        Effect.flatMap((response) =>
          response.status >= 200 && response.status < 300
            ? readCapped(response)
            : Effect.fail(statusError(response.status)),
        ),
      ),
    );

  const fetchIcs = (url: string) =>
    fetchText(url).pipe(
      Effect.flatMap((text) =>
        looksLikeIcs(text)
          ? Effect.succeed(text)
          : Effect.fail(new CalendarError({ reason: "notCalendar" })),
      ),
    );

  const cached = <A>(key: string, refresh: boolean, load: Effect.Effect<A, CalendarError>) =>
    Effect.gen(function* () {
      const now = yield* Clock.currentTimeMillis;
      const hit = cache.get(key);
      if (!refresh && hit && now - hit.at < CACHE_TTL_MS) return hit.value as A;
      const value = yield* load;
      for (const [k, entry] of cache) if (now - entry.at >= CACHE_TTL_MS) cache.delete(k);
      cache.set(key, { at: now, value });
      return value;
    });

  // ---- google ----
  const tokenCall = (client: GoogleClient, params: Record<string, string>) =>
    limited(
      send(
        HttpClientRequest.post(GOOGLE_TOKEN_URL).pipe(
          HttpClientRequest.bodyUrlParams({
            client_id: client.id,
            ...(client.secret ? { client_secret: client.secret } : {}),
            ...params,
          }),
        ),
      ).pipe(
        Effect.flatMap((response) =>
          response.json.pipe(
            Effect.orElseSucceed(() => ({})),
            Effect.flatMap((body) => {
              const reply = body as Record<string, unknown>;
              if (response.status === 400 && reply.error === "invalid_grant") {
                return Effect.fail(new CalendarError({ reason: "needsReconnect" }));
              }
              return response.status >= 200 && response.status < 300
                ? Effect.succeed(reply)
                : Effect.fail(new CalendarError({ reason: "googleFailed" }));
            }),
          ),
        ),
      ),
    );

  const accessToken = Effect.gen(function* () {
    const now = yield* Clock.currentTimeMillis;
    if (access && now < access.expiresAt - 60_000) return access.token;
    const client = yield* googleClient;
    if (!client) return yield* new CalendarError({ reason: "googleNotReady" });
    const saved = Option.flatMap(
      Option.fromNullishOr(yield* readSecret(GOOGLE_TOKEN_SECRET)),
      decodeToken,
    );
    if (Option.isNone(saved) || saved.value.refreshToken === "") {
      return yield* new CalendarError({ reason: "needsReconnect" });
    }
    const refreshToken = saved.value.refreshToken;
    const reply = yield* tokenCall(client, {
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    });
    if (typeof reply.access_token !== "string")
      return yield* new CalendarError({ reason: "googleFailed" });
    const expiresIn = typeof reply.expires_in === "number" ? reply.expires_in : 3000;
    access = { token: reply.access_token, expiresAt: now + expiresIn * 1000 };
    return access.token;
  });

  const googleGet = (url: string) =>
    Effect.gen(function* () {
      const token = yield* accessToken;
      const response = yield* limited(
        send(HttpClientRequest.get(url).pipe(HttpClientRequest.bearerToken(token))),
      );
      if (response.status === 401) {
        access = null;
        return yield* new CalendarError({ reason: "needsReconnect" });
      }
      if (response.status < 200 || response.status >= 300)
        return yield* statusError(response.status);
      return (yield* response.json.pipe(
        Effect.mapError((cause) => new CalendarError({ reason: "unreachable", cause })),
      )) as Record<string, unknown>;
    });

  const googleTime = (value: unknown): { ms: number; allDay: boolean } | null => {
    const v = value as { dateTime?: string; date?: string } | undefined;
    if (v?.dateTime) {
      const ms = Date.parse(v.dateTime);
      return Number.isFinite(ms) ? { ms, allDay: false } : null;
    }
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v?.date ?? "");
    return m
      ? { ms: new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime(), allDay: true }
      : null;
  };

  const fetchGoogleEvents = (calendarId: string, from: number, to: number) =>
    googleGet(
      `${GOOGLE_API}/calendars/${encodeURIComponent(calendarId)}/events?${new URLSearchParams({
        singleEvents: "true",
        orderBy: "startTime",
        maxResults: "250",
        timeMin: new Date(from).toISOString(),
        timeMax: new Date(to).toISOString(),
      })}`,
    ).pipe(
      Effect.map((body): IcsEvent[] => {
        const out: IcsEvent[] = [];
        for (const item of Array.isArray(body.items) ? (body.items as Record<string, any>[]) : []) {
          const start = googleTime(item.start);
          const end = googleTime(item.end);
          if (item.status === "cancelled" || !start || !end) continue;
          const location = typeof item.location === "string" ? item.location : undefined;
          const video = (
            item.conferenceData?.entryPoints as
              | { entryPointType?: string; uri?: string }[]
              | undefined
          )?.find((p) => p.entryPointType === "video")?.uri;
          const joinUrl =
            (typeof item.hangoutLink === "string" ? item.hangoutLink : undefined) ??
            video ??
            findJoinUrl(
              location,
              typeof item.description === "string" ? item.description : undefined,
            );
          out.push({
            uid: String(item.id ?? start.ms),
            title: typeof item.summary === "string" && item.summary ? item.summary : "Busy",
            start: start.ms,
            end: end.ms,
            allDay: start.allDay,
            ...(location ? { location } : {}),
            ...(joinUrl ? { joinUrl } : {}),
          });
        }
        return out;
      }),
    );

  // ---- reading ----
  const readSource = (source: StoredSource, from: number, to: number, refresh: boolean) => {
    if (source.kind === "ics") {
      return cached(`ics:${source.id}`, refresh, fetchIcs(source.url ?? "")).pipe(
        Effect.map((text) => expandIcs(text, from, to)),
      );
    }
    // Fetch whole hours, so the "next 7 days" card (a moving start) shares one cached answer.
    const wideFrom = Math.floor(from / HOUR) * HOUR;
    const wideTo = Math.ceil(to / HOUR) * HOUR;
    return cached(
      `g:${source.id}:${wideFrom}:${wideTo}`,
      refresh,
      fetchGoogleEvents(source.calendarId ?? "", wideFrom, wideTo),
    ).pipe(
      Effect.map((events) =>
        events.filter((e) => (e.end > from || e.start >= from) && e.start < to),
      ),
    );
  };

  const view = (source: StoredSource): CalendarSourceView => ({
    id: source.id,
    kind: source.kind,
    name: source.name,
    color: source.color,
    hint: source.kind === "ics" ? maskCalendarLink(source.url ?? "") : "Google Calendar",
    ...status.get(source.id),
  });

  const events: Calendar["Service"]["events"] = (input) =>
    Effect.gen(function* () {
      const now = yield* Clock.currentTimeMillis;
      let from = Date.parse(input.from);
      let to = Date.parse(input.to);
      if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) {
        from = now;
        to = now + DAY;
      }
      to = Math.min(to, from + MAX_WINDOW_MS);
      const sources = yield* loadSources;
      const lists = yield* Effect.forEach(
        sources,
        (source) =>
          readSource(source, from, to, input.refresh === true).pipe(
            Effect.map((found) => {
              status.set(source.id, { lastSyncAt: new Date(now).toISOString() });
              return found.map((e): CalendarEvent => ({
                id: `${source.id}:${e.uid}:${e.start}`,
                sourceId: source.id,
                title: e.title,
                start: new Date(e.start).toISOString(),
                end: new Date(e.end).toISOString(),
                allDay: e.allDay,
                ...(e.location ? { location: e.location } : {}),
                ...(e.joinUrl ? { joinUrl: e.joinUrl } : {}),
              }));
            }),
            Effect.catchTags({
              CalendarError: (error) =>
                Effect.sync(() => {
                  status.set(source.id, { ...status.get(source.id), error: error.message });
                  return [] as CalendarEvent[];
                }),
            }),
          ),
        { concurrency: 4 },
      );
      return {
        events: lists
          .flat()
          .sort(
            (a, b) => Date.parse(a.start) - Date.parse(b.start) || a.title.localeCompare(b.title),
          ),
        sources: sources.map(view),
        googleReady: (yield* googleClient) !== null,
      };
    });

  // ---- changing the list ----
  const newId = Random.nextInt.pipe(Effect.map((n) => `cal-${n.toString(36)}`));

  const addSources = (
    build: (existing: ReadonlyArray<StoredSource>, id: string) => StoredSource[] | string,
  ) =>
    writeLock.withPermits(1)(
      Effect.gen(function* () {
        const existing = yield* loadSources;
        const next = build(existing, yield* newId);
        if (typeof next === "string")
          return { ok: false, message: next } satisfies CalendarActionResult;
        yield* saveSources([...existing, ...next]);
        return { ok: true, message: "Calendar saved." } satisfies CalendarActionResult;
      }).pipe(Effect.catch(() => Effect.succeed(saveFailed))),
    );

  const testLink: Calendar["Service"]["testLink"] = (raw) => {
    const link = checkCalendarLink(raw);
    if (!link.ok) return Effect.succeed({ ok: false, message: link.message });
    return fetchIcs(link.url).pipe(
      Effect.map((text): CalendarActionResult => {
        const count = countIcsEvents(text);
        return {
          ok: true,
          message: `Found ${count} ${count === 1 ? "event" : "events"}.`,
          eventCount: count,
        };
      }),
      Effect.catchTags({
        CalendarError: (error) => Effect.succeed({ ok: false, message: error.message }),
      }),
    );
  };

  const addLink: Calendar["Service"]["addLink"] = (input) =>
    Effect.gen(function* () {
      const tested = yield* testLink(input.url);
      const link = checkCalendarLink(input.url);
      if (!tested.ok || !link.ok) return tested;
      const saved = yield* addSources((existing, id) => {
        if (existing.length >= MAX_SOURCES)
          return `You can connect up to ${MAX_SOURCES} calendars.`;
        if (existing.some((s) => s.url === link.url)) return "That calendar is already connected.";
        return [
          {
            id,
            kind: "ics",
            name: input.name.trim().slice(0, 60) || defaultCalendarName(link.url),
            color: pickColor(input.color, existing.length),
            url: link.url,
          },
        ];
      });
      return saved.ok
        ? {
            ...saved,
            message: tested.message,
            ...(tested.eventCount === undefined ? {} : { eventCount: tested.eventCount }),
          }
        : saved;
    });

  const remove: Calendar["Service"]["remove"] = (id) =>
    writeLock.withPermits(1)(
      Effect.gen(function* () {
        const existing = yield* loadSources;
        const next = existing.filter((s) => s.id !== id);
        yield* saveSources(next);
        status.delete(id);
        for (const key of cache.keys())
          if (key.startsWith(`ics:${id}`) || key.startsWith(`g:${id}:`)) cache.delete(key);
        if (!next.some((s) => s.kind === "google")) {
          access = null;
          yield* secrets.remove(GOOGLE_TOKEN_SECRET);
        }
        return { ok: true, message: "Calendar removed." } satisfies CalendarActionResult;
      }).pipe(Effect.catch(() => Effect.succeed(saveFailed))),
    );

  const googleSetClient: Calendar["Service"]["googleSetClient"] = (input) => {
    const id = input.clientId.trim();
    if (!/^[\w.-]+\.apps\.googleusercontent\.com$/.test(id)) {
      return Effect.succeed({
        ok: false,
        message:
          "That does not look like a Google client ID. It ends in .apps.googleusercontent.com.",
      });
    }
    access = null;
    return writeSecret(
      GOOGLE_CLIENT_SECRET,
      encodeClient({ id, secret: input.clientSecret.trim() }),
    ).pipe(
      Effect.as({
        ok: true,
        message: "Saved. You can sign in with Google now.",
      } satisfies CalendarActionResult),
      Effect.catch(() => Effect.succeed(saveFailed)),
    );
  };

  const signIn = (client: GoogleClient) =>
    Effect.acquireUseRelease(
      Effect.tryPromise({
        try: () => nodeLoopbackListener.start(),
        catch: (cause) => new CalendarError({ reason: "googleFailed", cause }),
      }),
      (session) =>
        Effect.gen(function* () {
          const verifier = base64Url(nodeOAuthCrypto.randomBytes(32));
          const state = base64Url(nodeOAuthCrypto.randomBytes(16));
          const authUrl = `${GOOGLE_AUTH_URL}?${new URLSearchParams({
            client_id: client.id,
            redirect_uri: session.redirectUri,
            response_type: "code",
            scope: GOOGLE_SCOPE,
            code_challenge: base64Url(nodeOAuthCrypto.sha256(verifier)),
            code_challenge_method: "S256",
            state,
            access_type: "offline",
            prompt: "consent",
          })}`;
          yield* launcher
            .launchBrowser(authUrl)
            .pipe(Effect.mapError((cause) => new CalendarError({ reason: "googleFailed", cause })));
          const redirect = yield* Effect.tryPromise({
            try: () => session.next(SIGN_IN_TIMEOUT_MS),
            catch: (cause) => new CalendarError({ reason: "googleFailed", cause }),
          });
          if (redirect.error || redirect.state !== state || !redirect.code) {
            return yield* new CalendarError({ reason: "googleFailed" });
          }
          const reply = yield* tokenCall(client, {
            grant_type: "authorization_code",
            code: redirect.code,
            code_verifier: verifier,
            redirect_uri: session.redirectUri,
          });
          const scopes = typeof reply.scope === "string" ? reply.scope.split(" ") : [];
          if (typeof reply.refresh_token !== "string" || !scopes.includes(GOOGLE_SCOPE)) {
            return yield* new CalendarError({ reason: "googleFailed" });
          }
          yield* writeSecret(
            GOOGLE_TOKEN_SECRET,
            encodeToken({ v: 1, refreshToken: reply.refresh_token }),
          ).pipe(Effect.mapError((cause) => new CalendarError({ reason: "googleFailed", cause })));
          access = null;
        }),
      (session) => Effect.sync(() => session.close()),
    );

  const googleConnect: Calendar["Service"]["googleConnect"] = Effect.gen(function* () {
    const client = yield* googleClient;
    if (!client) return { ok: false, message: MESSAGES.googleNotReady, calendars: [] };
    yield* signIn(client);
    const body = yield* googleGet(
      `${GOOGLE_API}/users/me/calendarList?minAccessRole=reader&maxResults=100`,
    );
    const items = Array.isArray(body.items) ? (body.items as Record<string, unknown>[]) : [];
    const calendars = items.flatMap((item, index): CalendarGoogleCalendar[] =>
      typeof item.id === "string"
        ? [
            {
              id: item.id,
              name: String(item.summaryOverride ?? item.summary ?? item.id).slice(0, 80),
              color: pickColor(String(item.backgroundColor ?? ""), index),
            },
          ]
        : [],
    );
    return { ok: true, message: "Signed in. Pick the calendars to show.", calendars };
  }).pipe(
    Effect.catchTags({
      CalendarError: (error) =>
        Effect.succeed({ ok: false, message: error.message, calendars: [] }),
    }),
  );

  const googleSelect: Calendar["Service"]["googleSelect"] = (calendars) =>
    Effect.gen(function* () {
      const picked = calendars.filter((c) => c.id.length > 0 && c.id.length <= 300);
      if (picked.length === 0) return { ok: false, message: "Pick at least one calendar." };
      const ids = yield* Effect.forEach(picked, () => newId);
      return yield* addSources((existing) => {
        const fresh = picked.filter((c) => !existing.some((s) => s.calendarId === c.id));
        if (existing.length + fresh.length > MAX_SOURCES)
          return `You can connect up to ${MAX_SOURCES} calendars.`;
        return fresh.map((c, i): StoredSource => ({
          id: ids[i] ?? `cal-${i}`,
          kind: "google",
          name: c.name.slice(0, 60),
          color: pickColor(c.color, existing.length + i),
          calendarId: c.id,
        }));
      });
    });

  return Calendar.of({
    events,
    testLink,
    addLink,
    remove,
    googleSetClient,
    googleConnect,
    googleSelect,
  });
});

export const layer = Layer.effect(Calendar, make);
