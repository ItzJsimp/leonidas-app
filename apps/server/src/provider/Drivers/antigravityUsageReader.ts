import type { TurnTokenUsage } from "@t3tools/contracts";
// @effect-diagnostics-next-line nodeBuiltinImport:off - Effect's File.Info has no ctime, which the cache fingerprint needs.
import * as NodeFSP from "node:fs/promises";

import {
  type AntigravityModelName,
  antigravityModelNameFromLabel,
} from "../antigravityModelNames.ts";
import type { UsageRecord } from "@t3tools/provider-core/server/usage";
import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as SqlClient from "effect/sql/SqlClient";

type FieldValue = number | bigint | Uint8Array;
type Fields = Map<number, FieldValue[]>;

function fields(bytes: Uint8Array): Fields {
  let offset = 0;
  const result: Fields = new Map();
  const varint = () => {
    let value = 0n;
    for (let shift = 0n; shift < 70n; shift += 7n) {
      const byte = bytes[offset++];
      if (byte === undefined || (shift === 63n && byte > 1)) {
        throw new Error("Invalid Antigravity protobuf varint");
      }
      value |= BigInt(byte & 127) << shift;
      if (byte < 128) {
        return value > BigInt(Number.MAX_SAFE_INTEGER) ? value : Number(value);
      }
    }
    throw new Error("Invalid Antigravity protobuf varint");
  };
  while (offset < bytes.length) {
    const tag = varint();
    if (typeof tag !== "number") throw new Error("Invalid protobuf field");
    const number = Math.floor(tag / 8);
    const wire = tag % 8;
    if (number === 0) throw new Error("Invalid protobuf field");
    let value: FieldValue;
    if (wire === 0) {
      value = varint();
    } else if (wire === 1 || wire === 5 || wire === 2) {
      const length = wire === 2 ? varint() : wire === 1 ? 8 : 4;
      if (typeof length !== "number") throw new Error("Invalid protobuf field length");
      if (length > bytes.length - offset) throw new Error("Truncated protobuf field");
      value = bytes.subarray(offset, offset + length);
      offset += length;
      if (wire !== 2) continue;
    } else {
      throw new Error("Unsupported protobuf wire type");
    }
    const entries = result.get(number) ?? [];
    entries.push(value);
    result.set(number, entries);
  }
  return result;
}

const numberAt = (value: Fields, key: number) => {
  const entry = value.get(key)?.[0];
  return typeof entry === "number" ? entry : 0;
};
const bytesAt = (value: Fields, key: number) => {
  const entry = value.get(key)?.[0];
  return entry instanceof Uint8Array ? entry : undefined;
};
const nested = (value: Fields, key: number) => {
  const bytes = bytesAt(value, key);
  return bytes === undefined ? new Map<number, FieldValue[]>() : fields(bytes);
};
const textAt = (value: Fields, key: number) => {
  const bytes = bytesAt(value, key);
  return bytes === undefined ? "" : new TextDecoder("utf-8", { fatal: true }).decode(bytes).trim();
};
const timestamp = (value: Fields) => {
  const seconds = numberAt(value, 1);
  return seconds > 0 ? seconds * 1000 + Math.floor(numberAt(value, 2) / 1_000_000) : null;
};

const MODEL_IDS: Record<number, string> = {
  246: "gemini-2.5-pro",
  312: "gemini-2.5-flash",
  313: "gemini-2.5-flash-thinking",
  329: "gemini-2.5-flash-thinking",
  330: "gemini-2.5-flash-lite",
  281: "claude-sonnet-4",
  282: "claude-sonnet-4",
  290: "claude-opus-4",
  291: "claude-opus-4",
  333: "claude-sonnet-4-5",
  334: "claude-sonnet-4-5",
  340: "claude-haiku-4-5",
  341: "claude-haiku-4-5",
  1026: "claude-opus-4-6",
  1035: "claude-sonnet-4-6",
  1016: "gemini-3.1-pro",
  1036: "gemini-3.1-pro",
  1037: "gemini-3.1-pro",
  1018: "gemini-3-flash-preview",
  1084: "gemini-3-flash-preview",
  1047: "gemini-3-flash-preview",
};

