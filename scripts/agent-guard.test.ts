import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { describe, expect, it } from "@effect/vitest";

// @ts-expect-error The guard is a plain .mjs script with no type declarations.
import { checkBash, checkEdit, editPaths } from "./agent-guard.mjs";

describe("checkBash", () => {
  it.each([
    "pkill -f vite",
    "killall node",
    "taskkill /IM node.exe /F",
    'powershell -Command "Stop-Process -Name node"',
    "pgrep -f server | xargs kill",
    "kill $(pgrep -f server)",
  ])("blocks kill by pattern: %s", (command) => {
    expect(checkBash(command)).toContain("never kill by pattern");
  });

  it.each([
    "vp check",
    "vp check --fix",
    "vp run -r typecheck",
    "pnpm -r test",
    "pnpm run --recursive build",
  ])("blocks a repo-wide run: %s", (command) => {
    expect(checkBash(command)).toContain("repo-wide");
  });

  it("allows a scoped run, a kill by PID, a read-only mention and an approved run", () => {
    for (const command of [
      "vp check apps/web/src/a.ts",
      "vp test run scripts/a.test.ts",
      "kill 4242",
      "rg pkill scripts",
      "git commit -m 'never use pkill'",
      "vp check REPO_WIDE_APPROVED",
    ]) {
      expect(checkBash(command)).toBeNull();
    }
  });
});

describe("editPaths and checkEdit", () => {
  const root = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "guard-main-"));
  const worktree = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "guard-wt-"));
  NodeFS.mkdirSync(NodePath.join(root, ".git"));
  NodeFS.writeFileSync(NodePath.join(worktree, ".git"), "gitdir: elsewhere");

  it("reads Edit paths and apply_patch paths", () => {
    expect(editPaths({ file_path: "/a/b.ts" }, "/c")).toEqual([NodePath.resolve("/a/b.ts")]);
    expect(
      editPaths({ command: "*** Begin Patch\n*** Update File: x/y.ts\n*** End Patch" }, "/c"),
    ).toEqual([NodePath.resolve("/c", "x/y.ts")]);
  });

  it("blocks an edit inside the main checkout", () => {
    expect(checkEdit([NodePath.join(root, "apps", "a.ts")], root, {})).toContain("main checkout");
  });

  it("allows a worktree, files outside, .git, node_modules and the override", () => {
    expect(checkEdit([NodePath.join(worktree, "a.ts")], worktree, {})).toBeNull();
    expect(checkEdit([NodePath.join(worktree, "..", "other.ts")], root, {})).toBeNull();
    expect(checkEdit([NodePath.join(root, ".git", "x")], root, {})).toBeNull();
    expect(checkEdit([NodePath.join(root, "node_modules", "x")], root, {})).toBeNull();
    expect(
      checkEdit([NodePath.join(root, "a.ts")], root, { LEONIDAS_ALLOW_MAIN_EDIT: "1" }),
    ).toBeNull();
  });
});
