import type { ScribeDictionary, ScribeSuggestionList } from "@t3tools/contracts";

/** The engine refuses a vocabulary list longer than this (contract v1.2). */
export const VOCABULARY_CAP = 800;

type Replacement = ScribeDictionary["replacements"][number];

export type DictionaryEdit =
  | { readonly ok: true; readonly dictionary: ScribeDictionary }
  | { readonly ok: false; readonly message: string };

const lower = (value: string) => value.trim().toLowerCase();

/** A new word fix, or a new spelling for a rule that already has that wrong word. */
export function addReplacement(
  dictionary: ScribeDictionary,
  wrong: string,
  correct: string,
): DictionaryEdit {
  const rule: Replacement = { wrong: wrong.trim(), correct: correct.trim() };
  if (!rule.wrong || !rule.correct) {
    return {
      ok: false,
      message: "Fill in both boxes: the wrong word and the right spelling.",
    };
  }
  const exists = dictionary.replacements.some((item) => lower(item.wrong) === lower(rule.wrong));
  const replacements = exists
    ? dictionary.replacements.map((item) =>
        lower(item.wrong) === lower(rule.wrong) ? { ...item, correct: rule.correct } : item,
      )
    : [...dictionary.replacements, rule];
  return { ok: true, dictionary: { ...dictionary, replacements } };
}

export function addVocabulary(dictionary: ScribeDictionary, word: string): DictionaryEdit {
  const term = word.trim();
  if (!term) return { ok: false, message: "Type a word first." };
  if (dictionary.vocabulary.some((item) => lower(item) === lower(term))) {
    return { ok: false, message: `“${term}” is already in your word list.` };
  }
  if (dictionary.vocabulary.length >= VOCABULARY_CAP) {
    return {
      ok: false,
      message: `Your word list is full (${VOCABULARY_CAP} words). Remove one to add another.`,
    };
  }
  return { ok: true, dictionary: { ...dictionary, vocabulary: [...dictionary.vocabulary, term] } };
}

export function filterVocabulary(vocabulary: readonly string[], query: string): readonly string[] {
  const needle = lower(query);
  return needle ? vocabulary.filter((word) => word.toLowerCase().includes(needle)) : vocabulary;
}

/** Accepting a suggestion adds it as a word fix; the engine then stops listing it. */
export function acceptSuggestion(
  dictionary: ScribeDictionary,
  suggestion: ScribeSuggestionList["items"][number],
): DictionaryEdit {
  return addReplacement(dictionary, suggestion.wrong, suggestion.correct);
}

export function suggestionWhy(count: number): string {
  return `Fixed ${count} ${count === 1 ? "time" : "times"} in your dictations`;
}

const SAVE_ERRORS: Readonly<Record<string, string>> = {
  offline: "Scribe engine is not running. Start it from the tray, or install it.",
  timeout: "Scribe did not answer in time. Try again.",
  bad_request: "Scribe did not accept that word list. Check the words and try again.",
  store_error: "Scribe could not save your word list. Try again.",
};

/** One plain sentence for a failed read or save, from the engine error reason. */
export function dictionaryErrorMessage(reason: string | null): string {
  return (
    (reason === null ? undefined : SAVE_ERRORS[reason]) ?? "Scribe could not do that. Try again."
  );
}

/** One right spelling and every misheard spelling Scribe turns into it. */
export interface FixGroup {
  readonly correct: string;
  readonly spellings: readonly string[];
  /** A rule whose wrong spelling is the right one. The engine ignores case, so it fixes capitals and guards a longer phrase. */
  readonly sameWord: boolean;
}

/** A word with this many spellings or more gets its own filter. */
export const MANY_SPELLINGS = 5;

/** Word fixes grouped by the right spelling, so 183 rules read as the 84 words they fix. */
export function groupFixes(replacements: readonly Replacement[]): FixGroup[] {
  const groups = new Map<string, string[]>();
  for (const rule of replacements) {
    const list = groups.get(rule.correct) ?? [];
    list.push(rule.wrong);
    groups.set(rule.correct, list);
  }
  return [...groups].map(([correct, spellings]) => ({
    correct,
    spellings,
    sameWord: spellings.some((wrong) => lower(wrong) === lower(correct)),
  }));
}

export type FixView = "all" | "many";
export type FixSort = "spellings" | "name";

/** Search matches the right spelling or any misheard one. "many" keeps words with 5 or more spellings. */
export function viewFixes(
  groups: readonly FixGroup[],
  query: string,
  view: FixView,
  sort: FixSort,
): FixGroup[] {
  const needle = lower(query);
  return groups
    .filter(
      (group) =>
        (view === "all" || group.spellings.length >= MANY_SPELLINGS) &&
        (!needle ||
          group.correct.toLowerCase().includes(needle) ||
          group.spellings.some((wrong) => wrong.toLowerCase().includes(needle))),
    )
    .toSorted((a, b) =>
      sort === "name"
        ? a.correct.localeCompare(b.correct, undefined, { sensitivity: "base" })
        : b.spellings.length - a.spellings.length ||
          a.correct.localeCompare(b.correct, undefined, { sensitivity: "base" }),
    );
}

/** Removes every rule whose misheard spelling is in `wrongs`. */
export function removeSpellings(
  dictionary: ScribeDictionary,
  wrongs: Iterable<string>,
): ScribeDictionary {
  const gone = new Set(wrongs);
  return {
    ...dictionary,
    replacements: dictionary.replacements.filter((rule) => !gone.has(rule.wrong)),
  };
}

/** Puts removed rules back. A rule the list has again in the meantime stays as it is now. */
export function restoreSpellings(
  dictionary: ScribeDictionary,
  rules: readonly Replacement[],
): ScribeDictionary {
  const have = new Set(dictionary.replacements.map((rule) => lower(rule.wrong)));
  return {
    ...dictionary,
    replacements: [
      ...dictionary.replacements,
      ...rules.filter((rule) => !have.has(lower(rule.wrong))),
    ],
  };
}

export function removeWords(
  dictionary: ScribeDictionary,
  words: Iterable<string>,
): ScribeDictionary {
  const gone = new Set(words);
  return { ...dictionary, vocabulary: dictionary.vocabulary.filter((word) => !gone.has(word)) };
}

export function restoreWords(
  dictionary: ScribeDictionary,
  words: readonly string[],
): ScribeDictionary {
  const have = new Set(dictionary.vocabulary.map(lower));
  return {
    ...dictionary,
    vocabulary: [...dictionary.vocabulary, ...words.filter((word) => !have.has(lower(word)))],
  };
}

/** The speech model reads words to know as one hint of at most this many characters. */
export const HINT_CHARS = 800;

/**
 * How much of the speech hint your words fill, the way the engine builds it
 * (`dictionary.rs` vocabulary_prompt): no repeats, no commas, each word counts its length plus 2.
 */
export function hintUsage(vocabulary: readonly string[]): {
  readonly used: number;
  readonly skipped: number;
} {
  const seen = new Set(["vocabulary"]);
  let used = 0;
  let index = 0;
  for (; index < vocabulary.length; index++) {
    const term = vocabulary[index]!.trim();
    if (!term || term.includes(",") || seen.has(term.toLowerCase())) continue;
    if (used + term.length + 2 > HINT_CHARS) break;
    seen.add(term.toLowerCase());
    used += term.length + 2;
  }
  return { used, skipped: vocabulary.length - index };
}