const UNMAPPED_MODEL = /^antigravity-model-(\d+)$/;

function modelName(name: string, id: number): AntigravityModelName {
  if (name) return antigravityModelNameFromLabel(name);
  return { model: MODEL_IDS[id] ?? (id > 0 ? `antigravity-model-${id}` : "") };
}

interface Metadata {
  model: string;
  rateModel?: string;
  /** Raw numeric model id, 0 when absent. */
  modelId: number;
  /** Whether the model came from a text name rather than only an id. */
  named: boolean;
  timestampMs: number | null;
  usages: Fields[];
}

function metadata(bytes: Uint8Array, step: boolean): Metadata {
  const root = fields(bytes);
  if (!step && bytesAt(root, 1) === undefined) {
    throw new Error("Missing Antigravity generation metadata");
  }
  const data = step ? root : nested(root, 1);
  const model = step ? nested(data, 24) : data;
  const usage = bytesAt(data, step ? 9 : 4);
  // Copy the usage bytes: subarrays kept in usages would hold each row's whole blob alive.
  const usages = usage === undefined ? [] : [fields(usage.slice())];
  for (const retry of data.get(step ? 28 : 17) ?? []) {
    if (!(retry instanceof Uint8Array)) throw new Error("Invalid retry metadata");
    const retryUsage = bytesAt(fields(retry), 2);
    if (retryUsage !== undefined) usages.push(fields(retryUsage.slice()));
  }
  const label = textAt(model, step ? 12 : 19) || textAt(model, step ? 8 : 21);
  const modelId = numberAt(model, step ? 1 : 3);
  const resolved = modelName(label, modelId);
  return {
    model: resolved.model,
    ...(resolved.rateModel === undefined ? {} : { rateModel: resolved.rateModel }),
    modelId,
    named: label !== "",
    timestampMs: step
      ? (timestamp(nested(data, 8)) ?? timestamp(nested(data, 1)))
      : timestamp(nested(nested(data, 9), 4)),
    usages,
  };
}

const entryModel = (entry: Metadata): AntigravityModelName => ({
  model: entry.model,
  ...(entry.rateModel === undefined ? {} : { rateModel: entry.rateModel }),
});

function blob(value: unknown): Uint8Array {
  if (!(value instanceof Uint8Array)) throw new Error("Invalid Antigravity metadata blob");
  return value;
}

/**
 * `steps.step_type` of a model tool call (its payload names the tool). A tool
 * step whose usage is empty is skipped with it, so counts can run slightly low.
 */
const TOOL_CALL_STEP_TYPE = 132;

interface UsageCandidate {
  record: UsageRecord;
  keys: readonly string[];
  /**
   * Tool call steps as `session:idx`. Parallel calls share one usage and merge
   * into one group; a set keeps each once, including copies in backup stores.
   */
  toolSteps?: readonly string[];
  timestampQuality: number;
  /** A numeric id this record's own text name identifies, for naming id-only records. */
  learned?: { readonly id: number } & AntigravityModelName;
}

class AntigravityDatabaseDecodeError extends Schema.TaggedError<AntigravityDatabaseDecodeError>()(
  "AntigravityDatabaseDecodeError",
  { path: Schema.String, cause: Schema.optional(Schema.Defect()) },
) {
  override get message(): string {
    return `Antigravity usage could not be decoded from ${this.path}.`;
  }
}

/**
 * One statement.all() holds the event loop until every row it returns is in memory, and a
 * generation row carries the conversation's whole context so far, often megabytes, so generations
 * are read one at a time.
 */
const GENERATION_PAGE_ROWS = 1;
const STEP_PAGE_ROWS = 64;

