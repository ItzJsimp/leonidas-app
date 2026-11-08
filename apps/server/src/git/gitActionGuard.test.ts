import { describe, expect, it } from "@effect/vitest";

import { gitActionRefusal, type GitActionFacts } from "./gitActionGuard.ts";

const ok: GitActionFacts = {
  worktreePath: "C:/lcw/task",
  threadBranch: "task/x",
  isRepo: true,
  currentBranch: "task/x",
  isDefaultBranch: false,
};

describe("gitActionRefusal", () => {
  it("allows the thread's own branch in its own worktree", () => {
    expect(gitActionRefusal(ok)).toBeNull();
  });

  it("refuses a push from a default or protected branch, so main never ships from this tool", () => {
    expect(gitActionRefusal({ ...ok, currentBranch: "main", threadBranch: "main" })).toContain(
      "protected",
    );
    expect(gitActionRefusal({ ...ok, isDefaultBranch: true })).toContain("protected");
  });

  it("refuses a branch that is not the thread branch, and a thread with no branch", () => {
    expect(gitActionRefusal({ ...ok, currentBranch: "other" })).toContain("not this thread");
    expect(gitActionRefusal({ ...ok, threadBranch: null })).toContain("not this thread");
  });

  it("refuses the project folder, a non-repository and a detached head", () => {
    expect(gitActionRefusal({ ...ok, worktreePath: null })).toContain("worktree");
    expect(gitActionRefusal({ ...ok, isRepo: false })).toContain("not a git repository");
    expect(gitActionRefusal({ ...ok, currentBranch: null })).toContain("detached");
  });
});
