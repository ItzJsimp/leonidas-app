import { assert, describe, it } from "@effect/vitest";

import { PackError, parsePack, parsePackJson } from "./pack.ts";
import { testPack } from "./testkit.ts";

const clone = (): Record<string, any> => JSON.parse(JSON.stringify(testPack));
const rejects = (mutate: (p: Record<string, any>) => void, pattern: RegExp) => {
  const p = clone();
  mutate(p);
  assert.throws(() => parsePack(p), pattern);
};

describe("parsePackJson", () => {
  it("parses pack text, with or without a byte order mark", () => {
    assert.deepEqual(parsePackJson(JSON.stringify(testPack)), testPack);
    assert.deepEqual(parsePackJson(`﻿${JSON.stringify(testPack)}`), testPack);
  });

  it("turns bad JSON, an oversized file and a bad pack into PackError", () => {
    assert.throws(() => parsePackJson("{nope"), PackError);
    assert.throws(() => parsePackJson(" ".repeat(1_100_000)), /too large/);
    assert.throws(() => parsePackJson("[]"), PackError);
  });

  it("does not let a __proto__ key through", () => {
    const text = JSON.stringify(testPack).replace("{", '{"__proto__":{"x":1},');
    assert.throws(() => parsePackJson(text), /__proto__/);
  });
});

describe("parsePack", () => {
  it("accepts a valid pack and returns it unchanged", () => {
    assert.deepEqual(parsePack(clone()), testPack);
  });

  it("rejects input that is not an object", () => {
    assert.throws(() => parsePack(null), /pack/);
    assert.throws(() => parsePack("x"), /pack/);
  });

  it("rejects missing or wrong-typed fields", () => {
    rejects((p) => delete p.id, /id/);
    rejects((p) => (p.name = 5), /name/);
    rejects((p) => (p.rules = []), /rules/);
    rejects((p) => (p.neverDraft = "contract"), /neverDraft/);
  });

  it("rejects unknown keys, including a raw regex or a send flag", () => {
    rejects((p) => (p.rules[0].match.regex = ".*"), /regex/);
    rejects((p) => (p.rules[0].pattern = "(a+)+$"), /pattern/);
    rejects((p) => (p.autoSend = true), /autoSend/);
  });

  it("rejects duplicate rule ids", () => {
    rejects((p) => (p.rules[1].id = p.rules[0].id), /duplicate/);
  });

  it("rejects a rule with no condition or an empty keyword", () => {
    rejects((p) => (p.rules[0].match = {}), /condition/);
    rejects((p) => (p.rules[0].match.keywords = [" "]), /keywords/);
    rejects((p) => (p.rules[0].match.keywords = ["*"]), /keyword/);
  });

  it("rejects a non-boolean ownRepliedInThread", () => {
    rejects((p) => (p.rules[1].match.ownRepliedInThread = "yes"), /ownRepliedInThread/);
  });

  it("reserves the review bucket", () => {
    rejects((p) => (p.rules[0].bucket = "review"), /review/);
  });

  it("needs labels for every bucket and for review", () => {
    rejects((p) => delete p.labels.paid, /labels/);
    rejects((p) => delete p.labels.review, /review/);
  });

  it("rejects bucket lists that name an unknown bucket", () => {
    rejects((p) => p.neverDraft.push("ghost"), /ghost/);
    rejects((p) => p.alwaysSurface.push("ghost"), /ghost/);
    rejects((p) => p.archive.push("ghost"), /ghost/);
    rejects((p) => (p.drafts.ghost = { body: "x" }), /ghost/);
  });

  it("never lets a bucket be both archived and always shown", () => {
    rejects((p) => p.archive.push("contract"), /archive/);
  });

  it("never lets a neverDraft bucket have a draft template", () => {
    rejects((p) => (p.drafts.contract = { body: "Hi" }), /neverDraft/);
  });

  it("allows only the firstName placeholder in drafts", () => {
    rejects((p) => (p.drafts.paid.body = "Hi {{secret}}"), /placeholder/);
  });
});
