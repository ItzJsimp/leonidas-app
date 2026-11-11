import * as Schema from "effect/Schema";
import { NonNegativeInt, ThreadId, TrimmedNonEmptyString } from "./baseSchemas.ts";

/**
 * Spawn tiers (ADR-0082): a free-tier model starts a subagent with no prompt;
 * every other model, including any new catalog model, asks the user first.
 */
export const SubagentSpawnTier = Schema.Literals(["free", "confirm"]);
export type SubagentSpawnTier = typeof SubagentSpawnTier.Type;

/** The app's default free tier. Settings edits it; an AIOS model-tiers.json overrides it. */
/** The daily cap on subagent run cost, in USD, for each account (ADR-0098). */
export const DEFAULT_SUBAGENT_DAILY_CAP_USD = 2;

export const DEFAULT_SUBAGENT_FREE_TIER_MODELS: ReadonlyArray<string> = [
  "claude-haiku-5-5",
  "gpt-6-luna",
  "gemini-3.8-flash-low",
  "gemini-3.8-flash-medium",
];

export const DEFAULT_SUBAGENT_TIER_GOOD_FOR: Record<SubagentSpawnTier, string> = {
  free: "Lookups, summaries, searches and routine edits.",
  confirm: "Design, architecture, hard reasoning and long builds.",
};

/** A confirm-tier spawn that waits for the user. */
export const SubagentSpawnApproval = Schema.Struct({
  id: TrimmedNonEmptyString,
  threadId: ThreadId,
  threadTitle: Schema.String,
  subagent: TrimmedNonEmptyString,
  model: TrimmedNonEmptyString,
  account: Schema.String,
  reason: Schema.String,
  filesInScope: Schema.Array(Schema.String),
  toolCount: NonNegativeInt,
  estimatedStartTokens: NonNegativeInt,
  /** Where the tier came from: the app's map, the AIOS model-tiers.json, or the spec's own `tier: confirm`. */
  tierSource: Schema.Literals(["app", "aios", "subagent"]),
  goodFor: Schema.String,
  /** Set when the engine starts a persona larger than the estimate (Codex loads AGENTS.md). */
  engineNote: Schema.optional(Schema.String),
  /** Reasoning effort the child runs at, when the model has one. */
  effort: Schema.optional(Schema.String),
  /** What the child may do on this machine, for example "full-access". */
  runtimeMode: Schema.optional(Schema.String),
  /** The project folder the child works in. */
  workspace: Schema.optional(Schema.String),
  /** The task text the child receives, cut to a short preview. */
  task: Schema.optional(Schema.String),
  /** The account's quota use now, for example "5-hour 41% used, weekly 40% used". */
  accountUsage: Schema.optional(Schema.String),
  requestedAt: Schema.String,
});
export type SubagentSpawnApproval = typeof SubagentSpawnApproval.Type;

export const SubagentSpawnApprovals = Schema.Array(SubagentSpawnApproval);
export type SubagentSpawnApprovals = typeof SubagentSpawnApprovals.Type;

export const SubagentSpawnDecision = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("allow_once") }),
  Schema.Struct({ kind: Schema.Literal("allow_thread") }),
  Schema.Struct({ kind: Schema.Literal("deny") }),
  Schema.Struct({
    kind: Schema.Literal("redirect"),
    text: TrimmedNonEmptyString.check(Schema.isMaxLength(4_000)),
  }),
]);
export type SubagentSpawnDecision = typeof SubagentSpawnDecision.Type;

export const SubagentSpawnRespondInput = Schema.Struct({
  id: TrimmedNonEmptyString,
  decision: SubagentSpawnDecision,
});
export type SubagentSpawnRespondInput = typeof SubagentSpawnRespondInput.Type;

export class SubagentSpawnApprovalError extends Schema.TaggedError<SubagentSpawnApprovalError>()(
  "SubagentSpawnApprovalError",
  { message: Schema.String },
) {}

/** One Context List entry with its start cost; `tokens` is null when the file is missing. */
export const SubagentContextEntry = Schema.Struct({
  path: Schema.String,
  tokens: Schema.NullOr(NonNegativeInt),
});
export type SubagentContextEntry = typeof SubagentContextEntry.Type;

