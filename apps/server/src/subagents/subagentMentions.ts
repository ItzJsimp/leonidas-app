/**
 * `@name` in a user message routes that one request to a subagent. The
 * message keeps the user's words; a routing note follows it so every
 * provider gets the same instruction to call `leo_delegate_task` with `subagent`.
 */

/** Whole whitespace-delimited `@name` tokens, the shape a subagent name has. */
const SUBAGENT_MENTION = /(^|\s)@([a-z0-9][a-z0-9-]{0,63})(?=\s|$|[.,;:!?])/g;

/** Subagent names the text mentions, in order, each once and only if `isKnown`. */
export function findSubagentMentions(
  text: string,
  isKnown: (name: string) => boolean,
): ReadonlyArray<string> {
  if (!text.includes("@")) return [];
  const names: string[] = [];
  for (const match of text.matchAll(SUBAGENT_MENTION)) {
    const name = match[2] ?? "";
    if (!names.includes(name) && isKnown(name)) names.push(name);
  }
  return names;
}

/** The text with a routing note when it names a known subagent, else unchanged. */
export function routeSubagentMentions(text: string, isKnown: (name: string) => boolean): string {
  const names = findSubagentMentions(text, isKnown);
  if (names.length === 0) return text;
  const calls = names.map((name) => `subagent: "${name}"`).join(" or ");
  return [
    text,
    "",
    "<subagent-route>",
    `The user named ${names.map((name) => `@${name}`).join(", ")} in this message only.`,
    `Do not do the work yourself. Call delegate_task with ${calls} and put the user's request in the prompt.`,
    "When the subagent returns, report its result. A later message without a mention is yours to handle.",
    "</subagent-route>",
  ].join("\n");
}
