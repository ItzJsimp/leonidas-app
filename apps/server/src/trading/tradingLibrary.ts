// @effect-diagnostics nodeBuiltinImport:off - resource ids come from node:crypto.
import {
  TradingStateError,
  type TradingLibraryIndexResult,
  type TradingLibrarySearchResult,
  type TradingResourceListResult,
  type TradingResourceSaveInput,
  type TradingResourceSaveResult,
} from "@t3tools/contracts";
import { writeFileStringAtomically } from "@t3tools/shared/atomicWrite";
import {
  buildIndex,
  fetchDateOf,
  headingOf,
  isStale,
  isWebUrl,
  parseCardsCsv,
  parseManifestCsv,
  parseQuizJson,
  search,
  type LibraryDoc,
  type LibraryKind,
  type LibraryLesson,
  type LibrarySearchIndex,
} from "@t3tools/trading";
import * as Clock from "effect/Clock";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as NodeCrypto from "node:crypto";

import { requireTradingRoot } from "./readTradingState.ts";
import { inside, readLinkedPack } from "./tradingPack.ts";

// The pack is untrusted. Every file is checked, and the caps keep one pack from using all memory.
const MAX_FILE_BYTES = 1_000_000;
const MAX_FILES = 5_000;
const MAX_TOTAL_BYTES = 64_000_000;
const MAX_PAGE_CHARS = 200_000;
const SEARCH_LIMIT = 30;
/** The index is kept per pack folder. The oldest folder goes when a fifth one loads. */
const CACHE_FOLDERS = 4;
const RESOURCE_KINDS = ["link", "note", "pdf", "discord", "call"] as const;

interface Page {
  readonly title: string;
  readonly text: string;
}

interface Snapshot {
  readonly view: TradingLibraryIndexResult;
  readonly search: LibrarySearchIndex;
  /** Keyed by `kind:id`. A page id is never a file path. */
  readonly pages: ReadonlyMap<string, Page>;
}

/** A file inside the pack that passed the containment, size and type checks. */
interface Located {
  readonly rel: string;
  readonly real: string;
  readonly mtime: number;
  readonly size: number;
}

const EMPTY_INDEX = buildIndex([]);
/** Snapshots per pack folder, keyed by the folder realpath. */
const CACHE = new Map<string, { readonly key: string; readonly snapshot: Snapshot }>();
const pageKey = (kind: string, id: string) => `${kind}:${id}`;

const emptySnapshot = (status: "none" | "invalid", reason: string | null): Snapshot => ({
  view: {
    status,
    reason,
    chapters: [],
    knowledge: [],
    community: [],
    firms: [],
    cards: [],
    quiz: [],
  },
  search: EMPTY_INDEX,
  pages: new Map(),
});

/** A relative path with forward slashes and no `..` part. The realpath check runs after this. */
const safeRelative = (rel: string) =>
  rel !== "" &&
  !rel.includes("\0") &&
  !rel.includes("\\") &&
  !rel.startsWith("/") &&
  !/^[a-z]:/i.test(rel) &&
  !rel.split("/").includes("..");

const joinRel = (dir: string, name: string) => (dir === "" ? name : `${dir}/${name}`);
const dirOf = (rel: string) => (rel.includes("/") ? rel.slice(0, rel.lastIndexOf("/")) : "");
const slugOf = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

/**
 * Finds one pack file. Null when it is missing, outside the pack (a symlink can do this),
 * not a file, or over 1 MB.
 */
const locate = Effect.fn("trading.locateLibraryFile")(function* (
  folder: string,
  real: string,
  rel: string,
) {
  if (!safeRelative(rel)) return null;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const target = yield* fs.realPath(path.join(folder, rel)).pipe(Effect.orElseSucceed(() => null));
  if (target === null || !inside(path, real, target)) return null;
  const info = yield* fs.stat(target).pipe(Effect.orElseSucceed(() => null));
  if (info === null || info.type !== "File" || Number(info.size) > MAX_FILE_BYTES) return null;
  return {
    rel,
    real: target,
    mtime: Option.match(info.mtime, { onNone: () => 0, onSome: (date) => date.getTime() }),
    size: Number(info.size),
  } satisfies Located;
});

