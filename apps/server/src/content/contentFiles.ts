// @effect-diagnostics nodeBuiltinImport:off - content is plain files that people, scripts and Git also read.
import {
  CONTENT_STAGES,
  type ContentApproval,
  type ContentBadRecord,
  ContentDeal,
  type ContentScorecard,
  type ContentStage,
  ContentVideo,
  type ContentActor,
} from "@t3tools/contracts";
import * as Exit from "effect/Exit";
import * as Schema from "effect/Schema";
import * as NodeCrypto from "node:crypto";
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import { parse as parseYaml } from "yaml";

import { canMove } from "./stages.ts";

/** Each contracted deal is `deals/<slug>/deal.md`. A `_` folder (like `_lens`) is never a deal. */
export const DEALS_DIR = "deals";
/** Lens files that are not deals: the voice bible, settings and proposed deals. */
export const LENS_DIR = "_lens";

const SLUG = /^[a-z0-9][a-z0-9-]{0,62}$/;
const VIDEO_FILE = /^(\d{2}-[a-z0-9][a-z0-9-]{0,62})\.md$/;
/** A file over this size is reported, not read, so one huge file cannot stall the server. */
const MAX_FILE_BYTES = 1_000_000;
/** shortcut: a fixed speaking rate of 150 words a minute; measure Gersi's real rate when the learning job has data. */
const WORDS_PER_SECOND = 2.5;
const LOW_HOOK_SCORE = 7;
/** Spoken length further than this share from the target warns. */
const LENGTH_TOLERANCE = 0.2;

export class ContentError extends Error {
  override readonly name = "ContentError";
}

export interface Read<A> {
  readonly records: ReadonlyArray<A>;
  readonly bad: ReadonlyArray<ContentBadRecord>;
}

export const dealDir = (root: string, slug: string) => NodePath.join(root, DEALS_DIR, slug);
const videoPath = (root: string, deal: string, file: string) =>
  NodePath.join(dealDir(root, deal), `${file}.md`);
const rel = (root: string, file: string) => NodePath.relative(root, file).replaceAll("\\", "/");

function readCapped(file: string): string | null {
  return NodeFS.statSync(file).size > MAX_FILE_BYTES ? null : NodeFS.readFileSync(file, "utf8");
}

function decodeWith<A>(schema: Schema.Codec<A, unknown>) {
  const decode = Schema.decodeUnknownExit(schema);
  return (value: unknown): A | null => {
    const exit = decode(value);
    return Exit.isSuccess(exit) ? exit.value : null;
  };
}
const decodeVideo = decodeWith(ContentVideo);
const decodeDeal = decodeWith(ContentDeal);

export interface Parsed {
  readonly front: Record<string, unknown>;
  readonly body: string;
}

/** YAML frontmatter and the body, line endings made LF. Null when there is no valid frontmatter. */
export function parseFile(text: string): Parsed | null {
  const match = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(text.replaceAll("\r\n", "\n"));
  if (!match) return null;
  try {
    const front = parseYaml(match[1]!) as unknown;
    return front !== null && typeof front === "object" && !Array.isArray(front)
      ? { front: front as Record<string, unknown>, body: match[2]! }
      : null;
  } catch {
    return null;
  }
}

