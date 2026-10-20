// @effect-diagnostics nodeBuiltinImport:off - the change-set ledger is plain files in the AIOS.
import type { TaskBoardTask } from "@t3tools/contracts";
import * as NodeCrypto from "node:crypto";
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

import {
  capLevel,
  capRefusalMessage,
  isOpenStatus,
  sameBucket,
  swapSuggestions,
  type CapRule,
} from "./capRules.ts";

/** The three fields a bulk change can set on a card. */
export interface ChangeFields {
  readonly status: TaskBoardTask["status"];
  readonly priority: TaskBoardTask["priority"];
  readonly projectSlug: string | null;
}

export interface ChangeRequest {
  readonly taskId: string;
  readonly status?: TaskBoardTask["status"] | undefined;
  readonly priority?: TaskBoardTask["priority"] | undefined;
  readonly projectSlug?: string | null | undefined;
}

export interface ChangeRow {
  readonly taskId: string;
  readonly title: string;
  readonly before: ChangeFields;
  readonly after: ChangeFields;
  readonly outcome: "changed" | "unchanged" | "refused" | "missing";
  readonly reason?: string;
}

const fieldsOf = (card: TaskBoardTask): ChangeFields => ({
  status: card.status,
  priority: card.priority,
  projectSlug: card.projectSlug ?? null,
});

/**
 * The per-card diff for a change set. Cap checks run in order against a working copy, so an
 * earlier move that fills a project (or a close that frees a slot) counts for the later ones.
 */
export function planChangeSet(
  cards: ReadonlyArray<TaskBoardTask>,
  changes: ReadonlyArray<ChangeRequest>,
  ruleOf: (slug: string | null) => CapRule,
): ChangeRow[] {
  const working = new Map(cards.map((card) => [card.id, card]));
  const seen = new Set<string>();
  return changes.map((change): ChangeRow => {
    const card = working.get(change.taskId);
    // A second change to one card would overwrite its undo copy with a half-changed file.
    if (card && seen.has(change.taskId)) {
      const fields = fieldsOf(card);
      return {
        taskId: card.id,
        title: card.title,
        before: fields,
        after: fields,
        outcome: "refused",
        reason: "This card is listed twice in the change set.",
      };
    }
    seen.add(change.taskId);
    if (!card) {
      const none = { status: "todo", priority: "medium", projectSlug: null } as const;
      return {
        taskId: change.taskId,
        title: change.taskId,
        before: none,
        after: none,
        outcome: "missing",
        reason: "Task not found.",
      };
    }
    const before = fieldsOf(card);
    const after: ChangeFields = {
      status: change.status ?? before.status,
      priority: change.priority ?? before.priority,
      projectSlug: change.projectSlug === undefined ? before.projectSlug : change.projectSlug,
    };
    const row = { taskId: card.id, title: card.title, before, after };
    if (
      after.status === before.status &&
      after.priority === before.priority &&
      after.projectSlug === before.projectSlug
    ) {
      return { ...row, outcome: "unchanged" };
    }
    const takesASlot =
      isOpenStatus(after.status) &&
      !(isOpenStatus(before.status) && sameBucket(card, after.projectSlug));
    const next = { ...card, ...after };
    if (takesASlot) {
      const everyone = [...working.values()];
      const level = capLevel(everyone, after.projectSlug, ruleOf(after.projectSlug));
      if (level.level === "full") {
        return {
          ...row,
          outcome: "refused",
          reason: capRefusalMessage(
            after.projectSlug ?? "The Inbox",
            level,
            swapSuggestions(everyone, after.projectSlug),
          ),
        };
      }
    }
    working.set(card.id, next);
    return { ...row, outcome: "changed" };
  });
}

/** One changed card in the ledger: the fields before and after, and a hash of the file each time. */
export interface LedgerRow {
  readonly taskId: string;
  readonly title: string;
  readonly file: string;
  readonly before: ChangeFields;
  readonly after: ChangeFields;
  readonly beforeSha: string;
  readonly afterSha: string;
}

const HEADER = [
  "task_id",
  "title",
  "file",
  "status_before",
  "status_after",
  "priority_before",
  "priority_after",
  "project_before",
  "project_after",
  "before_sha",
  "after_sha",
];

const quote = (value: string) =>
  /[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;

export function serializeLedger(rows: ReadonlyArray<LedgerRow>): string {
  const lines = rows.map((row) =>
    [
      row.taskId,
      row.title,
      row.file,
      row.before.status,
      row.after.status,
      row.before.priority,
      row.after.priority,
      row.before.projectSlug ?? "",
      row.after.projectSlug ?? "",
      row.beforeSha,
      row.afterSha,
    ]
      .map(quote)
      .join(","),
  );
  return `${[HEADER.join(","), ...lines].join("\n")}\n`;
}

function splitCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') inQuotes = false;
      else cell += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length > 0) rows.push([...row, cell]);
  return rows;
}

export function parseLedger(csv: string): LedgerRow[] {
  return splitCsv(csv)
    .slice(1)
    .map((c) => ({
      taskId: c[0]!,
      title: c[1]!,
      file: c[2]!,
      before: {
        status: c[3] as ChangeFields["status"],
        priority: c[5] as ChangeFields["priority"],
        projectSlug: c[7] || null,
      },
      after: {
        status: c[4] as ChangeFields["status"],
        priority: c[6] as ChangeFields["priority"],
        projectSlug: c[8] || null,
      },
      beforeSha: c[9]!,
      afterSha: c[10]!,
    }));
}

const LEDGER_ID = /^[A-Za-z0-9-]+$/;
const ledgerDir = (root: string) => NodePath.join(root, "audits", "task-changes");
const beforeCopy = (root: string, ledgerId: string, file: string) =>
  NodePath.join(ledgerDir(root), `${ledgerId}.before`, encodeURIComponent(file));

export const sha256 = (raw: string) => NodeCrypto.createHash("sha256").update(raw).digest("hex");

/** Writes `audits/task-changes/<id>.csv` and a copy of each card as it was before the change. */
export function writeLedger(
  root: string,
  ledgerId: string,
  rows: ReadonlyArray<LedgerRow>,
  beforeRaw: ReadonlyMap<string, string>,
): void {
  NodeFS.mkdirSync(NodePath.join(ledgerDir(root), `${ledgerId}.before`), { recursive: true });
  for (const [file, raw] of beforeRaw) {
    NodeFS.writeFileSync(beforeCopy(root, ledgerId, file), raw, "utf8");
  }
  NodeFS.writeFileSync(
    NodePath.join(ledgerDir(root), `${ledgerId}.csv`),
    serializeLedger(rows),
    "utf8",
  );
}

/** The ledger rows and a reader for each card's saved copy; null when the id names no ledger. */
export function readLedger(root: string, ledgerId: string) {
  if (!LEDGER_ID.test(ledgerId)) return null;
  try {
    const csv = NodeFS.readFileSync(NodePath.join(ledgerDir(root), `${ledgerId}.csv`), "utf8");
    return {
      rows: parseLedger(csv),
      before: (file: string) => NodeFS.readFileSync(beforeCopy(root, ledgerId, file), "utf8"),
    };
  } catch {
    return null;
  }
}
