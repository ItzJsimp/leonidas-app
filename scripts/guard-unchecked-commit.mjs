// Pre-commit guard. A checkout with no local `vp` (the main checkout keeps a partial install) cannot
// run typecheck or tests, so TypeScript errors only surface later at the release gate.
// Refuse a commit of staged TypeScript there. Docs-only commits pass.
// Set LEONIDAS_ALLOW_UNCHECKED_COMMIT=1 to override.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CODE_FILE = /\.(?:[cm]?tsx?)$/;

export function findBlockedFiles({ stagedFiles, hasLocalVp, allowOverride }) {
  if (hasLocalVp || allowOverride) return [];
  return stagedFiles.filter((file) => CODE_FILE.test(file));
}

function main() {
  const root = process.cwd();
  const hasLocalVp = ["vp", "vp.CMD", "vp.cmd"].some((name) =>
    existsSync(join(root, "node_modules", ".bin", name)),
  );
  const stagedFiles = execFileSync(
    "git",
    ["diff", "--cached", "--name-only", "--diff-filter=ACMR"],
    { encoding: "utf8" },
  )
    .split("\n")
    .filter(Boolean);
  const blocked = findBlockedFiles({
    stagedFiles,
    hasLocalVp,
    allowOverride: process.env.LEONIDAS_ALLOW_UNCHECKED_COMMIT === "1",
  });
  if (blocked.length === 0) return;
  console.error(
    [
      "",
      "Commit blocked: this checkout has no node_modules/.bin/vp, so typecheck and tests cannot run here.",
      `Staged TypeScript: ${blocked.slice(0, 5).join(", ")}${blocked.length > 5 ? ` and ${blocked.length - 5} more` : ""}`,
      "Commit from an installed worktree under C:/lcw instead.",
      "To commit here anyway, run: LEONIDAS_ALLOW_UNCHECKED_COMMIT=1 git commit ...",
      "",
    ].join("\n"),
  );
  process.exit(1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
