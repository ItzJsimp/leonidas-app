import { assert, describe, it } from "@effect/vitest";

import { classify } from "./classify.ts";
import { plan } from "./plan.ts";
import { msg, testPack } from "./testkit.ts";
import type { Pack } from "./types.ts";

/** 30 made-up rules of 4 keywords each, plus a sender and an attachment condition. Mail below matches none, so every rule runs. */
const bigPack: Pack = {
  ...testPack,
  rules: Array.from({ length: 30 }, (_, i) => ({
    id: `r${i}`,
    bucket: "noise",
    match: {
      keywords: [`alpha${i}`, `beta${i} gamma${i}`, `delta${i}*`, `epsilon${i}`],
      fromKeywords: [`sender${i}`],
      attachmentKeywords: [`file${i}`],
    },
  })),
};

describe("performance", () => {
  it("classifies and plans 1,000 messages through 30 rules in under 200 ms", () => {
    const messages = Array.from({ length: 1000 }, (_, i) =>
      msg({
        id: `m${i}`,
        subject: `Subject number ${i} about nothing in particular`,
        snippet: "A snippet of ordinary words that should not match any rule at all. ".repeat(4),
        attachmentNames: ["photo.png"],
      }),
    );
    // Warm-up: the first pass compiles each keyword once and warms the JIT (about 136 ms cold on the dev PC).
    for (const m of messages.slice(0, 20)) classify(m, bigPack);
    const t = performance.now();
    let reviews = 0;
    for (const m of messages) {
      const d = classify(m, bigPack);
      if (plan(m, d, bigPack, 2).length > 0) reviews += 1;
    }
    const ms = performance.now() - t;
    assert.strictEqual(reviews, 1000);
    assert.isBelow(ms, 200);
  });
});
