import * as Schema from "effect/Schema";

import { IsoDateTime, ThreadId } from "./baseSchemas.ts";
import { ProviderInstanceId } from "./providerInstance.ts";

export const ChatQuotaInput = Schema.Struct({ threadId: ThreadId });
export type ChatQuotaInput = typeof ChatQuotaInput.Type;

/**
 * Percentage points of one plan window that a chat caused. `sharedPoints` is the part another chat,
 * another device or the provider's own site may have caused too, so `points` is an upper bound.
 */
const ChatQuotaUse = Schema.Struct({ points: Schema.Number, sharedPoints: Schema.Number });
export type ChatQuotaUse = typeof ChatQuotaUse.Type;

/** One row per account the chat ran on. Points of two accounts never add up. */
const ChatQuotaAccount = Schema.Struct({
  providerInstanceId: ProviderInstanceId,
  fiveHour: ChatQuotaUse,
  weekly: ChatQuotaUse,
  lastAt: IsoDateTime,
});
export type ChatQuotaAccount = typeof ChatQuotaAccount.Type;

export const ChatQuota = Schema.Struct({
  /** When the first stored reading was made, or null when none exist. */
  coverageStart: Schema.NullOr(IsoDateTime),
  accounts: Schema.Array(ChatQuotaAccount),
});
export type ChatQuota = typeof ChatQuota.Type;
