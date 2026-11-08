// @effect-diagnostics nodeBuiltinImport:off - Tests build a throwaway git repository.
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { describe, expect, it } from "vite-plus/test";
import { buildBatch } from "./batch.ts";
import { checkResolution, passes } from "./check.ts";
import { applyDeleteRule, isTestFile } from "./deleteRule.ts";
import { countTiers, estimateTokens, parseConflicts, tierOf } from "./hunks.ts";
import { buildPlan, parseMergeTree } from "./plan.ts";
import { regenPlan, uniqueCommands } from "./regen.ts";

const plain = [
  "head",
  "<<<<<<< ours",
  "const a = 1;",
  "=======",
  "const a = 2;",
  ">>>>>>> theirs",
  "tail",
].join("\n");

describe("hunk parser and tiers", () => {
  it("reads sides, positions and the text between hunks", () => {
    const { hunks, segments } = parseConflicts(plain);
    expect(hunks).toHaveLength(1);
    expect(hunks[0]).toMatchObject({
      index: 0,
      startLine: 2,
      ours: ["const a = 1;"],
      theirs: ["const a = 2;"],
      base: null,
    });
    expect(segments).toEqual([["head"], ["tail"]]);
  });

  it("reads the base side of a diff3 hunk", () => {
    const text = "<<<<<<< ours\nx\n||||||| base\nw\n=======\ny\n>>>>>>> theirs";
    expect(parseConflicts(text).hunks[0]).toMatchObject({
      ours: ["x"],
      base: ["w"],
      theirs: ["y"],
    });
  });

  it("rejects a hunk that never closes", () => {
    expect(() => parseConflicts("<<<<<<< ours\nx\n=======\ny")).toThrow(/unterminated/);
  });

  it("cuts tiers at 10, 30, 100 and 400 lines", () => {
    expect([10, 11, 30, 31, 100, 101, 400, 401].map(tierOf)).toEqual([
      "xs",
      "s",
      "s",
      "m",
      "m",
      "l",
      "l",
      "xl",
    ]);
  });

  it("counts hunks and lines per tier on a fixture", () => {
    const hunks = [
      { ours: ["a"], theirs: ["b"] },
      {
        ours: Array.from({ length: 20 }, () => "x"),
        theirs: Array.from({ length: 20 }, () => "y"),
      },
      {
        ours: Array.from({ length: 300 }, () => "x"),
        theirs: Array.from({ length: 300 }, () => "y"),
      },
    ];
    const c = countTiers(hunks);
    expect(c.hunks).toBe(3);
    expect(c.lines).toBe(642);
    expect(c.byTier.xs).toEqual({ hunks: 1, lines: 2 });
    expect(c.byTier.m).toEqual({ hunks: 1, lines: 40 });
    expect(c.byTier.xl).toEqual({ hunks: 1, lines: 600 });
    expect(estimateTokens(10)).toBe(120);
  });
});

describe("no invented lines", () => {
  const resolve = (middle: string[]) => ["head", ...middle, "tail"].join("\n");

  it("passes when the resolution takes one side", () => {
    expect(checkResolution(plain, resolve(["const a = 1;"]))).toEqual([]);
    expect(checkResolution(plain, resolve(["const a = 2;"]))).toEqual([]);
  });

  it("passes when the resolution keeps both sides in any order and ignores indentation", () => {
    expect(checkResolution(plain, resolve(["const a = 2;", "  const a = 1;"]))).toEqual([]);
  });

  it("passes a pure whitespace change", () => {
    expect(checkResolution(plain, resolve(["    const a = 1;    "]))).toEqual([]);
  });

  it("fails an invented line", () => {
    const v = checkResolution(plain, resolve(["const a = 1;", "dangerouslyRun(a);"]));
    expect(v).toEqual([{ hunk: 0, kind: "invented", line: "dangerouslyRun(a);" }]);
    expect(passes(v)).toBe(false);
  });

  it("calls a new line built only from known tokens 'combined' and passes it only on request", () => {
    const v = checkResolution(plain, resolve(["const a = a;"]));
    expect(v).toEqual([{ hunk: 0, kind: "combined", line: "const a = a;" }]);
    expect(passes(v)).toBe(false);
    expect(passes(v, true)).toBe(true);
    // An unknown name is never accepted, even with allowCombined.
    expect(passes(checkResolution(plain, resolve(["const b = 1;"])), true)).toBe(false);
  });

  it("fails when text outside the hunks changed or the hunk markers stay", () => {
    expect(
      checkResolution(plain, ["head CHANGED", "const a = 1;", "tail"].join("\n"))[0]!.kind,
    ).toBe("context-changed");
    expect(checkResolution(plain, plain)[0]!.kind).toBe("context-changed");
  });

  it("handles two hunks that touch each other as one group", () => {
    const two = "<<<<<<< o\nA\n=======\nB\n>>>>>>> t\n<<<<<<< o\nC\n=======\nD\n>>>>>>> t";
    expect(checkResolution(two, "B\nC")).toEqual([]);
    expect(checkResolution(two, "B\nZ")[0]!.line).toBe("Z");
  });

  it("matches blank-line separators between several hunks", () => {
    const three =
      "<<<<<<< o\nA\n=======\nB\n>>>>>>> t\n\n<<<<<<< o\nC\n=======\nD\n>>>>>>> t\n\nend";
    expect(checkResolution(three, "A\n\nD\n\nend")).toEqual([]);
    expect(checkResolution(three, "A\n\nQ\n\nend")[0]!.hunk).toBe(1);
  });
});

