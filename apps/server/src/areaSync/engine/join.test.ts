// @effect-diagnostics nodeBuiltinImport:off - tests use real files and real git in temp folders.
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

import { afterEach, assert, describe, it } from "@effect/vitest";

import { realGit, classifyFailure, remoteBaseOf } from "./git.ts";
import { AREAS_DIR, areasOnDisk, ensureAreasIgnored, joinWorkspace } from "./join.ts";
import { cleanTemp, g, makeRemote, makeWorkspace, read, tempDir, write } from "./testRepos.ts";

afterEach(cleanTemp);

const setup = () => {
  const base = tempDir("remotes-");
  const ws = makeWorkspace(base, [
    ["home", "active"],
    ["sales", "active"],
    ["content", "active"],
    ["finance", "active"],
    ["old", "archived"],
  ]);
  makeRemote(base, "acme-sales", { "README.md": "sales\n" });
  makeRemote(base, "acme-content", { "README.md": "content\n" });
  makeRemote(base, "acme-old", { "README.md": "old\n" });
  // acme-finance has no remote: the Member has no access to it.
  return ws;
};

describe("joinWorkspace", () => {
  it("clones granted Areas, marks the refused one locked, skips archived (T1)", async () => {
    const { root } = setup();
    const { results } = await joinWorkspace({ root, git: realGit });
    const state = Object.fromEntries(results.map((r) => [r.slug, r.state]));
    assert.deepStrictEqual(state, { sales: "joined", content: "joined", finance: "locked" });
    assert.strictEqual(read(root, "areas/sales/README.md"), "sales\n");
    assert.isFalse(NodeFS.existsSync(NodePath.join(root, AREAS_DIR, "finance")));
    assert.isFalse(NodeFS.existsSync(NodePath.join(root, AREAS_DIR, "old")));
  });

  it("changes nothing when run twice (T2)", async () => {
    const { root } = setup();
    await joinWorkspace({ root, git: realGit });
    const head = g(NodePath.join(root, "areas", "sales"), "rev-parse", "HEAD");
    write(root, "areas/sales/notes.md", "local note\n");
    const { results } = await joinWorkspace({ root, git: realGit });
    const state = Object.fromEntries(results.map((r) => [r.slug, r.state]));
    assert.deepStrictEqual(state, { sales: "present", content: "present", finance: "locked" });
    assert.strictEqual(g(NodePath.join(root, "areas", "sales"), "rev-parse", "HEAD"), head);
    assert.strictEqual(read(root, "areas/sales/notes.md"), "local note\n");
  });

  it("makes Home ignore areas/ exactly once (T11)", async () => {
    const { root } = setup();
    const first = await joinWorkspace({ root, git: realGit });
    const second = await joinWorkspace({ root, git: realGit });
    assert.isTrue(first.ignoreAdded);
    assert.isFalse(second.ignoreAdded);
    assert.strictEqual(
      read(root, ".gitignore")
        .split("\n")
        .filter((l) => l === "areas/").length,
      1,
    );
    assert.notInclude(g(root, "status", "--porcelain"), "areas/");
  });

  it("leaves a non-repo folder in the way untouched and reports failed", async () => {
    const { root } = setup();
    write(root, "areas/sales/mine.txt", "keep me\n");
    const { results } = await joinWorkspace({ root, git: realGit });
    assert.strictEqual(results.find((r) => r.slug === "sales")?.state, "failed");
    assert.strictEqual(read(root, "areas/sales/mine.txt"), "keep me\n");
  });

  it("finds the Area repos from the origin of Home when no base is given", async () => {
    const { root } = setup();
    const { results } = await joinWorkspace({ root, git: realGit });
    assert.strictEqual(results.find((r) => r.slug === "content")?.state, "joined");
    assert.deepStrictEqual([...areasOnDisk(root)].toSorted(), ["content", "sales"]);
  });

  it("throws when org/areas.md is missing", async () => {
    const root = tempDir("empty-");
    let message = "";
    await joinWorkspace({ root, git: realGit }).catch((error: Error) => (message = error.message));
    assert.include(message, "org/areas.md");
  });
});

describe("ensureAreasIgnored", () => {
  it("appends to an existing file without removing lines", () => {
    const root = tempDir();
    write(root, ".gitignore", "node_modules/\nmemory/*.md");
    assert.isTrue(ensureAreasIgnored(root));
    assert.strictEqual(read(root, ".gitignore"), "node_modules/\nmemory/*.md\nareas/\n");
  });
});

describe("git helpers", () => {
  it("classifies failures", () => {
    assert.strictEqual(
      classifyFailure("remote: Repository not found.\nfatal: repository 'x' not found"),
      "locked",
    );
    assert.strictEqual(
      classifyFailure("fatal: Authentication failed for 'https://github.com/o/r.git/'"),
      "locked",
    );
    assert.strictEqual(
      classifyFailure("fatal: unable to access 'x': Could not resolve host: github.com"),
      "offline",
    );
    assert.strictEqual(classifyFailure("fatal: something odd"), "error");
  });

  it("finds the base of a remote url", () => {
    assert.strictEqual(
      remoteBaseOf("https://github.com/org/acme-home.git"),
      "https://github.com/org/",
    );
    assert.strictEqual(remoteBaseOf("git@github.com:org/acme-home.git"), "git@github.com:org/");
    assert.strictEqual(remoteBaseOf("C:\\x\\remotes\\acme-home.git"), "C:\\x\\remotes\\");
  });
});
