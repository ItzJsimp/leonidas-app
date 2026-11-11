import * as Schema from "effect/Schema";

export const DesktopDownloadProgressSchema = Schema.Struct({
  startedAt: Schema.Number,
  elapsedSeconds: Schema.Number,
  transferred: Schema.Number,
  total: Schema.Number,
  bytesPerSecond: Schema.Number,
  remainingSeconds: Schema.NullOr(Schema.Number),
});
export type DesktopDownloadProgress = typeof DesktopDownloadProgressSchema.Type;

export interface DesktopUpdateReleaseNote {
  version: string;
  items: ReadonlyArray<string>;
  totalItems: number;
  /** True when a release the user skipped past, or this one, deserves a visible notice. */
  notable?: boolean;
}

export const DesktopUpdateReleaseNoteSchema = Schema.Struct({
  version: Schema.String,
  items: Schema.Array(Schema.String),
  totalItems: Schema.Number,
  notable: Schema.optional(Schema.Boolean),
});
