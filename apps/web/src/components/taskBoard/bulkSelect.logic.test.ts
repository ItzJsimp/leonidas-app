import { describe, expect, it } from "@effect/vitest";

import { bulkChanges, summarizeChangeSet, toggleChecked } from "./bulkSelect.logic";

describe("bulkSelect", () => {
  it("toggles one id without touching the others", () => {
    const first = toggleChecked(new Set(["a"]), "b");
    expect([...first]).toEqual(["a", "b"]);
    expect([...toggleChecked(first, "a")]).toEqual(["b"]);
  });

  it("turns one action into a change per checked card", () => {
    expect(bulkChanges(["a", "b"], { kind: "status", status: "parked" })).toEqual([
      { taskId: "a", status: "parked" },
      { taskId: "b", status: "parked" },
    ]);
    expect(bulkChanges(["a"], { kind: "project", slug: null })).toEqual([
      { taskId: "a", projectSlug: null },
    ]);
  });

  it("summarizes a result with the first refusal", () => {
    const row = (outcome: string, reason?: string) => ({ outcome, reason }) as never;
    expect(
      summarizeChangeSet([
        row("changed"),
        row("unchanged"),
        row("refused", "Full: cap 50."),
        row("refused", "Other."),
      ]),
    ).toEqual({ changed: 1, refused: 2, firstReason: "Full: cap 50." });
  });
});
