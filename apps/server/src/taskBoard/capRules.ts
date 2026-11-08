import type { TaskBoardTask } from "@t3tools/contracts";

/**
 * The open-card cap per project. The rule is data: optional `cap:` and `warn:` lines in
 * `projects/<slug>/project.md`. `scripts/task-cap-check.py` in the AIOS reads the same lines.
 */
export interface CapRule {
  readonly cap: number;
  readonly warn: number;
}

export type CapCard = Pick<
  TaskBoardTask,
  "id" | "title" | "status" | "priority" | "createdAt" | "projectSlug"
>;

const PROJECT_CAP = 50;
const INBOX_CAP = 30;
const WARN_RATIO = 0.6;
const OPEN = ["todo", "in_progress", "review", "blocked"];
export const isOpenStatus = (status: string) => OPEN.includes(status);
const PRIORITY_RANK = { low: 0, medium: 1, high: 2, critical: 3 } as const;

export const isInbox = (slug: string | null | undefined) =>
  !slug || slug === "general" || slug === "inbox";
export const sameBucket = (card: CapCard, slug: string | null) =>
  isInbox(slug) ? isInbox(card.projectSlug) : card.projectSlug === slug;

/** `projectMd` is the project.md text, or null when the project has none (or is the Inbox). */
export function parseCapRule(projectMd: string | null, slug: string | null): CapRule {
  const head = (!isInbox(slug) && projectMd?.split("---")[1]) || "";
  const read = (key: string) => {
    const match = new RegExp(`^${key}:\\s*(\\d+)\\s*$`, "m").exec(head);
    return match ? Number(match[1]) : undefined;
  };
  const cap = read("cap") ?? (isInbox(slug) ? INBOX_CAP : PROJECT_CAP);
  const warn = read("warn") ?? Math.floor(cap * WARN_RATIO);
  return { cap, warn };
}

const MAX_CAP = 9999;

/** A plain sentence when this limit and warning cannot be saved, else null. */
export function capProblem(cap: number, warn: number): string | null {
  if (!Number.isInteger(cap) || !Number.isInteger(warn)) return "Use whole numbers.";
  if (cap < 1 || cap > MAX_CAP) return `The limit must be from 1 to ${MAX_CAP}.`;
  if (warn < 0 || warn > cap) return "The warning must be from 0 up to the limit.";
  return null;
}

/** The project.md text with `cap:` and `warn:` set in its front matter. Every other line stays. */
export function withCapLines(projectMd: string | null, cap: number, warn: number): string {
  const text = projectMd ?? "";
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = [`cap: ${cap}`, `warn: ${warn}`];
  const front = /^---\r?\n([\s\S]*?)\r?\n?---/.exec(text);
  if (!front) return `---${eol}${lines.join(eol)}${eol}---${eol}${text}`;
  const kept = front[1] ? front[1].split(/\r?\n/).filter((line) => !/^(cap|warn):/.test(line)) : [];
  return `---${eol}${[...kept, ...lines].join(eol)}${eol}---${text.slice(front[0].length)}`;
}

export interface CapLevel extends CapRule {
  readonly open: number;
  readonly level: "ok" | "warn" | "full";
}

export function capLevel(
  cards: ReadonlyArray<CapCard>,
  slug: string | null,
  rule: CapRule,
): CapLevel {
  const open = cards.filter((card) => isOpenStatus(card.status) && sameBucket(card, slug)).length;
  return { ...rule, open, level: open >= rule.cap ? "full" : open >= rule.warn ? "warn" : "ok" };
}

/** The 3 cards to park or retire to make room: lowest priority first, then oldest. */
export function swapSuggestions(cards: ReadonlyArray<CapCard>, slug: string | null): CapCard[] {
  return (
    cards
      // Only "todo": a card someone is working on, waiting on or reviewing is never offered.
      .filter((card) => card.status === "todo" && sameBucket(card, slug))
      .toSorted(
        (a, b) =>
          PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || a.createdAt - b.createdAt,
      )
      .slice(0, 3)
  );
}

export const capRefusalMessage = (
  label: string,
  level: CapLevel,
  suggestions: ReadonlyArray<CapCard>,
) =>
  `${label} has ${level.open} open tasks (cap ${level.cap}). ` +
  (suggestions.length > 0
    ? `Park or retire one first, for example: ${suggestions.map((card) => `"${card.title}"`).join(", ")}.`
    : "Finish, park or retire one first.");
