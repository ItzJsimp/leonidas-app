import { assert, describe } from "@effect/vitest";

import { createOxlintRuleHarness } from "../test/utils.ts";

const rule = createOxlintRuleHarness("t3code/require-group-keyboard", {
  filename: "fixture.tsx",
});

describe("t3code/require-group-keyboard", () => {
  rule.valid(
    "allows a group with the shared helper",
    `const el = <div role="radiogroup" ref={rovingGroup} />;`,
  );

  rule.valid(
    "allows a group with its own key handler",
    `const el = <div role="tablist" onKeyDown={onKey} />;`,
  );

  rule.valid("allows other roles", `const el = <div role="group" />;`);

  rule.valid("allows custom components", `const el = <Menu role="toolbar" />;`);

  rule.invalid(
    "reports a radio group with no keyboard support",
    `const el = <div role="radiogroup" aria-label="Color" />;`,
    (output) => {
      assert.match(output, /ref=\{rovingGroup\}/);
    },
  );

  rule.invalid(
    "reports a tab list with another ref",
    `const el = <div role="tablist" ref={ref} />;`,
  );
});