/** The `.md` files directly in one pack folder, each checked by `locate`. */
const locateDir = Effect.fn("trading.locateLibraryDir")(function* (
  folder: string,
  real: string,
  dir: string,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const names = yield* fs
    .readDirectory(path.join(folder, dir))
    .pipe(Effect.orElseSucceed((): string[] => []));
  const found: Located[] = [];
  for (const name of names.toSorted()) {
    if (!name.endsWith(".md")) continue;
    const file = yield* locate(folder, real, joinRel(dir, name));
    if (file !== null) found.push(file);
  }
  return found;
});

const readText = Effect.fn("trading.readLibraryText")(function* (file: Located) {
  const fs = yield* FileSystem.FileSystem;
  return yield* fs.readFileString(file.real).pipe(Effect.orElseSucceed(() => null));
});

/** Reads and assembles the whole library. Returns an invalid snapshot for a bad or too big pack. */
const scanLibrary = Effect.fn("trading.scanLibrary")(function* (
  folder: string,
  library: Readonly<Record<string, string | undefined>>,
) {
  const fs = yield* FileSystem.FileSystem;
  const real = yield* fs.realPath(folder).pipe(Effect.orElseSucceed(() => null));
  if (real === null) return { status: "invalid", reason: "pack folder not found" } as const;

  // Pass 1: find every file, check the caps, and parse the manifest (it names the transcripts).
  const manifestRel = library.manifest ?? null;
  const manifest = manifestRel === null ? null : yield* locate(folder, real, manifestRel);
  if (manifestRel !== null && manifest === null) {
    return { status: "invalid", reason: "manifest not found" } as const;
  }
  const manifestText = manifest === null ? "" : yield* readText(manifest);
  let lessons: LibraryLesson[] = [];
  try {
    lessons = manifestText === null ? [] : parseManifestCsv(manifestText);
  } catch (error) {
    return { status: "invalid", reason: errorText(error) } as const;
  }
  const transcripts = new Map<string, Located>();
  for (const lesson of lessons) {
    if (lesson.transcript === "" || manifest === null) continue;
    const rel = joinRel(dirOf(manifest.rel), lesson.transcript);
    const file = yield* locate(folder, real, rel);
    if (file !== null) transcripts.set(rel, file);
  }
  const drills = library.drills ?? "";
  const cards = yield* locate(folder, real, joinRel(drills, "cards.csv"));
  const quiz = yield* locate(folder, real, joinRel(drills, "quiz.json"));
  const knowledge = yield* locateDir(folder, real, library.knowledge ?? "");
  const community = yield* locateDir(folder, real, library.community ?? "");
  const firms = yield* locateDir(folder, real, library.firms ?? "");

  const all = [
    ...(manifest === null ? [] : [manifest]),
    ...transcripts.values(),
    ...(cards === null ? [] : [cards]),
    ...(quiz === null ? [] : [quiz]),
    ...knowledge,
    ...community,
    ...firms,
  ];
  if (all.length > MAX_FILES) {
    return { status: "invalid", reason: "the library has more than 5,000 files" } as const;
  }
  const totalBytes = all.reduce((sum, file) => sum + file.size, 0);
  if (totalBytes > MAX_TOTAL_BYTES) {
    return { status: "invalid", reason: "the library is larger than 64 MB" } as const;
  }
  // shortcut: every call stats each pack file for the cache key, so 5,000 files cost 5,000 stats per call, add a folder watcher when search feels slow
  const key = `${real}|${all.length}|${totalBytes}|${all.reduce((latest, file) => Math.max(latest, file.mtime), 0)}`;
  const cached = CACHE.get(real);
  if (cached !== undefined && cached.key === key)
    return { status: "ready", snapshot: cached.snapshot } as const;

  // Pass 2: read the text, parse and build the snapshot. Only when a file changed.
  const texts = new Map<string, string>();
  for (const file of all) {
    const text = yield* readText(file);
    if (text !== null) texts.set(file.rel, text);
  }
  const now = yield* Clock.currentTimeMillis;
  const built = yield* Effect.try({
    try: () =>
      assemble(
        { lessons, manifestRel, transcripts, cards, quiz, knowledge, community, firms, texts },
        now,
      ),
    catch: (error) => errorText(error),
  }).pipe(Effect.orElseSucceed((reason) => reason));
  if (typeof built === "string") return { status: "invalid", reason: built } as const;
  CACHE.delete(real);
  CACHE.set(real, { key, snapshot: built });
  while (CACHE.size > CACHE_FOLDERS) {
    const oldest = CACHE.keys().next().value;
    if (oldest === undefined) break;
    CACHE.delete(oldest);
  }
  return { status: "ready", snapshot: built } as const;
});

