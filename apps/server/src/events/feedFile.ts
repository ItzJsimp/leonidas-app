// @effect-diagnostics nodeBuiltinImport:off - the feed is plain JSONL files that scripts write too.
// @effect-diagnostics globalDate:off - month files are named from the caller's wall-clock time.
import {
  decodeFeedEventLine,
  type FeedBadLine,
  type FeedEvent,
  type FoldedFeedEvent,
} from "@t3tools/contracts";
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

export const FEED_DIR = "events";
const DEDUPE_WINDOW_MS = 3_600_000;

export interface FeedCursor {
  /** Bytes already read. */
  readonly offset: number;
  /** Lines already read, for line numbers in bad-line reports. */
  readonly line: number;
}

export interface FeedRead {
  readonly events: ReadonlyArray<FeedEvent>;
  readonly bad: ReadonlyArray<FeedBadLine>;
  readonly cursor: FeedCursor;
}

const month = (at: number) => {
  const date = new Date(at);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
};

export function feedFilePath(root: string, at: number): string {
  return NodePath.join(root, FEED_DIR, `${month(at)}.jsonl`);
}

/** Appends one line. The month comes from the event's own local time. */
export function appendFeedEvent(root: string, event: FeedEvent): string {
  const file = NodePath.join(root, FEED_DIR, `${event.ts.slice(0, 7)}.jsonl`);
  NodeFS.mkdirSync(NodePath.dirname(file), { recursive: true });
  NodeFS.appendFileSync(file, `${JSON.stringify(event)}\n`);
  return file;
}

/**
 * Reads the complete lines after `cursor`, so a watch event costs only the new bytes. A partial
 * last line waits for the next read unless it already decodes. A file that shrank starts over.
 */
export function readFeedFrom(file: string, cursor: FeedCursor): FeedRead {
  let size: number;
  try {
    size = NodeFS.statSync(file).size;
  } catch {
    return { events: [], bad: [], cursor };
  }
  const start = size < cursor.offset ? { offset: 0, line: 0 } : cursor;
  if (size === start.offset) return { events: [], bad: [], cursor: start };

  const buffer = Buffer.alloc(size - start.offset);
  const fd = NodeFS.openSync(file, "r");
  try {
    NodeFS.readSync(fd, buffer, 0, buffer.length, start.offset);
  } finally {
    NodeFS.closeSync(fd);
  }

  const lines = buffer.toString("utf8").split("\n");
  const tail = lines.pop() ?? "";
  const tailDecode = tail.trim() === "" ? null : decodeFeedEventLine(tail);
  let consumed = buffer.length - Buffer.byteLength(tail);
  if (tailDecode?.ok) {
    lines.push(tail);
    consumed = buffer.length;
  }

  const events: FeedEvent[] = [];
  const bad: FeedBadLine[] = [];
  let line = start.line;
  for (const text of lines) {
    line += 1;
    if (text.trim() === "") continue;
    const decoded = decodeFeedEventLine(text);
    if (decoded.ok) events.push(decoded.event);
    else bad.push({ file, line, reason: decoded.reason });
  }
  return { events, bad, cursor: { offset: start.offset + consumed, line } };
}

/** An event with no `dedupe` key folds by what it says: same source, type, title and target. */
const foldKey = (event: FeedEvent): string =>
  event.dedupe ??
  `${event.actor.name}|${event.type}|${event.title}|${JSON.stringify(event.target ?? null)}`;

/**
 * Folds events with the same key within 1 hour of the group's first event. The key is `dedupe`, or
 * the source, type, title and target when a script sent none. The fold keeps the first id, so read
 * state stays attached and a repeat never raises a new toast. It shows the latest time, title and body.
 */
export function foldDedupe(events: ReadonlyArray<FeedEvent>): Array<FoldedFeedEvent> {
  const out: Array<FoldedFeedEvent> = [];
  const open = new Map<string, { index: number; startedAt: number }>();
  for (const event of events) {
    const at = Date.parse(event.ts);
    const key = foldKey(event);
    const group = open.get(key);
    if (group && at - group.startedAt < DEDUPE_WINDOW_MS) {
      const first = out[group.index]!;
      out[group.index] = { ...event, id: first.id, count: first.count + 1 };
      continue;
    }
    open.set(key, { index: out.length, startedAt: at });
    out.push({ ...event, count: 1 });
  }
  return out;
}