const readDatabase = Effect.fn("readDatabase")(function* (
  path: string,
  sessionId: string,
  fallbackTimestamp: number,
) {
  const sql = yield* SqlClient.SqlClient;
  const decode = <A>(evaluate: () => A) =>
    Effect.try({
      try: evaluate,
      catch: (cause) => new AntigravityDatabaseDecodeError({ path, cause }),
    });
  yield* sql.unsafe("PRAGMA busy_timeout = 100");
  return yield* Effect.gen(function* () {
    const tables = new Set(
      (yield* sql.unsafe<{ readonly name: unknown }>(
        "SELECT name FROM sqlite_master WHERE type = 'table'",
      )).map((row) => row.name),
    );
    if (!tables.has("gen_metadata") && !tables.has("steps")) {
      return yield* new AntigravityDatabaseDecodeError({ path });
    }
    // A rowid seek works whatever the table's indexes. Antigravity declares idx as the INTEGER
    // PRIMARY KEY, so rowid order is idx order; the sort keeps idx order where rows are stored
    // otherwise.
    const readMetadata = Effect.fnUntraced(function* (
      query: string,
      pageRows: number,
      step: boolean,
    ) {
      const entries: Array<{ idx: number; entry: Metadata; toolStep: boolean }> = [];
      let after = -Infinity;
      while (true) {
        const rows = yield* sql
          .unsafe<{
            readonly row_id: number;
            readonly idx: unknown;
            readonly data: unknown;
            readonly step_type?: unknown;
          }>(query, [after, pageRows])
          .pipe(Effect.withTracerEnabled(false));
        for (const row of rows) {
          // Skipped here rather than in SQL, so a statement never scans past
          // more than one page of steps that have no metadata.
          if (step && row.data === null) continue;
          const idx = row.idx;
          if (typeof idx !== "number") {
            return yield* new AntigravityDatabaseDecodeError({ path });
          }
          entries.push({
            idx,
            entry: yield* decode(() => metadata(blob(row.data), step)),
            toolStep: row.step_type === TOOL_CALL_STEP_TYPE,
          });
        }
        if (rows.length < pageRows) break;
        after = rows[rows.length - 1]!.row_id;
        yield* Effect.yieldNow;
      }
      return entries.sort((a, b) => a.idx - b.idx);
    });
    const generations = tables.has("gen_metadata")
      ? yield* readMetadata(
          "SELECT rowid AS row_id, idx, data FROM gen_metadata WHERE rowid > ? ORDER BY rowid LIMIT ?",
          GENERATION_PAGE_ROWS,
          false,
        )
      : [];
    let trajectoryTimestamp: number | null = null;
    if (tables.has("trajectory_metadata_blob")) {
      for (const row of yield* sql.unsafe<{ readonly data: unknown }>(
        "SELECT data FROM trajectory_metadata_blob",
      )) {
        trajectoryTimestamp ??= yield* decode(() => timestamp(nested(fields(blob(row.data)), 2)));
      }
    }
    // Older stores have no `step_type`; their steps count no tool calls.
    const stepType = (yield* sql.unsafe<{ readonly name: unknown }>(
      "SELECT name FROM pragma_table_info('steps')",
    )).some((column) => column.name === "step_type")
      ? "step_type"
      : "NULL AS step_type";
    const steps = tables.has("steps")
      ? yield* readMetadata(
          `SELECT rowid AS row_id, idx, ${stepType}, metadata AS data FROM steps WHERE rowid > ? ORDER BY rowid LIMIT ?`,
          STEP_PAGE_ROWS,
          true,
        )
      : [];
    return yield* decode(() =>
      usageCandidates(sessionId, generations, steps, trajectoryTimestamp, fallbackTimestamp),
    );
  }).pipe(sql.withTransaction);
});

