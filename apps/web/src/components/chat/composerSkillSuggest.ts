import type { ServerProviderSkill } from "@t3tools/contracts";
import {
  dedupeProviderSkillsByName,
  isProviderSkillUserInvocable,
} from "@t3tools/client-runtime/providerSkills";

export interface SkillPick {
  readonly name: string;
  readonly score: number;
}

/**
 * A pick needs a score of at least MIN_SCORE_PER_LOG_POOL * ln(1 + pool size), at least
 * RELATIVE_CUT of the best score, and at least MIN_MATCHES prompt words in the skill text.
 * One shared word is a coincidence. The floor grows with the pool because rare-word
 * weights grow with it (a pool of 5 skills would otherwise never reach a fixed floor).
 * Tuned on the spike fixture: a cut of 0.7 keeps hit@3 at 18 of 22 and drops the weak extra pick.
 */
const MIN_SCORE_PER_LOG_POOL = 0.2;
const RELATIVE_CUT = 0.7;
const MIN_MATCHES = 2;
/** Project words only break ties: a project name matches many skills. */
const PROJECT_WEIGHT = 0.25;

const STOPWORDS = new Set(
  "a an and are as at be but by can do does for from has have how i if in is it its me my of on or our so that the this to up us we what when which will with you your".split(
    " ",
  ),
);

function tokens(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((word) => !STOPWORDS.has(word));
}

function isNamedInPrompt(prompt: string, skillName: string): boolean {
  const escaped = skillName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\$${escaped}(?![\\w-])`, "i").test(prompt);
}

/**
 * Keyword (TF-IDF) ranking of the skills an agent can start, best first.
 * Returns 0 to `cap` picks; an empty list means no skill fits.
 * shortcut: keyword match only, no meaning match; swap in an LLM rerank when the spike proves it.
 */
export function rankSkills(input: {
  readonly prompt: string;
  readonly projectText: string;
  readonly skills: ReadonlyArray<ServerProviderSkill>;
  readonly cap: number;
}): SkillPick[] {
  const queryWords = new Set(tokens(input.prompt));
  const eligible = dedupeProviderSkillsByName(input.skills.filter(isProviderSkillUserInvocable));
  if (queryWords.size === 0 || eligible.length === 0 || input.cap < 1) return [];

  const projectWords = new Set(tokens(input.projectText).filter((word) => !queryWords.has(word)));
  const docs = eligible.map((skill) => {
    const counts = new Map<string, number>();
    let length = 0;
    for (const word of tokens(
      `${skill.name} ${skill.description ?? skill.shortDescription ?? ""}`,
    )) {
      counts.set(word, (counts.get(word) ?? 0) + 1);
      length += 1;
    }
    return { skill, counts, length };
  });
  const docFrequency = new Map<string, number>();
  for (const { counts } of docs) {
    for (const word of counts.keys()) docFrequency.set(word, (docFrequency.get(word) ?? 0) + 1);
  }

  const weigh = (words: ReadonlySet<string>, counts: Map<string, number>) => {
    let sum = 0;
    for (const word of words) {
      const count = counts.get(word);
      if (count === undefined) continue;
      sum += (1 + Math.log(count)) * Math.log(1 + docs.length / docFrequency.get(word)!);
    }
    return sum;
  };

  const scored: SkillPick[] = [];
  for (const { skill, counts, length } of docs) {
    if (length === 0 || isNamedInPrompt(input.prompt, skill.name)) continue;
    let matches = 0;
    for (const word of queryWords) if (counts.has(word)) matches += 1;
    if (matches < MIN_MATCHES) continue;
    const score =
      (weigh(queryWords, counts) + PROJECT_WEIGHT * weigh(projectWords, counts)) /
      Math.sqrt(length);
    scored.push({ name: skill.name, score });
  }
  scored.sort((a, b) => b.score - a.score);

  const best = scored[0]?.score ?? 0;
  const bar = Math.max(MIN_SCORE_PER_LOG_POOL * Math.log(1 + docs.length), best * RELATIVE_CUT);
  return scored.filter((pick) => pick.score >= bar).slice(0, input.cap);
}
