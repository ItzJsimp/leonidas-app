/**
 * Finds misheard spellings that are normal English words or first names. A word fix changes
 * these everywhere, also where the person means the normal word ("Cloud" to "Claude").
 * The lists are built by `scripts/build-normal-words.ts` (license: `normal-words/NOTICE.md`).
 */

export interface NormalWordLists {
  readonly words: ReadonlySet<string>;
  readonly names: ReadonlySet<string>;
}

export type NormalWordKind = "word" | "name";

/** Packed lists are front coded: each line is one character (48 + letters shared with the line before), then the rest. */
export function decodeFrontCoded(text: string): ReadonlySet<string> {
  const words = new Set<string>();
  let previous = "";
  for (const line of text.split("\n")) {
    if (!line) continue;
    previous = previous.slice(0, line.charCodeAt(0) - 48) + line.slice(1);
    words.add(previous);
  }
  return words;
}

/** One plain word of 3 or more letters only: phrases, digits and symbols never count as normal words. */
export function normalWordKind(spelling: string, lists: NormalWordLists): NormalWordKind | null {
  const word = spelling.trim().toLowerCase();
  if (!/^[a-z]{3,}$/.test(word)) return null;
  return lists.words.has(word) ? "word" : lists.names.has(word) ? "name" : null;
}
