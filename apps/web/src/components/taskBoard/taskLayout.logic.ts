/**
 * The Tasks table layout saved in workspace.json (`tasksLayout`): columns, density, wrap and the
 * manual row order. The server stores it as an opaque object, so every read goes through
 * `parseLayout`, which repairs or drops bad values instead of failing.
 */

export type Density = "compact" | "default" | "comfortable";

export type ColumnLayout = {
  readonly key: string;
  readonly width: number;
  readonly hidden: boolean;
};

export type TableLayout = {
  readonly columns: ReadonlyArray<ColumnLayout>;
  readonly density: Density;
  /** Set with the drag handle at the table edge. Null uses the density's height. */
  readonly rowHeight: number | null;
  readonly freezeName: boolean;
  /** Columns whose long text wraps instead of being cut. */
  readonly wrap: ReadonlyArray<string>;
};

export type TasksLayout = {
  readonly table: TableLayout;
  /** Manual row order: a lower rank shows first. Only rows the user moved have a rank. */
  readonly ranks: Readonly<Record<string, number>>;
};

export const COLUMN_MIN = 64;
export const COLUMN_MAX = 640;
const TITLE_MIN = 160;
export const ROW_HEIGHT_MIN = 28;
export const ROW_HEIGHT_MAX = 72;

/** Built-in columns in their default order. Added properties use the key `prop:<name>`. */
export const BUILT_IN_COLUMNS: ReadonlyArray<ColumnLayout> = [
  { key: "title", width: 420, hidden: false },
  { key: "status", width: 128, hidden: false },
  { key: "priority", width: 112, hidden: false },
  { key: "project", width: 168, hidden: false },
  { key: "due", width: 112, hidden: false },
  { key: "gates", width: 128, hidden: false },
  { key: "owner", width: 128, hidden: false },
  { key: "updated", width: 112, hidden: true },
];
const BUILT_IN_KEYS = new Set(BUILT_IN_COLUMNS.map((column) => column.key));
const PROP_KEY = /^prop:[a-z0-9_]{1,64}$/;
const DENSITIES: ReadonlySet<unknown> = new Set<Density>(["compact", "default", "comfortable"]);

