import { assert, describe, it } from "@effect/vitest";

import { classify } from "./classify.ts";
import { firstName, renderDraft, replySubject } from "./draft.ts";
import { parsePack } from "./pack.ts";
import { plan } from "./plan.ts";
import { msg, testPack } from "./testkit.ts";
import {
  ACTION_TYPES,
  AUTONOMY_TIERS,
  type Action,
  type AutonomyTier,
  type Pack,
} from "./types.ts";

const run = (over: Parameters<typeof msg>[0], tier: AutonomyTier, pack: Pack = testPack) => {
  const m = msg(over);
  return plan(m, classify(m, pack), pack, tier);
};
const types = (actions: readonly Action[]) => actions.map((a) => a.type);

describe("plan by tier", () => {
  const noise = { fromAddress: "noreply@x.test" };
  const paid = { subject: "Your rates?" };

  it("tier 0 only labels", () => {
    assert.deepEqual(types(run(noise, 0)), ["label"]);
    assert.deepEqual(types(run(paid, 0)), ["label"]);
  });

  it("tier 1 adds archive for archive buckets", () => {
    assert.deepEqual(types(run(noise, 1)), ["label", "archive"]);
    assert.deepEqual(types(run(paid, 1)), ["label"]);
  });

  it("tier 2 and above add a draft where the pack has a template", () => {
    for (const tier of [2, 3, 4] as const) {
      assert.deepEqual(types(run(paid, tier)), ["label", "draft"]);
      assert.deepEqual(types(run(noise, tier)), ["label", "archive"]);
    }
  });

  it("never returns a type outside the closed list, at any tier", () => {
    const subjects = ["contract", "rates", "gift", "hello", ""];
    for (const tier of AUTONOMY_TIERS) {
      for (const subject of subjects) {
        for (const a of run({ subject, fromAddress: "no-reply@x.test" }, tier)) {
          assert.include(ACTION_TYPES as readonly string[], a.type);
        }
      }
    }
  });

  it("applies the pack labels", () => {
    assert.deepEqual(run(paid, 0)[0], { type: "label", labels: ["T/Paid", "T/Needs-Reply"] });
  });

  it("treats a tier that is not 0 to 4 as tier 0, so bad stored settings never draft or archive", () => {
    const bad = [5, -1, 2.5, Number.NaN, "2", null, undefined] as unknown as AutonomyTier[];
    for (const tier of bad) {
      assert.deepEqual(types(run({ fromAddress: "noreply@x.test" }, tier)), ["label"]);
      assert.deepEqual(types(run({ subject: "Your rates?" }, tier)), ["label"]);
    }
  });

  it("returns nothing for skipped mail", () => {
    assert.deepEqual(run({ isOwn: true, subject: "rates" }, 4), []);
  });

  it("flags unplaced mail for review at every tier", () => {
    for (const tier of AUTONOMY_TIERS) {
      assert.deepEqual(types(run({ subject: "hi there" }, tier)), ["label", "needsReview"]);
    }
  });
});

describe("safety rules", () => {
  const contract = { subject: "Please sign the contract" };

  it("always shows an alwaysSurface bucket and never drafts or archives it", () => {
    for (const tier of AUTONOMY_TIERS) {
      const t = types(run(contract, tier));
      assert.deepEqual(t, ["label", "surface"]);
    }
  });

  it("holds even when a pack was not validated and asks for the unsafe thing", () => {
    const bad: Pack = {
      ...testPack,
      archive: ["contract", "noise"],
      drafts: { ...testPack.drafts, contract: { body: "Hi {{firstName}}" } },
    };
    for (const tier of AUTONOMY_TIERS) {
      assert.deepEqual(types(run(contract, tier, bad)), ["label", "surface"]);
    }
  });

  it("puts only the pack reason in a surface action, never mail text", () => {
    const [, surface] = run({ subject: "contract SECRET-TOKEN-123" }, 2);
    assert.strictEqual(surface?.type, "surface");
    assert.notMatch(JSON.stringify(surface), /SECRET/);
  });
});

describe("odd bucket names", () => {
  it("does not read inherited object members as labels or drafts", () => {
    const pack = parsePack({
      id: "odd",
      name: "Odd",
      rules: [{ id: "r", bucket: "toString", match: { keywords: ["hello"] } }],
      labels: { toString: ["O/Odd"], review: ["O/Review"] },
      drafts: {},
      neverDraft: [],
      alwaysSurface: [],
      archive: [],
    });
    const m = msg({ subject: "hello there" });
    const actions = plan(m, classify(m, pack), pack, 2);
    assert.deepEqual(types(actions), ["label"]);
    const other = msg({ subject: "nothing" });
    const toReview = plan(other, { bucket: "constructor", ruleId: null, reason: "x" }, pack, 2);
    assert.deepEqual(toReview, []);
  });
});

describe("draft text", () => {
  const paid = { subject: "Your rates?", snippet: "SNIPPET-SECRET", fromName: "Ana Ruiz" };
  const draftOf = (over: Parameters<typeof msg>[0]) =>
    run(over, 2).find((a) => a.type === "draft") as Extract<Action, { type: "draft" }>;

  it("uses the template with the first name and a Re: subject", () => {
    const d = draftOf(paid);
    assert.strictEqual(d.subject, "Re: Your rates?");
    assert.isTrue(d.body.startsWith("Hi Ana,"));
  });

  it("uses no mail text except first name and subject", () => {
    assert.notMatch(draftOf(paid).body, /SNIPPET-SECRET/);
  });

  it("cannot be turned into an extra header by the subject", () => {
    const d = draftOf({ subject: "rates\r\nBcc: evil@x.test\u2028X-Y: 1" });
    assert.notMatch(d.subject, /[\r\n\u2028\u2029]/);
    assert.strictEqual(d.subject, "Re: rates Bcc: evil@x.test X-Y: 1");
  });

  it("turns every control and format character in a subject into a space", () => {
    const c = String.fromCharCode;
    const dirty = `a${c(0x85)}b${c(0)}c${c(0x202e)}d${c(0x200b)}e${c(0x1b)}f`;
    assert.strictEqual(replySubject(dirty), "Re: a b c d e f");
  });

  it("keeps an existing Re: and caps a very long subject", () => {
    assert.strictEqual(replySubject("RE: rates"), "RE: rates");
    assert.isAtMost(replySubject("rates " + "x".repeat(5000)).length, 204);
    assert.strictEqual(replySubject(" \r\n "), "Re: (no subject)");
  });

  it("takes letters only for the first name and falls back to there", () => {
    assert.strictEqual(firstName('"Ana Ruiz"'), "Ana");
    assert.strictEqual(firstName("Jean-Luc Picard"), "Jean-Luc");
    assert.strictEqual(firstName(""), "there");
    assert.strictEqual(firstName("ana@x.test"), "there");
    assert.strictEqual(firstName("<script>alert(1)</script>"), "there");
    assert.strictEqual(firstName("\u{1F600} Bob"), "there");
  });

  it("does not treat dollar patterns in a name as replacement codes", () => {
    assert.strictEqual(renderDraft({ body: "Hi {{firstName}}" }, "$&"), "Hi $&");
  });
});