describe("merge-tree plan", () => {
  const output = [
    "abc123",
    "src/a.ts",
    "src/gone.test.ts",
    "src/new.ts",
    "",
    "Auto-merging src/a.ts",
    "CONFLICT (content): Merge conflict in src/a.ts",
    "CONFLICT (modify/delete): src/gone.test.ts deleted in upstream/main and modified in origin/main.  Version origin/main of src/gone.test.ts left in tree.",
    "CONFLICT (add/add): Merge conflict in src/new.ts",
  ].join("\n");

  it("reads files, kinds and the deleting side", () => {
    const r = parseMergeTree(output);
    expect(r.tree).toBe("abc123");
    expect(r.kinds.get("src/a.ts")).toBe("content");
    expect(r.kinds.get("src/gone.test.ts")).toBe("modify/delete");
    expect(r.kinds.get("src/new.ts")).toBe("add/add");
    expect(r.deletedBy.get("src/gone.test.ts")).toBe("upstream/main");
  });

  it("counts tiers from the merged blobs and skips delete conflicts", () => {
    const plan = buildPlan(parseMergeTree(output), (p) => (p === "src/a.ts" ? plain : null));
    expect(plan.byKind).toEqual({ content: 1, "modify/delete": 1, "add/add": 1 });
    expect(plan.totals.hunks).toBe(1);
    expect(plan.totals.byTier.xs.hunks).toBe(1);
    expect(plan.estimatedReadTokens).toBe(24);
  });
});

describe("batch prompt", () => {
  it("includes only small hunks, with limited context", () => {
    const big = Array.from({ length: 60 }, () => "x").join("\n");
    const text = [
      ...Array.from({ length: 30 }, (_, i) => `before ${i}`),
      "<<<<<<< o",
      "small ours",
      "=======",
      "small theirs",
      ">>>>>>> t",
      "<<<<<<< o",
      big,
      "=======",
      big,
      ">>>>>>> t",
    ].join("\n");
    const batch = buildBatch("src/x.ts", text, 5)!;
    expect(batch.hunks).toEqual([0]);
    expect(batch.prompt).toContain("small ours");
    expect(batch.prompt).toContain("before 29");
    expect(batch.prompt).not.toContain("before 20");
    expect(batch.prompt).toContain("Do not write a new line");
    expect(batch.estimatedTokens).toBeGreaterThan(0);
  });

  it("returns null when every hunk is large", () => {
    const big = Array.from({ length: 40 }, () => "x").join("\n");
    expect(buildBatch("a.ts", `<<<<<<< o\n${big}\n=======\n${big}\n>>>>>>> t`)).toBeNull();
  });
});

describe("regeneration plan", () => {
  it("picks the lockfile and route tree, skips vendored mirrors and dedupes commands", () => {
    const steps = regenPlan([
      "pnpm-lock.yaml",
      "apps/web/src/routeTree.gen.ts",
      ".repos/x/routeTree.gen.ts",
      "apps/web/src/a.ts",
      "apps/mobile/pnpm-lock.yaml",
    ]);
    expect(steps.map((s) => s.path)).toEqual([
      "pnpm-lock.yaml",
      "apps/web/src/routeTree.gen.ts",
      "apps/mobile/pnpm-lock.yaml",
    ]);
    expect(uniqueCommands(steps)).toHaveLength(2);
  });
});

describe("delete rule", () => {
  const sh = (cwd: string, ...args: string[]) =>
    NodeChildProcess.execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });

  it("recognises test files", () => {
    expect(isTestFile("apps/web/src/a.test.tsx")).toBe(true);
    expect(isTestFile("apps/web/src/__tests__/a.ts")).toBe(true);
    expect(isTestFile("apps/web/src/a.tsx")).toBe(false);
  });

  it("removes a test T3 Code deleted and leaves the source file for a decision", () => {
    const dir = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "catchup-delete-"));
    try {
      sh(dir, "init", "-q", "-b", "main");
      sh(dir, "config", "user.email", "t@example.com");
      sh(dir, "config", "user.name", "t");
      NodeFS.mkdirSync(NodePath.join(dir, "src"));
      NodeFS.writeFileSync(NodePath.join(dir, "src/panel.ts"), "export const a = 1;\n");
      NodeFS.writeFileSync(NodePath.join(dir, "src/panel.test.ts"), "test('a', () => {});\n");
      sh(dir, "add", "-A");
      sh(dir, "commit", "-q", "-m", "base");
      sh(dir, "checkout", "-q", "-b", "upstream");
      sh(dir, "rm", "-q", "src/panel.ts", "src/panel.test.ts");
      sh(dir, "commit", "-q", "-m", "upstream deletes");
      sh(dir, "checkout", "-q", "main");
      NodeFS.writeFileSync(NodePath.join(dir, "src/panel.ts"), "export const a = 2;\n");
      NodeFS.writeFileSync(NodePath.join(dir, "src/panel.test.ts"), "test('a2', () => {});\n");
      sh(dir, "commit", "-q", "-am", "ours edits");
      expect(() => sh(dir, "merge", "upstream")).toThrow();

      const dry = applyDeleteRule(dir, true);
      expect(dry.removed).toEqual(["src/panel.test.ts"]);
      expect(NodeFS.existsSync(NodePath.join(dir, "src/panel.test.ts"))).toBe(true);

      const done = applyDeleteRule(dir);
      expect(done.removed).toEqual(["src/panel.test.ts"]);
      expect(done.needDecision).toEqual(["src/panel.ts"]);
      expect(NodeFS.existsSync(NodePath.join(dir, "src/panel.test.ts"))).toBe(false);
      expect(NodeFS.existsSync(NodePath.join(dir, "src/panel.ts"))).toBe(true);
    } finally {
      NodeFS.rmSync(dir, { recursive: true, force: true });
    }
  });
});
