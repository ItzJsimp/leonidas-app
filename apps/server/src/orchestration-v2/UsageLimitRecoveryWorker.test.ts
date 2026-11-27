import { RunId, ThreadId } from "@t3tools/contracts";
import { limitResumeMessagePrefix } from "@t3tools/shared/usageLimitRecovery";
import * as DateTime from "effect/DateTime";
import { assert, describe, it } from "vite-plus/test";
import type { ProjectionLimitRecoveryCandidate } from "./ProjectionStore.ts";
import { limitRecoveryCommand } from "./UsageLimitRecoveryWorker.ts";

const threadId = ThreadId.make("thread:limited");
const first = RunId.make("run:first");
const second = RunId.make("run:second");
const reset = Date.parse("2026-11-24T19:45:00.000Z");
const resetAt = "2026-11-24T19:45:00.000Z";
const minutes = (count: number) => count * 60_000;

function candidate(
  overrides: Partial<ProjectionLimitRecoveryCandidate> = {},
): ProjectionLimitRecoveryCandidate {
  const stopped = DateTime.makeUnsafe(reset - minutes(120));
  return {
    id: threadId,
    status: "failed",
    lastErrorClass: "usage_limit",
    latestRunId: first,
    usageLimitResetAt: resetAt,
    archivedAt: null,
    settledOverride: null,
    pendingRuntimeRequest: null,
    latestRunCompletedAt: stopped,
    updatedAt: stopped,
    limitRecovery: { runId: first, resetAt, autoResume: true, attempt: 1 },
    snoozedUntil: null,
    ...overrides,
  };
}

/** The latest run is an automatic send that came back with the same, now old, reset time. */
function failedRetry(attempt: number, stoppedMs: number) {
  return candidate({
    latestRunId: second,
    latestRunCompletedAt: DateTime.makeUnsafe(stoppedMs),
    latestRunUserMessageId: `${limitResumeMessagePrefix(threadId, first)}${reset}:request`,
    limitRecovery: { runId: first, resetAt, autoResume: true, attempt },
  });
}

describe("limitRecoveryCommand", () => {
  it("sends 2 minutes after the reset, not before", () => {
    assert.isNull(limitRecoveryCommand(candidate(), false, reset));
    assert.isNull(limitRecoveryCommand(candidate(), false, reset + minutes(2) - 1));
    assert.equal(
      limitRecoveryCommand(candidate(), false, reset + minutes(2))?.type,
      "message.dispatch",
    );
  });

  it("never sends for a record armed before this flow", () => {
    const legacy = candidate({ limitRecovery: { runId: first, resetAt, autoResume: true } });
    assert.isNull(limitRecoveryCommand(legacy, true, reset + minutes(60)));
  });

  it("schedules a retry when the provider repeats an old reset time", () => {
    const stoppedMs = reset + minutes(3);
    const command = limitRecoveryCommand(failedRetry(1, stoppedMs), false, stoppedMs);
    assert(command?.type === "thread.metadata.update");
    assert.deepInclude(command.limitRecovery, { runId: second, autoResume: true, attempt: 2 });
  });

  it("spaces a retry 5 minutes after the failed send", () => {
    const stoppedMs = reset + minutes(3);
    const armed = candidate({
      latestRunId: second,
      latestRunCompletedAt: DateTime.makeUnsafe(stoppedMs),
      limitRecovery: { runId: second, resetAt, autoResume: true, attempt: 2 },
    });
    assert.isNull(limitRecoveryCommand(armed, false, stoppedMs + minutes(5) - 1));
    assert.equal(
      limitRecoveryCommand(armed, false, stoppedMs + minutes(5))?.type,
      "message.dispatch",
    );
  });

  it("stops after the third send, also with the global switch on", () => {
    const stoppedMs = reset + minutes(14);
    const command = limitRecoveryCommand(failedRetry(3, stoppedMs), true, stoppedMs);
    assert(command?.type === "thread.metadata.update");
    assert.deepInclude(command.limitRecovery, { autoResume: false, attempt: 4 });
  });

  it("does not retry an old reset time after a message the user sent", () => {
    const manual = candidate({
      latestRunId: second,
      latestRunCompletedAt: DateTime.makeUnsafe(reset + minutes(1)),
      latestRunUserMessageId: "message:manual",
    });
    assert.isNull(limitRecoveryCommand(manual, true, reset + minutes(30)));
  });
});
