import { describe, expect, it } from "@effect/vitest";

// @ts-expect-error The guard is a plain .mjs script with no type declarations.
import { findViolations } from "./guard-staged-policy.mjs";

const BS = String.fromCharCode(92);
const EM_DASH = String.fromCharCode(0x2014);

const diff = (file: string, ...added: string[]) =>
  `+++ b/${file}\n@@ -0,0 +1,${added.length} @@\n${added.map((l) => `+${l}`).join("\n")}`;

describe("findViolations", () => {
  it("flags a secret-shaped token with its file and line", () => {
    const token = "sk-" + "a".repeat(24);
    expect(findViolations(diff("apps/x.ts", "const ok = 1;", `const k = "${token}";`))).toEqual([
      { file: "apps/x.ts", line: 2, rule: "secret" },
    ]);
  });

  it("flags a personal path, an em dash and an assigned origin", () => {
    const rules = findViolations(
      diff(
        "docs/a.md",
        `see C:${BS}Users${BS}Jacob${BS}notes`,
        `a ${EM_DASH} b`,
        "VITE_WS_URL=ws://x",
      ),
    ).map((v: { rule: string }) => v.rule);
    expect(rules).toEqual(["personal path", "em dash", "baked-in origin"]);
  });

  it("lets plain text, a generic Windows path and a doc mention through", () => {
    expect(
      findViolations(
        diff(
          "a.ts",
          `const p = "C:${BS}Users${BS}test${BS}x";`,
          "Do not set VITE_HTTP_URL for dev.",
        ),
      ),
    ).toEqual([]);
  });

  it("ignores removed lines and exempt files", () => {
    const token = "ghp_" + "b".repeat(32);
    expect(findViolations(`+++ b/a.ts\n@@ -1 +0,0 @@\n-${token}`)).toEqual([]);
    expect(findViolations(diff("CONSTRAINTS.md", `x ${token}`))).toEqual([]);
  });
});