export const DEFAULT_LAYOUT: TasksLayout = {
  table: {
    columns: BUILT_IN_COLUMNS,
    density: "default",
    rowHeight: null,
    freezeName: true,
    wrap: [],
  },
  ranks: {},
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** A column width within the limits. Name keeps room to read. */
export const clampWidth = (key: string, width: number) =>
  Math.round(clamp(width, key === "title" ? TITLE_MIN : COLUMN_MIN, COLUMN_MAX));

/** A valid layout from saved JSON: bad parts fall back to the default, new columns are added. */
export function parseLayout(raw: unknown): TasksLayout {
  if (!isRecord(raw)) return DEFAULT_LAYOUT;
  const table = isRecord(raw.table) ? raw.table : {};
  const seen = new Set<string>();
  const columns: ColumnLayout[] = [];
  for (const item of Array.isArray(table.columns) ? table.columns : []) {
    if (!isRecord(item) || typeof item.key !== "string" || seen.has(item.key)) continue;
    if (!BUILT_IN_KEYS.has(item.key) && !PROP_KEY.test(item.key)) continue;
    const fallback = BUILT_IN_COLUMNS.find((column) => column.key === item.key)?.width ?? 140;
    const width =
      typeof item.width === "number" && Number.isFinite(item.width) ? item.width : fallback;
    seen.add(item.key);
    columns.push({
      key: item.key,
      width: clampWidth(item.key, width),
      hidden: item.key !== "title" && item.hidden === true,
    });
  }
  for (const column of BUILT_IN_COLUMNS) if (!seen.has(column.key)) columns.push(column);
  const freezeName = table.freezeName !== false;
  if (freezeName) columns.sort((a, b) => Number(b.key === "title") - Number(a.key === "title"));
  const ranks: Record<string, number> = {};
  if (isRecord(raw.ranks)) {
    for (const [id, rank] of Object.entries(raw.ranks)) {
      if (typeof rank === "number" && Number.isFinite(rank)) ranks[id] = rank;
    }
  }
  const keys = new Set(columns.map((column) => column.key));
  const rowHeight = typeof table.rowHeight === "number" ? table.rowHeight : null;
  return {
    table: {
      columns,
      density: DENSITIES.has(table.density) ? (table.density as Density) : "default",
      rowHeight: rowHeight === null ? null : clamp(rowHeight, ROW_HEIGHT_MIN, ROW_HEIGHT_MAX),
      freezeName,
      wrap: Array.isArray(table.wrap)
        ? table.wrap.filter((key): key is string => typeof key === "string" && keys.has(key))
        : [],
    },
    ranks,
  };
}

const withTable = (layout: TasksLayout, table: Partial<TableLayout>): TasksLayout => ({
  ...layout,
  table: { ...layout.table, ...table },
});

export function resizeColumn(layout: TasksLayout, key: string, width: number): TasksLayout {
  return withTable(layout, {
    columns: layout.table.columns.map((column) =>
      column.key === key ? { ...column, width: clampWidth(key, width) } : column,
    ),
  });
}

/** Moves a column to `index`. A frozen Name column stays first. */
export function moveColumn(layout: TasksLayout, key: string, index: number): TasksLayout {
  const { columns, freezeName } = layout.table;
  const column = columns.find((item) => item.key === key);
  if (!column || (freezeName && key === "title")) return layout;
  const rest = columns.filter((item) => item.key !== key);
  const target = clamp(index, freezeName ? 1 : 0, rest.length);
  return withTable(layout, { columns: [...rest.slice(0, target), column, ...rest.slice(target)] });
}

/** Shows or hides a column. Name always shows. */
export function setColumnHidden(layout: TasksLayout, key: string, hidden: boolean): TasksLayout {
  if (key === "title") return layout;
  const { columns } = layout.table;
  // A property column is listed before it is saved, so showing it may add it here.
  if (!columns.some((column) => column.key === key)) {
    return hidden || !PROP_KEY.test(key)
      ? layout
      : withTable(layout, { columns: [...columns, { key, width: 160, hidden: false }] });
  }
  return withTable(layout, {
    columns: columns.map((column) => (column.key === key ? { ...column, hidden } : column)),
  });
}

export function toggleWrap(layout: TasksLayout, key: string): TasksLayout {
  const { wrap } = layout.table;
  return withTable(layout, {
    wrap: wrap.includes(key) ? wrap.filter((item) => item !== key) : [...wrap, key],
  });
}

export function setRowHeight(layout: TasksLayout, height: number | null): TasksLayout {
  return withTable(layout, {
    rowHeight: height === null ? null : Math.round(clamp(height, ROW_HEIGHT_MIN, ROW_HEIGHT_MAX)),
  });
}

export function setDensity(layout: TasksLayout, density: Density): TasksLayout {
  return withTable(layout, { density, rowHeight: null });
}

// Ranks step by this much, so a later version can insert between two rows without renumbering.
const RANK_STEP = 1024;

/** Gives every row of one group a rank in `orderedIds` order. Other rows keep their ranks. */
export function rerank(
  ranks: Readonly<Record<string, number>>,
  orderedIds: ReadonlyArray<string>,
): Record<string, number> {
  const next = { ...ranks };
  orderedIds.forEach((id, index) => {
    next[id] = (index + 1) * RANK_STEP;
  });
  return next;
}

/**
 * Ranks after `id` moves to `index` in a group's shown order (`orderedIds`, with or without
 * `id`). Rows above the new place get a rank. Rows below get one only when a lower row already
 * has a rank, so the saved layout stays small and old ranks do not collide.
 */
export function moveRank(
  ranks: Readonly<Record<string, number>>,
  orderedIds: ReadonlyArray<string>,
  id: string,
  index: number,
): Record<string, number> {
  const order = orderedIds.filter((item) => item !== id);
  const at = clamp(index, 0, order.length);
  order.splice(at, 0, id);
  let last = at;
  order.forEach((item, position) => {
    if (ranks[item] !== undefined) last = Math.max(last, position);
  });
  return rerank(ranks, order.slice(0, last + 1));
}

/** Ranks of tasks that still exist, so the saved layout does not grow forever. */
export function pruneRanks(
  ranks: Readonly<Record<string, number>>,
  liveIds: ReadonlySet<string>,
): Record<string, number> {
  return Object.fromEntries(Object.entries(ranks).filter(([id]) => liveIds.has(id)));
}

/** Sorts ranked rows first by rank, then the rest with `fallback`. */
export function byManualRank<T extends { readonly id: string }>(
  ranks: Readonly<Record<string, number>>,
  fallback: (a: T, b: T) => number,
): (a: T, b: T) => number {
  return (a, b) => {
    const left = ranks[a.id] ?? Number.POSITIVE_INFINITY;
    const right = ranks[b.id] ?? Number.POSITIVE_INFINITY;
    return left === right ? fallback(a, b) : left < right ? -1 : 1;
  };
}

/** Freezes or unfreezes the Name column. A frozen Name moves to the first place. */
export function setFreezeName(layout: TasksLayout, freezeName: boolean): TasksLayout {
  const { columns } = layout.table;
  return withTable(layout, {
    freezeName,
    columns: freezeName
      ? [...columns.filter((c) => c.key === "title"), ...columns.filter((c) => c.key !== "title")]
      : columns,
  });
}
