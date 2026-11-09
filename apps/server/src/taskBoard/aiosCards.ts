// @effect-diagnostics nodeBuiltinImport:off globalDate:off - card dates are plain local days, not Effect time.
import type {
  TaskBoardAgent,
  TaskBoardHistoryEntry,
  TaskBoardTask,
  TaskBoardTaskPriority,
  TaskBoardTaskStatus,
} from "@t3tools/contracts";
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

type FrontmatterFields = Record<string, string | ReadonlyArray<string>>;

export type AiosCardCache = Map<
  string,
  { mtimeMs: number; size: number; task: TaskBoardTask | null }
>;

export interface AiosCardPatch {
  readonly status?: TaskBoardTaskStatus | undefined;
  readonly priority?: TaskBoardTaskPriority | undefined;
  readonly title?: string | undefined;
  readonly due?: string | null | undefined;
  readonly milestone?: string | null | undefined;
  readonly projectSlug?: string | null | undefined;
  readonly claimedBy?: string | null | undefined;
  /** The owner's name; `null` makes the card available to anyone. */
  readonly assignee?: string | null | undefined;
  readonly effort?: string | null | undefined;
  /** Replaces the card's `tags`. */
  readonly labels?: ReadonlyArray<string> | undefined;
  /** `true` publishes the card to the shared board; `false` or `null` withdraws it. */
  readonly shared?: boolean | null | undefined;
  readonly sharedBy?: string | null | undefined;
  /** Shared-board sync state. Recorded without an activity line or a `last_touched` bump. */
  readonly sharedSync?: "pending" | "failed" | null | undefined;
  readonly note?: string | undefined;
  readonly actor: string;
  readonly agentLabel?: string | undefined;
  readonly threadId?: string | null | undefined;
  /** Ticks (`done: true`) or clears `## Done when` items, numbered from 1 in file order. */
  readonly check?: ReadonlyArray<{ readonly item: number; readonly done: boolean }> | undefined;
}

