// @effect-diagnostics nodeBuiltinImport:off - file watching is a Node API.
import {
  TradingStateError,
  type TradingImportResult,
  type TradingImportsResult,
} from "@t3tools/contracts";
import {
  isTopstepxExport,
  parseTopstepxExport,
  parseTrades,
  unseenTrades,
  type Trade,
} from "@t3tools/trading";
import { appendTrades } from "@t3tools/trading/ledgerFile";
import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { readTradingState, requireTradingRoot } from "./readTradingState.ts";
import { runRuleCheck } from "./runRuleCheck.ts";
import { readLinkedPack } from "./tradingPack.ts";

/** A full rescan still runs this often, in case the system drops a watch event. */
const RESCAN_MS = 30_000;
/** A month of TopstepX trades is far below this. A larger CSV file is never read in full. */
const MAX_EXPORT_BYTES = 5 * 1024 * 1024;
/** Trade ids are the platform plus the export's own Id. */
const TOPSTEPX_PREFIX = "topstepx:";
/** Enough bytes for a byte order mark and the header line. */
const HEAD_BYTES = 512;

export interface ExportFile {
  readonly name: string;
  /** Name, size and change time: a new key means the file changed. */
  readonly key: string;
  readonly ids: readonly string[];
  readonly firstDay: string | null;
  readonly lastDay: string | null;
}

export interface TradingImportWatch {
  readonly folder: string;
  /** TopstepX Trades exports in the folder. A file is read again only after it changes. */
  readonly exports: (now: number) => ReadonlyArray<ExportFile>;
  /** Keys of exports whose trades are all in a workspace's trades file, per workspace root. */
  readonly imported: (root: string) => Set<string>;
  readonly close: () => void;
}

type Watch = (dir: string, onChange: () => void) => NodeFS.FSWatcher;
const defaultWatch: Watch = (dir, onChange) => NodeFS.watch(dir, { persistent: false }, onChange);

function readHead(file: string): string {
  const handle = NodeFS.openSync(file, "r");
  try {
    const buffer = Buffer.alloc(HEAD_BYTES);
    return buffer.toString("utf8", 0, NodeFS.readSync(handle, buffer, 0, HEAD_BYTES, 0));
  } finally {
    NodeFS.closeSync(handle);
  }
}

/** Reads an export once. Other CSV files cost one 512-byte read and are never copied. */
function readExport(folder: string, name: string, key: string, size: number): ExportFile | null {
  const file = NodePath.join(folder, name);
  if (size > MAX_EXPORT_BYTES || !isTopstepxExport(readHead(file))) return null;
  const { trades } = parseTopstepxExport(NodeFS.readFileSync(file, "utf8"), "unassigned");
  const days = trades.map((trade) => trade.day).toSorted();
  return {
    name,
    key,
    ids: [...new Set(trades.map((trade) => trade.id))],
    firstDay: days[0] ?? null,
    lastDay: days.at(-1) ?? null,
  };
}

/**
 * Watches one folder (not recursive) for TopstepX Trades exports, on the AIOS card watch pattern:
 * a read with no change on disk costs one cheap check, a watch event or the rescan time reads again.
 */
