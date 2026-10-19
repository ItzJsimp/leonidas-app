import * as Schema from "effect/Schema";

// Laya onboarding install. "idle" means nothing started; the web step polls while "working".
export const LayaSetupResult = Schema.Struct({
  status: Schema.Literals([
    "idle",
    "working",
    "ready",
    "update-available",
    "needs-python",
    "needs-packages",
    "error",
  ]),
  message: Schema.String,
  missingPackages: Schema.Array(Schema.String),
});
export type LayaSetupResult = typeof LayaSetupResult.Type;

export const LayaSetupInput = Schema.Struct({
  action: Schema.Literals(["status", "install", "wire"]),
  installPackages: Schema.optional(Schema.Boolean),
  /** Folder to wire for the "wire" action. */
  projectPath: Schema.optional(Schema.String),
  /** The user agreed to write into a protected peer folder such as SimplyGersi. */
  confirmed: Schema.optional(Schema.Boolean),
});
export type LayaSetupInput = typeof LayaSetupInput.Type;

// Laya usage monitor. Counts only: the log holds no command or page text.
export const LayaUsage = Schema.Struct({
  status: Schema.Literals(["ready", "missing"]),
  modelPresent: Schema.Boolean,
  packPresent: Schema.Boolean,
  engineStatus: Schema.Literals([
    "ready",
    "missing-model",
    "missing-pack",
    "missing-runtime",
    "error",
    "paused",
  ]),
  modelHash: Schema.NullOr(Schema.String),
  probeMs: Schema.NullOr(Schema.Number),
  jevState: Schema.Literals(["off", "ready", "paused"]),
  gameMode: Schema.Boolean,
  tiers: Schema.Struct({ rules: Schema.Number, model: Schema.Number, jev: Schema.Number }),
  total: Schema.Number,
  days: Schema.Array(Schema.Struct({ date: Schema.String, count: Schema.Number })),
  jobs: Schema.Array(
    Schema.Struct({
      job: Schema.String,
      count: Schema.Number,
      blocked: Schema.Number,
      asked: Schema.Number,
      flagged: Schema.Number,
    }),
  ),
});
export type LayaUsage = typeof LayaUsage.Type;
