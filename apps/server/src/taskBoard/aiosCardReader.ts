// @effect-diagnostics nodeBuiltinImport:off - file watching and workers are Node APIs.
import type { TaskBoardTask } from "@t3tools/contracts";
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as NodeWorkerThreads from "node:worker_threads";

import {
  type AiosCardCache,
  aiosTaskFolders,
  cardToTask,
  loadAiosCardCache,
  readAiosTasks,
  saveAiosCardCache,
  tasksFromCache,
} from "./aiosCards.ts";

/** A full rescan still runs this often, in case the system drops a watch event. */
const AIOS_RESCAN_MS = 30_000;

export interface AiosCardReaderOptions {
  readonly watch?: Watch;
  readonly rescanMs?: number;
  readonly cachePath?: string;
}

export interface AiosCardReader {
  /** Returns the last scan while no watched folder changed; otherwise rescans. */
  readonly read: (root: string, now: number) => ReadonlyArray<TaskBoardTask>;
  /** Forces the next read of `root` (or of every root) to rescan. Call after each card write. */
  readonly invalidate: (root?: string) => void;
  readonly close: () => void;
  /** Scans `root` in a background worker thread, updating the cache without blocking the event loop. */
  readonly scanInWorker: (root: string, now: number) => Promise<ReadonlyArray<TaskBoardTask>>;
}

interface RootState {
  tasks: ReadonlyArray<TaskBoardTask>;
  readAt: number;
  dirty: boolean;
  /** True after a watcher failed: every read rescans, as before the watcher existed. */
  unwatched: boolean;
  readonly watchers: Map<string, NodeFS.FSWatcher>;
}

type Watch = (dir: string, onChange: () => void) => NodeFS.FSWatcher;

const defaultWatch: Watch = (dir, onChange) => NodeFS.watch(dir, { persistent: false }, onChange);

interface ScannedWorkerFile {
  readonly file: string;
  readonly mtimeMs: number;
  readonly size: number;
  readonly raw?: string;
  readonly unchanged: boolean;
  readonly projectHint?: string;
  readonly global: boolean;
}

