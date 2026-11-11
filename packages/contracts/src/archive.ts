import * as Schema from "effect/Schema";

import { NonNegativeInt, ThreadId, TrimmedNonEmptyString } from "./baseSchemas.ts";

/** What a stored file is, read from its extension. */
export const StoredFileKind = Schema.Literals(["image", "pdf", "text", "other"]);
export type StoredFileKind = typeof StoredFileKind.Type;

export const FilesListInput = Schema.Struct({
  tab: Schema.Literals(["all", "images", "documents"]),
  /** Matches the file name or the chat title. */
  query: Schema.optional(Schema.String.check(Schema.isMaxLength(200))),
  /** Opaque. Pass the `nextCursor` of the last page. */
  cursor: Schema.optional(Schema.String.check(Schema.isMaxLength(300))),
  limit: Schema.optional(
    NonNegativeInt.check(Schema.isGreaterThanOrEqualTo(1), Schema.isLessThanOrEqualTo(200)),
  ),
});
export type FilesListInput = typeof FilesListInput.Type;

export const StoredFile = Schema.Struct({
  /** The attachment id. Use it with the asset URL RPC to preview or save the file. */
  id: TrimmedNonEmptyString,
  name: Schema.String,
  kind: StoredFileKind,
  mimeType: Schema.optional(Schema.String),
  sizeBytes: NonNegativeInt,
  /** ISO time the file was written. */
  createdAt: Schema.String,
  /** The chat the file came from. Null for uploads that no chat has used yet. */
  thread: Schema.NullOr(Schema.Struct({ id: ThreadId, title: Schema.String })),
});
export type StoredFile = typeof StoredFile.Type;

export const FilesListResult = Schema.Struct({
  files: Schema.Array(StoredFile),
  nextCursor: Schema.NullOr(Schema.String),
  /** Files per tab, before the search is applied. */
  counts: Schema.Struct({
    all: NonNegativeInt,
    images: NonNegativeInt,
    documents: NonNegativeInt,
  }),
});
export type FilesListResult = typeof FilesListResult.Type;

export const FilesDeleteInput = Schema.Struct({
  attachmentId: TrimmedNonEmptyString.check(Schema.isMaxLength(256)),
});
export type FilesDeleteInput = typeof FilesDeleteInput.Type;

export const FilesDeleteResult = Schema.Struct({ deleted: Schema.Boolean });
export type FilesDeleteResult = typeof FilesDeleteResult.Type;

export class FilesError extends Schema.TaggedError<FilesError>()("FilesError", {
  /** `in_use`: a chat still shows the file, so it stays. */
  reason: Schema.Literals(["in_use", "not_found", "read_failed", "delete_failed"]),
  detail: Schema.optional(Schema.String),
  cause: Schema.optional(Schema.Defect()),
}) {
  override get message(): string {
    return `Files failed (${this.reason})${this.detail ? `: ${this.detail}` : ""}.`;
  }
}

/** Where a subagent came from. */
export const SubagentRunKind = Schema.Literals(["delegated", "persona", "native", "workflow"]);
export type SubagentRunKind = typeof SubagentRunKind.Type;

export const SubagentRunStatus = Schema.Literals([
  "running",
  "waiting",
  "done",
  "failed",
  "cancelled",
]);
export type SubagentRunStatus = typeof SubagentRunStatus.Type;

export const SubagentRunsInput = Schema.Struct({
  /** `running`: only live runs. `history`: runs that ended. */
  scope: Schema.Literals(["running", "history"]),
  status: Schema.optional(SubagentRunStatus),
  parentThreadId: Schema.optional(ThreadId),
  query: Schema.optional(Schema.String.check(Schema.isMaxLength(200))),
  cursor: Schema.optional(Schema.String.check(Schema.isMaxLength(300))),
  limit: Schema.optional(
    NonNegativeInt.check(Schema.isGreaterThanOrEqualTo(1), Schema.isLessThanOrEqualTo(500)),
  ),
});
export type SubagentRunsInput = typeof SubagentRunsInput.Type;

export const SubagentRun = Schema.Struct({
  id: TrimmedNonEmptyString,
  kind: SubagentRunKind,
  parent: Schema.Struct({ id: ThreadId, title: Schema.String }),
  /** The subagent's own chat, when it has one. */
  childThreadId: Schema.NullOr(ThreadId),
  provider: Schema.String,
  /** The provider account the run used, or null when the app did not store one. */
  account: Schema.NullOr(Schema.String),
  model: Schema.NullOr(Schema.String),
  /** The run that started this run's parent chat, so a child links to its parent run. */
  parentRunId: Schema.NullOr(Schema.String),
  /** Rough dollar cost of the run's chat from its reported tokens. Null when unknown. */
  costUsd: Schema.NullOr(Schema.Number),
  status: SubagentRunStatus,
  /** The status the app stored, for example `interrupted`. */
  rawStatus: Schema.String,
  startedAt: Schema.NullOr(Schema.String),
  endedAt: Schema.NullOr(Schema.String),
  durationMs: Schema.NullOr(NonNegativeInt),
  summary: Schema.String,
  /** The full task text, cut at 2000 characters. */
  task: Schema.String,
  /** The final answer once the run is done, cut at 8000 characters. */
  result: Schema.NullOr(Schema.String),
  /** True when `task` or `result` was cut. */
  truncated: Schema.Boolean,
  /** True when the app can stop this run (it owns the child chat). */
  canStop: Schema.Boolean,
});
export type SubagentRun = typeof SubagentRun.Type;

export const SubagentRunsResult = Schema.Struct({
  runs: Schema.Array(SubagentRun),
  nextCursor: Schema.NullOr(Schema.String),
  /** Live runs across all chats, for the Running tab label. */
  runningCount: NonNegativeInt,
});
export type SubagentRunsResult = typeof SubagentRunsResult.Type;

export class SubagentRunsError extends Schema.TaggedError<SubagentRunsError>()(
  "SubagentRunsError",
  { cause: Schema.Defect() },
) {
  override get message(): string {
    return "Failed to read the subagent runs.";
  }
}
