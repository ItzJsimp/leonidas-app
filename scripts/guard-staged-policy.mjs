// Pre-commit guard for the public repo. Scans only the lines a commit adds for: a secret, a
// personal path, an em dash (U+2014), or an assigned VITE_HTTP_URL or VITE_WS_URL.
// Set LEONIDAS_ALLOW_STAGED_POLICY=1 to skip it for one commit (a confirmed false alarm only).
// Fails open: a git or parse error exits 0 with no output.
// Self-check: vp test run scripts/guard-staged-policy.test.ts
import * as NodeChildProcess from "node:child_process";
import * as NodeURL from "node:url";
import * as NodePath from "node:path";

const RULES = [
  [
    "secret",
    /\bsk-[A-Za-z0-9]{20,}|\bghp_[A-Za-z0-9]{30,}|\bAKIA[0-9A-Z]{16}\b|BEGIN [A-Z ]*PRIVATE KEY/,
  ],
  ["personal path", /Users[\\/]Jacob\b|[A-Za-z]:[\\/]Leonidas[ ]AIOS/],
  ["em dash", /\u2014/],
  ["baked-in origin", /\bVITE_(?:HTTP|WS)_URL\s*=/],
];
// These files must name the patterns they enforce.
const EXEMPT =
  /(?:^|\/)(?:scripts\/(?:guard-staged-policy|agent-guard)(?:\.test)?\.(?:mjs|ts)|CONSTRAINTS\.md|pnpm-lock\.yaml)$/;

/** Violations in the added lines of a `git diff -U0` text. */
export function findViolations(diff) {
  const found = [];
  let file = "";
  let line = 0;
  for (const text of diff.split("\n")) {
    const header = /^\+\+\+ b\/(.+)$/.exec(text);
    if (header) {
      file = header[1];
      continue;
    }
    const hunk = /^@@ -\S+ \+(\d+)/.exec(text);
    if (hunk) {
      line = Number(hunk[1]) - 1;
      continue;
    }
    if (!text.startsWith("+") || text.startsWith("+++") || EXEMPT.test(file)) continue;
    line += 1;
    for (const [rule, pattern] of RULES) {
      if (pattern.test(text)) found.push({ file, line, rule });
    }
  }
  return found;
}

function main() {
  if (process.env.LEONIDAS_ALLOW_STAGED_POLICY === "1") return;
  let diff;
  try {
    diff = NodeChildProcess.execFileSync(
      "git",
      ["diff", "--cached", "-U0", "--no-color", "--diff-filter=ACMR"],
      {
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024,
      },
    );
  } catch {
    return;
  }
  const found = findViolations(diff);
  if (found.length === 0) return;
  console.error(
    [
      "Commit blocked: this public repo must hold no secret, personal path, em dash or baked-in origin.",
      ...found.slice(0, 10).map((v) => `  ${v.file}:${v.line}  ${v.rule}`),
      "Fix the lines, or set LEONIDAS_ALLOW_STAGED_POLICY=1 for a confirmed false alarm.",
    ].join("\n"),
  );
  process.exitCode = 1;
}

if (
  process.argv[1] &&
  NodePath.resolve(process.argv[1]) === NodeURL.fileURLToPath(import.meta.url)
) {
  try {
    main();
  } catch {
    // Fail open: a broken guard must never block a commit.
  }
}
