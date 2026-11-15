// @effect-diagnostics nodeBuiltinImport:off - plain Node file reads and fake watchers, no Effect runtime.
import * as NodeEvents from "node:events";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest";

import type { AiosCardCache } from "./aiosCards.ts";
import { makeAiosCardReader } from "./aiosCardReader.ts";

const card = (id: string, name: string) => `---\nid: ${id}\nname: "${name}"\n---\n# ${name}\n`;

describe("makeAiosCardReader", () => {
  let root = "";
  let watched: Map<
    string,
    { fire: () => void; watcher: NodeEvents.EventEmitter & { closed: boolean } }
  >;
  const watch = (dir: string, onChange: () => void) => {
    const watcher = Object.assign(new NodeEvents.EventEmitter(), {
      closed: false,
      close() {
        watcher.closed = true;
      },
    });
    watched.set(dir, { fire: onChange, watcher });
    return watcher as unknown as NodeFS.FSWatcher;
  };

  beforeEach(() => {
    root = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "aios-reader-"));
    NodeFS.mkdirSync(NodePath.join(root, "tasks"));
    NodeFS.mkdirSync(NodePath.join(root, "projects", "beta", "tasks"), { recursive: true });
    NodeFS.writeFileSync(NodePath.join(root, "tasks", "a.md"), card("task-a", "A"));
    watched = new Map();
  });
  afterEach(() => NodeFS.rmSync(root, { recursive: true, force: true }));

  it("serves the last scan until a watched folder changes", () => {
    const reader = makeAiosCardReader(new Map() as AiosCardCache, { watch });
    const first = reader.read(root, 1_000);
    expect(first.map((task) => task.id)).toEqual(["task-a"]);
    expect([...watched.keys()].sort()).toEqual(
      [
        NodePath.join(root, "projects"),
        NodePath.join(root, "projects", "beta", "tasks"),
        NodePath.join(root, "tasks"),
      ].sort(),
    );

    NodeFS.writeFileSync(NodePath.join(root, "tasks", "b.md"), card("task-b", "B"));
    expect(reader.read(root, 1_100)).toBe(first);

    watched.get(NodePath.join(root, "tasks"))!.fire();
    expect(
      reader
        .read(root, 1_200)
        .map((task) => task.id)
        .sort(),
    ).toEqual(["task-a", "task-b"]);
    reader.close();
    expect([...watched.values()].every((entry) => entry.watcher.closed)).toBe(true);
  });

  it("rescans after invalidate, after the rescan interval, and always after a watcher error", () => {
    const reader = makeAiosCardReader(new Map() as AiosCardCache, { watch, rescanMs: 500 });
    const first = reader.read(root, 1_000);
    reader.invalidate(root);
    const second = reader.read(root, 1_001);
    expect(second).not.toBe(first);
    expect(reader.read(root, 1_100)).toBe(second);
    expect(reader.read(root, 1_600)).not.toBe(second);

    watched.get(NodePath.join(root, "tasks"))!.watcher.emit("error", new Error("gone"));
    const afterError = reader.read(root, 1_700);
    expect(reader.read(root, 1_701)).not.toBe(afterError);
    reader.close();
  });

  it("watches a new project task folder after the projects folder changes", () => {
    const reader = makeAiosCardReader(new Map() as AiosCardCache, { watch });
    reader.read(root, 1_000);
    NodeFS.mkdirSync(NodePath.join(root, "projects", "gamma", "tasks"), { recursive: true });
    NodeFS.writeFileSync(
      NodePath.join(root, "projects", "gamma", "tasks", "g.md"),
      card("task-g", "G"),
    );
    watched.get(NodePath.join(root, "projects"))!.fire();
    expect(
      reader
        .read(root, 1_100)
        .map((task) => task.id)
        .sort(),
    ).toEqual(["task-a", "task-g"]);
    expect(watched.has(NodePath.join(root, "projects", "gamma", "tasks"))).toBe(true);
    reader.close();
  });

  it("persists card cache to disk and loads it on a new reader", () => {
    const cacheFile = NodePath.join(root, "card-cache.json");
    const firstReader = makeAiosCardReader(new Map() as AiosCardCache, {
      watch,
      cachePath: cacheFile,
    });
    const firstTasks = firstReader.read(root, 1_000);
    expect(firstTasks.map((t) => t.id)).toEqual(["task-a"]);
    expect(NodeFS.existsSync(cacheFile)).toBe(true);
    firstReader.close();

    const secondReader = makeAiosCardReader(new Map() as AiosCardCache, {
      watch,
      cachePath: cacheFile,
    });
    const secondTasks = secondReader.read(root, 1_000);
    expect(secondTasks.map((t) => t.id)).toEqual(["task-a"]);
    secondReader.close();
  });

  it("scans task cards in a worker thread and updates the board", async () => {
    const cacheFile = NodePath.join(root, "worker-cache.json");
    const reader = makeAiosCardReader(new Map() as AiosCardCache, { watch, cachePath: cacheFile });
    const tasks = await reader.scanInWorker(root, 1_000);
    expect(tasks.map((t) => t.id)).toEqual(["task-a"]);
    expect(reader.read(root, 1_000)).toBe(tasks);
    reader.close();
  });
});
