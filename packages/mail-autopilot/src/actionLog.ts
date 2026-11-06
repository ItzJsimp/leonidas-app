/** What the autopilot did to one message. Ids and label names only: never a subject, sender or body. */
export type LoggedAction =
  | { readonly type: "label"; readonly labels: readonly string[] }
  | { readonly type: "archive" }
  | { readonly type: "draft" };

/** The exact call that puts the mailbox back. */
export type Inverse =
  | { readonly type: "labels"; readonly add: readonly string[]; readonly remove: readonly string[] }
  | { readonly type: "deleteDraft"; readonly draftId: string; readonly draftMessageId: string };

/**
 * `intent` is written before a mailbox call. `applied`, `failed` or `skipped` follows it (`ref` is the intent id).
 * `undone` follows an `applied` entry (`ref` is that entry's id).
 */
const LOG_STATUSES = ["intent", "applied", "failed", "skipped", "undone"] as const;
export type LogStatus = (typeof LOG_STATUSES)[number];

export interface ActionLogEntry {
  readonly v: 1;
  readonly id: string;
  readonly ts: string;
  readonly inbox: string;
  readonly messageId: string;
  readonly threadId: string;
  readonly action: LoggedAction;
  readonly status: LogStatus;
  readonly ref?: string;
  readonly inverse?: Inverse;
  /** A short code such as `rate_limited` or `edited`. Never mail text. */
  readonly note?: string;
}

export interface ActionLogStore {
  append(entry: ActionLogEntry): Promise<void>;
  readAll(): Promise<readonly ActionLogEntry[]>;
}

export class MemoryActionLog implements ActionLogStore {
  private lines: string[] = [];
  async append(entry: ActionLogEntry) {
    this.lines.push(serializeEntry(entry));
  }
  async readAll() {
    return parseLog(this.lines.join(""));
  }
}

/** One JSON object and a newline. */
export const serializeEntry = (entry: ActionLogEntry): string => `${JSON.stringify(entry)}\n`;

const ACTION_TYPES_LOGGED = new Set(["label", "archive", "draft"]);

const isStr = (x: unknown): x is string => typeof x === "string";

const isEntry = (x: unknown): x is ActionLogEntry => {
  if (typeof x !== "object" || x === null) return false;
  const e = x as Record<string, unknown>;
  const action = e.action as { type?: unknown } | null;
  return (
    e.v === 1 &&
    isStr(e.id) &&
    isStr(e.ts) &&
    isStr(e.inbox) &&
    isStr(e.messageId) &&
    isStr(e.threadId) &&
    typeof action === "object" &&
    action !== null &&
    ACTION_TYPES_LOGGED.has(action.type as string) &&
    LOG_STATUSES.includes(e.status as LogStatus)
  );
};

/** Reads JSONL. A torn last line (crash), garbage, another version or a wrong shape is skipped, not fatal. */
export const parseLog = (text: string): ActionLogEntry[] => {
  const out: ActionLogEntry[] = [];
  for (const line of text.split("\n")) {
    if (!line) continue;
    try {
      const parsed: unknown = JSON.parse(line);
      if (isEntry(parsed)) out.push(parsed);
    } catch {
      // torn or corrupt line
    }
  }
  return out;
};
