import {
  TaskBoardTaskPriority,
  TaskBoardTaskStatus,
  type TaskSchemaProperty,
} from "@t3tools/contracts";

import { ownerOf, ownerPickerItems, ownerPickerValue } from "./owner.logic";
import {
  priorityLabel,
  priorityRank,
  priorityTone,
  statusLabel,
  statusTone,
  type TaskTone,
  type TaskView,
} from "./taskBoard.logic";
import type { TaskContext } from "./taskBoard.types";

export type CellOption = {
  readonly value: string;
  readonly label: string;
  readonly tone: TaskTone;
};

/** How a cell edits in place. `null` from `cellEdit` means the cell is read-only. */
export type CellEditor =
  | { readonly kind: "text"; readonly input: "text" | "number" | "url"; readonly value: string }
  | { readonly kind: "date"; readonly value: string }
  | {
      readonly kind: "select";
      readonly value: string | null;
      readonly options: ReadonlyArray<CellOption>;
      /** The label of the "no value" row, or null when the cell needs a value. */
      readonly clearLabel: string | null;
    }
  | {
      readonly kind: "multi";
      readonly value: ReadonlyArray<string>;
      readonly options: ReadonlyArray<CellOption>;
    }
  | { readonly kind: "toggle"; readonly value: boolean };

/** The one task action an edited cell runs. */
export type CellAction =
  | { readonly type: "rename"; readonly title: string }
  | { readonly type: "setStatus"; readonly status: TaskBoardTaskStatus }
  | { readonly type: "setPriority"; readonly priority: TaskBoardTaskPriority }
  | { readonly type: "linkProject"; readonly slug: string | null }
  | { readonly type: "setDue"; readonly due: string | null }
  | { readonly type: "setAssignee"; readonly assignee: string | null }
  | {
      readonly type: "setProp";
      readonly key: string;
      readonly value: string | ReadonlyArray<string> | null;
    };

export type CellValue = string | ReadonlyArray<string> | boolean | null;

/** Schema keys that a task field holds. Their values come from the field, never from `props`. */
export const TASK_FIELD_PROPS: ReadonlySet<string> = new Set([
  "name",
  "status",
  "priority",
  "effort",
  "due",
  "created",
  "last_touched",
  "project",
  "tags",
]);

export const PROP_PREFIX = "prop:";
const GENERAL_SECTION = "general";
const TITLE_MAX = 256;
const NUMBER = /^-?\d+(\.\d+)?$/;
const URL = /^https?:\/\/\S+$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** The schema property a `prop:<key>` column shows, or null for built-in or unknown columns. */
export function columnProperty(
  column: string,
  schema: ReadonlyArray<TaskSchemaProperty>,
): TaskSchemaProperty | null {
  if (!column.startsWith(PROP_PREFIX)) return null;
  const key = column.slice(PROP_PREFIX.length);
  if (TASK_FIELD_PROPS.has(key)) return null;
  return schema.find((property) => property.key === key) ?? null;
}

// Schema colors are names. They map to theme tones, so every option reads in both themes.
const COLOR_TONE: Record<string, TaskTone> = {
  red: "danger",
  orange: "warning",
  amber: "warning",
  yellow: "warning",
  green: "success",
  blue: "info",
};

export const optionTone = (color: string | undefined): TaskTone =>
  (color && COLOR_TONE[color]) || "muted";

export function propertyOptions(property: TaskSchemaProperty): ReadonlyArray<CellOption> {
  return (property.options ?? []).map((value) => ({
    value,
    label: value,
    tone: optionTone(property.colors?.[value]),
  }));
}

const asList = (value: string | ReadonlyArray<string> | undefined): ReadonlyArray<string> =>
  value === undefined ? [] : typeof value === "string" ? (value ? [value] : []) : value;

