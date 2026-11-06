// @effect-diagnostics nodeBuiltinImport:off - Attached files are plain files next to the focus list.
import * as NodeCrypto from "node:crypto";
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

import { FOCUS_FILE_MAX_BYTES, FOCUS_FILES_MAX, type FocusFileInput } from "@t3tools/contracts";

/** Folder under `<AIOS>/memory/` that holds the files attached to notes. */
const FOCUS_FILES_DIR = "focus-files";

const IMAGE_TYPES: Readonly<Record<string, string>> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
};
const OTHER_TYPES: Readonly<Record<string, string>> = {
  ".pdf": "application/pdf",
  ".txt": "text/plain",
  ".md": "text/markdown",
  ".json": "application/json",
  ".csv": "text/csv",
};

/** The memory folder that holds `focus.md`. */
export const memoryDirOf = (focusFilePath: string) => NodePath.dirname(focusFilePath);

/** A file name that is safe on every disk and in a markdown link. */
export function safeFileName(name: string): string {
  const base = name.split(/[\\/]/).at(-1) ?? "";
  const cleaned = base
    .replace(/[^\w.\- ]+/g, "_")
    .replace(/\s+/g, " ")
    .replace(/^[.\s]+/, "")
    .trim();
  const extension = NodePath.extname(cleaned);
  const stem = cleaned.slice(0, cleaned.length - extension.length).slice(0, 60);
  return `${stem || "file"}${extension.slice(0, 12)}`;
}

/** Mime type from the extension only; the client's claim is never trusted. */
export function mimeForName(name: string): string {
  const extension = NodePath.extname(name).toLowerCase();
  return IMAGE_TYPES[extension] ?? OTHER_TYPES[extension] ?? "application/octet-stream";
}

const isImageName = (name: string) => NodePath.extname(name).toLowerCase() in IMAGE_TYPES;

/**
 * Saves the files and returns one markdown line for each: `![name](focus-files/x.png)` for an
 * image, `[name](focus-files/x.pdf)` for anything else. The same bytes always get the same name.
 */
export function storeFocusFiles(memoryDir: string, files: ReadonlyArray<FocusFileInput>): string[] {
  if (files.length > FOCUS_FILES_MAX) throw new Error(`Attach at most ${FOCUS_FILES_MAX} files.`);
  const directory = NodePath.join(memoryDir, FOCUS_FILES_DIR);
  const lines: string[] = [];
  for (const file of files) {
    const bytes = Buffer.from(file.dataBase64, "base64");
    if (bytes.byteLength === 0) throw new Error(`${file.name} is empty.`);
    if (bytes.byteLength > FOCUS_FILE_MAX_BYTES) {
      throw new Error(`${file.name} is larger than ${FOCUS_FILE_MAX_BYTES / 1024 / 1024} MB.`);
    }
    const name = safeFileName(file.name);
    const digest = NodeCrypto.createHash("sha1").update(bytes).digest("hex").slice(0, 8);
    const stored = `${digest}-${name}`;
    NodeFS.mkdirSync(directory, { recursive: true });
    const target = NodePath.join(directory, stored);
    if (!NodeFS.existsSync(target)) NodeFS.writeFileSync(target, bytes);
    const label = name.replace(/[[\]()]/g, "_");
    lines.push(`${isImageName(name) ? "!" : ""}[${label}](${FOCUS_FILES_DIR}/${stored})`);
  }
  return lines;
}

/** Reads an attached file. Only paths inside `focus-files/` are allowed. */
export function readFocusAttachment(
  memoryDir: string,
  relativePath: string,
): { name: string; mimeType: string; dataBase64: string } {
  const normalized = relativePath.replace(/\\/g, "/");
  const parts = normalized.split("/");
  if (parts.length !== 2 || parts[0] !== FOCUS_FILES_DIR || !parts[1] || parts[1].startsWith(".")) {
    throw new Error("That is not an attached file.");
  }
  const target = NodePath.join(memoryDir, FOCUS_FILES_DIR, parts[1]);
  const stat = NodeFS.statSync(target);
  if (!stat.isFile() || stat.size > FOCUS_FILE_MAX_BYTES) throw new Error("Cannot open that file.");
  const name = parts[1].replace(/^[0-9a-f]{8}-/, "");
  return {
    name,
    mimeType: mimeForName(name),
    dataBase64: NodeFS.readFileSync(target).toString("base64"),
  };
}
