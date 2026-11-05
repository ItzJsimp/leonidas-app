import { SKILL_MENTION_PATTERN } from "@t3tools/shared/composerInlineTokens";

/**
 * Puts `$name ` at the very start of the prompt, the way a typed skill command leads it.
 * Returns the prompt unchanged when it already starts with that skill.
 */
export function prefixPromptWithSkill(prompt: string, skillName: string): string {
  const marker = `$${skillName}`;
  const leading = prompt.trimStart();
  if (leading === marker || leading.startsWith(`${marker} `) || leading.startsWith(`${marker}\n`)) {
    return prompt;
  }
  return `${marker} ${prompt}`;
}

/** Leads the prompt with every skill in rank order, as if each `$name` was typed. */
export function prefixPromptWithSkills(prompt: string, skillNames: ReadonlyArray<string>): string {
  return skillNames.reduceRight((text, name) => prefixPromptWithSkill(text, name), prompt);
}

/** Names the prompt mentions with `$name`, in order. Includes names that are not skills. */
export function mentionedSkillNames(prompt: string): string[] {
  return [...prompt.matchAll(SKILL_MENTION_PATTERN)].map((match) => match[2] ?? "");
}

/**
 * The prompt without its `$name` mentions, which is what the user is asking for.
 * With `known` (lowercase names), only those mentions go; other `$words` stay prose.
 */
export function withoutSkillMentions(prompt: string, known?: ReadonlySet<string>): string {
  return prompt
    .replace(SKILL_MENTION_PATTERN, (all, lead: string, name: string) =>
      known && !known.has(name.toLowerCase()) ? all : lead,
    )
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/** Skills in one message past this count get a context-cost hint. */
export const SKILL_CONTEXT_WARNING_THRESHOLD = 5;

/** Distinct known skills the prompt names with `$name`; each body is inlined once. */
export function countMentionedSkills(prompt: string, knownSkills: ReadonlySet<string>): number {
  const names = new Set<string>();
  for (const match of prompt.matchAll(SKILL_MENTION_PATTERN)) {
    const name = match[2] ?? "";
    if (knownSkills.has(name)) names.add(name);
  }
  return names.size;
}

/**
 * Text that replaces `[0, rangeEnd)` when a picked `/command` leads the prompt
 * instead of staying where it was typed, since a provider expands a command
 * only at message start. A skill leads as a `$` mention so it becomes a chip
 * and is expanded by the harness; a plain command keeps its `/`.
 */
export function hoistCommandToPromptStart(
  prompt: string,
  command: string,
  rangeStart: number,
  isSkill = false,
): string {
  return `${isSkill ? "$" : "/"}${command} ${prompt.slice(0, rangeStart)}`;
}
