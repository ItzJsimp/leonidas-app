const WORD = String.raw`[\p{L}\p{N}]`;
const SPECIAL = /[.*+?^$|{}()[\]\\]/g;
const MAX_CACHED = 5000;
const cache = new Map<string, RegExp>();

/**
 * Pack keywords are plain text, never regex: each word is escaped, words join on any whitespace,
 * and the match must start and end on a word break. A trailing `*` drops the end check ("starts with").
 */
function compile(keyword: string): RegExp {
  let re = cache.get(keyword);
  if (re) return re;
  const prefix = keyword.trim().endsWith("*");
  const words = keyword.trim().replace(/\*$/, "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) throw new Error(`Empty keyword: "${keyword}"`);
  const body = words.map((w) => w.replace(SPECIAL, "\\$&")).join(String.raw`\s+`);
  const end = prefix ? "" : `(?!${WORD})`;
  re = new RegExp(`(?<!${WORD})${body}${end}`, "iu");
  if (cache.size >= MAX_CACHED) cache.clear();
  cache.set(keyword, re);
  return re;
}

export function matchesAny(text: string, keywords: readonly string[]): boolean {
  return keywords.some((k) => compile(k).test(text));
}
