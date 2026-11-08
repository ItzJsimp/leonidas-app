// Build the prompt for a free-tier worker: one file's small hunks, each with a few lines of context.
// The worker never sees the whole file. Its answer is checked by check.ts before it is accepted.
import { estimateTokens, hunkSize, isSmallTier, parseConflicts, tierOf } from "./hunks.ts";

export interface BatchPrompt {
  path: string;
  hunks: number[];
  prompt: string;
  lines: number;
  estimatedTokens: number;
}

const RULES = [
  "Resolve each conflict hunk below. Keep every Leonidas (ours) change that is a Leonidas-only feature, a plain-word copy change, a bug fix or a speed gain.",
  "Take the T3 Code (theirs) change for everything else. Combine both sides when they touch different lines.",
  "Use ONLY lines that appear in the ours or theirs side of the same hunk. Do not write a new line. If you cannot resolve a hunk with those lines, answer SKIP for it.",
  "Answer one block per hunk: `### hunk N` then the resolved lines, or `### hunk N` then `SKIP`. No other text.",
].join("\n");

export function buildBatch(path: string, conflicted: string, context = 20): BatchPrompt | null {
  const { segments, hunks } = parseConflicts(conflicted);
  const small = hunks.filter((h) => isSmallTier(tierOf(hunkSize(h))));
  if (small.length === 0) return null;
  const parts: string[] = [`File: ${path}`, "", RULES, ""];
  let lines = 0;
  for (const h of small) {
    const before = segments[h.index]!.slice(-context);
    const after = (segments[h.index + 1] ?? []).slice(0, context);
    parts.push(
      `### hunk ${h.index}`,
      "context before:",
      ...before,
      "<<<<<<< ours",
      ...h.ours,
      "=======",
      ...h.theirs,
      ">>>>>>> theirs",
      "context after:",
      ...after,
      "",
    );
    lines += before.length + h.ours.length + h.theirs.length + after.length;
  }
  const prompt = parts.join("\n");
  return {
    path,
    hunks: small.map((h) => h.index),
    prompt,
    lines,
    estimatedTokens: estimateTokens(lines + RULES.split("\n").length),
  };
}
