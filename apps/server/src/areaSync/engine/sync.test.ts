// @effect-diagnostics nodeBuiltinImport:off - tests use real files and real git in temp folders.
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

import { afterEach, assert, describe, it } from "@effect/vitest";

import { realGit, type Git } from "./git.ts";
import { joinWorkspace } from "./join.ts";
import { isMidMerge, statusAll, syncArea, syncWorkspace } from "./sync.ts";
import {
  cleanTemp,
  cloneOf,
  g,
  makeRemote,
  makeWorkspace,
  read,
  tempDir,
  write,
} from "./testRepos.ts";

afterEach(cleanTemp);

const ROWS = [
  ["home", "active"],
  ["sales", "active"],
] as const;

/** A workspace joined to one Area, plus a peer clone that stands for another Member. */
async function joined(seed: Record<string, string> = { "README.md": "sales\n" }) {
  const base = tempDir("remotes-");
  const { root } = makeWorkspace(base, ROWS);
  const bare = makeRemote(base, "acme-sales", seed);
  await joinWorkspace({ root, git: realGit });
  const dir = NodePath.join(root, "areas", "sales");
  const peer = cloneOf(base, "acme-sales");
  const peerPush = (file: string, text: string) => {
    write(peer, file, text);
    g(peer, "add", "-A");
    g(peer, "commit", "-m", `peer ${file}`);
    g(peer, "push");
  };
  return { base, root, bare, dir, peer, peerPush };
}

const files = (dir: string) =>
  NodeFS.readdirSync(dir, { recursive: true, encoding: "utf8" })
    .filter((p) => !p.startsWith(".git"))
    .toSorted();

const recorder =
  (calls: string[][], inner: Git = realGit): Git =>
  (args, cwd) => {
    calls.push([...args]);
    return inner(args, cwd);
  };

describe("syncArea clean paths", () => {
  it("saves local changes as a commit and pushes them (T3)", async () => {
    const s = await joined();
    write(s.dir, "notes.md", "local\n");
    const r = await syncArea({ dir: s.dir, git: realGit });
    assert.strictEqual(r.state, "pushed");
    assert.isTrue(r.committed);
    g(s.peer, "pull");
    assert.strictEqual(read(s.peer, "notes.md"), "local\n");
  });

  it("pulls what others pushed and commits nothing (T4)", async () => {
    const s = await joined();
    s.peerPush("new.md", "from peer\n");
    const r = await syncArea({ dir: s.dir, git: realGit });
    assert.strictEqual(r.state, "pulled");
    assert.isFalse(r.committed);
    assert.strictEqual(read(s.dir, "new.md"), "from peer\n");
  });

  it("keeps both edits when sides changed different files (T5)", async () => {
    const s = await joined();
    s.peerPush("a.md", "peer\n");
    write(s.dir, "b.md", "mine\n");
    const r = await syncArea({ dir: s.dir, git: realGit });
    assert.strictEqual(r.state, "pushed");
    assert.strictEqual(read(s.dir, "a.md"), "peer\n");
    g(s.peer, "pull");
    assert.strictEqual(read(s.peer, "b.md"), "mine\n");
  });

  it("returns synced when nothing changed", async () => {
    const s = await joined();
    assert.strictEqual((await syncArea({ dir: s.dir, git: realGit })).state, "synced");
  });

  it("retries once when the remote moves during the push", async () => {
    const s = await joined();
    write(s.dir, "mine.md", "mine\n");
    let raced = false;
    const racing: Git = async (args, cwd) => {
      if (args[0] === "push" && !raced) {
        raced = true;
        s.peerPush("race.md", "raced\n");
      }
      return realGit(args, cwd);
    };
    const r = await syncArea({ dir: s.dir, git: racing });
    assert.strictEqual(r.state, "pushed");
    assert.strictEqual(read(s.dir, "race.md"), "raced\n");
    g(s.peer, "pull");
    assert.strictEqual(read(s.peer, "mine.md"), "mine\n");
  });
});

