import type { ScribeDictionary, ScribeGoals, ScribeInsights } from "@t3tools/contracts";

/**
 * The numbers an agent can use from Scribe: counts, streaks, speed and goals. It never carries a
 * transcript, a raw text or an app window title, because `ScribeInsights` and `ScribeGoals` hold none.
 */
export function scribeSummary(insights: ScribeInsights, goals: ScribeGoals) {
  return {
    insights: {
      words: insights.words,
      transcripts: insights.transcripts,
      daysActive: insights.daysActive,
      todayWords: insights.todayWords,
      todayTranscripts: insights.todayTranscripts,
      streakDays: insights.streakDays,
      weekAvgWords: insights.weekAvgWords,
      week: {
        words: insights.weekly.words,
        prevWords: insights.weekly.prevWords,
        topApp: insights.weekly.topApp,
      },
      p50Ms: insights.p50,
      p90Ms: insights.p90,
      byMode: insights.byMode.slice(0, 5),
      byApp: insights.byApp.slice(0, 5),
      truncated: insights.truncated,
    },
    goals: {
      level: goals.level,
      rank: goals.rank,
      xp: goals.xp,
      today: {
        words: goals.today.words,
        goal: goals.today.goal,
        dictations: goals.today.dictations,
      },
      streak: goals.streak,
      bestStreak: goals.bestStreak,
      questsDone: goals.questsDone,
    },
  };
}

export const MAX_TERM_CHARS = 80;
// A control character would break the dictionary file and the engine's matching.
// oxlint-disable-next-line no-control-regex -- control characters are exactly what this refuses.
const CONTROL_CHARACTER = /[\u0000-\u001f]/;
const invalidTerm = (text: string) =>
  text.length === 0 || text.length > MAX_TERM_CHARS || CONTROL_CHARACTER.test(text);

export type AddResult =
  | { readonly status: "added"; readonly dictionary: ScribeDictionary }
  | { readonly status: "exists"; readonly correct: string }
  | { readonly status: "invalid"; readonly message: string };

/** Adds one heard-to-meant pair. A heard phrase that is already mapped is never overwritten. */
export function addReplacement(
  dictionary: ScribeDictionary,
  heard: string,
  meant: string,
): AddResult {
  const wrong = heard.trim();
  const correct = meant.trim();
  if (invalidTerm(wrong) || invalidTerm(correct))
    return {
      status: "invalid",
      message: `Each text needs 1 to ${MAX_TERM_CHARS} characters, with no control characters.`,
    };
  if (wrong.toLowerCase() === correct.toLowerCase())
    return { status: "invalid", message: "The heard text and the meant text are the same." };
  const known = dictionary.replacements.find(
    (entry) => entry.wrong.toLowerCase() === wrong.toLowerCase(),
  );
  if (known !== undefined) return { status: "exists", correct: known.correct };
  return {
    status: "added",
    dictionary: { ...dictionary, replacements: [...dictionary.replacements, { wrong, correct }] },
  };
}
