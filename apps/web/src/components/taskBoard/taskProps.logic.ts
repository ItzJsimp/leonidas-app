import type {
  TaskSchemaProperty,
  TaskSchemaPropertyEdit,
  TaskSchemaPropertyType,
} from "@t3tools/contracts";

import { columnProperty, PROP_PREFIX } from "./taskCells.logic";
import type { TasksLayout } from "./taskLayout.logic";

export const PROPERTY_TYPES: ReadonlyArray<readonly [TaskSchemaPropertyType, string]> = [
  ["text", "Text"],
  ["number", "Number"],
  ["select", "Select"],
  ["multi_select", "Multi-select"],
  ["status", "Status"],
  ["date", "Date"],
  ["person", "Person"],
  ["checkbox", "Checkbox"],
  ["url", "URL"],
];

/** Types whose values come from an option list. */
export const OPTION_TYPES: ReadonlySet<TaskSchemaPropertyType> = new Set([
  "select",
  "multi_select",
  "status",
  "person",
]);

/** One color per theme tone, so each choice looks different in both themes. */
export const COLOR_CHOICES: ReadonlyArray<readonly [string, string]> = [
  ["gray", "Gray"],
  ["red", "Red"],
  ["yellow", "Yellow"],
  ["green", "Green"],
  ["blue", "Blue"],
];

const NEW_WIDTH = 160;

/**
 * The layout with one hidden column for each schema property that has none yet, and without
 * columns of properties the schema no longer holds. Nothing is saved until a column changes.
 */
export function withSchemaColumns(
  layout: TasksLayout,
  schema: ReadonlyArray<TaskSchemaProperty>,
): TasksLayout {
  const kept = layout.table.columns.filter(
    (column) => !column.key.startsWith(PROP_PREFIX) || columnProperty(column.key, schema),
  );
  const keys = new Set(kept.map((column) => column.key));
  const added = schema
    .map((property) => `${PROP_PREFIX}${property.key}`)
    .filter((key) => !keys.has(key) && columnProperty(key, schema))
    .map((key) => ({ key, width: NEW_WIDTH, hidden: true }));
  if (added.length === 0 && kept.length === layout.table.columns.length) return layout;
  return { ...layout, table: { ...layout.table, columns: [...kept, ...added] } };
}

/** A new card key from a property name: lowercase letters and "_" only, never a taken key. */
export function newPropertyKey(name: string, taken: ReadonlySet<string>): string {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 60) || "property";
  let key = base;
  for (let letter = 98; taken.has(key); letter++) key = `${base}_${String.fromCharCode(letter)}`;
  return key;
}

/** The editable part of a property, as `taskSchemaPropertySet` takes it. */
export function propertyEdit(property: TaskSchemaProperty): TaskSchemaPropertyEdit {
  const { key: _key, builtIn: _builtIn, ...edit } = property;
  return edit;
}

/** The property with another type. Option types keep their options and colors. */
export function retype(
  property: TaskSchemaProperty,
  type: TaskSchemaPropertyType,
): TaskSchemaPropertyEdit {
  const { format: _format, options, colors, ...rest } = propertyEdit(property);
  return OPTION_TYPES.has(type)
    ? { ...rest, type, ...(options ? { options } : {}), ...(colors ? { colors } : {}) }
    : { ...rest, type };
}

/** The property with one option in another color. */
export function recolor(
  property: TaskSchemaProperty,
  option: string,
  color: string,
): TaskSchemaPropertyEdit {
  return { ...propertyEdit(property), colors: { ...property.colors, [option]: color } };
}

/** Options from comma-separated text: trimmed, without blanks or repeats. */
export function parseOptions(text: string): ReadonlyArray<string> {
  return [
    ...new Set(
      text
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
}

/** The property with a new option list. Colors of removed options go too. */
export function withOptions(
  property: TaskSchemaProperty,
  options: ReadonlyArray<string>,
): TaskSchemaPropertyEdit {
  const colors = Object.fromEntries(
    Object.entries(property.colors ?? {}).filter(([option]) => options.includes(option)),
  );
  const { colors: _colors, ...edit } = propertyEdit(property);
  return {
    ...edit,
    options,
    ...(Object.keys(colors).length > 0 ? { colors } : {}),
  };
}