function usageCandidates(
  sessionId: string,
  generations: ReadonlyArray<{ idx: number; entry: Metadata; toolStep: boolean }>,
  steps: ReadonlyArray<{ idx: number; entry: Metadata; toolStep: boolean }>,
  trajectoryTimestamp: number | null,
  fallbackTimestamp: number,
): UsageCandidate[] {
  const records: UsageCandidate[] = [];
  const generationModels = new Map(generations.map(({ idx, entry }) => [idx, entry]));
  for (const [source, entries] of [
    ["step", steps],
    ["generation", generations],
  ] as const) {
    for (const [index, { idx, entry, toolStep }] of entries.entries()) {
      for (const [usageIndex, usage] of entry.usages.entries()) {
        const outputTokens = Math.max(numberAt(usage, 3), numberAt(usage, 9) + numberAt(usage, 10));
        const totals = {
          uncachedInputTokens: numberAt(usage, 2),
          cachedInputTokens: numberAt(usage, 5),
          cacheCreationTokens: numberAt(usage, 4),
          outputTokens,
          reasoningTokens: Math.min(outputTokens, numberAt(usage, 9)),
        };
        if (
          totals.uncachedInputTokens +
            totals.cachedInputTokens +
            totals.cacheCreationTokens +
            outputTokens ===
          0
        )
          continue;
        const keys = ([11, 12, 7] as const).flatMap((key) => {
          const id = textAt(usage, key);
          return id ? [`antigravity:${key}:${id}`] : [];
        });
        const mapped = MODEL_IDS[numberAt(usage, 1)];
        const generation = source === "step" ? generationModels.get(idx) : undefined;
        const recordModel: AntigravityModelName =
          mapped !== undefined
            ? { model: mapped }
            : entry.model !== ""
              ? entryModel(entry)
              : generation?.model
                ? entryModel(generation)
                : { model: modelName("", numberAt(usage, 1)).model || "antigravity-unknown" };
        const record: UsageRecord = {
          provider: "antigravity",
          sessionId,
          timestampMs: entry.timestampMs ?? trajectoryTimestamp ?? fallbackTimestamp,
          ...recordModel,
          totals,
          reportedCostUsd: null,
          speed: "standard",
          dedupeKey: keys[0] ?? `antigravity:${sessionId}:${source}:${index}:${usageIndex}`,
        };
        records.push({
          record,
          keys,
          ...(toolStep && usageIndex === 0 ? { toolSteps: [`${sessionId}:${idx}`] } : {}),
          timestampQuality: entry.timestampMs !== null ? 2 : trajectoryTimestamp !== null ? 1 : 0,
          ...(entry.named && entry.modelId > 0 && MODEL_IDS[entry.modelId] === undefined
            ? { learned: { id: entry.modelId, ...entryModel(entry) } }
            : {}),
        });
      }
    }
  }
  return records;
}

interface CachedDatabase {
  readonly fingerprint: string;
  readonly candidates: readonly UsageCandidate[];
}

/**
 * Parsed databases keyed by canonical path. An entry is reused only while both
 * the database and its `-wal` sidecar keep the same size, mtime and ctime: new
 * rows land in the WAL without touching the main file until a checkpoint, and
 * ctime moves on any content write even when mtime is restored.
 */
export const makeAntigravityUsageCache = () => new Map<string, CachedDatabase>();

