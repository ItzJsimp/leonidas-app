import * as Schema from "effect/Schema";

import { ScheduledTaskSchedule } from "./scheduledTask.ts";

/**
 * Automations: everything that runs by itself. The app runs its built-in watchers; the AIOS
 * register (`wiki/automation-register.json`) lists the rest (Windows tasks, daemons, hooks).
 */
export const AutomationKind = Schema.Literals([
  "watcher",
  "digest",
  "agent_schedule",
  "windows_task",
  "daemon",
  "git_hook",
  "engine_hook",
]);
export type AutomationKind = typeof AutomationKind.Type;

export const AutomationResult = Schema.Literals([
  "never",
  "running",
  "ok",
  "findings",
  "skipped",
  "failed",
]);
export type AutomationResult = typeof AutomationResult.Type;

export const AutomationEntry = Schema.Struct({
  id: Schema.String,
  kind: AutomationKind,
  name: Schema.String,
  /** One line on what it does. */
  line: Schema.String,
  /** Plain words, such as "Every hour" or "Mondays at 9:00 AM". */
  scheduleText: Schema.String,
  /** Set only for app automations whose schedule the tab can edit. */
  schedule: Schema.optional(ScheduledTaskSchedule),
  /** Null when the tab cannot start or stop it. */
  enabled: Schema.NullOr(Schema.Boolean),
  lastRunAt: Schema.NullOr(Schema.String),
  lastResult: AutomationResult,
  lastSummary: Schema.NullOr(Schema.String),
  nextRunAt: Schema.NullOr(Schema.String),
  canRunNow: Schema.Boolean,
  /** A file to open for edit, relative to the AIOS root or absolute. */
  file: Schema.optional(Schema.String),
  /** An in-app route that edits it, such as the agent schedule editor. */
  link: Schema.optional(Schema.String),
});
export type AutomationEntry = typeof AutomationEntry.Type;

const WorkspaceField = { workspaceId: Schema.optional(Schema.String) };

export const AutomationsListInput = Schema.Struct(WorkspaceField);
export type AutomationsListInput = typeof AutomationsListInput.Type;

export const AutomationsListResult = Schema.Struct({
  entries: Schema.Array(AutomationEntry),
  /** When `Get-AutomationSurface.ps1` last wrote the register JSON, or null with no register. */
  registerBuiltAt: Schema.NullOr(Schema.String),
});
export type AutomationsListResult = typeof AutomationsListResult.Type;

export const AutomationsSetEnabledInput = Schema.Struct({
  ...WorkspaceField,
  id: Schema.String,
  enabled: Schema.Boolean,
});
export type AutomationsSetEnabledInput = typeof AutomationsSetEnabledInput.Type;

export const AutomationsSetScheduleInput = Schema.Struct({
  ...WorkspaceField,
  id: Schema.String,
  schedule: ScheduledTaskSchedule,
});
export type AutomationsSetScheduleInput = typeof AutomationsSetScheduleInput.Type;

export const AutomationsRunNowInput = Schema.Struct({
  ...WorkspaceField,
  id: Schema.String,
  /** Runs the check and returns the report, but sends no event and writes no file. */
  dryRun: Schema.optional(Schema.Boolean),
});
export type AutomationsRunNowInput = typeof AutomationsRunNowInput.Type;

export const AutomationsRunNowResult = Schema.Struct({
  entry: AutomationEntry,
  /** What the run found, in plain lines. */
  report: Schema.Array(Schema.String),
  /** Notifications events this run wrote (0 or 1). */
  notified: Schema.Number,
});
export type AutomationsRunNowResult = typeof AutomationsRunNowResult.Type;

export class AutomationError extends Schema.TaggedError<AutomationError>()("AutomationError", {
  message: Schema.String,
}) {}
