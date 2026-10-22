import * as Schema from "effect/Schema";
import { AiosWorkspaceId } from "./taskBoard.ts";

// Business workspaces only: Home and Area git repos are joined, synced and read here.
export const AreaSyncScopeInput = Schema.Struct({ workspaceId: AiosWorkspaceId });
export type AreaSyncScopeInput = typeof AreaSyncScopeInput.Type;

export const AreaJoinState = Schema.Literals(["joined", "present", "locked", "offline", "failed"]);
export type AreaJoinState = typeof AreaJoinState.Type;

export const AreaJoinResult = Schema.Struct({
  slug: Schema.String,
  state: AreaJoinState,
  detail: Schema.String,
});
export type AreaJoinResult = typeof AreaJoinResult.Type;

export const AreaSyncJoinResult = Schema.Struct({
  results: Schema.Array(AreaJoinResult),
  ignoreAdded: Schema.Boolean,
});
export type AreaSyncJoinResult = typeof AreaSyncJoinResult.Type;

export const AreaSyncState = Schema.Literals([
  "synced",
  "pushed",
  "pulled",
  "conflict",
  "merging",
  "locked",
  "offline",
  "error",
]);
export type AreaSyncState = typeof AreaSyncState.Type;

export const AreaSyncResult = Schema.Struct({
  state: AreaSyncState,
  detail: Schema.String,
  conflicts: Schema.Array(Schema.String),
  savedRef: Schema.NullOr(Schema.String),
  committed: Schema.Boolean,
});
export type AreaSyncResult = typeof AreaSyncResult.Type;

export const AreaSyncSyncResult = Schema.Struct({
  joined: Schema.Array(AreaJoinResult),
  areas: Schema.Array(Schema.Struct({ slug: Schema.String, result: AreaSyncResult })),
});
export type AreaSyncSyncResult = typeof AreaSyncSyncResult.Type;

export const AreaStatusRow = Schema.Struct({
  slug: Schema.String,
  branch: Schema.NullOr(Schema.String),
  ahead: Schema.NullOr(Schema.Number),
  behind: Schema.NullOr(Schema.Number),
  dirty: Schema.Boolean,
  merging: Schema.Boolean,
});
export type AreaStatusRow = typeof AreaStatusRow.Type;

export const AreaSyncStatusResult = Schema.Struct({ areas: Schema.Array(AreaStatusRow) });
export type AreaSyncStatusResult = typeof AreaSyncStatusResult.Type;