export function makeTradingImportWatch(
  options: { readonly folder?: string; readonly watch?: Watch; readonly rescanMs?: number } = {},
): TradingImportWatch {
  // shortcut: always the user's Downloads folder, read trading/settings.json importFolder when setup writes it
  const folder = options.folder ?? NodePath.join(NodeOS.homedir(), "Downloads");
  const watch = options.watch ?? defaultWatch;
  const rescanMs = options.rescanMs ?? RESCAN_MS;
  let watcher: NodeFS.FSWatcher | null = null;
  let unwatched = false;
  let dirty = true;
  let readAt = 0;
  let files: ExportFile[] = [];
  let seen = new Map<string, ExportFile | null>();
  const importedByRoot = new Map<string, Set<string>>();

  const startWatch = () => {
    if (watcher || unwatched) return;
    try {
      watcher = watch(folder, () => {
        dirty = true;
      });
      watcher.on("error", () => {
        unwatched = true;
        watcher?.close();
        watcher = null;
      });
    } catch {
      unwatched = true;
    }
  };

  const scan = (): ExportFile[] => {
    let names: string[];
    try {
      names = NodeFS.readdirSync(folder).filter((name) => name.toLowerCase().endsWith(".csv"));
    } catch {
      return [];
    }
    const next = new Map<string, ExportFile | null>();
    const found: ExportFile[] = [];
    for (const name of names) {
      try {
        const stat = NodeFS.statSync(NodePath.join(folder, name));
        if (!stat.isFile()) continue;
        const key = `${name}|${stat.size}|${stat.mtimeMs}`;
        const file = seen.has(key)
          ? (seen.get(key) ?? null)
          : readExport(folder, name, key, stat.size);
        next.set(key, file);
        if (file) found.push(file);
      } catch {
        // A file that is removed or locked during the scan is read on the next scan.
      }
    }
    seen = next;
    return found;
  };

  return {
    folder,
    exports: (now) => {
      if (!dirty && !unwatched && now >= readAt && now - readAt < rescanMs) return files;
      // Watch before the scan and clear the flag first, so a change during the scan is not lost.
      dirty = false;
      startWatch();
      files = scan();
      readAt = now;
      return files;
    },
    imported: (root) => {
      let keys = importedByRoot.get(root);
      if (!keys) {
        keys = new Set();
        importedByRoot.set(root, keys);
      }
      return keys;
    },
    close: () => {
      watcher?.close();
      watcher = null;
    },
  };
}

const readFailed = () => new TradingStateError({ reason: "read_failed" });

const readTradeIds = Effect.fn("trading.readTradeIds")(function* (root: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const file = path.join(root, "trading", "trades.jsonl");
  const text = yield* fs.exists(file).pipe(
    Effect.flatMap((found) => (found ? fs.readFileString(file) : Effect.succeed(""))),
    Effect.mapError(readFailed),
  );
  return new Set(parseTrades(text).trades.map((trade) => trade.id));
});

/** Exports in the import folder that hold at least one trade this workspace does not have yet. */
export const listTradingImports = Effect.fn("trading.listImports")(function* (
  aiosRoot: string | null,
  watch: TradingImportWatch,
) {
  const root = yield* requireTradingRoot(aiosRoot);
  const files = watch.exports(yield* Clock.currentTimeMillis);
  const done = watch.imported(root);
  const keys = new Set(files.map((file) => file.key));
  for (const key of done) if (!keys.has(key)) done.delete(key);
  const open = files.filter((file) => !done.has(file.key));
  if (open.length === 0) return { files: [] } satisfies TradingImportsResult;
  const ids = yield* readTradeIds(root);
  const pending: TradingImportsResult["files"][number][] = [];
  for (const file of open) {
    const trades = file.ids.filter((id) => !ids.has(id)).length;
    if (trades === 0) done.add(file.key);
    else pending.push({ name: file.name, trades, firstDay: file.firstDay, lastDay: file.lastDay });
  }
  return { files: pending } satisfies TradingImportsResult;
});

/** Copies the raw bytes to `trading/imports/<day>/`. A name that is taken gets `-2`, `-3` and on. */
const keepRawCopy = Effect.fn("trading.keepRawCopy")(function* (
  root: string,
  day: string,
  name: string,
  bytes: Uint8Array,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const dir = path.join(root, "trading", "imports", day);
  yield* fs.makeDirectory(dir, { recursive: true });
  const stem = name.replace(/\.csv$/i, "");
  for (let n = 1; n <= 100; n++) {
    const target = path.join(dir, n === 1 ? name : `${stem}-${n}.csv`);
    const written = yield* fs.writeFile(target, bytes, { flag: "wx" }).pipe(
      Effect.as(true),
      Effect.catchIf(
        (error) => error.reason._tag === "AlreadyExists",
        () => Effect.succeed(false),
      ),
    );
    if (written) return target;
  }
  return yield* readFailed();
});

/**
 * Runs the linked pack's rule check on new trades, only when the trader allowed this exact module.
 * The check fails soft: the trades import with no grade.
 */
