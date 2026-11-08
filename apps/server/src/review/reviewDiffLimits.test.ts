import type { ReviewDiffPreviewResult } from "@t3tools/contracts";
import { describe, expect, it } from "@effect/vitest";

import { capPreview, isRepositoryPath, MAX_DIFF_CHARS } from "./reviewDiffLimits.ts";

const preview = (sources: ReadonlyArray<unknown>) =>
  ({ cwd: "/repo", generatedAt: "x", sources }) as unknown as ReviewDiffPreviewResult;
const source = (diff: string, truncated = false) => ({
  id: "s",
  kind: "working-tree",
  title: "Changes",
  baseRef: null,
  headRef: null,
  diff,
  diffHash: "h",
  truncated,
});

describe("capPreview", () => {
  it("returns no sources for an empty diff", () => {
    expect(capPreview(preview([])).sources).toEqual([]);
  });

  it("cuts an over-size diff and flags it", () => {
    const [capped] = capPreview(preview([source("x".repeat(MAX_DIFF_CHARS + 5))])).sources;
    expect(capped?.diff.length).toBe(MAX_DIFF_CHARS);
    expect(capped?.truncated).toBe(true);
  });

  it("keeps the server's own truncated flag", () => {
    expect(capPreview(preview([source("small", true)])).sources[0]?.truncated).toBe(true);
  });
});

describe("isRepositoryPath", () => {
  it("accepts a path inside the repository", () => {
    expect(isRepositoryPath("apps/server/src/a.ts")).toBe(true);
  });
  it("rejects a path that leaves it", () => {
    for (const bad of ["../x", "a/../../x", "/etc/passwd", "C:\\x", "\\x", "", "a//b"])
      expect(isRepositoryPath(bad)).toBe(false);
  });
});
