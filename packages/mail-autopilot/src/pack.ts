import { matchesAny } from "./match.ts";
import { REVIEW_BUCKET, type Pack, type Rule, type RuleMatch } from "./types.ts";

export class PackError extends Error {
  constructor(path: string, message: string) {
    super(`Invalid pack at ${path}: ${message}`);
    this.name = "PackError";
  }
}

type Obj = Record<string, unknown>;
const MAX_TEXT = 200_000;
const MAX_SHORT = 200;

function obj(v: unknown, path: string, allowed: readonly string[]): Obj {
  if (typeof v !== "object" || v === null || Array.isArray(v)) {
    throw new PackError(path, "needs an object");
  }
  for (const k of Object.keys(v)) {
    if (!allowed.includes(k)) throw new PackError(`${path}.${k}`, "unknown key");
  }
  return v as Obj;
}

function str(v: unknown, path: string, max = MAX_SHORT): string {
  if (typeof v !== "string" || v.trim() === "" || v.length > max) {
    throw new PackError(path, "needs a non-empty text");
  }
  return v;
}

function strList(v: unknown, path: string): string[] {
  if (!Array.isArray(v)) throw new PackError(path, "needs a list");
  return v.map((x, i) => str(x, `${path}[${i}]`));
}

function keywordList(v: unknown, path: string): string[] {
  const list = strList(v, path);
  for (const k of list) {
    try {
      matchesAny("", [k]);
    } catch {
      throw new PackError(path, `bad keyword "${k}"`);
    }
  }
  return list;
}

function parseMatch(v: unknown, path: string): RuleMatch {
  const m = obj(v, path, [
    "keywords",
    "fromKeywords",
    "attachmentKeywords",
    "listUnsubscribe",
    "ownRepliedInThread",
  ]);
  const out: { -readonly [K in keyof RuleMatch]: RuleMatch[K] } = {};
  if (m.keywords !== undefined) out.keywords = keywordList(m.keywords, `${path}.keywords`);
  if (m.fromKeywords !== undefined) {
    out.fromKeywords = keywordList(m.fromKeywords, `${path}.fromKeywords`);
  }
  if (m.attachmentKeywords !== undefined) {
    out.attachmentKeywords = keywordList(m.attachmentKeywords, `${path}.attachmentKeywords`);
  }
  if (m.listUnsubscribe !== undefined) {
    if (typeof m.listUnsubscribe !== "boolean") {
      throw new PackError(`${path}.listUnsubscribe`, "needs true or false");
    }
    out.listUnsubscribe = m.listUnsubscribe;
  }
  if (m.ownRepliedInThread !== undefined) {
    if (typeof m.ownRepliedInThread !== "boolean") {
      throw new PackError(`${path}.ownRepliedInThread`, "needs true or false");
    }
    out.ownRepliedInThread = m.ownRepliedInThread;
  }
  const hasCondition =
    out.keywords?.length ||
    out.fromKeywords?.length ||
    out.attachmentKeywords?.length ||
    out.listUnsubscribe ||
    out.ownRepliedInThread;
  if (!hasCondition) throw new PackError(path, "a rule needs at least one condition");
  return out;
}

/** Validate untrusted pack data (a JSON file, a user edit). Throws `PackError` naming the first bad path. */
export function parsePack(input: unknown): Pack {
  const p = obj(input, "pack", [
    "id",
    "name",
    "rules",
    "labels",
    "drafts",
    "neverDraft",
    "alwaysSurface",
    "archive",
  ]);
  const id = str(p.id, "id");
  const name = str(p.name, "name");

  if (!Array.isArray(p.rules) || p.rules.length === 0) {
    throw new PackError("rules", "needs a non-empty list");
  }
  const seen = new Set<string>();
  const rules: Rule[] = p.rules.map((r, i) => {
    const path = `rules[${i}]`;
    const o = obj(r, path, ["id", "bucket", "match"]);
    const ruleId = str(o.id, `${path}.id`);
    if (seen.has(ruleId)) throw new PackError(`${path}.id`, `duplicate rule id "${ruleId}"`);
    seen.add(ruleId);
    const bucket = str(o.bucket, `${path}.bucket`);
    if (bucket === REVIEW_BUCKET) {
      throw new PackError(`${path}.bucket`, `"${REVIEW_BUCKET}" is reserved`);
    }
    return { id: ruleId, bucket, match: parseMatch(o.match, `${path}.match`) };
  });
  const buckets = new Set(rules.map((r) => r.bucket));

  const labelsIn = obj(p.labels, "labels", [...buckets, REVIEW_BUCKET]);
  const labels: Record<string, string[]> = {};
  for (const b of [...buckets, REVIEW_BUCKET]) {
    if (labelsIn[b] === undefined) throw new PackError("labels", `missing labels for "${b}"`);
    labels[b] = strList(labelsIn[b], `labels.${b}`);
  }

  const known = (list: string[], path: string): string[] => {
    for (const b of list) {
      if (!buckets.has(b)) throw new PackError(path, `unknown bucket "${b}"`);
    }
    return list;
  };
  const neverDraft = known(strList(p.neverDraft, "neverDraft"), "neverDraft");
  const alwaysSurface = known(strList(p.alwaysSurface, "alwaysSurface"), "alwaysSurface");
  const archive = known(strList(p.archive, "archive"), "archive");
  for (const b of archive) {
    if (alwaysSurface.includes(b)) {
      throw new PackError("archive", `"${b}" is always shown, so it cannot be archived`);
    }
  }

  const draftsIn = obj(p.drafts, "drafts", Object.keys((p.drafts as Obj | null) ?? {}));
  const drafts: Record<string, { body: string }> = {};
  for (const b of Object.keys(draftsIn)) {
    known([b], "drafts");
    if (neverDraft.includes(b)) {
      throw new PackError(`drafts.${b}`, "a neverDraft bucket cannot have a draft");
    }
    const body = str(obj(draftsIn[b], `drafts.${b}`, ["body"]).body, `drafts.${b}.body`, MAX_TEXT);
    for (const [, ph] of body.matchAll(/\{\{\s*([^}]*?)\s*\}\}/g)) {
      if (ph !== "firstName")
        throw new PackError(`drafts.${b}.body`, `unknown placeholder "${ph}"`);
    }
    drafts[b] = { body };
  }

  return { id, name, rules, labels, drafts, neverDraft, alwaysSurface, archive };
}

const MAX_PACK_FILE = 1_000_000;

/** Parse the text of a pack file. The caller reads the file; this package does no I/O. */
export function parsePackJson(text: string): Pack {
  if (text.length > MAX_PACK_FILE) throw new PackError("file", "too large (over 1 MB)");
  let data: unknown;
  try {
    data = JSON.parse(text.replace(/^\uFEFF/, ""));
  } catch {
    throw new PackError("file", "not valid JSON");
  }
  return parsePack(data);
}
