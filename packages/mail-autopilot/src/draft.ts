import type { DraftTemplate } from "./types.ts";

const MAX_SUBJECT = 200;

/** Letters only, so a display name cannot carry markup or control text into a draft. */
export function firstName(fromName: string): string {
  if (fromName.includes("@")) return "there";
  const m = /^[\s"']*(\p{L}[\p{L}'-]{0,39})/u.exec(fromName);
  return m?.[1] ?? "there";
}

/** One line only: the subject comes from the sender and becomes a mail header. */
export function replySubject(subject: string): string {
  const line = subject
    .replace(/[\p{Cc}\p{Cf}\s]+/gu, " ")
    .trim()
    .slice(0, MAX_SUBJECT);
  if (line === "") return "Re: (no subject)";
  return /^re:/i.test(line) ? line : `Re: ${line}`;
}

export function renderDraft(template: DraftTemplate, first: string): string {
  return template.body.replace(/\{\{\s*firstName\s*\}\}/g, () => first);
}
