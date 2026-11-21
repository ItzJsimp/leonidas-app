// @effect-diagnostics nodeBuiltinImport:off - tests write real feed files in a temp folder.
import { completeFeedEvent, type FeedEvent } from "@t3tools/contracts";
import { afterEach, describe, expect, it } from "@effect/vitest";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { appendFeedEvent, feedFilePath, foldDedupe, readFeedFrom } from "./feedFile.ts";

const roots: string[] = [];
const tempRoot = () => {
  const root = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "feed-"));
  roots.push(root);
  return root;
};
afterEach(() => {
  for (const root of roots.splice(0)) NodeFS.rmSync(root, { recursive: true, force: true });
});

const event = (title: string, at: number, dedupe?: string): FeedEvent =>
  completeFeedEvent(
    {
      level: "failed",
      type: "script.failed",
      title,
      actor: { kind: "script", name: "test.ps1" },
      ...(dedupe === undefined ? {} : { dedupe }),
    },
    at,
  );

const AT = Date.UTC(2026, 9, 20, 12);

describe("feed file", () => {
  it("appends one line per event to the month file", () => {
    const root = tempRoot();
    const file = appendFeedEvent(root, event("one", AT));
    appendFeedEvent(root, event("two", AT + 1));
    expect(file).toBe(feedFilePath(root, AT));
    expect(NodePath.basename(file)).toMatch(/^2026-10\.jsonl$/);
    expect(NodeFS.readFileSync(file, "utf8").split("\n")).toHaveLength(3);
  });

  it("reads only the bytes after the offset", () => {
    const root = tempRoot();
    const file = appendFeedEvent(root, event("one", AT));
    const first = readFeedFrom(file, { offset: 0, line: 0 });
    appendFeedEvent(root, event("two", AT + 1));
    const second = readFeedFrom(file, first.cursor);
    expect(first.events.map((e) => e.title)).toEqual(["one"]);
    expect(second.events.map((e) => e.title)).toEqual(["two"]);
    expect(readFeedFrom(file, second.cursor).events).toEqual([]);
  });

  it("skips and reports unreadable lines, then keeps reading", () => {
    const root = tempRoot();
    const file = appendFeedEvent(root, event("one", AT));
    NodeFS.appendFileSync(file, '{"broken"\n{"v":1,"title":"no id"}\n\n');
    appendFeedEvent(root, event("two", AT + 1));
    const read = readFeedFrom(file, { offset: 0, line: 0 });
    expect(read.events.map((e) => e.title)).toEqual(["one", "two"]);
    expect(read.bad.map((bad) => bad.line)).toEqual([2, 3]);
    expect(read.bad[0]!.file).toBe(file);
  });

  it("waits for a partial last line until it is complete", () => {
    const root = tempRoot();
    const file = feedFilePath(root, AT);
    NodeFS.mkdirSync(NodePath.dirname(file), { recursive: true });
    const line = JSON.stringify(event("late", AT));
    NodeFS.writeFileSync(file, line.slice(0, 20));
    const partial = readFeedFrom(file, { offset: 0, line: 0 });
    expect(partial.events).toEqual([]);
    expect(partial.bad).toEqual([]);
    NodeFS.appendFileSync(file, `${line.slice(20)}\n`);
    expect(readFeedFrom(file, partial.cursor).events.map((e) => e.title)).toEqual(["late"]);
  });

  it("reads a valid last line that has no newline", () => {
    const root = tempRoot();
    const file = feedFilePath(root, AT);
    NodeFS.mkdirSync(NodePath.dirname(file), { recursive: true });
    NodeFS.writeFileSync(file, JSON.stringify(event("hand", AT)));
    expect(readFeedFrom(file, { offset: 0, line: 0 }).events).toHaveLength(1);
  });

  it("starts over when the file shrinks", () => {
    const root = tempRoot();
    const file = appendFeedEvent(root, event("one", AT));
    appendFeedEvent(root, event("two", AT + 1));
    const read = readFeedFrom(file, { offset: 0, line: 0 });
    NodeFS.writeFileSync(file, `${JSON.stringify(event("new", AT + 2))}\n`);
    expect(readFeedFrom(file, read.cursor).events.map((e) => e.title)).toEqual(["new"]);
  });

  it("returns nothing for a missing file", () => {
    const read = readFeedFrom(NodePath.join(tempRoot(), "none.jsonl"), { offset: 0, line: 0 });
    expect(read.events).toEqual([]);
  });
});

describe("foldDedupe", () => {
  const HOUR = 3_600_000;

  it("folds the same key within 1 hour into the first event with a count", () => {
    const first = event("backup failed", AT, "backup");
    const folded = foldDedupe([
      first,
      event("other", AT + 1),
      event("backup failed again", AT + HOUR - 1, "backup"),
    ]);
    expect(folded).toHaveLength(2);
    expect(folded[0]!.id).toBe(first.id);
    expect(folded[0]!.count).toBe(2);
    expect(folded[0]!.title).toBe("backup failed again");
    expect(folded[1]!.count).toBe(1);
  });

  it("starts a new group after 1 hour", () => {
    const folded = foldDedupe([
      event("a", AT, "backup"),
      event("b", AT + 30 * 60_000, "backup"),
      event("c", AT + HOUR, "backup"),
    ]);
    expect(folded.map((e) => e.count)).toEqual([2, 1]);
  });

  it("folds events without a key when source, type and title match", () => {
    const folded = foldDedupe([event("a", AT), event("a", AT + 1), event("b", AT + 2)]);
    expect(folded.map((e) => [e.title, e.count])).toEqual([
      ["a", 2],
      ["b", 1],
    ]);
  });

  it("keeps events without a key apart when the target differs", () => {
    const at = (thread: string) =>
      completeFeedEvent(
        {
          level: "failed",
          type: "script.failed",
          title: "same",
          actor: { kind: "script", name: "test.ps1" },
          target: { thread },
        },
        AT,
      );
    expect(foldDedupe([at("one"), at("two")])).toHaveLength(2);
  });
});
