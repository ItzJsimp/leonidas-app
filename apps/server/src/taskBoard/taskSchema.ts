// @effect-diagnostics nodeBuiltinImport:off - synchronous node APIs are used on purpose in this file.
/**
 * Reads and writes the AIOS task schema (`task-schema.json`), the property list of the Tasks
 * table. Scripts and the pre-commit Task Schema Gate read the same file, so every write is
 * checked here: built-in properties change only their colors, and a new type or option list
 * must fit every value that cards already hold.
 */
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

import type { TaskSchemaProperty, TaskSchemaPropertyEdit } from "@t3tools/contracts";

import { aiosTaskFolders, isRealPathInside, parseFrontmatter } from "./aiosCards.ts";

export const TASK_SCHEMA_FILE = "projects/leonidas-command-center/config/task-schema.json";

const TYPES: ReadonlySet<string> = new Set([
  "text",
  "number",
  "select",
  "multi_select",
  "status",
  "date",
  "person",
  "checkbox",
  "url",
]);
const WITH_OPTIONS: ReadonlySet<string> = new Set(["select", "multi_select", "status", "person"]);
/** Properties that scripts and the gate read. The app changes only their colors. */
const BUILT_IN: ReadonlySet<string> = new Set([
  "name",
  "status",
  "priority",
  "effort",
  "energy_type",
  "owner",
  "accountable",
  "lane",
  "scope",
  "autonomous",
  "due",
  "created",
  "last_touched",
  "project",
  "tags",
  "blocked_by",
]);
/** Other card keys that the app or scripts write. A new property cannot take these names. */
const RESERVED: ReadonlySet<string> = new Set([
  ...BUILT_IN,
  "id",
  "type",
  "title",
  "assignee",
  "claimed_by",
  "claimed_at",
  "completed_by",
  "completed_date",
  "milestone",
  "shared",
  "shared_by",
  "shared_sync",
  "thread_id",
  "thread_ids",
  "project_id",
  "kind",
  "verify",
  "start_files",
  "taste",
]);
const COLORS: ReadonlySet<string> = new Set([
  "gray",
  "brown",
  "orange",
  "yellow",
  "green",
  "blue",
  "purple",
  "pink",
  "red",
  "neutral",
  "dim",
  "amber",
]);
// The gate reads keys of letters and "_" only, so a key with a digit would skip its checks.
const KEY = /^[a-z][a-z_]{0,63}$/;
// Card frontmatter keeps options in inline lists, so these characters would break a value.
const OPTION = /^[^\s",[\]#](?:[^\r\n",[\]#]{0,78}[^\s",[\]#])?$/;
const LABEL = /^[^\r\n\t]{1,80}$/;
const MAX_PROPERTIES = 100;
const MAX_OPTIONS = 200;
const MAX_FILE_CHARS = 200_000;

type Definition = Readonly<Record<string, unknown>>;
export type TaskSchemaFile = {
  readonly [key: string]: unknown;
  readonly properties: Readonly<Record<string, Definition>>;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const strings = (value: unknown): ReadonlyArray<string> | undefined =>
  Array.isArray(value) && value.every((item) => typeof item === "string") ? value : undefined;

const sameList = (a: unknown, b: unknown) =>
  JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** Throws when the edit is out of bounds. Colors must name one of `options`. */
function checkEdit(edit: TaskSchemaPropertyEdit, options: ReadonlyArray<string>): void {
  if (!TYPES.has(edit.type)) throw new Error(`"${edit.type}" is not a property type.`);
  if (edit.label !== undefined && !LABEL.test(edit.label.trim())) {
    throw new Error("A property name needs 1 to 80 characters on one line.");
  }
  if (edit.format !== undefined && (edit.format !== "progress" || edit.type !== "number")) {
    throw new Error("Only a number property can show as progress.");
  }
  const listed = edit.options ?? [];
  if (listed.length > MAX_OPTIONS) throw new Error(`A property can have ${MAX_OPTIONS} options.`);
  const seen = new Set<string>();
  for (const option of listed) {
    if (!OPTION.test(option)) {
      throw new Error(`The option "${option}" needs 1 to 80 characters and no quotes or commas.`);
    }
    if (seen.has(option)) throw new Error(`The option "${option}" is in the list twice.`);
    seen.add(option);
  }
  for (const [option, color] of Object.entries(edit.colors ?? {})) {
    if (!options.includes(option) || !COLORS.has(color)) {
      throw new Error(`The color for "${option}" is not an option color.`);
    }
  }
}

/**
 * The schema after one property is added, changed or removed (`edit` null). Throws a plain
 * message when the change is not allowed.
 */
export function editTaskSchema(
  file: TaskSchemaFile,
  key: string,
  edit: TaskSchemaPropertyEdit | null,
): TaskSchemaFile {
  const current = file.properties[key];
  const builtIn = BUILT_IN.has(key) && current !== undefined;
  if (edit === null) {
    if (!current) throw new Error(`No property is named "${key}".`);
    if (builtIn) throw new Error(`"${key}" is a built-in property. Hide its column instead.`);
    const { [key]: _removed, ...rest } = file.properties;
    return { ...file, properties: rest };
  }
  checkEdit(edit, edit.options ?? (builtIn ? (strings(current.options) ?? []) : []));
  let next: Record<string, unknown>;
  if (builtIn) {
    const fixed =
      edit.type === current.type &&
      edit.label === undefined &&
      edit.format === current.format &&
      (edit.options === undefined || sameList(edit.options, current.options));
    if (!fixed) throw new Error(`"${key}" is a built-in property. Only its colors can change.`);
    next = { ...current, colors: edit.colors };
  } else {
    if (!current) {
      if (!KEY.test(key)) {
        throw new Error("A property name key uses lowercase letters and _ only, up to 64.");
      }
      if (RESERVED.has(key)) throw new Error(`"${key}" is already used by task cards.`);
      if (Object.keys(file.properties).length >= MAX_PROPERTIES) {
        throw new Error(`The schema can hold ${MAX_PROPERTIES} properties.`);
      }
    }
    // Keys the app does not set (notes, defaults) stay as they are.
    const { type: _t, label: _l, format: _f, options: _o, colors: _c, ...kept } = current ?? {};
    next = {
      type: edit.type,
      ...(edit.label?.trim() ? { label: edit.label.trim() } : {}),
      ...(edit.format ? { format: edit.format } : {}),
      ...(WITH_OPTIONS.has(edit.type) && edit.options ? { options: [...edit.options] } : {}),
      ...(WITH_OPTIONS.has(edit.type) && edit.colors && Object.keys(edit.colors).length > 0
        ? { colors: { ...edit.colors } }
        : {}),
      ...kept,
    };
  }
  if (next.colors === undefined) delete next.colors;
  return { ...file, properties: { ...file.properties, [key]: next } };
}

/** True when a card value passes Test-TaskSchema.ps1 for this definition. Empty values fit. */
export function valueFits(definition: Definition, value: string | ReadonlyArray<string>): boolean {
  const items = (typeof value === "string" ? [value] : value).filter((item) => item !== "");
  if (items.length === 0) return true;
  if (definition.type !== "multi_select" && items.length > 1) return false;
  const options = strings(definition.options);
  return items.every((item) => {
    switch (definition.type) {
      case "select":
      case "status":
      case "person":
      case "multi_select":
        return !options || options.includes(item);
      case "checkbox":
        return item === "true" || item === "false";
      case "number":
        return /^-?\d+(\.\d+)?$/.test(item);
      case "url":
        return /^https?:\/\/\S+$/.test(item);
      case "date": {
        const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(item);
        if (!match) return false;
        const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
        const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
        const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
        return days !== undefined && day >= 1 && day <= days;
      }
      default:
        return true;
    }
  });
}

const compact = (value: unknown) => JSON.stringify(value, null, 1).replace(/\n\s*/g, " ");

/** The schema as JSON with one line per property, so a change shows as a one-line diff. */
export function formatTaskSchema(file: TaskSchemaFile): string {
  const top = Object.entries(file)
    .filter(([key]) => key !== "properties")
    .map(([key, value]) => `  ${JSON.stringify(key)}: ${JSON.stringify(value)}`);
  const properties = Object.entries(file.properties).map(
    ([key, value]) => `    ${JSON.stringify(key)}: ${compact(value)}`,
  );
  return `{\n${[...top, `  "properties": {\n${properties.join(",\n")}\n  }`].join(",\n")}\n}\n`;
}

function schemaPath(root: string): string {
  return NodePath.join(root, TASK_SCHEMA_FILE);
}

function readFile(root: string): TaskSchemaFile | null {
  const path = schemaPath(root);
  if (!NodeFS.existsSync(path) || !isRealPathInside(root, path)) return null;
  const raw: unknown = JSON.parse(NodeFS.readFileSync(path, "utf8").replace(/^﻿/, ""));
  if (!isRecord(raw) || !isRecord(raw.properties)) return null;
  const properties: Record<string, Definition> = {};
  for (const [key, value] of Object.entries(raw.properties)) {
    if (isRecord(value) && typeof value.type === "string") properties[key] = value;
  }
  return { ...raw, properties };
}

function toProperty(key: string, definition: Definition): TaskSchemaProperty | null {
  const type = definition.type;
  if (typeof type !== "string" || !TYPES.has(type)) return null;
  const options = strings(definition.options);
  const colors = isRecord(definition.colors)
    ? Object.fromEntries(
        Object.entries(definition.colors).filter(
          (entry): entry is [string, string] => typeof entry[1] === "string",
        ),
      )
    : undefined;
  return {
    key,
    type: type as TaskSchemaProperty["type"],
    builtIn: BUILT_IN.has(key),
    ...(typeof definition.label === "string" ? { label: definition.label } : {}),
    ...(definition.format === "progress" ? { format: "progress" as const } : {}),
    ...(options ? { options } : {}),
    ...(colors ? { colors } : {}),
  };
}

/** The properties in file order. An AIOS without the file, or with a bad file, has none. */
export function readTaskSchema(root: string): ReadonlyArray<TaskSchemaProperty> {
  let file: TaskSchemaFile | null;
  try {
    file = readFile(root);
  } catch {
    return [];
  }
  return Object.entries(file?.properties ?? {}).flatMap(([key, definition]) => {
    const property = toProperty(key, definition);
    return property ? [property] : [];
  });
}

/** Every value that cards hold for `key`. */
function cardValues(root: string, key: string): Array<string | ReadonlyArray<string>> {
  const values: Array<string | ReadonlyArray<string>> = [];
  for (const folder of aiosTaskFolders(root)) {
    let names: string[];
    try {
      names = NodeFS.readdirSync(folder.dir).filter((name) => name.endsWith(".md"));
    } catch {
      continue;
    }
    for (const name of names) {
      try {
        const value = parseFrontmatter(NodeFS.readFileSync(NodePath.join(folder.dir, name), "utf8"))
          ?.fields[key];
        if (value !== undefined) values.push(value);
      } catch {
        // An unreadable card cannot block a schema change; the gate reports it on its own.
      }
    }
  }
  return values;
}

/** Applies one property change to the AIOS schema file and returns the new property list. */
export function setTaskSchemaProperty(
  root: string,
  key: string,
  edit: TaskSchemaPropertyEdit | null,
): ReadonlyArray<TaskSchemaProperty> {
  const file = readFile(root);
  if (!file) throw new Error("This AIOS has no task-schema.json to change.");
  const next = editTaskSchema(file, key, edit);
  const before = file.properties[key];
  const after = next.properties[key];
  const retyped =
    after !== undefined &&
    !BUILT_IN.has(key) &&
    (before === undefined ||
      before.type !== after.type ||
      before.format !== after.format ||
      !sameList(before.options, after.options));
  if (retyped) {
    const misfits = cardValues(root, key).filter((value) => !valueFits(after, value)).length;
    if (misfits > 0) {
      throw new Error(
        `${misfits} ${misfits === 1 ? "card has a value" : "cards have values"} for "${key}" that the new type does not fit. Change or clear ${misfits === 1 ? "it" : "them"} first.`,
      );
    }
  }
  const text = formatTaskSchema(next);
  if (text.length > MAX_FILE_CHARS) throw new Error("The task schema is too large to save.");
  // Write a temporary file, then rename it, so a reader never sees half a schema.
  const path = schemaPath(root);
  const temporary = `${path}.${process.pid}.tmp`;
  NodeFS.writeFileSync(temporary, text, "utf8");
  NodeFS.renameSync(temporary, path);
  return readTaskSchema(root);
}
