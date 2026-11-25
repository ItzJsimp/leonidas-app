import { assert, describe, it } from "@effect/vitest";
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";

import { createOxlintRuleHarness } from "../test/utils.ts";
import { typedDesignValues } from "./designValues.ts";
import baseline from "./designValuesBaseline.json" with { type: "json" };

const rule = createOxlintRuleHarness("t3code/no-typed-design-values", {
  filename: "fixture.tsx",
});

/** The old cases on 2026-11-24. Lower this number when you remove one. Never raise it. */
const BASELINE_CEILING = 116;

describe("t3code/no-typed-design-values", () => {
  rule.valid(
    "allows token classes and token references",
    `const c = "duration-micro duration-entrance duration-0 duration-(--speed) duration-[var(--speed)] text-2xs text-[length:var(--size)] text-[#fff]";`,
  );
  rule.valid(
    "allows CSS properties that only contain the word",
    `const c = "[animation-duration:2s] var(--transition-duration-150)";`,
  );
  rule.invalid("reports a typed duration", `const c = "transition-colors hover:duration-200";`);
  rule.invalid("reports an arbitrary duration", `const c = "duration-[320ms]";`);
  rule.invalid("reports a typed text size", `const c = "sm:text-[13px]";`);

  it("keeps the baseline equal to the code, so that it only shrinks", () => {
    const root = NodePath.resolve(NodePath.dirname(NodeURL.fileURLToPath(import.meta.url)), "../..");
    const sources = NodeFS.readdirSync(NodePath.join(root, "apps/web/src"), {
      recursive: true,
      encoding: "utf8",
    });
    const actual: Record<string, number> = {};
    for (const entry of sources.toSorted()) {
      const file = `apps/web/src/${entry.replaceAll("\\", "/")}`;
      if (!/\.tsx?$/u.test(file) || /\.(?:test|spec)\.tsx?$/u.test(file)) continue;
      const count = typedDesignValues(NodeFS.readFileSync(NodePath.join(root, file), "utf8")).length;
      if (count > 0) actual[file] = count;
    }
    assert.deepStrictEqual(
      actual,
      baseline,
      "Update designValuesBaseline.json. Counts may only fall.",
    );
    const total = Object.values(actual).reduce((sum, count) => sum + count, 0);
    assert.isAtMost(total, BASELINE_CEILING);
  });
});