const errorText = (error: unknown) => (error instanceof Error ? error.message : "bad library file");

interface Parts {
  readonly lessons: readonly LibraryLesson[];
  readonly manifestRel: string | null;
  readonly transcripts: ReadonlyMap<string, Located>;
  readonly cards: Located | null;
  readonly quiz: Located | null;
  readonly knowledge: readonly Located[];
  readonly community: readonly Located[];
  readonly firms: readonly Located[];
  readonly texts: ReadonlyMap<string, string>;
}

/** Builds the view, the search index and the page texts from the files that passed. Throws on a bad file. */
function assemble(parts: Parts, now: number): Snapshot {
  const { texts } = parts;
  const pages = new Map<string, Page>();
  const docs: LibraryDoc[] = [];
  type LessonView = TradingLibraryIndexResult["chapters"][number]["lessons"][number];
  const chapters = new Map<string, { number: string; title: string; lessons: LessonView[] }>();
  parts.lessons.forEach((lesson, index) => {
    const id = `lesson-${index + 1}`;
    const rel =
      lesson.transcript === "" || parts.manifestRel === null
        ? null
        : joinRel(dirOf(parts.manifestRel), lesson.transcript);
    const hasTranscript = rel !== null && parts.transcripts.has(rel);
    const body = hasTranscript ? (texts.get(rel) ?? "") : "";
    let chapter = chapters.get(lesson.chapter);
    if (chapter === undefined) {
      chapter = { number: lesson.chapter, title: lesson.chapterTitle, lessons: [] };
      chapters.set(lesson.chapter, chapter);
    }
    chapter.lessons.push({
      id,
      title: lesson.title,
      duration: lesson.duration,
      keywords: [...lesson.keywords],
      hasTranscript,
      url: lesson.url,
    });
    pages.set(pageKey("lesson", id), { title: lesson.title, text: body });
    docs.push({ kind: "lesson", id, title: lesson.title, keywords: lesson.keywords, body });
  });

  const pageList = (files: readonly Located[], kind: LibraryKind) => {
    const seen = new Set<string>();
    const out: { id: string; title: string }[] = [];
    for (const file of files) {
      const text = texts.get(file.rel) ?? "";
      const name = file.rel.slice(file.rel.lastIndexOf("/") + 1).replace(/\.md$/, "");
      const id = slugOf(name);
      if (id === "" || seen.has(id)) continue;
      seen.add(id);
      const title = headingOf(text, name);
      pages.set(pageKey(kind, id), { title, text });
      docs.push({ kind, id, title, keywords: [], body: text });
      out.push({ id, title });
    }
    return out;
  };
  const knowledge = pageList(parts.knowledge, "knowledge");
  const community = pageList(parts.community, "community");

  const firms = parts.firms.flatMap((file) => {
    const text = texts.get(file.rel) ?? "";
    const name = file.rel.slice(file.rel.lastIndexOf("/") + 1).replace(/\.md$/, "");
    const id = slugOf(name);
    if (id === "") return [];
    const fetchDate = fetchDateOf(text);
    const title = headingOf(text, name);
    pages.set(pageKey("firm", id), { title, text });
    return [{ id, name: title, fetchDate, stale: isStale(fetchDate, now) }];
  });

  const cards =
    parts.cards === null
      ? []
      : parseCardsCsv(texts.get(parts.cards.rel) ?? "").map((card, index) => {
          const id = `card-${index + 1}`;
          docs.push({
            kind: "card",
            id,
            title: card.front,
            keywords: [],
            body: `${card.back} ${card.citation}`,
          });
          return card;
        });
  const quiz = parts.quiz === null ? [] : parseQuizJson(texts.get(parts.quiz.rel) ?? "");

  return {
    view: {
      status: "ready",
      reason: null,
      chapters: [...chapters.values()],
      knowledge,
      community,
      firms,
      cards,
      quiz: quiz.map((question) => ({
        id: question.id,
        topic: question.topic,
        level: question.level,
        source: question.source,
        prompt: question.prompt,
        correct: question.correct,
        options: question.options.map((option) => ({ text: option.text, why: option.why })),
      })),
    },
    search: buildIndex(docs),
    pages,
  };
}

