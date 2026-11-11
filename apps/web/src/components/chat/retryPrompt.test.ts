import { RunId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";
import type { TimelineEntry } from "../../session-logic";
import { retryPromptForRun } from "./retryPrompt";

describe("retryPromptForRun", () => {
  const user = (text: string, runId: string | null = null) =>
    ({ kind: "message", message: { role: "user", text, runId } }) as TimelineEntry;
  const error = (runId: string) =>
    ({
      kind: "work",
      entry: { runId, itemType: "error", toolLifecycleStatus: "failed" },
    }) as TimelineEntry;

  it("returns the last user prompt of a failed run, including a steer message", () => {
    expect(
      retryPromptForRun(
        [
          user("Start"),
          error("run-1"),
          user("Use this correction", "run-1"),
          error("run-1"),
          user("A later request"),
          error("run-2"),
        ],
        RunId.make("run-1"),
      ),
    ).toBe("Use this correction");
  });

  it("does not use a later prompt for an earlier failed run", () => {
    expect(
      retryPromptForRun([user("First"), error("run-1"), user("Later")], RunId.make("run-1")),
    ).toBe("First");
  });

  it("finds the prompt for a projected error event", () => {
    const event = {
      kind: "event",
      projectedItem: { item: { type: "error", runId: "run-1" } },
    } as TimelineEntry;
    expect(retryPromptForRun([user("A projected request"), event], RunId.make("run-1"))).toBe(
      "A projected request",
    );
  });

  it("ignores a later prompt assigned to another run when an old event arrives late", () => {
    expect(
      retryPromptForRun(
        [user("First", "run-1"), error("run-1"), user("Later", "run-2"), error("run-1")],
        RunId.make("run-1"),
      ),
    ).toBe("First");
  });

  it("returns null when there is no matching prompt or run", () => {
    expect(retryPromptForRun([error("run-1")], RunId.make("run-1"))).toBeNull();
    expect(retryPromptForRun([user("Other"), error("run-2")], RunId.make("run-1"))).toBeNull();
  });
});
