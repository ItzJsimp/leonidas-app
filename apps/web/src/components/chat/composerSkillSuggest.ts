import type { ServerProviderSkill } from "@t3tools/contracts";
import {
  dedupeProviderSkillsByName,
  isProviderSkillUserInvocable,
} from "@t3tools/client-runtime/providerSkills";

import { mentionedSkillNames, withoutSkillMentions } from "./composerSkillPrefix";

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
/** A skill kept in the project's own folder was written for this project, so it wins ties. */
const PROJECT_SKILL_BOOST = 1.2;
/** Project words only break ties: a project name matches many skills. */
const PROJECT_WEIGHT = 0.25;
/** How many skills the model stage sees. A pool this small goes to the model whole. */
export const SHORTLIST_SIZE = 40;

const STOPWORDS = new Set(
  "a an and are as at be but by can do does for from has have how i if in is it its me my of on or our so that the this to up us we what when which will with you your".split(
    " ",
  ),
);

/** Cuts plural, -ing, -ed and a final -e, so "throws" meets "throwing" and "queries" meets "query". */
function stem(word: string): string {
  let out = word;
  if (out.length > 4 && out.endsWith("ies")) out = `${out.slice(0, -3)}y`;
  else if (out.length > 5 && out.endsWith("ing")) out = out.slice(0, -3);
  else if (out.length > 4 && out.endsWith("ed")) out = out.slice(0, -2);
  else if (/(?:ch|sh|x|ss|s)es$/.test(out) && out.length > 4) out = out.slice(0, -2);
  else if (out.length > 3 && out.endsWith("s") && !out.endsWith("ss")) out = out.slice(0, -1);
  return out.length > 3 && out.endsWith("e") ? out.slice(0, -1) : out;
}

function tokens(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9]+/g) ?? [])
    .filter((word) => !STOPWORDS.has(word))
    .map(stem);
}

interface Scored {
  readonly skill: ServerProviderSkill;
  readonly score: number;
  readonly matches: number;
}

/** What the request means for ranking: its words, without the `$skill` chips that lead it. */
function readRequest(prompt: string, eligible: ReadonlyArray<ServerProviderSkill>) {
  const known = new Set(eligible.map((skill) => skill.name.toLowerCase()));
  const named = new Set(mentionedSkillNames(prompt).map((name) => name.toLowerCase()));
  return {
    text: withoutSkillMentions(prompt, known),
    named,
    /** Skills the draft already carries: they use up room under the cap. */
    namedCount: [...named].filter((name) => known.has(name)).length,
  };
}

function eligibleSkills(skills: ReadonlyArray<ServerProviderSkill>) {
  return dedupeProviderSkillsByName(skills.filter(isProviderSkillUserInvocable));
}

/** TF-IDF score of every skill that shares a word with the request, best first. */
function scoreSkills(
  requestText: string,
  projectText: string,
  eligible: ReadonlyArray<ServerProviderSkill>,
): Scored[] {
  const queryWords = new Set(tokens(requestText));
  if (queryWords.size === 0) return [];

  const projectWords = new Set(tokens(projectText).filter((word) => !queryWords.has(word)));
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

  const scored: Scored[] = [];
  for (const { skill, counts, length } of docs) {
    if (length === 0) continue;
    let matches = 0;
    for (const word of queryWords) if (counts.has(word)) matches += 1;
    if (matches === 0) continue;
    const boost = skill.scope?.toLowerCase() === "project" ? PROJECT_SKILL_BOOST : 1;
    const score =
      ((weigh(queryWords, counts) + PROJECT_WEIGHT * weigh(projectWords, counts)) /
        Math.sqrt(length)) *
      boost;
    scored.push({ skill, score, matches });
  }
  return scored.sort((a, b) => b.score - a.score);
}

/**
 * What a draft already holds: the request without its `$skill` chips, the skills it names,
 * and how many more fit under `cap`.
 */
export function readDraft(prompt: string, skills: ReadonlyArray<ServerProviderSkill>, cap: number) {
  const request = readRequest(prompt, eligibleSkills(skills));
  const known = new Set(eligibleSkills(skills).map((skill) => skill.name.toLowerCase()));
  return {
    request: request.text,
    alreadyAdded: [...request.named].filter((name) => known.has(name)),
    room: Math.max(0, cap - request.namedCount),
  };
}

/**
 * Keyword (TF-IDF) ranking of the skills an agent can start, best first. This is the
 * offline pick, used when the model stage is unavailable.
 * Returns 0 to `cap` picks; an empty list means no skill fits.
 * `cap` is the total for the draft: skills it already names use up room, and they are
 * never picked again, so a second run on the same draft adds nothing.
 */
export function rankSkills(input: {
  readonly prompt: string;
  readonly projectText: string;
  readonly skills: ReadonlyArray<ServerProviderSkill>;
  readonly cap: number;
}): SkillPick[] {
  const eligible = eligibleSkills(input.skills);
  const request = readRequest(input.prompt, eligible);
  const scored = scoreSkills(request.text, input.projectText, eligible).filter(
    (item) => item.matches >= MIN_MATCHES,
  );
  // Named skills stay in the race so they set the bar; they are dropped after it.
  const best = scored[0]?.score ?? 0;
  const bar = Math.max(MIN_SCORE_PER_LOG_POOL * Math.log(1 + eligible.length), best * RELATIVE_CUT);
  return scored
    .filter((item) => item.score >= bar && !request.named.has(item.skill.name.toLowerCase()))
    .slice(0, Math.max(0, input.cap - request.namedCount))
    .map((item) => ({ name: item.skill.name, score: item.score }));
}

/**
 * The skills worth showing the model: the best keyword matches, or the whole pool when it
 * is small. Skills the draft already names are left out.
 * shortcut: a skill that shares no word with the request never reaches the model;
 * widen to the full pool if misses show up in use.
 */
export function shortlistSkills(input: {
  readonly prompt: string;
  readonly projectText: string;
  readonly skills: ReadonlyArray<ServerProviderSkill>;
}): ServerProviderSkill[] {
  const eligible = eligibleSkills(input.skills);
  const request = readRequest(input.prompt, eligible);
  if (tokens(request.text).length === 0) return [];
  const open = eligible.filter((skill) => !request.named.has(skill.name.toLowerCase()));
  if (open.length <= SHORTLIST_SIZE) return open;
  return scoreSkills(request.text, input.projectText, eligible)
    .filter((item) => !request.named.has(item.skill.name.toLowerCase()))
    .slice(0, SHORTLIST_SIZE)
    .map((item) => item.skill);
}
