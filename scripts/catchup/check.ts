// "No invented lines" check (ADR-0096). A resolved hunk may only contain lines that already exist
// on the ours, theirs or base side of that hunk (compared without surrounding whitespace).
import { parseConflicts, type Hunk } from "./hunks.ts";

export interface Violation {
  /** Hunk index, or -1 when text outside any hunk changed. */
  hunk: number;
  kind: "invented" | "combined" | "context-changed";
  line: string;
}

const norm = (line: string) => line.trim();
const TOKEN = /[A-Za-z_$][\w$]*|\d+(?:\.\d+)?|"[^"]*"|'[^']*'|`[^`]*`/g;
const tokens = (line: string) => line.match(TOKEN) ?? [];

function sameLines(a: readonly string[], b: readonly string[], at: number): boolean {
  if (at < 0 || at + a.length > b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[at + i]) return false;
  return true;
}

/**
 * Find where each hunk's resolution sits in the resolved file. The text between hunks must be
 * unchanged. Returns one [start, end) range per group of hunks, or null when it does not line up.
 */
function locate(segments: string[][], resolved: string[]): Array<[number, number]> | null {
  const first = segments[0]!;
  if (!sameLines(first, resolved, 0)) return null;
  const failed = new Set<string>();
  const go = (i: number, pos: number): Array<[number, number]> | null => {
    const seg = segments[i + 1]!;
    const last = i + 1 === segments.length - 1;
    const key = `${i}:${pos}`;
    if (failed.has(key)) return null;
    if (last) {
      const at = resolved.length - seg.length;
      if (at >= pos && sameLines(seg, resolved, at)) return [[pos, at]];
      failed.add(key);
      return null;
    }
    for (let j = pos; j + seg.length <= resolved.length; j++) {
      if (!sameLines(seg, resolved, j)) continue;
      const rest = go(i + 1, j + seg.length);
      if (rest) return [[pos, j], ...rest];
    }
    failed.add(key);
    return null;
  };
  return go(0, first.length);
}

export function checkResolution(conflicted: string, resolved: string): Violation[] {
  const { segments, hunks } = parseConflicts(conflicted);
  if (hunks.length === 0) return [];
  if (/^(<<<<<<< |>>>>>>> |=======$)/m.test(resolved)) {
    return [{ hunk: -1, kind: "context-changed", line: "conflict markers are still in the file" }];
  }
  const ranges = locate(segments, resolved.split("\n"));
  if (!ranges) {
    return [
      {
        hunk: -1,
        kind: "context-changed",
        line: "text outside the conflict hunks changed or a hunk was removed",
      },
    ];
  }
  const out: Violation[] = [];
  const resolvedLines = resolved.split("\n");
  // Hunks with no text between them cannot be told apart in the resolved file: check them as one group.
  const group: number[] = [];
  hunks.forEach((_, i) => group.push(i > 0 && segments[i]!.length === 0 ? group[i - 1]! : i));
  hunks.forEach((hunk: Hunk, i) => {
    const allowed = new Set<string>();
    const allowedTokens = new Set<string>();
    for (const member of hunks.filter((_, j) => group[j] === group[i])) {
      for (const line of [...member.ours, ...member.theirs, ...(member.base ?? [])]) {
        allowed.add(norm(line));
        for (const t of tokens(line)) allowedTokens.add(t);
      }
    }
    const [start, end] = ranges[i]!;
    for (const line of resolvedLines.slice(start, end)) {
      const n = norm(line);
      if (n === "" || allowed.has(n)) continue;
      const known = tokens(n).every((t) => allowedTokens.has(t));
      out.push({ hunk: hunk.index, kind: known ? "combined" : "invented", line: n });
    }
  });
  return out;
}

/** Strict mode fails on any violation. `allowCombined` accepts lines built only from known tokens. */
export function passes(violations: readonly Violation[], allowCombined = false): boolean {
  return violations.every((v) => allowCombined && v.kind === "combined");
}
