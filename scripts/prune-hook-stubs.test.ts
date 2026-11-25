// @effect-diagnostics nodeBuiltinImport:off - The test builds real hook stub files in a temp folder.
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { afterEach, describe, expect, it } from "@effect/vitest";

// @ts-expect-error The script is a plain .mjs file with no type declarations.
import { pruneHookStubs } from "./prune-hook-stubs.mjs";

let root = "";

afterEach(() => NodeFS.rmSync(root, { recursive: true, force: true }));

function makeHooksDir(stubs: ReadonlyArray<string>, scripts: ReadonlyArray<string>) {
  root = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "hook-stubs-"));
  NodeFS.mkdirSync(NodePath.join(root, "_"));
  for (const name of [...stubs, "h", ".gitignore"]) {
    NodeFS.writeFileSync(NodePath.join(root, "_", name), "");
  }
  for (const name of scripts) NodeFS.writeFileSync(NodePath.join(root, name), "");
  return root;
}

describe("pruneHookStubs", () => {
  it("removes stubs that have no script and keeps the others", () => {
    const dir = makeHooksDir(["pre-commit", "post-commit", "pre-push"], ["pre-commit"]);
    expect(pruneHookStubs(dir).toSorted()).toEqual(["post-commit", "pre-push"]);
    expect(NodeFS.readdirSync(NodePath.join(dir, "_")).toSorted()).toEqual([
      ".gitignore",
      "h",
      "pre-commit",
    ]);
  });

  it("is safe to run twice and when the stub folder is missing", () => {
    const dir = makeHooksDir(["post-commit"], []);
    expect(pruneHookStubs(dir)).toEqual(["post-commit"]);
    expect(pruneHookStubs(dir)).toEqual([]);
    expect(pruneHookStubs(NodePath.join(dir, "missing"))).toEqual([]);
  });
});
