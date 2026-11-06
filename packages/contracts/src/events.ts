// @effect-diagnostics globalDate:off - writers outside Effect (scripts, the web client) stamp events with wall-clock time.
import * as Exit from "effect/Exit";
import * as Schema from "effect/Schema";

/**
 * The Leonidas event feed (ADR-0087): one append-only `events/YYYY-MM.jsonl` per AIOS.
 * Contract: projects/leonidas-product/event-feed-schema.md in the AIOS.
 */

const NonBlank = Schema.String.check(
  Schema.makeFilter((value: string) => value.trim().length > 0, { expected: "a non-blank string" }),
);
const HttpUrl = Schema.String.check(
  Schema.isPattern(/^https?:\/\//i, { expected: "an http or https URL" }),
);

export const FeedEventLevel = Schema.Literals(["info", "needs_you", "failed"]);
export type FeedEventLevel = typeof FeedEventLevel.Type;

export const FeedEventActor = Schema.Struct({
  kind: Schema.Literals(["agent", "script", "app", "watcher", "member", "mod"]),
  name: NonBlank,
  member: Schema.optional(NonBlank),
});
export type FeedEventActor = typeof FeedEventActor.Type;

export const FeedEventTarget = Schema.Struct({
  files: Schema.optional(Schema.Array(NonBlank)),
  thread: Schema.optional(NonBlank),
  task: Schema.optional(NonBlank),
  url: Schema.optional(HttpUrl),
});
export type FeedEventTarget = typeof FeedEventTarget.Type;

/** Buttons only open things in 1.0; they never run commands. */
export const FeedEventAction = Schema.Union([
  Schema.Struct({
    label: NonBlank,
    kind: Schema.Literals(["open_thread", "open_file", "open_task"]),
    ref: NonBlank,
  }),
  Schema.Struct({ label: NonBlank, kind: Schema.Literal("open_url"), ref: HttpUrl }),
]);
export type FeedEventAction = typeof FeedEventAction.Type;

/** What a writer supplies; the helper adds `v`, `id` and `ts`. */
export const FeedEventDraft = Schema.Struct({
  level: FeedEventLevel,
  type: Schema.String.check(
    Schema.isPattern(/^[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]+)+$/, { expected: "a dotted type name" }),
  ),
  title: NonBlank.check(Schema.isMaxLength(80)),
  actor: FeedEventActor,
  body: Schema.optional(Schema.String.check(Schema.isMaxLength(500))),
  /** Task ledger entries name the chat and model that did the work. */
  chat: Schema.optional(NonBlank),
  model: Schema.optional(NonBlank),
  target: Schema.optional(FeedEventTarget),
  actions: Schema.optional(Schema.Array(FeedEventAction).check(Schema.isMaxLength(2))),
  for: Schema.optional(Schema.Array(NonBlank)),
  dedupe: Schema.optional(NonBlank.check(Schema.isMaxLength(200))),
});
export type FeedEventDraft = typeof FeedEventDraft.Type;

export const FeedEvent = Schema.Struct({
  v: Schema.Literal(1),
  id: Schema.String.check(Schema.isPattern(/^evt_[0-9A-Za-z]+$/, { expected: "evt_ plus a ULID" })),
  ts: Schema.String.check(
    Schema.isPattern(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/, {
      expected: "ISO 8601 time with an offset",
    }),
  ),
  ...FeedEventDraft.fields,
});
export type FeedEvent = typeof FeedEvent.Type;

export type FeedEventDecode =
  | { readonly ok: true; readonly event: FeedEvent }
  | { readonly ok: false; readonly reason: string };

const decodeExit = Schema.decodeUnknownExit(FeedEvent);

export function decodeFeedEvent(value: unknown): FeedEventDecode {
  const exit = decodeExit(value);
  return Exit.isSuccess(exit)
    ? { ok: true, event: exit.value }
    : { ok: false, reason: String(exit.cause).slice(0, 300) };
}

export function decodeFeedEventLine(line: string): FeedEventDecode {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return { ok: false, reason: "not valid JSON" };
  }
  return decodeFeedEvent(value);
}

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
let lastTime = -1;
const lastRandom = new Uint8Array(16);

/** `evt_` plus a ULID; ids made in the same millisecond still sort in order. */
export function makeFeedEventId(now: number = Date.now()): string {
  if (now === lastTime) {
    let i = 15;
    while (i >= 0 && lastRandom[i] === 31) lastRandom[i--] = 0;
    if (i >= 0) lastRandom[i]! += 1;
  } else {
    lastTime = now;
    crypto.getRandomValues(lastRandom);
    for (let i = 0; i < 16; i++) lastRandom[i]! &= 31;
  }
  let time = "";
  for (let t = now, i = 0; i < 10; i++, t = Math.floor(t / 32)) time = CROCKFORD[t % 32] + time;
  let random = "";
  for (const digit of lastRandom) random += CROCKFORD[digit];
  return `evt_${time}${random}`;
}

/** Local time with its UTC offset, for example `2026-10-20T21:14:03-07:00`. */
function feedEventTimestamp(now: number = Date.now()): string {
  const date = new Date(now);
  const offset = -date.getTimezoneOffset();
  const pad = (value: number) => String(Math.floor(Math.abs(value))).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}` +
    `${offset >= 0 ? "+" : "-"}${pad(offset / 60)}:${pad(offset % 60)}`
  );
}

export function completeFeedEvent(draft: FeedEventDraft, now: number = Date.now()): FeedEvent {
  return { v: 1, id: makeFeedEventId(now), ts: feedEventTimestamp(now), ...draft };
}

/** A feed event after `dedupe` folding: `count` is 1 when nothing folded into it. */
export const FoldedFeedEvent = Schema.Struct({ ...FeedEvent.fields, count: Schema.Number });
export type FoldedFeedEvent = typeof FoldedFeedEvent.Type;

/** Events that wait for the user. A feed trim keeps these at any age, so Needs you never drops one. */
export const waitsForUser = (event: { readonly level: string }): boolean =>
  event.level === "needs_you" || event.level === "failed";

export const FeedBadLine = Schema.Struct({
  file: Schema.String,
  line: Schema.Number,
  reason: Schema.String,
});
export type FeedBadLine = typeof FeedBadLine.Type;

/** `snapshot` replaces the list; `upsert` adds new events or raises a folded count. */
export const FeedUpdate = Schema.Struct({
  kind: Schema.Literals(["snapshot", "upsert"]),
  events: Schema.Array(FoldedFeedEvent),
  bad: Schema.Array(FeedBadLine),
});
export type FeedUpdate = typeof FeedUpdate.Type;

export const EventsSubscribeInput = Schema.Struct({ workspaceId: Schema.optional(Schema.String) });
export type EventsSubscribeInput = typeof EventsSubscribeInput.Type;

export const EventsAppendInput = Schema.Struct({
  workspaceId: Schema.optional(Schema.String),
  event: FeedEventDraft,
});
export type EventsAppendInput = typeof EventsAppendInput.Type;

export class FeedEventError extends Schema.TaggedError<FeedEventError>()("FeedEventError", {
  message: Schema.String,
}) {}
