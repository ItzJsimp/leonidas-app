// The Library tab's pure logic: strict readers for the course files and a search index.
// The caller reads the files (containment and size caps live on the server). This module does no I/O.

export class LibraryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LibraryError";
  }
}

const MAX_ROWS = 5_000;
const MAX_CELL = 20_000;
const MAX_QUIZ = 500;
const MAX_KEYWORDS = 30;
const MAX_TERMS = 8;
const STALE_DAYS = 30;
const DAY_MS = 86_400_000;

export const MANIFEST_COLUMNS = [
  "chapter",
  "chapter_title",
  "lesson",
  "title",
  "duration",
  "lesson_id",
  "tier",
  "transcript",
  "status",
] as const;
/** Columns a manifest may add after the nine above. Other names fail the column check. */
const MANIFEST_OPTIONAL = new Set(["keywords", "url"]);
const CARD_COLUMNS = ["front", "back", "citation"] as const;
const QUESTION_KEYS = ["id", "topic", "level", "source", "prompt", "correct", "options"];
const OPTION_KEYS = ["text", "why"];

/** An http or https link of 2,000 characters or fewer. */
export const isWebUrl = (value: string): boolean =>
  value.length <= 2_000 && /^https?:\/\//i.test(value) && URL.canParse(value);

/** Splits CSV text into rows of cells. Handles quotes, doubled quotes, CRLF and a byte order mark. */
export function parseCsvRows(text: string): string[][] {
  const src = text.startsWith("﻿") ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const endRow = () => {
    row.push(cell);
    cell = "";
    if (!(row.length === 1 && row[0] === "")) rows.push(row);
    row = [];
  };
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") endRow();
    else if (ch !== "\r") cell += ch;
    if (cell.length > MAX_CELL) throw new LibraryError("a cell is longer than 20,000 characters");
  }
  if (quoted) throw new LibraryError("a quoted cell is not closed");
  if (cell !== "" || row.length > 0) endRow();
  return rows;
}

export interface LibraryLesson {
  readonly chapter: string;
  readonly chapterTitle: string;
  readonly lesson: string;
  readonly title: string;
  readonly duration: string;
  readonly lessonId: string;
  readonly tier: string;
  /** A path relative to the manifest folder. The server checks it stays inside the pack. */
  readonly transcript: string;
  readonly status: string;
  readonly keywords: readonly string[];
  readonly url: string | null;
}

/** Reads `course/manifest.csv`. The nine columns must come first, in order. */
export function parseManifestCsv(text: string): LibraryLesson[] {
  const [header = [], ...rows] = parseCsvRows(text);
  const extra = header.slice(MANIFEST_COLUMNS.length);
  const columnsOk =
    MANIFEST_COLUMNS.every((name, index) => header[index] === name) &&
    extra.every((name) => MANIFEST_OPTIONAL.has(name)) &&
    new Set(header).size === header.length;
  if (!columnsOk) throw new LibraryError("manifest columns do not match");
  if (rows.length > MAX_ROWS) throw new LibraryError("manifest has more than 5,000 rows");
  return rows.map((cells, index) => {
    const n = index + 1;
    if (cells.length !== header.length) {
      throw new LibraryError(`row ${n} has ${cells.length} cells, not ${header.length}`);
    }
    const cell = (name: string) => (cells[header.indexOf(name)] ?? "").trim();
    const title = cell("title");
    if (title === "") throw new LibraryError(`row ${n} has no title`);
    const url = cell("url");
    if (url !== "" && !isWebUrl(url)) throw new LibraryError(`row ${n} has a bad url`);
    return {
      chapter: cell("chapter"),
      chapterTitle: cell("chapter_title"),
      lesson: cell("lesson"),
      title,
      duration: cell("duration"),
      lessonId: cell("lesson_id"),
      tier: cell("tier"),
      transcript: cell("transcript"),
      status: cell("status"),
      keywords: cell("keywords")
        .split(";")
        .map((word) => word.trim())
        .filter((word) => word !== "")
        .slice(0, MAX_KEYWORDS),
      url: url === "" ? null : url,
    };
  });
}

export interface LibraryCard {
  readonly front: string;
  readonly back: string;
  readonly citation: string;
}

