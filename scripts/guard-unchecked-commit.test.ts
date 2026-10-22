import { describe, expect, it } from "vitest";

// @ts-expect-error The guard is a plain .mjs script with no type declarations.
import { findBlockedFiles } from "./guard-unchecked-commit.mjs";

const staged = ["apps/server/src/ws.ts", "README.md", "apps/web/src/App.tsx"];

describe("findBlockedFiles", () => {
  it("warns on staged TypeScript when there is no local vp", () => {
    expect(
      findBlockedFiles({ stagedFiles: staged, hasLocalVp: false, allowOverride: false }),
    ).toEqual(["apps/server/src/ws.ts", "apps/web/src/App.tsx"]);
  });

  it("lets a docs-only commit through", () => {
    expect(
      findBlockedFiles({ stagedFiles: ["README.md"], hasLocalVp: false, allowOverride: false }),
    ).toEqual([]);
  });

  it("lets anything through when vp exists or the override is set", () => {
    expect(
      findBlockedFiles({ stagedFiles: staged, hasLocalVp: true, allowOverride: false }),
    ).toEqual([]);
    expect(
      findBlockedFiles({ stagedFiles: staged, hasLocalVp: false, allowOverride: true }),
    ).toEqual([]);
  });
});
