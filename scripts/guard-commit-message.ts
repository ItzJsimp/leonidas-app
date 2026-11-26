// @effect-diagnostics nodeBuiltinImport:off globalConsole:off - Git hooks run before dependency installation, with Node built-ins only.
// commit-msg guard. Runs the same Release-Note check as the merge queue, at commit time,
// so a bad note fails in seconds and not after a full queue run.
// A commit with `Release-Note: none` passes here: the queue judges the whole range.
// Fails open: an unreadable message file exits 0 with no output.
import * as NodeFS from "node:fs";
import * as NodeURL from "node:url";
import { checkReleaseNotes } from "./check-release-notes.ts";

const SKIPPED_SUBJECT = /^(?:Merge |Revert |fixup! |squash! )/;
const NONE_NOTE = /^Release-Note:\s*none\s*$/im;

/** Plain reasons the message breaks the Release-Note rules; empty when it passes. */
export function messageProblems(message: string, root: string): string[] {
  const clean = message
    .split("\n")
    .filter((line) => !line.startsWith("#"))
    .join("\n")
    .trim();
  const [subject = "", ...rest] = clean.split("\n");
  const body = rest.join("\n");
  if (!subject || SKIPPED_SUBJECT.test(subject) || NONE_NOTE.test(body)) return [];
  return checkReleaseNotes({ commits: [{ subject, body }], kind: "patch", root }).reasons;
}

function main() {
  const file = process.argv[2];
  if (!file) return;
  let message: string;
  try {
    message = NodeFS.readFileSync(file, "utf8");
  } catch {
    return;
  }
  const problems = messageProblems(message, process.cwd());
  if (problems.length === 0) return;
  console.error(
    `Commit blocked: release notes\n${problems.map((r) => `- ${r}`).join("\n")}\n` +
      "Fix: add a plain `Release-Note: <Added|Improved|Fixed|Changed|Removed> ...` trailer (8 to 18 words) to a user-visible commit, or `Release-Note: none` for internal work.",
  );
  process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === NodeURL.pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch {
    // Fail open: a broken guard must never block a commit.
  }
}
