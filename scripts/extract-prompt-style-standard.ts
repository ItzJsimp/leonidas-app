// @effect-diagnostics nodeBuiltinImport:off globalConsole:off - Standalone operational CLI that rebuilds the prompt style standard from a history file outside any Effect runtime, where Node's synchronous read and one stdout summary line are the entire interface.
// Rebuilds packages/shared/src/promptStyleStandard.json from a Scribe history.jsonl.
// Usage: node scripts/extract-prompt-style-standard.ts <history.jsonl> [--out <file>]
// Anonymization rules are in ANONYMIZATION below and must stay in step with the review notes.
import * as NodeFS from "node:fs";

const AGENT_APP = /^(?:claude|codex|antigravity|cursor|windsurf|leonidas(?: code)?)(?:\.exe)?$/i;
const TARGET = 150;
const MIN_WORD_DOC_FREQ = 8; // a word must appear in this many distinct prompts to be allowed
const MAX_WORDS = 22;
const MIN_WORDS = 3;

export const ANONYMIZATION = [
  "Only finalized hands-free/dictation rows addressed to agent apps are read.",
  "Rows are split into sentences; each entry is one sentence (or never more than 22 words).",
  "Every word must appear in at least 8 distinct source prompts, so names, products and one-off details cannot pass.",
  "Sentences containing digits, URLs, emails, paths, code punctuation, quotes or capitalised mid-sentence words are dropped.",
  "Sentences with profanity, money, health, relationship or people-reference words are dropped.",
  "Filler openers (Okay, So, Yeah, And, Um) are stripped, the first letter is capitalised, and duplicates are merged.",
  "Output holds only the sentence text; no timestamps, apps, counts or raw text.",
];

const BLOCK =
  /\b(?:fuck\w*|shit\w*|damn|bitch\w*|ass|pissed|crap|money|dollar\w*|pay\w*|rent|bank|salary|price|invoice|tax\w*|doctor|sick|health|mom|dad|mum|mother|father|he|his|him|she|her|hers|they're|guys|guy|man|dude|bro|wife|girlfriend|boyfriend|friend|brother|sister|mob|jake|jacob|gersi|password|token|key|secret|login|email|phone|address)\b/i;
// Dictation fragments that read as broken sentences once taken out of context.
const FRAGMENT =
  /^(?:are |is because|when |what skills)|(?:to|add|that|the|I|too)\.$|^I want to (?:be |make sure that\.)|\betc\.|^I'd like you to\./i;
const FILLER = /^(?:okay|ok|so|yeah|yes|and|um|uh|well|alright|right|also|but|like|now)[,.]?\s+/i;

const input = process.argv[2];
if (!input) throw new Error("usage: extract-prompt-style-standard.ts <history.jsonl> [--out file]");
const outIndex = process.argv.indexOf("--out");
const out =
  outIndex > 0
    ? process.argv[outIndex + 1]!
    : new URL("../packages/shared/src/promptStyleStandard.json", import.meta.url).pathname.replace(
        /^\/([A-Za-z]:)/,
        "$1",
      );

const prompts: string[] = [];
for (const line of NodeFS.readFileSync(input, "utf8").split("\n")) {
  try {
    const row = JSON.parse(line) as Record<string, unknown>;
    if (!["hands-free", "ptt", "dictation"].includes(String(row.mode))) continue;
    if (typeof row.app !== "string" || !AGENT_APP.test(row.app)) continue;
    if (typeof row.cleaned_text === "string" && row.cleaned_text.trim())
      prompts.push(row.cleaned_text.trim());
  } catch {
    // skip partial rows
  }
}

const tokenize = (text: string) => text.toLowerCase().match(/[a-z']+/g) ?? [];
const docFreq = new Map<string, number>();
for (const prompt of prompts)
  for (const word of new Set(tokenize(prompt))) docFreq.set(word, (docFreq.get(word) ?? 0) + 1);

const sentences = new Map<string, { text: string; count: number }>();
for (const prompt of prompts) {
  for (const raw of prompt.split(/(?<=[.!?])\s+/)) {
    let sentence = raw.trim();
    for (let i = 0; i < 2; i++) sentence = sentence.replace(FILLER, "");
    sentence = sentence.charAt(0).toUpperCase() + sentence.slice(1);
    const words = tokenize(sentence);
    if (words.length < MIN_WORDS || words.length > MAX_WORDS) continue;
    if (!/[.?!]$/.test(sentence)) continue;
    if (/[0-9@\/:_#`"“”<>{}()[\]=*]/.test(sentence)) continue;
    if (/(?<![.!?]\s)(?<!^)\b[A-Z][a-z]+/.test(sentence.replace(/\bI\b/g, "i"))) continue;
    if (BLOCK.test(sentence)) continue;
    if (FRAGMENT.test(sentence)) continue;
    if (words.some((word) => (docFreq.get(word) ?? 0) < MIN_WORD_DOC_FREQ)) continue;
    if (/\.\.\.|…/.test(sentence)) continue;
    const key = sentence.toLowerCase();
    sentences.set(key, {
      text: sentence.replace(/i/g, "I"),
      count: (sentences.get(key)?.count ?? 0) + 1,
    });
  }
}

// Prefer imperative or question asks (typical follow-ups) over narration, then repeated phrasing.
const ASK =
  /^(?:can|could|please|let's|lets|make|add|fix|check|run|build|show|use|update|go|try|do|did|does|is|are|why|what|how|when|where|should|would|will|i want|i need|i'd like|we need|we should|there should|it should)\b/i;
const entries = [...sentences.entries()]
  .map(([key, { text, count }]) => ({
    text,
    question: text.endsWith("?"),
    score: (ASK.test(key) ? 10 : 0) + Math.min(count, 5) - tokenize(key).length / 10,
  }))
  .sort((a, b) => b.score - a.score || a.text.localeCompare(b.text));
// At most 40% questions so statements and commands (typical asks) are represented.
const picked = [
  ...entries.filter((entry) => !entry.question).slice(0, Math.ceil(TARGET * 0.6)),
  ...entries.filter((entry) => entry.question).slice(0, Math.floor(TARGET * 0.4)),
]
  .map((entry) => entry.text)
  .sort();

NodeFS.writeFileSync(
  out,
  `${JSON.stringify({ rules: ANONYMIZATION, prompts: picked }, null, 2)}\n`,
);
console.log(`${picked.length} entries from ${prompts.length} prompts -> ${out}`);
