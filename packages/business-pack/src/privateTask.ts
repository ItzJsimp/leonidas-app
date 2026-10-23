// @effect-diagnostics nodeBuiltinImport:off - a private task moves between plain files in Home and an Area.
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";

import { readFrontmatter } from "./frontmatter.ts";
import { readOrg } from "./org.ts";

const SLUG = /^[a-z0-9][a-z0-9-]*$/;

/** What Home shows for a private task: the Area, never the real title. */
export const maskedTitle = (areaName: string) => `Private task in ${areaName}`;

const oneLine = (value: string) => value.replace(/["\\]/g, "").replace(/\s+/g, " ").trim();

interface CardParts {
  readonly front: string;
  readonly body: string;
  readonly eol: string;
}

function splitCard(raw: string): CardParts | null {
  const match = /^---(\r?\n)([\s\S]*?)\r?\n---([\s\S]*)$/.exec(raw.replace(/^\uFEFF/, ""));
  return match ? { front: match[2]!, body: match[3]!, eol: match[1]! } : null;
}

/** Sets one frontmatter line, or drops it when `value` is null. */
function setKey(front: string, eol: string, key: string, value: string | null): string {
  const line = new RegExp(`^${key}:.*$`, "m");
  if (value === null) return front.replace(new RegExp(`^${key}:.*(\\r?\\n)?`, "m"), "");
  return line.test(front)
    ? front.replace(line, () => `${key}: ${value}`)
    : `${front}${eol}${key}: ${value}`;
}

const join = ({ front, body, eol }: CardParts) => `---${eol}${front}${eol}---${body}`;

/**
 * The Home copy of a task that becomes private: the title is masked, the details are gone, and
 * the card says which Area holds the real ones. Pure.
 */
export function maskCard(raw: string, area: { slug: string; name: string }): string | null {
  const card = splitCard(raw);
  if (!card) return null;
  const mask = maskedTitle(oneLine(area.name));
  let front = setKey(card.front, card.eol, "name", JSON.stringify(mask));
  front = setKey(front, card.eol, "private", "true");
  front = setKey(front, card.eol, "area", area.slug);
  return join({ front, eol: card.eol, body: `${card.eol}${card.eol}# ${mask}${card.eol}` });
}

/** The Home copy of a task that becomes public again: the real title and details return. Pure. */
export function unmaskCard(raw: string, areaRaw: string): string | null {
  const card = splitCard(raw);
  const real = splitCard(areaRaw);
  const title = readFrontmatter(areaRaw).name;
  if (!card || !real || !title) return null;
  const front = setKey(
    setKey(card.front, card.eol, "name", JSON.stringify(oneLine(title))),
    card.eol,
    "private",
    null,
  );
  return join({ front, eol: card.eol, body: real.body });
}

/** The real title of a private task, read from its Area folder. Null when that folder is not here. */
export async function readPrivateTitle(
  root: string,
  area: string,
  taskId: string,
): Promise<string | null> {
  if (!SLUG.test(area) || !SLUG.test(taskId)) return null;
  try {
    const raw = await NodeFSP.readFile(
      NodePath.join(root, "areas", area, "tasks", `${taskId}.md`),
      "utf8",
    );
    return readFrontmatter(raw).name || null;
  } catch {
    return null;
  }
}

/**
 * Makes a Home task card private in an Area, or public again with `area: null`. The real card
 * goes to `areas/<area>/tasks/<id>.md`, which only that Area's Members have. Returns an error
 * text for the user, or null when it worked. Git gives every Member the whole Home repo, so the
 * masked card is what Home keeps, never a screen-only mask.
 */
export async function setCardPrivacy(
  root: string,
  file: string,
  taskId: string,
  area: string | null,
): Promise<string | null> {
  let raw: string;
  try {
    raw = await NodeFSP.readFile(file, "utf8");
  } catch {
    return "The task card file is missing.";
  }
  const fields = readFrontmatter(raw);
  const isPrivate = fields.private?.toLowerCase() === "true";
  if (!SLUG.test(taskId)) return "This task id cannot be moved into an Area.";

  if (area === null) {
    if (!isPrivate) return null;
    const areaSlug = fields.area ?? "";
    if (!SLUG.test(areaSlug)) return "This private task names no Area.";
    let areaRaw: string;
    try {
      areaRaw = await NodeFSP.readFile(
        NodePath.join(root, "areas", areaSlug, "tasks", `${taskId}.md`),
        "utf8",
      );
    } catch {
      return "The real task is in the Area folder, and that folder is not on this computer.";
    }
    const restored = unmaskCard(raw, areaRaw);
    if (restored === null) return "The Area copy of this task cannot be read.";
    await NodeFSP.writeFile(file, restored, "utf8");
    return null;
  }

  if (isPrivate)
    return fields.area === area ? null : "Make the task public first, then pick another Area.";
  const org = await readOrg(root);
  const found = org?.areas.find((candidate) => candidate.slug === area);
  if (!found || !SLUG.test(area)) return "That Area is not in this business.";
  if (area === "home") return "Pick an Area other than Home. Every Member reads Home.";
  const areaDir = NodePath.join(root, "areas", area);
  try {
    if (!(await NodeFSP.stat(areaDir)).isDirectory()) throw new Error("not a folder");
  } catch {
    return "Join that Area first. Its folder is not on this computer.";
  }
  const masked = maskCard(raw, found);
  if (masked === null) return "This task card has no frontmatter.";
  const target = NodePath.join(areaDir, "tasks", `${taskId}.md`);
  try {
    await NodeFSP.mkdir(NodePath.dirname(target), { recursive: true });
    // An older Area file for this id is the copy from an earlier private spell: the card now is newer.
    await NodeFSP.writeFile(target, raw, "utf8");
  } catch {
    return "Could not write the task into the Area folder.";
  }
  await NodeFSP.writeFile(file, masked, "utf8");
  return null;
}
