import { matchesAny } from "./match.ts";
import { REVIEW_BUCKET, type Decision, type MailMessage, type Pack, type Rule } from "./types.ts";

const skip = (reason: string): Decision => ({ bucket: null, ruleId: null, reason });

/** Which condition of the rule fired, or null. Conditions are OR. */
function firedCondition(m: MailMessage, rule: Rule): string | null {
  const { keywords, fromKeywords, attachmentKeywords, listUnsubscribe, ownRepliedInThread } =
    rule.match;
  if (keywords && matchesAny(`${m.subject}\n${m.snippet}`, keywords)) return "subject or snippet";
  if (fromKeywords && matchesAny(`${m.fromName} <${m.fromAddress}>`, fromKeywords)) return "sender";
  if (attachmentKeywords && m.attachmentNames.some((a) => matchesAny(a, attachmentKeywords))) {
    return "attachment name";
  }
  if (listUnsubscribe && m.listUnsubscribe) return "unsubscribe header";
  if (ownRepliedInThread && m.ownRepliedInThread) return "owner already replied in thread";
  return null;
}

export function classify(m: MailMessage, pack: Pack): Decision {
  if (m.isOwn) return skip("own mail");
  const ours = new Set(Object.values(pack.labels).flat());
  if (m.labels.some((l) => ours.has(l))) return skip("already labelled");
  for (const rule of pack.rules) {
    const fired = firedCondition(m, rule);
    if (fired) return { bucket: rule.bucket, ruleId: rule.id, reason: `rule ${rule.id}: ${fired}` };
  }
  return { bucket: REVIEW_BUCKET, ruleId: null, reason: "no rule matched" };
}