/** The library of the linked pack. Missing or bad packs are reported in `status`, never thrown. */
const loadSnapshot = Effect.fn("trading.loadLibrary")(function* (aiosRoot: string | null) {
  const root = yield* requireTradingRoot(aiosRoot);
  const linked = yield* readLinkedPack(root);
  if (linked.status === "none") return emptySnapshot("none", null);
  if (linked.status === "invalid") return emptySnapshot("invalid", linked.reason);
  const scan = yield* scanLibrary(linked.folder, linked.pack.library);
  if (scan.status === "invalid") return emptySnapshot("invalid", scan.reason);
  return scan.snapshot;
});

export const readLibraryIndex = Effect.fn("trading.readLibraryIndex")(function* (
  aiosRoot: string | null,
) {
  return (yield* loadSnapshot(aiosRoot)).view;
});

export const readLibraryPage = Effect.fn("trading.readLibraryPage")(function* (
  aiosRoot: string | null,
  input: { readonly kind: LibraryKind | "firm"; readonly id: string },
) {
  const snapshot = yield* loadSnapshot(aiosRoot);
  const page = snapshot.pages.get(pageKey(input.kind, input.id));
  if (page === undefined) return yield* new TradingStateError({ reason: "page_not_found" });
  return {
    id: input.id,
    title: page.title,
    text: page.text.slice(0, MAX_PAGE_CHARS),
    truncated: page.text.length > MAX_PAGE_CHARS,
  };
});

export const searchLibrary = Effect.fn("trading.searchLibrary")(function* (
  aiosRoot: string | null,
  input: { readonly query: string },
) {
  const snapshot = yield* loadSnapshot(aiosRoot);
  return {
    hits: search(snapshot.search, input.query, SEARCH_LIMIT),
  } satisfies TradingLibrarySearchResult;
});

/** The Markdown file of one resource. JSON strings are valid YAML and never hold a raw line break. */
function resourceFile(fields: {
  readonly kind: string;
  readonly title: string;
  readonly url: string | null;
  readonly savedAt: string;
  readonly text: string;
}): string {
  return [
    "---",
    `kind: ${JSON.stringify(fields.kind)}`,
    `title: ${JSON.stringify(fields.title)}`,
    `url: ${JSON.stringify(fields.url)}`,
    `savedAt: ${JSON.stringify(fields.savedAt)}`,
    "---",
    "",
    fields.text,
    "",
  ].join("\n");
}

