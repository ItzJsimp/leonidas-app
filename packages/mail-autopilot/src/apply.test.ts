import { assert, describe, it } from "@effect/vitest";

import { MemoryActionLog, parseLog, serializeEntry, type ActionLogEntry } from "./actionLog.ts";
import { applyActions, type ApplyDeps } from "./apply.ts";
import { FakeMailProvider } from "./fakeProvider.ts";
import { ProviderError } from "./provider.ts";
import { msg } from "./testkit.ts";
import type { Action } from "./types.ts";

const setup = () => {
  const provider = new FakeMailProvider();
  const log = new MemoryActionLog();
  let n = 0;
  const deps: ApplyDeps = {
    provider,
    log,
    inbox: "sg",
    now: () => "2026-10-21T12:00:00.000Z",
    newId: () => `e${++n}`,
  };
  return { provider, log, deps };
};

const inboxMsg = (over: Parameters<typeof msg>[0] = {}) =>
  msg({ labels: ["INBOX"], fromAddress: "sam@example.test", ...over });

const plan3: Action[] = [
  { type: "label", labels: ["SG/Pitch"] },
  { type: "archive" },
  { type: "draft", subject: "Re: Hello", body: "Thanks Sam" },
];

describe("applyActions", () => {
  it("labels, archives and drafts, and logs intent then outcome for each", async () => {
    const { provider, log, deps } = setup();
    const m = inboxMsg();
    provider.seed([m]);
    const results = await applyActions(deps, m, plan3);
    assert.deepEqual(
      results.map((r) => r.outcome),
      ["applied", "applied", "applied"],
    );
    assert.deepEqual([...(await provider.getMessage("m1")).labels], ["SG/Pitch"]);
    const entries = await log.readAll();
    assert.deepEqual(
      entries.map((e) => e.status),
      ["intent", "applied", "intent", "applied", "intent", "applied"],
    );
    const draft = entries.find((e) => e.status === "applied" && e.inverse?.type === "deleteDraft");
    assert.isDefined(draft);
    const got = await provider.getDraft((draft!.inverse as { draftId: string }).draftId);
    assert.equal(got?.to, "sam@example.test");
    assert.equal(got?.threadId, "t1");
  });

  it("running twice leaves one live draft and the same mailbox", async () => {
    const { provider, log, deps } = setup();
    const m = inboxMsg();
    provider.seed([m]);
    await applyActions(deps, m, plan3);
    const second = await applyActions(deps, { ...m, labels: ["SG/Pitch"] }, plan3);
    assert.deepEqual(
      second.map((r) => r.outcome),
      ["skipped", "skipped", "skipped"],
    );
    const drafts = (await log.readAll()).filter(
      (e) => e.status === "applied" && e.inverse?.type === "deleteDraft",
    );
    assert.equal(drafts.length, 1);
  });

  it("records a failure, stops there and does not throw", async () => {
    const { provider, log, deps } = setup();
    const m = inboxMsg();
    provider.seed([m]);
    provider.failNext.set("createDraft", new ProviderError("rate_limited", "slow down"));
    const results = await applyActions(deps, m, plan3);
    assert.deepEqual(
      results.map((r) => r.outcome),
      ["applied", "applied", "failed"],
    );
    assert.equal(results[2]?.code, "rate_limited");
    const last = (await log.readAll()).at(-1)!;
    assert.equal(last.status, "failed");
    assert.equal(last.note, "rate_limited");
  });

  it("stops after the first failure and skips the rest", async () => {
    const { provider, deps } = setup();
    const m = inboxMsg();
    provider.seed([m]);
    provider.failNext.set("modifyLabels", new ProviderError("needsReconnect", "signed out"));
    const results = await applyActions(deps, m, plan3);
    assert.deepEqual(
      results.map((r) => r.outcome),
      ["failed"],
    );
  });

  it("does nothing for surface and needsReview", async () => {
    const { provider, log, deps } = setup();
    const m = inboxMsg();
    provider.seed([m]);
    const results = await applyActions(deps, m, [
      { type: "surface", reason: "contract" },
      { type: "needsReview" },
    ]);
    assert.deepEqual(
      results.map((r) => r.outcome),
      ["noop", "noop"],
    );
    assert.equal((await log.readAll()).length, 0);
  });

  it("keeps subject, sender and body out of the log", async () => {
    const { provider, log, deps } = setup();
    const m = inboxMsg({
      subject: "SECRET-SUBJECT",
      fromName: "SECRET-NAME",
      fromAddress: "secret-sender@example.test",
      snippet: "SECRET-SNIPPET",
    });
    provider.seed([m]);
    await applyActions(deps, m, [
      { type: "label", labels: ["SG/Pitch"] },
      { type: "draft", subject: "Re: SECRET-SUBJECT", body: "SECRET-BODY" },
    ]);
    const text = (await log.readAll()).map(serializeEntry).join("");
    for (const word of ["SECRET", "secret-sender", "example.test"]) {
      assert.notInclude(text, word);
    }
  });

  it("handles 100 messages with 3 actions each in under 150 ms", async () => {
    const batch = () =>
      Array.from({ length: 100 }, (_, i) => inboxMsg({ id: `m${i}`, threadId: `t${i}` }));
    // One untimed pass on its own setup, so the limit measures steady work, not JIT warm-up.
    const warm = setup();
    const warmMessages = batch();
    warm.provider.seed(warmMessages);
    for (const m of warmMessages) await applyActions(warm.deps, m, plan3);
    const { provider, deps } = setup();
    const messages = batch();
    provider.seed(messages);
    const t0 = performance.now();
    for (const m of messages) await applyActions(deps, m, plan3);
    const ms = performance.now() - t0;
    assert.isBelow(ms, 150);
  });
});