const ID_PATTERN = /^[A-Za-z0-9._-]{1,120}$/;
const KEY_LINE = /^([A-Za-z0-9_-]+):[ \t]*(.*)$/;
const LIST_ITEM = /^[ \t]*-(?:[ \t]+(.*))?$/;
const ACTIVITY_LINE =
  /^-\s+(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?\s+(.+?)(?: \(([^()]*)\))?:\s+(.*)$/;
// Activity lines written before 2026-10-16 separate the note with a spaced em dash.
const LEGACY_SEPARATOR = ` ${String.fromCharCode(0x2014)} `;
const ACTIVITY_VERBS = new Set(["claimed", "released", "completed", "blocked", "reopened"]);

const pad2 = (value: number) => String(value).padStart(2, "0");

function localDate(ms: number): string {
  const date = new Date(ms);
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function localTime(ms: number): string {
  const date = new Date(ms);
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

// Card dates are plain local days; "2026-10-09" means local midnight, not UTC.
function dateMs(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/.exec(value);
  const ms = match
    ? new Date(
        Number(match[1]),
        Number(match[2]) - 1,
        Number(match[3]),
        Number(match[4] ?? 0),
        Number(match[5] ?? 0),
      ).getTime()
    : Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function slugify(value: string, max: number): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .slice(0, max)
    .replace(/-+$/, "");
}

const hasDir = (path: string) => {
  try {
    return NodeFS.statSync(path).isDirectory();
  } catch {
    return false;
  }
};

/**
 * True when the real path `path` is `realRoot` or inside it. Both must already be real paths, so a
 * link or junction that leaves the root is caught (ADR-0080 workspace guard).
 */
export function isInsideRoot(realRoot: string, path: string): boolean {
  const relative = NodePath.relative(realRoot, path);
  return relative === "" || (!relative.startsWith("..") && !NodePath.isAbsolute(relative));
}

const realRootOf = (root: string): string | null => {
  try {
    return NodeFS.realpathSync.native(root);
  } catch {
    return null;
  }
};

/** True when `path` exists and stays inside `root` after links resolve (ADR-0080 guard). */
export function isRealPathInside(root: string, path: string): boolean {
  const realRoot = realRootOf(root);
  const real = realRootOf(path);
  return realRoot !== null && real !== null && isInsideRoot(realRoot, real);
}

/** Finds the AIOS root: the first hint (then its ancestors) that holds the task folders. */
export function findAiosRoot(hints: ReadonlyArray<string | undefined>): string | null {
  for (const hint of hints) {
    if (!hint?.trim()) continue;
    const start = NodePath.resolve(hint.trim());
    // A project workspace's own tasks/ is a generated view, not the AIOS tasks folder.
    if (
      hasDir(NodePath.join(start, "tasks")) &&
      NodePath.basename(NodePath.dirname(start)) !== "projects"
    ) {
      return start;
    }
    let dir = start;
    for (let depth = 0; depth < 4; depth++) {
      const parent = NodePath.dirname(dir);
      if (parent === dir) break;
      dir = parent;
      if (hasDir(NodePath.join(dir, "tasks")) && hasDir(NodePath.join(dir, "projects"))) return dir;
    }
  }
  return null;
}

function locateFrontmatter(
  text: string,
): { headerStart: number; headerEnd: number; bodyStart: number } | null {
  if (!text.startsWith("---")) return null;
  const firstEnd = text.indexOf("\n");
  if (firstEnd < 0 || text.slice(3, firstEnd).trim() !== "") return null;
  let pos = firstEnd + 1;
  while (pos <= text.length) {
    const nl = text.indexOf("\n", pos);
    const lineEnd = nl < 0 ? text.length : nl;
    if (text.slice(pos, lineEnd).trimEnd() === "---") {
      return {
        headerStart: firstEnd + 1,
        headerEnd: pos,
        bodyStart: nl < 0 ? text.length : nl + 1,
      };
    }
    if (nl < 0) return null;
    pos = nl + 1;
  }
  return null;
}

function unquote(value: string): string {
  const quote = value[0];
  if (quote !== '"' && quote !== "'") return value;
  let out = "";
  for (let i = 1; i < value.length; i++) {
    const ch = value[i]!;
    if (quote === '"' && ch === "\\" && i + 1 < value.length) {
      const next = value[++i]!;
      out +=
        next === "n"
          ? "\n"
          : next === "t"
            ? "\t"
            : next === '"' || next === "\\"
              ? next
              : `\\${next}`;
    } else if (ch === quote) {
      if (quote === "'" && value[i + 1] === "'") {
        out += "'";
        i++;
      } else {
        return out;
      }
    } else {
      out += ch;
    }
  }
  return value;
}

function splitInlineList(inner: string): string[] {
  const items: string[] = [];
  let current = "";
  let quote = "";
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i]!;
    if (quote) {
      current += ch;
      if (ch === "\\" && quote === '"' && i + 1 < inner.length) current += inner[++i]!;
      else if (ch === quote) quote = "";
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
    } else if (ch === ",") {
      items.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  items.push(current);
  return items.map((item) => unquote(item.trim())).filter((item) => item !== "");
}

/** Reads card frontmatter (scalars, block lists, inline lists) and the body after it. */
export function parseFrontmatter(
  raw: string,
): { fields: Record<string, string | ReadonlyArray<string>>; body: string } | null {
  const text = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
  const span = locateFrontmatter(text);
  if (!span) return null;
  const lines = text.slice(span.headerStart, span.headerEnd).split(/\r?\n/);
  const fields: FrontmatterFields = {};
  for (let i = 0; i < lines.length; i++) {
    const match = KEY_LINE.exec(lines[i]!);
    if (!match) continue;
    const key = match[1]!;
    const value = match[2]!.trim();
    let parsed: string | ReadonlyArray<string>;
    if (value === "") {
      const items: string[] = [];
      for (
        let next = LIST_ITEM.exec(lines[i + 1] ?? "");
        next;
        next = LIST_ITEM.exec(lines[i + 1] ?? "")
      ) {
        const item = unquote((next[1] ?? "").trim());
        if (item) items.push(item);
        i++;
      }
      parsed = items.length > 0 ? items : "";
    } else if (value.startsWith("[") && value.endsWith("]")) {
      parsed = splitInlineList(value.slice(1, -1));
    } else {
      parsed = unquote(value);
    }
    if (!(key in fields)) fields[key] = parsed;
  }
  return { fields, body: text.slice(span.bodyStart) };
}

/** Maps a card status string (any case, with aliases) to the board status. */
export function statusFromCard(value: string | undefined): TaskBoardTaskStatus {
  switch (
    value
      ?.trim()
      .toLowerCase()
      .replace(/[\s_-]+/g, " ")
  ) {
    case "in progress":
    case "doing":
    case "active":
      return "in_progress";
    case "awaiting review":
    case "review":
      return "review";
    case "blocked":
      return "blocked";
    case "done":
    case "completed":
    case "finished":
      return "done";
    case "dormant":
    case "parked":
    case "later":
      return "parked";
    case "retired":
    case "cut":
      return "retired";
    default:
      return "todo";
  }
}

const CARD_STATUS: Record<TaskBoardTaskStatus, string> = {
  todo: "Not started",
  in_progress: "In progress",
  review: "Awaiting Review",
  blocked: "Blocked",
  done: "Done",
  parked: "Dormant",
  retired: "Retired",
};

export function statusToCard(status: TaskBoardTaskStatus): string {
  return CARD_STATUS[status];
}

const GAME_STATUS: Record<TaskBoardTaskStatus, string> = {
  todo: "todo",
  in_progress: "doing",
  review: "review",
  blocked: "blocked",
  done: "done",
  parked: "later",
  retired: "cut",
};

const GAME_PRIORITY: Record<TaskBoardTaskPriority, string> = {
  critical: "P0",
  high: "P1",
  medium: "P2",
  low: "P3",
};

function priorityFromCard(value: string | undefined): TaskBoardTaskPriority {
  switch (value?.trim().toLowerCase()) {
    case "critical":
    case "p0":
      return "critical";
    case "high":
    case "p1":
    // Older cards and skills wrote "Now" (urgent) and "Next" (the default); "Next" stays medium.
    case "now":
      return "high";
    case "low":
    case "p3":
    case "someday":
      return "low";
    default:
      return "medium";
  }
}

const priorityToCard = (priority: TaskBoardTaskPriority) =>
  priority[0]!.toUpperCase() + priority.slice(1);

// Strips `projects/` and `project-` prefixes; `domains/finances` style slugs stay as written.
function normalizeProjectSlug(value: string | undefined): string | null {
  const slug = (value ?? "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/^projects\//i, "")
    // SimplyGersi cards link the project file: `projects/<slug>/project.md`.
    .replace(/\/project\.md$/i, "")
    .replace(/^project-/i, "")
    .replace(/\/+$/, "")
    .toLowerCase();
  return slug || null;
}

/** Game-repo cards (`owner` + `system` frontmatter) keep their own words and are edited byte-clean. */
const isGameCard = (fields: FrontmatterFields) => "owner" in fields && "system" in fields;

/** The board owner a game card's `owner` names: jake and mob are people, `either` is anyone. */
function gameOwner(value: string): string | null {
  const owner = value.trim();
  if (!owner || owner.toLowerCase() === "either") return null;
  return owner[0]!.toUpperCase() + owner.slice(1).toLowerCase();
}

// Game tasks whose `blockedBy` still lists every `depends` id; readAiosTasks drops the finished ones.
const gameTasks = new WeakSet<TaskBoardTask>();

const field = (fields: FrontmatterFields, key: string): string => {
  const value = fields[key];
  return (Array.isArray(value) ? value.join(", ") : ((value as string | undefined) ?? "")).trim();
};

const listField = (fields: FrontmatterFields, key: string): string[] => {
  const value = fields[key];
  const items = Array.isArray(value) ? (value as string[]) : value ? [value as string] : [];
  return items
    .flatMap((item) => item.split(","))
    .map((item) => item.trim())
    .filter(Boolean);
};

// Section body runs from the end of its `## <title>` heading line to the next `#` or `##` heading.
function findSection(
  body: string,
  title: string,
): { headingStart: number; start: number; end: number } | null {
  const match = new RegExp(`^##[ \\t]+${title}[ \\t]*\\r?$`, "im").exec(body);
  if (!match) return null;
  const start = match.index + match[0].length;
  const next = /^#{1,2}[ \t]/gm;
  next.lastIndex = start;
  const end = next.exec(body)?.index ?? body.length;
  return { headingStart: match.index, start, end };
}

const CHECK_ITEM = /^([ \t]*[-*][ \t]+\[)([ xX])(\][ \t]*)(.*?)\r?$/gm;

/** One `## Done when` checkbox: its 1-based number, its text and whether it is ticked. */
export interface DoneWhenItem {
  readonly item: number;
  readonly text: string;
  readonly done: boolean;
}

/** The `## Done when` checkboxes of a card body, in file order. */
export function doneWhenItems(body: string): DoneWhenItem[] {
  const section = findSection(body, "Done when");
  if (!section) return [];
  return [...body.slice(section.start, section.end).matchAll(CHECK_ITEM)].map((match, index) => ({
    item: index + 1,
    text: match[4]!.trim(),
    done: match[2] !== " ",
  }));
}

/** Sets `## Done when` boxes by number. Throws `checklist_item` for a number the card lacks. */
function tickDoneWhen(
  body: string,
  checks: NonNullable<AiosCardPatch["check"]>,
): { body: string; summary: string[] } {
  const section = findSection(body, "Done when");
  const total = doneWhenItems(body).length;
  const bad = checks.some(
    (check) => !Number.isInteger(check.item) || check.item < 1 || check.item > total,
  );
  if (bad || !section) throw new Error(`checklist_item: the card has ${total} Done when items`);
  const wanted = new Map(checks.map((check) => [check.item, check.done]));
  const checked: number[] = [];
  const unchecked: number[] = [];
  let index = 0;
  const next = body
    .slice(section.start, section.end)
    .replace(CHECK_ITEM, (line, open: string, mark: string) => {
      index++;
      const done = wanted.get(index);
      if (done === undefined || done === (mark !== " ")) return line;
      (done ? checked : unchecked).push(index);
      return open + (done ? "x" : " ") + line.slice(open.length + 1);
    });
  return {
    body: body.slice(0, section.start) + next + body.slice(section.end),
    summary: [
      ...(checked.length > 0 ? [`checked ${checked.join(", ")}`] : []),
      ...(unchecked.length > 0 ? [`unchecked ${unchecked.join(", ")}`] : []),
    ],
  };
}

function parseActivity(taskId: string, section: string): TaskBoardHistoryEntry[] {
  const entries: TaskBoardHistoryEntry[] = [];
  for (const line of section.split(/\r?\n/)) {
    const match = ACTIVITY_LINE.exec(line.trim());
    if (!match) continue;
    const actor = match[6]!.trim();
    if (!actor) continue;
    const timestamp = new Date(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3]),
      Number(match[4] ?? 0),
      Number(match[5] ?? 0),
    ).getTime();
    const text = match[8]!.trim();
    // New lines use " - "; older lines use the legacy separator.
    const legacy = text.indexOf(LEGACY_SEPARATOR);
    const separator = legacy >= 0 ? legacy : text.indexOf(" - ");
    const head = separator < 0 ? text : text.slice(0, separator);
    const verb = /^[a-z]+/.exec(head)?.[0] ?? "";
    const action = ACTIVITY_VERBS.has(verb)
      ? (verb as TaskBoardHistoryEntry["action"])
      : "progress";
    const note = action === "progress" ? text : separator < 0 ? null : text.slice(separator + 3);
    const label = match[7]?.trim();
    entries.push({
      id: `${taskId}-act-${entries.length}`,
      taskId,
      action,
      actor,
      timestamp,
      note,
      ...(label ? { agent: { model: label } } : {}),
    });
  }
  return entries;
}

/** Turns one task card into a board task, or null when the file is not a task card. */
export function cardToTask(input: {
  fileName: string;
  raw: string;
  mtimeMs: number;
  now: number;
  member?: string;
  projectHint?: string;
}): TaskBoardTask | null {
  const parsed = parseFrontmatter(input.raw);
  if (!parsed) return null;
  const { fields } = parsed;
  const type = field(fields, "type").toLowerCase();
  if (type && type !== "task") return null;
  const stem = NodePath.basename(input.fileName, ".md");
  const name = field(fields, "name") || field(fields, "title");
  const looksLikeCard = "status" in fields || "id" in fields;
  if (!name && !looksLikeCard) return null;

  const declaredId = field(fields, "id");
  const id = ID_PATTERN.test(declaredId) ? declaredId : `task-${slugify(stem, 115) || "card"}`;
  const projectSlug =
    normalizeProjectSlug(field(fields, "project")) ?? normalizeProjectSlug(input.projectHint);
  const status = statusFromCard(field(fields, "status"));

  let body = parsed.body.replace(/^(?:[ \t]*\r?\n)*# [^\n]*(?:\n|$)/, "");
  const activity = findSection(body, "Activity");
  const history = activity ? parseActivity(id, body.slice(activity.start, activity.end)) : [];
  if (activity) body = body.slice(0, activity.headingStart) + body.slice(activity.end);
  const description = body.trim();

  const items = doneWhenItems(parsed.body);
  const checklist =
    items.length > 0
      ? { done: items.filter((item) => item.done).length, total: items.length }
      : undefined;

  const lastTouched = dateMs(field(fields, "last_touched"));
  const updatedAt = Math.max(lastTouched ?? 0, input.mtimeMs) || input.now;
  const claimedBy = field(fields, "claimed_by") || null;
  const lastClaim = history.findLast((entry) => entry.action === "claimed");
  const threadId = field(fields, "thread_id");
  const threadIds = [
    ...new Set([...listField(fields, "thread_ids"), ...(threadId ? [threadId] : [])]),
  ];
  const agentModel = field(fields, "claimed_agent") || lastClaim?.agent?.model || "";
  const claimedAgent: TaskBoardAgent | null =
    threadId || agentModel
      ? { ...(agentModel ? { model: agentModel } : {}), ...(threadId ? { threadId } : {}) }
      : null;

  const completed = status === "done";
  const lastCompletion = history.findLast((entry) => entry.action === "completed");
  const completedAt = completed
    ? (dateMs(field(fields, "completed_date")) ?? lastTouched ?? updatedAt)
    : null;
  const resolution = completed
    ? /\*\*Resolution Summary:\*\*[ \t]*(.+)/.exec(parsed.body)?.[1]?.trim()
    : undefined;

  // `build_lane` says who builds the card ("Mob", "Jake", "Mob after Jake go"); it becomes a
  // `lane:` label so every client can show and search it.
  const buildLane = field(fields, "build_lane");
  const game = isGameCard(fields);
  const system = game ? field(fields, "system") : "";
  const labels = [
    ...new Set(
      [
        ...listField(fields, "tags"),
        field(fields, "lane"),
        system ? `system:${system}` : "",
        buildLane ? `lane:${buildLane.toLowerCase().replace(/\s+/g, "-")}` : "",
      ].filter(Boolean),
    ),
  ];
  const due = field(fields, "due");
  const verify = field(fields, "verify");
  const shared = field(fields, "shared").toLowerCase() === "true";
  const sharedBy = shared ? field(fields, "shared_by") : "";
  const assignee = game
    ? (gameOwner(field(fields, "owner")) ?? "")
    : field(fields, "assignee") || assigneeFromLane(buildLane);
  const kind = cardKind(field(fields, "kind"), history);
  const sharedSync = shared ? field(fields, "shared_sync") : "";

  const task: TaskBoardTask = {
    id,
    project: projectSlug ?? "general",
    title: name || stem.replace(/-/g, " "),
    description,
    status,
    priority: priorityFromCard(field(fields, "priority")),
    claimedBy,
    claimedAt: claimedBy ? (lastClaim?.timestamp ?? lastTouched ?? updatedAt) : null,
    claimedAgent,
    ...(threadIds.length > 0 ? { threadIds } : {}),
    completedBy: completed
      ? (lastCompletion?.actor ??
        (claimedBy ||
          (game
            ? gameOwner(field(fields, "owner"))
            : field(fields, "accountable") || field(fields, "owner")) ||
          input.member ||
          "Unknown"))
      : null,
    completedAt,
    completionSummary: resolution || null,
    createdAt: dateMs(field(fields, "created")) ?? (input.mtimeMs || input.now),
    updatedAt,
    labels,
    source: "aios_card",
    projectSlug,
    ...(field(fields, "project_id") ? { projectId: field(fields, "project_id") } : {}),
    effort: field(fields, "effort") || null,
    energy: field(fields, "energy_type") || null,
    due: due || null,
    milestone: /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/.test(field(fields, "milestone"))
      ? field(fields, "milestone")
      : null,
    verify: verify || null,
    startFiles: listField(fields, "start_files"),
    blockedBy: listField(fields, game ? "depends" : "blocked_by"),
    ...(checklist ? { checklist } : {}),
    shared,
    ...(sharedBy ? { sharedBy } : {}),
    ...(sharedSync === "pending" || sharedSync === "failed" ? { sharedSync } : {}),
    assignee: assignee || null,
    ...(kind === "agent_run" ? { kind } : {}),
    ...(field(fields, "private").toLowerCase() === "true"
      ? {
          // A private task names its Area, so a computer that has the Area can show the real title.
          labels: [
            ...labels,
            "private",
            ...(field(fields, "area") ? [`area:${field(fields, "area")}`] : []),
          ],
        }
      : {}),
    sourceId: declaredId || stem,
    sourceFile: NodePath.basename(input.fileName),
    issueUrl: null,
    history,
  };
  if (game) gameTasks.add(task);
  return task;
}

/**
 * The owner a card's `build_lane` names, for cards written before `assignee` existed:
 * "Mob" and "Mob after Jake go" are Mob's, "Jake" is Jake's. Other lanes name no person.
 */
function assigneeFromLane(lane: string): string {
  const person = /^(mob|jake)\b/i.exec(lane.trim())?.[1];
  return person ? person[0]!.toUpperCase() + person.slice(1).toLowerCase() : "";
}

/** Marker the chat auto-log writes when it files a request; older agent-run cards carry only this. */
const AGENT_RUN_NOTE = "Agent started on this request.";

/** `agent_run` for a card the app filed from a chat request, otherwise a normal task. */
function cardKind(
  declared: string,
  history: ReadonlyArray<TaskBoardHistoryEntry>,
): "task" | "agent_run" {
  const value = declared.trim().toLowerCase().replace(/-/g, "_");
  if (value === "agent_run") return "agent_run";
  if (value === "task") return "task";
  return history.some((entry) => entry.note?.includes(AGENT_RUN_NOTE)) ? "agent_run" : "task";
}

const keyFor = (path: string) => (NodePath.sep === "\\" ? path.toLowerCase() : path);

function nestedRepoDirs(projectDir: string): string[] {
  try {
    return NodeFS.readdirSync(projectDir, { withFileTypes: true })
      .filter(
        (child) =>
          child.isDirectory() &&
          !child.name.startsWith(".") &&
          NodeFS.existsSync(NodePath.join(projectDir, child.name, ".git")),
      )
      .map((child) => NodePath.join(projectDir, child.name));
  } catch {
    return [];
  }
}

export interface AiosTaskFolder {
  readonly dir: string;
  readonly projectHint: string | undefined;
  readonly global: boolean;
}

/**
 * Lists the folders that hold cards, global first: `<root>/tasks`, then `<root>/projects/<slug>/tasks`
 * and the `tasks` folder of each nested game repo. A folder may not exist.
 */
export function aiosTaskFolders(root: string): ReadonlyArray<AiosTaskFolder> {
  const folders: AiosTaskFolder[] = [
    { dir: NodePath.join(root, "tasks"), projectHint: undefined, global: true },
  ];
  try {
    for (const entry of NodeFS.readdirSync(NodePath.join(root, "projects"), {
      withFileTypes: true,
    })) {
      if (entry.name.startsWith("_") || entry.name.startsWith(".")) continue;
      const projectDir = NodePath.join(root, "projects", entry.name);
      folders.push({
        dir: NodePath.join(projectDir, "tasks"),
        projectHint: entry.name,
        global: false,
      });
      // A child folder with its own .git is a separate repo (a game) that keeps its own cards.
      // Board edits write back to that repo's card file (see `findCardFile`).
      for (const child of nestedRepoDirs(projectDir)) {
        folders.push({
          dir: NodePath.join(child, "tasks"),
          projectHint: entry.name,
          global: false,
        });
      }
    }
  } catch {
    // No projects folder: only the global cards exist.
  }
  return folders;
}

/** Parses one card file, reusing the cache while its mtime and size are unchanged. */
function readCardFile(
  file: string,
  stat: NodeFS.Stats,
  projectHint: string | undefined,
  opts: { now: number; cache?: AiosCardCache | undefined },
): TaskBoardTask | null {
  const cached = opts.cache?.get(file);
  if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) return cached.task;
  const task = cardToTask({
    fileName: NodePath.basename(file),
    raw: NodeFS.readFileSync(file, "utf8"),
    mtimeMs: stat.mtimeMs,
    now: opts.now,
    ...(projectHint ? { projectHint } : {}),
  });
  opts.cache?.set(file, { mtimeMs: stat.mtimeMs, size: stat.size, task });
  return task;
}

/**
 * Reads the one card at `file` (an AIOS card path from `findCardFile`). Used after a write, so
 * the caller does not rescan the whole board to see its own change.
 */
export function readAiosCardFile(
  root: string,
  file: string,
  opts: { now: number; cache?: AiosCardCache },
): TaskBoardTask | null {
  const relative = NodePath.relative(NodePath.join(root, "projects"), file).split(NodePath.sep);
  const projectHint =
    relative.length > 1 && relative[0] !== ".." && !NodePath.isAbsolute(relative[0]!)
      ? relative[0]
      : undefined;
  return readCardFile(file, NodeFS.statSync(file), projectHint, opts);
}

/** Reads every task card under `<root>/tasks` and `<root>/projects/<slug>/tasks`. Never throws per card. */
export function readAiosTasks(
  root: string,
  opts: { now: number; cache?: AiosCardCache },
): ReadonlyArray<TaskBoardTask> {
  const seenFiles = new Set<string>();
  // File names in the global folder: a project view links to the global card with the same name.
  const globalNames = new Set<string>();
  const byId = new Map<string, { task: TaskBoardTask; mtimeMs: number; global: boolean }>();

  const realRoot = realRootOf(root);
  if (realRoot === null) return [];

  const visit = (tasksDir: string, projectHint: string | undefined, global: boolean) => {
    let baseDir: string;
    let entries: NodeFS.Dirent[];
    try {
      baseDir = NodeFS.realpathSync.native(tasksDir);
      // A folder linked in from outside the workspace is another workspace's data.
      if (!isInsideRoot(realRoot, baseDir)) return;
      entries = NodeFS.readdirSync(baseDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const name = entry.name;
      if (!name.endsWith(".md") || name.startsWith(".") || name.toLowerCase() === "readme.md")
        continue;
      try {
        const symlink = entry.isSymbolicLink();
        if (!symlink && !entry.isFile()) continue;
        if (symlink) {
          // Project task views link to global cards already seen. A same-name link is skipped with
          // no file system call; any other link costs one readlink.
          if (globalNames.has(keyFor(name))) continue;
          const target = keyFor(
            NodePath.resolve(baseDir, NodeFS.readlinkSync(NodePath.join(baseDir, name))),
          );
          if (seenFiles.has(target)) continue;
        }
        const file = symlink
          ? NodeFS.realpathSync.native(NodePath.join(baseDir, name))
          : NodePath.join(baseDir, name);
        if (symlink && !isInsideRoot(realRoot, file)) continue;
        const seenKey = keyFor(file);
        if (seenFiles.has(seenKey)) continue;
        seenFiles.add(seenKey);
        if (global) globalNames.add(keyFor(name));
        const stat = NodeFS.statSync(file);
        if (!stat.isFile()) continue;

        const task = readCardFile(file, stat, projectHint, opts);
        if (!task) continue;

        const existing = byId.get(task.id);
        if (
          existing &&
          (existing.global !== global ? existing.global : existing.mtimeMs >= stat.mtimeMs)
        )
          continue;
        byId.set(task.id, { task, mtimeMs: stat.mtimeMs, global });
      } catch {
        // One unreadable or malformed card must not hide the rest of the board.
      }
    }
  };

  for (const folder of aiosTaskFolders(root)) visit(folder.dir, folder.projectHint, folder.global);
  const tasks = [...byId.values()].map((found) => found.task);
  // A game card's `depends` blocks it only while the card it names is not done.
  let done: Set<string> | undefined;
  return tasks.map((task) => {
    if (task.blockedBy?.length && gameTasks.has(task)) {
      const finished = (done ??= new Set(
        tasks.filter((other) => other.status === "done").map((other) => other.id),
      ));
      const open = task.blockedBy.filter((id) => !finished.has(id));
      if (open.length !== task.blockedBy.length) return { ...task, blockedBy: open };
    }
    return task;
  });
}

/** Finds a card file by its `sourceFile`: global tasks first, then project task folders. */
export function findCardFile(root: string, sourceFile: string): string | null {
  if (sourceFile !== NodePath.basename(sourceFile)) return null;
  const realRoot = realRootOf(root);
  if (realRoot === null) return null;
  const candidates = aiosTaskFolders(root).map((folder) => NodePath.join(folder.dir, sourceFile));
  return (
    candidates.find((candidate) => {
      if (!NodeFS.existsSync(candidate)) return false;
      const real = realRootOf(candidate);
      return real !== null && isInsideRoot(realRoot, real);
    }) ?? null
  );
}

const quote = (value: string) =>
  `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r?\n/g, "\\n")}"`;

const oneLine = (value: string) => value.replace(/\s+/g, " ").trim();

function appendActivity(body: string, line: string, eol: string): string {
  const section = findSection(body, "Activity");
  if (section) {
    const kept = body.slice(section.start, section.end).trimEnd().length;
    const at = section.start + kept;
    return body.slice(0, at) + (kept === 0 ? eol + eol : eol) + line + body.slice(at);
  }
  const head = body.trimEnd();
  return (head ? head + eol + eol : "") + "## Activity" + eol + eol + line + eol;
}

/**
 * Edits card frontmatter lines in place and logs the change under `## Activity`. Other lines,
 * line endings and the BOM are kept as they were. Throws `invalid_card` without frontmatter.
 */
export function applyCardPatch(raw: string, patch: AiosCardPatch, now: number): string {
  const bom = raw.charCodeAt(0) === 0xfeff ? "﻿" : "";
  const text = bom ? raw.slice(1) : raw;
  const span = locateFrontmatter(text);
  const parsed = parseFrontmatter(text);
  if (!span || !parsed) throw new Error("invalid_card");
  const { fields } = parsed;
  // Game-repo cards (`owner` + `system`) keep their own words: `doing`, `P0`, unquoted.
  const game = isGameCard(fields);
  const eol = text[text.indexOf("\n") - 1] === "\r" ? "\r\n" : "\n";
  const lines = text
    .slice(span.headerStart, span.headerEnd)
    .split(/(?<=\n)/)
    .filter(Boolean);

  const setKey = (key: string, value: string | null) => {
    const prefix = `${key}:`;
    const index = lines.findIndex((line) => line.startsWith(prefix));
    if (index < 0) {
      if (value !== null) lines.push(`${key}: ${value}${eol}`);
      return;
    }
    let count = 1;
    if (lines[index]!.slice(prefix.length).trim() === "") {
      while (
        index + count < lines.length &&
        LIST_ITEM.test(lines[index + count]!.replace(/\r?\n$/, ""))
      )
        count++;
    }
    const terminator = /\r?\n$/.exec(lines[index]!)?.[0] ?? eol;
    lines.splice(index, count, ...(value === null ? [] : [`${key}: ${value}${terminator}`]));
  };

  const was = {
    status: statusFromCard(field(fields, "status")),
    priority: priorityFromCard(field(fields, "priority")),
    title: field(fields, "name") || field(fields, "title"),
    project: normalizeProjectSlug(field(fields, "project")),
    claimedBy: field(fields, "claimed_by"),
    assignee: game ? (gameOwner(field(fields, "owner")) ?? "") : field(fields, "assignee"),
    threadId: field(fields, "thread_id"),
    shared: field(fields, "shared").toLowerCase() === "true",
    sharedBy: field(fields, "shared_by"),
  };
  const lifecycle: string[] = [];
  const claim: string[] = [];
  const other: string[] = [];
  let changed = false;

  const claimedBy = patch.claimedBy === undefined ? undefined : patch.claimedBy?.trim() || null;
  const claimed = claimedBy != null && claimedBy !== was.claimedBy;
  const released = claimedBy === null && was.claimedBy !== "";
  if (claimed) {
    setKey("claimed_by", quote(claimedBy));
    claim.push("claimed");
  } else if (released) {
    setKey("claimed_by", null);
    claim.push("released");
  }
  changed ||= claimed || released;

  const assignee = patch.assignee === undefined ? undefined : patch.assignee?.trim() || null;
  if (assignee !== undefined && (assignee ?? "") !== was.assignee) {
    // A game card keeps its owner in `owner`, in lower case: jake, mob or either.
    if (game) setKey("owner", assignee === null ? "either" : assignee.toLowerCase());
    else setKey("assignee", assignee === null ? null : quote(assignee));
    other.push(assignee === null ? "made available to anyone" : `assigned to ${assignee}`);
    changed = true;
  }

  // Releasing a card also drops the thread that held it, unless the caller says otherwise.
  const threadId =
    patch.threadId === undefined ? (released ? null : undefined) : patch.threadId?.trim() || null;
  if (threadId !== undefined && (threadId ?? "") !== was.threadId) {
    setKey("thread_id", threadId === null ? null : quote(threadId));
    changed = true;
  }
  // `thread_ids` is the record of every chat on the card. A release clears `thread_id`, not this.
  if (threadId) {
    const seen = listField(fields, "thread_ids");
    const all = [...new Set([...seen, ...(was.threadId ? [was.threadId] : []), threadId])];
    if (all.join("|") !== seen.join("|")) {
      setKey("thread_ids", `[${all.map(quote).join(", ")}]`);
      changed = true;
    }
  }

  if (patch.status !== undefined && patch.status !== was.status) {
    const card = game ? GAME_STATUS[patch.status] : statusToCard(patch.status);
    setKey("status", game ? card : quote(card));
    if (game) {
      // Game cards change only the field that moved: no completed_date, no activity line.
    } else if (patch.status === "done") {
      setKey("completed_date", localDate(now));
      lifecycle.push("completed");
    } else {
      if (was.status === "done") setKey("completed_date", null);
      if (patch.status === "blocked") lifecycle.push("blocked");
      else if (was.status === "done") {
        lifecycle.push(
          patch.status === "todo" || patch.status === "in_progress"
            ? "reopened"
            : `reopened, status → ${card}`,
        );
      } else if (
        !(claimed && patch.status === "in_progress") &&
        !(released && patch.status === "todo")
      ) {
        other.push(`status → ${card}`);
      }
    }
    changed = true;
  }

  if (patch.priority !== undefined && patch.priority !== was.priority) {
    const priority = game ? GAME_PRIORITY[patch.priority] : priorityToCard(patch.priority);
    setKey("priority", game ? priority : quote(priority));
    other.push(`priority → ${priority}`);
    changed = true;
  }

  if (patch.effort !== undefined && (patch.effort ?? "") !== field(fields, "effort")) {
    setKey("effort", patch.effort === null ? null : quote(patch.effort));
    other.push(patch.effort === null ? "removed effort" : `effort → ${patch.effort}`);
    changed = true;
  }

  if (patch.labels !== undefined) {
    const next = [...new Set(patch.labels.map(oneLine).filter(Boolean))];
    const current = listField(fields, "tags");
    if (next.join("|") !== current.join("|")) {
      setKey("tags", next.length === 0 ? null : `[${next.map(quote).join(", ")}]`);
      other.push(`labels → ${next.join(", ") || "none"}`);
      changed = true;
    }
  }

  if (patch.due !== undefined && (patch.due ?? "") !== field(fields, "due")) {
    setKey("due", patch.due === null ? null : game ? patch.due : quote(patch.due));
    other.push(patch.due === null ? "removed due date" : `due → ${patch.due}`);
    changed = true;
  }

  if (patch.milestone !== undefined && (patch.milestone ?? "") !== field(fields, "milestone")) {
    setKey("milestone", patch.milestone === null ? null : quote(patch.milestone));
    other.push(patch.milestone === null ? "removed milestone" : `milestone → ${patch.milestone}`);
    changed = true;
  }

  const title = patch.title === undefined ? undefined : oneLine(patch.title);
  if (title && title !== was.title) {
    setKey("name" in fields || !("title" in fields) ? "name" : "title", quote(title));
    other.push(`renamed to "${title}"`);
    changed = true;
  }

  if (patch.projectSlug !== undefined) {
    const slug = normalizeProjectSlug(patch.projectSlug ?? undefined);
    if (slug !== was.project) {
      setKey("project", slug === null ? null : quote(slug));
      // The stored project id named the old project; the slug decides the owner again.
      setKey("project_id", null);
      other.push(slug === null ? "unlinked from project" : `linked to project ${slug}`);
      changed = true;
    }
  }

  if (patch.shared !== undefined) {
    const shared = patch.shared === true;
    const by = shared ? patch.sharedBy?.trim() || was.sharedBy : "";
    if (shared !== was.shared || by !== was.sharedBy) {
      setKey("shared", shared ? "true" : null);
      setKey("shared_by", shared && by ? quote(by) : null);
      other.push(shared ? "shared with collaborators" : "stopped sharing");
      changed = true;
    }
  }

  // Withdrawing a card from the shared board also drops its sync state.
  const sharedSync = patch.shared === false || patch.shared === null ? null : patch.sharedSync;
  const syncChanged =
    sharedSync !== undefined && (sharedSync ?? "") !== field(fields, "shared_sync");
  if (syncChanged) setKey("shared_sync", sharedSync);

  let body = text.slice(span.bodyStart);
  if (patch.check !== undefined && patch.check.length > 0) {
    const ticked = tickDoneWhen(body, patch.check);
    if (ticked.summary.length > 0) {
      body = ticked.body;
      other.push(...ticked.summary);
      changed = true;
    }
  }

  let closing = text.slice(span.headerEnd, span.bodyStart);
  if (!game && !closing.endsWith("\n")) closing += eol;
  const header = () => bom + text.slice(0, span.headerStart) + lines.join("") + closing;

  // Game cards are edited byte-clean: only the changed lines differ, with no last_touched bump
  // and no Activity section.
  if (game) return changed || syncChanged ? header() + body : raw;

  const note = patch.note === undefined ? "" : oneLine(patch.note);
  if (!changed && !note) return syncChanged ? header() + body : raw;

  setKey("last_touched", localDate(now));
  const parts = [...lifecycle, ...claim, ...other];
  const label = patch.agentLabel ? oneLine(patch.agentLabel).replace(/[()]/g, "") : "";
  const summary = (parts.length > 0 ? parts.join(", ") : "progress") + (note ? ` - ${note}` : "");
  const entry = `- ${localDate(now)} ${localTime(now)} ${oneLine(patch.actor)}${label ? ` (${label})` : ""}: ${summary}`;

  return header() + appendActivity(body, entry, eol);
}

/** Writes a new task card to `<root>/tasks/<slug>.md` without ever overwriting a file. */
export function createCardFile(
  root: string,
  input: {
    title: string;
    id?: string | undefined;
    due?: string | null | undefined;
    milestone?: string | null | undefined;
    description?: string | undefined;
    priority?: string | undefined;
    projectSlug?: string | null | undefined;
    /** The app project id; it keeps a native card in that project's workspace on a slug clash. */
    projectId?: string | null | undefined;
    assignee?: string | null | undefined;
    kind?: "task" | "agent_run" | undefined;
    actor: string;
  },
  now: number,
): { fileName: string; id: string; raw: string } {
  const title = oneLine(input.title);
  const base = slugify(title, 80) || "task";
  const tasksDir = NodePath.join(root, "tasks");
  NodeFS.mkdirSync(tasksDir, { recursive: true });
  const date = localDate(now);
  const projectSlug = normalizeProjectSlug(input.projectSlug ?? undefined);
  for (let attempt = 1; ; attempt++) {
    const slug = attempt === 1 ? base : `${base}-${attempt}`;
    const id = input.id ?? `task-${slug}`;
    const raw =
      [
        "---",
        "type: task",
        `id: ${id}`,
        `name: ${quote(title)}`,
        `status: ${quote(statusToCard("todo"))}`,
        "owner: leonidas",
        `accountable: ${quote(oneLine(input.actor))}`,
        `priority: ${quote(priorityToCard(priorityFromCard(input.priority)))}`,
        "scope: structural",
        `created: ${date}`,
        `last_touched: ${date}`,
        ...(projectSlug ? [`project: ${quote(projectSlug)}`] : []),
        ...(projectSlug && input.projectId ? [`project_id: ${quote(input.projectId)}`] : []),
        ...(input.due ? [`due: ${quote(input.due)}`] : []),
        ...(input.milestone ? [`milestone: ${quote(input.milestone)}`] : []),
        ...(input.assignee?.trim() ? [`assignee: ${quote(oneLine(input.assignee))}`] : []),
        ...(input.kind === "agent_run" ? ["kind: agent_run"] : []),
        "---",
        `# ${title}`,
        "",
        input.description?.trim() ?? "",
      ].join("\n") + "\n";
    try {
      NodeFS.writeFileSync(NodePath.join(tasksDir, `${slug}.md`), raw, { flag: "wx" });
      return { fileName: `${slug}.md`, id, raw };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST" || attempt > 500) throw error;
      if (input.id !== undefined) {
        const existingRaw = NodeFS.readFileSync(NodePath.join(tasksDir, `${slug}.md`), "utf8");
        const existing = cardToTask({
          fileName: `${slug}.md`,
          raw: existingRaw,
          mtimeMs: now,
          now,
        });
        if (existing?.id === input.id)
          return { fileName: `${slug}.md`, id: input.id, raw: existingRaw };
      }
    }
  }
}

const titleCase = (slug: string) =>
  slug
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((word) => word[0]!.toUpperCase() + word.slice(1))
    .join(" ");

/** Lists every folder in `<root>/projects`, named by frontmatter `name`, then `# ` heading, then slug. */
export function discoverProjects(
  root: string,
): ReadonlyArray<{ slug: string; name: string; dir: string | null }> {
  const projectsDir = NodePath.join(root, "projects");
  let entries: NodeFS.Dirent[];
  try {
    entries = NodeFS.readdirSync(projectsDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const projects: Array<{ slug: string; name: string; dir: string | null }> = [];
  for (const entry of entries) {
    if (entry.name.startsWith("_") || entry.name.startsWith(".")) continue;
    const dir = NodePath.join(projectsDir, entry.name);
    // A project folder linked in from outside belongs to another workspace.
    if (!hasDir(dir) || !isRealPathInside(root, dir)) continue;
    let name = "";
    try {
      const parsed = parseFrontmatter(
        NodeFS.readFileSync(NodePath.join(dir, "project.md"), "utf8"),
      );
      // The frontmatter name is the display name; the heading is a document title.
      const field = parsed?.fields.name;
      name =
        (typeof field === "string" ? field.trim() : "") ||
        ((parsed?.body ?? "").match(/^# +(.+?)\s*$/m)?.[1] ?? "");
    } catch {
      // No readable project.md: fall back to the folder name.
    }
    projects.push({ slug: entry.name, name: name || titleCase(entry.name) || entry.name, dir });
  }
  return projects;
}

let fallbackMember: string | undefined;

/** The person's name for claims: LEONIDAS_MEMBER, then git user.name, then the OS user. */
export function resolveMember(env: Record<string, string | undefined> = process.env): string {
  const fromEnv = env.LEONIDAS_MEMBER?.trim();
  if (fromEnv) return fromEnv;
  if (fallbackMember !== undefined) return fallbackMember;
  let member = "";
  try {
    member = NodeChildProcess.execFileSync("git", ["config", "user.name"], {
      encoding: "utf8",
      timeout: 2_000,
      stdio: ["ignore", "pipe", "ignore"],
      windowsHide: true,
    }).trim();
  } catch {
    // git missing or no user.name set.
  }
  if (!member) {
    try {
      member = NodeOS.userInfo().username.trim();
    } catch {
      // No OS user info available.
    }
  }
  fallbackMember = member || "Unknown";
  return fallbackMember;
}