/** Writes a resource as Markdown. Private goes to `trading/resources`, Crew to the outbox. */
export const saveResource = Effect.fn("trading.saveResource")(function* (
  aiosRoot: string | null,
  input: TradingResourceSaveInput,
) {
  const root = yield* requireTradingRoot(aiosRoot);
  const title = input.title.trim();
  if (title === "") {
    return yield* new TradingStateError({ reason: "invalid_resource", detail: "title is empty" });
  }
  if (title.length > 200 || (input.text?.length ?? 0) > 20_000) {
    return yield* new TradingStateError({
      reason: "invalid_resource",
      detail: "title is over 200 characters or text is over 20,000",
    });
  }
  if (input.url !== undefined && !isWebUrl(input.url)) {
    return yield* new TradingStateError({
      reason: "invalid_resource",
      detail: "url must start with https:// or http://",
    });
  }
  const id = NodeCrypto.randomUUID();
  const savedAt = DateTime.formatIso(DateTime.makeUnsafe(yield* Clock.currentTimeMillis));
  const contents = resourceFile({
    kind: input.kind,
    title,
    url: input.url ?? null,
    savedAt,
    text: input.text ?? "",
  });
  const path = yield* Path.Path;
  const folder = input.private ? "resources" : "crew-outbox";
  yield* writeFileStringAtomically({
    filePath: path.join(root, "trading", folder, `${id}.md`),
    contents,
  }).pipe(Effect.mapError(() => new TradingStateError({ reason: "read_failed" })));
  return { id } satisfies TradingResourceSaveResult;
});

type ResourceView = TradingResourceListResult["resources"][number];

/** Reads the front matter of one saved resource. Null when the front matter is not valid. */
function parseResource(text: string, id: string): Omit<ResourceView, "private"> | null {
  const lines = text.split("\n");
  if (lines[0] !== "---") return null;
  const end = lines.indexOf("---", 1);
  if (end < 0) return null;
  const fields = new Map<string, unknown>();
  for (const line of lines.slice(1, end)) {
    const match = /^(\w+): (.*)$/.exec(line.replace(/\r$/, ""));
    if (match === null) return null;
    try {
      fields.set(match[1] ?? "", JSON.parse(match[2] ?? ""));
    } catch {
      return null;
    }
  }
  const kind = fields.get("kind");
  const title = fields.get("title");
  const url = fields.get("url");
  const savedAt = fields.get("savedAt");
  if (
    typeof kind !== "string" ||
    !(RESOURCE_KINDS as readonly string[]).includes(kind) ||
    typeof title !== "string" ||
    (url !== null && typeof url !== "string") ||
    typeof savedAt !== "string"
  ) {
    return null;
  }
  return { id, kind: kind as ResourceView["kind"], title, url, savedAt };
}

/** The saved resources in both folders, newest first. Files that do not parse are skipped. */
export const listResources = Effect.fn("trading.listResources")(function* (
  aiosRoot: string | null,
) {
  const root = yield* requireTradingRoot(aiosRoot);
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const resources: ResourceView[] = [];
  for (const [folder, isPrivate] of [
    ["resources", true],
    ["crew-outbox", false],
  ] as const) {
    const dir = path.join(root, "trading", folder);
    const names = yield* fs.readDirectory(dir).pipe(Effect.orElseSucceed((): string[] => []));
    for (const name of names.toSorted().slice(0, MAX_FILES)) {
      const match = /^([0-9a-z-]+)\.md$/.exec(name);
      if (match === null) continue;
      const file = path.join(dir, name);
      const info = yield* fs.stat(file).pipe(Effect.orElseSucceed(() => null));
      if (info === null || info.type !== "File" || Number(info.size) > MAX_FILE_BYTES) continue;
      const text = yield* fs.readFileString(file).pipe(Effect.orElseSucceed(() => null));
      const item = text === null ? null : parseResource(text, match[1] ?? "");
      if (item !== null) resources.push({ ...item, private: isPrivate });
    }
  }
  return {
    resources: resources.toSorted((a, b) => b.savedAt.localeCompare(a.savedAt)),
  } satisfies TradingResourceListResult;
});