/** Reads `drills/cards.csv`: front, back and citation. */
export function parseCardsCsv(text: string): LibraryCard[] {
  const [header = [], ...rows] = parseCsvRows(text);
  if (header.length !== CARD_COLUMNS.length || CARD_COLUMNS.some((name, i) => header[i] !== name)) {
    throw new LibraryError("cards columns do not match");
  }
  if (rows.length > MAX_ROWS) throw new LibraryError("cards has more than 5,000 rows");
  return rows.map((cells, index) => {
    if (cells.length !== CARD_COLUMNS.length) {
      throw new LibraryError(`card ${index + 1} has ${cells.length} cells, not 3`);
    }
    const [front = "", back = "", citation = ""] = cells.map((value) => value.trim());
    if (front === "" || back === "")
      throw new LibraryError(`card ${index + 1} needs a front and a back`);
    return { front, back, citation };
  });
}

export interface LibraryOption {
  readonly text: string;
  readonly why: string;
}

export interface LibraryQuestion {
  readonly id: string;
  readonly topic: string;
  readonly level: string;
  readonly source: string;
  readonly prompt: string;
  /** The index of the right option in `options`. */
  readonly correct: number;
  readonly options: readonly LibraryOption[];
}

function record(value: unknown, keys: readonly string[], where: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new LibraryError(`${where} needs an object`);
  }
  for (const key of Object.keys(value)) {
    if (!keys.includes(key)) throw new LibraryError(`${where} has an unknown key: ${key}`);
  }
  return value as Record<string, unknown>;
}

function text(value: unknown, where: string, max: number, allowEmpty = false): string {
  if (typeof value !== "string" || (!allowEmpty && value.trim() === "") || value.length > max) {
    throw new LibraryError(`${where} needs text of up to ${max} characters`);
  }
  return value;
}

function parseQuestion(item: unknown, n: number): LibraryQuestion {
  const where = `question ${n}`;
  const q = record(item, QUESTION_KEYS, where);
  if (!Array.isArray(q.options) || q.options.length < 2 || q.options.length > 8) {
    throw new LibraryError(`${where} needs 2 to 8 options`);
  }
  const options = q.options.map((option, index) => {
    const o = record(option, OPTION_KEYS, `${where} option ${index + 1}`);
    return {
      text: text(o.text, `${where} option ${index + 1}`, 500),
      why: text(o.why, `${where} option ${index + 1} why`, 1_000, true),
    };
  });
  if (
    typeof q.correct !== "number" ||
    !Number.isInteger(q.correct) ||
    q.correct < 0 ||
    q.correct >= options.length
  ) {
    throw new LibraryError(`${where} correct needs an option number`);
  }
  return {
    id: text(q.id, `${where} id`, 80),
    topic: text(q.topic, `${where} topic`, 200),
    level: text(q.level, `${where} level`, 40),
    source: text(q.source, `${where} source`, 500),
    prompt: text(q.prompt, `${where} prompt`, 2_000),
    correct: q.correct,
    options,
  };
}

/** Reads `drills/quiz.json`: a list of up to 500 questions with strict keys. */
export function parseQuizJson(input: string): LibraryQuestion[] {
  let data: unknown;
  try {
    data = JSON.parse(input);
  } catch {
    throw new LibraryError("quiz is not valid JSON");
  }
  if (!Array.isArray(data) || data.length > MAX_QUIZ) {
    throw new LibraryError("quiz needs a list of up to 500 questions");
  }
  return data.map((item, index) => parseQuestion(item, index + 1));
}

const FETCHED = /^- \*\*Fetched:\*\*\s*(\d{4}-\d{2}-\d{2})(?!\d)/m;

/** The day in a firm page's `- **Fetched:** YYYY-MM-DD.` line, or null when missing or bad. */
export function fetchDateOf(page: string): string | null {
  const found = FETCHED.exec(page)?.[1] ?? null;
  return found !== null && !Number.isNaN(Date.parse(`${found}T00:00:00Z`)) ? found : null;
}