const gradeTrades = Effect.fn("trading.gradeTrades")(function* (
  root: string,
  account: { readonly stage: string; readonly last4: string },
  text: string,
  trades: readonly Trade[],
) {
  const linked = yield* readLinkedPack(root);
  if (linked.status !== "ready" || trades.length === 0) return { check: "off" as const, trades };
  const { check } = linked;
  if (check.status === "none" || check.status === "missing") {
    return { check: "off" as const, trades };
  }
  if (check.status !== "allowed") return { check: check.status, trades };
  const outcome = yield* Effect.promise(() =>
    runRuleCheck({
      source: check.source,
      // The check module reads "funded" in the file name as a Funded account.
      files: [{ name: `${account.stage}-${account.last4}`, text }],
      // shortcut: no market bar source yet, so every day waits; pass bars when a bar feed card lands
      bars: [],
    }),
  );
  if (outcome.status === "failed") {
    yield* Effect.logWarning("trading rule check failed", { reason: outcome.reason });
    return { check: "failed" as const, trades };
  }
  const marked = trades.map((trade): Trade => {
    const id = trade.id.slice(TOPSTEPX_PREFIX.length);
    const grade = outcome.grades.get(id);
    if (grade) {
      return { ...trade, setup: grade.setup, ruleBreaks: grade.ruleBreaks, check: "graded" };
    }
    return outcome.waiting.has(id) ? { ...trade, check: "waiting" } : trade;
  });
  return {
    check: outcome.grades.size > 0 ? ("graded" as const) : ("waiting" as const),
    trades: marked,
  };
});

/**
 * Imports one export from the import folder into an open account: copies the raw file (never
 * moves it), then appends only the trades this workspace does not have yet.
 */
export const importTradingExport = Effect.fn("trading.importExport")(function* (
  aiosRoot: string | null,
  input: { readonly file: string; readonly accountId: string },
  watch: TradingImportWatch,
) {
  const root = yield* requireTradingRoot(aiosRoot);
  const { state } = yield* readTradingState(root);
  const account = state.accounts.find(
    (item) => item.id === input.accountId && item.closedReason === null,
  );
  if (!account) return yield* new TradingStateError({ reason: "unknown_account" });
  // Only a plain file name in the import folder: no folder parts, no other file types.
  if (NodePath.basename(input.file) !== input.file || !/^[^.].*\.csv$/i.test(input.file)) {
    return yield* new TradingStateError({ reason: "file_not_found" });
  }
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const source = path.join(watch.folder, input.file);
  const info = yield* fs
    .stat(source)
    .pipe(Effect.mapError(() => new TradingStateError({ reason: "file_not_found" })));
  if (info.type !== "File" || Number(info.size) > MAX_EXPORT_BYTES) {
    return yield* new TradingStateError({ reason: "not_an_export" });
  }
  const bytes = yield* fs
    .readFile(source)
    .pipe(Effect.mapError(() => new TradingStateError({ reason: "file_not_found" })));
  const text = new TextDecoder().decode(bytes);
  if (!isTopstepxExport(text)) return yield* new TradingStateError({ reason: "not_an_export" });

  const parsed = parseTopstepxExport(text, account.id);
  const added = unseenTrades(parsed.trades, yield* readTradeIds(root));
  const lastDay = parsed.trades
    .map((trade) => trade.day)
    .toSorted()
    .at(-1);
  if (lastDay === undefined) {
    return {
      check: "off",
      added: 0,
      duplicates: 0,
      skippedRows: parsed.issues.length,
    } satisfies TradingImportResult;
  }
  const graded = yield* gradeTrades(root, account, text, added);
  yield* keepRawCopy(root, lastDay, input.file, bytes).pipe(Effect.mapError(readFailed));
  yield* appendTrades(path.join(root, "trading", "trades.jsonl"), graded.trades).pipe(
    Effect.mapError(readFailed),
  );
  return {
    check: graded.check,
    added: added.length,
    duplicates: parsed.trades.length - added.length,
    skippedRows: parsed.issues.length,
  } satisfies TradingImportResult;
});