export const readAntigravityUsage = Effect.fn("readAntigravityUsage")(function* (
  conversationsDirectories: string | readonly string[],
  sinceMs: number,
  cache?: Map<string, CachedDatabase>,
) {
  const fileSystem = yield* FileSystem.FileSystem;
  const pathService = yield* Path.Path;
  const roots =
    typeof conversationsDirectories === "string"
      ? [conversationsDirectories]
      : conversationsDirectories;
  const files: Array<{ root: string; path: string; records: UsageRecord[] }> = [];
  const errors: string[] = [];
  const identities = new Map<string, number>();
  const groups: Array<
    UsageCandidate & { parent: number; size: number; owner: number; fileIndex: number }
  > = [];
  const find = (index: number): number => {
    let root = index;
    while (groups[root]!.parent !== root) root = groups[root]!.parent;
    while (index !== root) {
      const parent = groups[index]!.parent;
      groups[index]!.parent = root;
      index = parent;
    }
    return root;
  };
  const merge = (left: number, right: number): number => {
    let a = find(left);
    let b = find(right);
    if (a === b) return a;
    if (groups[a]!.size < groups[b]!.size) [a, b] = [b, a];
    const target = groups[a]!;
    const source = groups[b]!;
    const first = target.owner < source.owner ? target : source;
    const bestTime =
      source.timestampQuality > target.timestampQuality ||
      (source.timestampQuality === target.timestampQuality &&
        source.record.timestampMs < target.record.timestampMs)
        ? source
        : target;
    const x = target.record.totals;
    const y = source.record.totals;
    const named =
      first.record.model === "antigravity-unknown"
        ? first === target
          ? source.record
          : target.record
        : first.record;
    const { rateModel: _firstRateModel, ...firstRecord } = first.record;
    target.record = {
      ...firstRecord,
      model: named.model,
      ...(named.rateModel === undefined ? {} : { rateModel: named.rateModel }),
      timestampMs: bestTime.record.timestampMs,
      totals: {
        uncachedInputTokens: Math.max(x.uncachedInputTokens, y.uncachedInputTokens),
        cachedInputTokens: Math.max(x.cachedInputTokens, y.cachedInputTokens),
        cacheCreationTokens: Math.max(x.cacheCreationTokens, y.cacheCreationTokens),
        outputTokens: Math.max(x.outputTokens, y.outputTokens),
        reasoningTokens: Math.max(x.reasoningTokens, y.reasoningTokens),
      },
    };
    if (source.toolSteps) {
      target.toolSteps = [...new Set([...(target.toolSteps ?? []), ...source.toolSteps])];
    }
    target.timestampQuality = bestTime.timestampQuality;
    target.owner = first.owner;
    target.fileIndex = first.fileIndex;
    target.size += source.size;
    source.parent = a;
    return a;
  };
  const append = (candidate: UsageCandidate, fileIndex: number) => {
    const index = groups.length;
    groups.push({ ...candidate, parent: index, size: 1, owner: index, fileIndex });
    for (const key of candidate.keys) {
      const existing = identities.get(key);
      if (existing !== undefined) merge(index, existing);
      identities.set(key, index);
    }
  };
  const visited = new Set<string>();
  const readFile = Effect.fn("readAntigravityUsage.readFile")(function* (path: string) {
    const canonical = yield* fileSystem.realPath(path);
    if (visited.has(canonical)) return null;
    visited.add(canonical);
    const fingerprintOf = (file: string) =>
      Effect.tryPromise(() => NodeFSP.stat(file)).pipe(
        Effect.map((stat) => ({ stat, part: `${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}` })),
      );
    const { stat, part } = yield* fingerprintOf(path);
    const wal = yield* fingerprintOf(`${path}-wal`).pipe(Effect.option);
    const fingerprint = `${part}/${wal._tag === "Some" ? wal.value.part : "-"}`;
    const cached = cache?.get(canonical);
    if (cached?.fingerprint === fingerprint) return cached.candidates;
    const candidates = yield* readDatabase(
      path,
      pathService.basename(path, ".db"),
      stat.mtimeMs,
    ).pipe(Effect.provide(NodeSqliteClient.layer({ filename: path, readonly: true })));
    cache?.set(canonical, { fingerprint, candidates });
    return candidates;
  });
  const walk = Effect.fn("antigravityUsageReader.walk")(function* (
    directory: string,
    root: string,
  ): Effect.fn.Return<void> {
    const names = yield* fileSystem.readDirectory(directory).pipe(
      Effect.catchTags({
        PlatformError: (cause) => {
          if (cause.reason._tag !== "NotFound") errors.push(directory);
          return Effect.succeed(null);
        },
      }),
    );
    if (names === null) return;
    names.sort((a, b) => a.localeCompare(b));
    for (const name of names) {
      const path = pathService.join(directory, name);
      // Like a directory listing's entry types: symlinks are neither files nor directories.
      const isLink = Exit.isSuccess(yield* Effect.exit(fileSystem.readLink(path)));
      const type = isLink
        ? "SymbolicLink"
        : yield* fileSystem.stat(path).pipe(
            Effect.map((info) => info.type),
            Effect.orElseSucceed(() => null),
          );
      if (type === "Directory") {
        yield* walk(path, root);
      } else if ((type === "File" || type === null) && name.endsWith(".db")) {
        const candidates = yield* readFile(path).pipe(
          Effect.catch(() => {
            errors.push(path);
            return Effect.succeed(null);
          }),
        );
        if (candidates === null) continue;
        const fileIndex = files.length;
        files.push({ root, path, records: [] });
        for (const [index, candidate] of candidates.entries()) {
          append(candidate, fileIndex);
          if (index % 256 === 255) yield* Effect.yieldNow;
        }
      }
    }
  });
  for (const root of roots) yield* walk(root, root);
  if (cache !== undefined) {
    for (const key of cache.keys()) if (!visited.has(key)) cache.delete(key);
  }
  // Records that carry only a numeric model id take the name another record in
  // this scan gave that id.
  const learned = new Map<number, AntigravityModelName>();
  for (const group of groups) if (group.learned) learned.set(group.learned.id, group.learned);
  const named = (record: UsageRecord): UsageRecord => {
    const id = Number(UNMAPPED_MODEL.exec(record.model)?.[1]);
    const name = learned.get(id);
    if (name === undefined) return record;
    const { rateModel: _unnamedRateModel, ...rest } = record;
    return {
      ...rest,
      model: name.model,
      ...(name.rateModel === undefined ? {} : { rateModel: name.rateModel }),
    };
  };
  for (const [index, group] of groups.entries()) {
    if (group.parent === index && group.record.timestampMs >= sinceMs) {
      const toolCalls = group.toolSteps?.length ?? 0;
      files[group.fileIndex]!.records.push(
        named(toolCalls > 0 ? { ...group.record, toolCalls } : group.record),
      );
    }
  }
  return { files, errors };
});