/** True when a firm page is older than 30 days, or its date is missing or bad. */
export function isStale(fetchDate: string | null, now: number): boolean {
  if (fetchDate === null) return true;
  const fetched = Date.parse(`${fetchDate}T00:00:00Z`);
  return Number.isNaN(fetched) || now - fetched > STALE_DAYS * DAY_MS;
}

/** The first `# Heading` of a page, or the fallback (a file name) when there is none. */
export function headingOf(page: string, fallback: string): string {
  const line = page.split("\n").find((entry) => entry.startsWith("# "));
  return line === undefined ? fallback : line.slice(2).trim() || fallback;
}

export type LibraryKind = "lesson" | "knowledge" | "card" | "community";

export interface LibraryDoc {
  readonly kind: LibraryKind;
  readonly id: string;
  readonly title: string;
  readonly keywords: readonly string[];
  readonly body: string;
}

export interface LibraryHit {
  readonly kind: LibraryKind;
  readonly id: string;
  readonly title: string;
  readonly snippet: string;
}

export interface LibrarySearchIndex {
  readonly docs: readonly LibraryDoc[];
  /** Token to (doc position, best field score). */
  readonly postings: ReadonlyMap<string, ReadonlyMap<number, number>>;
}

const TITLE_SCORE = 3;
const KEYWORD_SCORE = 2;
const BODY_SCORE = 1;
const WORD = /[\p{L}\p{N}]+/gu;
const words = (value: string): string[] => value.toLowerCase().match(WORD) ?? [];

/** Builds the search index. Each word of a title, key word or body is one posting. */
export function buildIndex(docs: readonly LibraryDoc[]): LibrarySearchIndex {
  const postings = new Map<string, Map<number, number>>();
  docs.forEach((doc, docIndex) => {
    const fields: ReadonlyArray<readonly [readonly string[], number]> = [
      [words(doc.title), TITLE_SCORE],
      [doc.keywords.flatMap(words), KEYWORD_SCORE],
      [words(doc.body), BODY_SCORE],
    ];
    for (const [tokens, score] of fields) {
      for (const token of new Set(tokens)) {
        let post = postings.get(token);
        if (post === undefined) {
          post = new Map();
          postings.set(token, post);
        }
        if ((post.get(docIndex) ?? 0) < score) post.set(docIndex, score);
      }
    }
  });
  return { docs, postings };
}

/** A short piece of body text around the first term, or the start when no term shows. */
function snippetOf(body: string, terms: readonly string[]): string {
  const lower = body.toLowerCase();
  const found = terms.map((term) => lower.indexOf(term)).filter((at) => at >= 0);
  const start = Math.max(0, (found.length > 0 ? Math.min(...found) : 0) - 40);
  const piece = body
    .slice(start, start + 140)
    .replace(/\s+/g, " ")
    .trim();
  return `${start > 0 ? "..." : ""}${piece}${start + 140 < body.length ? "..." : ""}`;
}

/**
 * Finds docs that match every word of the query. A word matches a whole word or a word prefix,
 * case-insensitive. Title hits rank above key word hits, and those above body hits.
 */
export function search(index: LibrarySearchIndex, query: string, limit: number): LibraryHit[] {
  const terms = [...new Set(words(query))].slice(0, MAX_TERMS);
  if (terms.length === 0) return [];
  let scores: Map<number, number> | null = null;
  for (const term of terms) {
    const matched = new Map<number, number>();
    for (const [token, post] of index.postings) {
      if (!token.startsWith(term)) continue;
      for (const [docIndex, score] of post) {
        if ((matched.get(docIndex) ?? 0) < score) matched.set(docIndex, score);
      }
    }
    if (scores === null) {
      scores = matched;
    } else {
      const next = new Map<number, number>();
      for (const [docIndex, score] of scores) {
        const more = matched.get(docIndex);
        if (more !== undefined) next.set(docIndex, score + more);
      }
      scores = next;
    }
    if (scores.size === 0) return [];
  }
  return [...(scores ?? new Map<number, number>())]
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .slice(0, limit)
    .flatMap(([docIndex]) => {
      const doc = index.docs[docIndex];
      if (doc === undefined) return [];
      return [
        {
          kind: doc.kind,
          id: doc.id,
          title: doc.title,
          snippet: snippetOf(doc.body, terms),
        },
      ];
    });
}
