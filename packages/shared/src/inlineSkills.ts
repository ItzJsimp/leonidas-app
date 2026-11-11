import type { ServerProviderSkill } from "@t3tools/contracts";
import { isChippedSlashCommand, SLASH_COMMAND_TOKEN_REGEX } from "./composerInlineTokens.ts";

export type InlineSkill = Pick<ServerProviderSkill, "name" | "displayName">;

// Words a skill slug spells in lower case that people write in capitals.
const ACRONYMS = new Set([
  "ai",
  "aios",
  "api",
  "asd",
  "ceo",
  "cli",
  "css",
  "gh",
  "html",
  "llm",
  "mcp",
  "pdf",
  "pr",
  "seo",
  "sql",
  "ste",
  "tdd",
  "ui",
  "ux",
]);

function titleCaseWords(value: string): string {
  const words: string[] = [];
  for (const segment of value.split(/[\s:_-]+/)) {
    if (segment.length === 0) continue;
    const lower = segment.toLowerCase();
    // A letters-then-digits code (ste100, p2) is a name, not a word.
    words.push(
      ACRONYMS.has(lower) || /^[a-z]+\d+$/.test(lower)
        ? segment.toUpperCase()
        : segment.charAt(0).toUpperCase() + segment.slice(1),
    );
  }
  return words.join(" ");
}

export function formatProviderSkillDisplayName(
  skill: Pick<ServerProviderSkill, "name" | "displayName">,
): string {
  const displayName = skill.displayName?.trim();
  if (displayName) {
    return displayName;
  }
  return titleCaseWords(skill.name);
}

const SKILL_TOKEN_REGEX =
  /(^|\s)\p{Sc}(?![0-9][0-9_]*(?:[kKmMbBtT]|[eE][0-9]+)?(?:\s|$))(?=[a-zA-Z0-9:_-]*[a-zA-Z])([a-zA-Z0-9][a-zA-Z0-9:_-]*)(?=\s|$)/gu;

export function* matchInlineSkills(text: string, skills: readonly InlineSkill[]) {
  const command = SLASH_COMMAND_TOKEN_REGEX.exec(text);
  if (command?.[1] !== undefined && isChippedSlashCommand(command[1])) {
    yield {
      start: 0,
      end: command[0].length,
      skill: { name: command[1] } satisfies InlineSkill,
      rawText: command[0],
    };
  }
  for (const match of text.matchAll(SKILL_TOKEN_REGEX)) {
    const name = match[2] ?? "";
    const skill = skills.find((candidate) => candidate.name === name);
    if (!skill) continue;
    const start = match.index + (match[1]?.length ?? 0);
    yield { start, end: match.index + match[0].length, skill, rawText: `$${name}` };
  }
}
