/**
 * The Tasks table layout saved in workspace.json (`tasksLayout`): columns, density, wrap and the
 * manual row order. The server stores it as an opaque object, so every read goes through
 * `parseLayout`, which repairs or drops bad values instead of failing.
 */

import { prefsFromValue, type TasksPrefs } from "./tasksPage.logic";

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

/** A named view: its filters, sort, grouping, view kind and table columns. */
export type SavedView = {
  readonly id: string;
  readonly name: string;
  /** Pinned views show as tabs next to Table, Board, Calendar and List. */
  readonly pinned: boolean;
  readonly prefs: TasksPrefs;
  readonly table: TableLayout;
};

export type TasksLayout = {
  /** The default view's columns. An open saved view keeps its own in `views`. */
  readonly table: TableLayout;
  /** Manual row order: a lower rank shows first. Only rows the user moved have a rank. */
  readonly ranks: Readonly<Record<string, number>>;
  readonly views: ReadonlyArray<SavedView>;
  /** The open saved view. Changes save into it at once (Jake, e2). Null is the default view. */
  readonly activeViewId: string | null;
};

export const MAX_VIEWS = 30;
export const MAX_PINNED_VIEWS = 5;
export const VIEW_NAME_MAX = 40;

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
  views: [],
  activeViewId: null,
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
  const ranks: Record<string, number> = {};
  if (isRecord(raw.ranks)) {
    for (const [id, rank] of Object.entries(raw.ranks)) {
      if (typeof rank === "number" && Number.isFinite(rank)) ranks[id] = rank;
    }
  }
  const views: SavedView[] = [];
  let pinned = 0;
  for (const item of Array.isArray(raw.views) ? raw.views : []) {
    if (views.length >= MAX_VIEWS || !isRecord(item)) continue;
    const { id } = item;
    const name = typeof item.name === "string" ? cleanViewName(item.name) : "";
    if (typeof id !== "string" || !VIEW_ID.test(id) || !name) continue;
    if (views.some((view) => view.id === id)) continue;
    const pin = item.pinned === true && pinned < MAX_PINNED_VIEWS;
    if (pin) pinned++;
    views.push({
      id,
      name,
      pinned: pin,
      prefs: prefsFromValue(item.prefs),
      table: parseTable(item.table),
    });
  }
  const active = views.some((view) => view.id === raw.activeViewId)
    ? (raw.activeViewId as string)
    : null;
  return { table: parseTable(raw.table), ranks, views, activeViewId: active };
}

const VIEW_ID = /^[\w-]{1,64}$/;

export const cleanViewName = (name: string) =>
  name.trim().replace(/\s+/g, " ").slice(0, VIEW_NAME_MAX);

function parseTable(raw: unknown): TableLayout {
  const table = isRecord(raw) ? raw : {};
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
  const keys = new Set(columns.map((column) => column.key));
  const rowHeight = typeof table.rowHeight === "number" ? table.rowHeight : null;
  return {
    columns,
    density: DENSITIES.has(table.density) ? (table.density as Density) : "default",
    rowHeight: rowHeight === null ? null : clamp(rowHeight, ROW_HEIGHT_MIN, ROW_HEIGHT_MAX),
    freezeName,
    wrap: Array.isArray(table.wrap)
      ? table.wrap.filter((key): key is string => typeof key === "string" && keys.has(key))
      : [],
  };
}

export const activeView = (layout: TasksLayout): SavedView | null =>
  layout.views.find((view) => view.id === layout.activeViewId) ?? null;

/** The layout the page shows: an open saved view swaps in its own columns. */
export function showView(layout: TasksLayout): TasksLayout {
  const view = activeView(layout);
  return view ? { ...layout, table: view.table } : layout;
}

/**
 * Stores `next`, a change of `shown` (= `showView(raw)`). A column change goes into the open view,
 * or into the default view when none is open. Opening or closing a view moves no columns.
 * shortcut: an undo applies to the view open at undo time, so undoing a column change made in
 * another view (or a Reset made from a view) can land in the wrong view. Store the view id in the
 * undo step if that bites.
 */
export function commitView(raw: TasksLayout, shown: TasksLayout, next: TasksLayout): TasksLayout {
  if (next.table === shown.table) return { ...next, table: raw.table };
  const view = activeView(next);
  if (!view) return next;
  return {
    ...next,
    table: raw.table,
    views: next.views.map((item) => (item === view ? { ...view, table: next.table } : item)),
  };
}

/** Saves the shown view under `name` and opens it. A new view is pinned while a tab is free. */
export function saveView(
  layout: TasksLayout,
  id: string,
  name: string,
  prefs: TasksPrefs,
): TasksLayout {
  const clean = cleanViewName(name);
  if (!clean || layout.views.length >= MAX_VIEWS) return layout;
  const pinned = layout.views.filter((view) => view.pinned).length < MAX_PINNED_VIEWS;
  const view: SavedView = { id, name: clean, pinned, prefs, table: layout.table };
  return { ...layout, views: [...layout.views, view], activeViewId: id };
}

/** Opens a saved view, or the default view for null. */
export function openView(layout: TasksLayout, id: string | null): TasksLayout {
  const target = id !== null && layout.views.some((view) => view.id === id) ? id : null;
  return target === layout.activeViewId ? layout : { ...layout, activeViewId: target };
}

/** Pins or unpins a view. A sixth pin is refused. */
export function setViewPinned(layout: TasksLayout, id: string, pinned: boolean): TasksLayout {
  const full = layout.views.filter((view) => view.pinned).length >= MAX_PINNED_VIEWS;
  if (pinned && full) return layout;
  return {
    ...layout,
    views: layout.views.map((view) => (view.id === id ? { ...view, pinned } : view)),
  };
}

export function deleteView(layout: TasksLayout, id: string): TasksLayout {
  return {
    ...layout,
    views: layout.views.filter((view) => view.id !== id),
    activeViewId: layout.activeViewId === id ? null : layout.activeViewId,
  };
}

/** Changes the open view's filters, sort and grouping. No open view: no change. */
export function updateViewPrefs(
  layout: TasksLayout,
  change: (prefs: TasksPrefs) => TasksPrefs,
): TasksLayout {
  const view = activeView(layout);
  if (!view) return layout;
  const prefs = change(view.prefs);
  if (prefs === view.prefs) return layout;
  return {
    ...layout,
    views: layout.views.map((item) => (item === view ? { ...view, prefs } : item)),
  };
}

/** Back to the default view with the default columns. Saved views and the row order stay. */
export function resetLayout(layout: TasksLayout): TasksLayout {
  return { ...layout, table: DEFAULT_LAYOUT.table, activeViewId: null };
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