/** The editor for one cell of one task, or null when the cell cannot change in place. */
export function cellEdit(
  column: string,
  task: TaskView,
  context: Pick<TaskContext, "team" | "projects">,
  schema: ReadonlyArray<TaskSchemaProperty>,
): CellEditor | null {
  switch (column) {
    case "title":
      return { kind: "text", input: "text", value: task.title };
    case "status":
      return {
        kind: "select",
        value: task.status,
        clearLabel: null,
        options: TaskBoardTaskStatus.literals.map((status) => ({
          value: status,
          label: statusLabel(status),
          tone: statusTone(status),
        })),
      };
    case "priority":
      return {
        kind: "select",
        value: task.priority,
        clearLabel: null,
        options: [...TaskBoardTaskPriority.literals]
          .sort((a, b) => priorityRank(a) - priorityRank(b))
          .map((priority) => ({
            value: priority,
            label: priorityLabel(priority),
            tone: priorityTone(priority),
          })),
      };
    case "project":
      return {
        kind: "select",
        value: task.section === GENERAL_SECTION ? null : task.section,
        clearLabel: "No project",
        options: context.projects
          .filter((project) => project.slug !== GENERAL_SECTION)
          .map((project) => ({ value: project.slug, label: project.name, tone: "muted" })),
      };
    case "due":
      return { kind: "date", value: task.due ?? "" };
    case "owner": {
      const owner = ownerOf(task, context.team);
      return {
        kind: "select",
        value: ownerPickerValue(context.team, owner),
        clearLabel: "Anyone",
        options: ownerPickerItems(context.team, owner).map((item) => ({
          ...item,
          tone: "muted",
        })),
      };
    }
  }
  const property = columnProperty(column, schema);
  if (!property) return null;
  const value = task.props?.[property.key];
  switch (property.type) {
    case "text":
    case "number":
    case "url":
      return {
        kind: "text",
        input: property.type,
        value: typeof value === "string" ? value : asList(value).join(", "),
      };
    case "date":
      return { kind: "date", value: typeof value === "string" ? value : "" };
    case "checkbox":
      return { kind: "toggle", value: value === "true" };
    case "multi_select":
      return { kind: "multi", value: asList(value), options: propertyOptions(property) };
    default:
      return {
        kind: "select",
        value: asList(value)[0] ?? null,
        clearLabel: "Empty",
        options: propertyOptions(property),
      };
  }
}

/**
 * The action that saves `value` in a cell, null when nothing changes, or an error to show in the
 * editor. `value` is the editor's raw value: text, a date ("" clears), a list or a boolean.
 */
export function cellChange(
  column: string,
  task: TaskView,
  editor: CellEditor,
  value: CellValue,
): CellAction | null | { readonly error: string } {
  const text = typeof value === "string" ? value.trim() : null;
  if (editor.kind === "text" && text === editor.value.trim()) return null;
  if (editor.kind === "date" && text === editor.value) return null;
  if (editor.kind === "select" && value === editor.value) return null;
  if (editor.kind === "toggle" && value === editor.value) return null;
  if (editor.kind === "multi") {
    const list = Array.isArray(value) ? value : [];
    if (list.length === editor.value.length && list.every((item, i) => item === editor.value[i]))
      return null;
  }
  switch (column) {
    case "title":
      if (!text) return { error: "A name cannot be empty." };
      if (text.length > TITLE_MAX) return { error: `A name has at most ${TITLE_MAX} characters.` };
      return { type: "rename", title: text };
    case "status":
      return { type: "setStatus", status: value as TaskBoardTaskStatus };
    case "priority":
      return { type: "setPriority", priority: value as TaskBoardTaskPriority };
    case "project":
      return { type: "linkProject", slug: (value as string | null) || null };
    case "due":
      if (text && !DATE.test(text)) return { error: "Use a date like 2026-11-04." };
      return { type: "setDue", due: text || null };
    case "owner":
      return { type: "setAssignee", assignee: (value as string | null) || null };
  }
  const key = column.slice(PROP_PREFIX.length);
  if (editor.kind === "toggle") return { type: "setProp", key, value: value ? "true" : "false" };
  if (editor.kind === "multi") {
    const list = Array.isArray(value) ? (value as ReadonlyArray<string>) : [];
    return { type: "setProp", key, value: list.length > 0 ? list : null };
  }
  if (editor.kind === "select") return { type: "setProp", key, value: (value as string) || null };
  if (text && editor.kind === "text" && editor.input === "number" && !NUMBER.test(text))
    return { error: "Type a number, like 3 or 2.5." };
  if (text && editor.kind === "text" && editor.input === "url" && !URL.test(text))
    return { error: "Type a link that starts with https://" };
  if (text && editor.kind === "date" && !DATE.test(text))
    return { error: "Use a date like 2026-11-04." };
  return { type: "setProp", key, value: text || null };
}
