import { firstName, renderDraft, replySubject } from "./draft.ts";
import {
  AUTONOMY_TIERS,
  REVIEW_BUCKET,
  type Action,
  type AutonomyTier,
  type Decision,
  type MailMessage,
  type Pack,
} from "./types.ts";

/**
 * Turn a decision into actions, cut to what the tier allows.
 * Tier 0 labels, 1 adds archive, 2 and above add drafts. Tiers 3 and 4 add nothing yet: there is no send action.
 * The never-draft and always-show rules are checked here too, so an unvalidated pack cannot break them.
 * A tier outside 0 to 4 (bad stored settings) counts as tier 0.
 */
export function plan(
  m: MailMessage,
  decision: Decision,
  pack: Pack,
  requestedTier: AutonomyTier,
): readonly Action[] {
  const tier = AUTONOMY_TIERS.includes(requestedTier) ? requestedTier : 0;
  const bucket = decision.bucket;
  if (bucket === null) return [];

  const shown = pack.alwaysSurface.includes(bucket);
  const actions: Action[] = [];

  // Own-property reads: a bucket named "toString" must not find an inherited function.
  const labels = Object.hasOwn(pack.labels, bucket) ? (pack.labels[bucket] ?? []) : [];
  if (labels.length > 0) actions.push({ type: "label", labels });

  if (tier >= 1 && !shown && pack.archive.includes(bucket)) actions.push({ type: "archive" });

  const template = Object.hasOwn(pack.drafts, bucket) ? pack.drafts[bucket] : undefined;
  if (tier >= 2 && template && !pack.neverDraft.includes(bucket)) {
    actions.push({
      type: "draft",
      subject: replySubject(m.subject),
      body: renderDraft(template, firstName(m.fromName)),
    });
  }

  if (shown)
    actions.push({ type: "surface", reason: `${bucket} mail needs you (${decision.reason})` });
  if (bucket === REVIEW_BUCKET) actions.push({ type: "needsReview" });
  return actions;
}
