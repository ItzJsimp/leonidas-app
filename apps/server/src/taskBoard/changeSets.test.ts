import { describe, expect, it } from "@effect/vitest";
import type { TaskBoardTask } from "@t3tools/contracts";

import { parseLedger, planChangeSet, serializeLedger, type LedgerRow } from "./changeSets.ts";

const card = (id: string, over: Partial<TaskBoardTask> = {}) =>
  ({
    id,
    title: `Card ${id}`,
    status: "todo",
    priority: "medium",
    createdAt: 1,
    projectSlug: "leonidas-code",
    ...over,
  }) as TaskBoardTask;

const rule = (slug: string | null) =>
  slug === "full" ? { cap: 1, warn: 1 } : { cap: 50, warn: 30 };

describe("planChangeSet", () => {
  it("diffs status, priority and project per card and skips no-ops", () => {
    const rows = planChangeSet(
      [card("a"), card("b", { status: "done" })],
      [
        { taskId: "a", status: "done", priority: "low" },
        { taskId: "b", status: "done" },
        { taskId: "zzz", status: "done" },
      ],
      rule,
    );
    expect(rows.map((r) => [r.taskId, r.outcome])).toEqual([
      ["a", "changed"],
      ["b", "unchanged"],
      ["zzz", "missing"],
    ]);
    expect(rows[0]).toMatchObject({
      before: { status: "todo", priority: "medium", projectSlug: "leonidas-code" },
      after: { status: "done", priority: "low", projectSlug: "leonidas-code" },
    });
  });

  it("refuses moves that would overfill the target, counting earlier moves in the same set", () => {
    const rows = planChangeSet(
      [card("a"), card("b"), card("c", { projectSlug: "full" })],
      [
        { taskId: "a", projectSlug: "full" },
        { taskId: "c", status: "done" },
        { taskId: "b", projectSlug: "full" },
      ],
      rule,
    );
    // "full" holds c (1 of 1): a is refused; closing c frees the slot; b then fits.
    expect(rows.map((r) => r.outcome)).toEqual(["refused", "changed", "changed"]);
    expect(rows[0]?.reason).toContain("cap 1");
  });
});

describe("ledger csv", () => {
  it("round-trips quotes, commas and empty project", () => {
    const rows: LedgerRow[] = [
      {
        taskId: "t1",
        title: 'Say "hi", then go',
        file: "t1.md",
        before: { status: "todo", priority: "low", projectSlug: null },
        after: { status: "done", priority: "low", projectSlug: null },
        beforeSha: "aa",
        afterSha: "bb",
      },
    ];
    expect(parseLedger(serializeLedger(rows))).toEqual(rows);
  });
});
