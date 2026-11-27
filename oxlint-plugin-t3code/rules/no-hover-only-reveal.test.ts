import { assert, describe } from "@effect/vitest";

import { createOxlintRuleHarness } from "../test/utils.ts";

const rule = createOxlintRuleHarness("t3code/no-hover-only-reveal", {
  filename: "fixture.tsx",
});

describe("t3code/no-hover-only-reveal", () => {
  rule.valid(
    "allows a hover reveal with a touch fallback",
    `const el = <span className="opacity-0 pointer-coarse:opacity-100 group-hover:opacity-100" />;`,
  );

  rule.valid(
    "allows a phone-width fallback",
    `const el = <span className="opacity-0 group-hover/comment:opacity-100 max-sm:opacity-100" />;`,
  );

  rule.valid(
    "allows group hover that does not hide the control",
    `const el = <span className="opacity-40 group-hover:opacity-100" />;`,
  );

  rule.valid("allows a plain hidden element", `const el = <span className="opacity-0" />;`);

  rule.invalid(
    "reports a hover-only reveal",
    `const el = <span className="opacity-0 transition-opacity group-hover:opacity-100" />;`,
    (output) => {
      assert.match(output, /pointer-coarse:opacity-100/);
    },
  );

  rule.invalid(
    "reports a named group hover-only reveal in cn()",
    `const c = cn("pointer-events-none opacity-0 group-hover/pr-row:opacity-100");`,
  );

  rule.invalid(
    "reports a hover-only reveal in a template literal",
    "const c = `absolute ${x} opacity-0 group-hover:opacity-100`;",
  );
});
