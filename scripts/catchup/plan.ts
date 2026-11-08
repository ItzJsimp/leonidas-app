// @effect-diagnostics nodeBuiltinImport:off - A dependency-free dev tool that runs git.
// Read a `git merge-tree --write-tree --name-only --messages` result and plan the catch-up work:
// which files conflict, of what kind, and how big each hunk is. Reads only; never changes a ref.
import * as NodeChildProcess from "node:child_process";
import {
  countTiers,
  estimateTokens,
  parseConflicts,
  TIERS,
  type Hunk,
  type TierCounts,
} from "./hunks.ts";

export type ConflictKind =
  | "content"
  | "add/add"
  | "modify/delete"
  | "rename/delete"
  | "rename/rename"
  | "file location"
  | "other";

export interface MergeTreeResult {
  tree: string;
  files: string[];
  kinds: Map<string, ConflictKind>;
  /** For modify/delete: which side deleted the file. */
  deletedBy: Map<string, string>;
}

const KNOWN = new Set<string>([
  "content",
  "add/add",
  "modify/delete",
  "rename/delete",
  "rename/rename",
  "file location",
]);

export function parseMergeTree(output: string): MergeTreeResult {
  const lines = output.split("\n");
  const tree = lines[0]!.trim();
  const files: string[] = [];
  let i = 1;
  for (; i < lines.length && lines[i] !== ""; i++) files.push(lines[i]!);
  const messages = lines.slice(i + 1);
  const kinds = new Map<string, ConflictKind>();
  const deletedBy = new Map<string, string>();
  for (const line of messages) {
    const m = /^CONFLICT \(([^)]+)\): (.*)$/.exec(line);
    if (!m) continue;
    const kind = (KNOWN.has(m[1]!) ? m[1] : "other") as ConflictKind;
    const rest = m[2]!;
    const dm = /^(\S+) deleted in (\S+) and modified in/.exec(rest);
    for (const f of files) {
      if (!kinds.has(f) && rest.includes(f)) {
        kinds.set(f, kind);
        if (dm && dm[1] === f) deletedBy.set(f, dm[2]!);
      }
    }
  }
  for (const f of files) if (!kinds.has(f)) kinds.set(f, "content");
  return { tree, files, kinds, deletedBy };
}

export function git(args: string[], cwd?: string): string {
  return NodeChildProcess.execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 1 << 30,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

/** Merge-tree writes objects but changes no ref. It exits 1 when there are conflicts. */
export function runMergeTree(ours: string, theirs: string, base?: string, cwd?: string): string {
  const args = ["merge-tree", "--write-tree", "--name-only", "--messages"];
  if (base) args.push(`--merge-base=${base}`);
  args.push(ours, theirs);
  try {
    return git(args, cwd);
  } catch (error) {
    const out = (error as { stdout?: string }).stdout;
    if (typeof out === "string" && out.length > 0) return out;
    throw error;
  }
}

export interface FilePlan {
  path: string;
  kind: ConflictKind;
  tiers: TierCounts | null;
}

export interface Plan {
  tree: string;
  files: FilePlan[];
  byKind: Record<string, number>;
  totals: TierCounts;
  estimatedReadTokens: number;
}

export function buildPlan(
  result: MergeTreeResult,
  readBlob: (path: string) => string | null,
): Plan {
  const files: FilePlan[] = [];
  const all: Pick<Hunk, "ours" | "theirs">[] = [];
  const byKind: Record<string, number> = {};
  for (const path of result.files) {
    const kind = result.kinds.get(path) ?? "content";
    byKind[kind] = (byKind[kind] ?? 0) + 1;
    let tiers: TierCounts | null = null;
    if (kind === "content" || kind === "add/add") {
      const text = readBlob(path);
      if (text !== null) {
        const { hunks } = parseConflicts(text);
        tiers = countTiers(hunks);
        all.push(...hunks);
      }
    }
    files.push({ path, kind, tiers });
  }
  const totals = countTiers(all);
  return {
    tree: result.tree,
    files,
    byKind,
    totals,
    estimatedReadTokens: estimateTokens(totals.lines),
  };
}

export function formatPlan(plan: Plan): string {
  const out: string[] = [];
  out.push(`merged tree ${plan.tree}`);
  out.push(`conflicted files: ${plan.files.length}`);
  for (const [kind, n] of Object.entries(plan.byKind).sort((a, b) => b[1] - a[1]))
    out.push(`  ${kind}: ${n}`);
  out.push(
    `hunks: ${plan.totals.hunks}, conflict lines: ${plan.totals.lines}, read estimate: ${plan.estimatedReadTokens} tokens`,
  );
  for (const t of TIERS) {
    const s = plan.totals.byTier[t];
    out.push(`  tier ${t}: ${s.hunks} hunks, ${s.lines} lines`);
  }
  return out.join("\n");
}

/** Read a file from the merged tree. Null when the path is missing there. */
export function blobReader(tree: string, cwd?: string): (path: string) => string | null {
  return (path) => {
    try {
      return git(["show", `${tree}:${path}`], cwd);
    } catch {
      return null;
    }
  };
}
