// Conflict-hunk parser and size tiers for the T3 Code catch-up (ADR-0096). No model calls here.

export interface Hunk {
  /** 0-based index of the hunk in the file. */
  index: number;
  /** 1-based line number of the opening marker. */
  startLine: number;
  ours: string[];
  theirs: string[];
  /** The common-ancestor side. Only present when the file uses the diff3 conflict style. */
  base: string[] | null;
}

export interface ParsedConflicts {
  /** Lines between hunks. `segments.length === hunks.length + 1`. */
  segments: string[][];
  hunks: Hunk[];
}

export const TIERS = ["xs", "s", "m", "l", "xl"] as const;
export type Tier = (typeof TIERS)[number];

// Upper bounds in conflict lines (ours + theirs). xs and s go to a free-tier model, m too with
// escalation, l and xl are handled inline by the frontier model.
const TIER_LIMITS: ReadonlyArray<readonly [Tier, number]> = [
  ["xs", 10],
  ["s", 30],
  ["m", 100],
  ["l", 400],
];

export function hunkSize(hunk: Pick<Hunk, "ours" | "theirs">): number {
  return hunk.ours.length + hunk.theirs.length;
}

export function tierOf(size: number): Tier {
  for (const [tier, limit] of TIER_LIMITS) if (size <= limit) return tier;
  return "xl";
}

/** Tiers that a free-tier model may take first (hunks of 30 lines or fewer). */
export function isSmallTier(tier: Tier): boolean {
  return tier === "xs" || tier === "s";
}

export function parseConflicts(text: string): ParsedConflicts {
  const lines = text.split("\n");
  const segments: string[][] = [[]];
  const hunks: Hunk[] = [];
  let side: "none" | "ours" | "base" | "theirs" = "none";
  let current: Hunk | null = null;
  lines.forEach((line, i) => {
    if (side === "none") {
      if (line.startsWith("<<<<<<< ")) {
        current = { index: hunks.length, startLine: i + 1, ours: [], theirs: [], base: null };
        side = "ours";
      } else {
        segments[segments.length - 1]!.push(line);
      }
      return;
    }
    const open = current!;
    if (side === "ours" && line.startsWith("||||||| ")) {
      open.base = [];
      side = "base";
    } else if ((side === "ours" || side === "base") && line.startsWith("=======")) {
      side = "theirs";
    } else if (side === "theirs" && line.startsWith(">>>>>>> ")) {
      hunks.push(open);
      segments.push([]);
      current = null;
      side = "none";
    } else if (side === "ours") open.ours.push(line);
    else if (side === "base") open.base!.push(line);
    else open.theirs.push(line);
  });
  if (side !== "none")
    throw new Error(`unterminated conflict hunk starting at line ${current!.startLine}`);
  return { segments, hunks };
}

export interface TierCounts {
  hunks: number;
  lines: number;
  byTier: Record<Tier, { hunks: number; lines: number }>;
}

export function countTiers(hunks: readonly Pick<Hunk, "ours" | "theirs">[]): TierCounts {
  const byTier = Object.fromEntries(
    TIERS.map((t) => [t, { hunks: 0, lines: 0 }]),
  ) as TierCounts["byTier"];
  let lines = 0;
  for (const h of hunks) {
    const size = hunkSize(h);
    const slot = byTier[tierOf(size)];
    slot.hunks += 1;
    slot.lines += size;
    lines += size;
  }
  return { hunks: hunks.length, lines, byTier };
}

export const TOKENS_PER_LINE = 12;

export function estimateTokens(lines: number): number {
  return Math.ceil(lines * TOKENS_PER_LINE);
}
