// @effect-diagnostics nodeBuiltinImport:off - the test reads this package's own source files from disk.
import * as NodeFS from "node:fs";

import { assert, describe, it } from "@effect/vitest";

import type { Action, AutonomyTier } from "./types.ts";
import { ACTION_TYPES, AUTONOMY_TIERS } from "./types.ts";

describe("Action", () => {
  it("has no send member (type level)", () => {
    // @ts-expect-error send is not an Action
    const sendAction: Action = { type: "send" };
    assert.isDefined(sendAction);
  });

  it("lists the five allowed action types", () => {
    assert.deepEqual([...ACTION_TYPES], ["label", "archive", "draft", "surface", "needsReview"]);
  });

  it("keeps the word send out of every source file but tests", () => {
    const dir = new URL(".", import.meta.url);
    const files = NodeFS.readdirSync(dir, { recursive: true, encoding: "utf8" }).filter(
      (f) => f.endsWith(".ts") && !f.endsWith(".test.ts"),
    );
    assert.isAbove(files.length, 0);
    for (const f of files) {
      const text = NodeFS.readFileSync(new URL(f, dir), "utf8");
      assert.notMatch(text, /["'`]send["'`]/i, `${f} names a send action`);
    }
  });
});

describe("AutonomyTier", () => {
  it("runs from 0 to 4", () => {
    const tiers: AutonomyTier[] = [0, 1, 2, 3, 4];
    assert.deepEqual([...AUTONOMY_TIERS], tiers);
  });
});
