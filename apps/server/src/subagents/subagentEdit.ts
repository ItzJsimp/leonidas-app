// @effect-diagnostics nodeBuiltinImport:off - small synchronous spec writes from the Studio, same as subagentPersona.
/**
 * Studio edits to a subagent spec file (ADR-0082). A patch changes only the
 * fields it names and leaves comments, `extends`, `never`, `scope` and the
 * persona body as they were. Every write is checked against format v1 first,
 * and a spec that no longer resolves is put back.
 */
import * as NodeFs from "node:fs";
import * as NodePath from "node:path";

import type { SubagentSpecPatch } from "@t3tools/contracts";
import { isMap, parseDocument, type Document, type YAMLSeq } from "yaml";

import { parseSubagentSpec, resolveSubagentSpec, SubagentPersonaError } from "./subagentPersona.ts";

const NAME = /^[a-z0-9][a-z0-9-]{0,63}$/;
const FRONTMATTER = /^(﻿?---\r?\n)([\s\S]*?)(\r?\n---\r?\n?)([\s\S]*)$/;

function setScalar(doc: Document, key: string, value: string | number | boolean | null): void {
  if (value === null || value === "") {
    doc.delete(key);
    return;
  }
  doc.set(key, value);
}

function setList(doc: Document, key: string, items: ReadonlyArray<string>, flow: boolean): void {
  const node = doc.createNode([...items]) as YAMLSeq;
  node.flow = flow;
  doc.set(key, node);
}

/** Returns the spec text with `patch` applied to its frontmatter. Throws when there is none. */
export function applySpecPatch(source: string, patch: SubagentSpecPatch): string {
  const match = FRONTMATTER.exec(source);
  if (match === null) throw new SubagentPersonaError("Spec has no frontmatter.");
  const doc = parseDocument(match[2] ?? "");
  if (!isMap(doc.contents)) throw new SubagentPersonaError("Spec frontmatter is not a mapping.");
  if (patch.enabled !== undefined) setScalar(doc, "enabled", patch.enabled);
  if (patch.description !== undefined) {
    setScalar(doc, "description", patch.description?.trim() ?? null);
  }
  if (patch.model !== undefined) setScalar(doc, "model", patch.model?.trim() ?? null);
  // Tools read best on one line; the Context List is a column of paths.
  if (patch.tools !== undefined) setList(doc, "tools", patch.tools, true);
  if (patch.context !== undefined)
    setList(doc, "context", patch.context, patch.context.length === 0);
  if (patch.avatar !== undefined) setScalar(doc, "avatar", patch.avatar?.trim() ?? null);
  if (patch.effort !== undefined) setScalar(doc, "effort", patch.effort?.trim() ?? null);
  if (patch.skills !== undefined) {
    if (patch.skills.length === 0) doc.delete("skills");
    else setList(doc, "skills", patch.skills, true);
  }
  if (patch.canSpawn !== undefined) setScalar(doc, "canSpawn", patch.canSpawn);
  if (patch.maxTurns !== undefined) setScalar(doc, "maxTurns", patch.maxTurns);
  const frontmatter = doc.toString({ lineWidth: 0 }).trimEnd();
  const body = patch.body === undefined ? match[4] : `${patch.body.replace(/\s+$/, "")}\n`;
  return `${match[1]}${frontmatter}${match[3]}${body}`;
}

/** Writes through a temp file so a crash never leaves half a spec. */
function writeFileAtomic(path: string, contents: string): void {
  const temp = `${path}.${process.pid}.tmp`;
  NodeFs.writeFileSync(temp, contents, "utf8");
  NodeFs.renameSync(temp, path);
}

/** Applies a patch to a spec on disk. The old text returns if the new one does not resolve. */
export function updateSubagentSpec(specPath: string, patch: SubagentSpecPatch): void {
  const before = NodeFs.readFileSync(specPath, "utf8");
  const after = applySpecPatch(before, patch);
  parseSubagentSpec(after, NodePath.basename(specPath, ".md"));
  writeFileAtomic(specPath, after);
  try {
    resolveSubagentSpec(specPath);
  } catch (error) {
    writeFileAtomic(specPath, before);
    throw error;
  }
}

/**
 * Creates `<folder>/<name>.md` from starter text. The starter's `name:` line
 * becomes `name`; the file is never overwritten.
 */
export function createSubagentSpec(input: {
  readonly folder: string;
  readonly name: string;
  readonly contents: string;
  /** `number` writes the first free `<name>-N.md` (N from 2) when the name is taken. */
  readonly onNameTaken?: "error" | "number";
}): string {
  if (!NAME.test(input.name)) {
    throw new SubagentPersonaError(
      "A subagent name uses lowercase letters, digits and dashes, and starts with a letter or digit.",
    );
  }
  const match = FRONTMATTER.exec(input.contents);
  if (match === null) throw new SubagentPersonaError("The starter has no frontmatter.");
  NodeFs.mkdirSync(input.folder, { recursive: true });
  let name = input.name;
  if (NodeFs.existsSync(NodePath.join(input.folder, `${name}.md`))) {
    if (input.onNameTaken !== "number") {
      throw new SubagentPersonaError(`A subagent named "${name}" already exists there.`);
    }
    let number = 2;
    while (NodeFs.existsSync(NodePath.join(input.folder, `${input.name}-${number}.md`)))
      number += 1;
    name = `${input.name}-${number}`;
    if (!NAME.test(name)) throw new SubagentPersonaError(`"${name}" is too long for a name.`);
  }
  const doc = parseDocument(match[2] ?? "");
  doc.set("name", name);
  const contents = `${match[1]}${doc.toString({ lineWidth: 0 }).trimEnd()}${match[3]}${match[4]}`;
  parseSubagentSpec(contents, name);
  const target = NodePath.join(input.folder, `${name}.md`);
  // `wx` refuses an existing file, so a race with another writer never overwrites.
  NodeFs.writeFileSync(target, contents, { encoding: "utf8", flag: "wx" });
  return target;
}

/** Deletes one spec file. The caller has already checked that the catalog lists it. */
export function deleteSubagentSpec(specPath: string): void {
  NodeFs.unlinkSync(specPath);
}