describe("syncArea safety", () => {
  const conflictSetup = async () => {
    const s = await joined({ "README.md": "x\n", "c.md": "one\ntwo\nthree\n" });
    s.peerPush("c.md", "one\nPEER\nthree\n");
    write(s.dir, "c.md", "one\nMINE\nthree\n");
    return s;
  };

  it("aborts a conflict, keeps both sides and leaves a clean tree (T6, rule 4)", async () => {
    const s = await conflictSetup();
    const remoteBefore = g(s.bare, "rev-parse", "main");
    const r = await syncArea({ dir: s.dir, git: realGit, now: () => 1760000000 });
    assert.strictEqual(r.state, "conflict");
    assert.deepStrictEqual(r.conflicts, ["c.md"]);
    assert.strictEqual(r.savedRef, "refs/leonidas/remote-1760000000");
    assert.strictEqual(g(s.dir, "status", "--porcelain"), "");
    assert.strictEqual(g(s.dir, "log", "-1", "--format=%s"), "sync: save local changes");
    assert.strictEqual(read(s.dir, "c.md"), "one\nMINE\nthree\n");
    assert.strictEqual(
      g(s.dir, "show", `${r.savedRef}:c.md`).replace(/\r/g, ""),
      "one\nPEER\nthree",
    );
    assert.strictEqual(g(s.bare, "rev-parse", "main"), remoteBefore);
    assert.isFalse(await isMidMerge(realGit, s.dir));
  });

  it("pushes after the agent merges the saved side", async () => {
    const s = await conflictSetup();
    const r = await syncArea({ dir: s.dir, git: realGit, now: () => 1 });
    try {
      g(s.dir, "merge", r.savedRef!);
    } catch {
      // the merge stops on the conflict, which is the point
    }
    assert.isTrue(await isMidMerge(realGit, s.dir));
    write(s.dir, "c.md", "one\nMINE and PEER\nthree\n");
    g(s.dir, "add", "-A");
    g(s.dir, "commit", "-m", "merge");
    const after = await syncArea({ dir: s.dir, git: realGit });
    assert.strictEqual(after.state, "pushed");
    g(s.peer, "pull");
    assert.strictEqual(read(s.peer, "c.md"), "one\nMINE and PEER\nthree\n");
  });

  it("never auto-commits a repo in the middle of a merge (T7, rule 7)", async () => {
    const s = await conflictSetup();
    const r = await syncArea({ dir: s.dir, git: realGit, now: () => 1 });
    try {
      g(s.dir, "merge", r.savedRef!);
    } catch {
      // expected conflict
    }
    const head = g(s.dir, "rev-parse", "HEAD");
    const marked = read(s.dir, "c.md");
    const again = await syncArea({ dir: s.dir, git: realGit });
    assert.strictEqual(again.state, "merging");
    assert.strictEqual(g(s.dir, "rev-parse", "HEAD"), head);
    assert.strictEqual(read(s.dir, "c.md"), marked);
    assert.include(marked, "<<<<<<<");
  });

  it("reports offline and changes no local file (T8, rule 6)", async () => {
    const s = await joined();
    write(s.dir, "keep.md", "keep\n");
    g(s.dir, "remote", "set-url", "origin", "https://invalid.invalid/none.git");
    const before = files(s.dir);
    const r = await syncArea({ dir: s.dir, git: realGit });
    assert.strictEqual(r.state, "offline");
    assert.deepStrictEqual(files(s.dir), before);
    assert.strictEqual(read(s.dir, "keep.md"), "keep\n");
  });

  it("keeps an Area on disk when the remote refuses us (T9, rule 5)", async () => {
    const s = await joined();
    write(s.dir, "keep.md", "keep\n");
    NodeFS.rmSync(s.bare, { recursive: true, force: true });
    const before = files(s.dir);
    const r = await syncArea({ dir: s.dir, git: realGit });
    assert.strictEqual(r.state, "locked");
    assert.deepStrictEqual(files(s.dir), before);
    assert.strictEqual(read(s.dir, "keep.md"), "keep\n");
  });

  it("never forces, resets, cleans or deletes (T10, rules 1 and 2)", async () => {
    const calls: string[][] = [];
    const git = recorder(calls);
    const s = await conflictSetup();
    const before = files(s.dir);
    await syncArea({ dir: s.dir, git, now: () => 1 });
    // A second Area runs the push, the pull and the retry paths, which the conflict path never reaches.
    const t = await joined();
    write(t.dir, "more.md", "more\n");
    t.peerPush("x.md", "x\n");
    await syncArea({ dir: t.dir, git });
    g(t.peer, "pull");
    t.peerPush("y.md", "y\n");
    await syncArea({ dir: t.dir, git });
    assert.isTrue(calls.some((call) => call[0] === "push"));
    assert.isTrue(calls.some((call) => call[0] === "rebase"));
    const banned = [
      "--force",
      "-f",
      "--force-with-lease",
      "reset",
      "clean",
      "rm",
      "checkout",
      "stash",
      "--hard",
      "gc",
      "prune",
    ];
    for (const call of calls) {
      for (const word of banned) assert.notInclude(call, word, call.join(" "));
      assert.notStrictEqual(call[0], "branch", call.join(" "));
    }
    for (const file of before) assert.include(files(s.dir), file);
  });

  it("stops on a detached HEAD without touching files", async () => {
    const s = await joined();
    g(s.dir, "checkout", "--detach");
    write(s.dir, "d.md", "d\n");
    const r = await syncArea({ dir: s.dir, git: realGit });
    assert.strictEqual(r.state, "error");
    assert.strictEqual(read(s.dir, "d.md"), "d\n");
  });
});

describe("statusAll and syncWorkspace", () => {
  it("reports dirty, ahead and behind for Home and each Area without the network", async () => {
    const s = await joined();
    write(s.dir, "dirty.md", "d\n");
    const rows = await statusAll({ root: s.root, git: realGit });
    const sales = rows.find((r) => r.slug === "sales")!;
    assert.isTrue(sales.dirty);
    assert.strictEqual(sales.ahead, 0);
    assert.strictEqual(sales.behind, 0);
    assert.deepStrictEqual(
      rows.map((r) => r.slug),
      ["home", "sales"],
    );
    assert.isFalse(rows.find((r) => r.slug === "home")!.dirty);
  });

  it("joins an Area that an Owner added to Home in the same run", async () => {
    const s = await joined();
    makeRemote(s.base, "acme-content", { "README.md": "content\n" });
    const owner = cloneOf(s.base, "acme-home");
    write(
      owner,
      "org/areas.md",
      read(owner, "org/areas.md") +
        "| `content` | content | `acme-content` | general | shared | active |\n",
    );
    g(owner, "add", "-A");
    g(owner, "commit", "-m", "add content area");
    g(owner, "push");
    const r = await syncWorkspace({ root: s.root, git: realGit });
    assert.deepStrictEqual(r.joined.map((j) => [j.slug, j.state]).toSorted(), [
      ["content", "joined"],
      ["sales", "present"],
    ]);
    assert.strictEqual(read(s.root, "areas/content/README.md"), "content\n");
    assert.strictEqual(g(s.root, "status", "--porcelain"), "");
  });
});