describe("parseLog", () => {
  const entry: ActionLogEntry = {
    v: 1,
    id: "e1",
    ts: "2026-10-21T12:00:00.000Z",
    inbox: "sg",
    messageId: "m1",
    threadId: "t1",
    action: { type: "archive" },
    status: "intent",
  };

  it("round trips entries", () => {
    const text = serializeEntry(entry) + serializeEntry({ ...entry, id: "e2" });
    assert.deepEqual(
      parseLog(text).map((e) => e.id),
      ["e1", "e2"],
    );
  });

  it("ignores a torn last line, garbage and other versions", () => {
    const text =
      serializeEntry(entry) +
      "not json\n" +
      JSON.stringify({ ...entry, v: 2, id: "e9" }) +
      "\n" +
      serializeEntry({ ...entry, id: "e3" }) +
      serializeEntry({ ...entry, id: "e4" }).slice(0, 25);
    assert.deepEqual(
      parseLog(text).map((e) => e.id),
      ["e1", "e3"],
    );
  });

  it("ignores a line that has the right version but the wrong shape", () => {
    const text = JSON.stringify({ v: 1, id: 5 }) + "\n" + serializeEntry(entry);
    assert.deepEqual(
      parseLog(text).map((e) => e.id),
      ["e1"],
    );
  });
});

describe("applyActions with a log that breaks", () => {
  it("throws when the outcome line cannot be written, and does not report the change as failed", async () => {
    const { provider, deps } = setup();
    const inner = new MemoryActionLog();
    let writes = 0;
    const log = {
      append: async (e: ActionLogEntry) => {
        // The first write is the intent line. The second would record the outcome.
        if (++writes === 2) throw new Error("disk full");
        await inner.append(e);
      },
      readAll: () => inner.readAll(),
    };
    const m = inboxMsg();
    provider.seed([m]);
    const err = await applyActions({ ...deps, log }, m, [{ type: "archive" }]).catch(
      (e: unknown) => e,
    );
    assert.instanceOf(err, Error);
    assert.equal((err as Error).message, "disk full");
    assert.notInclude((await provider.getMessage("m1")).labels, "INBOX");
    assert.deepEqual(
      (await inner.readAll()).map((e) => e.status),
      ["intent"],
    );
  });

  it("does not make the change when the intent line cannot be written", async () => {
    const { provider, deps } = setup();
    const log = {
      append: async () => {
        throw new Error("disk full");
      },
      readAll: async () => [],
    };
    const m = inboxMsg();
    provider.seed([m]);
    await applyActions({ ...deps, log }, m, [{ type: "archive" }]).catch(() => undefined);
    assert.include((await provider.getMessage("m1")).labels, "INBOX");
  });
});