/** A subagent spec as the Studio shows it. `error` is set when the spec does not resolve. */
export const SubagentCatalogEntry = Schema.Struct({
  name: Schema.String,
  description: Schema.NullOr(Schema.String),
  /** AIOS root, or the project that holds it. */
  source: Schema.Literals(["aios", "project"]),
  projectName: Schema.NullOr(Schema.String),
  specPath: Schema.String,
  extends: Schema.NullOr(Schema.String),
  enabled: Schema.Boolean,
  model: Schema.NullOr(Schema.String),
  account: Schema.NullOr(Schema.String),
  tier: Schema.NullOr(SubagentSpawnTier),
  tools: Schema.Array(Schema.String),
  never: Schema.Array(Schema.String),
  context: Schema.Array(SubagentContextEntry),
  estimatedStartTokens: Schema.NullOr(NonNegativeInt),
  /** Format v1 keys added for the Agents tab. Optional so older payloads still decode. */
  avatar: Schema.optionalKey(Schema.NullOr(Schema.String)),
  effort: Schema.optionalKey(Schema.NullOr(Schema.String)),
  skills: Schema.optionalKey(Schema.Array(Schema.String)),
  canSpawn: Schema.optionalKey(Schema.Boolean),
  maxTurns: Schema.optionalKey(Schema.NullOr(NonNegativeInt)),
  /** Old-format files from before format v1 show as legacy until they are migrated. */
  legacy: Schema.Boolean,
  error: Schema.NullOr(Schema.String),
});
export type SubagentCatalogEntry = typeof SubagentCatalogEntry.Type;

/** Counts since the server's local midnight. */
export const SubagentActivityStats = Schema.Struct({
  spawnsToday: NonNegativeInt,
  waitedToday: NonNegativeInt,
  /** Mean estimated start tokens of today's spawns; null before the first spawn. */
  meanStartTokensToday: Schema.NullOr(NonNegativeInt),
});
export type SubagentActivityStats = typeof SubagentActivityStats.Type;

export const SubagentCatalog = Schema.Struct({
  aiosRoot: Schema.NullOr(Schema.String),
  entries: Schema.Array(SubagentCatalogEntry),
  stats: SubagentActivityStats,
});
export type SubagentCatalog = typeof SubagentCatalog.Type;

export class SubagentEditError extends Schema.TaggedError<SubagentEditError>()(
  "SubagentEditError",
  { message: Schema.String },
) {}

/** Fields the Studio can change. A missing field stays as it is; `model: null` removes the line. */
export const SubagentSpecPatch = Schema.Struct({
  enabled: Schema.optional(Schema.Boolean),
  description: Schema.optional(Schema.NullOr(Schema.String.check(Schema.isMaxLength(400)))),
  model: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
  tools: Schema.optional(Schema.Array(TrimmedNonEmptyString)),
  context: Schema.optional(Schema.Array(TrimmedNonEmptyString)),
});
export type SubagentSpecPatch = typeof SubagentSpecPatch.Type;

// The AIOS workspace a Studio write targets (ADR-0080). Absent: the default workspace.
const studioWorkspace = {
  workspaceId: Schema.optional(TrimmedNonEmptyString.check(Schema.isMaxLength(64))),
};

export const SubagentUpdateInput = Schema.Struct({
  ...studioWorkspace,
  /** A `specPath` from the catalog. The server refuses any other file. */
  specPath: TrimmedNonEmptyString,
  patch: SubagentSpecPatch,
});
export type SubagentUpdateInput = typeof SubagentUpdateInput.Type;

export const SubagentCreateInput = Schema.Struct({
  ...studioWorkspace,
  name: TrimmedNonEmptyString,
  /** The starter's file text; the server sets its `name` and checks it against format v1. */
  contents: TrimmedNonEmptyString.check(Schema.isMaxLength(60_000)),
  /** `aios` for the AIOS folder, or the title of a project the catalog lists. */
  destination: Schema.Union([
    Schema.Struct({ kind: Schema.Literal("aios") }),
    Schema.Struct({ kind: Schema.Literal("project"), projectName: TrimmedNonEmptyString }),
  ]),
});
export type SubagentCreateInput = typeof SubagentCreateInput.Type;