const workerScanScript = `
const { parentPort, workerData } = require("node:worker_threads");
const fs = require("node:fs");
const path = require("node:path");

const { root, knownFiles } = workerData;

function keyFor(p) {
  return process.platform === "win32" ? p.toLowerCase() : p;
}

function realRootOf(r) {
  try {
    return keyFor(fs.realpathSync.native(r));
  } catch {
    return null;
  }
}

function isInsideRoot(realRoot, file) {
  const norm = keyFor(file);
  return norm === realRoot || norm.startsWith(realRoot + path.sep);
}

function nestedRepoDirs(projectDir) {
  const dirs = [];
  try {
    for (const entry of fs.readdirSync(projectDir, { withFileTypes: true })) {
      if (entry.name.startsWith("_") || entry.name.startsWith(".")) continue;
      if (!entry.isDirectory()) continue;
      const child = path.join(projectDir, entry.name);
      if (fs.existsSync(path.join(child, ".git"))) {
        dirs.push(child);
      }
    }
  } catch {}
  return dirs;
}

function aiosTaskFolders(r) {
  const folders = [
    { dir: path.join(r, "tasks"), projectHint: undefined, global: true },
  ];
  try {
    for (const entry of fs.readdirSync(path.join(r, "projects"), { withFileTypes: true })) {
      if (entry.name.startsWith("_") || entry.name.startsWith(".")) continue;
      const projectDir = path.join(r, "projects", entry.name);
      folders.push({
        dir: path.join(projectDir, "tasks"),
        projectHint: entry.name,
        global: false,
      });
      for (const child of nestedRepoDirs(projectDir)) {
        folders.push({
          dir: path.join(child, "tasks"),
          projectHint: entry.name,
          global: false,
        });
      }
    }
  } catch {}
  return folders;
}

try {
  const realRoot = realRootOf(root);
  if (realRoot === null) {
    parentPort.postMessage({ type: "success", files: [] });
    process.exit(0);
  }

  const seenFiles = new Set();
  const globalNames = new Set();
  const collected = [];

  const visit = (tasksDir, projectHint, isGlobal) => {
    let baseDir;
    let entries;
    try {
      baseDir = fs.realpathSync.native(tasksDir);
      if (!isInsideRoot(realRoot, baseDir)) return;
      entries = fs.readdirSync(baseDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const name = entry.name;
      if (!name.endsWith(".md") || name.startsWith(".") || name.toLowerCase() === "readme.md") {
        continue;
      }
      try {
        const symlink = entry.isSymbolicLink();
        if (!symlink && !entry.isFile()) continue;
        if (symlink) {
          if (globalNames.has(keyFor(name))) continue;
          const target = keyFor(
            path.resolve(baseDir, fs.readlinkSync(path.join(baseDir, name)))
          );
          if (seenFiles.has(target)) continue;
        }
        const file = symlink
          ? fs.realpathSync.native(path.join(baseDir, name))
          : path.join(baseDir, name);
        if (symlink && !isInsideRoot(realRoot, file)) continue;
        const seenKey = keyFor(file);
        if (seenFiles.has(seenKey)) continue;
        seenFiles.add(seenKey);
        if (isGlobal) globalNames.add(keyFor(name));

        const stat = fs.statSync(file);
        if (!stat.isFile()) continue;

        const known = knownFiles[file];
        if (known && known.mtimeMs === stat.mtimeMs && known.size === stat.size) {
          collected.push({
            file,
            mtimeMs: stat.mtimeMs,
            size: stat.size,
            unchanged: true,
            projectHint,
            global: isGlobal,
          });
        } else {
          const raw = fs.readFileSync(file, "utf8");
          collected.push({
            file,
            mtimeMs: stat.mtimeMs,
            size: stat.size,
            raw,
            unchanged: false,
            projectHint,
            global: isGlobal,
          });
        }
      } catch {}
    }
  };

  for (const folder of aiosTaskFolders(root)) {
    visit(folder.dir, folder.projectHint, folder.global);
  }

  parentPort.postMessage({ type: "success", files: collected });
} catch (error) {
  parentPort.postMessage({ type: "error", message: String(error && error.message ? error.message : error) });
}
`;

function runWorkerScan(
  root: string,
  knownFiles: Record<string, { mtimeMs: number; size: number }>,
): Promise<ReadonlyArray<ScannedWorkerFile>> {
  return new Promise((resolve, reject) => {
    let worker: NodeWorkerThreads.Worker;
    try {
      worker = new NodeWorkerThreads.Worker(workerScanScript, {
        eval: true,
        workerData: { root, knownFiles },
      });
      worker.unref();
    } catch (err) {
      return reject(err);
    }

    worker.on("message", (msg) => {
      if (msg && msg.type === "success") {
        resolve(msg.files);
      } else {
        reject(new Error(msg?.message || "Worker card scan failed"));
      }
      worker.terminate().catch(() => {});
    });

    worker.on("error", (err) => {
      reject(err);
      worker.terminate().catch(() => {});
    });

    worker.on("exit", (code) => {
      if (code !== 0) {
        reject(new Error(`Worker card scan exited with code ${code}`));
      }
    });
  });
}

/**
 * Keeps the parsed board per AIOS root and watches each card folder (not recursive), so a read with
 * no change on disk costs no file system call.
 */