/**
 * Decodes the latest turn token usage from an Antigravity generation metadata protobuf blob.
 */
export function decodeAntigravityTurnTokenUsage(dataBlob: unknown): TurnTokenUsage | undefined {
  return decodeGeneration(dataBlob)?.usage;
}

interface DecodedGeneration {
  readonly usage: TurnTokenUsage;
  readonly timestampMs: number | null;
}

function decodeGeneration(dataBlob: unknown): DecodedGeneration | undefined {
  if (!(dataBlob instanceof Uint8Array)) return undefined;
  try {
    const meta = metadata(dataBlob, false);
    if (meta.usages.length === 0) return undefined;
    const usage = meta.usages[meta.usages.length - 1]!;
    const outputTokens = Math.max(numberAt(usage, 3), numberAt(usage, 9) + numberAt(usage, 10));
    const uncachedInput = numberAt(usage, 2);
    const cachedInput = numberAt(usage, 5);
    const cacheCreation = numberAt(usage, 4);
    const reasoningTokens = Math.min(outputTokens, numberAt(usage, 9));
    return {
      timestampMs: meta.timestampMs,
      usage: {
        usageStatus: "complete",
        usageScope: "main_agent",
        inputTokens: uncachedInput + cachedInput,
        cachedInputTokens: cachedInput,
        ...(cacheCreation > 0 ? { cacheCreationTokens: cacheCreation } : {}),
        outputTokens,
        reasoningTokens,
        hasSubagents: false,
      },
    };
  } catch {
    return undefined;
  }
}

/** Turn usage plus the size of the chat memory after the turn. */
export type AntigravityTurnUsage = TurnTokenUsage & {
  /** Input plus output of the newest model call: what the next call starts from. */
  readonly contextUsedTokens: number;
};

/** A model call can start a little before its row timestamp; allow for clock skew. */
const TURN_START_SLACK_MS = 2_000;

/**
 * Summarizes one turn from generation rows, newest first.
 *
 * A turn is many model calls: each tool result starts another one. The context size is the
 * newest call that reported tokens, because the database can end with an empty row for a call
 * that has not answered yet. Output and reasoning add up over the calls that started inside
 * the turn, so tokens per second matches what the model wrote. Without a turn start, or with
 * no row stamped inside it, the newest call stands alone.
 */
