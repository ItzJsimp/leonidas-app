// PreToolUse guard for agents (Claude and Codex). Enforces four text rules in AGENTS.md:
//   1. Never kill by pattern (pkill, killall, taskkill /IM, Stop-Process -Name, pgrep piped to kill).
//   2. Never run a repo-wide check (`vp check` with no path, `-r` or `--recursive`).
//   3. Never edit the main checkout: use a claimed worktree.
// Reads the hook payload as JSON on stdin. A block exits 2 with a short reason on stderr.
// Fails open: any crash exits 0 with no output, so a broken guard never blocks a session.
// Self-check: vp test run scripts/agent-guard.test.ts
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";

const KILL_BY_PATTERN = [
  /\bpkill\b/i,
  /\bkillall\b/i,
  /\btaskkill\b[^\n]*\/(?:im|fi)\b/i,
  /\bStop-Process\b[^\n]*-Name\b/i,
  /\bGet-Process\b[^\n]*\|[^\n]*\bStop-Process\b/i,
  /\bpgrep\b[^\n]*\|\s*(?:xargs\s+)?kill\b/i,
  /\bkill\b[^\n]*\$\(\s*pgrep\b/i,
  /\|\s*xargs\s+kill\b/i,
];
const REPO_WIDE = [
  /\bvp\s+check(?:\s+--?[\w-]+(?:=\S+)?)*\s*(?:$|[;&|])/,
  /\b(?:vp|vpr|pnpm)\b[^\n;&|]*\s(?:-r|--recursive)\b/,
];
const REPO_WIDE_TOKEN = "REPO_WIDE_APPROVED";
// A read-only lead word with no chaining only names a pattern, it does not run it.
const READ_ONLY_LEAD = /^\s*(?:rtk\s+)?(?:git|rg|grep|cat|echo|head|tail|ls)\b/;
const CHAINING = /&&|\|\||;|\$\(|`|xargs/;

/** Return a block reason for a shell command, or null when it may run. */
export function checkBash(command) {
  if (typeof command !== "string" || !command) return null;
  if (READ_ONLY_LEAD.test(command) && !CHAINING.test(command)) return null;
  if (KILL_BY_PATTERN.some((p) => p.test(command))) {
    return "Blocked: never kill by pattern or name. Kill only a PID you captured at spawn, or your port's owner after you confirm its cwd.";
  }
  if (!command.includes(REPO_WIDE_TOKEN) && REPO_WIDE.some((p) => p.test(command))) {
    return `Blocked: repo-wide check. Use scoped checks: vp test run <files>, vp lint <files>. If the user asked for it, add ${REPO_WIDE_TOKEN} to the command.`;
  }
  return null;
}

/** Paths an edit tool or an apply_patch payload will touch. */
export function editPaths(toolInput, cwd) {
  if (!toolInput || typeof toolInput !== "object") return [];
  const direct = toolInput.file_path ?? toolInput.notebook_path ?? toolInput.path;
  const raw = [];
  if (typeof direct === "string") raw.push(direct);
  if (typeof toolInput.command === "string") {
    for (const m of toolInput.command.matchAll(/^\*\*\* (?:Add|Update|Delete) File: (.+)$/gm)) {
      raw.push(m[1].trim());
    }
  }
  return raw.map((p) =>
    NodePath.isAbsolute(p) ? NodePath.resolve(p) : NodePath.resolve(cwd ?? process.cwd(), p),
  );
}

/** True when `repoRoot` is a main checkout: its `.git` is a folder, not the file a worktree has. */
export function isMainCheckout(repoRoot) {
  const git = NodePath.join(repoRoot, ".git");
  return NodeFS.existsSync(git) && NodeFS.statSync(git).isDirectory();
}

/** Return a block reason when any path is inside the main checkout, or null. */
export function checkEdit(paths, repoRoot, env = process.env) {
  if (env.LEONIDAS_ALLOW_MAIN_EDIT === "1" || !isMainCheckout(repoRoot)) return null;
  for (const p of paths) {
    const rel = NodePath.relative(repoRoot, p);
    if (rel.startsWith("..") || NodePath.isAbsolute(rel)) continue;
    if (/^(?:\.git|node_modules)(?:[\\/]|$)/.test(rel)) continue;
    return `Blocked: ${rel} is in the main checkout. Claim a worktree: pwsh scripts/Start-AgentTask.ps1 -Task <slug> -Card <card>, then edit there.`;
  }
  return null;
}

function main() {
  let payload;
  try {
    payload = JSON.parse(NodeFS.readFileSync(0, "utf8"));
  } catch {
    return;
  }
  const input = payload?.tool_input;
  const repoRoot = NodePath.resolve(NodePath.dirname(NodeURL.fileURLToPath(import.meta.url)), "..");
  const reason =
    typeof input?.command === "string" && !/^\*\*\* /m.test(input.command)
      ? checkBash(input.command)
      : checkEdit(editPaths(input, payload?.cwd), repoRoot);
  if (reason) {
    console.error(reason);
    process.exitCode = 2;
  }
}

if (
  process.argv[1] &&
  NodePath.resolve(process.argv[1]) === NodeURL.fileURLToPath(import.meta.url)
) {
  try {
    main();
  } catch {
    // Fail open: a broken guard must never block a session.
  }
}
