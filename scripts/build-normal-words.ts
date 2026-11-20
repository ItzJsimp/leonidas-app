// @effect-diagnostics nodeBuiltinImport:off globalFetch:off globalConsole:off - This standalone generator uses Node APIs without an Effect runtime.
/**
 * Builds the packed lists Scribe uses to flag word fixes that also change normal sentences.
 * Run: node scripts/build-normal-words.ts <folder with the unzipped SSA yobYYYY.txt files>
 *
 * Words: ESDB (SCOWL) size 35, US spelling, from app.aspell.net.
 * Names: first names with MIN_BIRTHS or more US births since 1880, from the SSA national data
 * (https://www.ssa.gov/oact/babynames/limits.html, "National data").
 */
import * as NodeFS from "node:fs";
import * as NodeZlib from "node:zlib";

const OUT = new URL("../apps/web/src/components/scribe/normal-words/", import.meta.url);
const WORDS_URL =
  "https://app.aspell.net/create?max_size=35&spelling=US&max_variant=0&diacritic=strip&download=wordlist&encoding=utf-8";
const MIN_BIRTHS = 5000;
/** A spelling must be one plain word of 3 or more letters to be flagged, so the lists hold only those. */
const PLAIN = /^[a-z]{3,}$/;

/** Front coding: one character (48 + letters shared with the line before), then the rest of the word. */
function pack(words: Iterable<string>): Buffer {
  let previous = "";
  let text = "";
  for (const word of [...words].toSorted()) {
    let shared = 0;
    while (shared < 60 && previous[shared] !== undefined && previous[shared] === word[shared]) {
      shared++;
    }
    text += `${String.fromCharCode(48 + shared)}${word.slice(shared)}\n`;
    previous = word;
  }
  return NodeZlib.gzipSync(text, { level: 9 });
}

const [ssaFolder] = process.argv.slice(2);
if (!ssaFolder) throw new Error("Pass the folder with the unzipped SSA yobYYYY.txt files.");

const response = await fetch(WORDS_URL);
if (!response.ok) throw new Error(`Word list download failed: HTTP ${response.status}`);
const [header = "", body = ""] = (await response.text()).split("\n---\n");
const words = new Set(
  body
    .split("\n")
    .map((line) => line.trim().toLowerCase())
    .filter((word) => PLAIN.test(word)),
);

const births = new Map<string, number>();
for (const file of NodeFS.readdirSync(ssaFolder).filter((name) => /^yob\d{4}\.txt$/.test(name))) {
  for (const line of NodeFS.readFileSync(`${ssaFolder}/${file}`, "utf8").split("\n")) {
    const [name, , count] = line.trim().split(",");
    if (!name || !count) continue;
    births.set(name.toLowerCase(), (births.get(name.toLowerCase()) ?? 0) + Number(count));
  }
}
if (births.size === 0) throw new Error("No yobYYYY.txt files found in " + ssaFolder);
const names = [...births]
  .filter(([name, total]) => total >= MIN_BIRTHS && PLAIN.test(name) && !words.has(name))
  .map(([name]) => name);

NodeFS.mkdirSync(OUT, { recursive: true });
const packedWords = pack(words);
const packedNames = pack(names);
NodeFS.writeFileSync(new URL("common-words.txt.gz", OUT), packedWords);
NodeFS.writeFileSync(new URL("first-names.txt.gz", OUT), packedNames);
NodeFS.writeFileSync(
  new URL("NOTICE.md", OUT),
  `# Normal word lists

Scribe uses these two packed lists to warn when a word fix also changes a normal word or first name.
Rebuild them with \`node scripts/build-normal-words.ts <folder with the unzipped SSA yobYYYY.txt files>\`.

## common-words.txt.gz

${words.size} words from the English Speller Database (ESDB, also known as SCOWL), size 35, US spelling,
made at ${WORDS_URL.split("?")[0]}. The license of the list, copied as the list states it:

\`\`\`text
${header.trim()}
\`\`\`

## first-names.txt.gz

${names.length} first names (not already in the word list) with ${MIN_BIRTHS} or more US births since 1880.
They come from the national baby names data of the Social Security Administration (SSA):
https://www.ssa.gov/oact/babynames/limits.html. That page states no reuse terms.
The SSA states at https://www.ssa.gov/policy/accessibility.html that the work of its staff is in the
public domain and not protected by copyright. Works of US federal government employees are also
public domain by law (17 U.S.C. 105).
`,
);
console.log(
  `words ${words.size} (${packedWords.length} B), names ${names.length} (${packedNames.length} B), total ${packedWords.length + packedNames.length} B`,
);