export function summarizeAntigravityTurnUsage(
  rowsNewestFirst: ReadonlyArray<unknown>,
  turn?: { readonly startedAtMs: number | null },
): AntigravityTurnUsage | undefined {
  const generations = rowsNewestFirst
    .map(decodeGeneration)
    .filter(
      (generation): generation is DecodedGeneration =>
        generation !== undefined &&
        (generation.usage.inputTokens ?? 0) + (generation.usage.outputTokens ?? 0) > 0,
    );
  const newest = generations[0];
  if (newest === undefined) return undefined;
  const startedAtMs = turn?.startedAtMs ?? null;
  const inTurn =
    startedAtMs === null
      ? []
      : generations.filter(
          (generation) =>
            generation.timestampMs !== null &&
            generation.timestampMs >= startedAtMs - TURN_START_SLACK_MS,
        );
  const counted = inTurn.length > 0 ? inTurn : [newest];
  return {
    ...newest.usage,
    outputTokens: counted.reduce((sum, { usage }) => sum + (usage.outputTokens ?? 0), 0),
    reasoningTokens: counted.reduce((sum, { usage }) => sum + (usage.reasoningTokens ?? 0), 0),
    contextUsedTokens: (newest.usage.inputTokens ?? 0) + (newest.usage.outputTokens ?? 0),
  };
}

/** Newest calls to read. A turn with more calls than this counts only its latest ones. */
const TURN_ROW_LIMIT = 60;

/**
 * Reads the turn token usage from an active Antigravity session database.
 */
export const readLatestAntigravityTurnTokenUsage = Effect.fn("readLatestAntigravityTurnTokenUsage")(
  function* (dbPath: string, turn?: { readonly startedAtMs: number | null }) {
    const sql = yield* SqlClient.SqlClient;
    const rows = yield* sql
      .unsafe<{
        readonly data: unknown;
      }>(`SELECT data FROM gen_metadata ORDER BY idx DESC LIMIT ${TURN_ROW_LIMIT}`)
      .pipe(Effect.orElseSucceed(() => []));
    return summarizeAntigravityTurnUsage(
      rows.map((row) => row.data),
      turn,
    );
  },
);

export interface AntigravitySessionTokenRoi {
  readonly totalTurns: number;
  readonly totalInputTokens: number;
  readonly cachedInputTokens: number;
  readonly uncachedInputTokens: number;
  readonly outputTokens: number;
  readonly reasoningTokens: number;
  readonly cacheSavingsPercent: number;
  readonly averageTokensPerTurn: number;
}

/**
 * Aggregates all generation metadata records in a session database to compute Token ROI and cache performance.
 */
export const analyzeAntigravitySessionTokenRoi = Effect.fn("analyzeAntigravitySessionTokenRoi")(
  function* (dbPath: string) {
    const sql = yield* SqlClient.SqlClient;
    const rows = yield* sql
      .unsafe<{ readonly data: unknown }>("SELECT data FROM gen_metadata ORDER BY idx ASC")
      .pipe(Effect.orElseSucceed(() => []));

    let totalTurns = 0;
    let uncachedInputTokens = 0;
    let cachedInputTokens = 0;
    let outputTokens = 0;
    let reasoningTokens = 0;

    for (const row of rows) {
      if (!row.data) continue;
      const turn = decodeAntigravityTurnTokenUsage(row.data);
      if (!turn) continue;
      totalTurns++;
      cachedInputTokens += turn.cachedInputTokens ?? 0;
      uncachedInputTokens += Math.max(0, (turn.inputTokens ?? 0) - (turn.cachedInputTokens ?? 0));
      outputTokens += turn.outputTokens ?? 0;
      reasoningTokens += turn.reasoningTokens ?? 0;
    }

    const totalInputTokens = uncachedInputTokens + cachedInputTokens;
    const cacheSavingsPercent =
      totalInputTokens > 0 ? Math.round((cachedInputTokens / totalInputTokens) * 100) : 0;
    const averageTokensPerTurn =
      totalTurns > 0 ? Math.round((totalInputTokens + outputTokens) / totalTurns) : 0;

    return {
      totalTurns,
      totalInputTokens,
      cachedInputTokens,
      uncachedInputTokens,
      outputTokens,
      reasoningTokens,
      cacheSavingsPercent,
      averageTokensPerTurn,
    } satisfies AntigravitySessionTokenRoi;
  },
);