export function makeAiosCardReader(
  cache: AiosCardCache,
  options: AiosCardReaderOptions = {},
): AiosCardReader {
  const watch = options.watch ?? defaultWatch;
  const rescanMs = options.rescanMs ?? AIOS_RESCAN_MS;
  const roots = new Map<string, RootState>();

  if (options.cachePath && cache.size === 0) {
    loadAiosCardCache(options.cachePath, cache);
  }

  const closeWatchers = (state: RootState) => {
    for (const watcher of state.watchers.values()) watcher.close();
    state.watchers.clear();
  };

  // The projects folder is watched too, so a new project's task folder triggers a rescan.
  const syncWatchers = (root: string, state: RootState) => {
    if (state.unwatched) return;
    const wanted = new Set([
      NodePath.join(root, "projects"),
      ...aiosTaskFolders(root).map((folder) => folder.dir),
    ]);
    for (const [dir, watcher] of state.watchers) {
      if (!wanted.has(dir)) {
        watcher.close();
        state.watchers.delete(dir);
      }
    }
    const markDirty = () => {
      state.dirty = true;
    };
    for (const dir of wanted) {
      if (state.watchers.has(dir) || !NodeFS.existsSync(dir)) continue;
      try {
        const watcher = watch(dir, markDirty);
        watcher.on("error", () => {
          state.unwatched = true;
          closeWatchers(state);
        });
        state.watchers.set(dir, watcher);
      } catch {
        state.unwatched = true;
        closeWatchers(state);
        return;
      }
    }
  };

  const scanInWorker = async (root: string, now: number): Promise<ReadonlyArray<TaskBoardTask>> => {
    let state = roots.get(root);
    if (!state) {
      state = {
        tasks: cache.size > 0 ? tasksFromCache(root, cache) : [],
        readAt: now,
        dirty: false,
        unwatched: false,
        watchers: new Map(),
      };
      roots.set(root, state);
    }
    syncWatchers(root, state);

    const knownFiles: Record<string, { mtimeMs: number; size: number }> = {};
    for (const [file, entry] of cache.entries()) {
      knownFiles[file] = { mtimeMs: entry.mtimeMs, size: entry.size };
    }

    try {
      const files = await runWorkerScan(root, knownFiles);
      const byId = new Map<string, { task: TaskBoardTask; mtimeMs: number; global: boolean }>();

      for (const item of files) {
        let task: TaskBoardTask | null = null;
        if (item.unchanged) {
          task = cache.get(item.file)?.task ?? null;
        } else if (item.raw) {
          task = cardToTask({
            fileName: NodePath.basename(item.file),
            raw: item.raw,
            mtimeMs: item.mtimeMs,
            now,
            ...(item.projectHint ? { projectHint: item.projectHint } : {}),
          });
          cache.set(item.file, { mtimeMs: item.mtimeMs, size: item.size, task });
        }
        if (!task) continue;
        const existing = byId.get(task.id);
        if (
          existing &&
          (existing.global !== item.global ? existing.global : existing.mtimeMs >= item.mtimeMs)
        ) {
          continue;
        }
        byId.set(task.id, { task, mtimeMs: item.mtimeMs, global: item.global });
      }

      const tasks = [...byId.values()].map((found) => found.task);
      state.tasks = tasks;
      state.readAt = now;
      state.dirty = false;
      if (options.cachePath) {
        saveAiosCardCache(options.cachePath, cache);
      }
      return tasks;
    } catch {
      // Fallback to synchronous scan if worker fails
      state.dirty = false;
      state.tasks = readAiosTasks(root, { now, cache });
      state.readAt = now;
      if (options.cachePath) {
        saveAiosCardCache(options.cachePath, cache);
      }
      return state.tasks;
    }
  };

  return {
    read: (root, now) => {
      let state = roots.get(root);
      if (
        state &&
        !state.dirty &&
        !state.unwatched &&
        now >= state.readAt &&
        now - state.readAt < rescanMs
      ) {
        return state.tasks;
      }
      if (!state) {
        state = {
          tasks: [],
          readAt: now,
          dirty: false,
          unwatched: false,
          watchers: new Map(),
        };
        roots.set(root, state);
      }
      // Watch before the scan and clear the flag first, so a change during the scan is not lost.
      state.dirty = false;
      syncWatchers(root, state);
      state.tasks = readAiosTasks(root, { now, cache });
      state.readAt = now;
      if (options.cachePath) {
        saveAiosCardCache(options.cachePath, cache);
      }
      return state.tasks;
    },
    scanInWorker,
    invalidate: (root) => {
      for (const [key, state] of roots) if (root === undefined || key === root) state.dirty = true;
    },
    close: () => {
      for (const state of roots.values()) closeWatchers(state);
      roots.clear();
    },
  };
}
