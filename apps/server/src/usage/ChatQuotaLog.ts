import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { writeFileStringAtomically } from "@t3tools/shared/atomicWrite";

import {
  attributeChatQuota,
  fromChatQuotaLine,
  toChatQuotaLine,
  type ChatQuotaReading,
  type ChatQuotaTotals,
} from "./chatQuota.ts";

/** Readings older than this are dropped when a driver starts. */
export const CHAT_QUOTA_RETENTION_MS = 30 * 86_400_000;

const Line = Schema.Struct({
  t: Schema.Number,
  th: Schema.String,
  u5: Schema.optional(Schema.Number),
  r5: Schema.optional(Schema.String),
  u7: Schema.optional(Schema.Number),
  r7: Schema.optional(Schema.String),
});
const decodeLine = Schema.decodeUnknownOption(Schema.fromJsonString(Line));
const encodeLine = Schema.encodeSync(Schema.fromJsonString(Line));

const chatQuotaDir = (path: Path.Path, cacheDir: string) => path.join(cacheDir, "chat-quota");
const fileName = (instanceId: string) => `${instanceId.replace(/[^A-Za-z0-9_-]/g, "_")}.jsonl`;

const parseLines = (raw: string) =>
  raw.split("\n").flatMap((line) => {
    const trimmed = line.trim();
    if (!trimmed) return [];
    const decoded = decodeLine(trimmed);
    return Option.isSome(decoded) ? [decoded.value] : [];
  });

/**
 * The writer for one provider instance. Only numbers and ids are stored: no message text, no
 * account email. A line is written only when the thread or a percent changes, so a busy account
 * adds a few hundred lines a day. A failed write never fails the turn.
 */
export const makeChatQuotaRecorder = Effect.fn("makeChatQuotaRecorder")(function* (
  cacheDir: string,
  instanceId: string,
  nowMs: number,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const dir = chatQuotaDir(path, cacheDir);
  const filePath = path.join(dir, fileName(instanceId));
  const raw = yield* fs.readFileString(filePath).pipe(Effect.orElseSucceed(() => ""));
  const lines = parseLines(raw);
  const kept = lines.filter((line) => line.t >= nowMs - CHAT_QUOTA_RETENTION_MS);
  if (kept.length < lines.length) {
    yield* writeFileStringAtomically({
      filePath,
      contents: kept.map((line) => encodeLine(line) + "\n").join(""),
    }).pipe(
      Effect.provideService(FileSystem.FileSystem, fs),
      Effect.provideService(Path.Path, path),
      Effect.orElseSucceed(() => undefined),
    );
  }
  const last = kept.at(-1);
  let lastKey = last ? encodeLine({ ...last, t: 0 }) : "";

  return (reading: ChatQuotaReading): Effect.Effect<void> => {
    const line = toChatQuotaLine(reading);
    const key = encodeLine({ ...line, t: 0 });
    if (key === lastKey) return Effect.void;
    lastKey = key;
    return fs.makeDirectory(dir, { recursive: true }).pipe(
      Effect.andThen(fs.writeFileString(filePath, encodeLine(line) + "\n", { flag: "a" })),
      Effect.tapError(Effect.logWarning),
      Effect.orElseSucceed(() => undefined),
    );
  };
});

/** Per-chat totals for every account with readings since `sinceMs`, most points first. */
export const readChatQuota = Effect.fn("readChatQuota")(function* (
  cacheDir: string,
  sinceMs: number,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const dir = chatQuotaDir(path, cacheDir);
  const names = yield* fs.readDirectory(dir).pipe(Effect.orElseSucceed(() => []));
  const rows: ChatQuotaTotals[] = [];
  let coverageStart: number | null = null;
  for (const name of names) {
    if (!name.endsWith(".jsonl")) continue;
    const raw = yield* fs.readFileString(path.join(dir, name)).pipe(Effect.orElseSucceed(() => ""));
    const readings = parseLines(raw)
      .filter((line) => line.t >= sinceMs)
      .map(fromChatQuotaLine);
    const first = readings.reduce<number | null>(
      (min, reading) => (min === null || reading.at < min ? reading.at : min),
      null,
    );
    if (first !== null && (coverageStart === null || first < coverageStart)) coverageStart = first;
    rows.push(...attributeChatQuota(name.slice(0, -".jsonl".length), readings));
  }
  rows.sort((a, b) => b.weekly.points - a.weekly.points || b.fiveHour.points - a.fiveHour.points);
  return { coverageStart, chats: rows };
});
