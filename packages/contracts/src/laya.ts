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