/** The text under each `## ` heading, keyed by the lower-case heading. */
export function sections(body: string): Map<string, string> {
  const found = new Map<string, string>();
  const parts = body.split(/^## +/m).slice(1);
  for (const part of parts) {
    const newline = part.indexOf("\n");
    const heading = (newline < 0 ? part : part.slice(0, newline)).trim().toLowerCase();
    found.set(heading, newline < 0 ? "" : part.slice(newline + 1).trim());
  }
  return found;
}

const str = (value: unknown) =>
  typeof value === "string" && value.trim() !== ""
    ? value
    : typeof value === "number"
      ? String(value)
      : undefined;
const num = (value: unknown) => (typeof value === "number" ? value : undefined);
const strings = (value: unknown) =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
const optional = <K extends string, V>(key: K, value: V | undefined) =>
  value === undefined ? {} : ({ [key]: value } as Record<K, V>);

/** The script text that an approval covers. Line endings and outer space do not count. */
export function scriptHash(script: string): string {
  return NodeCrypto.createHash("sha256")
    .update(script.replaceAll("\r\n", "\n").trim())
    .digest("hex");
}

export interface ApprovalFields {
  readonly deal: string;
  readonly file: string;
  readonly scriptHash: string;
  readonly approvedBy: string;
  readonly approvedAt: string;
}

export function signApproval(key: Uint8Array, fields: ApprovalFields): string {
  return NodeCrypto.createHmac("sha256", key)
    .update(
      [fields.deal, fields.file, fields.scriptHash, fields.approvedBy, fields.approvedAt].join("|"),
    )
    .digest("hex");
}

function approvalOf(
  key: Uint8Array,
  deal: string,
  file: string,
  front: Record<string, unknown>,
  script: string,
): ContentApproval {
  const approvedBy = str(front.approved_by);
  const approvedAt = str(front.approved_at);
  const signedHash = str(front.script_hash);
  const sig = str(front.approval_sig);
  if (!approvedBy) return "none";
  if (!approvedAt || !signedHash || !sig || !/^[0-9a-f]{64}$/.test(sig)) return "unsigned";
  const expected = Buffer.from(
    signApproval(key, { deal, file, scriptHash: signedHash, approvedBy, approvedAt }),
    "hex",
  );
  if (!NodeCrypto.timingSafeEqual(Buffer.from(sig, "hex"), expected)) return "unsigned";
  return signedHash === scriptHash(script) ? "approved" : "content_changed";
}

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** True when `phrase` is in `text` as whole words, any case. */
const says = (text: string, phrase: string) =>
  phrase.trim() !== "" &&
  new RegExp(`(?<![\\p{L}\\p{N}])${escape(phrase.trim())}(?![\\p{L}\\p{N}])`, "iu").test(text);

function spokenSeconds(script: string): number {
  const words = script
    .split("\n")
    .map((line) => /^\s*(?:[-*]\s*)?SPOKEN:\s*(.*)$/i.exec(line)?.[1] ?? "")
    .join(" ")
    .split(/\s+/)
    .filter((word) => /[\p{L}\p{N}]/u.test(word)).length;
  return Math.round(words / WORDS_PER_SECOND);
}

export interface Rules {
  readonly bannedWords: ReadonlyArray<string>;
  readonly doNot: ReadonlyArray<string>;
}

/** The server counts length and rule hits itself; an agent cannot report a clean card it did not earn. */
function scorecard(
  script: string,
  rules: Rules,
  given: { hookScore?: number; targetSeconds?: number; writerModel?: string; criticModel?: string },
): ContentScorecard {
  const seconds = spokenSeconds(script);
  const bannedWords = rules.bannedWords.filter((word) => says(script, word));
  const doNotHits = rules.doNot.filter((phrase) => says(script, phrase));
  const warnings: Array<string> = [];
  if (given.hookScore !== undefined && given.hookScore < LOW_HOOK_SCORE)
    warnings.push(`Hook score ${given.hookScore} is under ${LOW_HOOK_SCORE}.`);
  if (
    given.targetSeconds !== undefined &&
    given.targetSeconds > 0 &&
    Math.abs(seconds - given.targetSeconds) > given.targetSeconds * LENGTH_TOLERANCE
  )
    warnings.push(`Spoken length ${seconds} s is far from the ${given.targetSeconds} s target.`);
  return {
    ...optional("hookScore", given.hookScore),
    spokenSeconds: seconds,
    ...optional("targetSeconds", given.targetSeconds),
    bannedWords,
    doNotHits,
    ...optional("writerModel", given.writerModel),
    ...optional("criticModel", given.criticModel),
    blocks: [
      ...bannedWords.map((word) => `Banned word: "${word}"`),
      ...doNotHits.map((phrase) => `Brand do-not: "${phrase}"`),
    ],
    warnings,
  };
}

/** The voice bible text and its banned words. Empty when the file is missing. */
export function readVoiceBible(root: string): {
  readonly text: string;
  readonly bannedWords: ReadonlyArray<string>;
} {
  const file = NodePath.join(root, DEALS_DIR, LENS_DIR, "voice-bible.md");
  if (!NodeFS.existsSync(file)) return { text: "", bannedWords: [] };
  const text = readCapped(file) ?? "";
  return { text, bannedWords: strings(parseFile(text)?.front.banned_words) };
}

const REVIEW = CONTENT_STAGES.indexOf("script_review");

function readVideo(
  root: string,
  key: Uint8Array,
  deal: string,
  file: string,
  rules: Rules,
): ContentVideo | ContentBadRecord {
  const path = videoPath(root, deal, file);
  const text = readCapped(path);
  const bad = (reason: string): ContentBadRecord => ({ file: rel(root, path), reason });
  if (text === null) return bad("the file is over 1 MB");
  const parsed = parseFile(text);
  if (!parsed) return bad("no frontmatter");
  const { front } = parsed;
  const parts = sections(parsed.body);
  const script = parts.get("script") ?? "";
  const fileStage = front.stage as ContentStage;
  const approval = approvalOf(key, deal, file, front, script);
  // Past review needs a signed approval of this exact script. Without it the video waits in review.
  const stage =
    CONTENT_STAGES.indexOf(fileStage) > REVIEW && approval !== "approved"
      ? "script_review"
      : fileStage;
  const lengthS = num(front.length_s);
  const video = decodeVideo({
    deal,
    file,
    id: str(front.id) ?? `${deal}/${file}`,
    title: str(front.title) ?? file,
    stage,
    ...optional("stageChanged", str(front.stage_changed)),
    ...optional("pen", str(front.pen)),
    approval,
    ...optional("approvedBy", approval === "approved" ? str(front.approved_by) : undefined),
    ...optional("approvedAt", approval === "approved" ? str(front.approved_at) : undefined),
    revision: num(front.revision) ?? 0,
    ...optional("hookType", str(front.hook_type)),
    ...optional("lengthS", lengthS),
    ...optional("due", str(front.due)),
    footage: strings(front.footage),
    idea: parts.get("idea") ?? "",
    script,
    shotList: parts.get("shot list") ?? "",
    notes: parts.get("notes") ?? "",
    scorecard: scorecard(script, rules, {
      ...optional("hookScore", num(front.hook_score)),
      ...optional("targetSeconds", lengthS),
      ...optional("writerModel", str(front.writer_model)),
      ...optional("criticModel", str(front.critic_model)),
    }),
  });
  return video ?? bad("does not match the video schema");
}

function readDealIn(
  root: string,
  key: Uint8Array,
  slug: string,
  bannedWords: ReadonlyArray<string>,
): { deal: ContentDeal | null; bad: Array<ContentBadRecord> } {
  const card = NodePath.join(dealDir(root, slug), "deal.md");
  const text = readCapped(card);
  const parsed = text === null ? null : parseFile(text);
  if (!parsed) {
    return { deal: null, bad: [{ file: rel(root, card), reason: "no frontmatter" }] };
  }
  const doNot = strings(parsed.front.do_not);
  const bad: Array<ContentBadRecord> = [];
  const videos: Array<ContentVideo> = [];
  for (const name of NodeFS.readdirSync(dealDir(root, slug)).toSorted()) {
    const file = VIDEO_FILE.exec(name)?.[1];
    if (!file) continue;
    const read = readVideo(root, key, slug, file, { bannedWords, doNot });
    if ("reason" in read) bad.push(read);
    else videos.push(read);
  }
  const deal = decodeDeal({
    slug,
    brand: str(parsed.front.brand) ?? str(parsed.front.title) ?? slug,
    ...optional("stage", str(parsed.front.stage)),
    ...optional("driveFolderId", str(parsed.front.drive_folder_id)),
    ...optional("productReceived", str(parsed.front.product_received)),
    ...optional("brief", str(parsed.front.brief)),
    doNot,
    videos,
  });
  if (!deal) bad.push({ file: rel(root, card), reason: "does not match the deal schema" });
  return { deal, bad };
}

const isDealFolder = (root: string, slug: string) =>
  SLUG.test(slug) && NodeFS.existsSync(NodePath.join(dealDir(root, slug), "deal.md"));

/**
 * Every folder deal and its videos. Flat `deals/<slug>.md` prospects never show.
 * shortcut: sync full reads of every deal, fine at tens of deals; cache by file mtime past about 200 videos.
 */
export function listDeals(root: string, key: Uint8Array): Read<ContentDeal> {
  const base = NodePath.join(root, DEALS_DIR);
  if (!NodeFS.existsSync(base)) return { records: [], bad: [] };
  const { bannedWords } = readVoiceBible(root);
  const records: Array<ContentDeal> = [];
  const bad: Array<ContentBadRecord> = [];
  for (const entry of NodeFS.readdirSync(base, { withFileTypes: true }).toSorted((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    if (!entry.isDirectory() || !isDealFolder(root, entry.name)) continue;
    const read = readDealIn(root, key, entry.name, bannedWords);
    if (read.deal) records.push(read.deal);
    bad.push(...read.bad);
  }
  return { records, bad };
}

/** One deal by slug, or null. The slug check keeps every path inside `deals/`. */
export function readDeal(root: string, key: Uint8Array, slug: string): ContentDeal | null {
  if (!isDealFolder(root, slug)) return null;
  return readDealIn(root, key, slug, readVoiceBible(root).bannedWords).deal;
}

type FrontValue = string | number | null;

/** The file's line ending, so a write keeps CRLF files CRLF. */
const eolOf = (text: string) => (text.includes("\r\n") ? "\r\n" : "\n");

/** A plain word like `scripting` stays bare; anything YAML could misread is quoted. */
const yamlScalar = (value: string | number) =>
  typeof value === "number" ||
  (/^[a-z][a-z0-9_]*$/.test(value) && !/^(true|false|yes|no|on|off|null|y|n)$/.test(value))
    ? String(value)
    : JSON.stringify(value);

/**
 * Sets top-level frontmatter keys in place; `null` removes one. Other lines and the body stay
 * byte for byte, so Git shows only the real change.
 */
function setFront(text: string, fields: Readonly<Record<string, FrontValue>>): string {
  const eol = eolOf(text);
  const match = /^---\n([\s\S]*?)(\n---[\s\S]*)$/.exec(text.replaceAll("\r\n", "\n"));
  if (!match) throw new ContentError("The file has no frontmatter.");
  const lines = match[1]!.split("\n");
  for (const [key, value] of Object.entries(fields)) {
    const at = lines.findIndex((line) => line.startsWith(`${key}:`));
    const line = value === null ? [] : [`${key}: ${yamlScalar(value)}`];
    if (at < 0) {
      lines.push(...line);
      continue;
    }
    // A list or map value goes on in the indented or dash lines below the key.
    let span = 1;
    while (at + span < lines.length && /^(\s|-\s)/.test(lines[at + span]!)) span += 1;
    lines.splice(at, span, ...line);
  }
  return `---\n${lines.join("\n")}${match[2]}`.replaceAll("\n", eol);
}

/** Replaces the text under one `## ` heading, or adds the section at the end. */
export function setSection(text: string, heading: string, content: string): string {
  const eol = eolOf(text);
  const lf = text.replaceAll("\r\n", "\n");
  const pattern = new RegExp(
    String.raw`(^## +${escape(heading)}[ \t]*\n)([\s\S]*?)(?=^## |(?![\s\S]))`,
    "mi",
  );
  const next = pattern.test(lf)
    ? lf.replace(pattern, (_all, head: string, _old: string, offset: number) => {
        const last = !/^## /m.test(lf.slice(offset + head.length));
        return `${head}\n${content}\n${last ? "" : "\n"}`;
      })
    : `${lf.trimEnd()}\n\n## ${heading}\n\n${content}\n`;
  return next.replaceAll("\n", eol);
}

/** One video as the lens reads it. A bad or missing file is a clear error. */
export function findVideo(root: string, key: Uint8Array, deal: string, file: string): ContentVideo {
  const video = readDeal(root, key, deal)?.videos.find((candidate) => candidate.file === file);
  if (!video) throw new ContentError(`No video ${deal}/${file}.`);
  return video;
}

export interface MoveInput {
  readonly deal: string;
  readonly file: string;
  readonly to: ContentStage;
  /** Added to Notes, for example the change a person asks for. */
  readonly note?: string | undefined;
}

/**
 * Moves a video one stage under the stage rules. A person's approval is signed over the exact
 * script; a move back to review or earlier clears it.
 */
export function moveStage(
  root: string,
  key: Uint8Array,
  input: MoveInput,
  actor: ContentActor,
  now: string,
): ContentVideo {
  const current = findVideo(root, key, input.deal, input.file);
  const check = canMove(current.stage, input.to, actor.kind);
  if (!check.ok) throw new ContentError(check.reason);
  const approving = current.stage === "script_review" && input.to === "ready_to_film";
  if (approving && actor.kind !== "member")
    throw new ContentError("Only a person approves a script.");
  const blocks = current.scorecard.blocks;
  if (input.to === "script_review" && !check.undo && blocks.length > 0) {
    throw new ContentError(
      `This script breaks a rule: ${blocks.join("; ")}. Change the script, then move it again.`,
    );
  }
  const fields: Record<string, FrontValue> = {
    stage: input.to,
    stage_changed: now,
    ...(approving
      ? approvalFields(key, input, current.script, actor.name, now)
      : CONTENT_STAGES.indexOf(input.to) <= REVIEW
        ? NO_APPROVAL
        : {}),
  };
  const path = videoPath(root, input.deal, input.file);
  let text = setFront(NodeFS.readFileSync(path, "utf8"), fields);
  const note = input.note?.trim();
  if (note) {
    const line = `- ${now.slice(0, 10)} ${actor.name}: ${note}`;
    text = setSection(text, "Notes", current.notes ? `${current.notes}\n${line}` : line);
  }
  NodeFS.writeFileSync(path, text);
  return findVideo(root, key, input.deal, input.file);
}

const NO_APPROVAL: Record<string, FrontValue> = {
  approved_by: null,
  approved_at: null,
  script_hash: null,
  approval_sig: null,
};

/** A person's signed approval of this exact script. */
function approvalFields(
  key: Uint8Array,
  ref: { readonly deal: string; readonly file: string },
  script: string,
  approvedBy: string,
  approvedAt: string,
): Record<string, FrontValue> {
  const hash = scriptHash(script);
  return {
    approved_by: approvedBy,
    approved_at: approvedAt,
    script_hash: hash,
    approval_sig: signApproval(key, { ...ref, scriptHash: hash, approvedBy, approvedAt }),
  };
}

/** The scorecard as readable lines, for people who open the file outside the app. */
function renderScorecard(card: ContentScorecard): string {
  const none = (items: ReadonlyArray<string>) => (items.length ? items.join(", ") : "none");
  return [
    `- Hook score: ${card.hookScore === undefined ? "not given" : `${card.hookScore}/10`}`,
    `- Spoken: ${card.spokenSeconds} s${card.targetSeconds ? ` (target ${card.targetSeconds} s)` : ""}`,
    `- Banned words: ${none(card.bannedWords)}`,
    `- Brand do-nots: ${none(card.doNotHits)}`,
    `- Writer: ${card.writerModel ?? "not given"}. Critic: ${card.criticModel ?? "not given"}.`,
    ...card.warnings.map((warning) => `- Warning: ${warning}`),
  ].join("\n");
}

export interface ScriptInput {
  readonly deal: string;
  readonly file: string;
  readonly script: string;
  /** Agent drafts only: the critic's hook score from 0 to 10 and the models used. */
  readonly hookScore?: number | undefined;
  readonly writerModel?: string | undefined;
  readonly criticModel?: string | undefined;
}

/** Agents edit a script only before review. A person may edit it at any stage. */
const AGENT_EDIT_STAGES: ReadonlySet<ContentStage> = new Set(["idea", "scripting"]);

/**
 * Saves a script and its scorecard. A person's edit of an approved script stays approved under
 * their name, because a person may approve. Any other edit after approval voids it.
 */
export function saveScript(
  root: string,
  key: Uint8Array,
  input: ScriptInput,
  actor: ContentActor,
  now: string,
): ContentVideo {
  const current = findVideo(root, key, input.deal, input.file);
  if (actor.kind === "agent" && !AGENT_EDIT_STAGES.has(current.stage)) {
    throw new ContentError(
      `Agents edit a script only in idea or scripting. This video is in ${current.stage}.`,
    );
  }
  const script = input.script.replaceAll("\r\n", "\n").trim();
  if (script === "") throw new ContentError("The script is empty.");
  const fields: Record<string, FrontValue> = {
    pen: actor.kind === "agent" ? "agent" : actor.name.toLowerCase(),
    ...(actor.kind === "agent"
      ? {
          hook_score: input.hookScore ?? null,
          writer_model: input.writerModel ?? null,
          critic_model: input.criticModel ?? null,
        }
      : {}),
    ...(actor.kind === "member" && current.approval === "approved"
      ? approvalFields(key, input, script, actor.name, now)
      : {}),
  };
  const path = videoPath(root, input.deal, input.file);
  NodeFS.writeFileSync(
    path,
    setSection(setFront(NodeFS.readFileSync(path, "utf8"), fields), "Script", script),
  );
  const saved = findVideo(root, key, input.deal, input.file);
  NodeFS.writeFileSync(
    path,
    setSection(NodeFS.readFileSync(path, "utf8"), "Scorecard", renderScorecard(saved.scorecard)),
  );
  return saved;
}

/** The deal card body (brief, terms, notes) for agents that draft for this deal. */
export function dealCard(root: string, slug: string): string {
  if (!isDealFolder(root, slug)) throw new ContentError(`No deal ${slug}. Read the deals first.`);
  const text = readCapped(NodePath.join(dealDir(root, slug), "deal.md")) ?? "";
  return parseFile(text)?.body.trim() ?? "";
}

const MAX_VIDEOS = 99;

/** A file slug from a title: lower case, dashes, at most 50 characters. */
const slugOf = (title: string) =>
  title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50)
    .replace(/-+$/, "") || "video";

/** Adds a video in `idea` as the next numbered file of the deal. */
export function createVideo(
  root: string,
  key: Uint8Array,
  input: { readonly deal: string; readonly title: string; readonly idea: string },
  actor: ContentActor,
  now: string,
): ContentVideo {
  if (!isDealFolder(root, input.deal)) {
    throw new ContentError(`No deal ${input.deal}. Read the deals first.`);
  }
  const numbers = NodeFS.readdirSync(dealDir(root, input.deal))
    .map((name) => Number(VIDEO_FILE.exec(name)?.[1]?.slice(0, 2) ?? 0))
    .filter((n) => n > 0);
  const next = Math.max(0, ...numbers) + 1;
  if (next > MAX_VIDEOS) throw new ContentError(`A deal holds at most ${MAX_VIDEOS} videos.`);
  const nn = String(next).padStart(2, "0");
  const file = `${nn}-${slugOf(input.title)}`;
  const front = [
    "type: video",
    `id: ${JSON.stringify(`video-${input.deal}-${nn}`)}`,
    `deal: ${input.deal}`,
    `title: ${JSON.stringify(input.title.trim())}`,
    "stage: idea",
    `stage_changed: ${JSON.stringify(now)}`,
    `pen: ${JSON.stringify(actor.kind === "agent" ? "agent" : actor.name.toLowerCase())}`,
    "revision: 0",
    "footage: []",
  ];
  const body = [
    "## Idea",
    "",
    input.idea.trim(),
    "",
    "## Script",
    "",
    "## Shot list",
    "",
    "## Notes",
    "",
  ];
  // `wx` refuses to replace a file that appeared since the directory read.
  NodeFS.writeFileSync(
    videoPath(root, input.deal, file),
    `---\n${front.join("\n")}\n---\n${body.join("\n")}`,
    {
      flag: "wx",
    },
  );
  return findVideo(root, key, input.deal, file);
}

export interface DealInput {
  readonly brand: string;
  readonly contact?: string | undefined;
  /** Free text, kept as written in the deal body. */
  readonly terms?: string | undefined;
  /** `YYYY-MM-DD`. */
  readonly deadline?: string | undefined;
  /** A Drive folder link or its id. */
  readonly driveFolder?: string | undefined;
  readonly briefLink?: string | undefined;
}

/** One line of text: any line break or run of spaces becomes a single space. */
export const oneLine = (text: string | undefined) => (text ?? "").replace(/\s+/g, " ").trim();
const DRIVE_FOLDER_LINK = /\/folders\/([A-Za-z0-9_-]+)/;
const DRIVE_FOLDER_ID = /^[A-Za-z0-9_-]{6,}$/;

export interface CleanDeal {
  readonly slug: string;
  readonly brand: string;
  readonly contact: string;
  readonly terms: string;
  readonly deadline: string;
  readonly driveId: string;
  readonly briefLink: string;
}

/** `key: "value"` lines for the filled fields. Every value is one quoted line, so no text adds a key. */
export const dealFront = (clean: CleanDeal): Array<string> => [
  `brand: ${JSON.stringify(clean.brand)}`,
  ...(clean.contact ? [`contact: ${JSON.stringify(clean.contact)}`] : []),
  ...(clean.deadline ? [`deadline: ${JSON.stringify(clean.deadline)}`] : []),
  ...(clean.driveId ? [`drive_folder_id: ${JSON.stringify(clean.driveId)}`] : []),
  ...(clean.briefLink ? [`brief: ${JSON.stringify(clean.briefLink)}`] : []),
];

export const isSlug = (text: string) => SLUG.test(text);

/** Checks and cleans what a person or an agent typed for a deal. Throws a plain message. */
export function normalizeDeal(input: DealInput): CleanDeal {
  const brand = oneLine(input.brand);
  if (!brand) throw new ContentError("Type the brand name.");
  if (!/[a-z0-9]/i.test(brand)) throw new ContentError("Use letters or numbers in the brand name.");
  const deadline = oneLine(input.deadline);
  if (deadline && !/^\d{4}-\d{2}-\d{2}$/.test(deadline)) {
    throw new ContentError("Write the deadline as YYYY-MM-DD.");
  }
  const briefLink = oneLine(input.briefLink);
  if (briefLink && !/^https?:\/\/\S+$/i.test(briefLink)) {
    throw new ContentError("The brief must be a web link that starts with http or https.");
  }
  const drive = oneLine(input.driveFolder);
  const driveId = DRIVE_FOLDER_LINK.exec(drive)?.[1] ?? (DRIVE_FOLDER_ID.test(drive) ? drive : "");
  if (drive && !driveId) {
    throw new ContentError("Paste a Drive folder link, or its id.");
  }
  return {
    slug: slugOf(brand),
    brand,
    contact: oneLine(input.contact),
    terms: (input.terms ?? "").replaceAll("\r\n", "\n").trim(),
    deadline,
    driveId,
    briefLink,
  };
}

/**
 * Starts a contracted deal: `deals/<slug>/deal.md`. It never replaces a deal, and no text can
 * add a frontmatter key or leave the `deals/` folder.
 */
export function createDeal(
  root: string,
  key: Uint8Array,
  input: DealInput,
  now: string,
): ContentDeal {
  const clean = normalizeDeal(input);
  const { slug, brand, terms } = clean;
  const front = [
    `id: ${JSON.stringify(`deal-${slug}`)}`,
    "type: deal",
    ...dealFront(clean),
    'stage: "contracted"',
    `created: ${JSON.stringify(now.slice(0, 10))}`,
  ];
  NodeFS.mkdirSync(NodePath.join(root, DEALS_DIR), { recursive: true });
  try {
    NodeFS.mkdirSync(dealDir(root, slug));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new ContentError(`A deal for ${slug} already exists.`);
    }
    throw error;
  }
  NodeFS.writeFileSync(
    NodePath.join(dealDir(root, slug), "deal.md"),
    `---\n${front.join("\n")}\n---\n# ${brand}\n\n## Terms\n\n${terms}\n\n## Notes\n\n`,
    { flag: "wx" },
  );
  const deal = readDeal(root, key, slug);
  if (!deal) throw new ContentError("The new deal could not be read back.");
  return deal;
}
