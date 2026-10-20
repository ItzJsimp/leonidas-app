import type { TaskBoardChange, TaskBoardChangeRow, TaskBoardTaskStatus } from "@t3tools/contracts";

export type BulkAction =
  | { readonly kind: "status"; readonly status: TaskBoardTaskStatus }
  | { readonly kind: "project"; readonly slug: string | null };

export function toggleChecked(checked: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(checked);
  if (!next.delete(id)) next.add(id);
  return next;
}

export function bulkChanges(ids: ReadonlyArray<string>, action: BulkAction): TaskBoardChange[] {
  return ids.map((taskId) =>
    action.kind === "status"
      ? { taskId, status: action.status }
      : { taskId, projectSlug: action.slug },
  );
}

export function summarizeChangeSet(
  rows: ReadonlyArray<Pick<TaskBoardChangeRow, "outcome" | "reason">>,
) {
  const refused = rows.filter((row) => row.outcome === "refused");
  return {
    changed: rows.filter((row) => row.outcome === "changed").length,
    refused: refused.length,
    firstReason: refused[0]?.reason ?? null,
  };
}
