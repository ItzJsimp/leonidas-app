import { assert, describe, it } from "@effect/vitest";

import { classify } from "./classify.ts";
import { matchesAny } from "./match.ts";
import { msg, testPack } from "./testkit.ts";

describe("matchesAny", () => {
  it("ignores case and needs whole words", () => {
    assert.isTrue(matchesAny("Please sign the SOW today", ["sow"]));
    assert.isFalse(matchesAny("The show must go on", ["sow"]));
    assert.isFalse(matchesAny("gifted creators", ["gift"]));
  });

  it("treats a trailing star as starts-with", () => {
    assert.isTrue(matchesAny("affiliate commissions apply", ["commission*"]));
    assert.isFalse(matchesAny("no match here", ["commission*"]));
  });

  it("matches phrases across any whitespace", () => {
    assert.isTrue(matchesAny("Statement\n  of   Work attached", ["statement of work"]));
  });

  it("treats regex characters as plain text", () => {
    assert.isFalse(matchesAny("axb", ["a.b"]));
    assert.isTrue(matchesAny("a.b", ["a.b"]));
    assert.isTrue(matchesAny("hiring c++ dev", ["c++"]));
    assert.isFalse(matchesAny("anything", ["(.*)+$"]));
  });

  it("treats underscore and punctuation as word breaks", () => {
    assert.isTrue(matchesAny("Agreement_v2.pdf", ["agreement"]));
    assert.isTrue(matchesAny("no-reply@tiktok.com", ["no-reply"]));
  });

  it("rejects an empty keyword", () => {
    assert.throws(() => matchesAny("x", ["  "]));
    assert.throws(() => matchesAny("x", ["*"]));
  });

  it("keeps matching correctly after the regex cache fills and resets", () => {
    for (let i = 0; i < 6000; i++) matchesAny("x", [`word${i}`]);
    assert.isTrue(matchesAny("see word5999 here", ["word5999"]));
    assert.isFalse(matchesAny("see word5999 here", ["word5998"]));
  });

  it("stays fast on a 1 MB text", () => {
    const big = "word ".repeat(200_000);
    const t = performance.now();
    assert.isFalse(matchesAny(big, ["statement of work", "a b c", "zzz*"]));
    assert.isBelow(performance.now() - t, 1000);
  });
});

describe("classify", () => {
  it("places mail by the first matching rule", () => {
    const d = classify(msg({ subject: "Contract and budget" }), testPack);
    assert.strictEqual(d.bucket, "contract");
    assert.strictEqual(d.ruleId, "contract");
    assert.match(d.reason, /contract/);
  });

  it("reads the snippet as well as the subject", () => {
    assert.strictEqual(classify(msg({ snippet: "what are your rates?" }), testPack).bucket, "paid");
  });

  it("matches sender, attachment and unsubscribe conditions", () => {
    assert.strictEqual(classify(msg({ fromAddress: "no-reply@x.test" }), testPack).bucket, "noise");
    assert.strictEqual(
      classify(msg({ attachmentNames: ["Agreement_v2.pdf"] }), testPack).bucket,
      "contract",
    );
    assert.strictEqual(classify(msg({ listUnsubscribe: true }), testPack).bucket, "noise");
  });

  it("places a thread the owner already replied in, after contract rules", () => {
    assert.strictEqual(classify(msg({ ownRepliedInThread: true }), testPack).bucket, "existing");
    const d = classify(msg({ ownRepliedInThread: true, subject: "Contract v2" }), testPack);
    assert.strictEqual(d.bucket, "contract");
  });

  it("sends unplaced mail to review with no rule id", () => {
    const d = classify(msg({ subject: "Are you around tomorrow?" }), testPack);
    assert.deepEqual([d.bucket, d.ruleId], ["review", null]);
  });

  it("skips own mail and already-labelled mail", () => {
    assert.isNull(classify(msg({ isOwn: true, subject: "contract" }), testPack).bucket);
    assert.isNull(classify(msg({ labels: ["T/Paid"], subject: "contract" }), testPack).bucket);
    assert.isNull(classify(msg({ labels: ["T/Needs-Review"] }), testPack).bucket);
  });
});
