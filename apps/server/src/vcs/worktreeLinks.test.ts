// @effect-diagnostics nodeBuiltinImport:off - the test builds real folders and links in a temp folder.
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest";

import { cutWorktreeLinks } from "./worktreeLinks.ts";

let base: string;

beforeEach(async () => {
  base = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "worktree-links-"));
});

afterEach(async () => {
  await NodeFSP.rm(base, { recursive: true, force: true });
});

async function makeTarget(): Promise<string> {
  const target = NodePath.join(base, "outside", "skill");
  await NodeFSP.mkdir(target, { recursive: true });
  await NodeFSP.writeFile(NodePath.join(target, "SKILL.md"), "keep me");
  return target;
}

// The "junction" type only matters on Windows; other systems make a plain symlink.
const linkType = "junction";

// A linked worktree has a ".git" file at its root.
async function makeWorktree(): Promise<string> {
  const worktree = NodePath.join(base, "wt");
  await NodeFSP.mkdir(worktree, { recursive: true });
  await NodeFSP.writeFile(NodePath.join(worktree, ".git"), "gitdir: elsewhere");
  return worktree;
}

describe("cutWorktreeLinks", () => {
  it("removes a link and keeps every file in its target", async () => {
    const target = await makeTarget();
    const worktree = await makeWorktree();
    await NodeFSP.mkdir(NodePath.join(worktree, ".agents", "skills"), { recursive: true });
    const link = NodePath.join(worktree, ".agents", "skills", "doop");
    await NodeFSP.symlink(target, link, linkType);

    expect(await cutWorktreeLinks(worktree)).toBe(1);

    await expect(NodeFSP.lstat(link)).rejects.toThrow();
    expect(await NodeFSP.readFile(NodePath.join(target, "SKILL.md"), "utf8")).toBe("keep me");
  });

  it("leaves a tree with no links unchanged", async () => {
    const worktree = await makeWorktree();
    await NodeFSP.mkdir(NodePath.join(worktree, "src"), { recursive: true });
    await NodeFSP.writeFile(NodePath.join(worktree, "src", "a.ts"), "x");

    expect(await cutWorktreeLinks(worktree)).toBe(0);
    expect(await NodeFSP.readFile(NodePath.join(worktree, "src", "a.ts"), "utf8")).toBe("x");
  });

  it("does not enter node_modules", async () => {
    const target = await makeTarget();
    const worktree = await makeWorktree();
    await NodeFSP.mkdir(NodePath.join(worktree, "node_modules"), { recursive: true });
    const link = NodePath.join(worktree, "node_modules", "pkg");
    await NodeFSP.symlink(target, link, linkType);

    expect(await cutWorktreeLinks(worktree)).toBe(0);
    expect((await NodeFSP.lstat(link)).isSymbolicLink()).toBe(true);
  });

  it("does not touch a folder that is not a worktree", async () => {
    const target = await makeTarget();
    const folder = NodePath.join(base, "plain");
    await NodeFSP.mkdir(folder, { recursive: true });
    const link = NodePath.join(folder, "linked");
    await NodeFSP.symlink(target, link, linkType);

    expect(await cutWorktreeLinks(folder)).toBe(0);
    expect((await NodeFSP.lstat(link)).isSymbolicLink()).toBe(true);
  });

  it("does nothing when the worktree is already gone", async () => {
    expect(await cutWorktreeLinks(NodePath.join(base, "missing"))).toBe(0);
  });
});
